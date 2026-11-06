"""Purchase labels can introduce independent shops; displaying a link never fetches it."""

import re
from urllib.parse import urlsplit

LABEL = re.compile(r"\b(?:achat|acheter|purchase(?:\s+link)?|buy)\b[^\n:：]{0,50}[:：]\s*$", re.I)
MARKETS = ("beatstars.com", "bsta.rs", "airbit.com", "traktrain.com", "soundee.com")


def purchase_links(description):
    explicit, known = [], []
    for match in re.finditer(r"https?://[^\s<>\"']+", description or ""):
        link = match[0].rstrip(".,);]")
        try:
            p = urlsplit(link)
            host = (p.hostname or "").lower()
            if p.username or p.password or p.port or "\\" in link:
                continue
        except ValueError:
            continue
        before = (description or "")[max(0, match.start() - 160) : match.start()]
        if LABEL.search(before):
            explicit.append(link)
        elif any(host == d or host.endswith("." + d) for d in MARKETS):
            known.append(link)
    return list(dict.fromkeys([*explicit, *known]))[:20]
