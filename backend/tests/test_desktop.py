"""Real process checks for the desktop engine's ownership and lifetime contract."""

import base64
import hashlib
import http.client
import json
import os
import queue
import socket
import subprocess
import sys
import threading
from pathlib import Path
from uuid import UUID

import pytest
from yt_beat_m.library import Library

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("frozen", [False, True])
def test_owned_port_origin_audio_persistence_and_pipe_shutdown(tmp_path, frozen):
    binary = os.environ.get("BEAT_M_TEST_ENGINE")
    if frozen and not binary:
        pytest.skip("Set BEAT_M_TEST_ENGINE to verify the packaged engine too")
    library = Library.create(tmp_path / "collection", "Desktop test")
    audio = base64.b64decode((ROOT / "backend/tests/fixtures/long-tone.mp3.base64").read_text())
    identity = str(UUID(int=1))
    media = library.safe_path("audio/test.mp3")
    media.write_bytes(audio)
    with library.catalog() as c:
        c.execute(
            "INSERT INTO beats(id,title,audio_path,added_at) VALUES(?,?,?,?)",
            (identity, "Desktop test", "audio/test.mp3", "2026-01-01T00:00:00Z"),
        )
    preferences = tmp_path / "preferences.json"
    preferences.write_text(
        json.dumps({"library_root": str(library.root), "library_id": library.manifest["id"]})
    )
    library.close()
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / "index.html").write_text("<!doctype html><title>Desktop test</title>")

    def start():
        args = (
            [binary]
            if frozen
            else [
                sys.executable,
                "-c",
                "import asyncio,sys; from pathlib import Path; "
                "from yt_beat_m.desktop import serve; "
                "asyncio.run(serve(Path(sys.argv[1]),Path(sys.argv[2])))",
                str(preferences),
                str(frontend),
            ]
        )
        process = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=ROOT,
            env={**os.environ, "PATH": minimal_path()} if frozen else None,
        )
        try:
            if frozen:
                process.stdin.write((json.dumps({"preferences": str(preferences)}) + "\n").encode())
                process.stdin.flush()
            lines = queue.Queue()
            threading.Thread(
                target=lambda: lines.put(process.stdout.readline()), daemon=True
            ).start()
            ready = json.loads(lines.get(timeout=20))
            return process, ready["port"]
        except BaseException:
            process.kill()
            process.communicate()
            raise

    def request(port, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            return response.status, response.read(), response.getheaders()
        finally:
            connection.close()

    # Keep another listener alive: starting the desktop must neither attach to it
    # nor stop it, even when other local engines already exist.
    with socket.socket() as other:
        other.bind(("127.0.0.1", 0))
        other.listen()
        for expected_favorite in (False, True):
            process, port = start()
            try:
                assert port != other.getsockname()[1]
                assert request(port, "GET", "/api/health")[0] == 200
                assert request(port, "GET", "/")[0] == 200
                assert request(port, "GET", "/api/session", headers={"Host": "evil.test"})[0] == 400
                assert (
                    request(port, "GET", "/api/session", headers={"Origin": "https://evil.test"})[0]
                    == 403
                )
                status, body, _ = request(port, "GET", f"/api/beats/{identity}")
                assert status == 200
                assert json.loads(body)["favorite"] is expected_favorite
                status, body, headers = request(
                    port,
                    "GET",
                    f"/api/beats/{identity}/audio",
                    headers={"Range": "bytes=32-63"},
                )
                assert status == 206 and body == audio[32:64]
                assert dict(headers)["content-range"].startswith("bytes 32-63/")
                _, session, _ = request(port, "GET", "/api/session")
                origin = f"http://127.0.0.1:{port}"
                token = json.loads(session)["token"]
                assert (
                    request(
                        port,
                        "PATCH",
                        f"/api/beats/{identity}/favorite",
                        '{"favorite":true}',
                        {"Origin": origin, "Content-Type": "application/json"},
                    )[0]
                    == 403
                )
                assert (
                    request(
                        port,
                        "PATCH",
                        f"/api/beats/{identity}/favorite",
                        '{"favorite":true}',
                        {
                            "Origin": origin,
                            "Content-Type": "application/json",
                            "X-Session-Token": token,
                        },
                    )[0]
                    == 200
                )
            finally:
                process.stdin.close()
                try:
                    assert process.wait(timeout=15) == 0
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.stdout.close()
                    process.stderr.close()
            with socket.socket() as probe:
                assert probe.connect_ex(("127.0.0.1", port)) != 0
        assert hashlib.sha256(media.read_bytes()).digest() == hashlib.sha256(audio).digest()


def test_frozen_downloader_dispatch():
    binary = os.environ.get("BEAT_M_TEST_ENGINE")
    if not binary:
        pytest.skip("Set BEAT_M_TEST_ENGINE to verify the packaged downloader")
    from importlib.metadata import version

    result = subprocess.run(
        [binary, "-m", "yt_dlp", "--ignore-config", "--no-plugin-dirs", "--version"],
        env={**os.environ, "PATH": minimal_path()},
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
    )
    assert result.stdout.strip() == version("yt-dlp")


def minimal_path():
    if os.name == "nt":
        system = Path(os.environ["SystemRoot"])
        return os.pathsep.join((str(system / "System32"), str(system)))
    return "/usr/bin:/bin"
