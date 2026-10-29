"""Isolated browser-test server with generated audio and a simulated network downloader."""

import base64
import json
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import uvicorn
from yt_beat_m import imports
from yt_beat_m.app import create_app
from yt_beat_m.import_process import ProcessRunner
from yt_beat_m.library import Library

ROOT = Path(__file__).resolve().parents[1]
AUDIO = base64.b64decode((ROOT / "backend/tests/fixtures/long-tone.mp3.base64").read_text())
COVER = base64.b64decode((ROOT / "backend/tests/fixtures/mint-cover.jpg.base64").read_text())


def simulated_download(self, args, on_line=None, *, timeout=600):
    if "--dump-single-json" in args:
        identity = parse_qs(urlsplit(args[-1]).query)["v"][0]
        if identity.startswith("SELFCREDIT"):
            return json.dumps(
                {
                    "id": identity,
                    "title": "Prod crédit " + identity[-1],
                    "duration": 30,
                    "channel": "prodlacco",
                    "channel_id": "UC-e2e-lacco",
                    "description": "prod by me x @m3nacebeats"
                    if identity.endswith("1")
                    else "prod by moi x @Other",
                    "upload_date": "20261023",
                }
            )
        return json.dumps(
            {
                "id": identity,
                "title": ("Prod beatmaker " + identity[-1])
                if identity.startswith("CREATOR")
                else ("Prod tonalité " + identity[-1])
                if identity.startswith("KEYREGRESS")
                else "Prod importée de test",
                "duration": 30,
                "channel": "Chaîne de recette",
                "channel_id": "UC-e2e-producer",
                "upload_date": "20261023",
                "description": "Produced by Raw"
                if identity.startswith("CREATOR")
                else "BPM : 130 Clé : E minor"
                if identity == "KEYREGRESS1"
                else "144bpm 🎵 / Abm 🎹"
                if identity == "KEYREGRESS2"
                else "140 BPM",
            }
        )
    if args[0] == "ffprobe":
        return '{"format":{"duration":"30.04"}}'
    template = args[args.index("-o") + 1]
    Path(template.replace("%(ext)s", "mp3")).write_bytes(AUDIO)
    Path(template.replace("%(ext)s", "jpg")).write_bytes(COVER)
    if on_line:
        on_line("BEAT_PROGRESS: 50.0%")
        on_line("BEAT_STAGE:converting")
    return ""


def main():
    # These replacements exist only in this isolated test process, never in the application.
    import yt_beat_m.profile_photos as portraits
    from yt_beat_m.library import LibraryError

    def no_portrait(*args):
        raise LibraryError("Portrait indisponible dans la recette isolée.")

    portraits.fetch_channel = no_portrait
    ProcessRunner.run = simulated_download
    imports.shutil.which = lambda name: name
    with tempfile.TemporaryDirectory(prefix="yt-beat-m-e2e-") as folder:
        root = Path(folder)
        library = Library.create(root / "collection", "Collection de test")
        for index, (title, maker) in enumerate(
            (("R&B Mélancolique", "Nova"), ("Drill minuit", "Ryo")), 1
        ):
            identity = str(UUID(int=index))
            relative = f"audio/{identity}.mp3"
            library.safe_path(relative).write_bytes(AUDIO)
            with library.catalog() as connection:
                connection.execute(
                    "INSERT INTO beats(id, title, beatmaker, duration_seconds, "
                    "added_at, audio_path, "
                    "published_on, source_url, channel, bpm, musical_key, description) "
                    "VALUES (?, ?, ?, 30, '2026-10-01T12:00:00Z', ?, "
                    "'2025-01-02', ?, ?, 140, 'F# minor', ?)",
                    (
                        identity,
                        title,
                        maker,
                        relative,
                        "https://www.youtube.com/watch?v=abcdefghijk",
                        "Chaîne de test",
                        "<script>window.untrusted = true</script> Description de test.",
                    ),
                )
                connection.execute(
                    "INSERT INTO source_links(beat_id,url,label,provenance) VALUES (?,?,?,?)",
                    (identity, "https://example.org/license", "Licence de test", "fixture"),
                )
        preferences = root / "preferences.json"
        preferences.write_text(
            json.dumps({"library_root": str(library.root), "library_id": library.manifest["id"]})
        )
        library.close()
        uvicorn.run(
            create_app(port=8767, preferences=preferences),
            host="127.0.0.1",
            port=8767,
            log_level="warning",
        )


if __name__ == "__main__":
    main()
