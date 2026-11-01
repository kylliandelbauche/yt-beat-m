import json
import shutil
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.catalog import beat_details, filter_options
from yt_beat_m.catalog_tags import TagConflict, change_tag, list_tags
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.metadata import MetadataUpdate, correct_metadata


@pytest.fixture
def collection(tmp_path):
    with closing(Library.create(tmp_path / "collection")) as lib:
        ids = [str(UUID(int=i)) for i in (1, 2)]
        with lib.catalog() as c:
            for identity in ids:
                c.execute(
                    "INSERT INTO beats(id,title,audio_path,added_at) VALUES(?,?,?,?)",
                    (identity, "Prod", f"audio/{identity}.mp3", "2026-10-01"),
                )
                lib.safe_path(f"audio/{identity}.mp3").write_bytes(b"original media")
        for identity in ids:
            correct_metadata(lib, identity, MetadataUpdate(styles=["Chill"], moods=["Chill"]))
        correct_metadata(lib, ids[1], MetadataUpdate(tags=["Chill", "chill", "Extra"]))
        yield lib, ids


def test_rename_preserves_identity_shared_links_order_variants_and_stale_clients(collection):
    lib, ids = collection
    tag = next(t for t in list_tags(lib) if t["label"] == "Chill")
    assert tag["beat_count"] == 2
    change_tag(lib, tag["id"], "Chill", "Calm")
    assert beat_details(lib, ids[1])["tags"] == ["Calm", "chill", "Extra"]
    assert next(t for t in list_tags(lib) if t["id"] == tag["id"])["label"] == "Calm"
    assert beat_details(lib, ids[0])["metadata_provenance"]["original_metadata"]["tags"][
        "value"
    ] == ["Chill"]
    correct_metadata(lib, ids[0], MetadataUpdate(tags=["Chill"]))
    assert beat_details(lib, ids[0])["tags"] == ["Calm"]
    correct_metadata(lib, ids[0], MetadataUpdate(styles=["Chill"]))
    assert beat_details(lib, ids[0])["tags"] == ["Calm"]
    before = list_tags(lib)
    for label in ["chill", "", "x" * 81, "bad\x00name"]:
        with pytest.raises((TagConflict, LibraryError)):
            change_tag(lib, tag["id"], "Calm", label)
        assert list_tags(lib) == before
    with pytest.raises(TagConflict):
        change_tag(lib, tag["id"], "Chill", "Changed")
    change_tag(lib, tag["id"], "Calm", "Chill")
    assert beat_details(lib, ids[0])["tags"] == ["Chill"]


def test_delete_blocks_stale_recreation_but_explicit_create_allocates_a_new_id(collection):
    lib, ids = collection
    tag = next(t for t in list_tags(lib) if t["label"] == "Chill")
    change_tag(lib, tag["id"], "Chill", "Calm")
    change_tag(lib, tag["id"], "Calm")
    assert beat_details(lib, ids[0])["tags"] == []
    assert beat_details(lib, ids[0])["styles"] == beat_details(lib, ids[0])["moods"] == []
    assert beat_details(lib, ids[1])["tags"] == ["chill", "Extra"]
    original = beat_details(lib, ids[0])
    for payload in [
        MetadataUpdate(title="Changed", tags=["Chill"]),
        MetadataUpdate(styles=["Chill"]),
        MetadataUpdate(moods=["Calm"]),
    ]:
        with pytest.raises(TagConflict):
            correct_metadata(lib, ids[0], payload)
        assert beat_details(lib, ids[0]) == original
    correct_metadata(lib, ids[0], MetadataUpdate(tags=["Calm"], recreate_tags=["Calm"]))
    new = next(t for t in list_tags(lib) if t["label"] == "Calm")
    assert new["id"] > tag["id"]
    assert beat_details(lib, ids[0])["tags"] == ["Calm"]
    assert lib.safe_path(f"audio/{ids[0]}.mp3").read_bytes() == b"original media"
    with pytest.raises(TagConflict):
        change_tag(lib, tag["id"], "Calm", "Wrong")
    with pytest.raises(LibraryError):
        correct_metadata(lib, ids[0], MetadataUpdate(recreate_tags=["Other"]))


def test_mutations_persist_when_the_library_moves(collection, tmp_path):
    lib, ids = collection
    tag = next(t for t in list_tags(lib) if t["label"] == "Chill")
    change_tag(lib, tag["id"], "Chill", "Ambient")
    root = lib.root
    lib.close()
    moved = tmp_path / "Déplacée"
    shutil.move(root, moved)
    with closing(Library.open(moved)) as reopened:
        assert "Ambient" in filter_options(reopened)["tags"]
        correct_metadata(reopened, ids[0], MetadataUpdate(tags=["Chill"]))
        assert beat_details(reopened, ids[0])["tags"] == ["Ambient"]
        change_tag(reopened, tag["id"], "Ambient")
    with closing(Library.open(moved)) as reopened:
        with pytest.raises(TagConflict):
            correct_metadata(reopened, ids[0], MetadataUpdate(tags=["Chill"]))
        assert reopened.safe_path(f"audio/{ids[0]}.mp3").read_bytes() == b"original media"


def test_expected_label_serializes_competing_renames(collection):
    lib, _ = collection
    tag = next(t for t in list_tags(lib) if t["label"] == "Chill")

    def change(label):
        try:
            change_tag(lib, tag["id"], "Chill", label)
            return True
        except TagConflict:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(change, ["First", "Second"])) == [False, True]


def test_v5_migration_is_backed_up_atomic_and_preserves_vocabulary(tmp_path, monkeypatch):
    root = tmp_path / "legacy"
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {v: f for v, f in storage.MIGRATIONS.items() if v < 6})
        with closing(Library.create(root)) as lib:
            with lib.catalog() as c:
                c.executemany(
                    "INSERT INTO catalog_tags VALUES(?,?,?)", [(7, "A", "a"), (8, "a", "a")]
                )
    broken = tmp_path / "bad.sql"
    broken.write_text(storage.MIGRATIONS[6].read_text() + "\nINSERT INTO missing VALUES(1);\n")
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {**storage.MIGRATIONS, 6: broken})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 5
        assert not c.execute(
            "SELECT name FROM sqlite_master WHERE name='catalog_tag_names'"
        ).fetchall()
    with closing(Library.open(root)) as lib:
        assert [(t["id"], t["label"]) for t in list_tags(lib)] == [(7, "A"), (8, "a")]
        assert lib.summary()["schema_version"] == 6
    backup = next((root / "backups").glob("catalog-v5-*.sqlite3"))
    with sqlite3.connect(backup) as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 5


def test_tag_api_protection_validation_and_conflicts(collection, tmp_path):
    lib, ids = collection
    root = lib.root
    identity = lib.manifest["id"]
    lib.close()
    prefs = tmp_path / "prefs.json"
    prefs.write_text(json.dumps({"library_root": str(root), "library_id": identity}))
    with TestClient(
        create_app(port=8765, preferences=prefs), base_url="http://127.0.0.1:8765"
    ) as client:
        tag = next(
            t for t in client.get("/api/catalog/tags").json()["tags"] if t["label"] == "Chill"
        )
        url = f"/api/catalog/tags/{tag['id']}"
        payload = {"expected_label": "Chill", "label": "Calm"}
        for method in ["PATCH", "DELETE"]:
            assert client.request(method, url, json=payload).status_code == 403
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert (
            client.patch(
                url, headers={**headers, "Origin": "https://elsewhere.example"}, json=payload
            ).status_code
            == 403
        )
        assert (
            client.patch(url, headers=headers, json={**payload, "label": "x" * 81}).status_code
            == 422
        )
        assert (
            client.patch(url, headers=headers, json={**payload, "label": "chill"}).status_code
            == 409
        )
        assert client.patch(url, headers=headers, json=payload).status_code == 200
        assert client.patch(url, headers=headers, json=payload).status_code == 409
        assert (
            client.request(
                "DELETE", url, headers=headers, json={"expected_label": "Chill"}
            ).status_code
            == 409
        )
        assert (
            client.request(
                "DELETE", url, headers=headers, json={"expected_label": "Calm"}
            ).status_code
            == 200
        )
        assert client.get(f"/api/beats/{ids[0]}").json()["tags"] == []
