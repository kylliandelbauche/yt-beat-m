import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(frontend=tmp_path, preferences=tmp_path / "preferences.json")

    @app.post("/api/test-action")
    def protected_action():
        return {"changed": True}

    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        yield client


def test_health_and_missing_frontend_are_explicit(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/").status_code == 503


def test_rejects_external_hosts_and_origins(client):
    assert client.get("/api/session", headers={"Host": "attacker.test:8765"}).status_code == 400
    assert (
        client.get("/api/session", headers={"Origin": "https://attacker.test"}).status_code == 403
    )
    assert client.get("/api/session", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_mutation_requires_origin_and_current_token(client):
    token = client.get("/api/session").json()["token"]
    assert client.post("/api/test-action").status_code == 403
    assert client.post("/api/test-action", headers={"X-Session-Token": token}).status_code == 403
    headers = {"Origin": "http://127.0.0.1:8765", "X-Session-Token": token}
    assert client.post("/api/test-action", headers=headers).json() == {"changed": True}
    headers["Origin"] = "https://attacker.test"
    assert client.post("/api/test-action", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/test-action",
            headers=[(b"origin", b"http://127.0.0.1:8765"), (b"x-session-token", b"\xff")],
        ).status_code
        == 403
    )


def test_stale_token_is_rejected(client, tmp_path):
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "preferences.json"),
        base_url="http://127.0.0.1:8765",
    ) as old:
        token = old.get("/api/session").json()["token"]
    headers = {"Origin": "http://127.0.0.1:8765", "X-Session-Token": token}
    assert client.post("/api/test-action", headers=headers).status_code == 403


def test_compiled_interface_is_served_safely(tmp_path):
    (tmp_path / "index.html").write_text("<html>YT Beat M</html>", encoding="utf-8")
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "preferences.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
        assert client.get("/api/missing").status_code == 404


def test_dev_origin_is_opt_in(tmp_path):
    origin = {"Origin": "http://127.0.0.1:5173"}
    for enabled, expected in ((False, 403), (True, 200)):
        with TestClient(
            create_app(dev=enabled, frontend=tmp_path, preferences=tmp_path / "preferences.json"),
            base_url="http://127.0.0.1:8765",
        ) as client:
            assert client.get("/api/session", headers=origin).status_code == expected
