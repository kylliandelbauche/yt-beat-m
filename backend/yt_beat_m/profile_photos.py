"""Optional channel avatars: bounded extraction, trusted image hosts, local persistence."""

import base64
import json
import re
import sys
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from yt_beat_m.beatmakers import credit_parts, normalized_name, provenance
from yt_beat_m.import_process import ImportInterrupted
from yt_beat_m.library import LibraryError
from yt_beat_m.profiles import brand, now, photo_bytes, resolve_profile


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def trusted_image(url):
    try:
        p = urlsplit(url)
        return (
            p.scheme == "https"
            and p.hostname in {"yt3.googleusercontent.com", "yt3.ggpht.com"}
            and not (p.username or p.password or p.port)
            and not any(ch.isspace() for ch in url)
        )
    except ValueError:
        return False


def download_avatar(url, stopping=None):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    for _ in range(4):
        if stopping is not None and stopping.is_set():
            raise ImportInterrupted
        if not trusted_image(url):
            raise LibraryError("Adresse de portrait YouTube refusée.")
        try:
            response = opener.open(Request(url, headers={"User-Agent": "Beat-m/0.1"}), timeout=5)
        except HTTPError as exc:
            if exc.code in {301, 302, 303, 307, 308} and exc.headers.get("Location"):
                url = exc.headers["Location"]
                exc.close()
                continue
            raise
        with response:
            if int(response.headers.get("Content-Length", "0")) > 2 * 1024 * 1024:
                raise LibraryError("Portrait trop volumineux.")
            data = response.read(2 * 1024 * 1024 + 1)
        return photo_bytes(base64.b64encode(data).decode())
    raise LibraryError("Trop de redirections pour le portrait.")


def fetch_channel(channel_id, handle, runner, video_id=None):
    if not channel_id and video_id and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raw = runner.run(
            [
                sys.executable,
                "-m",
                "yt_dlp",
                "--ignore-config",
                "--no-plugin-dirs",
                "--no-warnings",
                "--no-playlist",
                "--skip-download",
                "--dump-single-json",
                "--socket-timeout",
                "5",
                "--retries",
                "0",
                "https://www.youtube.com/watch?v=" + video_id,
            ],
            timeout=15,
        )
        source = json.loads(raw)
        if source.get("id") != video_id or not re.fullmatch(
            r"UC[A-Za-z0-9_-]{22}", source.get("channel_id", "")
        ):
            raise LibraryError("La chaîne de cette vidéo est indisponible.")
        channel_id = source["channel_id"]

    if channel_id and re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id):
        path = "channel/" + channel_id
    elif handle and re.fullmatch(r"@[\w.-]{3,40}", handle):
        path = "@" + handle.lstrip("@")
    else:
        raise LibraryError("Chaîne YouTube à préciser pour récupérer son portrait.")
    raw = runner.run(
        [
            sys.executable,
            "-m",
            "yt_dlp",
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-warnings",
            "--flat-playlist",
            "--playlist-items",
            "0",
            "--skip-download",
            "--dump-single-json",
            "--socket-timeout",
            "5",
            "--retries",
            "0",
            "https://www.youtube.com/" + path,
        ],
        timeout=15,
    )
    info = json.loads(raw)
    if channel_id and info.get("channel_id") != channel_id:
        raise LibraryError("La chaîne reçue ne correspond pas au profil.")
    if (
        not channel_id
        and str(info.get("uploader_id", "")).lstrip("@").casefold() != handle.lstrip("@").casefold()
        and brand(info.get("channel", "")) != brand(handle)
    ):
        raise LibraryError("L’identité de cette chaîne reste à confirmer.")
    images = [t for t in info.get("thumbnails", []) if trusted_image(t.get("url", ""))]
    if not images:
        raise LibraryError("Portrait indisponible pour cette chaîne.")
    images.sort(key=lambda t: (t.get("width", 0) == 900, t.get("width", 0)), reverse=True)
    return download_avatar(images[0]["url"], stopping=getattr(runner, "stopping", None))


def photo_candidate(c, identity=None):
    cutoff = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    rows = c.execute(
        "SELECT id,name,aliases FROM beatmaker_profiles WHERE photo_origin IS NOT 'manual' "
        "AND photo IS NULL AND (photo_checked_at IS NULL OR photo_checked_at<?) "
        + ("AND id=? " if identity else "")
        + "ORDER BY created_at",
        (cutoff, identity) if identity else (cutoff,),
    ).fetchall()
    for p in rows:
        names = {brand(n) for n in [p["name"], *json.loads(p["aliases"])]}
        channels = c.execute(
            "SELECT b.* FROM beats b JOIN beat_profile_links l "
            "ON l.beat_id=b.id WHERE l.profile_id=? AND b.channel IS NOT NULL",
            (p["id"],),
        ).fetchall()
        credited_names = {normalized_name(n) for n in [p["name"], *json.loads(p["aliases"])]}

        def source_owner(row, names=names, credited_names=credited_names):
            if brand(row["channel"]) in names:
                return True
            parts = credit_parts(row["beatmaker"] or "")
            return (
                len(parts) == 1
                and normalized_name(parts[0]) in credited_names
                and provenance(row).get("beatmaker")
                in {"explicit_credit", "channel_alias", "manual"}
            )

        own = [r for r in channels if source_owner(r)]
        ids = {r["channel_id"] for r in own if r["channel_id"]}
        if own and len(ids) <= 1:
            chosen = next((r for r in own if r["channel_id"]), own[0])
            return p["id"], chosen["channel_id"], chosen["channel"], chosen["youtube_id"]
        if not own and re.fullmatch(r"@[\w.-]{3,40}", p["name"]):
            # An explicit guest handle refers to the guest's own channel, never the uploader.
            return p["id"], None, p["name"], None
    return None


def enrich_next_photo(library, runner):
    with library.catalog() as c:
        candidate = photo_candidate(c)
        if candidate:
            c.execute(
                "UPDATE beatmaker_profiles SET photo_checked_at=? WHERE id=?", (now(), candidate[0])
            )
    if not candidate:
        return False
    identity, channel_id, handle, video_id = candidate
    try:
        data, mime = fetch_channel(channel_id, handle, runner, video_id)
        with library.catalog() as c:
            # Deletion, merge or a manual photo during extraction always wins.
            c.execute(
                "UPDATE beatmaker_profiles SET photo=?,photo_type=?,"
                "photo_origin='youtube',updated_at=? "
                "WHERE id=? AND photo_origin IS NOT 'manual' AND photo IS NULL",
                (data, mime, now(), identity),
            )
    except (LibraryError, OSError, ValueError, TypeError, KeyError):
        pass  # Optional metadata never fails a ready import; retry is explicit or next day.
    return True


def request_photo(library, identity):
    with library.catalog() as c:
        identity = resolve_profile(c, identity)
        p = c.execute(
            "SELECT photo,photo_origin FROM beatmaker_profiles WHERE id=?", (identity,)
        ).fetchone()
        if not p:
            raise LibraryError("Profil introuvable.")
        if p[0] and p[1] == "manual":
            raise LibraryError(
                "Ta photo manuelle est conservée. Retire-la avant de demander celle de YouTube."
            )
        c.execute(
            "UPDATE beatmaker_profiles SET photo_checked_at=NULL,photo=NULL,photo_type=NULL,"
            "photo_origin=NULL WHERE id=?",
            (identity,),
        )
        if not photo_candidate(c, identity):
            raise LibraryError(
                "Aucune chaîne correspondante confirmée. "
                "Associe une prod de ce beatmaker à son profil."
            )
    return {"queued": True}
