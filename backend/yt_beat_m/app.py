"""Local API and same-origin static interface."""

import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from yt_beat_m.diagnostics import get_diagnostics

ROOT = Path(__file__).resolve().parents[2]


def create_app(*, port: int = 8765, dev: bool = False, frontend: Path | None = None) -> FastAPI:
    app = FastAPI(title="YT Beat M", docs_url=None, redoc_url=None, openapi_url=None)
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
