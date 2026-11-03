"""Regression evidence for the reviewed local-library CodeQL data flows."""

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.library import Library


def session(client):
    return {
        "Origin": "http://127.0.0.1:8765",
        "X-Session-Token": client.get("/api/session").json()["token"],
    }


def test_arbitrary_library_root_requires_local_authorization_before_any_write(tmp_path):
    preferences = tmp_path / "config" / "preferences.json"
    device = tmp_path / "device"
    device.mkdir()
    chosen = device / "Collection été"
    payload = {"path": str(chosen), "create": True}
    with TestClient(
        create_app(preferences=preferences, frontend=tmp_path / "dist"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = session(client)
        for wrong_headers, status in (
            ({}, 403),
            ({"Origin": headers["Origin"]}, 403),
            ({**headers, "X-Session-Token": "invalid"}, 403),
            ({**headers, "Origin": "https://external.example"}, 403),
            ({**headers, "Host": "external.example:8765"}, 400),
            ({**headers, "Sec-Fetch-Site": "cross-site"}, 403),
        ):
            response = client.post("/api/library", headers=wrong_headers, json=payload)
            assert response.status_code == status
            assert not chosen.exists() and not preferences.exists()
        response = client.post(
            "/api/library", headers=headers, json={**payload, "path": "relative-folder"}
        )
        assert response.status_code == 400
        assert not chosen.exists() and not preferences.exists()

        # A root outside the settings folder is an intentional product capability.
        opened = client.post("/api/library", headers=headers, json=payload)
        assert opened.status_code == 200
        identity = opened.json()["library"]["id"]
        assert Path(opened.json()["library"]["root"]) == chosen.resolve()
        assert client.get("/api/library").json()["library"]["id"] == identity
        assert client.post("/api/library/close", headers=headers).json() == {
            "library": None,
            "error": None,
        }
        reopened = client.post("/api/library", headers=headers, json={"path": str(chosen)})
        assert reopened.status_code == 200 and reopened.json()["library"]["id"] == identity


@pytest.mark.parametrize("kind", ["sqlite", "filesystem", "manifest"])
def test_library_status_sanitizes_technical_errors_and_close_clears_them(
    tmp_path, monkeypatch, kind
):
    preferences = tmp_path / "preferences.json"
    root = tmp_path / "collection"
    private_marker = "INTERNAL_TEST_DETAIL_41397"
    with TestClient(
        create_app(preferences=preferences, frontend=tmp_path / "dist"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = session(client)
        assert client.post(
            "/api/library", headers=headers, json={"path": str(root), "create": True}
        ).is_success
        manifest = root / "library.json"
        original = manifest.read_bytes()
        try:
            with monkeypatch.context() as patch:
                if kind == "manifest":
                    manifest.write_text(private_marker)
                else:

                    def broken_connection(self, **kwargs):
                        if kind == "sqlite":
                            raise sqlite3.OperationalError(
                                f"SELECT private_column FROM {private_marker}"
                            )
                        raise PermissionError(13, private_marker, str(root / "private.db"))

                    patch.setattr(Library, "_connect", broken_connection)
                response = client.get("/api/library")
                assert response.status_code == 200
                assert response.json() == {
                    "library": None,
                    "error": (
                        "Ce dossier ne contient pas de manifeste de bibliothèque valide."
                        if kind == "manifest"
                        else "Le catalogue est indisponible ou l’écriture a échoué."
                    ),
                }
                for detail in (private_marker, str(root), "SELECT", "Traceback"):
                    assert detail not in response.text
        finally:
            manifest.write_bytes(original)
        assert client.post("/api/library/close", headers=headers).json() == {
            "library": None,
            "error": None,
        }
        assert client.get("/api/library").json() == {"library": None, "error": None}
