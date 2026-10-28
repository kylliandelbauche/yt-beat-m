"""Conservative producer credits, portable channel aliases and explicit corrections."""

import json
import re
import unicodedata

from yt_beat_m.library import Library, LibraryError

AUTOMATIC = {
    "explicit_credit",
    "channel",
    "channel_alias",
    "ambiguous_credit",
    "channel_self_credit",
    "channel_alias_self_credit",
    "unresolved_self_credit",
    None,
}
LABEL = (
    r"(?:produced[ \t]+by|prod(?:\.(?:[ \t]+by)?|[ \t]+by)?|produit(?:e)?[ \t]+par|"
    r"beat[ \t]+by|(?:compositeurs?|compositrices?)(?=[ \t]*[:=–-]))"
)
SEPARATOR = r"(?:[ \t]*[:.=–-][ \t]*|[ \t]+)"
BRACKET_CREDIT = re.compile(r"[\[(][ \t]*" + LABEL + SEPARATOR + r"([^\])\n\r]+)[\])]", re.I)
LINE_LABEL = (
    r"(?:produced[ \t]+by|prod\.?[ \t]+by|prod(?=[ \t]*[:.=–-])|"
    r"produit(?:e)?[ \t]+par|beat[ \t]+by|(?:compositeurs?|compositrices?)(?=[ \t]*[:=–-]))"
)
LINE_CREDIT = re.compile(
    r"^[ \t]*(?:[-*•][ \t]*)?" + LINE_LABEL + SEPARATOR + r"([^\n\r]+)$", re.I | re.M
)
COLLABORATION = re.compile(r"(?<=\S)[ \t]+(?:x|and|et)[ \t]+|[&×+]", re.I)
SELF_NAMES = {"me", "myself", "moi", "moi-même", "moi meme", "moi même"}


def normalized_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def credit_parts(name: str) -> list[str]:
    return [part.strip() for part in COLLABORATION.split(name)]


def is_self(name: str) -> bool:
    return normalized_name(name).replace("‐", "-").replace("‑", "-") in SELF_NAMES


def has_self(name: str) -> bool:
    return any(is_self(part) for part in credit_parts(name))


def credit_candidates(title: str, description: str | None) -> list[str]:
    candidates = {}
    for text in (title, description or ""):
        text = (
            text.replace("\u00a0", " ")
            .replace("\u202f", " ")
            .replace("\r\n", "\n")
            .replace("\r", "\n")
        )
        for pattern in (BRACKET_CREDIT, LINE_CREDIT):
            for match in pattern.finditer(text):
                name = match[1].split("|")[0].strip(" \t.\"'")
                name = re.split(
                    r"(?<=\S)[ \t]+(?=https?://|www\.|[💰📩📷🎵🎹©]|"
                    r"(?:BPM|Key|Clé|Tonalité|Achat|Purchase|Download|Instagram|Contact)\s*[:=])",
                    name,
                    maxsplit=1,
                    flags=re.I,
                )[0].strip(" \t.\"'")
                if not 0 < len(name) <= 200 or not any(character.isalpha() for character in name):
                    continue
                if any(character in name for character in ":<>[]()=\n\r"):
                    continue
                if "www." in name.lower() or re.search(
                    r"\S@\S|\b(?:BPM|key|tonalité)\b", name, re.I
                ):
                    continue
                if any(not part for part in credit_parts(name)):
                    continue
                candidates.setdefault(normalized_name(name), name)
    return list(candidates.values())


def producer_credit(title: str, description: str | None) -> tuple[str | None, str | None]:
    candidates = credit_candidates(title, description)
    if len(candidates) == 1:
        name = candidates[0]
        return name, "self_credit" if has_self(name) else "explicit_credit"
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


def source_text(data):
    fields = provenance(data) if "field_provenance" in data else {}
    originals = fields.get("original_metadata", {})
    title = originals.get("title", {}).get("value", data["title"])
    description = originals.get("description", {}).get("value", data.get("description"))
    return title, description


def source_credit(data):
    return producer_credit(*source_text(data))


def alias_owner(alias) -> str | None:
    """Reuse a single owner, never a whole collaboration as someone's identity."""
    if not alias or has_self(alias["beatmaker"]):
        return None
    corrected = credit_parts(alias["beatmaker"])
    credited = credit_parts(alias["credit_name"] or "")
    if len(corrected) == len(credited) == 1:
        return corrected[0]
    if any(is_self(part) for part in credited):
        guests = {normalized_name(part) for part in credited if not is_self(part)}
        remaining = [part for part in corrected if normalized_name(part) not in guests]
        if guests.issubset({normalized_name(part) for part in corrected}) and len(remaining) == 1:
            return remaining[0]
    return None


def self_proposal(names: list[str], channel: str | None, alias) -> tuple[str | None, str]:
    owner = alias_owner(alias)
    origin = "channel_alias_self_credit" if owner else "channel_self_credit"
    rewrites = {}
    if not owner:
        owner = channel.strip() if channel and not has_self(channel) else None
    named = [name for name in names if not has_self(name)]
    # A fully named credit can corroborate the owner, without treating a repost
    # channel, social handle or copyright holder as proof of authorship.
    if len(named) == 1:
        explicit = credit_parts(named[0])
        inferred = set()
        for name in names:
            if not has_self(name):
                continue
            guests = {normalized_name(part) for part in credit_parts(name) if not is_self(part)}
            remaining = [part for part in explicit if normalized_name(part) not in guests]
            if (
                guests.issubset({normalized_name(part) for part in explicit})
                and len(remaining) == 1
            ):
                inferred.add(remaining[0])
        if len(inferred) == 1:
            explicit_owner = inferred.pop()
            known_names = {normalized_name(owner)} if owner else set()
            if alias and len(credit_parts(alias["credit_name"] or "")) == 1:
                known_names.add(normalized_name(alias["credit_name"] or ""))
            if (
                origin == "channel_alias_self_credit"
                and normalized_name(explicit_owner) in known_names
            ):
                rewrites[normalized_name(explicit_owner)] = owner
            else:
                owner, origin = explicit_owner, "explicit_credit"
    if not owner:
        origin = "unresolved_self_credit"
    candidates = {}
    for name in names:
        parts = {}
        for part in credit_parts(name):
            value = (
                (owner or "À préciser")
                if is_self(part)
                else rewrites.get(normalized_name(part), part)
            )
            parts.setdefault(normalized_name(value), value)
        identity = frozenset(parts)
        candidates.setdefault(identity, " x ".join(parts.values()))
    if len(candidates) != 1:
        return None, "ambiguous_credit"
    result = next(iter(candidates.values()))
    return (None if result == "À préciser" else result), origin


def propose(connection, data) -> tuple[str | None, str | None]:
    candidates = credit_candidates(*source_text(data))
    alias = channel_alias(connection, data)
    if any(has_self(name) for name in candidates):
        return self_proposal(candidates, data.get("channel"), alias)
    name, source = source_credit(data)
    if source == "ambiguous_credit":
        return None, source
    if alias and has_self(alias["beatmaker"]):
        alias = None
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


def write_correction(connection, identity: str, value: str | None, remember: bool) -> bool:
    name = value.strip() if value else None
    name = name or None
    if name and (len(name) > 200 or any(unicodedata.category(c).startswith("C") for c in name)):
        raise LibraryError(
            "Le nom du beatmaker doit tenir sur une ligne de 200 caractères maximum."
        )
    record = connection.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
    if record is None:
        return False
    row = dict(record)
    if remember:
        key = channel_key(row)
        if not key or not name:
            raise LibraryError("Choisir un nom et une chaîne pour mémoriser cette règle.")
        credit, _ = source_credit(row)
        if propose(connection, row)[1] == "ambiguous_credit":
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


def correct_beatmaker(library: Library, identity: str, value: str | None, remember: bool) -> bool:
    with library.catalog() as connection:
        return write_correction(connection, identity, value, remember)


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
