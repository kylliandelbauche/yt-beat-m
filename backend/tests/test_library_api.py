from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.library import Library


def test_selection_is_protected_persistent_and_releases_lock(tmp_path):
    config = tmp_path / "preferences.json"
    root = tmp_path / "Ma collection"
    app = create_app(frontend=tmp_path / "dist", preferences=config)
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        assert client.get("/api/library").json()["library"] is None
        body = {"path": str(root), "create": True, "name": "Collection"}
        assert client.post("/api/library", json=body).status_code == 403
        assert not root.exists()
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        selected = client.post("/api/library", json=body, headers=headers)
        assert selected.status_code == 200
        identity = selected.json()["library"]["id"]
        assert client.get("/api/library").json()["library"]["id"] == identity
        assert client.post("/api/library", json=body, headers=headers).status_code == 400
        assert client.post("/api/library/close", headers=headers).json()["library"] is None
        library = Library.open(root)
        library.close()
    # Simulate a fresh engine using the machine-local selection.
    with TestClient(
        create_app(frontend=tmp_path / "dist", preferences=config),
        base_url="http://127.0.0.1:8765",
    ) as restarted:
        assert restarted.get("/api/library").json()["library"]["id"] == identity
    library = Library.open(root)
    library.close()


def test_invalid_selection_does_not_create_data(tmp_path):
    with TestClient(
        create_app(frontend=tmp_path / "dist", preferences=tmp_path / "preferences.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        missing = tmp_path / "not-connected"
        assert (
            client.post("/api/library", json={"path": str(missing)}, headers=headers).status_code
            == 400
        )
        assert not missing.exists()
        assert (
            client.post("/api/library", json={"path": "relative"}, headers=headers).status_code
            == 400
        )
        assert client.get("/api/library").json()["library"] is None
