"""Select a validated local MP3 in the system file manager, never play it."""

import ctypes
import subprocess
import sys
from pathlib import Path

from yt_beat_m.library import LibraryError


def _windows_reveal(path: Path) -> None:
    # A PIDL avoids Explorer command-line quoting ambiguities (spaces, commas, Unicode).
    ole = ctypes.OleDLL("ole32")
    shell = ctypes.OleDLL("shell32")
    ole.CoInitialize.argtypes = [ctypes.c_void_p]
    ole.CoInitialize.restype = ctypes.c_int32
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole.CoTaskMemFree.restype = None
    ole.CoUninitialize.argtypes = []
    ole.CoUninitialize.restype = None
    shell.SHParseDisplayName.argtypes = [
        ctypes.c_wchar_p,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.c_uint32,
        ctypes.c_void_p,
    ]
    shell.SHParseDisplayName.restype = ctypes.c_int32
    shell.SHOpenFolderAndSelectItems.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.c_uint32,
    ]
    shell.SHOpenFolderAndSelectItems.restype = ctypes.c_int32
    initialized = False
    item = ctypes.c_void_p()
    try:
        try:
            ole.CoInitialize(None)
            initialized = True
        except OSError as exc:
            # A pre-existing apartment may use another model; COM is already available.
            if getattr(exc, "winerror", None) != -2147417850:  # RPC_E_CHANGED_MODE
                raise
        shell.SHParseDisplayName(str(path), None, ctypes.byref(item), 0, None)
        shell.SHOpenFolderAndSelectItems(item, 0, None, 0)
    finally:
        if item.value:
            ole.CoTaskMemFree(item)
        if initialized:
            ole.CoUninitialize()


def reveal_file(path: Path) -> None:
    try:
        if sys.platform == "darwin":
            subprocess.run(
                ["/usr/bin/open", "-R", str(path)],
                check=True,
                capture_output=True,
                timeout=10,
            )
        elif sys.platform == "win32":
            _windows_reveal(path)
        else:
            raise LibraryError("La localisation du fichier est disponible sur Mac et Windows.")
    except (OSError, subprocess.SubprocessError) as exc:
        raise LibraryError(
            "Impossible d’afficher le fichier. Vérifie le disque et réessaie."
        ) from exc
