import base64
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.beatmakers import refresh_beatmakers
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.profiles import (
    ProfileUpdate,
    assign_profiles,
    get_profile,
    save_profile,
    sync_profiles,
)


def add_beat(lib, name="LACCO x @m3nacebeats", source="explicit_credit", channel="prodlacco"):
    identity = str(uuid4())
    with lib.catalog() as c:
        c.execute(
            "INSERT INTO beats(id,title,beatmaker,channel,audio_path,added_at,description,"
            "field_provenance) VALUES(?,?,?,?,?,?,?,?)",
            (
                identity,
                "Prod de test",
                name,
                channel,
                f"audio/{identity}.mp3",
                "2026-10-29",
                f"Produced by {name}",
                json.dumps({"beatmaker": source}),
            ),
        )
        if "profile_assignment" in c.execute("SELECT * FROM beats LIMIT 1").fetchone().keys():
            sync_profiles(c, c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone())
    return identity


@pytest.fixture
def api_collection(tmp_path):
    lib = Library.create(tmp_path / "Collection")
    beat = add_beat(lib)
    lib.close()
    with TestClient(
        create_app(frontend=tmp_path / "dist", preferences=tmp_path / "prefs.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert (
            client.post("/api/library", headers=headers, json={"path": str(lib.root)}).status_code
            == 200
        )
        yield client, headers, beat, lib.root


def test_collaboration_identities_counts_filters_and_original_credit(api_collection):
    client, headers, beat, root = api_collection
    detail = client.get(f"/api/beats/{beat}").json()
    profiles = detail["beatmakers"]
    assert [p["name"] for p in profiles] == ["LACCO", "@m3nacebeats"]
    assert len({p["id"] for p in profiles}) == 2
    assert detail["beatmaker"] == "LACCO x @m3nacebeats"
    for p in profiles:
        profile = client.get("/api/beatmakers/" + p["id"]).json()
        assert profile["beat_count"] == 1 and profile["beats"][0]["id"] == beat
        assert client.get("/api/beats", params={"profile_ids": p["id"]}).json()["total"] == 1
        assert client.get("/api/beats", params={"makers": p["name"]}).json()["total"] == 1
    assert client.get("/api/catalog/filters").json()["makers"] == ["@m3nacebeats", "LACCO"]
    assert client.post("/api/beatmakers", json={"name": "Unauthorized"}).status_code == 403
    assert (
        client.patch(f"/api/beats/{beat}/metadata", json={"beatmaker_ids": []}).status_code == 403
    )
    assert client.get("/api/beatmakers/not-a-uuid").status_code == 422
    assert client.get("/api/beatmakers/" + str(uuid4())).status_code == 404


def test_profile_edit_photo_homonyms_and_transactional_association(api_collection):
    client, headers, beat, root = api_collection
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII="
    )
    data = {
        "name": "Same name",
        "socials": ["https://example.org/profile"],
        "stores": ["https://example.org/shop"],
        "photo": base64.b64encode(png).decode(),
    }
    a = client.post("/api/beatmakers", headers=headers, json=data).json()
    b = client.post("/api/beatmakers", headers=headers, json=data).json()
    assert a["id"] != b["id"]
    photo = client.get(a["photo_url"])
    assert photo.content == png and photo.headers["content-type"] == "image/png"
    assert photo.headers["x-content-type-options"] == "nosniff"
    response = client.patch(
        f"/api/beats/{beat}/metadata",
        headers=headers,
        json={"beatmaker_ids": [a["id"], b["id"], a["id"]], "bpm": 125},
    )
    assert response.status_code == 200
    assert [p["id"] for p in response.json()["beatmakers"]] == [a["id"], b["id"]]
    assert response.json()["channel"] == "prodlacco"
    assert response.json()["beatmaker"] == "LACCO x @m3nacebeats"
    assert client.post("/api/library/refresh", headers=headers).status_code == 200
    assert len(client.get(f"/api/beats/{beat}").json()["beatmakers"]) == 2
    bad = client.patch(
        f"/api/beats/{beat}/metadata",
        headers=headers,
        json={"beatmaker_ids": [a["id"], str(uuid4())], "bpm": 99},
    )
    assert bad.status_code == 400
    assert client.get(f"/api/beats/{beat}").json()["bpm"] == 125
    assert len(client.get(f"/api/beats/{beat}").json()["beatmakers"]) == 2
    assert (
        client.patch(
            f"/api/beats/{beat}/metadata", headers=headers, json={"beatmaker_ids": ["bad"]}
        ).status_code
        == 422
    )
    renamed = client.patch(
        "/api/beatmakers/" + a["id"],
        headers=headers,
        json={"name": "Renamed", "socials": data["socials"], "stores": data["stores"]},
    ).json()
    assert renamed["beat_count"] == 1 and renamed["photo_url"]
    assert client.get("/api/beats", params={"q": "Renamed"}).json()["total"] == 1
    assert client.get("/api/beats", params={"makers": "Renamed"}).json()["total"] == 1
    assert client.get("/api/beats", params={"makers": "LACCO x @m3nacebeats"}).json()["total"] == 0
    assert (
        client.patch(
            "/api/beatmakers/" + a["id"],
            headers=headers,
            json={"name": "Wrong", "socials": ["javascript:alert(1)"]},
        ).status_code
        == 400
    )
    assert client.get("/api/beatmakers/" + a["id"]).json()["name"] == "Renamed"
    assert (
        client.patch(
            "/api/beatmakers/" + a["id"],
            headers=headers,
            json={"name": "Wrong", "photo": base64.b64encode(b"<svg/>").decode()},
        ).status_code
        == 400
    )
    assert (
        client.patch(
            "/api/beatmakers/" + a["id"], headers=headers, json={"name": "Renamed", "photo": None}
        ).json()["photo_url"]
        is None
    )
    assert client.get(a["photo_url"]).status_code == 404
    assert (
        client.patch(
            f"/api/beats/{beat}/metadata", headers=headers, json={"beatmaker_ids": []}
        ).status_code
        == 200
    )
    assert client.post("/api/library/refresh", headers=headers).status_code == 200
    assert client.get(f"/api/beats/{beat}").json()["beatmakers"] == []
    assert client.get("/api/beats?unassigned_profiles=true").json()["total"] == 1


def test_real_v2_migration_backup_move_and_conservative_identity(tmp_path, monkeypatch):
    root = tmp_path / "Old collection"
    with monkeypatch.context() as ctx:
        ctx.setattr(storage, "MIGRATIONS", {i: p for i, p in storage.MIGRATIONS.items() if i <= 2})
        lib = Library.create(root)
        collab = add_beat(lib)
        add_beat(lib, "Label channel", "channel", "Label channel")
        ambiguous = add_beat(lib, None, "ambiguous_credit")
        manual = add_beat(lib, "Confirmed", "manual")
        other = add_beat(lib, "Confirmed", "manual", "Other channel")
        blank = add_beat(lib, None, "manual")
        with lib.catalog() as c:
            originals = [dict(r) for r in c.execute("SELECT * FROM beats ORDER BY id")]
        lib.close()
    migrated = Library.open(root)
    assert migrated.summary()["schema_version"] == 4
    assert len(list((root / "backups").glob("catalog-v2-*.sqlite3"))) == 1
    with migrated.catalog() as c:
        assert (
            c.execute(
                "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id=?", (collab,)
            ).fetchone()[0]
            == 2
        )
        assert (
            c.execute(
                "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id IN (?,?)",
                (ambiguous, blank),
            ).fetchone()[0]
            == 0
        )
        ids = [
            r[0]
            for r in c.execute(
                "SELECT profile_id FROM beat_profile_links WHERE beat_id IN (?,?)", (manual, other)
            )
        ]
        assert len(set(ids)) == 2
        for before, after in zip(
            originals, c.execute("SELECT * FROM beats ORDER BY id"), strict=True
        ):
            assert all(after[k] == v for k, v in before.items())
    photo = base64.b64decode((Path(__file__).parent / "fixtures/mint-cover.jpg.base64").read_text())
    p = save_profile(migrated, ProfileUpdate(name="Photo", photo=base64.b64encode(photo).decode()))
    migrated.close()
    moved = tmp_path / "Moved collection"
    root.rename(moved)
    reopened = Library.open(moved)
    assert get_profile(reopened, p["id"])["photo_url"]
    refresh_beatmakers(reopened)
    with reopened.catalog() as c:
        assert (
            c.execute("SELECT photo FROM beatmaker_profiles WHERE id=?", (p["id"],)).fetchone()[0]
            == photo
        )
    reopened.close()


def test_failed_backfill_rolls_back_schema_and_preserves_backup(tmp_path, monkeypatch):
    root = tmp_path / "Old collection"
    with monkeypatch.context() as ctx:
        ctx.setattr(storage, "MIGRATIONS", {i: p for i, p in storage.MIGRATIONS.items() if i <= 2})
        lib = Library.create(root)
        add_beat(lib)
        lib.close()

    def fail(c):
        raise LibraryError("Backfill failed")

    monkeypatch.setattr("yt_beat_m.profiles.backfill_profiles", fail)
    with pytest.raises(LibraryError):
        Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 2
        assert (
            c.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE name='beatmaker_profiles'"
            ).fetchone()[0]
            == 0
        )
        assert c.execute("SELECT COUNT(*) FROM beats").fetchone()[0] == 1
    assert len(list((root / "backups").glob("catalog-v2-*.sqlite3"))) == 1


def test_real_import_publishes_distinct_profiles_and_duplicate_keeps_links(tmp_path, monkeypatch):
    from test_imports import FakeRunner, metadata
    from yt_beat_m.imports import ImportWorker

    monkeypatch.setattr("yt_beat_m.imports.shutil.which", lambda name: name)
    info = {**metadata(), "description": "Produced by LACCO x @m3nacebeats"}
    runner = FakeRunner()
    run = runner.run
    runner.run = lambda args, *a, **kw: (
        json.dumps(info) if "--dump-single-json" in args else run(args, *a, **kw)
    )
    lib = Library.create(tmp_path / "Collection")
    worker = ImportWorker(lib, runner=runner)
    try:
        job = worker.enqueue("https://youtu.be/abcdefghijk")["job"]
        worker.perform(job)
        assert worker.jobs()[0]["state"] == "completed"
        with lib.catalog() as c:
            rows = c.execute(
                "SELECT p.id,p.name FROM beatmaker_profiles p "
                "JOIN beat_profile_links l ON p.id=l.profile_id "
                "WHERE l.beat_id=? ORDER BY l.position",
                (job["id"],),
            ).fetchall()
            assert [r["name"] for r in rows] == ["LACCO", "@m3nacebeats"]
        assert worker.enqueue("https://youtu.be/abcdefghijk")["duplicate"] is True
        assert len(worker.jobs()) == 1
        assert lib.summary()["beat_count"] == 1
    finally:
        worker.stop()
        lib.close()


def test_manual_identity_beats_automatic_key_and_homonyms_remain_unresolved(tmp_path):
    lib = Library.create(tmp_path / "Collection")
    try:
        first = add_beat(lib, "Alpha")
        chosen = save_profile(lib, ProfileUpdate(name="Alpha"))
        with lib.catalog() as c:
            assign_profiles(c, first, [chosen["id"]])
        second = add_beat(lib, "Alpha")
        with lib.catalog() as c:
            assert (
                c.execute(
                    "SELECT profile_id FROM beat_profile_links WHERE beat_id=?", (second,)
                ).fetchone()[0]
                == chosen["id"]
            )
        homonym = save_profile(lib, ProfileUpdate(name="Alpha"))
        with lib.catalog() as c:
            assign_profiles(c, second, [homonym["id"]])
        third = add_beat(lib, "Alpha")
        with lib.catalog() as c:
            assert (
                c.execute(
                    "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id=?", (third,)
                ).fetchone()[0]
                == 0
            )
            assert c.execute("SELECT COUNT(*) FROM beatmaker_profiles").fetchone()[0] == 3
    finally:
        lib.close()
