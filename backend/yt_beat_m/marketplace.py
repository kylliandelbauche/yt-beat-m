"""Optional, persistent shop metadata; every automatic write rechecks manual precedence."""

import hashlib
import json
import time
from datetime import UTC, datetime

from yt_beat_m.beatmakers import provenance, source_text
from yt_beat_m.library import LibraryBusyError, LibraryError
from yt_beat_m.marketplace_http import MarketplaceError, product_url
from yt_beat_m.marketplace_pages import read_product
from yt_beat_m.purchase_links import purchase_links


def now():
    return datetime.now(UTC).isoformat()


def discover_links(c, row):
    sources = provenance(row)
    existing = c.execute(
        "SELECT * FROM source_links WHERE beat_id=? ORDER BY id", (row["id"],)
    ).fetchall()
    if sources.get("links") != "manual" and not any(r["manually_edited"] for r in existing):
        _, description = source_text(dict(row))
        for link in purchase_links(description):
            if len(existing) >= 20:
                break
            if link not in {r["url"] for r in existing}:
                c.execute(
                    "INSERT INTO source_links(beat_id,url,label,provenance) VALUES(?,?,?,?)",
                    (row["id"], link, "Page de vente", "youtube_description"),
                )
                existing = c.execute(
                    "SELECT * FROM source_links WHERE beat_id=?", (row["id"],)
                ).fetchall()
    return [
        r[0]
        for r in c.execute("SELECT url FROM source_links WHERE beat_id=? ORDER BY id", (row["id"],))
    ]


def candidates(c, row):
    links = [
        r[0]
        for r in c.execute("SELECT url FROM source_links WHERE beat_id=? ORDER BY id", (row["id"],))
    ]
    return list(dict.fromkeys(url for link in links if (url := product_url(link))))[:3]


def refresh_links(library):
    added = 0
    with library.catalog() as c:
        for row in c.execute("SELECT * FROM beats").fetchall():
            before = c.execute(
                "SELECT count(*) FROM source_links WHERE beat_id=?", (row["id"],)
            ).fetchone()[0]
            discover_links(c, row)
            added += (
                c.execute(
                    "SELECT count(*) FROM source_links WHERE beat_id=?", (row["id"],)
                ).fetchone()[0]
                - before
            )
    return {"added": added}


def request_key(c, row):
    title, _ = source_text(dict(row))
    return hashlib.sha256(
        json.dumps([row["youtube_id"], title, candidates(c, row)], ensure_ascii=False).encode()
    ).hexdigest()


def view(c, identity):
    row = c.execute("SELECT * FROM marketplace_enrichments WHERE beat_id=?", (identity,)).fetchone()
    if not row:
        return {"state": "idle", "result": {}, "error_message": None, "updated_at": None}
    return {
        "state": row["state"],
        "result": json.loads(row["result"]),
        "error_message": row["error_message"],
        "updated_at": row["updated_at"],
    }


def queue(c, identity, *, automatic=False):
    row = c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
    if not row:
        raise LibraryError("Prod introuvable.")
    discover_links(c, row)
    if not candidates(c, row):
        if automatic:
            return view(c, identity)
        raise LibraryError(
            "Aucune page produit BeatStars ou Jake B reconnue. Tu peux ouvrir le "
            "lien et modifier la fiche manuellement."
        )
    current = c.execute(
        "SELECT * FROM marketplace_enrichments WHERE beat_id=?", (identity,)
    ).fetchone()
    if current and current["state"] in {"queued", "running"}:
        return view(c, identity)
    if (
        current
        and (datetime.now(UTC) - datetime.fromisoformat(current["requested_at"])).total_seconds()
        < 60
    ):
        if automatic:
            return view(c, identity)
        raise LibraryBusyError(
            "Attends une minute entre deux lectures de la page de vente. Les "
            "propositions enregistrées restent disponibles."
        )
    stamp = now()
    c.execute(
        "INSERT INTO marketplace_enrichments VALUES(?, 'queued', ?, '{}', NULL, ?, ?) "
        "ON CONFLICT(beat_id) DO UPDATE SET "
        "state='queued',request_key=excluded.request_key,error_message=NULL,requested_at=excluded.requested_at,updated_at=excluded.updated_at",
        (identity, request_key(c, row), stamp, stamp),
    )
    return view(c, identity)


def proposals(products):
    values = {}
    for product in products:
        maker = " × ".join(product["beatmakers"])
        for field, value in {
            "bpm": product["bpm"],
            "musical_key": product["musical_key"],
            "beatmaker": maker if maker and len(maker) <= 200 else None,
            "tags": product["tags"] or None,
        }.items():
            if value is None:
                continue
            token = (field, json.dumps(value, ensure_ascii=False))
            item = values.setdefault(
                token,
                {
                    "field": field,
                    "value": value,
                    "sources": [],
                    "names": product["beatmakers"] if field == "beatmaker" else [],
                },
            )
            item["sources"].append(
                {
                    "url": product["url"],
                    "data_url": product["data_url"],
                    "field": product["fields"].get(field),
                    "source": product["source"],
                }
            )
    return list(values.values())


def enrich_next(library, stopping):
    with library.catalog() as c:
        task = c.execute(
            "SELECT * FROM marketplace_enrichments WHERE state='queued' ORDER BY "
            "requested_at LIMIT 1"
        ).fetchone()
        if not task:
            return False
        row = c.execute("SELECT * FROM beats WHERE id=?", (task["beat_id"],)).fetchone()
        links = candidates(c, row)
        title, _ = source_text(dict(row))
        c.execute(
            "UPDATE marketplace_enrichments SET state='running',updated_at=? WHERE beat_id=?",
            (now(), row["id"]),
        )
    products, failures = [], []
    deadline = time.monotonic() + 20
    for link in links:
        if stopping.is_set():
            break
        try:
            product = read_product(link, title, stopping=stopping, deadline=deadline)
            if product["url"] not in {p["url"] for p in products}:
                products.append(product)
        except MarketplaceError as exc:
            failures.append({"url": link, "message": str(exc)})
        except (
            LibraryError,
            OSError,
            ValueError,
            TypeError,
            KeyError,
            AttributeError,
            RecursionError,
        ):
            # Never persist raw network errors, response bodies, media URLs or credentials.
            failures.append(
                {
                    "url": link,
                    "message": "Page indisponible, format modifié ou produit non correspondant.",
                }
            )
    result = {
        "products": products,
        "proposals": proposals(products),
        "failures": failures,
        "applied": [],
    }
    with library.catalog() as c:
        row = c.execute("SELECT * FROM beats WHERE id=?", (task["beat_id"],)).fetchone()
        if not row:
            return True
        if stopping.is_set() or request_key(c, row) != task["request_key"]:
            c.execute(
                "UPDATE marketplace_enrichments SET "
                "state='failed',error_message=?,updated_at=? WHERE beat_id=?",
                ("La lecture a été interrompue ou le lien a changé. Réessaie.", now(), row["id"]),
            )
            return True
        sources = provenance(row)
        references = sources.setdefault("marketplace_sources", {})
        for field in ("bpm", "musical_key", "beatmaker"):
            options = [p for p in result["proposals"] if p["field"] == field]
            if (
                len(options) != 1
                or row[field] not in (None, "")
                or sources.get(field) == "manual"
                or field == "beatmaker"
                and row["profile_assignment"] == "manual"
            ):
                continue
            proposal = options[0]
            sources[field] = "marketplace"
            references[field] = proposal["sources"]
            c.execute(f"UPDATE beats SET {field}=? WHERE id=?", (proposal["value"], row["id"]))
            result["applied"].append(field)
        if result["applied"]:
            c.execute(
                "UPDATE beats SET field_provenance=? WHERE id=?",
                (json.dumps(sources, ensure_ascii=False), row["id"]),
            )
            if "beatmaker" in result["applied"]:
                from yt_beat_m.profiles import sync_profiles

                sync_profiles(
                    c, c.execute("SELECT * FROM beats WHERE id=?", (row["id"],)).fetchone()
                )
        state = "ready" if products else "failed"
        c.execute(
            "UPDATE marketplace_enrichments SET "
            "state=?,result=?,error_message=?,updated_at=? WHERE beat_id=?",
            (
                state,
                json.dumps(result, ensure_ascii=False),
                None
                if products
                else "Aucune donnée fiable reçue. Réessaie ou corrige la fiche manuellement.",
                now(),
                row["id"],
            ),
        )
    return True


def accepted_fields(c, identity, fields, changes):
    stored = c.execute(
        "SELECT * FROM marketplace_enrichments WHERE beat_id=?", (identity,)
    ).fetchone()
    beat = c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
    if (
        not stored
        or stored["state"] != "ready"
        or not beat
        or stored["request_key"] != request_key(c, beat)
    ):
        raise MarketplaceError(
            "Les propositions ne correspondent plus au lien courant. Relance leur lecture."
        )
    record = view(c, identity)
    accepted = {}
    for field in fields:
        options = [p for p in record["result"].get("proposals", []) if p["field"] == field]
        match = next(
            (
                p
                for p in options
                if p["value"] == changes.get(field)
                or field == "tags"
                and set(p["value"]).issubset(changes.get("tags", []))
            ),
            None,
        )
        if not match:
            raise MarketplaceError(
                "Ces propositions ont changé. Relis les informations de la page de "
                "vente avant d’enregistrer."
            )
        accepted[field] = match
    return accepted
