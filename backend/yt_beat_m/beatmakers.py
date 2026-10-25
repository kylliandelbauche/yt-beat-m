"""Conservative producer credits, portable channel aliases and explicit corrections."""

import json
import re
import unicodedata

from yt_beat_m.library import Library, LibraryError

AUTOMATIC = {"explicit_credit", "channel", "channel_alias", "ambiguous_credit", None}
LABEL = r"(?:produced[ \t]+by|prod(?:\.|[ \t]+by)?|produit(?:e)?[ \t]+par|beat[ \t]+by)"
SEPARATOR = r"(?:[ \t]*[:.=–-][ \t]*|[ \t]+)"
BRACKET_CREDIT = re.compile(r"[\[(][ \t]*" + LABEL + SEPARATOR + r"([^\])\n\r]+)[\])]", re.I)
LINE_LABEL = (
    r"(?:produced[ \t]+by|prod\.?[ \t]+by|prod(?=[ \t]*[:.=–-])|"
    r"produit(?:e)?[ \t]+par|beat[ \t]+by)"
)
LINE_CREDIT = re.compile(
    r"^[ \t]*(?:[-*•][ \t]*)?" + LINE_LABEL + SEPARATOR + r"([^\n\r]+)$", re.I | re.M
)


def normalized_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def producer_credit(title: str, description: str | None) -> tuple[str | None, str | None]:
    candidates = {}
    for text in (title, description or ""):
        for pattern in (BRACKET_CREDIT, LINE_CREDIT):
            for match in pattern.finditer(text):
                name = match[1].split("|")[0].strip(" \t.\"'")
                if not 0 < len(name) <= 200 or not any(character.isalpha() for character in name):
                    continue
                if any(character in name for character in ":<>[]()=\n\r"):
                    continue
                if "www." in name.lower() or re.search(
                    r"\S@\S|\b(?:BPM|key|tonalité)\b", name, re.I
                ):
                    continue
                candidates.setdefault(normalized_name(name), name)
    if len(candidates) == 1:
        return next(iter(candidates.values())), "explicit_credit"
    return None, "ambiguous_credit" if candidates else None


def provenance(row) -> dict:
    try:
        value = json.loads(row["field_provenance"])
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def channel_key(data) -> str | None:
    if data.get("channel_id"):
        return "id:" + data["channel_id"]
    if data.get("channel"):
        return "name:" + normalized_name(data["channel"])
    return None


def channel_keys(data) -> list[str]:
    keys = [channel_key(data)] if channel_key(data) else []
    if data.get("channel_id") and data.get("channel"):
        keys.append("name:" + normalized_name(data["channel"]))
    return keys


def channel_alias(connection, data) -> dict | None:
    # Prefer stable IDs, but keep explicitly named legacy rules useful for new imports.
    for key in channel_keys(data):
        row = connection.execute(
            "SELECT beatmaker, credit_name FROM channel_aliases WHERE channel_key=?", (key,)
        ).fetchone()
        if row is not None:
            return {**dict(row), "uses_channel_id": key.startswith("id:")}
    return None


def propose(connection, data) -> tuple[str | None, str | None]:
    name, source = producer_credit(data["title"], data.get("description"))
    if source == "ambiguous_credit":
        return None, source
    alias = channel_alias(connection, data)
    if alias and (
        not name
        or normalized_name(name)
        in {normalized_name(alias["credit_name"] or ""), normalized_name(alias["beatmaker"])}
    ):
        return alias["beatmaker"], "channel_alias"
    if name:
        return name, source
    return (data["channel"], "channel") if data.get("channel") else (None, None)


def _write(connection, row, name, source):
    fields = provenance(row)
    fields["beatmaker"] = source
    connection.execute(
        "UPDATE beats SET beatmaker=?, field_provenance=? WHERE id=?",
        (name, json.dumps(fields, ensure_ascii=False), row["id"]),
    )


def refresh_beatmakers(library: Library) -> dict:
    updated, preserved, unresolved = 0, 0, 0
    with library.catalog() as connection:
        for record in connection.execute("SELECT * FROM beats").fetchall():
            row = dict(record)
            source = provenance(row).get("beatmaker")
            if source not in AUTOMATIC or (row["beatmaker"] is not None and source is None):
                preserved += 1
                continue
            name, origin = propose(connection, row)
            if name != row["beatmaker"] or source != origin:
                _write(connection, row, name, origin)
                updated += 1
            if name is None:
                unresolved += 1
    return {"updated": updated, "preserved": preserved, "unresolved": unresolved}


def correct_beatmaker(library: Library, identity: str, value: str | None, remember: bool) -> bool:
    name = value.strip() if value else None
    name = name or None
    if name and (len(name) > 200 or any(unicodedata.category(c).startswith("C") for c in name)):
        raise LibraryError(
            "Le nom du beatmaker doit tenir sur une ligne de 200 caractères maximum."
        )
    with library.catalog() as connection:
        record = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        if record is None:
            return False
        row = dict(record)
        if remember:
            key = channel_key(row)
            if not key or not name:
                raise LibraryError("Choisir un nom et une chaîne pour mémoriser cette règle.")
            credit, source = producer_credit(row["title"], row["description"])
            if source == "ambiguous_credit":
                raise LibraryError(
                    "Crédits contradictoires : corriger cette prod sans règle de chaîne."
                )
            connection.execute(
                "INSERT INTO channel_aliases(channel_key,beatmaker,credit_name) VALUES(?,?,?) "
                "ON CONFLICT(channel_key) DO UPDATE SET beatmaker=excluded.beatmaker, "
                "credit_name=excluded.credit_name",
                (key, name, credit or row["channel"]),
            )
        _write(connection, row, name, "manual")
    return True


def reset_beatmaker(library: Library, identity: str) -> bool:
    with library.catalog() as connection:
        record = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        if record is None:
            return False
        row = dict(record)
        _write(connection, row, *propose(connection, row))
    return True


def forget_channel_alias(library: Library, identity: str) -> bool:
    with library.catalog() as connection:
        record = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        if record is None:
            return False
        for key in channel_keys(dict(record)):
            connection.execute("DELETE FROM channel_aliases WHERE channel_key=?", (key,))
    return True
