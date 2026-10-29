"""Local producer identities, independent from raw credits and YouTube channels."""

import base64
import binascii
import json
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from yt_beat_m.beatmakers import channel_key, credit_parts, is_self, normalized_name, provenance
from yt_beat_m.library import Library, LibraryError


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    socials: list[str] = Field(default_factory=list, max_length=10)
    stores: list[str] = Field(default_factory=list, max_length=10)
    photo: str | None = Field(default=None, max_length=2_800_000)


def now():
    return datetime.now(UTC).isoformat()


def clean_links(values):
    result = []
    for raw in values:
        value = raw.strip()
        try:
            p = urlsplit(value)
            valid = (
                p.scheme in {"http", "https"} and p.hostname and not p.username and not p.password
            )
            _ = p.port
        except ValueError:
            valid = False
        if (
            not valid
            or len(value) > 2048
            or any(c.isspace() or ord(c) < 32 for c in value)
            or "\\" in value
        ):
            raise LibraryError(
                "Profil : utilise des liens HTTP ou HTTPS complets, sans identifiants."
            )
        if value not in result:
            result.append(value)
    return result


def photo_bytes(value):
    if value is None:
        return None, None
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise LibraryError("Photo : fichier JPEG ou PNG non valide.") from exc
    mime = (
        "image/png"
        if data.startswith(b"\x89PNG\r\n\x1a\n")
        else "image/jpeg"
        if data.startswith(b"\xff\xd8\xff")
        else None
    )
    if not mime or not 0 < len(data) <= 2 * 1024 * 1024:
        raise LibraryError("Photo : choisis un JPEG ou PNG de 2 Mo maximum.")
    return data, mime


def profile_view(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "socials": json.loads(row["socials"]),
        "stores": json.loads(row["stores"]),
        "photo_url": f"/api/beatmakers/{row['id']}/photo?v={row['updated_at']}"
        if row["photo_type"]
        else None,
        "beat_count": row["beat_count"],
        "aliases": json.loads(row["aliases"]),
        "attribution": row["attribution"],
        "photo_origin": row["photo_origin"],
    }


PROFILE_SELECT = (
    "SELECT id,name,socials,stores,photo_type,updated_at,aliases,attribution,photo_origin,"
    "(SELECT COUNT(*) FROM beat_profile_links WHERE "
    "profile_id=beatmaker_profiles.id) AS beat_count "
    "FROM beatmaker_profiles"
)


def search_name(value):
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    ).casefold()


def list_profiles(library: Library, query="", limit=60, offset=0):
    with library.catalog() as c:
        c.create_function("profile_name", 1, search_name, deterministic=True)
        where = " WHERE instr(profile_name(name || ' ' || aliases), ?) > 0"
        args = (search_name(query),)
        total = c.execute("SELECT COUNT(*) FROM beatmaker_profiles" + where, args).fetchone()[0]
        rows = c.execute(
            PROFILE_SELECT + where + " ORDER BY profile_name(name),id LIMIT ? OFFSET ?",
            (*args, limit, offset),
        ).fetchall()
        unassigned = c.execute(
            "SELECT COUNT(*) FROM beats WHERE NOT EXISTS (SELECT 1 FROM "
            "beat_profile_links WHERE beat_id=beats.id)"
        ).fetchone()[0]
        from yt_beat_m.profile_photos import photo_candidate

        recent = (datetime.now(UTC) - timedelta(seconds=30)).isoformat()
        photo_pending = bool(photo_candidate(c)) or bool(
            c.execute(
                "SELECT 1 FROM beatmaker_profiles WHERE photo IS NULL "
                "AND photo_origin IS NOT 'manual' AND photo_checked_at>? LIMIT 1",
                (recent,),
            ).fetchone()
        )
    return {
        "photos_pending": photo_pending,
        "profiles": [profile_view(r) for r in rows],
        "total": total,
        "unassigned_count": unassigned,
    }


def get_profile(library: Library, identity: str):
    with library.catalog() as c:
        identity = resolve_profile(c, identity)
        row = c.execute(PROFILE_SELECT + " WHERE id=?", (identity,)).fetchone()
        return profile_view(row) if row else None


def save_profile(library: Library, payload: ProfileUpdate, identity=None):
    name = payload.name.strip()
    if not name or any(unicodedata.category(c).startswith("C") for c in name):
        raise LibraryError("Profil : indique un nom sur une seule ligne.")
    socials, stores = clean_links(payload.socials), clean_links(payload.stores)
    photo = photo_bytes(payload.photo) if "photo" in payload.model_fields_set else None
    stamp = now()
    with library.catalog() as c:
        if identity:
            identity = resolve_profile(c, identity)
            existing = c.execute(
                "SELECT name,aliases,socials,stores FROM beatmaker_profiles WHERE id=?", (identity,)
            ).fetchone()
            if not existing:
                return None
            if name != existing["name"]:
                aliases = list(dict.fromkeys(json.loads(existing["aliases"]) + [existing["name"]]))
                c.execute(
                    "UPDATE beatmaker_profiles SET aliases=?,attribution='confirmed' WHERE id=?",
                    (json.dumps(aliases), identity),
                )
            if "socials" not in payload.model_fields_set:
                socials = json.loads(existing["socials"])
            if "stores" not in payload.model_fields_set:
                stores = json.loads(existing["stores"])
            c.execute(
                "UPDATE beatmaker_profiles SET name=?,socials=?,stores=?,updated_at=? WHERE id=?",
                (name, json.dumps(socials), json.dumps(stores), stamp, identity),
            )
        else:
            identity = str(uuid4())
            c.execute(
                "INSERT INTO beatmaker_profiles(id,name,socials,stores,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?)",
                (identity, name, json.dumps(socials), json.dumps(stores), stamp, stamp),
            )
        if photo is not None:
            c.execute(
                "UPDATE beatmaker_profiles SET photo=?,photo_type=?,photo_origin='manual' "
                "WHERE id=?",
                (*photo, identity),
            )
        return profile_view(c.execute(PROFILE_SELECT + " WHERE id=?", (identity,)).fetchone())


def profiles_for_beats(c, identities):
    result = {identity: [] for identity in identities}
    if identities:
        rows = c.execute(
            "SELECT l.beat_id,p.id,p.name,p.photo_type,p.updated_at FROM beat_profile_links l "
            "JOIN beatmaker_profiles p ON p.id=l.profile_id WHERE l.beat_id IN ("
            + ",".join("?" for _ in identities)
            + ") ORDER BY l.position,p.id",
            identities,
        ).fetchall()
        for r in rows:
            result[r["beat_id"]].append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "photo_url": f"/api/beatmakers/{r['id']}/photo?v={r['updated_at']}"
                    if r["photo_type"]
                    else None,
                }
            )
    return result


def assign_profiles(c, identity, ids):
    ids = list(dict.fromkeys(resolve_profile(c, str(UUID(str(value)))) for value in ids))
    if len(ids) > 20:
        raise LibraryError("Associe au maximum 20 beatmakers à une prod.")
    for value in ids:
        if not c.execute("SELECT 1 FROM beatmaker_profiles WHERE id=?", (value,)).fetchone():
            raise LibraryError("Un profil sélectionné est introuvable. Recharge la sélection.")
    c.execute("DELETE FROM beat_profile_links WHERE beat_id=?", (identity,))
    c.executemany(
        "INSERT INTO beat_profile_links VALUES(?,?,?)",
        [(identity, value, i) for i, value in enumerate(ids)],
    )
    c.execute("UPDATE beats SET profile_assignment='manual' WHERE id=?", (identity,))
    if c.execute("SELECT 1 FROM sqlite_master WHERE name='profile_sources'").fetchone():
        row = dict(c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone())
        parts = [n for n in credit_parts(row["beatmaker"] or "") if not is_self(n)]
        selected = (
            c.execute(
                "SELECT id,name,aliases FROM beatmaker_profiles WHERE id IN ("
                + ",".join("?" for _ in ids)
                + ")",
                ids,
            ).fetchall()
            if ids
            else []
        )
        for part in parts:
            matches = [
                p
                for p in selected
                if normalized_name(part)
                in {normalized_name(n) for n in [p["name"], *json.loads(p["aliases"])]}
            ]
            if len(matches) == 1 or len(selected) == len(parts) == 1:
                chosen = matches[0] if matches else selected[0]
                c.execute(
                    "INSERT INTO profile_sources VALUES(?,?) ON CONFLICT(source_key) "
                    "DO UPDATE SET profile_id=excluded.profile_id",
                    (source_key(c, row, part), chosen["id"]),
                )


def legacy_sync_profiles(c, row):
    """Never overwrite a manual association or invent a person from a channel label."""
    row = dict(row)
    if row["profile_assignment"] == "manual":
        return
    source = provenance(row).get("beatmaker")
    raw = row["beatmaker"] or ""
    parts = credit_parts(raw)
    if source in {"channel_self_credit", "unresolved_self_credit"}:
        parts = parts[1:]  # The owner is still only a suggestion; guests are explicit.
    elif source not in {"explicit_credit", "channel_alias", "channel_alias_self_credit", "manual"}:
        parts = []
    elif source == "manual" and len(parts) > 1:
        # A manual name can itself contain '&' or 'x'. Do not split it without evidence.
        from yt_beat_m.beatmakers import credit_candidates, source_text

        credited = credit_candidates(*source_text(row))
        known = {
            normalized_name(p) for name in credited for p in credit_parts(name) if not is_self(p)
        }
        if not known or not known.issubset({normalized_name(p) for p in parts}):
            parts = []
    parts = list(dict.fromkeys(p for p in parts if p and not is_self(p) and p != "À préciser"))
    c.execute("DELETE FROM beat_profile_links WHERE beat_id=?", (row["id"],))
    for position, name in enumerate(parts):
        # Scope automatic identities to source channel, avoiding homonym merges across channels.
        key = json.dumps([channel_key(row) or "beat:" + row["id"], normalized_name(name)])
        existing = c.execute(
            "SELECT id FROM beatmaker_profiles WHERE auto_key=?", (key,)
        ).fetchone()
        identity = None
        if row.get("channel_id") or row.get("channel"):
            column = "channel_id" if row.get("channel_id") else "channel"
            confirmed = c.execute(
                "SELECT DISTINCT p.id,p.name,p.auto_key FROM beatmaker_profiles p "
                "JOIN beat_profile_links l ON p.id=l.profile_id JOIN beats b ON b.id=l.beat_id "
                "WHERE b.profile_assignment='manual' AND b." + column + "=?",
                (row[column],),
            ).fetchall()
            matches = [p for p in confirmed if normalized_name(p["name"]) == normalized_name(name)]
            if len(matches) > 1:
                continue  # Homonyms explicitly associated in this source remain ambiguous.
            if matches:
                identity = matches[0]["id"]
                if matches[0]["auto_key"] is None and not existing:
                    c.execute(
                        "UPDATE beatmaker_profiles SET auto_key=? WHERE id=?", (key, identity)
                    )
        if not identity and existing:
            identity = existing[0]
        if not identity:
            identity = str(uuid4())
            stamp = now()
            c.execute(
                "INSERT INTO beatmaker_profiles(id,name,auto_key,created_at,updated_at) "
                "VALUES(?,?,?,?,?)",
                (identity, name, key, stamp, stamp),
            )
        c.execute(
            "INSERT OR IGNORE INTO beat_profile_links VALUES(?,?,?)",
            (row["id"], identity, position),
        )


def backfill_profiles(c):
    for row in c.execute("SELECT * FROM beats").fetchall():
        sync_profiles(c, row)


def resolve_profile(c, identity):
    row = c.execute(
        "SELECT profile_id FROM profile_redirects WHERE old_id=?", (identity,)
    ).fetchone()
    return row[0] if row else identity


def brand(value):
    """Only compare a producer variant to its own channel, never globally."""
    value = re.sub(r"[^\w]", "", search_name(value)).replace("_", "")
    return re.sub(r"^(?:prod)(?=.{3})|(?<=.{3})(?:prod)$", "", value)


def channel_ids(c, label):
    return {
        r["channel_id"]
        for r in c.execute(
            "SELECT DISTINCT channel_id,channel FROM beats WHERE channel_id IS NOT NULL"
        )
        if r["channel"] and normalized_name(r["channel"]) == normalized_name(label)
    }


def source_scope(c, row):
    if row.get("channel_id"):
        return "id:" + row["channel_id"]
    if row.get("channel"):
        channels = channel_ids(c, row["channel"])
        if len(channels) == 1:
            return "id:" + next(iter(channels))
    return channel_key(row) or "beat:" + row["id"]


def source_key(c, row, name):
    own = bool(row.get("channel") and brand(name) == brand(row["channel"]))
    return json.dumps(
        [source_scope(c, row), "owner:" + brand(name) if own else normalized_name(name)]
    )


def merge_in_catalog(c, source, target, *, apply=False):
    source, target = resolve_profile(c, source), resolve_profile(c, target)
    if not source or not target or source == target:
        raise LibraryError("Choisis deux profils distincts et existants.")
    a = c.execute("SELECT * FROM beatmaker_profiles WHERE id=?", (source,)).fetchone()
    b = c.execute("SELECT * FROM beatmaker_profiles WHERE id=?", (target,)).fetchone()
    if not a or not b:
        raise LibraryError("Un profil est introuvable. Recharge les profils.")
    union = {}
    for kind in ("socials", "stores"):
        union[kind] = list(dict.fromkeys(json.loads(b[kind]) + json.loads(a[kind])))
        if len(union[kind]) > 10:
            raise LibraryError("Plus de 10 liens à conserver : réduis les liens avant la fusion.")
    aliases = list(dict.fromkeys(json.loads(b["aliases"]) + [a["name"]] + json.loads(a["aliases"])))
    aliases = [n for n in aliases if n != b["name"]]
    count = c.execute(
        "SELECT COUNT(DISTINCT beat_id) FROM beat_profile_links WHERE profile_id IN (?,?)",
        (source, target),
    ).fetchone()[0]
    conflicts = []
    if a["name"] != b["name"]:
        conflicts.append(f"Nom conservé : {b['name']}. {a['name']} devient un alias.")
    if a["photo"] and b["photo"] and a["photo"] != b["photo"]:
        conflicts.append("Les deux photos diffèrent : la photo du profil conservé sera utilisée.")
    if apply:
        for row in c.execute(
            "SELECT beat_id,position FROM beat_profile_links WHERE profile_id=?", (source,)
        ).fetchall():
            existing = c.execute(
                "SELECT position FROM beat_profile_links WHERE beat_id=? AND profile_id=?",
                (row[0], target),
            ).fetchone()
            c.execute(
                "INSERT INTO beat_profile_links VALUES(?,?,?) ON CONFLICT(beat_id,profile_id) "
                "DO UPDATE SET position=min(position,excluded.position)",
                (row[0], target, min(row[1], existing[0]) if existing else row[1]),
            )
        c.execute("DELETE FROM beat_profile_links WHERE profile_id=?", (source,))
        c.execute("UPDATE profile_sources SET profile_id=? WHERE profile_id=?", (target, source))
        c.execute("UPDATE profile_redirects SET profile_id=? WHERE profile_id=?", (target, source))
        c.execute("INSERT INTO profile_redirects VALUES(?,?)", (source, target))
        c.execute(
            "UPDATE beatmaker_profiles SET aliases=?,socials=?,stores=?,updated_at=? WHERE id=?",
            (
                json.dumps(aliases),
                json.dumps(union["socials"]),
                json.dumps(union["stores"]),
                now(),
                target,
            ),
        )
        if not b["photo"] and b["photo_origin"] != "manual" and a["photo"]:
            c.execute(
                "UPDATE beatmaker_profiles SET photo=?,photo_type=?,photo_origin=? WHERE id=?",
                (a["photo"], a["photo_type"], a["photo_origin"], target),
            )
        c.execute("DELETE FROM beatmaker_profiles WHERE id=?", (source,))
    return {
        "source_name": a["name"],
        "target_name": b["name"],
        "beat_count": count,
        "aliases": aliases,
        "conflicts": conflicts,
    }


def merge_profiles(library, source, target, *, preview=False):
    with library.catalog() as c:
        result = merge_in_catalog(c, source, target, apply=not preview)
        if not preview:
            result["profile"] = profile_view(
                c.execute(PROFILE_SELECT + " WHERE id=?", (resolve_profile(c, target),)).fetchone()
            )
        return result


def delete_profile(library, identity):
    with library.catalog() as c:
        identity = resolve_profile(c, identity)
        if not c.execute("SELECT 1 FROM beatmaker_profiles WHERE id=?", (identity,)).fetchone():
            return False
        # Remember every automatic credit, including manually selected legacy rows.
        for row in c.execute(
            "SELECT b.* FROM beats b JOIN beat_profile_links l ON l.beat_id=b.id WHERE "
            "l.profile_id=?",
            (identity,),
        ).fetchall():
            row = dict(row)
            for part in credit_parts(row["beatmaker"] or ""):
                key = source_key(c, row, part)
                existing = c.execute(
                    "SELECT profile_id FROM profile_sources WHERE source_key=?", (key,)
                ).fetchone()
                if existing and existing[0] == identity:
                    c.execute(
                        "UPDATE profile_sources SET profile_id=NULL WHERE source_key=?", (key,)
                    )
        c.execute("DELETE FROM beat_profile_links WHERE profile_id=?", (identity,))
        c.execute("DELETE FROM beatmaker_profiles WHERE id=?", (identity,))
        c.execute("INSERT OR REPLACE INTO profile_redirects VALUES(?,NULL)", (identity,))
        return True


def sync_profiles(c, row):
    if not c.execute("SELECT 1 FROM sqlite_master WHERE name='profile_sources'").fetchone():
        return legacy_sync_profiles(c, row)
    row = dict(row)
    if row["profile_assignment"] == "manual":
        return
    origin = provenance(row).get("beatmaker")
    parts = credit_parts(row["beatmaker"] or "")
    if origin == "unresolved_self_credit":
        parts = parts[1:]
    elif origin not in {
        "explicit_credit",
        "channel_alias",
        "channel_alias_self_credit",
        "manual",
        "channel",
        "channel_self_credit",
    }:
        parts = []
    elif origin == "manual" and len(parts) > 1:
        from yt_beat_m.beatmakers import credit_candidates, source_text

        known = {
            normalized_name(p)
            for n in credit_candidates(*source_text(row))
            for p in credit_parts(n)
            if not is_self(p)
        }
        if not known or not known.issubset({normalized_name(p) for p in parts}):
            parts = []
    c.execute("DELETE FROM beat_profile_links WHERE beat_id=?", (row["id"],))
    for position, name in enumerate(dict.fromkeys(parts)):
        if not name or is_self(name) or name == "À préciser":
            continue
        key = source_key(c, row, name)
        existing = c.execute(
            "SELECT profile_id FROM profile_sources WHERE source_key=?", (key,)
        ).fetchone()
        if not existing and row.get("channel_id") and row.get("channel"):
            known_ids = channel_ids(c, row["channel"])
            if len(known_ids) == 1:
                token = json.loads(key)[1]
                legacy_key = json.dumps(["name:" + normalized_name(row["channel"]), token])
                existing = c.execute(
                    "SELECT profile_id FROM profile_sources WHERE source_key=?", (legacy_key,)
                ).fetchone()
                if existing:
                    c.execute("INSERT INTO profile_sources VALUES(?,?)", (key, existing[0]))
        if existing and existing[0] is None:
            continue  # Explicitly deleted; only a user association can restore this credit.
        column = "channel_id" if row.get("channel_id") else "channel"
        confirmed = (
            c.execute(
                "SELECT DISTINCT p.id,p.name,p.aliases FROM beatmaker_profiles p JOIN "
                "beat_profile_links l "
                "ON p.id=l.profile_id JOIN beats b ON b.id=l.beat_id "
                "WHERE b.profile_assignment='manual' AND b." + column + "=?",
                (row.get(column),),
            ).fetchall()
            if row.get(column)
            else []
        )
        matches = [
            p
            for p in confirmed
            if normalized_name(name)
            in {normalized_name(n) for n in [p["name"], *json.loads(p["aliases"])]}
        ]
        if len(matches) > 1:
            continue
        identity = matches[0]["id"] if matches else existing[0] if existing else None
        if not identity:
            identity = str(uuid4())
            stamp = now()
            c.execute(
                "INSERT INTO "
                "beatmaker_profiles(id,name,attribution,created_at,updated_at) VALUES(?,?,?,?,?)",
                (
                    identity,
                    name,
                    "channel"
                    if origin in {"channel", "channel_self_credit"} and position == 0
                    else "confirmed",
                    stamp,
                    stamp,
                ),
            )
        c.execute(
            "INSERT INTO profile_sources VALUES(?,?) ON CONFLICT(source_key) DO UPDATE "
            "SET profile_id=excluded.profile_id",
            (key, identity),
        )
        c.execute(
            "INSERT OR IGNORE INTO beat_profile_links VALUES(?,?,?)",
            (row["id"], identity, position),
        )


def repair_identities(c):
    """Reconcile legacy channel names only when they resolve to one stable channel."""
    grouped = {}
    for p in c.execute("SELECT * FROM beatmaker_profiles WHERE auto_key IS NOT NULL").fetchall():
        scope, name = json.loads(p["auto_key"])
        rows = c.execute(
            "SELECT * FROM beats WHERE "
            + ("channel_id=?" if scope.startswith("id:") else "channel=?"),
            (scope.split(":", 1)[1],),
        ).fetchall()
        if not rows and scope.startswith("name:"):
            rows = [
                r
                for r in c.execute("SELECT * FROM beats WHERE channel IS NOT NULL")
                if normalized_name(r["channel"]) == scope[5:]
            ]
        row = dict(rows[0]) if rows else None
        if row and scope.startswith("name:"):
            row["channel_id"] = None  # Let source_scope require a unique stable ID.
        key = source_key(c, row, name) if row else p["auto_key"]
        grouped.setdefault(key, []).append(p)
    for key, group in grouped.items():
        # Prefer the unadorned channel artist name, then the established profile.
        group.sort(key=lambda p: (len(p["name"]), p["created_at"], p["id"]))
        target = group[0]["id"]
        c.execute("INSERT OR IGNORE INTO profile_sources VALUES(?,?)", (key, target))
        for other in group[1:]:
            merge_in_catalog(c, other["id"], target, apply=True)
    backfill_profiles(c)
