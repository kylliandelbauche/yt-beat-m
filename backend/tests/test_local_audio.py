import base64
import hashlib
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from mutagen.id3 import APIC, TIT2
from mutagen.mp3 import MP3
from yt_beat_m.app import create_app


@pytest.fixture
def collection(tmp_path):
    root = tmp_path / "Prods été"
    with TestClient(
        create_app(frontend=tmp_path / "dist", preferences=tmp_path / "preferences.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert (
            client.post(
                "/api/library", json={"path": str(root), "create": True}, headers=headers
            ).status_code
            == 200
        )
        audio = root / "audio" / "L'idée d'été.mp3"
        encoded = (Path(__file__).parent / "fixtures" / "tone.mp3.base64").read_text()
        audio.write_bytes(base64.b64decode(encoded))
        yield client, headers, audio


def test_index_and_range_playback_preserve_original(collection):
    client, headers, audio = collection
    before = hashlib.sha256(audio.read_bytes()).digest()
    assert client.post("/api/library/scan").status_code == 403
    result = client.post("/api/library/scan", headers=headers).json()
    assert result["added"] == 1 and result["errors"] == []
    assert client.post("/api/library/scan", headers=headers).json()["skipped"] == 1
    page = client.get("/api/beats").json()
    assert page["total"] == 1
    beat = page["beats"][0]
    assert beat["title"] == "L'idée d'été"
    assert beat["artwork_url"] is None
    assert beat["duration_seconds"] == pytest.approx(1, abs=0.1)
    full = client.get(beat["audio_url"])
    assert full.status_code == 200 and full.content == audio.read_bytes()
    assert full.headers["content-type"] == "audio/mpeg"
    part = client.get(beat["audio_url"], headers={"Range": "bytes=10-29"})
    assert part.status_code == 206 and part.content == full.content[10:30]
    assert part.headers["content-range"] == f"bytes 10-29/{len(full.content)}"
    assert client.get(beat["audio_url"], headers={"Range": "bytes=999999-"}).status_code == 416
    assert client.get(f"/api/beats/{uuid4()}/audio").status_code == 404
    assert hashlib.sha256(audio.read_bytes()).digest() == before
    audio.unlink()
    assert client.get(beat["audio_url"]).status_code == 404


def test_bad_mp3_does_not_block_other_files_and_pagination(collection):
    client, headers, audio = collection
    (audio.parent / "broken.mp3").write_bytes(b"not audio")
    (audio.parent / "second.mp3").write_bytes(audio.read_bytes())
    result = client.post("/api/library/scan", headers=headers).json()
    assert result["added"] == 2
    assert result["errors"][0]["name"] == "broken.mp3"
    first = client.get("/api/beats?limit=1").json()
    second = client.get("/api/beats?limit=1&offset=1").json()
    assert first["total"] == second["total"] == 2
    assert first["beats"][0]["id"] != second["beats"][0]["id"]
    assert client.get("/api/beats?limit=1000").status_code == 422


def test_embedded_title_and_artwork_are_local(collection):
    client, headers, audio = collection
    picture = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII="
    )
    tags = MP3(audio)
    tags.tags.add(TIT2(encoding=3, text="Titre intégré"))
    tags.tags.add(APIC(encoding=3, mime="image/png", type=3, desc="Cover", data=picture))
    tags.save()
    client.post("/api/library/scan", headers=headers)
    beat = client.get("/api/beats").json()["beats"][0]
    assert beat["title"] == "Titre intégré"
    response = client.get(beat["artwork_url"])
    assert response.status_code == 200 and response.content == picture
    assert response.headers["content-type"] == "image/png"


def test_symlink_mp3_is_not_indexed(collection, tmp_path):
    client, headers, audio = collection
    outside = tmp_path / "private.mp3"
    outside.write_bytes(audio.read_bytes())
    try:
        (audio.parent / "linked.mp3").symlink_to(outside)
    except OSError:
        pytest.skip("Liens symboliques non autorisés sur ce poste.")
    result = client.post("/api/library/scan", headers=headers).json()
    assert result["added"] == 1
    assert [item["name"] for item in result["errors"]] == ["linked.mp3"]


def test_listing_requires_an_open_library(tmp_path):
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "preferences.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        assert client.get("/api/beats").status_code == 400


def test_reveal_is_session_protected_and_uses_catalogue_path(collection, monkeypatch):
    client, headers, audio = collection
    calls = []
    monkeypatch.setattr("yt_beat_m.app.reveal_file", calls.append)
    client.post("/api/library/scan", headers=headers)
    beat = client.get("/api/beats").json()["beats"][0]
    url = f"/api/beats/{beat['id']}/reveal"
    assert client.post(url).status_code == 403
    assert client.post(url, headers={"Origin": headers["Origin"]}).status_code == 403
    assert (
        client.post(url, headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    )
    assert calls == []
    assert client.post(url, headers=headers, json={"path": "/other.mp3"}).json() == {
        "revealed": True
    }
    assert calls == [audio.resolve()]
    assert client.post(f"/api/beats/{uuid4()}/reveal", headers=headers).status_code == 404
    assert client.post("/api/beats/not-a-uuid/reveal", headers=headers).status_code == 422
    audio.unlink()
    result = client.post(url, headers=headers)
    assert result.status_code == 404
    assert "disque" in result.json()["detail"]
    assert calls == [audio.resolve()]


def test_reveal_follows_library_after_move_and_recovers_from_disconnect(collection, monkeypatch):
    client, headers, audio = collection
    calls = []
    monkeypatch.setattr("yt_beat_m.app.reveal_file", calls.append)
    client.post("/api/library/scan", headers=headers)
    beat = client.get("/api/beats").json()["beats"][0]
    url = f"/api/beats/{beat['id']}/reveal"
    root = audio.parent.parent
    moved = root.with_name("Disque été déplacé")
    client.post("/api/library/close", headers=headers)
    root.rename(moved)
    assert (
        client.post("/api/library", headers=headers, json={"path": str(moved)}).status_code == 200
    )
    assert client.post(url, headers=headers).status_code == 200
    assert calls == [moved / "audio" / audio.name]
    manifest = moved / "library.json"
    disconnected = moved / "library.disconnected"
    manifest.rename(disconnected)
    assert client.post(url, headers=headers).status_code == 400
    disconnected.rename(manifest)
    assert client.post(url, headers=headers).status_code == 200
    assert len(calls) == 2


def test_reveal_rejects_tampered_paths_and_symlinks(collection, monkeypatch, tmp_path):
    from yt_beat_m.library import Library

    client, headers, audio = collection
    calls = []
    monkeypatch.setattr("yt_beat_m.app.reveal_file", calls.append)
    client.post("/api/library/scan", headers=headers)
    beat = client.get("/api/beats").json()["beats"][0]
    url = f"/api/beats/{beat['id']}/reveal"
    root = audio.parent.parent
    client.post("/api/library/close", headers=headers)
    library = Library.open(root)
    try:
        with library.catalog() as connection:
            connection.execute(
                "UPDATE beats SET audio_path=? WHERE id=?", ("../private.mp3", beat["id"])
            )
    finally:
        library.close()
    client.post("/api/library", headers=headers, json={"path": str(root)})
    assert client.post(url, headers=headers).status_code == 400
    assert calls == []
    client.post("/api/library/close", headers=headers)
    library = Library.open(root)
    try:
        with library.catalog() as connection:
            connection.execute(
                "UPDATE beats SET audio_path=? WHERE id=?", (f"audio/{audio.name}", beat["id"])
            )
    finally:
        library.close()
    outside = tmp_path / "private.mp3"
    audio.rename(outside)
    try:
        audio.symlink_to(outside)
    except OSError:
        pytest.skip("Liens symboliques non autorisés sur ce poste.")
    client.post("/api/library", headers=headers, json={"path": str(root)})
    assert client.post(url, headers=headers).status_code == 400
    assert calls == []
