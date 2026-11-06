"""Local API and same-origin static interface."""

import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from platformdirs import user_config_path
from pydantic import BaseModel, Field

from yt_beat_m.beatmakers import (
    correct_beatmaker,
    forget_channel_alias,
    refresh_beatmakers,
    reset_beatmaker,
)
from yt_beat_m.catalog import CatalogFilters, beat_details, filter_options, list_beats, set_favorite
from yt_beat_m.catalog_tags import TagConflict, TagExpected, TagRename, change_tag, list_tags
from yt_beat_m.diagnostics import get_diagnostics
from yt_beat_m.directory_picker import DirectoryPicker
from yt_beat_m.key_refresh import refresh_missing_keys
from yt_beat_m.library import LibraryBusyError, LibraryError
from yt_beat_m.library_manager import LibraryManager
from yt_beat_m.local_audio import media_path, scan_local_audio
from yt_beat_m.metadata import MetadataUpdate, correct_metadata
from yt_beat_m.profile_photos import request_photo
from yt_beat_m.profiles import (
    ProfileUpdate,
    delete_profile,
    get_profile,
    list_profiles,
    merge_profiles,
    resolve_profile,
    save_profile,
)
from yt_beat_m.reveal import reveal_file
from yt_beat_m.song_artwork import select_image
from yt_beat_m.songs import SongCreate, SongFiles, SongPatch, State, get_song, list_songs, save_song

ROOT = Path(__file__).resolve().parents[2]


class LibrarySelection(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    create: bool = False
    name: str = Field(default="Ma bibliothèque", min_length=1, max_length=120)


class YouTubeImport(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class FavoriteUpdate(BaseModel):
    favorite: bool


class ProfileMerge(BaseModel):
    target_id: UUID


class BeatmakerUpdate(BaseModel):
    beatmaker: str | None = Field(default=None, max_length=200)
    remember_channel: bool = False


def create_app(
    *,
    port: int = 8765,
    dev: bool = False,
    frontend: Path | None = None,
    preferences: Path | None = None,
) -> FastAPI:
    directory_picker = DirectoryPicker()
    audio_picker = DirectoryPicker(audio=True)
    image_picker = DirectoryPicker(image=True)
    manager = LibraryManager(
        preferences
        if preferences is not None
        else user_config_path("yt-beat-m") / "preferences.json"
    )

    song_files = SongFiles(manager.preferences.with_name("song-files.sqlite3"))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager.restore()
        try:
            yield
        finally:
            manager.close()

    app = FastAPI(
        title="YT Beat M", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
        # Retain actionable field errors without reflecting raw drafts (including
        # escaped unpaired surrogates which cannot be encoded in a JSON response).
        def readable(value):
            return str(value).encode("utf-8", errors="replace").decode("utf-8")

        return JSONResponse(
            {
                "detail": [
                    {
                        "loc": [
                            part if isinstance(part, int) else readable(part)
                            for part in item["loc"]
                        ],
                        "msg": readable(item["msg"]),
                        "type": readable(item["type"]),
                    }
                    for item in error.errors()
                ]
            },
            status_code=422,
        )

    @app.exception_handler(LibraryError)
    async def library_error(request: Request, error: LibraryError):
        return JSONResponse(
            {"detail": str(error)},
            status_code=409 if isinstance(error, (LibraryBusyError, TagConflict)) else 400,
        )

    @app.exception_handler(OSError)
    async def storage_error(request: Request, error: OSError):
        return JSONResponse(
            {"detail": "Stockage inaccessible ; vérifier le disque et son accès."}, status_code=400
        )

    token = secrets.token_urlsafe(32)
    origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    if dev:
        origins.update({"http://127.0.0.1:5173", "http://localhost:5173"})
    hosts = {origin.removeprefix("http://") for origin in origins}

    @app.middleware("http")
    async def protect_local_api(request: Request, call_next):
        if request.headers.get("host") not in hosts:
            return JSONResponse({"detail": "Hôte non autorisé."}, status_code=400)
        origin = request.headers.get("origin")
        if origin and origin not in origins:
            return JSONResponse({"detail": "Origine non autorisée."}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Requête externe refusée."}, status_code=403)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            candidate = request.headers.get("x-session-token", "")
            if origin not in origins or not secrets.compare_digest(
                candidate.encode(), token.encode()
            ):
                return JSONResponse({"detail": "Session locale non valide."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; media-src 'self'; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/songs/pick-file")
    def pick_song_file():
        with manager.active() as library:
            library_id = library.manifest["id"]
        selected = audio_picker.choose()
        if selected is None:
            return {"selection": None}
        with manager.active() as library:
            if library.manifest["id"] != library_id:
                raise LibraryError("La bibliothèque a changé ; sélectionner à nouveau le MP3.")
            return {"selection": song_files.grant(library, selected)}

    @app.post("/api/songs/pick-cover")
    def pick_song_cover():
        with manager.active() as library:
            library_id = library.manifest["id"]
        selected = image_picker.choose()
        if selected is None:
            return {"image": None}
        with manager.active() as library:
            if library.manifest["id"] != library_id:
                raise LibraryError("La bibliothèque a changé ; sélectionner à nouveau la pochette.")
            return {"image": select_image(selected)}

    @app.get("/api/songs/{identity}/artwork")
    def song_artwork(identity: UUID):
        with manager.active() as library, library.catalog() as c:
            row = c.execute(
                "SELECT data FROM song_artwork WHERE song_id=?", (str(identity),)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Pochette personnelle introuvable.")
            return Response(bytes(row["data"]), media_type="image/png")

    @app.get("/api/songs")
    def songs_list(
        limit: int = Query(48, ge=1, le=100),
        offset: int = Query(0, ge=0),
        beat_id: UUID | None = None,
        q: str = Query("", max_length=500),
        favorites: bool = False,
        state: State | None = None,
        linked: bool | None = None,
        available: bool | None = None,
        profile_id: UUID | None = None,
        tag_ids: Annotated[list[Annotated[int, Field(gt=0)]] | None, Query(max_length=120)] = None,
        tag_missing: bool = False,
        sort: str = "added_desc",
    ):
        with manager.active() as library:
            return list_songs(
                library,
                song_files,
                limit,
                offset,
                beat_id,
                q=q,
                favorites=favorites,
                state=state,
                linked=linked,
                available=available,
                profile_id=profile_id,
                tag_ids=tag_ids or [],
                tag_missing=tag_missing,
                sort=sort,
            )

    @app.post("/api/songs")
    def song_create(payload: SongCreate):
        with manager.active() as library:
            return save_song(library, song_files, payload)

    @app.get("/api/songs/{identity}")
    def song_get(identity: UUID):
        with manager.active() as library:
            result = get_song(library, song_files, str(identity))
            if result is None:
                raise HTTPException(404, "Morceau introuvable.")
            return result

    @app.patch("/api/songs/{identity}")
    def song_update(identity: UUID, payload: SongPatch):
        with manager.active() as library:
            if get_song(library, song_files, str(identity)) is None:
                raise HTTPException(404, "Morceau introuvable.")
            return save_song(library, song_files, payload, str(identity))

    @app.get("/api/songs/{identity}/audio")
    def song_audio(identity: UUID):
        with manager.active() as library:
            with library.catalog() as c:
                row = c.execute("SELECT * FROM songs WHERE id=?", (str(identity),)).fetchone()
            path = song_files.resolve(library, row) if row else None
            if path is None:
                raise HTTPException(404, "MP3 indisponible ; sélectionner à nouveau le fichier.")
            return FileResponse(path, media_type="audio/mpeg")

    @app.post("/api/songs/{identity}/reveal")
    def song_reveal(identity: UUID):
        with manager.active() as library:
            with library.catalog() as c:
                row = c.execute("SELECT * FROM songs WHERE id=?", (str(identity),)).fetchone()
            path = song_files.resolve(library, row) if row else None
            if path is None:
                raise HTTPException(404, "MP3 indisponible ; sélectionner à nouveau le fichier.")
            reveal_file(path)
            return {"revealed": True}

    @app.get("/api/beats/{identity}/songs")
    def beat_songs(
        identity: UUID, limit: int = Query(48, ge=1, le=100), offset: int = Query(0, ge=0)
    ):
        with manager.active() as library:
            if beat_details(library, str(identity)) is None:
                raise HTTPException(404, "Prod introuvable.")
            return list_songs(library, song_files, limit, offset, identity)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/session")
    def session():
        return {"token": token}

    @app.get("/api/diagnostics")
    def diagnostics():
        return get_diagnostics()

    @app.get("/api/catalog/tags")
    def tags_list():
        with manager.active() as library:
            return {"tags": list_tags(library)}

    @app.patch("/api/catalog/tags/{identity}")
    def rename_catalog_tag(identity: int, payload: TagRename):
        with manager.active() as library:
            try:
                return change_tag(library, identity, payload.expected_label, payload.label)
            except TagConflict as e:
                raise HTTPException(409, str(e)) from e

    @app.delete("/api/catalog/tags/{identity}")
    def remove_catalog_tag(identity: int, payload: TagExpected):
        with manager.active() as library:
            try:
                return change_tag(library, identity, payload.expected_label)
            except TagConflict as e:
                raise HTTPException(409, str(e)) from e

    @app.get("/api/library")
    def library_status():
        return manager.status()

    @app.post("/api/library")
    def select_library(selection: LibrarySelection):
        summary = manager.select(selection.path, create=selection.create, name=selection.name)
        return {"library": summary, "error": None}

    @app.post("/api/library/pick-folder")
    def pick_library_folder():
        # No library lock: audio and import polling keep working during the native dialog.
        return {"path": directory_picker.choose()}

    @app.post("/api/library/close")
    def close_library():
        manager.close()
        return manager.status()

    @app.post("/api/imports")
    def enqueue_import(payload: YouTubeImport):
        with manager.active():
            return manager.worker.enqueue(payload.url)

    @app.get("/api/imports")
    def import_jobs():
        with manager.active():
            return {"jobs": manager.worker.jobs()}

    @app.post("/api/library/scan")
    def scan_library():
        with manager.active() as library:
            result = scan_local_audio(library)
            return {**result, "library": library.summary()}

    @app.post("/api/library/refresh")
    def refresh_library():
        with manager.active() as library:
            scan = scan_local_audio(library)
            producers = refresh_beatmakers(library)
            keys = refresh_missing_keys(library)
            return {
                **scan,
                "beatmakers": producers,
                "musical_keys": keys,
                "library": library.summary(),
            }

    @app.get("/api/beats")
    def beats(
        limit: int = Query(48, ge=1, le=100),
        offset: int = Query(0, ge=0),
        q: str = Query("", max_length=300),
        favorites: bool = False,
        bpm_min: float | None = None,
        bpm_max: float | None = None,
        bpm_missing: bool = False,
        key_missing: bool = False,
        maker_missing: bool = False,
        channel_missing: bool = False,
        style_missing: bool = False,
        mood_missing: bool = False,
        keys: Annotated[list[str] | None, Query()] = None,
        makers: Annotated[list[str] | None, Query()] = None,
        channels: Annotated[list[str] | None, Query()] = None,
        tags: Annotated[list[str] | None, Query()] = None,
        tag_missing: bool = False,
        styles: Annotated[list[str] | None, Query()] = None,
        moods: Annotated[list[str] | None, Query()] = None,
        sort: str = "added_desc",
        profile_ids: Annotated[list[str] | None, Query()] = None,
        unassigned_profiles: bool = False,
    ):
        with manager.active() as library:
            return list_beats(
                library,
                limit,
                offset,
                q,
                favorites,
                CatalogFilters(
                    bpm_min=bpm_min,
                    bpm_max=bpm_max,
                    bpm_missing=bpm_missing,
                    key_missing=key_missing,
                    maker_missing=maker_missing,
                    channel_missing=channel_missing,
                    style_missing=style_missing,
                    mood_missing=mood_missing,
                    keys=keys or [],
                    makers=makers or [],
                    channels=channels or [],
                    tags=tags or [],
                    tag_missing=tag_missing,
                    styles=styles or [],
                    moods=moods or [],
                    sort=sort,
                    profile_ids=profile_ids or [],
                    unassigned_profiles=unassigned_profiles,
                ),
            )

    @app.get("/api/catalog/filters")
    def catalogue_options():
        with manager.active() as library:
            return filter_options(library)

    @app.get("/api/beatmakers")
    def profiles(
        q: str = Query(default="", max_length=200),
        limit: int = Query(default=60, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ):
        with manager.active() as library:
            return list_profiles(library, q, limit, offset)

    @app.post("/api/beatmakers")
    def create_profile(payload: ProfileUpdate):
        with manager.active() as library:
            return save_profile(library, payload)

    @app.get("/api/beatmakers/{identity}")
    def producer_profile(identity: UUID):
        with manager.active() as library:
            result = get_profile(library, str(identity))
            if result is None:
                raise HTTPException(404, "Profil introuvable.")
            return {
                **result,
                "beats": list_beats(
                    library, 20, 0, filters=CatalogFilters(profile_ids=[result["id"]])
                )["beats"],
            }

    @app.patch("/api/beatmakers/{identity}")
    def edit_profile(identity: UUID, payload: ProfileUpdate):
        with manager.active() as library:
            result = save_profile(library, payload, str(identity))
            if result is None:
                raise HTTPException(404, "Profil introuvable.")
            return result

    @app.delete("/api/beatmakers/{identity}")
    def remove_profile(identity: UUID):
        with manager.active() as library:
            if not delete_profile(library, str(identity)):
                raise HTTPException(404, "Profil introuvable.")
            return {"deleted": True}

    @app.post("/api/beatmakers/{identity}/merge-preview")
    def preview_merge(identity: UUID, payload: ProfileMerge):
        with manager.active() as library:
            return merge_profiles(library, str(identity), str(payload.target_id), preview=True)

    @app.post("/api/beatmakers/{identity}/merge")
    def merge_producers(identity: UUID, payload: ProfileMerge):
        with manager.active() as library:
            return merge_profiles(library, str(identity), str(payload.target_id))

    @app.post("/api/beatmakers/{identity}/photo-refresh")
    def refresh_profile_photo(identity: UUID):
        with manager.active() as library:
            return request_photo(library, str(identity))

    @app.get("/api/beatmakers/{identity}/photo")
    def profile_photo(identity: UUID):
        with manager.active() as library:
            with library.catalog() as c:
                row = c.execute(
                    "SELECT photo,photo_type FROM beatmaker_profiles WHERE id=?",
                    (resolve_profile(c, str(identity)),),
                ).fetchone()
                if not row or not row[0]:
                    raise HTTPException(404, "Photo indisponible.")
                return Response(
                    row[0],
                    media_type=row[1],
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )

    @app.patch("/api/beats/{identity}/metadata")
    def update_metadata(identity: UUID, payload: MetadataUpdate):
        with manager.active() as library:
            if not correct_metadata(library, str(identity), payload):
                raise HTTPException(404, "Prod introuvable.")
            return beat_details(library, str(identity))

    @app.post("/api/library/beatmakers/refresh")
    def refresh_producers():
        with manager.active() as library:
            return refresh_beatmakers(library)

    @app.patch("/api/beats/{identity}/beatmaker")
    def update_producer(identity: UUID, payload: BeatmakerUpdate):
        with manager.active() as library:
            if not correct_beatmaker(
                library, str(identity), payload.beatmaker, payload.remember_channel
            ):
                raise HTTPException(404, "Prod introuvable.")
            return beat_details(library, str(identity))

    @app.delete("/api/beats/{identity}/beatmaker")
    def reset_producer(identity: UUID):
        with manager.active() as library:
            if not reset_beatmaker(library, str(identity)):
                raise HTTPException(404, "Prod introuvable.")
            return beat_details(library, str(identity))

    @app.delete("/api/beats/{identity}/channel-alias")
    def forget_producer_alias(identity: UUID):
        with manager.active() as library:
            if not forget_channel_alias(library, str(identity)):
                raise HTTPException(404, "Prod introuvable.")
            return beat_details(library, str(identity))

    @app.get("/api/beats/{identity}")
    def beat_detail(identity: UUID):
        with manager.active() as library:
            result = beat_details(library, str(identity))
            if result is None:
                raise HTTPException(404, "Prod introuvable.")
            return result

    @app.patch("/api/beats/{identity}/favorite")
    def update_favorite(identity: UUID, payload: FavoriteUpdate):
        with manager.active() as library:
            if not set_favorite(library, str(identity), payload.favorite):
                raise HTTPException(404, "Prod introuvable.")
            return {"id": str(identity), "favorite": payload.favorite}

    @app.post("/api/beats/{identity}/reveal")
    def reveal(identity: UUID):
        with manager.active() as library:
            path = media_path(library, str(identity))
            if path is None:
                raise HTTPException(404, "Fichier audio introuvable ; vérifier le disque.")
            reveal_file(path)
            return {"revealed": True}

    @app.get("/api/beats/{identity}/audio")
    def audio(identity: UUID):
        with manager.active() as library:
            path = media_path(library, str(identity))
            if path is None:
                raise HTTPException(404, "Fichier audio introuvable ; vérifier le disque.")
            return FileResponse(path, media_type="audio/mpeg")

    @app.get("/api/beats/{identity}/artwork")
    def artwork(identity: UUID):
        with manager.active() as library:
            path = media_path(library, str(identity), artwork=True)
            if path is None or path.suffix not in {".jpg", ".png"}:
                raise HTTPException(404, "Pochette indisponible.")
            return FileResponse(
                path, media_type="image/png" if path.suffix == ".png" else "image/jpeg"
            )

    frontend = frontend if frontend is not None else ROOT / "frontend" / "dist"
    if (frontend / "index.html").is_file():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="interface")
    else:

        @app.get("/")
        def missing_frontend():
            return JSONResponse(
                {"detail": "Interface absente. Dans frontend : npm ci puis npm run build."},
                status_code=503,
            )

    return app
