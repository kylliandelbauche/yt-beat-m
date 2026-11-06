"""Portable covers, native selection boundaries and one transactional song Save."""

import base64
import sqlite3
import subprocess
from contextlib import closing
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from test_songs import AUDIO, create
from test_songs import songs as songs
from yt_beat_m import library as storage
from yt_beat_m.directory_picker import DirectoryPicker
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.song_artwork import IMAGE_LIMIT, image_from_payload, normalized_image
from yt_beat_m.songs import SongFiles, get_song


def raster(color="red", size=(48, 32), fmt="PNG", **kwargs):
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=fmt, **kwargs)
    return output.getvalue()


def encoded(data):
    return base64.b64encode(data).decode("ascii")


def patch(c, h, song, **values):
    return c.patch(
        f"/api/songs/{song['id']}",
        headers=h,
        json={"expected_revision": song["revision"], **values},
    )


def test_selection_preview_without_writes_cancellation_and_stripped_metadata(songs, monkeypatch):
    c, h, _, _, root, _ = songs
    source = root.parent / "Image privée.jpg"
    exif = Image.Exif()
    exif[315] = "PRIVATE AUTHOR"
    exif[274] = 6
    original = raster(fmt="JPEG", exif=exif)
    source.write_bytes(original)
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(source))
    selected = c.post("/api/songs/pick-cover", headers=h).json()["image"]
    assert selected["media_type"] == "image/png"
    image = base64.b64decode(selected["data"])
    assert b"PRIVATE AUTHOR" not in image and str(source) not in str(selected)
    with Image.open(BytesIO(image)) as checked:
        assert checked.size == (32, 48) and not checked.getexif()
    assert source.read_bytes() == original
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        assert db.execute("SELECT count(*) FROM song_artwork").fetchone()[0] == 0
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: None)
    assert c.post("/api/songs/pick-cover", headers=h).json() == {"image": None}
    for auth in [{}, {**h, "Origin": "https://elsewhere.example"}]:
        assert c.post("/api/songs/pick-cover", headers=auth).status_code == 403


def test_cover_save_partial_edits_inheritance_and_original_media_are_independent(songs):
    c, h, beat, file, root, _ = songs
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        db.execute("UPDATE beats SET artwork_path='artwork/original.png' WHERE id=?", (beat,))
    prod_cover = root / "artwork/original.png"
    original = raster("green")
    prod_cover.write_bytes(original)
    song = create(c, h, beat_id=beat, cover=encoded(raster())).json()
    assert song["cover_source"] == "personal"
    url = song["artwork_url"]
    response = c.get(url)
    assert response.content == normalized_image(raster())
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert c.get(url, headers={"Origin": "https://elsewhere.example"}).status_code == 403
    assert "cover" not in song and "data" not in song
    assert c.get("/api/songs").json()["songs"][0]["cover_source"] == "personal"
    removed = patch(
        c, h, song, beat_id=None, notes="Keep together", new_tags=["One"], tag_ids=[]
    ).json()
    assert removed["cover_source"] == "personal" and removed["beat_artwork_url"] is None
    assert c.get(removed["artwork_url"]).content == response.content
    inherited = patch(c, h, removed, cover=None, beat_id=beat).json()
    assert inherited["artwork_url"] == inherited["beat_artwork_url"] == f"/api/beats/{beat}/artwork"
    assert inherited["notes"] == "Keep together" and inherited["tags"][0]["label"] == "One"
    assert c.get(url).status_code == 404
    neutral = patch(c, h, inherited, beat_id=None).json()
    assert neutral["cover_source"] == "prod" and neutral["artwork_url"] is None
    assert file.read_bytes() == AUDIO and prod_cover.read_bytes() == original


def test_failed_save_rolls_back_artwork_text_tags_revision_and_file_binding(songs):
    c, h, _, _, root, prefs = songs
    song = create(c, h, notes="Before", cover=encoded(raster())).json()
    before = c.get(song["artwork_url"]).content
    selection = c.post("/api/songs/pick-file", headers=h).json()["selection"]
    values = dict(
        title="Changed",
        notes="Changed",
        cover=encoded(raster("blue")),
        tag_ids=[],
        new_tags=["New"],
        selection_id=selection["selection_id"],
    )
    # Fails after writing the new cover in the same SQLite transaction.
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        db.execute(
            "CREATE TRIGGER fail_cover AFTER UPDATE ON song_artwork BEGIN "
            "SELECT RAISE(ABORT,'simulated disk failure'); END;"
        )
    assert patch(c, h, song, **values).status_code == 400
    assert c.get(f"/api/songs/{song['id']}").json() == song
    assert c.get(song["artwork_url"]).content == before
    assert c.get("/api/catalog/tags").json()["tags"] == []
    with sqlite3.connect(prefs.with_name("song-files.sqlite3")) as db:
        assert db.execute("SELECT count(*) FROM files").fetchone()[0] == 1
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        db.execute("DROP TRIGGER fail_cover")
    saved = patch(c, h, song, **values).json()
    assert saved["notes"] == "Changed" and saved["tags"][0]["label"] == "New"
    assert c.get(saved["artwork_url"]).content != before
    assert patch(c, h, song, cover=None).status_code == 409
    assert c.get(f"/api/songs/{song['id']}").json() == saved


@pytest.mark.parametrize(
    "data",
    [
        b"<svg onload='alert(1)'/>",
        b"\x89PNG\r\n\x1a\n",
        b"\xff\xd8\xff",
        b"x" * (IMAGE_LIMIT + 1),
        raster(size=(4097, 1)),
    ],
)
def test_invalid_images_do_not_mutate_song_or_bind_files(songs, data):
    c, h, *_ = songs
    song = create(c, h).json()
    assert patch(c, h, song, title="Wrong", cover=encoded(data)).status_code in {400, 422}
    assert c.get(f"/api/songs/{song['id']}").json() == song
    assert patch(c, h, song, cover="https://example.org/image.jpg").status_code == 400
    assert patch(c, h, song, cover="/arbitrary/path.jpg").status_code == 400


def test_native_source_limits_and_symlinks(songs, monkeypatch):
    c, h, _, _, root, _ = songs
    source = root.parent / "picture.png"
    source.write_bytes(b"x" * (IMAGE_LIMIT + 1))
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(source))
    assert c.post("/api/songs/pick-cover", headers=h).status_code == 400
    source.write_bytes(raster())
    link = source.with_name("link.png")
    link.symlink_to(source)
    monkeypatch.setattr(DirectoryPicker, "choose", lambda self: str(link))
    assert c.post("/api/songs/pick-cover", headers=h).status_code == 400


def test_fixed_native_mac_image_command(monkeypatch, tmp_path):
    source = tmp_path / "Chosen image.png"
    runner = []

    def run(command, **kwargs):
        runner.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, str(source) + "\n", "")

    monkeypatch.setattr(subprocess, "run", run)
    assert DirectoryPicker("darwin", image=True).choose() == str(source)
    command, options = runner[0]
    assert command[:2] == ["/usr/bin/osascript", "-e"]
    assert 'of type {"public.jpeg", "public.png"}' in command[-1]
    assert str(source) not in command[-1] and "shell" not in options
    assert options["timeout"] == 300


def test_normalization_retains_transparency_with_bounded_dimensions():
    source = BytesIO()
    Image.new("RGBA", (2000, 1800), (25, 150, 100, 80)).save(source, format="PNG")
    result = normalized_image(source.getvalue())
    with Image.open(BytesIO(result)) as image:
        assert image.size == (1600, 1440)
        assert image.getpixel((0, 0))[3] == 80
    assert 0 < len(result) <= IMAGE_LIMIT


def test_animated_png_is_rejected():
    source = BytesIO()
    Image.new("RGB", (10, 10), "red").save(
        source,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (10, 10), "blue")],
    )
    with pytest.raises(LibraryError):
        normalized_image(source.getvalue())


def test_v9_upgrade_rollback_backup_and_portable_image_after_move(tmp_path, monkeypatch):
    root = tmp_path / "old"
    migrations = storage.MIGRATIONS
    identity = str(uuid4())
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {n: f for n, f in migrations.items() if n <= 9})
        with closing(Library.create(root)) as lib:
            lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
            with lib.catalog() as db:
                db.execute(
                    "INSERT INTO songs(id,title,state,added_at,audio_path,duration_seconds,notes) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (identity, "Kept", "Master", "2026-01-01", "audio/kept.mp3", 30, "Keep text"),
                )
    bad = tmp_path / "bad.sql"
    bad.write_text(migrations[10].read_text() + "\nINSERT INTO missing VALUES(1);\n")
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {**migrations, 10: bad})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 9
        assert not db.execute("SELECT 1 FROM sqlite_master WHERE name='song_artwork'").fetchone()
    with closing(Library.open(root)) as lib, lib.catalog() as db:
        db.execute(
            "INSERT INTO song_artwork VALUES(?,?)",
            (identity, image_from_payload(encoded(raster()))),
        )
    moved = root.with_name("moved")
    root.rename(moved)
    with closing(Library.open(moved)) as lib:
        song = get_song(lib, SongFiles(tmp_path / "registry.sqlite3"), identity)
        assert song["cover_source"] == "personal" and song["notes"] == "Keep text"
        assert song["file_available"] and lib.safe_path("audio/kept.mp3").read_bytes() == AUDIO
        with lib.catalog() as db:
            assert bytes(
                db.execute("SELECT data FROM song_artwork").fetchone()[0]
            ) == normalized_image(raster())
        with sqlite3.connect(next((moved / "backups").glob("catalog-v9-*.sqlite3"))) as db:
            assert db.execute("PRAGMA user_version").fetchone()[0] == 9
            assert db.execute("SELECT notes FROM songs").fetchone()[0] == "Keep text"
