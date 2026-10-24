"""Strict YouTube URL validation and conservative source metadata extraction."""

import re
from datetime import datetime
from urllib.parse import parse_qs, urlsplit

from yt_beat_m.library import LibraryError


def youtube_source(value: str) -> tuple[str, str]:
    try:
        url = urlsplit(value.strip())
        if url.scheme not in {"http", "https"} or url.username or url.password or url.port:
            raise ValueError
        host = (url.hostname or "").lower()
        query = parse_qs(url.query)
        if host in {"youtu.be", "www.youtu.be"}:
            identity = url.path.strip("/")
        elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
            if url.path == "/playlist" or ("list" in query and "v" not in query):
                raise LibraryError(
                    "Les playlists complètes viendront ensuite. Colle le lien d’une vidéo."
                )
            if url.path == "/watch" and len(query.get("v", [])) == 1:
                identity = query["v"][0]
            elif re.fullmatch(r"/(shorts|embed|live)/[A-Za-z0-9_-]{11}/?", url.path):
                identity = url.path.split("/")[2]
            else:
                raise ValueError
        else:
            raise ValueError
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", identity):
            raise ValueError
        return identity, f"https://www.youtube.com/watch?v={identity}"
    except ValueError as exc:
        raise LibraryError("Lien non valide : utiliser une URL de vidéo YouTube publique.") from exc


def source_metadata(info: dict, identity: str) -> dict:
    if not isinstance(info, dict):
        raise LibraryError("Les métadonnées de cette vidéo sont indisponibles.")
    if info.get("id") != identity or info.get("_type", "video") != "video":
        raise LibraryError("La source reçue ne correspond pas à la vidéo demandée.")
    if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
        raise LibraryError(
            "Les directs en cours et les premières à venir ne sont pas pris en charge."
        )
    duration = info.get("duration")
    if not isinstance(duration, (int, float)) or not 0 < duration <= 1800:
        raise LibraryError("Choisir une vidéo dont la durée est connue et inférieure à 30 minutes.")
    title = info.get("title")
    if not isinstance(title, str) or not title.strip():
        raise LibraryError("Le titre de cette vidéo est indisponible.")
    description = info.get("description") if isinstance(info.get("description"), str) else ""
    text = f"{title}\n{description}"
    bpms = set(re.findall(r"\b(\d{2,3}(?:[.,]\d+)?)\s*BPM\b", text, re.I))
    bpms.update(re.findall(r"\bBPM\s*[:=\-]?\s*(\d{2,3}(?:[.,]\d+)?)\b", text, re.I))
    bpm_values = {float(value.replace(",", ".")) for value in bpms}
    bpm = next(iter(bpm_values)) if len(bpm_values) == 1 else None
    if bpm is not None and not 20 <= bpm <= 400:
        bpm = None
    keys = set(
        re.findall(
            r"\b(?:key|tonalité)\s*[:=\-]\s*([A-G](?:#|b)?(?:\s*(?:minor|major|min|maj|m))?)"
            r"(?=\s*(?:$|[\n\r,;|]))",
            text,
            re.I,
        )
    )
    musical_key = next(iter(keys)).strip() if len(keys) == 1 else None
    published = None
    try:
        published = datetime.strptime(info.get("upload_date", ""), "%Y%m%d").date().isoformat()
    except (ValueError, TypeError):
        pass
    links = []
    for link in re.findall(r"https?://[^\s<>\"']+", description):
        link = link.rstrip(".,);]")
        try:
            host = (urlsplit(link).hostname or "").lower()
        except ValueError:
            continue
        if (
            any(
                host == domain or host.endswith("." + domain)
                for domain in (
                    "beatstars.com",
                    "bsta.rs",
                    "airbit.com",
                    "traktrain.com",
                    "soundee.com",
                )
            )
            and link not in links
        ):
            links.append(link)
    return {
        "title": title.strip()[:500],
        "channel": info.get("channel") or info.get("uploader"),
        "description": description[:100_000],
        "published_on": published,
        "bpm": bpm,
        "musical_key": musical_key,
        "links": links,
        "expected_duration": duration,
    }
