"""Local API and same-origin static interface."""

import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from platformdirs import user_config_path
from pydantic import BaseModel, Field

from yt_beat_m.beatmakers import (
    correct_beatmaker,
    forget_channel_alias,
    refresh_beatmakers,
    reset_beatmaker,
)
from yt_beat_m.catalog import beat_details, list_beats, set_favorite
from yt_beat_m.diagnostics import get_diagnostics
from yt_beat_m.library import LibraryBusyError, LibraryError
from yt_beat_m.library_manager import LibraryManager
from yt_beat_m.local_audio import media_path, scan_local_audio

ROOT = Path(__file__).resolve().parents[2]


class LibrarySelection(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    create: bool = False
    name: str = Field(default="Ma bibliothèque", min_length=1, max_length=120)


class YouTubeImport(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class FavoriteUpdate(BaseModel):
    favorite: bool


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
    manager = LibraryManager(
        preferences
        if preferences is not None
        else user_config_path("yt-beat-m") / "preferences.json"
    )

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

    @app.exception_handler(LibraryError)
    async def library_error(request: Request, error: LibraryError):
        return JSONResponse(
            {"detail": str(error)}, status_code=409 if isinstance(error, LibraryBusyError) else 400
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

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/session")
    def session():
        return {"token": token}

    @app.get("/api/diagnostics")
    def diagnostics():
        return get_diagnostics()

    @app.get("/api/library")
    def library_status():
        return manager.status()

    @app.post("/api/library")
    def select_library(selection: LibrarySelection):
        summary = manager.select(selection.path, create=selection.create, name=selection.name)
        return {"library": summary, "error": None}

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

    @app.get("/api/beats")
    def beats(
        limit: int = Query(48, ge=1, le=100),
        offset: int = Query(0, ge=0),
        q: str = Query("", max_length=300),
        favorites: bool = False,
    ):
        with manager.active() as library:
            return list_beats(library, limit, offset, q, favorites)

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
