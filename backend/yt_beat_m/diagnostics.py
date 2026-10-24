"""Inspect local prerequisites without downloading anything."""

import platform
import shutil
import subprocess
from importlib.metadata import PackageNotFoundError, version


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def command_version(name: str, flag: str = "--version") -> str | None:
    executable = shutil.which(name)
    if not executable:
        return None
    try:
        result = subprocess.run(
            [executable, flag], capture_output=True, text=True, timeout=5, check=True
        )
        return result.stdout.splitlines()[0] if result.stdout else None
    except (OSError, subprocess.SubprocessError):
        return None


def get_diagnostics() -> dict:
    dependencies = [
        {"name": "Python", "version": platform.python_version(), "hint": "Python 3.13 requis."},
        {
            "name": "yt-dlp",
            "version": package_version("yt-dlp"),
            "hint": "Lancer uv sync --locked.",
        },
        {
            "name": "yt-dlp-ejs",
            "version": package_version("yt-dlp-ejs"),
            "hint": "Lancer uv sync --locked (dépendances yt-dlp[default]).",
        },
        {
            "name": "FFmpeg",
            "version": command_version("ffmpeg", "-version"),
            "hint": "Installer FFmpeg et ajouter son dossier bin au PATH.",
        },
        {
            "name": "ffprobe",
            "version": command_version("ffprobe", "-version"),
            "hint": "ffprobe est fourni avec FFmpeg ; vérifier le PATH.",
        },
        {
            "name": "Node.js",
            "version": command_version("node"),
            "hint": "Installer Node.js 24 LTS et vérifier le PATH.",
        },
    ]
    for item in dependencies:
        item["available"] = bool(item["version"])
        if item["name"] == "Node.js" and item["version"]:
            try:
                item["available"] = int(item["version"].lstrip("v").split(".")[0]) >= 24
            except ValueError:
                item["available"] = False
    return {"ready": all(item["available"] for item in dependencies), "dependencies": dependencies}
