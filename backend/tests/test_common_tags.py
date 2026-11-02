import json
import shutil
import sqlite3
from contextlib import closing
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.catalog import CatalogFilters, beat_details, filter_options, list_beats
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.metadata import MetadataUpdate, correct_metadata


@pytest.fixture
def legacy(tmp_path, monkeypatch):
    root = tmp_path / "Bibliothèque été"
    with monkeypatch.context() as patch:
        patch.setattr(storage, "MIGRATIONS", {v: p for v, p in storage.MIGRATIONS.items() if v < 5})
        lib = Library.create(root)
        ids = [str(UUID(int=i)) for i in (1, 2)]
        with lib.catalog() as c:
            for identity in ids:
                c.execute(
                    (
                        "INSERT INTO beats(id,title,audio_path,added_at,field_provenance) "
                        "VALUES(?,?,?,?,?)"
                    ),
                    (
                        identity,
                        "Prod",
                        f"audio/{identity}.mp3",
                        "2026-10-01",
                        '{"styles":"manual"}',
                    ),
                )
                lib.safe_path(f"audio/{identity}.mp3").write_bytes(b"original media")
            for i, (kind, label) in enumerate(
                [
                    ("style", "Chill"),
                    ("mood", "Chill"),
                    ("style", "DRILL"),
                    ("mood", "Drill"),
                    ("style", "Sombré"),
                    ("mood", "Sombre"),
                ],
                1,
            ):
                c.execute("INSERT INTO tags VALUES(?,?,?,?)", (i, kind, label, label.lower()))
                c.execute("INSERT INTO beat_tags VALUES(?,?)", (ids[0], i))
            for i in (1, 3):
                c.execute("INSERT INTO beat_tags VALUES(?,?)", (ids[1], i))
        lib.close()
    return root, ids


def rows(root, table):
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        return c.execute(f"SELECT * FROM {table} ORDER BY 1,2").fetchall()


def test_v4_preserves_all_legacy_rows_variants_links_media_backup_and_portability(legacy):
    root, ids = legacy
    original = {t: rows(root, t) for t in ("beats", "tags", "beat_tags")}
    lib = Library.open(root)
    assert lib.summary()["schema_version"] == max(storage.MIGRATIONS)
    for table, values in original.items():
        assert rows(root, table) == values
    assert set(beat_details(lib, ids[0])["tags"]) == {"Chill", "DRILL", "Drill", "Sombré", "Sombre"}
    assert set(beat_details(lib, ids[1])["tags"]) == {"Chill", "DRILL"}
    assert len(rows(root, "catalog_tags")) == 5
    assert len(rows(root, "beat_catalog_tags")) == 7
    backup = list((root / "backups").glob("catalog-v4-*.sqlite3"))
    assert len(backup) == 1
    with sqlite3.connect(backup[0]) as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 4
        assert c.execute("SELECT COUNT(*) FROM beat_tags").fetchone()[0] == 8
    entities = rows(root, "catalog_tags")
    lib.close()
    moved = root.parent / "Autre disque"
    shutil.move(root, moved)
    with closing(Library.open(moved)) as reopened:
        assert rows(moved, "catalog_tags") == entities
        assert len(list((moved / "backups").glob("*.sqlite3"))) == 1
        assert reopened.safe_path(f"audio/{ids[0]}.mp3").read_bytes() == b"original media"


def test_common_corrections_are_ordered_exact_and_archived_with_sparse_patches(legacy):
    root, ids = legacy
    with closing(Library.open(root)) as lib:
        original = beat_details(lib, ids[0])
        correct_metadata(lib, ids[0], MetadataUpdate(tags=["chill", "Chill", "Chíll", "chill"]))
        result = beat_details(lib, ids[0])
        assert result["tags"] == ["chill", "Chill", "Chíll"]
        assert list_beats(lib, 10, 0)["beats"][0]["tags"] == result["tags"]
        provenance = result["metadata_provenance"]
        assert provenance["tags"] == "manual"
        assert provenance["styles"] == "manual"
        assert provenance["original_metadata"]["tags"]["value"] == original["tags"]
        assert len(provenance["original_metadata"]["tags"]["legacy"]) == 6
        correct_metadata(lib, ids[0], MetadataUpdate(bpm=125))
        assert beat_details(lib, ids[0])["tags"] == result["tags"]
        assert len(list_beats(lib, 10, 0, filters=CatalogFilters(tags=["chill"]))["beats"]) == 1
        assert list_beats(lib, 10, 0, filters=CatalogFilters(tags=["CHILL"]))["total"] == 0
        assert list_beats(lib, 10, 0, "chill")["total"] == 2
        assert set(filter_options(lib)["tags"]) >= {"chill", "Chill", "Chíll"}
        correct_metadata(lib, ids[0], MetadataUpdate(tags=[]))
        assert beat_details(lib, ids[0])["tags"] == []
        assert beat_details(lib, ids[0])["styles"] == []
        assert beat_details(lib, ids[0])["moods"] == []
        assert list_beats(lib, 10, 0, filters=CatalogFilters(tag_missing=True))["total"] == 1
        assert (
            list_beats(lib, 10, 0, filters=CatalogFilters(tags=["Chill"], tag_missing=True))[
                "total"
            ]
            == 2
        )
        assert beat_details(lib, ids[1])["tags"]
        assert len(rows(root, "tags")) == 6


def test_legacy_clients_preserve_new_uncategorised_tags_and_other_category(legacy):
    root, ids = legacy
    with closing(Library.open(root)) as lib:
        correct_metadata(lib, ids[0], MetadataUpdate(tags=["Chill", "Extra"]))
        correct_metadata(lib, ids[0], MetadataUpdate(styles=["Drill"]))
        assert set(beat_details(lib, ids[0])["tags"]) == {"Extra", "Chill", "DRILL"}
        correct_metadata(lib, ids[0], MetadataUpdate(moods=[]))
        assert set(beat_details(lib, ids[0])["tags"]) == {"Extra", "DRILL"}


def test_invalid_tags_roll_back_title_links_and_provenance(legacy):
    root, ids = legacy
    with closing(Library.open(root)) as lib:
        before = beat_details(lib, ids[0])
        for payload in [
            MetadataUpdate(title="Changed", tags=["x" * 81]),
            MetadataUpdate(tags=["Valid"], styles=[]),
        ]:
            with pytest.raises(LibraryError):
                correct_metadata(lib, ids[0], payload)
            assert beat_details(lib, ids[0]) == before


def test_common_tags_api_requires_session_and_filters_exact_entities(legacy, tmp_path):
    root, ids = legacy
    prefs = tmp_path / "preferences.json"
    prefs.write_text(
        json.dumps(
            {
                "library_root": str(root),
                "library_id": json.loads((root / "library.json").read_text())["id"],
            }
        )
    )
    with TestClient(
        create_app(port=8765, preferences=prefs), base_url="http://127.0.0.1:8765"
    ) as client:
        endpoint = f"/api/beats/{ids[0]}/metadata"
        assert client.patch(endpoint, json={"tags": ["New"]}).status_code == 403
        token = client.get("/api/session").json()["token"]
        headers = {"Origin": "http://127.0.0.1:8765", "X-Session-Token": token}
        result = client.patch(endpoint, headers=headers, json={"tags": ["New", "new"]})
        assert result.status_code == 200
        assert result.json()["tags"] == ["New", "new"]
        assert client.get("/api/beats", params={"tags": "New"}).json()["total"] == 1
        assert client.get("/api/beats", params={"tags": "NEW"}).json()["total"] == 0
        assert {"New", "new"} <= set(client.get("/api/catalog/filters").json()["tags"])
        before = client.get(f"/api/beats/{ids[0]}").json()
        assert (
            client.patch(
                endpoint, headers=headers, json={"title": "Changed", "tags": ["x" * 81]}
            ).status_code
            == 400
        )
        assert client.get(f"/api/beats/{ids[0]}").json() == before


def test_failure_after_common_tags_migration_rolls_back_schema_data_and_keeps_backup(
    legacy, tmp_path, monkeypatch
):
    root, ids = legacy
    before = rows(root, "beat_tags")
    bad = tmp_path / "006_broken.sql"
    bad.write_text("CREATE TABLE marker(id INTEGER);\nINSERT INTO missing_table VALUES(1);\n")
    with monkeypatch.context() as patch:
        patch.setattr(storage, "MIGRATIONS", {**storage.MIGRATIONS, 6: bad})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 4
        assert not c.execute("SELECT name FROM sqlite_master WHERE name='catalog_tags'").fetchall()
    assert rows(root, "beat_tags") == before
    assert list((root / "backups").glob("*.sqlite3"))
    with closing(Library.open(root)) as lib:
        assert len(beat_details(lib, ids[0])["tags"]) == 5
