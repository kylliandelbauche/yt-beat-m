"""Persistent single-worker imports; staged files are published with their catalogue row."""

import hashlib
import json
import math
import re
import shutil
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from yt_beat_m.audio_filename import audio_filename
from yt_beat_m.beatmakers import propose
from yt_beat_m.import_process import ImportInterrupted, ProcessRunner
from yt_beat_m.import_source import source_metadata, youtube_source
from yt_beat_m.library import Library, LibraryError


def now() -> str:
    return datetime.now(UTC).isoformat()


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class ImportWorker:
    def __init__(self, library: Library, runner=None):
        self.library = library
        self.stopping = threading.Event()
        self.runner = runner if runner is not None else ProcessRunner(self.stopping)
        self.photo_runner = ProcessRunner(self.stopping)
        self._photo_thread: threading.Thread | None = None
        self._thread: threading.Thread | None = None
        self._recover()

    def start(self):
        self._thread = threading.Thread(target=self._loop, daemon=True, name="beat-import")
        self._thread.start()
        self._photo_thread = threading.Thread(
            target=self._photos, daemon=True, name="beat-portraits"
        )
        self._photo_thread.start()

    def stop(self):
        self.stopping.set()
        self.runner.cancel()
        self.photo_runner.cancel()
        if self._photo_thread:
            self._photo_thread.join(timeout=12)
            if self._photo_thread.is_alive():
                raise LibraryError(
                    "Un portrait se termine encore ; attends avant de fermer le disque."
                )
        if self._thread:
            self._thread.join(timeout=12)
            if self._thread.is_alive():
                raise LibraryError(
                    "Un import se termine encore ; attendre avant de fermer le disque."
                )

    def enqueue(self, value: str) -> dict:
        identity, canonical = youtube_source(value)
        if self.stopping.is_set():
            raise LibraryError(
                "Le moteur d’import s’arrête. Rouvrir la bibliothèque pour continuer."
            )
        with self.library.catalog() as catalog:
            beat = catalog.execute(
                "SELECT id FROM beats WHERE youtube_id = ?", (identity,)
            ).fetchone()
            if beat:
                return {"job": None, "beat_id": beat[0], "duplicate": True}
            job = catalog.execute(
                "SELECT * FROM import_jobs WHERE youtube_id = ? AND state IN ('queued', 'running')",
                (identity,),
            ).fetchone()
            if job:
                return {"job": dict(job), "beat_id": None, "duplicate": True}
            job_id = str(uuid4())
            timestamp = now()
            catalog.execute(
                "INSERT INTO import_jobs(id, youtube_id, source_url, state, stage, "
                "created_at, updated_at) "
                "VALUES (?, ?, ?, 'queued', 'queued', ?, ?)",
                (job_id, identity, canonical, timestamp, timestamp),
            )
            row = catalog.execute("SELECT * FROM import_jobs WHERE id = ?", (job_id,)).fetchone()
            return {"job": dict(row), "beat_id": None, "duplicate": False}

    def jobs(self) -> list[dict]:
        with self.library.catalog() as catalog:
            rows = catalog.execute(
                "SELECT * FROM import_jobs ORDER BY created_at DESC, id DESC LIMIT 20"
            ).fetchall()
        return [dict(row) for row in rows]

    def _update(self, job_id, *, state="running", stage=None, progress=None, error=None):
        with self.library.catalog() as catalog:
            catalog.execute(
                "UPDATE import_jobs SET state=?, stage=?, progress=?, error_message=?, "
                "updated_at=? WHERE id=?",
                (state, stage, progress, error, now(), job_id),
            )

    def _loop(self):
        while not self.stopping.wait(0.2):
            try:
                with self.library.catalog() as catalog:
                    row = catalog.execute(
                        "SELECT * FROM import_jobs WHERE state='queued' "
                        "ORDER BY created_at, id LIMIT 1"
                    ).fetchone()
                if row:
                    self.perform(dict(row))

            except (LibraryError, OSError):
                # A disconnected disk is not a new empty library. Leave jobs for recovery.
                if self.stopping.wait(1):
                    break

    def _photos(self):
        from yt_beat_m.profile_photos import enrich_next_photo

        while not self.stopping.wait(1):
            try:
                enrich_next_photo(self.library, self.photo_runner)
            except ImportInterrupted:
                return
            except (LibraryError, OSError):
                if self.stopping.wait(1):
                    return

    def _staging(self, job_id: str) -> Path:
        UUID(job_id)
        return self.library.safe_path(f"staging/{job_id}")

    def _cleanup(self, job_id: str):
        staging = self._staging(job_id)
        marker = self.library.safe_path(f"staging/{job_id}/publish.json")
        if marker.is_file():
            try:
                outputs = json.loads(marker.read_text(encoding="utf-8"))
                if not isinstance(outputs, list):
                    raise ValueError
                with self.library.catalog() as catalog:
                    for output in outputs:
                        relative = output["destination"]
                        named_audio = (
                            isinstance(relative, str)
                            and relative.startswith(f"audio/{job_id}/")
                            and relative.count("/") == 2
                            and relative.endswith(".mp3")
                        )
                        if not named_audio and relative not in {
                            f"audio/{job_id}.mp3",
                            f"artwork/{job_id}.jpg",
                        }:
                            raise ValueError
                        path = self.library.safe_path(relative)
                        referenced = catalog.execute(
                            "SELECT id FROM beats WHERE audio_path=? OR artwork_path=?",
                            (relative, relative),
                        ).fetchone()
                        if not referenced and path.is_file() and digest(path) == output["sha256"]:
                            path.unlink()
            except (ValueError, TypeError, KeyError):
                pass  # Never delete a final file using an invalid ownership marker.
        if staging.is_dir():
            shutil.rmtree(staging)
        # Remove only an empty per-import folder; preserve any referenced or replaced media.
        try:
            self.library.safe_path(f"audio/{job_id}").rmdir()
        except OSError:
            pass

    def _recover(self):
        with self.library.catalog() as catalog:
            rows = catalog.execute("SELECT id, state FROM import_jobs").fetchall()
        for row in rows:
            self._cleanup(row["id"])
            if row["state"] in {"queued", "running"}:
                self._update(
                    row["id"],
                    state="interrupted",
                    stage="interrupted",
                    error="Import interrompu au dernier arrêt. Cliquer sur Réessayer.",
                )

    def perform(self, job: dict):
        job_id = job["id"]
        try:
            self._update(job_id, stage="extracting")
            for command in ("node", "ffmpeg", "ffprobe"):
                if not shutil.which(command):
                    raise LibraryError(
                        f"Dépendance absente : {command}. Consulter le diagnostic du moteur."
                    )
            staging = self._staging(job_id)
            staging.mkdir(exist_ok=False)
            base = [
                sys.executable,
                "-m",
                "yt_dlp",
                "--ignore-config",
                "--no-plugin-dirs",
                "--no-js-runtimes",
                "--js-runtimes",
                "node",
                "--no-playlist",
                "--no-warnings",
                "--no-colors",
                "--socket-timeout",
                "15",
                "--retries",
                "2",
                "--fragment-retries",
                "2",
            ]
            raw = self.runner.run(
                [*base, "--dump-single-json", "--skip-download", job["source_url"]], timeout=90
            )
            info = json.loads(raw)
            metadata = source_metadata(info, job["youtube_id"])
            info_path = self.library.safe_path(f"staging/{job_id}/source.info.json")
            info_path.write_text(raw, encoding="utf-8")
            self._update(job_id, stage="downloading")

            def progress(line):
                if line == "BEAT_STAGE:converting":
                    self._update(job_id, stage="converting")
                match = re.search(r"BEAT_PROGRESS:\s*(\d+(?:\.\d+)?)%", line)
                if match:
                    self._update(job_id, stage="downloading", progress=min(100, float(match[1])))

            self.runner.run(
                [
                    *base,
                    "--load-info-json",
                    str(info_path),
                    "--no-simulate",
                    "--ignore-errors",
                    "-f",
                    "bestaudio/best",
                    "-x",
                    "--audio-format",
                    "mp3",
                    "--audio-quality",
                    "192K",
                    "--max-filesize",
                    "100M",
                    "--write-thumbnail",
                    "--convert-thumbnails",
                    "jpg",
                    "--newline",
                    "--progress",
                    "--progress-delta",
                    "0.2",
                    "--progress-template",
                    "download:BEAT_PROGRESS:%(progress._percent_str)s",
                    "--print",
                    "post_process:BEAT_STAGE:converting",
                    "-o",
                    str(staging / "audio.%(ext)s"),
                ],
                on_line=progress,
            )
            self._update(job_id, stage="verifying")
            audio = self.library.safe_path(f"staging/{job_id}/audio.mp3")
            if not audio.is_file():
                raise LibraryError("Le téléchargement n’a pas produit de MP3 complet.")
            probe = self.runner.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "json",
                    str(audio),
                ],
                timeout=15,
            )
            duration = float(json.loads(probe)["format"]["duration"])
            if (
                not math.isfinite(duration)
                or duration <= 0
                or duration < metadata["expected_duration"] * 0.98 - 1
            ):
                raise LibraryError("Le MP3 reçu est vide ou incomplet. Réessayer l’import.")
            if self.stopping.is_set():
                raise ImportInterrupted
            thumbnail = self.library.safe_path(f"staging/{job_id}/audio.jpg")
            valid_cover = False
            if thumbnail.is_file() and thumbnail.stat().st_size <= 10 * 1024 * 1024:
                with thumbnail.open("rb") as stream:
                    valid_cover = stream.read(3) == b"\xff\xd8\xff"
            outputs = [
                {
                    "source": "audio.mp3",
                    "sha256": digest(audio),
                }
            ]
            if valid_cover:
                outputs.append(
                    {
                        "source": "audio.jpg",
                        "destination": f"artwork/{job_id}.jpg",
                        "sha256": digest(thumbnail),
                    }
                )
            self._publish(job, metadata, duration, outputs)
        except ImportInterrupted:
            self._cleanup(job_id)
            self._update(
                job_id,
                state="interrupted",
                stage="interrupted",
                error="Import interrompu. Cliquer sur Réessayer.",
            )
        except (LibraryError, OSError, ValueError, KeyError, TypeError) as exc:
            message = (
                str(exc)
                if isinstance(exc, LibraryError)
                else "Import impossible : vérifier le réseau, le disque et les dépendances."
            )
            # Remove temporary downloads first, so a full disk can persist the failure state.
            self._cleanup(job_id)
            self._update(job_id, state="failed", stage="failed", error=message)
        finally:
            self._cleanup(job_id)

    def _publish(self, job, metadata, duration, outputs):
        job_id = job["id"]
        # Keep a simultaneous local scan from claiming files before their catalogue row exists.
        with self.library.catalog() as catalog:
            beatmaker, beatmaker_source = propose(catalog, metadata)
            audio_path = f"audio/{job_id}/{audio_filename(beatmaker, metadata)}"
            outputs[0]["destination"] = audio_path
            # A private folder keeps identical readable names separate. Check all existing
            # targets before writing an ownership marker that could authorize cleanup.
            for output in outputs:
                if self.library.safe_path(output["destination"]).exists():
                    raise LibraryError(
                        "Un fichier cible existe déjà ; aucun fichier n’a été écrasé."
                    )
            self.library.safe_path(f"audio/{job_id}").mkdir(exist_ok=False)
            marker = self.library.safe_path(f"staging/{job_id}/publish.json")
            temporary = self.library.safe_path(f"staging/{job_id}/publish.tmp")
            temporary.write_text(json.dumps(outputs), encoding="utf-8")
            temporary.replace(marker)
            for output in outputs:
                source = self.library.safe_path(f"staging/{job_id}/{output['source']}")
                destination = self.library.safe_path(output["destination"])
                if destination.exists():
                    raise LibraryError(
                        "Un fichier cible existe déjà ; aucun fichier n’a été écrasé."
                    )
                source.replace(destination)
            catalog.execute(
                "INSERT INTO beats(id, youtube_id, source_url, title, channel, channel_id, "
                "beatmaker, "
                "duration_seconds, published_on, added_at, bpm, musical_key, "
                "audio_path, artwork_path, description, field_provenance) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    job_id,
                    job["youtube_id"],
                    job["source_url"],
                    metadata["title"],
                    metadata["channel"],
                    metadata["channel_id"],
                    beatmaker,
                    duration,
                    metadata["published_on"],
                    now(),
                    metadata["bpm"],
                    metadata["musical_key"],
                    audio_path,
                    f"artwork/{job_id}.jpg" if len(outputs) == 2 else None,
                    metadata["description"],
                    json.dumps(
                        {
                            "title": "youtube",
                            "beatmaker": beatmaker_source,
                            "bpm": "explicit_text" if metadata["bpm"] else None,
                            "musical_key": "explicit_text" if metadata["musical_key"] else None,
                        }
                    ),
                ),
            )
            for link in metadata["links"]:
                catalog.execute(
                    "INSERT INTO source_links(beat_id, url, label, provenance) VALUES (?, ?, ?, ?)",
                    (job_id, link, "Page de vente", "youtube_description"),
                )
            from yt_beat_m.profiles import sync_profiles

            sync_profiles(
                catalog, catalog.execute("SELECT * FROM beats WHERE id=?", (job_id,)).fetchone()
            )
            catalog.execute(
                "UPDATE import_jobs SET state='completed', stage='completed', progress=100, "
                "beat_id=?, updated_at=? WHERE id=?",
                (job_id, now(), job_id),
            )
