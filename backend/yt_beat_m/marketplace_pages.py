"""Two narrow adapters; raw shops, recommendations, scripts and media are not executed."""

import json
import math
import re
import time
import unicodedata
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urlsplit

from yt_beat_m.marketplace_http import MarketplaceError, fetch_product
from yt_beat_m.musical_keys import canonical_key


def label(value, limit=500):
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return (
        value[:limit]
        if value and not any(unicodedata.category(c).startswith("C") for c in value)
        else None
    )


def matching_title(source, product):
    def words(value):
        text = "".join(
            c
            for c in unicodedata.normalize("NFKD", value).casefold()
            if not unicodedata.combining(c)
        )
        return re.findall(r"[a-z0-9]+", text)

    a, b = words(source), words(product)
    ignored = {"free", "type", "beat", "beats", "instru", "instrumental", "rap", "prod"}
    return bool(
        b
        and any(w not in ignored for w in b)
        and (
            a == b
            or len(" ".join(b)) >= 6
            and (" " + " ".join(b) + " ") in (" " + " ".join(a) + " ")
        )
    )


def bpm(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(str(value).replace(",", "."))
        return value if math.isfinite(value) and 0 < value <= 1000 else None
    except (ValueError, TypeError):
        return None


def published(value):
    if not isinstance(value, str):
        return None
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return date.fromisoformat(value).isoformat()
        if re.fullmatch(r"\d{2}/\d{2}/\d{4}", value):
            day, month, year = map(int, value.split("/"))
        else:
            match = re.fullmatch(r"([A-Za-z]+) (\d{1,2}), (\d{4})", value)
            if not match:
                return None
            month = [
                "january",
                "february",
                "march",
                "april",
                "may",
                "june",
                "july",
                "august",
                "september",
                "october",
                "november",
                "december",
            ].index(match[1].lower()) + 1
            day, year = int(match[2]), int(match[3])
        return date(year, month, day).isoformat()
    except ValueError:
        return None


class ProductHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.script = None
        self.scripts = []
        self.fields = {}
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.script = [] if attrs.get("type") == "application/ld+json" else None
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        if tag in {
            "meta",
            "link",
            "img",
            "input",
            "br",
            "hr",
            "source",
            "wbr",
            "area",
            "base",
            "embed",
            "param",
            "col",
        }:
            return
        classes = attrs.get("class", "").split()
        field = next(
            (
                c
                for c in classes
                if c
                in {
                    "qce-block-info__bpm",
                    "qce-block-info__gamme",
                    "qce-block-info__date",
                    "qce-block-tracks-taxo__terms",
                }
            ),
            None,
        )
        if len(self.stack) >= 256:
            raise MarketplaceError("Structure de page de vente trop complexe.")
        self.stack.append((tag, field))

    def handle_data(self, data):
        if self.stack and self.stack[-1][0] == "script":
            if self.script is not None:
                self.script.append(data)
            return
        if (
            self.stack
            and self.stack[-1][0] == "span"
            and any(f == "qce-block-tracks-taxo__terms" for _, f in self.stack)
        ):
            self.fields.setdefault("tags", []).append(data)
        for _, field in self.stack:
            if field:
                self.fields.setdefault(field, []).append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            try:
                value = json.loads("".join(self.script))
                self.scripts.extend(value if isinstance(value, list) else [value])
            except (ValueError, RecursionError):
                pass
            self.script = None
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


def parse_jake(url, body):
    html = ProductHTML()
    html.feed(body.decode("utf-8", errors="replace"))
    if (
        not html.canonical
        or urlsplit(html.canonical).hostname not in {"jakebmusic.com", "www.jakebmusic.com"}
        or urlsplit(html.canonical).path.rstrip("/") != urlsplit(url).path.rstrip("/")
    ):
        raise MarketplaceError("La boutique ne confirme pas le produit demandé.")
    products = [s for s in html.scripts if isinstance(s, dict) and s.get("@type") == "Product"]
    names = {label(p.get("name")) for p in products} - {None}
    if len(names) != 1:
        raise MarketplaceError("Le produit exact n’est pas identifiable sur cette page.")
    fields = {k: " ".join(v) for k, v in html.fields.items()}
    # Mobile and desktop blocks repeat: accept only a single distinct value per field.
    bpms = {
        bpm(v)
        for v in re.findall(
            r"BPM\s*:\s*(\d+(?:[.,]\d+)?)", fields.get("qce-block-info__bpm", ""), re.I
        )
    } - {None}
    keys = {
        canonical_key(v.strip())
        for v in re.findall(
            r"Gamme\s*:\s*(.*?)(?=Gamme\s*:|$)", fields.get("qce-block-info__gamme", ""), re.I
        )
    } - {None}
    dates = {
        published(v)
        for v in re.findall(r"\d{2}/\d{2}/\d{4}", fields.get("qce-block-info__date", ""))
    } - {None}
    return {
        "title": names.pop(),
        "bpm": next(iter(bpms)) if len(bpms) == 1 else None,
        "musical_key": next(iter(keys)) if len(keys) == 1 else None,
        "published_on": next(iter(dates)) if len(dates) == 1 else None,
        "beatmakers": [],
        "tags": list(dict.fromkeys(label(t, 80) for t in html.fields.get("tags", [])[:120])),
        "fields": {
            "bpm": "qce-block-info__bpm",
            "musical_key": "qce-block-info__gamme",
            "published_on": "qce-block-info__date",
            "tags": "qce-block-tracks-taxo__terms",
        },
        "statuses": {
            "bpm": "ambiguous" if len(bpms) > 1 else "present" if bpms else "missing",
            "musical_key": "ambiguous" if len(keys) > 1 else "present" if keys else "missing",
            "published_on": "ambiguous" if len(dates) > 1 else "present" if dates else "missing",
        },
    }


def parse_beatstars(identity, body):
    data = json.loads(body)
    if not isinstance(data, dict) or data.get("status") is not True:
        raise MarketplaceError("Métadonnées BeatStars indisponibles.")
    result = data.get("response", {}).get("data", {})
    track = result.get("details", {})
    if (
        str(result.get("track_id")) != identity
        or str(track.get("track_id")) != identity
        or track.get("type") != "BEAT"
    ):
        raise MarketplaceError("La réponse BeatStars ne correspond pas à cette prod.")
    name = label(track.get("title"))
    if not name:
        raise MarketplaceError("Titre du produit BeatStars indisponible.")
    credit = track.get("musician", {})
    names = [label(credit.get("display_name"), 200)] if isinstance(credit, dict) else []
    collaborators = track.get("collaborators") or []
    if isinstance(collaborators, dict):
        collaborators = collaborators.get("list", [])
    if isinstance(collaborators, list):
        names += [
            label(c.get("display_name"), 200) for c in collaborators[:20] if isinstance(c, dict)
        ]
    names = list(dict.fromkeys(n for n in names if n))[:20]
    key = str(track.get("key_note") or "")
    match = re.fullmatch(r"([A-G])(?:_(SHARP|FLAT))?_(MINOR|MAJOR)", key)
    if match:
        key = match[1] + {"SHARP": "#", "FLAT": "b", None: ""}[match[2]] + " " + match[3].lower()
    tags = track.get("tags", {})
    tags = tags.get("list", []) if isinstance(tags, dict) else []
    return {
        "title": name,
        "bpm": bpm(track.get("bpm")),
        "musical_key": canonical_key(key),
        "published_on": published(track.get("release_date")),
        "beatmakers": names,
        "tags": list(
            dict.fromkeys(label(t.get("tag"), 80) for t in tags[:120] if isinstance(t, dict))
        )
        if isinstance(tags, list)
        else [],
        "fields": {
            "bpm": "details.bpm",
            "musical_key": "details.key_note",
            "published_on": "details.release_date",
            "beatmaker": "details.musician / collaborators",
            "tags": "details.tags.list",
        },
    }


def read_product(url, title, *, stopping=None, deadline=None):
    deadline = deadline or time.monotonic() + 20
    final, body = fetch_product(url, stopping=stopping, deadline=deadline)
    if urlsplit(final).hostname in {"jakebmusic.com", "www.jakebmusic.com"}:
        result = parse_jake(final, body)
        source = "Jake B"
        data_url = final
    else:
        match = re.fullmatch(r"/beat/(?:[a-zA-Z0-9-]+-)?([1-9][0-9]{0,11})/?", urlsplit(final).path)
        if not match:
            raise MarketplaceError("Le lien BeatStars ne désigne pas une prod précise.")
        data_url = "https://main.v2.beatstars.com/track?id=" + match[1]
        _, body = fetch_product(data_url, api=True, stopping=stopping, deadline=deadline)
        result = parse_beatstars(match[1], body)
        source = "BeatStars"
    if not matching_title(title, result["title"]):
        raise MarketplaceError("Le titre de la page de vente ne correspond pas à cette prod.")
    result["tags"] = [t for t in result["tags"] if t]
    statuses = result.setdefault("statuses", {})
    for field in ("bpm", "musical_key", "published_on", "tags", "beatmakers"):
        statuses.setdefault(field, "present" if result[field] else "missing")
    return {**result, "url": final, "data_url": data_url, "source": source}
