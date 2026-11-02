"""Native folder selection on the machine running the local engine."""

import json
import subprocess
import sys
import threading

from yt_beat_m.library import LibraryBusyError, LibraryError

MAC_SCRIPT = """
activate
try
    return POSIX path of (choose folder with prompt "Choisir le dossier de bibliothèque Beat m")
on error number -128
    return ""
end try
"""
WINDOWS_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choisir le dossier de bibliothèque Beat m'
$dialog.ShowNewFolderButton = $true
try {
    $path = $null
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $path = $dialog.SelectedPath
    }
    ConvertTo-Json -InputObject @{path=$path} -Compress
} finally {
    $dialog.Dispose()
}
"""


class DirectoryPicker:
    def __init__(self, system: str | None = None, *, audio: bool = False):
        self.system = system or sys.platform
        self.audio = audio
        self._lock = threading.Lock()

    def choose(self) -> str | None:
        if not self._lock.acquire(blocking=False):
            raise LibraryBusyError("Une fenêtre de sélection de dossier est déjà ouverte.")
        try:
            if self.system == "darwin":
                script = MAC_SCRIPT
                if self.audio:
                    script = script.replace(
                        'choose folder with prompt "Choisir le dossier de bibliothèque Beat m"',
                        'choose file with prompt "Choisir un MP3 pour le morceau" '
                        'of type {"public.mp3"}',
                    )
                command = ["/usr/bin/osascript", "-e", script]
            elif self.system == "win32" and not self.audio:
                command = [
                    "powershell.exe",
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-STA",
                    "-Command",
                    WINDOWS_SCRIPT,
                ]
            else:
                if self.audio:
                    raise LibraryError("Le sélecteur de MP3 est disponible sur Mac.")
                raise LibraryError(
                    "Sélecteur natif disponible sur Mac et Windows. Tu peux saisir le chemin."
                )
            try:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    check=True,
                    timeout=300,
                    **(
                        {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)}
                        if self.system == "win32"
                        else {}
                    ),
                )
                path = (
                    json.loads(result.stdout)["path"]
                    if self.system == "win32"
                    else result.stdout.removesuffix("\n")
                )
                if path is not None and not isinstance(path, str):
                    raise ValueError("Invalid folder result")
                return path or None
            except subprocess.TimeoutExpired as exc:
                raise LibraryError(
                    "La sélection de dossier a expiré. Réessaie ou saisis le chemin."
                ) from exc
            except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
                raise LibraryError(
                    "Impossible d’ouvrir le sélecteur de dossiers. Réessaie ou saisis le chemin."
                ) from exc
        finally:
            self._lock.release()
