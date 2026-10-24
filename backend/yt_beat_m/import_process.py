"""Bounded subprocess execution with process-tree cancellation on Mac and Windows."""

import os
import signal
import subprocess
import threading

from yt_beat_m.library import LibraryError


class ImportInterrupted(Exception):
    pass


class ProcessRunner:
    def __init__(self, stopping: threading.Event):
        self.stopping = stopping
        self._lock = threading.Lock()
        self._process = None

    def cancel(self, expected=None):
        with self._lock:
            process = self._process
            if (
                process is None
                or process.poll() is not None
                or (expected is not None and process is not expected)
            ):
                return
            try:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        capture_output=True,
                        timeout=5,
                        check=False,
                    )
                    if process.poll() is None:
                        process.kill()
                else:
                    os.killpg(process.pid, signal.SIGKILL)
            except (OSError, subprocess.SubprocessError):
                if process.poll() is None:
                    process.kill()

    def run(self, args: list[str], on_line=None, *, timeout: float = 600) -> str:
        if self.stopping.is_set():
            raise ImportInterrupted
        timed_out = threading.Event()

        def expire():
            timed_out.set()
            self.cancel(expected=process)

        with self._lock:
            if self.stopping.is_set():
                raise ImportInterrupted
            options = (
                {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
                if os.name == "nt"
                else {"start_new_session": True}
            )
            self._process = process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                **options,
            )
        timer = threading.Timer(timeout, expire)
        timer.daemon = True
        timer.start()
        output, size = [], 0
        try:
            for line in process.stdout:
                size += len(line)
                if size > 8 * 1024 * 1024:
                    raise LibraryError("La réponse du téléchargeur dépasse la limite autorisée.")
                output.append(line)
                if self.stopping.is_set():
                    raise ImportInterrupted
                if on_line:
                    on_line(line.strip())
            code = process.wait()
            if self.stopping.is_set():
                raise ImportInterrupted
            if timed_out.is_set():
                raise LibraryError("Le téléchargement a dépassé le délai. Réessaie plus tard.")
            result = "".join(output)
            if code:
                hint = (
                    "Vidéo indisponible ou téléchargement impossible. "
                    "Vérifier le lien et le réseau."
                )
                lower = result.lower()
                if "sign in" in lower or "bot" in lower:
                    hint = (
                        "YouTube demande une vérification pour cette vidéo. "
                        "Réessaie plus tard ; aucun cookie n’est récupéré."
                    )
                elif "no space" in lower or "disk full" in lower:
                    hint = "Le disque est plein. Libérer de l’espace avant de réessayer."
                raise LibraryError(hint)
            return result
        finally:
            timer.cancel()
            self.cancel(expected=process)
            process.wait(timeout=6)
            process.stdout.close()
            with self._lock:
                self._process = None
