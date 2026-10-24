"""Command-line launcher for the local engine."""

import argparse
import json
import threading
import time
import urllib.error
import urllib.request
import webbrowser

import uvicorn

from yt_beat_m.app import create_app
from yt_beat_m.diagnostics import get_diagnostics


def open_when_ready(url: str) -> None:
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)


def main() -> None:
    parser = argparse.ArgumentParser(description="YT Beat M — moteur local")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Vérifier les dépendances sans téléchargement")
    serve = commands.add_parser(
        "serve", help="Lancer sur 127.0.0.1 uniquement ; Ctrl+C pour arrêter"
    )
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--no-browser", action="store_true")
    serve.add_argument(
        "--dev", action="store_true", help="Autoriser le frontend Vite local sur 5173"
    )
    args = parser.parse_args()
    if args.command == "doctor":
        diagnostic = get_diagnostics()
        print(json.dumps(diagnostic, ensure_ascii=False, indent=2))
        raise SystemExit(0 if diagnostic["ready"] else 1)
    if not 1024 <= args.port <= 65535:
        parser.error("Le port doit être compris entre 1024 et 65535.")
    if not args.no_browser:
        threading.Thread(
            target=open_when_ready, args=(f"http://127.0.0.1:{args.port}",), daemon=True
        ).start()
    uvicorn.run(create_app(port=args.port, dev=args.dev), host="127.0.0.1", port=args.port)
