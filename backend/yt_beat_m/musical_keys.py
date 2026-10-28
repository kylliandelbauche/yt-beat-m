"""Shared key normalization and extraction from explicit musical text only."""

import re
import unicodedata

NOTE = r"(?:do|ré|re|mi|fa|sol|la|si|[a-g])"
MODE = r"(?:minor|mineur|major|majeur|min|maj|m)"
KEY = rf"{NOTE}(?:\s*[#♯b♭])?\s*{MODE}(?![\w#♯♭])"
LABELLED = re.compile(
    rf"(?<![\w/@])(?:key|clé|cle|tonalité|tonalite|gamme)\b"
    rf"(?:\s*[:=–—-]\s*|\s+)(?P<key>{KEY})",
    re.I,
)
CONTINUATION = re.compile(rf"\s*(?:[/|,;&]|\b(?:or|ou|and|et)\b)\s*({KEY})", re.I)
# Compact unlabelled notes must start with an uppercase pitch: ordinary 'am',
# 'fam' and 'la' in prose must not become keys, even near a tempo.
CONTEXT_KEY = (
    rf"(?:[A-G][#♯b♭]?(?:(?i:minor|mineur|major|majeur|min|maj)|m)"
    rf"|(?i:{NOTE}(?:\s*[#♯b♭])?\s+(?:minor|mineur|major|majeur|min|maj)))"
    r"(?![\w#♯♭])"
)
BPM = r"(?i:(?:\d{2,3}(?:[.,]\d+)?\s*bpm\b|\bbpm\s*[:=–—-]?\s*\d{2,3}(?:[.,]\d+)?))"
DECORATION = r"[^\w\r\n/|]{0,12}"
AFTER_BPM = re.compile(rf"(?<!\w){BPM}{DECORATION}[/|]{DECORATION}(?P<key>{CONTEXT_KEY})")
BEFORE_BPM = re.compile(rf"(?<!\w)(?P<key>{CONTEXT_KEY}){DECORATION}[/|]{DECORATION}{BPM}(?!\w)")


def canonical_key(value: str | None) -> str | None:
    text = (
        " ".join(
            "".join(
                c
                for c in unicodedata.normalize("NFKD", value or "")
                if not unicodedata.combining(c)
            )
            .casefold()
            .split()
        )
        .replace("♯", "#")
        .replace("♭", "b")
    )
    match = re.fullmatch(
        r"(do|re|mi|fa|sol|la|si|[a-g])(?:\s*([#b]))?\s*(minor|mineur|min|m|major|majeur|maj)",
        text,
    )
    if not match:
        return None
    note, accidental, mode = match.groups()
    note = {"do": "c", "re": "d", "mi": "e", "fa": "f", "sol": "g", "la": "a", "si": "b"}.get(
        note, note
    )
    return (
        note.upper()
        + (accidental or "")
        + (" minor" if mode in {"minor", "mineur", "min", "m"} else " major")
    )


def extract_key(title: str, description: str | None) -> str | None:
    text = unicodedata.normalize("NFKC", f"{title}\n{description or ''}")
    # A slug, query parameter or email address is not a musical statement.
    text = re.sub(
        r"(?:https?://|www\.)\S+|(?<![\w.+-])[\w.+-]+@[\w.-]+\.\w+", " ", text, flags=re.I
    )
    candidates = set()
    for match in LABELLED.finditer(text):
        candidates.add(canonical_key(match["key"]))
        position = match.end()
        while continuation := CONTINUATION.match(text, position):
            candidates.add(canonical_key(continuation[1]))
            position = continuation.end()
    for pattern in (AFTER_BPM, BEFORE_BPM):
        for match in pattern.finditer(text):
            candidates.add(canonical_key(match["key"]))
            position = match.end()
            if pattern is AFTER_BPM:
                while continuation := CONTINUATION.match(text, position):
                    candidates.add(canonical_key(continuation[1]))
                    position = continuation.end()
    candidates.discard(None)
    return next(iter(candidates)) if len(candidates) == 1 else None
