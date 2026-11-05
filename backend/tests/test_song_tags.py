"""Shared tag identity, dynamic inheritance and transactional song edits."""

import hashlib
import sqlite3
from contextlib import closing
from uuid import uuid4

import pytest
from test_songs import AUDIO, create
from test_songs import songs as songs
from yt_beat_m import library as storage
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.songs import SongFiles, get_song


def tags(client):
    return {t["label"]: t for t in client.get("/api/catalog/tags").json()["tags"]}


def prod_tags(client, headers, beat, labels):
    response = client.patch(f"/api/beats/{beat}/metadata", headers=headers, json={"tags": labels})
    assert response.is_success, response.text


def patch(client, headers, song, **fields):
    current = client.get(f"/api/songs/{song['id']}").json()
    return client.patch(
        f"/api/songs/{song['id']}",
        headers=headers,
        json={"expected_revision": current["revision"], **fields},
    )


def test_dynamic_union_preserves_direct_identity_across_prod_changes_and_reopen(songs):
    c, h, beat, file, root, prefs = songs
    prod_tags(c, h, beat, ["Chill", "Été"])
    chill = tags(c)["Chill"]["id"]
    song = create(c, h, beat_id=beat, tag_ids=[chill, chill], new_tags=["Direct"]).json()
    assert [(t["label"], t["direct"], t["inherited"]) for t in song["tags"]] == [
        ("Chill", True, True),
        ("Été", False, True),
        ("Direct", True, False),
    ]
    assert c.get("/api/songs").json()["songs"] == [song]
    prod_tags(c, h, beat, ["Nouveau"])
    changed = c.get(f"/api/songs/{song['id']}").json()
    assert {t["label"] for t in changed["tags"]} == {"Nouveau", "Chill", "Direct"}
    assert next(t for t in changed["tags"] if t["id"] == chill)["direct"]
    detached = patch(c, h, song, beat_id=None).json()
    assert [t["label"] for t in detached["tags"]] == ["Chill", "Direct"]
    assert all(t["direct"] and not t["inherited"] for t in detached["tags"])
    relinked = patch(c, h, song, beat_id=beat).json()
    assert {t["label"] for t in relinked["tags"]} == {"Nouveau", "Chill", "Direct"}
    c.post("/api/library/close", headers=h)
    assert c.post("/api/library", headers=h, json={"path": str(root)}).is_success
    assert c.get(f"/api/songs/{song['id']}").json() == relinked
    assert c.get(song["audio_url"]).content == AUDIO


def test_global_rename_delete_and_stale_ids_never_resurrect_tags(songs):
    c, h, beat, file, root, _ = songs
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    prod_tags(c, h, beat, ["Chill", "chill"])
    old = tags(c)["Chill"]["id"]
    a = create(c, h, beat_id=beat, tag_ids=[old]).json()
    b = create(c, h, new_tags=["Solo"]).json()
    url = f"/api/catalog/tags/{old}"
    assert c.patch(url, headers=h, json={"expected_label": "Chill", "label": "Calm"}).is_success
    renamed = patch(c, h, a, tag_ids=[old]).json()
    assert renamed["tags"][0] == {"id": old, "label": "Calm", "direct": True, "inherited": True}
    # Old names resolve through the same catalog history as prod edits.
    alias = patch(c, h, b, tag_ids=[], new_tags=["Chill"]).json()
    assert alias["tags"][0]["id"] == old
    assert c.request("DELETE", url, headers=h, json={"expected_label": "Calm"}).is_success
    assert [t["label"] for t in c.get(f"/api/songs/{a['id']}").json()["tags"]] == ["chill"]
    assert c.get(f"/api/songs/{b['id']}").json()["tags"] == []
    baseline = c.get(f"/api/songs/{a['id']}").json()
    assert patch(c, h, a, title="Do not save", tag_ids=[old]).status_code == 409
    assert c.get(f"/api/songs/{a['id']}").json() == baseline
    assert patch(c, h, b, tag_ids=[], new_tags=["Chill"]).status_code == 409
    recreated = patch(c, h, b, tag_ids=[], new_tags=["Calm"], recreate_tags=["Calm"]).json()
    assert recreated["tags"][0]["id"] > old
    assert patch(c, h, a, tag_ids=[old]).status_code == 409
    assert set(tags(c)) == {"Calm", "chill", "Solo"}
    assert hashlib.sha256(file.read_bytes()).hexdigest() == digest
    assert c.get(a["audio_url"]).content == AUDIO


def test_search_filters_union_before_pagination_and_honest_counts(songs):
    c, h, beat, *_ = songs
    prod_tags(c, h, beat, ["Été", "ete"])
    identities = tags(c)
    a = create(
        c, h, title="Alpha", beat_id=beat, tag_ids=[identities["Été"]["id"]], favorite=True
    ).json()
    b = create(c, h, title="Beta", new_tags=["Voix"]).json()
    empty = create(c, h, title="Sans").json()
    current = tags(c)
    assert current["Été"]["beat_count"] == 1 and current["Été"]["song_count"] == 1
    assert current["Voix"]["beat_count"] == 0 and current["Voix"]["song_count"] == 1
    assert c.get("/api/songs?q=ete").json()["songs"] == [a]
    assert c.get("/api/songs?q=alpha%20ete&favorites=true").json()["songs"] == [a]
    assert c.get("/api/songs?q=VOIX").json()["songs"] == [b]
    q = [("tag_ids", identities["Été"]["id"]), ("tag_ids", current["Voix"]["id"])]
    result = c.get(
        "/api/songs", params=[*q, ("sort", "added_asc"), ("limit", 1), ("offset", 1)]
    ).json()
    assert result["total"] == 2 and result["songs"] == [b]
    assert c.get("/api/songs", params=[*q, ("linked", "true")]).json()["songs"] == [a]
    assert c.get("/api/songs?tag_missing=true").json()["songs"] == [empty]
    assert (
        c.get(
            "/api/songs", params=[("tag_ids", current["Voix"]["id"]), ("tag_missing", "true")]
        ).json()["total"]
        == 2
    )
    prod_tags(c, h, beat, [])
    assert (
        c.get("/api/songs", params={"tag_ids": identities["Été"]["id"]}).json()["songs"][0]["id"]
        == a["id"]
    )
    assert tags(c)["Été"]["beat_count"] == 0 and tags(c)["Été"]["song_count"] == 1


def test_failed_tag_edit_rolls_back_title_revision_and_prepared_binding(songs):
    c, h, beat, file, root, prefs = songs
    song = create(c, h, new_tags=["Keep"]).json()
    selected = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    response = patch(
        c,
        h,
        song,
        title="Wrong",
        selection_id=selected["selection_id"],
        tag_ids=[],
        new_tags=["No orphan", "bad\x00name"],
    )
    assert response.status_code == 400
    assert c.get(f"/api/songs/{song['id']}").json() == song
    assert set(tags(c)) == {"Keep"}
    with sqlite3.connect(prefs.with_name("song-files.sqlite3")) as db:
        assert db.execute("SELECT count(*) FROM files").fetchone()[0] == 1
    # A failed save leaves the grant usable for a later correction.
    fixed = patch(c, h, song, selection_id=selected["selection_id"], tag_ids=[], new_tags=["Good"])
    assert fixed.is_success
    assert c.get(song["audio_url"]).content == AUDIO


def test_invalid_new_tags_do_not_create_a_song_or_consume_file_grant(songs):
    c, h, *_ = songs
    selected = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    payload = {
        "title": "Invalid",
        "state": "Topline",
        "selection_id": selected["selection_id"],
        "new_tags": ["Would be orphan", "x" * 81],
    }
    assert c.post("/api/songs", headers=h, json=payload).status_code == 400
    assert c.get("/api/songs").json()["total"] == 0 and tags(c) == {}
    assert c.post("/api/songs", headers=h, json={**payload, "new_tags": ["Valid"]}).is_success


def test_partial_edits_preserve_tags_and_payloads_require_explicit_intent(songs):
    c, h, *_ = songs
    a = create(c, h, new_tags=["Keep"]).json()
    changed = patch(c, h, a, state="Out").json()
    assert changed["tags"] == a["tags"]
    for payload, status in [
        ({"tag_ids": [1] * 121}, 422),
        ({"tag_ids": [], "new_tags": ["x" * 501]}, 422),
        ({"tag_ids": [True]}, 422),
        ({"tag_ids": [-1]}, 422),
        ({"tag_ids": [9999]}, 409),
        ({"tag_ids": None}, 422),
        ({"new_tags": ["Forgot selection"]}, 400),
        ({"tag_ids": [], "recreate_tags": ["Not selected"]}, 400),
    ]:
        assert patch(c, h, a, **payload).status_code == status
        assert c.get(f"/api/songs/{a['id']}").json() == changed
    for headers in [{}, {**h, "Origin": "https://elsewhere.example"}]:
        assert (
            c.patch(
                f"/api/songs/{a['id']}",
                headers=headers,
                json={"expected_revision": changed["revision"], "tag_ids": []},
            ).status_code
            == 403
        )
    assert patch(c, h, a, tag_ids=[]).json()["tags"] == []
    assert c.get("/api/songs?tag_ids=-1").status_code == 422
    assert c.get("/api/songs", params=[("tag_ids", 1)] * 121).status_code == 422


def test_v7_migration_backup_failure_and_portable_media(tmp_path, monkeypatch):
    root = tmp_path / "legacy"
    migrations = storage.MIGRATIONS
    identity = str(uuid4())
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {v: f for v, f in migrations.items() if v <= 7})
        with closing(Library.create(root)) as lib:
            lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
            with lib.catalog() as c:
                c.execute(
                    "INSERT INTO songs(id,title,state,added_at,audio_path,duration_seconds) "
                    "VALUES(?,?,?,?,?,?)",
                    (identity, "Kept", "Mixage", "2026-01-01", "audio/kept.mp3", 30),
                )
    bad = tmp_path / "broken.sql"
    bad.write_text(migrations[8].read_text() + "\nINSERT INTO missing VALUES(1);\n")
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {**migrations, 8: bad})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 7
        assert not c.execute(
            "SELECT name FROM sqlite_master WHERE name='song_catalog_tags'"
        ).fetchone()
    moved = root.with_name("moved")
    root.rename(moved)
    with closing(Library.open(moved)) as lib:
        song = get_song(lib, SongFiles(tmp_path / "registry.sqlite3"), identity)
        assert song["title"] == "Kept" and song["tags"] == [] and song["file_available"]
        assert lib.safe_path("audio/kept.mp3").read_bytes() == AUDIO
        assert lib.summary()["schema_version"] == 8
        backups = list((moved / "backups").glob("catalog-v7-*.sqlite3"))
        assert backups
        with sqlite3.connect(backups[0]) as c:
            assert c.execute("PRAGMA user_version").fetchone()[0] == 7
            assert c.execute("SELECT title FROM songs").fetchone()[0] == "Kept"
