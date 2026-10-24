import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.catalog import beat_details, list_beats, set_favorite
from yt_beat_m.library import Library


@pytest.fixture
def catalog(tmp_path):
    library = Library.create(tmp_path / "library")
    identities = []
    with library.catalog() as connection:
        for title, maker, channel in (
            ("R&B Mélancolique", "Nova", "Archives"),
            ("Drill minuit", "Ryo", None),
        ):
            identity = str(uuid4())
            identities.append(identity)
            connection.execute(
                "INSERT INTO beats(id,title,beatmaker,channel,audio_path,added_at,published_on) "
                "VALUES(?,?,?,?,?,'2026-10-24T12:00:00Z',NULL)",
                (identity, title, maker, channel, f"audio/{identity}.mp3"),
            )
        connection.execute("INSERT INTO tags VALUES(1,'mood','Mélancolique','melancolique')")
        connection.execute("INSERT INTO beat_tags VALUES(?,1)", (identities[0],))
        connection.execute(
            "INSERT INTO source_links(beat_id,url,label,provenance) VALUES(?,?,?,?)",
            (identities[0], "https://example.org/beat", "Source", "fixture"),
        )
    yield library, identities
    library.close()


def test_search_combines_terms_and_favorites_without_sql_wildcards(catalog):
    library, identities = catalog
    assert list_beats(library, 48, 0, "MELANCOLIQUE nova")["beats"][0]["id"] == identities[0]
    assert list_beats(library, 48, 0, "archives")["total"] == 1
    assert list_beats(library, 48, 0, "%")["total"] == 0
    assert list_beats(library, 48, 0, "' OR 1=1 --")["total"] == 0
    assert list_beats(library, 48, 0, favorites=True)["total"] == 0
    assert set_favorite(library, identities[0], True)
    assert list_beats(library, 48, 0, "nova", True)["total"] == 1
    assert list_beats(library, 48, 0, "drill", True)["total"] == 0
    assert list_beats(library, 1, 1)["total"] == 2
    assert len(list_beats(library, 1, 1)["beats"]) == 1


def test_details_preserve_source_dates_tags_and_missing_fields(catalog):
    library, identities = catalog
    result = beat_details(library, identities[0])
    assert result["published_on"] is None
    assert result["added_at"] == "2026-10-24T12:00:00Z"
    assert result["beatmaker"] == "Nova" and result["channel"] == "Archives"
    assert result["bpm"] is None and result["styles"] == []
    assert result["moods"] == ["Mélancolique"]
    assert result["links"][0]["url"] == "https://example.org/beat"
    assert beat_details(library, str(uuid4())) is None


def test_favorite_api_is_protected_and_survives_restart(catalog, tmp_path):
    library, identities = catalog
    root = library.root
    identity = library.manifest["id"]
    library.close()
    preferences = tmp_path / "preferences.json"
    preferences.write_text(json.dumps({"library_root": str(root), "library_id": identity}))
    with TestClient(
        create_app(frontend=tmp_path, preferences=preferences), base_url="http://127.0.0.1:8765"
    ) as client:
        path = f"/api/beats/{identities[0]}/favorite"
        assert client.patch(path, json={"favorite": True}).status_code == 403
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert client.patch(path, json={"favorite": True}, headers=headers).status_code == 200
        assert client.get(f"/api/beats/{identities[0]}").json()["favorite"] is True
        assert client.get(f"/api/beats/{uuid4()}").status_code == 404
        assert (
            client.patch(
                f"/api/beats/{uuid4()}/favorite", json={"favorite": True}, headers=headers
            ).status_code
            == 404
        )
    with TestClient(
        create_app(frontend=tmp_path, preferences=preferences), base_url="http://127.0.0.1:8765"
    ) as restarted:
        assert restarted.get("/api/beats?favorites=true&q=melancolique").json()["total"] == 1
