import ctypes
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from yt_beat_m import reveal
from yt_beat_m.library import LibraryError


def test_mac_selects_exact_unicode_file_without_shell(monkeypatch, tmp_path):
    path = tmp_path / "L'été, $prod ' & beat.mp3"
    run = Mock()
    monkeypatch.setattr(reveal.sys, "platform", "darwin")
    monkeypatch.setattr(reveal.subprocess, "run", run)
    reveal.reveal_file(path)
    run.assert_called_once_with(
        ["/usr/bin/open", "-R", str(path)],
        check=True,
        capture_output=True,
        timeout=10,
    )


@pytest.mark.parametrize(
    "error",
    [
        OSError("private path"),
        subprocess.TimeoutExpired("open", 10),
        subprocess.CalledProcessError(1, "open"),
    ],
)
def test_native_errors_are_recoverable_and_sanitized(monkeypatch, error):
    monkeypatch.setattr(reveal.sys, "platform", "darwin")
    monkeypatch.setattr(reveal.subprocess, "run", Mock(side_effect=error))
    with pytest.raises(LibraryError, match="réessaie") as caught:
        reveal.reveal_file(Path("/private.mp3"))
    assert "private" not in str(caught.value)


@pytest.mark.parametrize("failure", [None, "parse", "select", "init", "other_apartment"])
def test_windows_shell_selects_item_and_releases_com(monkeypatch, failure):
    ole = SimpleNamespace(CoInitialize=Mock(), CoUninitialize=Mock(), CoTaskMemFree=Mock())
    shell = SimpleNamespace(SHParseDisplayName=Mock(), SHOpenFolderAndSelectItems=Mock())

    def parse(path, context, pointer, flags, attributes):
        ctypes.cast(pointer, ctypes.POINTER(ctypes.c_void_p))[0] = 123
        if failure == "parse":
            raise OSError("parse failed")

    shell.SHParseDisplayName.side_effect = parse
    if failure == "select":
        shell.SHOpenFolderAndSelectItems.side_effect = OSError("select failed")
    if failure in {"init", "other_apartment"}:
        error = OSError("init failed")
        error.winerror = -2147417850 if failure == "other_apartment" else -1
        ole.CoInitialize.side_effect = error
    monkeypatch.setattr(
        reveal.ctypes, "OleDLL", lambda name: ole if name == "ole32" else shell, raising=False
    )
    monkeypatch.setattr(reveal.sys, "platform", "win32")
    path = Path("E:/Prods été/L'idée, prod.mp3")
    if failure in {"parse", "select", "init"}:
        with pytest.raises(LibraryError):
            reveal.reveal_file(path)
    else:
        reveal.reveal_file(path)
        assert shell.SHParseDisplayName.call_args.args[0] == str(path)
        args = shell.SHOpenFolderAndSelectItems.call_args.args
        assert args[0].value == 123
        assert args[1:] == (0, None, 0)
    assert ole.CoUninitialize.call_count == (0 if failure in {"init", "other_apartment"} else 1)
    assert ole.CoTaskMemFree.call_count == (0 if failure == "init" else 1)


def test_unsupported_platform_does_not_launch_anything(monkeypatch):
    monkeypatch.setattr(reveal.sys, "platform", "linux")
    with pytest.raises(LibraryError, match="Mac et Windows"):
        reveal.reveal_file(Path("/beat.mp3"))
