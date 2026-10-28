"""Explicit, local backfill of missing keys; manual values always take precedence."""

import json

from yt_beat_m.beatmakers import provenance
from yt_beat_m.library import Library
from yt_beat_m.musical_keys import extract_key


def refresh_missing_keys(library: Library) -> dict:
    counts = {"updated": 0, "preserved": 0, "unresolved": 0}
    with library.catalog() as connection:
        rows = connection.execute(
            "SELECT id,title,description,musical_key,field_provenance FROM beats"
        ).fetchall()
        for row in rows:
            sources = provenance(row)
            if sources.get("musical_key") == "manual":
                counts["preserved"] += 1
                continue
            if row["musical_key"] and row["musical_key"].strip():
                continue
            originals = sources.get("original_metadata", {})
            title, description = row["title"], row["description"]
            if isinstance(originals, dict):
                title = originals.get("title", {}).get("value", title)
                description = originals.get("description", {}).get("value", description)
            key = extract_key(title or "", description)
            if key is None:
                counts["unresolved"] += 1
                continue
            sources["musical_key"] = "explicit_text"
            connection.execute(
                "UPDATE beats SET musical_key=?,field_provenance=? WHERE id=?",
                (key, json.dumps(sources, ensure_ascii=False), row["id"]),
            )
            counts["updated"] += 1
    return counts
