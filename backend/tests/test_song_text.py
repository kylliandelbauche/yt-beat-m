"""Independent plain text, common Save atomicity and safe v8→v9 migration."""

import json
import sqlite3
from contextlib import closing
from uuid import uuid4

import pytest
from test_songs import AUDIO, create, summary
from test_songs import songs as songs
from yt_beat_m import library as storage
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.songs import TEXT_LIMIT, SongFiles, get_song


def patch(c, h, song, **values):
    return c.patch(
        f"/api/songs/{song['id']}",
        headers={**h, "Content-Type": "application/json"},
        content=json.dumps({"expected_revision": song["revision"], **values}),
    )


def test_independent_text_and_partial_edits_persist_without_expanding_lists(songs):
    c, h, beat, file, root, _ = songs
    notes = "  Note libre\r\n\tDeuxième ligne\r\n\r\n"
    lyrics = "<script>window.untrusted = true</script>\n\n[Refrain]\nLigne 🙂"
    song = create(c, h, beat_id=beat, notes=notes, lyrics=lyrics).json()
    assert song["notes"] == notes.replace("\r\n", "\n") and song["lyrics"] == lyrics
    assert c.get("/api/songs").json()["songs"] == [summary(song)]
    assert c.get(f"/api/beats/{beat}/songs").json()["songs"] == [summary(song)]
    changed = patch(c, h, song, title="Nouveau", state="Out", new_tags=["Chant"], tag_ids=[]).json()
    assert changed["notes"] == song["notes"] and changed["lyrics"] == lyrics
    assert changed["tags"][0]["label"] == "Chant"
    cleared = patch(c, h, changed, notes="").json()
    assert cleared["notes"] == "" and cleared["lyrics"] == lyrics
    c.post("/api/library/close", headers=h)
    assert c.post("/api/library", headers=h, json={"path": str(root)}).is_success
    assert c.get(f"/api/songs/{song['id']}").json() == cleared
    assert file.read_bytes() == AUDIO and c.get(cleared["audio_url"]).content == AUDIO


@pytest.mark.parametrize("field", ["notes", "lyrics"])
def test_text_limits_match_utf16_and_failed_edits_preserve_every_field(songs, field):
    c, h, *_ = songs
    song = create(c, h, **{field: "a" * TEXT_LIMIT}).json()
    assert len(song[field]) == TEXT_LIMIT
    for invalid in [
        "a" * (TEXT_LIMIT + 1),
        "🙂" * (TEXT_LIMIT // 2 + 1),
        "bad\x00text",
        "\x07",
        "\x7f",
        "\ud800",
        None,
    ]:
        response = patch(c, h, song, title="Must stay unchanged", **{field: invalid})
        assert response.status_code == 422
        assert all(
            "input" not in error and "ctx" not in error for error in response.json()["detail"]
        )
        assert c.get(f"/api/songs/{song['id']}").json() == song
    emoji = patch(c, h, song, **{field: "🙂" * (TEXT_LIMIT // 2)}).json()
    assert len(emoji[field]) == TEXT_LIMIT // 2


def test_text_tags_revision_and_file_selection_are_one_atomic_save(songs):
    c, h, _, _, _, prefs = songs
    song = create(c, h, notes="Before", lyrics="Keep").json()
    selection = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    invalid = patch(
        c,
        h,
        song,
        title="Wrong",
        notes="Changed",
        lyrics="Changed too",
        tag_ids=[],
        new_tags=["Orphan", "bad\x00tag"],
        selection_id=selection["selection_id"],
    )
    assert invalid.status_code == 400
    assert c.get(f"/api/songs/{song['id']}").json() == song
    assert c.get("/api/catalog/tags").json()["tags"] == []
    with sqlite3.connect(prefs.with_name("song-files.sqlite3")) as db:
        assert db.execute("SELECT count(*) FROM files").fetchone()[0] == 1
    saved = patch(
        c,
        h,
        song,
        notes="Saved",
        lyrics="Saved too",
        tag_ids=[],
        new_tags=["Shared"],
        selection_id=selection["selection_id"],
    ).json()
    assert saved["notes"] == "Saved" and saved["lyrics"] == "Saved too"
    assert saved["tags"][0]["label"] == "Shared"
    assert patch(c, h, song, notes="Stale overwrite").status_code == 409
    assert c.get(f"/api/songs/{song['id']}").json() == saved
    for auth in [{}, {**h, "Origin": "https://elsewhere.example"}]:
        assert patch(c, auth, saved, notes="Forbidden").status_code == 403
    assert c.get(f"/api/songs/{song['id']}").json() == saved


def test_failed_creation_keeps_grant_and_creates_no_song(songs):
    c, h, *_ = songs
    selection = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    payload = {
        "title": "Draft",
        "state": "Topline",
        "selection_id": selection["selection_id"],
        "notes": "x" * (TEXT_LIMIT + 1),
        "lyrics": "Keep",
    }
    assert c.post("/api/songs", headers=h, json=payload).status_code == 422
    assert c.get("/api/songs").json()["total"] == 0
    good = c.post("/api/songs", headers=h, json={**payload, "notes": ""})
    assert good.is_success and good.json()["lyrics"] == "Keep"


def test_v8_migration_backup_rollback_and_portable_metadata(tmp_path, monkeypatch):
    root = tmp_path / "legacy"
    migrations = storage.MIGRATIONS
    identity = str(uuid4())
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {n: f for n, f in migrations.items() if n <= 8})
        with closing(Library.create(root)) as lib:
            lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
            with lib.catalog() as c:
                c.execute(
                    "INSERT INTO songs(id,title,state,added_at,audio_path,duration_seconds) "
                    "VALUES(?,?,?,?,?,?)",
                    (identity, "Kept", "Master", "2026-01-01", "audio/kept.mp3", 30),
                )
                c.execute("INSERT INTO catalog_tags VALUES(1,?,?)", ("Tag", "tag"))
                c.execute("INSERT INTO catalog_tag_names VALUES(?,1,1)", ("Tag",))
                c.execute("INSERT INTO song_catalog_tags VALUES(?,1,0)", (identity,))
    bad = tmp_path / "bad.sql"
    bad.write_text(migrations[9].read_text() + "\nINSERT INTO nonexistent VALUES(1);\n")
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {**migrations, 9: bad})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 8
        assert "notes" not in [r[1] for r in c.execute("PRAGMA table_info(songs)")]
        assert c.execute("SELECT count(*) FROM song_catalog_tags").fetchone()[0] == 1
    moved = root.with_name("moved")
    root.rename(moved)
    with closing(Library.open(moved)) as lib:
        song = get_song(lib, SongFiles(tmp_path / "registry.sqlite3"), identity)
        assert song["notes"] == song["lyrics"] == "" and song["title"] == "Kept"
        assert song["tags"][0]["id"] == 1 and song["file_available"]
        assert lib.safe_path("audio/kept.mp3").read_bytes() == AUDIO
        backup = next((moved / "backups").glob("catalog-v8-*.sqlite3"))
        with sqlite3.connect(backup) as c:
            assert c.execute("PRAGMA user_version").fetchone()[0] == 8
            assert c.execute("SELECT title FROM songs").fetchone()[0] == "Kept"
