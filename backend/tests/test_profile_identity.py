import json
import sqlite3
from uuid import uuid4

import pytest
from test_profiles import add_beat, api_collection  # noqa: F401
from yt_beat_m import library as storage
from yt_beat_m.beatmakers import refresh_beatmakers
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.profiles import (
    ProfileUpdate,
    assign_profiles,
    delete_profile,
    get_profile,
    list_profiles,
    merge_profiles,
    save_profile,
    sync_profiles,
)


def test_v3_reconciles_samoss_aliases_without_merging_other_channels(tmp_path, monkeypatch):
    root = tmp_path / "Collection"
    with monkeypatch.context() as ctx:
        ctx.setattr(storage, "MIGRATIONS", {i: p for i, p in storage.MIGRATIONS.items() if i <= 3})
        lib = Library.create(root)
        a = add_beat(lib, "Samoss", channel="Samoss")
        b = add_beat(lib, "Samoss", channel="Samoss")
        other = add_beat(lib, "Samoss", channel="Other artist")
        with lib.catalog() as c:
            c.execute("UPDATE beats SET channel_id=? WHERE id=?", ("UC" + "a" * 22, b))
            sync_profiles(c, c.execute("SELECT * FROM beats WHERE id=?", (b,)).fetchone())
        alias = add_beat(lib, "SamossProd", channel="Samoss")
        princess = add_beat(lib, "PRINCESS", "channel", "PRINCESS")
        local = add_beat(lib, None, None, None)
        with lib.catalog() as c:
            originals = [dict(r) for r in c.execute("SELECT * FROM beats ORDER BY id")]
            oldids = [
                r[0]
                for r in c.execute(
                    "SELECT id FROM beatmaker_profiles WHERE name IN ('Samoss','SamossProd')"
                )
            ]
        lib.close()
    migrated = Library.open(root)
    assert migrated.summary()["schema_version"] == max(storage.MIGRATIONS)
    assert len(list((root / "backups").glob("catalog-v3-*.sqlite3"))) == 1
    with migrated.catalog() as c:
        for before, after in zip(
            originals, c.execute("SELECT * FROM beats ORDER BY id"), strict=True
        ):
            assert all(after[k] == v for k, v in before.items())
        ids = [
            c.execute("SELECT profile_id FROM beat_profile_links WHERE beat_id=?", (i,)).fetchone()[
                0
            ]
            for i in (a, b, alias)
        ]
        assert len(set(ids)) == 1
        assert (
            c.execute(
                "SELECT profile_id FROM beat_profile_links WHERE beat_id=?", (other,)
            ).fetchone()[0]
            != ids[0]
        )
        assert (
            c.execute(
                "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id=?", (princess,)
            ).fetchone()[0]
            == 1
        )
        assert (
            c.execute(
                "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id=?", (local,)
            ).fetchone()[0]
            == 0
        )
    canonical = get_profile(migrated, ids[0])
    assert (
        canonical["name"] == "Samoss"
        and canonical["aliases"] == ["SamossProd"]
        and canonical["beat_count"] == 3
    )
    for i in oldids:
        assert get_profile(migrated, i) is not None
    refresh_beatmakers(migrated)
    assert get_profile(migrated, ids[0])["beat_count"] == 3
    migrated.close()
    moved = tmp_path / "Moved"
    root.rename(moved)
    reopened = Library.open(moved)
    assert get_profile(reopened, ids[0])["beat_count"] == 3
    reopened.close()


def test_merge_preview_atomicity_redirects_tombstones_and_manual_restore(api_collection):  # noqa: F811
    client, headers, beat, root = api_collection
    profiles = client.get("/api/beatmakers").json()["profiles"]
    owner, guest = (
        next(p for p in profiles if p["name"] == "LACCO"),
        next(p for p in profiles if p["name"] == "@m3nacebeats"),
    )
    dest = client.post(
        "/api/beatmakers",
        headers=headers,
        json={"name": "Laco", "socials": ["https://example.org/laco"]},
    ).json()
    url = f"/api/beatmakers/{owner['id']}"
    assert client.post(url + "/merge", json={"target_id": dest["id"]}).status_code == 403
    assert client.delete(url).status_code == 403
    preview = client.post(
        url + "/merge-preview", headers=headers, json={"target_id": dest["id"]}
    ).json()
    assert preview["beat_count"] == 1 and preview["aliases"] == ["LACCO"]
    assert client.get(url).json()["id"] == owner["id"]
    assert (
        client.post(url + "/merge", headers=headers, json={"target_id": str(uuid4())}).status_code
        == 400
    )
    assert client.get(url).json()["beat_count"] == 1
    result = client.post(url + "/merge", headers=headers, json={"target_id": dest["id"]}).json()
    assert result["profile"]["id"] == dest["id"]
    assert client.get(url).json()["id"] == dest["id"]
    assert client.get("/api/beats", params={"profile_ids": owner["id"]}).json()["total"] == 1
    assert [p["id"] for p in client.get(f"/api/beats/{beat}").json()["beatmakers"]] == [
        dest["id"],
        guest["id"],
    ]
    assert client.post("/api/library/refresh", headers=headers).status_code == 200
    assert client.get("/api/beatmakers").json()["total"] == 2
    assert client.delete(f"/api/beatmakers/{dest['id']}", headers=headers).json()["deleted"]
    assert client.get(url).status_code == 404
    assert client.get("/api/beats", params={"profile_ids": owner["id"]}).json()["total"] == 0
    assert client.post("/api/library/refresh", headers=headers).status_code == 200
    assert [p["id"] for p in client.get(f"/api/beats/{beat}").json()["beatmakers"]] == [guest["id"]]
    assert client.get("/api/beatmakers").json()["total"] == 1
    assert client.post("/api/library/close", headers=headers).status_code == 200
    lib = Library.open(root)
    try:
        second = add_beat(lib)
        with lib.catalog() as c:
            assert [
                r[0]
                for r in c.execute(
                    "SELECT profile_id FROM beat_profile_links WHERE beat_id=?", (second,)
                )
            ] == [guest["id"]]
        restored = save_profile(lib, ProfileUpdate(name="LACCO"))
        with lib.catalog() as c:
            assign_profiles(c, second, [restored["id"], guest["id"]])
        third = add_beat(lib)
        with lib.catalog() as c:
            assert {
                r[0]
                for r in c.execute(
                    "SELECT profile_id FROM beat_profile_links WHERE beat_id=?", (third,)
                )
            } == {restored["id"], guest["id"]}
    finally:
        lib.close()


def test_same_profile_both_collaborators_deduplicated_and_links_preserved(tmp_path):
    lib = Library.create(tmp_path / "Library")
    try:
        beat = add_beat(lib, "Aaa x Bbb")
        a, b = list_profiles(lib)["profiles"]
        with lib.catalog() as c:
            c.execute(
                "UPDATE beatmaker_profiles SET socials=? WHERE id=?",
                (json.dumps(["https://a.org"]), a["id"]),
            )
            c.execute(
                "UPDATE beatmaker_profiles SET stores=? WHERE id=?",
                (json.dumps(["https://b.org"]), b["id"]),
            )
        merge_profiles(lib, a["id"], b["id"])
        p = get_profile(lib, a["id"])
        assert (
            p["beat_count"] == 1
            and p["socials"] == ["https://a.org"]
            and p["stores"] == ["https://b.org"]
        )
        refresh_beatmakers(lib)
        assert get_profile(lib, b["id"])["beat_count"] == 1
        with lib.catalog() as c:
            assert (
                c.execute(
                    "SELECT COUNT(*) FROM beat_profile_links WHERE beat_id=?", (beat,)
                ).fetchone()[0]
                == 1
            )
    finally:
        lib.close()


def test_new_stable_channel_id_reuses_legacy_profile_and_deleted_credit(tmp_path):
    lib = Library.create(tmp_path / "Library")
    try:
        add_beat(lib, "Samoss", channel="Samoss")
        p = list_profiles(lib)["profiles"][0]
        second = add_beat(lib, "SamossProd", channel="Samoss")
        with lib.catalog() as c:
            c.execute("UPDATE beats SET channel_id=? WHERE id=?", ("UC" + "a" * 22, second))
            sync_profiles(c, c.execute("SELECT * FROM beats WHERE id=?", (second,)).fetchone())
        assert list_profiles(lib)["total"] == 1 and get_profile(lib, p["id"])["beat_count"] == 2
        delete_profile(lib, p["id"])
        refresh_beatmakers(lib)
        assert list_profiles(lib)["total"] == 0
    finally:
        lib.close()


def test_migration_identity_failure_rolls_back(tmp_path, monkeypatch):
    root = tmp_path / "Library"
    with monkeypatch.context() as ctx:
        ctx.setattr(storage, "MIGRATIONS", {i: p for i, p in storage.MIGRATIONS.items() if i <= 3})
        lib = Library.create(root)
        add_beat(lib)
        lib.close()

    def fail(c):
        raise LibraryError("Controlled failure")

    monkeypatch.setattr("yt_beat_m.profiles.repair_identities", fail)
    with pytest.raises(LibraryError):
        Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 3
        assert c.execute("SELECT COUNT(*) FROM beatmaker_profiles").fetchone()[0] == 2
        assert not c.execute("SELECT 1 FROM sqlite_master WHERE name='profile_sources'").fetchone()
    assert len(list((root / "backups").glob("catalog-v3-*.sqlite3"))) == 1
