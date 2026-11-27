"""Exercise the installed Windows package with synthetic data, never a personal library."""

import base64
import ctypes
import hashlib
import http.client
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import UUID

import psutil
from yt_beat_m.library import Library

ROOT = Path(__file__).resolve().parents[1]


def window(pid, *, close=False):
    """Inspect only this process's visible window; post the ordinary Close action."""
    from ctypes import wintypes

    user = ctypes.WinDLL("user32", use_last_error=True)
    callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user.EnumWindows.argtypes = [callback, wintypes.LPARAM]
    user.EnumWindows.restype = wintypes.BOOL
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetWindowThreadProcessId.restype = wintypes.DWORD
    user.IsWindowVisible.argtypes = [wintypes.HWND]
    user.IsWindowVisible.restype = wintypes.BOOL
    user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user.GetWindowTextW.restype = ctypes.c_int
    user.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user.PostMessageW.restype = wintypes.BOOL
    found = (0, "")

    @callback
    def inspect(handle, _):
        nonlocal found
        owner = wintypes.DWORD()
        user.GetWindowThreadProcessId(handle, ctypes.byref(owner))
        if owner.value == pid and user.IsWindowVisible(handle):
            title = ctypes.create_unicode_buffer(512)
            user.GetWindowTextW(handle, title, len(title))
            found = (handle, title.value)
            return False
        return True

    user.EnumWindows(inspect, 0)
    if close and found[0]:
        assert user.PostMessageW(found[0], 0x0010, 0, 0), "Could not request window closure"
    return found


def state(pid):
    try:
        children = psutil.Process(pid).children()
        engine = next((p for p in children if p.name() == "beat-m-engine.exe"), None)
        if engine is None:
            return None
        handle, title = window(pid)
        port = next(
            (
                c.laddr.port
                for c in engine.net_connections(kind="tcp4")
                if c.status == psutil.CONN_LISTEN and c.laddr.ip == "127.0.0.1"
            ),
            None,
        )
        return {
            "engine": engine.pid,
            "port": port,
            "window": handle,
            "title": title,
            "webview": any(p.name() == "msedgewebview2.exe" for p in children),
        }
    except psutil.NoSuchProcess:
        return None


def request(port, method, path, body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        c.request(method, path, body, headers or {})
        r = c.getresponse()
        return r.status, r.read()
    finally:
        c.close()


def stop(process):
    if process.poll() is None:
        window(process.pid, close=True)
        try:
            process.wait(timeout=50)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
            raise AssertionError("Windows application did not exit normally") from None
    assert process.returncode == 0, "Windows application failed"


def main():
    if os.name != "nt":
        raise SystemExit("Run this installer check on Windows.")
    installers = list((ROOT / "desktop/src-tauri/target/release/bundle/nsis").glob("*-setup.exe"))
    assert len(installers) == 1, "Expected exactly one Windows installer"
    installer = installers[0]
    with tempfile.TemporaryDirectory(
        prefix="beat-m-install-", ignore_cleanup_errors=True
    ) as folder:
        root = Path(folder)
        installed = root / "app"
        subprocess.run([str(installer), "/S", f"/D={installed}"], check=True, timeout=180)
        binary = installed / "beat-m-desktop.exe"
        assert binary.is_file(), "Installer did not install the application"
        library = Library.create(root / "Disque été", "Windows test")
        identity = str(UUID(int=132))
        audio = base64.b64decode((ROOT / "backend/tests/fixtures/long-tone.mp3.base64").read_text())
        media = library.safe_path("audio/Été de test.mp3")
        media.write_bytes(audio)
        with library.catalog() as c:
            c.execute(
                "INSERT INTO beats(id,title,audio_path,added_at) VALUES(?,?,?,?)",
                (identity, "Windows test", "audio/Été de test.mp3", "2026-11-25T00:00:00Z"),
            )
        preferences = root / "preferences.json"
        preferences.write_text(
            json.dumps({"library_root": str(library.root), "library_id": library.manifest["id"]}),
            encoding="utf-8",
        )
        library.close()
        system = Path(os.environ["SystemRoot"])
        env = {
            **os.environ,
            "BEAT_M_DESKTOP_PREFERENCES": str(preferences),
            "PATH": os.pathsep.join((str(system / "System32"), str(system))),
        }
        for expected in (False, True):
            app = subprocess.Popen(
                [str(binary)], env=env, creationflags=subprocess.CREATE_NO_WINDOW
            )
            info = None
            try:
                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    assert app.poll() is None, "Installed application exited during startup"
                    info = state(app.pid)
                    if info and info.get("port") and info.get("window") and info.get("webview"):
                        break
                    time.sleep(0.2)
                assert info and info.get("port") and info.get("window") and info.get("webview")
                assert "Prototype" in info["title"] and "impossible" not in info["title"]
                port = info["port"]
                assert request(port, "GET", "/api/health")[0] == 200
                assert request(port, "GET", "/")[0] == 200
                status, body = request(
                    port, "GET", f"/api/beats/{identity}/audio", headers={"Range": "bytes=32-63"}
                )
                assert status == 206 and body == audio[32:64]
                status, body = request(port, "GET", f"/api/beats/{identity}")
                assert status == 200 and json.loads(body)["favorite"] is expected
                token = json.loads(request(port, "GET", "/api/session")[1])["token"]
                headers = {
                    "Origin": f"http://127.0.0.1:{port}",
                    "Content-Type": "application/json",
                    "X-Session-Token": token,
                }
                assert (
                    request(
                        port,
                        "PATCH",
                        f"/api/beats/{identity}/favorite",
                        '{"favorite":true}',
                        headers,
                    )[0]
                    == 200
                )
            finally:
                stop(app)
            assert info and not psutil.pid_exists(info["engine"]), (
                "Owned engine survived window closure"
            )
        assert media.read_bytes() == audio
    report = {
        "installer": installer.name,
        "sha256": hashlib.sha256(installer.read_bytes()).hexdigest(),
        "checks": [
            "installed",
            "native-window",
            "webview2",
            "minimal-path",
            "range",
            "persistence",
            "restart",
            "owned-engine-stop",
            "media-preserved",
        ],
        "manual_pending": ["physical-listening", "native-file-dialog-interaction", "DAW"],
    }
    output = ROOT / ".local/windows-package-report.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Windows package checks passed; report contains no paths or session tokens.")


if __name__ == "__main__":
    main()
