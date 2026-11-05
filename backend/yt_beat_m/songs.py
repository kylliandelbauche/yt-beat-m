"""Songs and explicit file grants; external paths stay in a machine-local registry."""

import math
import secrets
import sqlite3
import threading
import time
import unicodedata
from contextlib import closing
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from mutagen import MutagenError
from mutagen.mp3 import MP3
from pydantic import BaseModel, ConfigDict, Field, field_validator

from yt_beat_m.catalog_tags import TagConflict, ensure_tag, resolve_label
from yt_beat_m.library import LibraryBusyError, LibraryError
from yt_beat_m.metadata import normalize

State = Literal["Topline", "Maquette", "Mixage", "Master", "Out"]


class SongTagFields(BaseModel):
    tag_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(
        default_factory=list, max_length=120
    )
    new_tags: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=120
    )
    recreate_tags: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=120
    )


class SongCreate(SongTagFields):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=500)
    state: State
    selection_id: UUID
    beat_id: UUID | None = None
    favorite: bool = False
    created_on: date | None = None
    released_on: date | None = None

    @field_validator("title")
    @classmethod
    def title_text(cls, value):
        if not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError("Indique un titre sur une ligne.")
        return value.strip()


class SongPatch(SongTagFields):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    state: State | None = None
    selection_id: UUID | None = None
    beat_id: UUID | None = None
    favorite: bool | None = None
    created_on: date | None = None
    released_on: date | None = None

    @field_validator("title")
    @classmethod
    def title_text(cls, value):
        return SongCreate.title_text(value) if value is not None else value


def checked_file(value):
    path = Path(value)
    if not path.is_absolute() or path.suffix.lower() != ".mp3":
        raise LibraryError("Choisir un fichier MP3 existant.")
    if any(p.is_symlink() for p in (path, *path.parents)) or not path.is_file():
        raise LibraryError("Fichier absent ou lien symbolique refusé.")
    return path


def inspect_file(value):
    path = checked_file(value)
    try:
        duration = MP3(path).info.length
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError
        stat = path.stat()
        return path, duration, (str(stat.st_dev), str(stat.st_ino))
    except (OSError, ValueError, MutagenError) as exc:
        raise LibraryError("Le fichier sélectionné n’est pas un MP3 lisible.") from exc


class SongFiles:
    def __init__(self, path):
        self.path = path
        self.grants = {}
        self.lock = threading.RLock()

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise LibraryError("Registre local non valide.")
        c = None
        try:
            c = sqlite3.connect(self.path)
            self.path.chmod(0o600)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA synchronous=FULL")
            c.execute(
                "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, library_id TEXT NOT NULL, "
                "path TEXT NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL)"
            )
            return c
        except (sqlite3.Error, OSError) as exc:
            if c is not None:
                c.close()
            raise LibraryError(
                "Registre des fichiers inaccessible ; réessaie après vérification."
            ) from exc

    def grant(self, library, value):
        path, duration, signature = inspect_file(value)
        with self.lock:
            now = time.monotonic()
            self.grants = {k: v for k, v in self.grants.items() if v[0] > now}
            if len(self.grants) >= 32:
                raise LibraryError("Trop de sélections en attente ; réessaie plus tard.")
            key = str(uuid4())
            self.grants[key] = (now + 300, library.manifest["id"], path, duration, signature)
        return {"selection_id": key, "name": path.name, "duration_seconds": duration}

    def prepare(self, library, selection):
        with self.lock:
            grant = self.grants.get(str(selection))
            if not grant or grant[0] <= time.monotonic() or grant[1] != library.manifest["id"]:
                raise LibraryError("Sélection expirée ou inconnue ; choisir à nouveau le MP3.")
            path, duration, signature = inspect_file(grant[2])
            if signature != grant[4]:
                raise LibraryError("Le fichier sélectionné a changé ; le choisir à nouveau.")
            try:
                relative = path.relative_to(library.root).as_posix()
                library.safe_path(relative)
                return {"audio_path": relative, "external_ref": None, "duration_seconds": duration}
            except ValueError:
                identity = secrets.token_hex(24)
                try:
                    with closing(self.connect()) as c, c:
                        c.execute(
                            "INSERT INTO files VALUES(?,?,?,?,?)",
                            (identity, library.manifest["id"], str(path), *signature),
                        )
                except (OSError, sqlite3.Error) as exc:
                    raise LibraryError("Impossible de mémoriser ce fichier ; réessaie.") from exc
                return {"audio_path": None, "external_ref": identity, "duration_seconds": duration}

    def discard(self, reference):
        if reference:
            try:
                with closing(self.connect()) as c, c:
                    c.execute("DELETE FROM files WHERE id=?", (reference,))
            except (OSError, sqlite3.Error, LibraryError):
                pass  # An unreferenced binding is never servable by a song UUID.

    def resolve(self, library, row):
        try:
            if row["audio_path"]:
                return checked_file(library.safe_path(row["audio_path"]))
            if not self.path.exists():
                return None
            with closing(self.connect()) as c:
                binding = c.execute(
                    "SELECT * FROM files WHERE id=? AND library_id=?",
                    (row["external_ref"], library.manifest["id"]),
                ).fetchone()
            if binding:
                path = checked_file(binding["path"])
                stat = path.stat()
                if (str(stat.st_dev), str(stat.st_ino)) == (binding["device"], binding["inode"]):
                    return path
        except (OSError, LibraryError, sqlite3.Error):
            pass
        return None


def song_view(library, files, row, tags):
    result = {
        k: row[k]
        for k in (
            "id",
            "title",
            "state",
            "favorite",
            "created_on",
            "released_on",
            "added_at",
            "beat_id",
            "duration_seconds",
            "revision",
        )
    }
    result["beat_title"] = row["beat_title"]
    result["artwork_url"] = f"/api/beats/{row['beat_id']}/artwork" if row["beat_artwork"] else None
    result["favorite"] = bool(result["favorite"])
    result["file_available"] = files.resolve(library, row) is not None
    result["audio_url"] = f"/api/songs/{row['id']}/audio"
    result["tags"] = tags
    return result


def tags_for_songs(c, identities):
    result = {identity: {} for identity in identities}
    if not identities:
        return result
    placeholders = ",".join("?" for _ in identities)
    for row in c.execute(
        "SELECT s.id AS song_id,t.id,t.label,1 AS inherited,l.position FROM songs s "
        "JOIN beat_catalog_tags l ON l.beat_id=s.beat_id JOIN catalog_tags t ON t.id=l.tag_id "
        f"WHERE s.id IN ({placeholders}) UNION ALL "
        "SELECT l.song_id,t.id,t.label,0 AS inherited,l.position FROM song_catalog_tags l "
        f"JOIN catalog_tags t ON t.id=l.tag_id WHERE l.song_id IN ({placeholders}) "
        "ORDER BY inherited DESC,position,id",
        [*identities, *identities],
    ):
        tag = result[row["song_id"]].setdefault(
            row["id"],
            {"id": row["id"], "label": row["label"], "direct": False, "inherited": False},
        )
        tag["inherited" if row["inherited"] else "direct"] = True
    return {identity: list(tags.values()) for identity, tags in result.items()}


# Used with songs s and catalog_tags t; each origin is resolved by entity ID.
TAG_MEMBERSHIP = (
    "(EXISTS(SELECT 1 FROM song_catalog_tags st WHERE st.song_id=s.id AND st.tag_id=t.id) "
    "OR EXISTS(SELECT 1 FROM beat_catalog_tags bt "
    "WHERE bt.beat_id=s.beat_id AND bt.tag_id=t.id))"
)


def replace_song_tags(c, identity, tag_ids, new_tags, recreate):
    if not set(recreate).issubset(new_tags):
        raise LibraryError("La recréation doit concerner les nouveaux tags sélectionnés.")
    identities = list(dict.fromkeys(tag_ids))
    for tag in identities:
        if not c.execute("SELECT 1 FROM catalog_tags WHERE id=?", (tag,)).fetchone():
            raise TagConflict(
                "Un tag a été supprimé. Actualise la fiche ou retire-le du brouillon."
            )
    known = {r[0] for r in c.execute("SELECT label FROM catalog_tag_names")}
    for raw in new_tags:
        label = raw if raw in known else " ".join(raw.split())
        if (
            not label
            or label not in known
            and (len(label) > 80 or any(unicodedata.category(ch).startswith("C") for ch in label))
        ):
            raise LibraryError("Tags : 80 caractères lisibles maximum par nouveau tag.")
        label = resolve_label(c, label, recreate=raw in recreate)
        tag = ensure_tag(c, label)
        if tag not in identities:
            identities.append(tag)
    if len(identities) > 120:
        raise LibraryError("120 tags directs maximum par son.")
    c.execute("DELETE FROM song_catalog_tags WHERE song_id=?", (identity,))
    c.executemany(
        "INSERT INTO song_catalog_tags VALUES(?,?,?)",
        [(identity, tag, pos) for pos, tag in enumerate(identities)],
    )


SONG_SELECT = (
    "SELECT s.*,b.title AS beat_title,b.artwork_path AS beat_artwork "
    "FROM songs s LEFT JOIN beats b ON b.id=s.beat_id"
)


def get_song(library, files, identity):
    with library.catalog() as c:
        row = c.execute(SONG_SELECT + " WHERE s.id=?", (identity,)).fetchone()
        return (
            song_view(library, files, row, tags_for_songs(c, [identity])[identity]) if row else None
        )


def list_songs(
    library,
    files,
    limit=48,
    offset=0,
    beat_id=None,
    *,
    q="",
    favorites=False,
    state=None,
    linked=None,
    available=None,
    profile_id=None,
    tag_ids=None,
    tag_missing=False,
    sort="added_desc",
):
    ordering = {"added_desc": "s.added_at DESC", "added_asc": "s.added_at ASC"}
    if sort not in ordering:
        raise LibraryError("Tri non reconnu.")
    clauses, args = [], []
    if beat_id:
        clauses.append("s.beat_id=?")
        args.append(str(beat_id))
    if favorites:
        clauses.append("s.favorite=1")
    if state:
        clauses.append("s.state=?")
        args.append(state)
    if linked is not None:
        clauses.append("s.beat_id IS NOT NULL" if linked else "s.beat_id IS NULL")
    if profile_id:
        clauses.append(
            "EXISTS(SELECT 1 FROM beat_profile_links l "
            "WHERE l.beat_id=s.beat_id AND l.profile_id=?)"
        )
        args.append(str(profile_id))
    for term in normalize(q).split():
        clauses.append(
            "(instr(normalized(s.title),?)>0 OR EXISTS(SELECT 1 FROM catalog_tags t WHERE "
            + TAG_MEMBERSHIP
            + " AND instr(t.normalized_label,?)>0))"
        )
        args.extend([term, term])
    tag_clauses = []
    if tag_ids:
        tag_clauses.append(
            "EXISTS(SELECT 1 FROM catalog_tags t WHERE "
            + TAG_MEMBERSHIP
            + " AND t.id IN ("
            + ",".join("?" for _ in tag_ids)
            + "))"
        )
        args.extend(tag_ids)
    if tag_missing:
        tag_clauses.append("NOT EXISTS(SELECT 1 FROM catalog_tags t WHERE " + TAG_MEMBERSHIP + ")")
    if tag_clauses:
        clauses.append("(" + " OR ".join(tag_clauses) + ")")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with library.catalog() as c:
        c.create_function("normalized", 1, normalize, deterministic=True)
        sql = SONG_SELECT + where + " ORDER BY " + ordering[sort] + ",s.id"
        if available is not None:
            # Availability belongs to this device, not the portable catalog. Filter
            # before pagination so page size and total describe the same result.
            rows = [
                r
                for r in c.execute(sql, args)
                if (files.resolve(library, r) is not None) == available
            ]
            total = len(rows)
            rows = rows[offset : offset + limit]
        else:
            total = c.execute("SELECT count(*) FROM songs s" + where, args).fetchone()[0]
            rows = c.execute(sql + " LIMIT ? OFFSET ?", [*args, limit, offset]).fetchall()
        tags = tags_for_songs(c, [r["id"] for r in rows])
        return {
            "songs": [song_view(library, files, r, tags[r["id"]]) for r in rows],
            "total": total,
        }


def save_song(library, files, payload, identity=None):
    values = payload.model_dump(mode="json", exclude_unset=True)
    selection = values.pop("selection_id", None)
    expected = values.pop("expected_revision", None)
    tag_ids = values.pop("tag_ids", None)
    new_tags = values.pop("new_tags", [])
    recreate = values.pop("recreate_tags", [])
    if (new_tags or recreate) and tag_ids is None:
        if identity:
            raise LibraryError("Fournis les tags directs avec les nouvelles sélections.")
        tag_ids = []
    if identity and any(values.get(k, True) is None for k in ("title", "state", "favorite")):
        raise LibraryError("Titre, état et favori ne peuvent pas être vides.")
    if "selection_id" in payload.model_fields_set and selection is None:
        raise LibraryError("Le MP3 est obligatoire ; sélectionner un fichier.")
    prepared = files.prepare(library, selection) if selection else None
    try:
        with library.catalog() as c:
            if (
                values.get("beat_id")
                and not c.execute("SELECT 1 FROM beats WHERE id=?", (values["beat_id"],)).fetchone()
            ):
                raise LibraryError("Prod associée introuvable.")
            if identity:
                row = c.execute("SELECT * FROM songs WHERE id=?", (identity,)).fetchone()
                if row is None:
                    raise LibraryError("Morceau introuvable.")
                if row["revision"] != expected:
                    raise LibraryBusyError("Ce morceau a changé ; actualiser avant d’enregistrer.")
                if prepared:
                    values.update(prepared)
                # Column names come exclusively from the fixed Pydantic models/prepared fields.
                columns = ",".join(f"{key}=?" for key in values)
                c.execute(
                    "UPDATE songs SET "
                    + (columns + "," if columns else "")
                    + "revision=revision+1 WHERE id=?",
                    [*values.values(), identity],
                )
            else:
                if not prepared:
                    raise LibraryError("Un MP3 est requis à la création.")
                identity = str(uuid4())
                data = {**payload.model_dump(mode="json"), **prepared}
                c.execute(
                    "INSERT INTO songs(id,title,state,favorite,created_on,released_on,added_at,"
                    "beat_id,audio_path,external_ref,duration_seconds) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        identity,
                        data["title"],
                        data["state"],
                        data["favorite"],
                        data["created_on"],
                        data["released_on"],
                        datetime.now(UTC).isoformat(),
                        data["beat_id"],
                        data["audio_path"],
                        data["external_ref"],
                        data["duration_seconds"],
                    ),
                )
            if tag_ids is not None:
                replace_song_tags(c, identity, tag_ids, new_tags, recreate)
    except Exception:
        if prepared:
            files.discard(prepared["external_ref"])
        raise
    if selection:
        with files.lock:
            files.grants.pop(str(selection), None)
    return get_song(library, files, identity)
