import base64
import json
import sqlite3
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import imports
from yt_beat_m.app import create_app
from yt_beat_m.import_process import ImportInterrupted, ProcessRunner
from yt_beat_m.import_source import source_metadata, youtube_source
from yt_beat_m.imports import ImportWorker, digest
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.library_manager import LibraryManager

VIDEO = "abcdefghijk"
URL = f"https://www.youtube.com/watch?v={VIDEO}"


def metadata():
    return {
        "id": VIDEO,
        "title": "Test beat — 140 BPM",
        "duration": 1,
        "channel": "Source channel",
        "upload_date": "20250312",
        "description": "Key: F# minor\nhttps://artist.beatstars.com/beat/123",
    }


class FakeRunner:
    def __init__(self):
        self.calls = []
        self.started = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def cancel(self):
        self.release.set()

    def run(self, args, on_line=None, *, timeout=600):
        self.calls.append(args)
        if "--dump-single-json" in args:
            return json.dumps(metadata())
        if args[0] == "ffprobe":
            return '{"format":{"duration":"1.045"}}'
        self.started.set()
        if not self.release.wait(3):
            raise ImportInterrupted
        template = args[args.index("-o") + 1]
        audio = base64.b64decode((Path(__file__).parent / "fixtures/tone.mp3.base64").read_text())
        Path(template.replace("%(ext)s", "mp3")).write_bytes(audio)
        if on_line:
            on_line("BEAT_PROGRESS: 32.5%")
            on_line("BEAT_STAGE:converting")
        return ""


@pytest.fixture
def worker(tmp_path, monkeypatch):
    monkeypatch.setattr(imports.shutil, "which", lambda name: name)
    library = Library.create(tmp_path / "library")
    worker = ImportWorker(library, runner=FakeRunner())
    yield worker
    worker.stop()
    library.close()


@pytest.mark.parametrize(
    "url",
    [
        URL,
        f"https://youtu.be/{VIDEO}?si=x",
        f"https://m.youtube.com/watch?v={VIDEO}&list=PLtest",
        f"https://youtube.com/shorts/{VIDEO}",
    ],
)
def test_canonical_video_urls(url):
    assert youtube_source(url) == (VIDEO, URL)


@pytest.mark.parametrize(
    "url",
    [
        "https://localhost/video",
        "https://youtube.com.evil.test/watch?v=abcdefghijk",
        "https://user@youtube.com/watch?v=abcdefghijk",
        "file:///etc/passwd",
        "https://youtube.com:8080/watch?v=abcdefghijk",
        "https://youtu.be/short",
        "https://youtube.com/playlist?list=PLtest",
        "https://youtube.com/watch?v=abcdefghijk&v=lmnopqrstuv",
    ],
)
def test_rejects_non_video_sources(url):
    with pytest.raises(LibraryError):
        youtube_source(url)


def test_metadata_is_explicit_and_does_not_invent_dates():
    parsed = source_metadata(metadata(), VIDEO)
    assert parsed["bpm"] == 140
    assert parsed["musical_key"] == "F# minor"
    assert parsed["published_on"] == "2025-03-12"
    ambiguous = {**metadata(), "title": "Beat 140 BPM / 70 BPM", "upload_date": "unknown"}
    assert source_metadata(ambiguous, VIDEO)["bpm"] is None
    assert source_metadata(ambiguous, VIDEO)["published_on"] is None
    with pytest.raises(LibraryError):
        source_metadata({**metadata(), "id": "wrong"}, VIDEO)
    with pytest.raises(LibraryError):
        source_metadata({**metadata(), "is_live": True}, VIDEO)


def test_success_and_source_deduplication(worker):
    result = worker.enqueue(URL)
    assert worker.enqueue(f"https://youtu.be/{VIDEO}")["duplicate"] is True
    worker.perform(result["job"])
    job = worker.jobs()[0]
    assert job["state"] == "completed"
    assert worker.enqueue(URL)["beat_id"] == job["beat_id"]
    assert worker.library.summary()["beat_count"] == 1
    with worker.library.catalog() as catalog:
        row = catalog.execute("SELECT * FROM beats").fetchone()
        assert row["beatmaker"] is None and row["channel"] == "Source channel"
        assert row["bpm"] == 140 and row["published_on"] == "2025-03-12"
        assert worker.library.safe_path(row["audio_path"]).is_file()
        assert catalog.execute("SELECT COUNT(*) FROM source_links").fetchone()[0] == 1
    assert not worker._staging(job["id"]).exists()
    assert "--no-plugin-dirs" in worker.runner.calls[0]
    assert "--no-playlist" in worker.runner.calls[0]


def test_publication_error_cleans_owned_files_and_allows_retry(worker, monkeypatch):
    original = worker.library.catalog

    class FailingCatalog:
        def __init__(self, connection):
            self.connection = connection

        def execute(self, query, *args):
            if query.startswith("INSERT INTO beats"):
                raise sqlite3.OperationalError("simulated disk failure")
            return self.connection.execute(query, *args)

    @contextmanager
    def failing():
        with original() as connection:
            yield FailingCatalog(connection)

    monkeypatch.setattr(worker.library, "catalog", failing)
    job = worker.enqueue(URL)["job"]
    worker.perform(job)
    assert worker.jobs()[0]["state"] == "failed"
    assert not worker.library.safe_path(f"audio/{job['id']}.mp3").exists()
    monkeypatch.setattr(worker.library, "catalog", original)
    retry = worker.enqueue(URL)["job"]
    assert retry["id"] != job["id"]
    worker.perform(retry)
    assert worker.library.summary()["beat_count"] == 1


def test_recovery_only_removes_unreferenced_owned_outputs(worker):
    job = worker.enqueue(URL)["job"]
    staging = worker._staging(job["id"])
    staging.mkdir()
    relative = f"audio/{job['id']}.mp3"
    final = worker.library.safe_path(relative)
    final.write_bytes(b"generated interrupted output")
    (staging / "publish.json").write_text(
        json.dumps([{"destination": relative, "sha256": digest(final)}])
    )
    recovered = ImportWorker(worker.library, runner=FakeRunner())
    assert recovered.jobs()[0]["state"] == "interrupted"
    assert not final.exists()
    ready = recovered.enqueue(URL)["job"]
    recovered.perform(ready)
    final = worker.library.safe_path(f"audio/{ready['id']}.mp3")
    staging = recovered._staging(ready["id"])
    staging.mkdir()
    (staging / "publish.json").write_text(
        json.dumps([{"destination": f"audio/{ready['id']}.mp3", "sha256": digest(final)}])
    )
    ImportWorker(worker.library, runner=FakeRunner())
    assert final.is_file() and worker.library.summary()["beat_count"] == 1


def test_missing_dependency_and_network_failure_are_recoverable(worker, monkeypatch):
    monkeypatch.setattr(imports.shutil, "which", lambda _: None)
    job = worker.enqueue(URL)["job"]
    worker.perform(job)
    assert "Dépendance absente" in worker.jobs()[0]["error_message"]
    monkeypatch.setattr(imports.shutil, "which", lambda name: name)

    def unavailable(*args, **kwargs):
        raise LibraryError("Vidéo indisponible")

    monkeypatch.setattr(worker.runner, "run", unavailable)
    worker.perform(worker.enqueue(URL)["job"])
    assert worker.library.summary()["beat_count"] == 0
    assert all(row["state"] == "failed" for row in worker.jobs())


def test_silent_process_timeout_is_bounded():
    runner = ProcessRunner(threading.Event())
    with pytest.raises(LibraryError, match="délai"):
        runner.run([sys.executable, "-c", "import time; time.sleep(60)"], timeout=0.15)
    assert runner._process is None


def test_active_worker_interruption_is_not_a_ready_beat(worker):
    worker.runner.release.clear()
    worker.enqueue(URL)
    worker.start()
    assert worker.runner.started.wait(2)
    worker.stop()
    assert worker.jobs()[0]["state"] == "interrupted"
    assert worker.library.summary()["beat_count"] == 0
    assert not list(worker.library.safe_path("staging").iterdir())


def test_failed_selection_preserves_preference_and_old_library_can_restart(tmp_path, monkeypatch):
    preferences = tmp_path / "preferences.json"
    manager = LibraryManager(preferences)
    old = tmp_path / "old"
    manager.select(str(old), create=True)
    saved = preferences.read_text()
    other = Library.create(tmp_path / "other")
    other.close()
    replace = Path.replace

    def fail_preference(path, target):
        if path.name.startswith("preferences-"):
            raise OSError("preference write failed")
        return replace(path, target)

    monkeypatch.setattr(Path, "replace", fail_preference)
    try:
        with pytest.raises(OSError):
            manager.select(str(other.root))
        assert preferences.read_text() == saved
        manager.select(str(old))
        assert not manager.worker.stopping.is_set()
        reopened = Library.open(other.root)
        reopened.close()
    finally:
        manager.close()


def test_recovery_does_not_delete_a_replaced_final_file(worker):
    job = worker.enqueue(URL)["job"]
    staging = worker._staging(job["id"])
    staging.mkdir()
    relative = f"audio/{job['id']}.mp3"
    final = worker.library.safe_path(relative)
    final.write_bytes(b"original generated output")
    checksum = digest(final)
    (staging / "publish.json").write_text(
        json.dumps(
            [
                {"destination": relative, "sha256": checksum},
            ]
        )
    )
    final.write_bytes(b"a replacement the worker must preserve")
    ImportWorker(worker.library, runner=FakeRunner())
    assert final.read_bytes() == b"a replacement the worker must preserve"


def test_api_remains_responsive_and_worker_stops_before_library_close(tmp_path, monkeypatch):
    fake = FakeRunner()
    fake.release.clear()
    monkeypatch.setattr(imports.shutil, "which", lambda name: name)
    monkeypatch.setattr(
        ProcessRunner, "run", lambda self, *args, **kwargs: fake.run(*args, **kwargs)
    )
    root = tmp_path / "library"
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "prefs.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        client.post("/api/library", json={"path": str(root), "create": True}, headers=headers)
        assert client.post("/api/imports", json={"url": URL}).status_code == 403
        assert (
            client.post(
                "/api/imports", json={"url": "file:///etc/passwd"}, headers=headers
            ).status_code
            == 400
        )
        assert client.post("/api/imports", json={"url": URL}, headers=headers).status_code == 200
        assert fake.started.wait(2)
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/library").json()["library"]["beat_count"] == 0
        assert (
            client.post("/api/imports", json={"url": URL}, headers=headers).json()["duplicate"]
            is True
        )
        fake.release.set()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = client.get("/api/imports").json()["jobs"][0]
            if job["state"] == "completed":
                break
            time.sleep(0.02)
        assert job["state"] == "completed"
        assert client.get("/api/beats").json()["total"] == 1
    reopened = Library.open(root)
    reopened.close()
