"""Build the native desktop prototype; never include a library or preferences."""

import argparse
import os
import platform
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"


def run(*args, cwd=ROOT):
    if os.name == "nt" and args[0] == "npm":
        # Execute npm's JS entry directly instead of invoking a .cmd through a shell.
        npm = shutil.which("npm")
        node = shutil.which("node")
        if not npm or not node:
            raise RuntimeError("Node.js et npm sont requis pour construire l’application.")
        cli = Path(npm).parent / "node_modules/npm/bin/npm-cli.js"
        if not cli.is_file():
            raise RuntimeError("Installation npm non reconnue ; utiliser Node.js officiel.")
        args = (node, str(cli), *args[1:])
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
    destination = DESKTOP / "src-tauri/resources/engine"
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(ROOT / ".local/desktop-build/dist/beat-m-engine", destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "build", "dev"])
    args = parser.parse_args()
    if platform.system() not in {"Darwin", "Windows"}:
        parser.error("Construire sur Mac pour le DMG ou sur Windows pour le .exe.")
    prepare()
    if args.action != "prepare":
        run("npm", "run", args.action, cwd=DESKTOP)


if __name__ == "__main__":
    main()
