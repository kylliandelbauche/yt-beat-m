"""Catalogue views and explicit favorite updates."""

from dataclasses import dataclass, field
from math import isfinite

from yt_beat_m.beatmakers import channel_alias, channel_key, provenance
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.metadata import canonical_key, normalize


def beat_view(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "beatmaker": row["beatmaker"],
        "channel": row["channel"],
        "beatmaker_source": provenance(row).get("beatmaker")
        or ("legacy" if row["beatmaker"] else None),
        "duration_seconds": row["duration_seconds"],
        "bpm": row["bpm"],
        "musical_key": row["musical_key"],
        "favorite": bool(row["favorite"]),
        "artwork_url": f"/api/beats/{row['id']}/artwork" if row["artwork_path"] else None,
        "audio_url": f"/api/beats/{row['id']}/audio",
    }


@dataclass
class CatalogFilters:
    bpm_min: float | None = None
    bpm_max: float | None = None
    bpm_missing: bool = False
    keys: list[str] = field(default_factory=list)
    makers: list[str] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)
    styles: list[str] = field(default_factory=list)
    moods: list[str] = field(default_factory=list)
    key_missing: bool = False
    maker_missing: bool = False
    channel_missing: bool = False
    style_missing: bool = False
    mood_missing: bool = False
    sort: str = "added_desc"

    def validate(self):
        for value in (self.bpm_min, self.bpm_max):
            if value is not None and (not isfinite(value) or not 0 < value <= 1000):
                raise LibraryError("BPM : les bornes doivent être comprises entre 0 exclu et 1000.")
        if self.bpm_min is not None and self.bpm_max is not None and self.bpm_min > self.bpm_max:
            raise LibraryError("BPM : le minimum doit être inférieur ou égal au maximum.")
        if self.sort not in {"added_desc", "added_asc", "published_desc", "published_asc"}:
            raise LibraryError("Tri non reconnu.")
        for values in (self.keys, self.makers, self.channels, self.styles, self.moods):
            if len(values) > 100 or any(len(v) > 300 for v in values):
                raise LibraryError("Filtres : trop de valeurs ou libellé trop long.")


def key_value(value):
    return canonical_key(value) or normalize(value)


def list_beats(
    library: Library,
    limit: int,
    offset: int,
    query: str = "",
    favorites: bool = False,
    filters: CatalogFilters | None = None,
) -> dict:
    filters = filters or CatalogFilters()
    filters.validate()
    with library.catalog() as connection:
        connection.create_function("normalized", 1, normalize, deterministic=True)
        connection.create_function("music_key", 1, key_value, deterministic=True)
        clauses, parameters = [], []
        if favorites:
            clauses.append("favorite = 1")
        for term in normalize(query).split():
            clauses.append(
                "instr(normalized(title || ' ' || coalesce(beatmaker, '') || ' ' || "
                "coalesce(channel, '') || ' ' || coalesce((SELECT group_concat(label, ' ') "
                "FROM tags JOIN beat_tags ON tags.id=tag_id WHERE beat_id=beats.id), '')), ?) > 0"
            )
            parameters.append(term)
        bpm_parts, bpm_args = [], []
        for value, operator in (
            (filters.bpm_min, ">="),
            (filters.bpm_max, "<="),
        ):
            if value is not None:
                bpm_parts.append(f"bpm {operator} ?")
                bpm_args.append(value)
        if bpm_parts or filters.bpm_missing:
            present = " AND ".join(bpm_parts)
            clauses.append(
                "("
                + " OR ".join(
                    ([f"({present})"] if present else [])
                    + (["bpm IS NULL"] if filters.bpm_missing else [])
                )
                + ")"
            )
            parameters.extend(bpm_args)
        for column, values, missing, fn in (
            ("musical_key", filters.keys, filters.key_missing, "music_key"),
            ("beatmaker", filters.makers, filters.maker_missing, "normalized"),
            ("channel", filters.channels, filters.channel_missing, "normalized"),
        ):
            parts = []
            if values:
                parts.append(f"{fn}({column}) IN ({','.join('?' for _ in values)})")
                parameters.extend(
                    (key_value(v) if fn == "music_key" else normalize(v)) for v in values
                )
            if missing:
                parts.append(f"length(trim(coalesce({column}, ''))) = 0")
            if parts:
                clauses.append("(" + " OR ".join(parts) + ")")
        for kind, values, missing in (
            ("style", filters.styles, filters.style_missing),
            ("mood", filters.moods, filters.mood_missing),
        ):
            base = (
                "SELECT 1 FROM tags JOIN beat_tags ON tags.id=tag_id WHERE "
                "beat_id=beats.id AND kind=?"
            )
            parts = []
            if values:
                parts.append(
                    f"EXISTS ({base} AND normalized(label) IN ({','.join('?' for _ in values)}))"
                )
                parameters.extend([kind, *(normalize(v) for v in values)])
            if missing:
                parts.append(f"NOT EXISTS ({base})")
                parameters.append(kind)
            if parts:
                clauses.append("(" + " OR ".join(parts) + ")")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        total = connection.execute("SELECT COUNT(*) FROM beats" + where, parameters).fetchone()[0]
        column, direction = filters.sort.split("_")
        sort = (
            ("published_on IS NULL, published_on" if column == "published" else "added_at")
            + " "
            + direction.upper()
            + ", id"
        )
        rows = connection.execute(
            "SELECT * FROM beats" + where + " ORDER BY " + sort + " LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
    return {"beats": [beat_view(row) for row in rows], "total": total}


def filter_options(library: Library) -> dict:
    with library.catalog() as connection:
        rows = connection.execute("SELECT beatmaker,channel,musical_key FROM beats").fetchall()
        result = {}
        for name, column in (
            ("makers", "beatmaker"),
            ("channels", "channel"),
            ("keys", "musical_key"),
        ):
            labels = {}
            for row in rows:
                value = key_value(row[column]) if name == "keys" else row[column]
                if value and value.strip():
                    labels.setdefault(normalize(value), value)
            result[name] = sorted(labels.values(), key=normalize)
        for name, kind in (("styles", "style"), ("moods", "mood")):
            labels = {}
            for row in connection.execute(
                "SELECT label FROM tags WHERE kind=? AND EXISTS (SELECT 1 FROM "
                "beat_tags WHERE tag_id=tags.id) ORDER BY id",
                (kind,),
            ):
                labels.setdefault(normalize(row[0]), row[0])
            result[name] = sorted(labels.values(), key=normalize)
        return result


def beat_details(library: Library, identity: str) -> dict | None:
    with library.catalog() as connection:
        row = connection.execute("SELECT * FROM beats WHERE id = ?", (identity,)).fetchone()
        if row is None:
            return None
        tags = connection.execute(
            "SELECT tags.kind, tags.label FROM tags JOIN beat_tags ON tags.id=beat_tags.tag_id "
            "WHERE beat_tags.beat_id=? ORDER BY tags.label",
            (identity,),
        ).fetchall()
        links = connection.execute(
            "SELECT url, label FROM source_links WHERE beat_id=?", (identity,)
        ).fetchall()
        return {
            **beat_view(row),
            "source_url": row["source_url"],
            "bpm": row["bpm"],
            "musical_key": row["musical_key"],
            "published_on": row["published_on"],
            "added_at": row["added_at"],
            "description": row["description"],
            "metadata_provenance": provenance(row),
            "can_remember_channel": channel_key(dict(row)) is not None,
            "channel_id_known": bool(row["channel_id"]),
            "channel_alias": channel_alias(connection, dict(row)),
            "styles": [tag["label"] for tag in tags if tag["kind"] == "style"],
            "moods": [tag["label"] for tag in tags if tag["kind"] == "mood"],
            "links": [dict(link) for link in links],
        }


def set_favorite(library: Library, identity: str, favorite: bool) -> bool:
    with library.catalog() as connection:
        cursor = connection.execute(
            "UPDATE beats SET favorite=? WHERE id=?", (int(favorite), identity)
        )
        return cursor.rowcount == 1
