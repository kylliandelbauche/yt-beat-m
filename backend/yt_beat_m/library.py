"""Portable library storage, locking and transactional schema migrations."""

import json
import sqlite3
import threading
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath, PureWindowsPath
from uuid import UUID, uuid4

import portalocker

FORMAT_VERSION = 1
MIGRATIONS = {
    1: Path(__file__).parent / "migrations" / "001_initial.sql",
    2: Path(__file__).parent / "migrations" / "002_beatmakers.sql",
    3: Path(__file__).parent / "migrations" / "003_profiles.sql",
    4: Path(__file__).parent / "migrations" / "004_profile_identity.sql",
    5: Path(__file__).parent / "migrations" / "005_common_tags.sql",
    6: Path(__file__).parent / "migrations" / "006_tag_names.sql",
    7: Path(__file__).parent / "migrations" / "007_songs.sql",
    8: Path(__file__).parent / "migrations" / "008_song_tags.sql",
}


class LibraryError(Exception):
    """A recoverable storage problem safe to display in the local interface."""


class LibraryBusyError(LibraryError):
    """Another engine holds the library lock."""


def absolute_root(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise LibraryError("Choisir un chemin de dossier absolu.")
    return path.resolve()


class Library:
    def __init__(self, root: Path, lock: portalocker.Lock):
        self.root = root
        self.lock = lock
        self.manifest: dict = {}
        self._mutex = threading.RLock()
        self._closed = False

    @classmethod
    def _acquire(cls, root: Path):
        if not root.is_dir():
            raise LibraryError("Le dossier de bibliothèque est absent ou inaccessible.")
        lock_path = root / ".library.lock"
        if lock_path.is_symlink():
            raise LibraryError("Le verrou ne peut pas être un lien symbolique.")
        lock = portalocker.Lock(lock_path, mode="a", timeout=0)
        try:
            lock.acquire()
        except portalocker.exceptions.LockException as exc:
            raise LibraryBusyError(
                "Cette bibliothèque est déjà ouverte par un autre moteur."
            ) from exc
        except OSError as exc:
            raise LibraryError(
                "Impossible de verrouiller ce dossier ; vérifier son accès."
            ) from exc
        return cls(root, lock)

    @classmethod
    def create(cls, value: str | Path, name: str = "Ma bibliothèque"):
        root = absolute_root(value)
        name = name.strip()
        if not name or len(name) > 120:
            raise LibraryError("Le nom doit contenir entre 1 et 120 caractères.")
        try:
            root.mkdir(
                exist_ok=True
            )  # Never create missing parents or silently choose another disk.
            library = cls._acquire(root)
        except OSError as exc:
            raise LibraryError(
                "Impossible de créer ce dossier ; vérifier son parent et son accès."
            ) from exc
        try:
            if any(path.name not in {".library.lock", ".DS_Store"} for path in root.iterdir()):
                raise LibraryError(
                    "Créer la bibliothèque dans un dossier vide ou ouvrir l’existante."
                )
            library.manifest = {
                "id": str(uuid4()),
                "format_version": FORMAT_VERSION,
                "name": name,
                "created_at": datetime.now(UTC).isoformat(),
            }
            for directory in ("audio", "artwork", "staging", "backups"):
                library.safe_path(directory).mkdir()
            library._migrate(creating=True)
            manifest_temp = library.safe_path(f"manifest-{uuid4()}.tmp")
            manifest_temp.write_text(
                json.dumps(library.manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            manifest_temp.replace(library.safe_path("library.json"))
            return library
        except Exception:
            library.close()
            raise

    @classmethod
    def open(cls, value: str | Path):
        library = cls._acquire(absolute_root(value))
        try:
            library.manifest = library._read_manifest()
            for directory in ("audio", "artwork", "staging", "backups"):
                if not library.safe_path(directory).is_dir():
                    raise LibraryError("Bibliothèque incomplète : un dossier de données manque.")
            if not library.safe_path("catalog.sqlite3").is_file():
                raise LibraryError("Le catalogue est absent ; aucun catalogue vide ne sera créé.")
            library._migrate()
            return library
        except Exception:
            library.close()
            raise

    def safe_path(self, relative: str) -> Path:
        path = PurePosixPath(relative)
        if (
            not relative
            or path.is_absolute()
            or PureWindowsPath(relative).drive
            or "\\" in relative
            or ":" in relative
            or ".." in path.parts
            or path.as_posix() != relative
            or not path.parts
        ):
            raise LibraryError("Chemin interne non valide.")
        resolved = (self.root / path).resolve()
        if not resolved.is_relative_to(self.root) or resolved == self.root:
            raise LibraryError("Le fichier doit rester dans la bibliothèque.")
        # Disallow even inward links for the catalogue and data directories.
        current = self.root
        for part in path.parts:
            current = current / part
            if current.is_symlink():
                raise LibraryError("Les liens symboliques internes ne sont pas pris en charge.")
        return resolved

    def _read_manifest(self) -> dict:
        try:
            manifest = json.loads(self.safe_path("library.json").read_text(encoding="utf-8"))
            if not isinstance(manifest, dict):
                raise ValueError("manifest")
            if type(manifest.get("format_version")) is not int:
                raise ValueError("format_version")
            if manifest["format_version"] > FORMAT_VERSION:
                raise LibraryError("Bibliothèque plus récente : mettre à jour l’application.")
            if manifest["format_version"] != FORMAT_VERSION:
                raise LibraryError("Version de bibliothèque non prise en charge.")
            UUID(manifest["id"])
            if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
                raise ValueError("name")
            return manifest
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            raise LibraryError(
                "Ce dossier ne contient pas de manifeste de bibliothèque valide."
            ) from exc

    def _connect(self, *, creating: bool = False) -> sqlite3.Connection:
        database = self.safe_path("catalog.sqlite3")
        for suffix in ("-journal", "-wal", "-shm"):
            self.safe_path(f"catalog.sqlite3{suffix}")
        connection = sqlite3.connect(
            database.as_uri() + ("?mode=rwc" if creating else "?mode=rw"), uri=True, timeout=5
        )
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA synchronous = FULL")
            return connection
        except Exception:
            connection.close()
            raise

    def _migrate(self, *, creating: bool = False) -> None:
        try:
            with closing(self._connect(creating=creating)) as connection:
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                if version > max(MIGRATIONS):
                    raise LibraryError("Catalogue plus récent : mettre à jour l’application.")
                if version:
                    recorded = connection.execute(
                        "SELECT MAX(version) FROM schema_migrations"
                    ).fetchone()[0]
                    if recorded != version:
                        raise LibraryError("Les versions du catalogue sont incohérentes.")
                pending = [number for number in sorted(MIGRATIONS) if number > version]
                if pending and not creating:
                    backup_path = self.safe_path(f"backups/catalog-v{version}-{uuid4()}.sqlite3")
                    with closing(sqlite3.connect(backup_path)) as backup:
                        connection.backup(backup)
                connection.execute("PRAGMA journal_mode = DELETE")
                connection.execute("BEGIN IMMEDIATE")
                try:
                    for number in pending:
                        statement = ""
                        for line in MIGRATIONS[number].read_text(encoding="utf-8").splitlines(True):
                            statement += line
                            if sqlite3.complete_statement(statement):
                                connection.execute(statement)
                                statement = ""
                        if statement.strip():
                            raise LibraryError("Migration SQL incomplète.")
                        if number == 3:
                            from yt_beat_m.profiles import backfill_profiles

                            backfill_profiles(connection)
                        if number == 4:
                            from yt_beat_m.profiles import repair_identities

                            repair_identities(connection)
                        connection.execute(
                            "INSERT INTO schema_migrations VALUES (?, ?)",
                            (number, datetime.now(UTC).isoformat()),
                        )
                        connection.execute(f"PRAGMA user_version = {int(number)}")
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
        except (OSError, sqlite3.Error) as exc:
            raise LibraryError(
                "Impossible d’ouvrir ou de migrer le catalogue ; données conservées."
            ) from exc

    @contextmanager
    def catalog(self):
        with self._mutex:
            if self._closed:
                raise LibraryError("La bibliothèque est fermée.")
            if self._read_manifest()["id"] != self.manifest["id"]:
                raise LibraryError(
                    "Le dossier a changé de bibliothèque ; le rouvrir explicitement."
                )
            try:
                with closing(self._connect()) as connection, connection:
                    yield connection
            except (OSError, sqlite3.Error) as exc:
                raise LibraryError("Le catalogue est indisponible ou l’écriture a échoué.") from exc

    def summary(self) -> dict:
        with self.catalog() as connection:
            count = connection.execute("SELECT COUNT(*) FROM beats").fetchone()[0]
            version = connection.execute("PRAGMA user_version").fetchone()[0]
        return {
            "id": self.manifest["id"],
            "name": self.manifest["name"],
            "root": str(self.root),
            "beat_count": count,
            "schema_version": version,
        }

    def close(self) -> None:
        with self._mutex:
            if not self._closed:
                self.lock.release()
                self._closed = True
