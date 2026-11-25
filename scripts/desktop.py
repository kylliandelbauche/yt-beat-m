"""Build the isolated Mac desktop prototype; never include a library or preferences."""

import argparse
import os
import platform
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def prepare():
    run("npm", "ci", cwd=ROOT / "frontend")
    run("npm", "run", "build", cwd=ROOT / "frontend")
    run("npm", "ci", cwd=DESKTOP)
    run(
        "uv",
        "run",
        "--locked",
        "--group",
        "desktop",
        "python",
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        "beat-m-engine",
        "--distpath",
        str(ROOT / ".local/desktop-build/dist"),
        "--workpath",
        str(ROOT / ".local/desktop-build/work"),
        "--specpath",
        str(ROOT / ".local/desktop-build"),
        "--paths",
        str(ROOT / "backend"),
        "--add-data",
        f"{ROOT / 'frontend/dist'}{os.pathsep}frontend",
        "--add-data",
        f"{ROOT / 'backend/yt_beat_m/migrations'}{os.pathsep}yt_beat_m/migrations",
        "--collect-all",
        "yt_dlp",
        "--collect-all",
        "yt_dlp_ejs",
        "--copy-metadata",
        "yt-dlp",
        "--copy-metadata",
        "yt-dlp-ejs",
        str(DESKTOP / "engine_entry.py"),
    )
    # Copy only the allowlisted build output, never the project tree or .local.
    import shutil

    destination = DESKTOP / "src-tauri/resources/engine"
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(ROOT / ".local/desktop-build/dist/beat-m-engine", destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "build", "dev"])
    args = parser.parse_args()
    if platform.system() != "Darwin":
        parser.error("Ce premier prototype se construit et se vérifie sur Mac uniquement.")
    prepare()
    if args.action != "prepare":
        run("npm", "run", args.action, cwd=DESKTOP)


if __name__ == "__main__":
    main()
