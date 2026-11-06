"""Bounded local raster selection; artwork is committed with the song, never staged on disk."""

import base64
import binascii
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from yt_beat_m.library import LibraryError

IMAGE_LIMIT = 2 * 1024 * 1024
IMAGE_ERROR = "Pochette : choisis un JPEG ou PNG lisible de 2 Mo maximum et 4096 × 4096 px maximum."


def normalized_image(data):
    if not 0 < len(data) <= IMAGE_LIMIT:
        raise LibraryError(IMAGE_ERROR)
    try:
        with Image.open(BytesIO(data), formats=("JPEG", "PNG")) as image:
            if max(image.size) > 4096 or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Image dimensions or frames")
            image.verify()
        with Image.open(BytesIO(data), formats=("JPEG", "PNG")) as image:
            image.load()
            # Only pixels survive: preserve orientation, drop EXIF/GPS, comments and profiles.
            oriented = ImageOps.exif_transpose(image)
            clean = Image.new(
                "RGBA" if "A" in oriented.getbands() or "transparency" in image.info else "RGB",
                oriented.size,
            )
            clean.paste(oriented.convert(clean.mode))
            clean.thumbnail((1600, 1600))
            output = BytesIO()
            clean.save(output, format="PNG")
            while output.tell() > IMAGE_LIMIT:
                clean.thumbnail((max(1, clean.width // 2), max(1, clean.height // 2)))
                output = BytesIO()
                clean.save(output, format="PNG")
        result = output.getvalue()
        if len(result) > IMAGE_LIMIT:
            raise ValueError("Normalized image too large")
        return result
    except (
        OSError,
        ValueError,
        SyntaxError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
    ) as exc:
        raise LibraryError(IMAGE_ERROR) from exc


def image_from_payload(value):
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise LibraryError(IMAGE_ERROR) from exc
    return normalized_image(data)


def select_image(value):
    path = Path(value)
    if (
        not path.is_absolute()
        or path.suffix.lower() not in {".jpg", ".jpeg", ".png"}
        or any(p.is_symlink() for p in (path, *path.parents))
        or not path.is_file()
    ):
        raise LibraryError(IMAGE_ERROR)
    with path.open("rb") as source:
        data = normalized_image(source.read(IMAGE_LIMIT + 1))
    return {"data": base64.b64encode(data).decode("ascii"), "media_type": "image/png"}
