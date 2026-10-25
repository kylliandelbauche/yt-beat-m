"""Readable import names, bounded for portable Mac/Windows filenames."""

import re
import unicodedata

RESERVED = {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"} | {
    f"{prefix}{digit}" for prefix in ("COM", "LPT") for digit in "123456789¹²³"
}


def component(value: str | None, fallback: str, limit: int) -> str:
    value = unicodedata.normalize("NFC", value or "")
    value = "".join(c for c in value if not unicodedata.category(c).startswith("C"))
    value = re.sub(r'[<>:"/\\|?*]', "-", value)
    value = " ".join(value.split()).strip(" .-") or fallback
    if value.split(".")[0].upper() in RESERVED:
        value = "_" + value
    result = ""
    for char in value:
        # Also respect decomposed Unicode filenames on Mac filesystems.
        if len(unicodedata.normalize("NFD", result + char).encode("utf-8")) > limit:
            break
        result += char
    return result.rstrip(" .-") or fallback


def audio_filename(beatmaker: str | None, metadata: dict) -> str:
    bpm = metadata["bpm"]
    parts = [
        component(beatmaker, "Beatmaker inconnu", 40),
        component(metadata["title"], "Titre inconnu", 80),
        component(f"{bpm:g} BPM" if bpm is not None else None, "BPM inconnu", 16),
        component(metadata["musical_key"], "Tonalité inconnue", 28),
    ]
    return " - ".join(parts) + ".mp3"
