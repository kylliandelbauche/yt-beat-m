import json
import subprocess
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.directory_picker import MAC_SCRIPT, WINDOWS_SCRIPT, DirectoryPicker
from yt_beat_m.library import LibraryBusyError, LibraryError


@pytest.mark.parametrize(
    "system,path,output",
    [
        (
            "darwin",
            "/Volumes/Disque musique/Été d'hiver/",
            "/Volumes/Disque musique/Été d'hiver/\n",
        ),
        ("win32", "D:\\Été d'hiver\\Mes prods", json.dumps({"path": "D:\\Été d'hiver\\Mes prods"})),
    ],
)
def test_native_commands_preserve_selected_paths_without_shell(monkeypatch, system, path, output):
    runner = Mock(return_value=subprocess.CompletedProcess([], 0, output, ""))
    monkeypatch.setattr(subprocess, "run", runner)
    assert DirectoryPicker(system).choose() == path
    args, kwargs = runner.call_args
    command = args[0]
    assert kwargs["timeout"] == 300 and kwargs["encoding"] == "utf-8"
    assert "shell" not in kwargs
    if system == "darwin":
        assert command == ["/usr/bin/osascript", "-e", MAC_SCRIPT]
        assert "on error number -128" in MAC_SCRIPT
    else:
        assert command[0] == "powershell.exe" and "-STA" in command
        assert command[-1] == WINDOWS_SCRIPT
        assert kwargs["creationflags"] == 0x08000000
        assert "$dialog.Dispose()" in WINDOWS_SCRIPT


@pytest.mark.parametrize("system,output", [("darwin", "\n"), ("win32", '{"path":null}\n')])
def test_cancellation_is_not_an_error(monkeypatch, system, output):
    monkeypatch.setattr(
        subprocess, "run", lambda *a, **k: subprocess.CompletedProcess([], 0, output, "")
    )
    assert DirectoryPicker(system).choose() is None


@pytest.mark.parametrize(
    "failure",
    [
        FileNotFoundError(),
        subprocess.CalledProcessError(1, ["picker"]),
        subprocess.TimeoutExpired(["picker"], 300),
    ],
)
def test_picker_failure_is_recoverable_and_releases_dialog_lock(monkeypatch, failure):
    runner = Mock(side_effect=[failure, subprocess.CompletedProcess([], 0, "/chosen/\n", "")])
    monkeypatch.setattr(subprocess, "run", runner)
    picker = DirectoryPicker("darwin")
    with pytest.raises(LibraryError, match="chemin"):
        picker.choose()
    assert picker.choose() == "/chosen/"


@pytest.mark.parametrize("output", ['{"path":42}', "[]", "not-json"])
def test_invalid_native_response_gives_a_recoverable_error(monkeypatch, output):
    monkeypatch.setattr(
        subprocess, "run", lambda *a, **k: subprocess.CompletedProcess([], 0, output, "")
    )
    with pytest.raises(LibraryError, match="sélecteur"):
        DirectoryPicker("win32").choose()


def test_refuses_concurrent_dialogs_and_unsupported_os(monkeypatch):
    runner = Mock()
    monkeypatch.setattr(subprocess, "run", runner)
    picker = DirectoryPicker("darwin")
    picker._lock.acquire()
    try:
        with pytest.raises(LibraryBusyError, match="déjà ouverte"):
            picker.choose()
    finally:
        picker._lock.release()
    with pytest.raises(LibraryError, match="Mac et Windows"):
        DirectoryPicker("unsupported").choose()
    runner.assert_not_called()


def test_api_picker_is_protected_and_does_not_select_or_create_a_library(monkeypatch, tmp_path):
    chosen = tmp_path / "Dossier choisi avec accents été"
    chooser = Mock(side_effect=[str(chosen), None, LibraryBusyError("Déjà ouverte.")])
    monkeypatch.setattr(DirectoryPicker, "choose", chooser)
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "prefs.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        path = "/api/library/pick-folder"
        token = client.get("/api/session").json()["token"]
        assert client.get(path).status_code == 405
        assert client.post(path).status_code == 403
        assert (
            client.post(
                path, headers={"Origin": "https://external.test", "X-Session-Token": token}
            ).status_code
            == 403
        )
        chooser.assert_not_called()
        headers = {"Origin": "http://127.0.0.1:8765", "X-Session-Token": token}
        assert client.post(path, headers=headers).json() == {"path": str(chosen)}
        assert client.post(path, headers=headers).json() == {"path": None}
        assert client.post(path, headers=headers).status_code == 409
        assert client.get("/api/library").json()["library"] is None
        assert not chosen.exists() and not (tmp_path / "prefs.json").exists()
