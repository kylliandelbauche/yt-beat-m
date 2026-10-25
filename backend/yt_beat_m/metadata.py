"""Validated local annotations. Original values remain separate from manual overrides."""

import json
import math
import re
import unicodedata
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

from yt_beat_m.beatmakers import _write, channel_keys, propose, provenance, write_correction
from yt_beat_m.library import Library, LibraryError


def normalize(value: str | None) -> str:
    return " ".join(
        "".join(
            c for c in unicodedata.normalize("NFKD", value or "") if not unicodedata.combining(c)
        )
        .casefold()
        .split()
    )


def canonical_key(value: str | None) -> str | None:
    text = normalize(value).replace("♯", "#").replace("♭", "b")
    match = re.fullmatch(
        r"(do|re|mi|fa|sol|la|si|[a-g])\s*([#b]?)\s*(minor|mineur|min|m|major|majeur|maj)",
        text,
    )
    if not match:
        return None
    note, accidental, mode = match.groups()
    note = {"do": "c", "re": "d", "mi": "e", "fa": "f", "sol": "g", "la": "a", "si": "b"}.get(
        note, note
    )
    # Keep enharmonic spellings distinct: no audio-derived pitch assumptions.
    return (
        note.upper()
        + accidental
        + (" minor" if mode in {"minor", "mineur", "min", "m"} else " major")
    )


class PurchaseLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(max_length=2048)
    label: str | None = Field(default=None, max_length=120)


class MetadataUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="", max_length=500)
    description: str | None = Field(default=None, max_length=100000)
    beatmaker: str | None = Field(default=None, max_length=200)
    remember_channel: bool = False
    reset_beatmaker: bool = False
    forget_channel_alias: bool = False
    bpm: float | None = None
    musical_key: str | None = Field(default=None, max_length=80)
    styles: list[str] = Field(default_factory=list, max_length=30)
    moods: list[str] = Field(default_factory=list, max_length=30)
    links: list[PurchaseLink] = Field(default_factory=list, max_length=20)


def clean_tags(values: list[str], field: str) -> list[str]:
    labels = {}
    for value in values:
        label = " ".join(value.split())
        if not label:
            continue
        if len(label) > 80 or any(unicodedata.category(c).startswith("C") for c in label):
            raise LibraryError(
                f"{field} : chaque tag doit contenir au maximum 80 caractères lisibles."
            )
        labels.setdefault(normalize(label), label)
    return list(labels.values())


def correct_metadata(library: Library, identity: str, payload: MetadataUpdate) -> bool:
    changes = payload.model_dump(exclude_unset=True)
    remember = changes.pop("remember_channel", False)
    reset = changes.pop("reset_beatmaker", False)
    forget = changes.pop("forget_channel_alias", False)
    maker_changed = "beatmaker" in changes
    maker = changes.pop("beatmaker", None)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"] or any(
            unicodedata.category(c).startswith("C") for c in changes["title"]
        ):
            raise LibraryError(
                "Titre : indique un titre lisible sur une ligne (500 caractères maximum)."
            )
    if "bpm" in changes:
        bpm = changes["bpm"]
        if bpm is not None and (not math.isfinite(bpm) or not 0 < bpm <= 1000):
            raise LibraryError(
                "BPM : indique un nombre supérieur à 0 et inférieur ou égal à 1000, ou laisse vide."
            )
    if "musical_key" in changes:
        raw = changes["musical_key"]
        key = canonical_key(raw)
        if raw and raw.strip() and key is None:
            raise LibraryError(
                "Tonalité : indique une note et un mode, par exemple F mineur ou Do majeur."
            )
        changes["musical_key"] = key
    for field in ("styles", "moods"):
        if field in changes:
            changes[field] = clean_tags(
                changes[field], "Styles" if field == "styles" else "Ambiances"
            )
    if "links" in changes:
        links = {}
        for link in changes["links"]:
            url = link["url"].strip()
            try:
                parts = urlsplit(url)
                valid = (
                    parts.scheme in {"https", "http"}
                    and parts.hostname
                    and not parts.username
                    and not parts.password
                )
                _ = parts.port
            except ValueError:
                valid = False
            if not valid or any(c.isspace() or ord(c) < 32 for c in url) or "\\" in url:
                raise LibraryError(
                    "Lien d’achat : utilise une URL HTTP ou HTTPS complète, sans identifiants."
                )
            links.setdefault(url, {"url": url, "label": (link["label"] or "").strip() or None})
        changes["links"] = list(links.values())
    with library.catalog() as connection:
        connection.create_function("normalized", 1, normalize, deterministic=True)
        row = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        if row is None:
            return False
        if (reset and (maker_changed or remember)) or (forget and remember):
            raise LibraryError(
                "Beatmaker : choisir soit une correction, soit le retour à la proposition."
            )
        if forget:
            for key in channel_keys(dict(row)):
                connection.execute("DELETE FROM channel_aliases WHERE channel_key=?", (key,))
        if reset:
            _write(connection, row, *propose(connection, dict(row)))
            row = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        if maker_changed or remember:
            if not write_correction(
                connection, identity, maker if maker_changed else row["beatmaker"], remember
            ):
                return False
            row = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        sources = provenance(row)
        originals = sources.setdefault("original_metadata", {})
        for field, value in changes.items():
            if field in {"title", "description", "bpm", "musical_key"}:
                original = row[field]
            elif field in {"styles", "moods"}:
                original = [
                    r[0]
                    for r in connection.execute(
                        "SELECT label FROM tags JOIN beat_tags ON tags.id=tag_id WHERE "
                        "beat_id=? AND kind=?",
                        (identity, "style" if field == "styles" else "mood"),
                    )
                ]
            else:
                original = [
                    dict(r)
                    for r in connection.execute(
                        "SELECT url,label,provenance,manually_edited FROM source_links WHERE "
                        "beat_id=?",
                        (identity,),
                    )
                ]
            originals.setdefault(field, {"value": original, "source": sources.get(field)})
            sources[field] = "manual"
            if field in {"title", "description", "bpm", "musical_key"}:
                connection.execute(f"UPDATE beats SET {field}=? WHERE id=?", (value, identity))
            elif field in {"styles", "moods"}:
                kind = "style" if field == "styles" else "mood"
                connection.execute(
                    "DELETE FROM beat_tags WHERE beat_id=? AND tag_id IN (SELECT id FROM "
                    "tags WHERE kind=?)",
                    (identity, kind),
                )
                for label in value:
                    existing = connection.execute(
                        "SELECT id FROM tags WHERE kind=? AND normalized(label)=? "
                        "ORDER BY id LIMIT 1",
                        (kind, normalize(label)),
                    ).fetchone()
                    if existing:
                        tag = existing[0]
                    else:
                        tag = connection.execute(
                            "INSERT INTO tags(kind,label,normalized_label) VALUES(?,?,?)",
                            (kind, label, normalize(label)),
                        ).lastrowid
                    connection.execute("INSERT INTO beat_tags VALUES(?,?)", (identity, tag))
            else:
                connection.execute("DELETE FROM source_links WHERE beat_id=?", (identity,))
                for link in value:
                    connection.execute(
                        "INSERT INTO "
                        "source_links(beat_id,url,label,provenance,manually_edited) "
                        "VALUES(?,?,?,'manual',1)",
                        (identity, link["url"], link["label"]),
                    )
        connection.execute(
            "UPDATE beats SET field_provenance=? WHERE id=?",
            (json.dumps(sources, ensure_ascii=False), identity),
        )
    return True
