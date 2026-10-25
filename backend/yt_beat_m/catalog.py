"""Catalogue views and explicit favorite updates."""

import unicodedata

from yt_beat_m.beatmakers import channel_alias, channel_key, provenance
from yt_beat_m.library import Library


def normalize(value: str | None) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(character)
    ).casefold()


def beat_view(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "beatmaker": row["beatmaker"],
        "channel": row["channel"],
        "beatmaker_source": provenance(row).get("beatmaker")
        or ("legacy" if row["beatmaker"] else None),
        "duration_seconds": row["duration_seconds"],
        "favorite": bool(row["favorite"]),
        "artwork_url": f"/api/beats/{row['id']}/artwork" if row["artwork_path"] else None,
        "audio_url": f"/api/beats/{row['id']}/audio",
    }


def list_beats(
    library: Library, limit: int, offset: int, query: str = "", favorites: bool = False
) -> dict:
    with library.catalog() as connection:
        connection.create_function("normalized", 1, normalize, deterministic=True)
        terms = normalize(query).split()
        clauses, parameters = [], []
        if favorites:
            clauses.append("favorite = 1")
        for term in terms:
            clauses.append(
                "instr(normalized(title || ' ' || coalesce(beatmaker, '') || ' ' || "
                "coalesce(channel, '')), ?) > 0"
            )
            parameters.append(term)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        total = connection.execute("SELECT COUNT(*) FROM beats" + where, parameters).fetchone()[0]
        rows = connection.execute(
            "SELECT * FROM beats" + where + " ORDER BY added_at DESC, id LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
    return {"beats": [beat_view(row) for row in rows], "total": total}


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
