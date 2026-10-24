"""Machine-local selection of a portable library; never silently recreate data."""

import json
import threading
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from yt_beat_m.library import Library, LibraryError, absolute_root


class LibraryManager:
    def __init__(self, preferences: Path):
        self.preferences = preferences
        self.library: Library | None = None
        self.error: str | None = None
        self._mutex = threading.RLock()

    def restore(self) -> None:
        if not self.preferences.exists():
            return
        try:
            selected = json.loads(self.preferences.read_text(encoding="utf-8"))
            self.library = Library.open(selected["library_root"])
            if self.library.manifest["id"] != selected["library_id"]:
                self.library.close()
                self.library = None
                raise LibraryError("Le dossier mémorisé contient une autre bibliothèque.")
        except (OSError, ValueError, KeyError, TypeError, LibraryError):
            if self.library:
                self.library.close()
                self.library = None
            self.error = (
                "La bibliothèque mémorisée est indisponible. Rebrancher le disque puis l’ouvrir."
            )

    def select(self, value: str, *, create: bool = False, name: str = "Ma bibliothèque") -> dict:
        with self._mutex:
            root = absolute_root(value)
            if self.library and self.library.root == root:
                if create:
                    raise LibraryError("Cette bibliothèque existe déjà ; utiliser Ouvrir.")
                return self.library.summary()
            candidate = Library.create(root, name) if create else Library.open(root)
            try:
                summary = candidate.summary()
                self.preferences.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.preferences.with_name(f"preferences-{uuid4()}.tmp")
                try:
                    temporary.write_text(
                        json.dumps({"library_root": str(root), "library_id": summary["id"]}),
                        encoding="utf-8",
                    )
                    temporary.replace(self.preferences)
                finally:
                    temporary.unlink(missing_ok=True)
            except Exception:
                candidate.close()
                raise
            previous = self.library
            self.library = candidate
            self.error = None
            if previous:
                previous.close()
            return summary

    def status(self) -> dict:
        with self._mutex:
            if self.library:
                try:
                    return {"library": self.library.summary(), "error": None}
                except LibraryError as exc:
                    return {"library": None, "error": str(exc)}
            return {"library": None, "error": self.error}

    @contextmanager
    def active(self):
        """Keep library selection stable for the duration of an operation."""
        with self._mutex:
            if self.library is None:
                raise LibraryError("Ouvrir une bibliothèque avant cette opération.")
            yield self.library

    def close(self) -> None:
        with self._mutex:
            if self.library:
                self.library.close()
                self.library = None
            self.error = None
