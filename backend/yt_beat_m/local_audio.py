"""Index existing MP3 files without changing the original audio."""

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from mutagen import MutagenError
from mutagen.mp3 import MP3

from yt_beat_m.library import Library, LibraryError


def tag_text(audio: MP3, key: str) -> str | None:
    tag = audio.tags.get(key) if audio.tags else None
    return str(tag).replace("\x00", "").strip()[:500] or None if tag else None


def embedded_artwork(audio: MP3) -> tuple[bytes, str] | None:
    for picture in audio.tags.getall("APIC") if audio.tags else []:
        if len(picture.data) > 10 * 1024 * 1024:
            continue
        if picture.mime == "image/jpeg" and picture.data.startswith(b"\xff\xd8\xff"):
            return picture.data, "jpg"
        if picture.mime == "image/png" and picture.data.startswith(b"\x89PNG\r\n\x1a\n"):
            return picture.data, "png"
    return None


def scan_local_audio(library: Library) -> dict:
    added, skipped, errors = 0, 0, []
    for path in sorted(library.safe_path("audio").iterdir()):
        if path.suffix.lower() != ".mp3":
            continue
        artwork: Path | None = None
        try:
            relative = path.relative_to(library.root).as_posix()
            source = library.safe_path(relative)
            if not source.is_file():
                continue
            with library.catalog() as catalog:
                if catalog.execute(
                    "SELECT id FROM beats WHERE audio_path = ?", (relative,)
                ).fetchone():
                    skipped += 1
                    continue
            audio = MP3(source)
            duration = audio.info.length
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError("invalid duration")
            identity = str(uuid4())
            picture = embedded_artwork(audio)
            artwork_path = None
            if picture:
                data, extension = picture
                artwork_path = f"artwork/{identity}.{extension}"
                artwork = library.safe_path(artwork_path)
                artwork.write_bytes(data)
            title = tag_text(audio, "TIT2") or source.stem[:500]
            provenance = {
                "title": "id3" if tag_text(audio, "TIT2") else "filename",
                "duration": "mp3",
            }
            with library.catalog() as catalog:
                catalog.execute(
                    "INSERT INTO beats(id, title, duration_seconds, added_at, audio_path, "
                    "artwork_path, field_provenance) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        identity,
                        title,
                        duration,
                        datetime.now(UTC).isoformat(),
                        relative,
                        artwork_path,
                        json.dumps(provenance),
                    ),
                )
            added += 1
        except (OSError, ValueError, MutagenError, LibraryError):
            if artwork:
                try:
                    artwork.unlink(missing_ok=True)
                except OSError:
                    pass
            errors.append({"name": path.name, "message": "MP3 illisible ou fichier inaccessible."})
    return {"added": added, "skipped": skipped, "errors": errors}


def media_path(library: Library, identity: str, *, artwork: bool = False) -> Path | None:
    column = "artwork_path" if artwork else "audio_path"
    with library.catalog() as catalog:
        row = catalog.execute(f"SELECT {column} FROM beats WHERE id = ?", (identity,)).fetchone()
    if not row or not row[0]:
        return None
    path = library.safe_path(row[0])
    return path if path.is_file() else None
