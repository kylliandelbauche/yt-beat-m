"""Local producer identities, independent from raw credits and YouTube channels."""

import base64
import binascii
import json
import unicodedata
from datetime import UTC, datetime
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
    }


PROFILE_SELECT = (
    "SELECT id,name,socials,stores,photo_type,updated_at,"
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
        where = " WHERE instr(profile_name(name), ?) > 0"
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
    return {
        "profiles": [profile_view(r) for r in rows],
        "total": total,
        "unassigned_count": unassigned,
    }


def get_profile(library: Library, identity: str):
    with library.catalog() as c:
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
            existing = c.execute(
                "SELECT socials,stores FROM beatmaker_profiles WHERE id=?", (identity,)
            ).fetchone()
            if not existing:
                return None
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
                "UPDATE beatmaker_profiles SET photo=?,photo_type=? WHERE id=?", (*photo, identity)
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
    ids = list(dict.fromkeys(str(UUID(str(value))) for value in ids))
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


def sync_profiles(c, row):
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
