import json
import shutil
import sqlite3
import subprocess
import sys
from uuid import uuid4

import pytest
from yt_beat_m import library as storage
from yt_beat_m.library import Library, LibraryBusyError, LibraryError
from yt_beat_m.library_manager import LibraryManager


def add_fixture(library):
    beat_id = str(uuid4())
    relative = f"audio/{beat_id}.mp3"
    library.safe_path(relative).write_bytes(b"storage fixture; not a playback fixture")
    with library.catalog() as catalog:
        catalog.execute(
            "INSERT INTO beats(id, title, added_at, published_on, audio_path, favorite) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (beat_id, "R&B mélancolique", "2026-10-24T17:00:00Z", "2024-03-02", relative, 1),
        )
        catalog.execute("INSERT INTO tags VALUES (1, 'mood', 'Mélancolique', 'melancolique')")
        catalog.execute("INSERT INTO beat_tags VALUES (?, 1)", (beat_id,))
    return beat_id, relative


def test_library_moves_with_media_favorites_tags_and_dates(tmp_path):
    original = tmp_path / "Disque été"
    library = Library.create(original, "Mes prods")
    beat_id, relative = add_fixture(library)
    identity = library.manifest["id"]
    library.close()
    destination = tmp_path / "Autre disque avec espaces"
    shutil.move(str(original), destination)
    reopened = Library.open(destination)
    try:
        assert reopened.summary()["id"] == identity
        assert reopened.summary()["beat_count"] == 1
        assert reopened.safe_path(relative).is_file()
        with reopened.catalog() as catalog:
            beat = catalog.execute("SELECT * FROM beats WHERE id = ?", (beat_id,)).fetchone()
            assert beat["favorite"] == 1
            assert beat["published_on"] == "2024-03-02"
            assert beat["added_at"] == "2026-10-24T17:00:00Z"
            assert beat["audio_path"] == relative
            assert catalog.execute("SELECT label FROM tags").fetchone()[0] == "Mélancolique"
            assert catalog.execute("SELECT COUNT(*) FROM beat_tags").fetchone()[0] == 1
            assert catalog.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
            assert catalog.execute("PRAGMA synchronous").fetchone()[0] == 2
    finally:
        reopened.close()


@pytest.mark.parametrize(
    "path",
    [
        "../outside",
        "/etc/passwd",
        "C:/file",
        "C:file",
        "audio\\x",
        "audio/../x",
        "audio//x",
        ".",
        "audio/x:stream",
    ],
)
def test_rejects_nonportable_or_escaping_paths(tmp_path, path):
    library = Library.create(tmp_path / "library")
    try:
        with pytest.raises(LibraryError):
            library.safe_path(path)
    finally:
        library.close()


def test_rejects_internal_symlink(tmp_path):
    library = Library.create(tmp_path / "library")
    try:
        outside = tmp_path / "outside"
        outside.mkdir()
        try:
            (library.root / "audio" / "escape").symlink_to(outside, target_is_directory=True)
        except OSError:
            pytest.skip("La création de liens symboliques n’est pas autorisée sur ce poste.")
        with pytest.raises(LibraryError):
            library.safe_path("audio/escape/file.mp3")
    finally:
        library.close()


def test_missing_database_never_recreates_empty_catalog(tmp_path):
    library = Library.create(tmp_path / "library")
    library.close()
    (library.root / "catalog.sqlite3").unlink()
    with pytest.raises(LibraryError, match="catalogue est absent"):
        Library.open(library.root)
    assert not (library.root / "catalog.sqlite3").exists()


def test_never_overwrites_existing_directory(tmp_path):
    root = tmp_path / "personal"
    root.mkdir()
    file = root / "my-file.txt"
    file.write_text("keep me")
    with pytest.raises(LibraryError, match="dossier vide"):
        Library.create(root)
    assert file.read_text() == "keep me"
    assert not (root / "catalog.sqlite3").exists()


def test_process_lock_and_release(tmp_path):
    library = Library.create(tmp_path / "library")
    try:
        with pytest.raises(LibraryBusyError):
            Library.open(library.root)
        code = (
            "import sys; from yt_beat_m.library import Library, LibraryBusyError; "
            "\ntry:\n lib=Library.open(sys.argv[1]); lib.close()"
            "\nexcept LibraryBusyError:\n sys.exit(2)\n"
        )
        result = subprocess.run([sys.executable, "-c", code, str(library.root)], timeout=10)
        assert result.returncode == 2
    finally:
        library.close()
    # The lock file intentionally remains; an OS lock, not file presence, governs access.
    result = subprocess.run([sys.executable, "-c", code, str(library.root)], timeout=10)
    assert result.returncode == 0


def test_newer_formats_are_refused_without_reinitialization(tmp_path):
    library = Library.create(tmp_path / "library")
    add_fixture(library)
    library.close()
    manifest_path = library.root / "library.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["format_version"] = 999
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(LibraryError, match="plus récente"):
        Library.open(library.root)
    manifest["format_version"] = 1
    manifest_path.write_text(json.dumps(manifest))
    connection = sqlite3.connect(library.root / "catalog.sqlite3")
    connection.execute("PRAGMA user_version = 999")
    connection.close()
    with pytest.raises(LibraryError, match="plus récent"):
        Library.open(library.root)
    connection = sqlite3.connect(library.root / "catalog.sqlite3")
    assert connection.execute("SELECT COUNT(*) FROM beats").fetchone()[0] == 1
    assert connection.execute("PRAGMA user_version").fetchone()[0] == 999
    connection.close()


def test_failed_migration_rolls_back_and_preserves_backup(tmp_path, monkeypatch):
    library = Library.create(tmp_path / "library")
    add_fixture(library)
    library.close()
    migration = tmp_path / "002_bad.sql"
    migration.write_text("CREATE TABLE should_rollback(id INTEGER);\nTHIS IS INVALID SQL;\n")
    monkeypatch.setattr(storage, "MIGRATIONS", {**storage.MIGRATIONS, 2: migration})
    with pytest.raises(LibraryError, match="migrer"):
        Library.open(library.root)
    backup_files = list((library.root / "backups").glob("*.sqlite3"))
    assert len(backup_files) == 1
    for path in [library.root / "catalog.sqlite3", backup_files[0]]:
        with sqlite3.connect(path) as connection:
            assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
            assert connection.execute("SELECT COUNT(*) FROM beats").fetchone()[0] == 1
            assert (
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE name='should_rollback'"
                ).fetchone()
                is None
            )


def test_successful_migration_keeps_data_and_records_version(tmp_path, monkeypatch):
    library = Library.create(tmp_path / "library")
    add_fixture(library)
    library.close()
    migration = tmp_path / "002_notes.sql"
    migration.write_text("ALTER TABLE beats ADD COLUMN notes TEXT;\n")
    monkeypatch.setattr(storage, "MIGRATIONS", {**storage.MIGRATIONS, 2: migration})
    reopened = Library.open(library.root)
    try:
        assert reopened.summary()["beat_count"] == 1
        assert reopened.summary()["schema_version"] == 2
        with reopened.catalog() as catalog:
            assert [row[0] for row in catalog.execute("SELECT version FROM schema_migrations")] == [
                1,
                2,
            ]
            assert catalog.execute("SELECT favorite, notes FROM beats").fetchone()[:] == (1, None)
        assert len(list((library.root / "backups").glob("*.sqlite3"))) == 1
    finally:
        reopened.close()


def test_preferences_restore_missing_disk_and_failed_switch(tmp_path):
    preferences = tmp_path / "config" / "preferences.json"
    manager = LibraryManager(preferences)
    selected = manager.select(str(tmp_path / "library"), create=True)
    with pytest.raises(LibraryError):
        manager.select(str(tmp_path / "absent"))
    assert manager.status()["library"]["id"] == selected["id"]
    manager.close()
    manager.restore()
    assert manager.status()["library"]["id"] == selected["id"]
    manager.close()
    shutil.move(str(tmp_path / "library"), tmp_path / "moved")
    manager.restore()
    assert manager.status()["library"] is None
    assert manager.status()["error"]
    assert not (tmp_path / "library").exists()


def test_catalog_identity_change_and_write_rollback(tmp_path):
    library = Library.create(tmp_path / "library")
    try:
        with pytest.raises(LibraryError):
            with library.catalog() as catalog:
                catalog.execute("INSERT INTO tags VALUES (1, 'mood', 'Sad', 'sad')")
                catalog.execute("INSERT INTO beat_tags VALUES ('absent', 1)")
        with library.catalog() as catalog:
            assert catalog.execute("SELECT COUNT(*) FROM tags").fetchone()[0] == 0
        manifest_path = library.root / "library.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["id"] = str(uuid4())
        manifest_path.write_text(json.dumps(manifest))
        with pytest.raises(LibraryError, match="changé"):
            library.summary()
    finally:
        library.close()
