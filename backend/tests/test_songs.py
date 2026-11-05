import base64
import hashlib
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.directory_picker import DirectoryPicker
from yt_beat_m.library import Library
from yt_beat_m.songs import SongFiles

AUDIO = base64.b64decode((Path(__file__).parent / "fixtures/tone.mp3.base64").read_text())


@pytest.fixture
def songs(tmp_path, monkeypatch):
    root = tmp_path / "collection"
    lib = Library.create(root)
    beat = str(uuid4())
    lib.safe_path("audio/beat.mp3").write_bytes(AUDIO)
    with lib.catalog() as c:
        c.execute(
            "INSERT INTO beats(id,title,audio_path,added_at) VALUES(?,?,?,?)",
            (beat, "Prod", "audio/beat.mp3", "2026-01-01"),
        )
    lib.close()
    chosen = tmp_path / "Été d'hiver.mp3"
    chosen.write_bytes(AUDIO)
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(chosen))
    prefs = tmp_path / "config/preferences.json"
    with TestClient(
        create_app(preferences=prefs, frontend=tmp_path / "dist"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert client.post("/api/library", headers=headers, json={"path": str(root)}).is_success
        yield client, headers, beat, chosen, root, prefs


def create(client, headers, **fields):
    selected = client.post("/api/songs/pick-file", headers=headers).json()["selection"]
    return client.post(
        "/api/songs",
        headers=headers,
        json={
            "title": "Mon son",
            "state": "Maquette",
            "selection_id": selected["selection_id"],
            **fields,
        },
    )


def summary(song):
    """Long editable text belongs to song details, not paginated gallery payloads."""
    return {k: v for k, v in song.items() if k not in {"notes", "lyrics"}}


def test_persisted_external_file_relations_and_partial_edits(songs):
    c, h, beat, file, root, prefs = songs
    before = hashlib.sha256(file.read_bytes()).hexdigest()
    first = create(c, h, beat_id=beat, created_on="2026-11-01").json()
    second = create(c, h, beat_id=beat).json()
    assert first["id"] != second["id"] and first["file_available"]
    assert first["created_on"] == "2026-11-01" and first["released_on"] is None
    assert c.get(f"/api/beats/{beat}/songs").json()["total"] == 2
    assert c.get("/api/songs?limit=1").json()["total"] == 2
    changed = c.patch(
        f"/api/songs/{first['id']}",
        headers=h,
        json={"expected_revision": 1, "state": "Out", "favorite": True, "beat_id": None},
    )
    assert changed.status_code == 200 and changed.json()["title"] == "Mon son"
    assert c.get(f"/api/beats/{beat}/songs").json()["total"] == 1
    stale = c.patch(
        f"/api/songs/{first['id']}",
        headers=h,
        json={"expected_revision": 1, "title": "Écrasé"},
    )
    assert stale.status_code == 409
    bad = c.patch(
        f"/api/songs/{first['id']}",
        headers=h,
        json={"expected_revision": 2, "title": "Écrasé", "beat_id": str(uuid4())},
    )
    assert bad.status_code == 400
    assert c.get(f"/api/songs/{first['id']}").json() == changed.json()
    assert hashlib.sha256(file.read_bytes()).hexdigest() == before
    assert str(file).encode() not in (root / "catalog.sqlite3").read_bytes()
    assert str(file).encode() in prefs.with_name("song-files.sqlite3").read_bytes()
    c.post("/api/library/close", headers=h)
    with TestClient(
        create_app(preferences=prefs, frontend=root / "dist"),
        base_url="http://127.0.0.1:8765",
    ) as restarted:
        assert restarted.get(f"/api/songs/{first['id']}").json()["file_available"]
        assert restarted.get(first["audio_url"]).content == AUDIO


def test_audio_range_reveal_absence_and_reconnect(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    song = create(c, h, beat_id=beat).json()
    url = song["audio_url"]
    assert c.get(url).content == AUDIO
    partial = c.get(url, headers={"Range": "bytes=1-9"})
    assert partial.status_code == 206 and partial.content == AUDIO[1:10]
    assert c.get(url, headers={"Range": "bytes=99999999-"}).status_code == 416
    reveals = []
    monkeypatch.setattr("yt_beat_m.app.reveal_file", reveals.append)
    assert c.post(f"/api/songs/{song['id']}/reveal", headers=h).is_success
    assert reveals == [file]
    file.unlink()
    assert c.get(url).status_code == 404
    assert not c.get(f"/api/songs/{song['id']}").json()["file_available"]
    file.write_bytes(AUDIO)
    grant = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    relinked = c.patch(
        f"/api/songs/{song['id']}",
        headers=h,
        json={"expected_revision": 1, "selection_id": grant["selection_id"]},
    )
    assert relinked.status_code == 200 and relinked.json()["id"] == song["id"]
    assert relinked.json()["beat_id"] == beat and c.get(url).content == AUDIO


def test_only_explicit_native_selections_are_granted(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    assert c.post("/api/songs/pick-file").status_code == 403
    assert c.post("/api/songs", headers=h, json={"title": "x", "state": "Out"}).status_code == 422
    assert (
        c.post(
            "/api/songs",
            headers=h,
            json={"title": "x", "state": "Out", "selection_id": str(uuid4()), "path": str(file)},
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/api/songs",
            headers=h,
            json={"title": "x", "state": "Out", "selection_id": str(uuid4())},
        ).status_code
        == 400
    )
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: None)
    assert c.post("/api/songs/pick-file", headers=h).json() == {"selection": None}
    link = file.with_name("alias.mp3")
    link.symlink_to(file)
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(link))
    assert c.post("/api/songs/pick-file", headers=h).status_code == 400
    bad = file.with_name("not-audio.mp3")
    bad.write_text("not an mp3")
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(bad))
    assert c.post("/api/songs/pick-file", headers=h).status_code == 400
    assert c.get("/api/songs").json()["total"] == 0


def test_grants_expire_are_library_bound_and_detect_replacement(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    grant = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    replacement = file.with_name("new.mp3")
    replacement.write_bytes(AUDIO)
    replacement.replace(file)
    payload = {"title": "x", "state": "Topline", "selection_id": grant["selection_id"]}
    assert c.post("/api/songs", headers=h, json=payload).status_code == 400
    grant = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    payload["selection_id"] = grant["selection_id"]
    moment = time.monotonic()
    with monkeypatch.context() as patch:
        patch.setattr("yt_beat_m.songs.time.monotonic", lambda: moment + 301)
        assert c.post("/api/songs", headers=h, json=payload).status_code == 400
    other = root.with_name("other")
    assert c.post("/api/library", headers=h, json={"path": str(other), "create": True}).is_success
    assert c.post("/api/songs", headers=h, json=payload).status_code == 400


def test_internal_relative_file_survives_library_move(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    internal = root / "audio/beat.mp3"
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(internal))
    song = create(c, h).json()
    c.post("/api/library/close", headers=h)
    moved = root.with_name("déplacée")
    shutil.move(str(root), moved)
    assert c.post("/api/library", headers=h, json={"path": str(moved)}).is_success
    assert c.get(song["audio_url"]).content == AUDIO
    c.post("/api/library/close", headers=h)
    # Another machine/config has the portable metadata but no external bindings.
    with TestClient(
        create_app(preferences=prefs.with_name("other.json")),
        base_url="http://127.0.0.1:8765",
    ) as fresh:
        auth = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": fresh.get("/api/session").json()["token"],
        }
        fresh.post("/api/library", headers=auth, json={"path": str(moved)})
        assert fresh.get(song["audio_url"]).content == AUDIO


def test_invalid_patch_and_failed_binding_preserve_song(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    song = create(c, h).json()
    grant = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    with monkeypatch.context() as patch:

        def fail(self):
            raise OSError("disk unavailable")

        patch.setattr(SongFiles, "connect", fail)
        assert (
            c.patch(
                f"/api/songs/{song['id']}",
                headers=h,
                json={
                    "expected_revision": 1,
                    "selection_id": grant["selection_id"],
                    "title": "bad",
                },
            ).status_code
            == 400
        )
    assert c.get(f"/api/songs/{song['id']}").json() == song
    for fields in [{"state": None}, {"selection_id": None}, {"title": None}]:
        assert (
            c.patch(
                f"/api/songs/{song['id']}",
                headers=h,
                json={"expected_revision": 1, **fields},
            ).status_code
            == 400
        )
    assert c.patch(f"/api/songs/{song['id']}", json={"expected_revision": 1}).status_code == 403
    assert c.post(f"/api/songs/{song['id']}/reveal").status_code == 403


def test_schema6_migration_backup_and_failure(tmp_path, monkeypatch):
    migrations = storage.MIGRATIONS
    with monkeypatch.context() as patch:
        patch.setattr(storage, "MIGRATIONS", {k: v for k, v in migrations.items() if k <= 6})
        lib = Library.create(tmp_path / "old")
        lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
        with lib.catalog() as c:
            c.execute(
                "INSERT INTO beats(id,title,audio_path,added_at) VALUES(?,?,?,?)",
                (str(uuid4()), "Original", "audio/kept.mp3", "2026-01-01"),
            )
        lib.close()
    bad = tmp_path / "bad.sql"
    bad.write_text(migrations[7].read_text() + "\nINSERT INTO nonexistent VALUES(1);\n")
    with monkeypatch.context() as patch:
        patch.setattr(storage, "MIGRATIONS", {**migrations, 7: bad})
        with pytest.raises(storage.LibraryError):
            Library.open(lib.root)
    with sqlite3.connect(lib.root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 6
        assert not c.execute("SELECT 1 FROM sqlite_master WHERE name='songs'").fetchone()
    reopened = Library.open(lib.root)
    assert reopened.summary()["schema_version"] == max(storage.MIGRATIONS)
    assert reopened.safe_path("audio/kept.mp3").read_bytes() == AUDIO
    assert reopened.summary()["beat_count"] == 1
    backups = list((lib.root / "backups").glob("*.sqlite3"))
    assert backups
    reopened.close()
    Library.open(lib.root).close()


def test_mp3_picker_uses_fixed_native_command(monkeypatch):
    def run(args, **kwargs):
        assert args[:2] == ["/usr/bin/osascript", "-e"]
        assert "choose file" in args[2] and "public.mp3" in args[2]
        assert "shell" not in kwargs
        return subprocess.CompletedProcess(args, 0, "\n", "")

    monkeypatch.setattr(subprocess, "run", run)
    assert DirectoryPicker("darwin", audio=True).choose() is None


def test_external_reference_is_not_portable_and_cannot_follow_symlinks(songs, monkeypatch):
    c, h, beat, file, root, prefs = songs
    song = create(c, h).json()
    alternate = file.with_name("original.mp3")
    file.rename(alternate)
    file.symlink_to(alternate)
    assert c.get(song["audio_url"]).status_code == 404
    assert not c.get(f"/api/songs/{song['id']}").json()["file_available"]
    c.post("/api/library/close", headers=h)
    with TestClient(
        create_app(preferences=prefs.with_name("new-machine.json")),
        base_url="http://127.0.0.1:8765",
    ) as fresh:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": fresh.get("/api/session").json()["token"],
        }
        fresh.post("/api/library", headers=headers, json={"path": str(root)})
        assert fresh.get(f"/api/songs/{song['id']}").json()["id"] == song["id"]
        assert fresh.get(song["audio_url"]).status_code == 404


def test_grant_not_consumed_on_failed_metadata_and_new_binding_not_published(songs):
    c, h, beat, file, root, prefs = songs
    grant = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    body = {"title": "Morceau", "state": "Mixage", "selection_id": grant["selection_id"]}
    assert (
        c.post("/api/songs", headers=h, json={**body, "beat_id": str(uuid4())}).status_code == 400
    )
    assert c.get("/api/songs").json()["total"] == 0
    with sqlite3.connect(prefs.with_name("song-files.sqlite3")) as db:
        assert db.execute("SELECT count(*) FROM files").fetchone()[0] == 0
    assert c.post("/api/songs", headers=h, json=body).is_success
    assert c.post("/api/songs", headers=h, json=body).status_code == 400


def test_song_search_filters_pagination_and_inherited_cover(songs):
    c, h, beat, file, root, _ = songs
    a = create(c, h, title="Été calme", beat_id=beat, favorite=True, state="Out").json()
    b = create(c, h, title="Nuit", state="Mixage").json()
    assert c.get("/api/songs?q=ete&favorites=true&state=Out&linked=true").json()["songs"] == [
        summary(a)
    ]
    assert c.get("/api/songs?linked=false&limit=1").json()["songs"] == [summary(b)]
    assert c.get("/api/songs?state=Out&linked=false").json()["total"] == 0
    assert c.get("/api/songs?sort=unknown").status_code == 400
    assert c.get("/api/songs?state=unknown").status_code == 422
    assert c.get("/api/songs?profile_id=not-a-uuid").status_code == 422
    page = c.get("/api/songs?sort=added_asc&limit=1").json()
    assert page["total"] == 2 and page["songs"][0]["id"] == a["id"]
    assert c.get("/api/songs?sort=added_asc&offset=1").json()["songs"][0]["id"] == b["id"]
    assert a["beat_title"] == "Prod" and a["artwork_url"] is None
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        db.execute(
            "UPDATE beats SET title='Nouvelle prod',artwork_path='artwork/cover.jpg' WHERE id=?",
            (beat,),
        )
    updated = c.get(f"/api/songs/{a['id']}").json()
    assert updated["beat_title"] == "Nouvelle prod"
    assert updated["artwork_url"] == f"/api/beats/{beat}/artwork"
    profile = str(uuid4())
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        db.execute(
            "INSERT INTO beatmaker_profiles(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (profile, "Nova", "2026-01-01", "2026-01-01"),
        )
        db.execute("INSERT INTO beat_profile_links VALUES(?,?,0)", (beat, profile))
    assert c.get(f"/api/songs?profile_id={profile}").json()["total"] == 1
    assert c.get(f"/api/songs?profile_id={uuid4()}").json()["total"] == 0
    file.unlink()
    assert c.get("/api/songs?available=true").json()["total"] == 0
    missing = c.get("/api/songs?available=false&limit=1&offset=1").json()
    assert missing["total"] == 2 and len(missing["songs"]) == 1
    assert not missing["songs"][0]["file_available"]
