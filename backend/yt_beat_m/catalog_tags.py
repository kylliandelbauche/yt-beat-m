"""Shared vocabulary mutations; labels survive as aliases or deletion markers."""

import json
import unicodedata

from pydantic import BaseModel, ConfigDict, Field

from yt_beat_m.library import LibraryError


class TagConflict(LibraryError):
    pass


class TagExpected(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_label: str = Field(max_length=500)


class TagRename(TagExpected):
    label: str = Field(max_length=80)


def resolve_label(c, label, *, recreate=False):
    row = c.execute("SELECT tag_id FROM catalog_tag_names WHERE label=?", (label,)).fetchone()
    if row:
        if row[0] is None:
            if recreate:
                return label
            raise TagConflict(
                f"Le tag « {label} » a été supprimé. "
                "Retire-le du brouillon ou recrée-le explicitement."
            )
        return c.execute("SELECT label FROM catalog_tags WHERE id=?", (row[0],)).fetchone()[0]
    return label


def ensure_tag(c, label):
    from yt_beat_m.metadata import normalize

    row = c.execute("SELECT id FROM catalog_tags WHERE label=?", (label,)).fetchone()
    if row:
        return row[0]
    identity = c.execute("SELECT coalesce(max(identity),0)+1 FROM catalog_tag_names").fetchone()[0]
    c.execute("INSERT INTO catalog_tags VALUES(?,?,?)", (identity, label, normalize(label)))
    c.execute(
        "INSERT INTO catalog_tag_names VALUES(?,?,?) ON CONFLICT(label) DO UPDATE "
        "SET tag_id=excluded.tag_id,identity=excluded.identity",
        (label, identity, identity),
    )
    return identity


def list_tags(library):
    with library.catalog() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT t.id,t.label,count(b.beat_id) AS beat_count FROM catalog_tags t "
                "LEFT JOIN beat_catalog_tags b ON b.tag_id=t.id GROUP BY t.id "
                "ORDER BY t.normalized_label,t.label"
            )
        ]


def change_tag(library, identity, expected, label=None):
    from yt_beat_m.beatmakers import provenance
    from yt_beat_m.metadata import normalize, tag_labels

    if label is not None:
        label = " ".join(label.split())
        if (
            not label
            or len(label) > 80
            or any(unicodedata.category(ch).startswith("C") for ch in label)
        ):
            raise LibraryError("Indique un nom de tag lisible (80 caractères maximum).")
    with library.catalog() as c:
        row = c.execute("SELECT label FROM catalog_tags WHERE id=?", (identity,)).fetchone()
        if not row:
            raise TagConflict("Ce tag a été supprimé. Actualise la liste.")
        old = row[0]
        if old != expected:
            raise TagConflict(
                "Ce tag a été renommé ailleurs. Actualise la liste avant de réessayer."
            )
        if label == old:
            return {"id": identity, "old_label": old, "label": label}
        if label is not None:
            collision = c.execute(
                "SELECT tag_id FROM catalog_tag_names WHERE label=?", (label,)
            ).fetchone()
            if collision and collision[0] != identity:
                raise TagConflict(
                    "Ce nom est déjà utilisé ou réservé par un tag retiré. Choisis un autre nom."
                )
        aliases = [
            r[0]
            for r in c.execute("SELECT label FROM catalog_tag_names WHERE tag_id=?", (identity,))
        ]
        for beat in c.execute(
            "SELECT * FROM beats WHERE id IN "
            "(SELECT beat_id FROM beat_catalog_tags WHERE tag_id=?)",
            (identity,),
        ).fetchall():
            sources = provenance(beat)
            sources.setdefault("original_metadata", {}).setdefault(
                "tags",
                {
                    "value": tag_labels(c, beat["id"]),
                    "source": {k: sources.get(k) for k in ("styles", "moods", "tags")},
                    "legacy": [
                        dict(r)
                        for r in c.execute(
                            "SELECT t.id,t.kind,t.label FROM tags t "
                            "JOIN beat_tags b ON b.tag_id=t.id "
                            "WHERE b.beat_id=?",
                            (beat["id"],),
                        )
                    ],
                },
            )
            sources["tags"] = "manual"
            c.execute(
                "UPDATE beats SET field_provenance=? WHERE id=?",
                (json.dumps(sources, ensure_ascii=False), beat["id"]),
            )
        if label is None:
            c.executemany(
                "DELETE FROM beat_tags WHERE tag_id IN "
                "(SELECT id FROM tags WHERE label=? COLLATE BINARY)",
                [(v,) for v in aliases],
            )
            c.execute("DELETE FROM catalog_tags WHERE id=?", (identity,))
        else:
            c.execute(
                "UPDATE catalog_tags SET label=?,normalized_label=? WHERE id=?",
                (label, normalize(label), identity),
            )
            c.execute(
                "INSERT INTO catalog_tag_names VALUES(?,?,?) ON CONFLICT(label) DO NOTHING",
                (label, identity, identity),
            )
        return {"id": identity, "old_label": old, "label": label}
