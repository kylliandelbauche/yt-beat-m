"""Synthetic shops, network boundaries and optional enrichment with manual precedence."""

import json
import socket
import sqlite3
import threading
import time
from contextlib import closing
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_songs import AUDIO
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.marketplace import enrich_next, queue, view
from yt_beat_m.marketplace_http import MarketplaceError, PublicHTTPS, fetch_product, product_url
from yt_beat_m.marketplace_pages import matching_title, parse_beatstars, parse_jake, read_product
from yt_beat_m.metadata import MetadataUpdate, correct_metadata
from yt_beat_m.purchase_links import purchase_links

JAKE = "https://jakebmusic.com/produit/synthetic-moon/"
BEAT = "https://www.beatstars.com/beat/synthetic-moon-123456"


def html(title="Synthetic moon", *, extra="", key="F mineur"):
    return (
        f'<link rel="canonical" href="{JAKE}"><script type="application/ld+json">'
        + json.dumps(
            {"@type": "Product", "name": title, "review": {"author": {"name": "NOT THE PRODUCER"}}}
        )
        + '</script><div class="qce-block-info__bpm"><strong>BPM : </strong>150</div>'
        + f'<div class="qce-block-info__gamme"><strong>Gamme : </strong>{key}</div>'
        + '<div class="qce-block-info__date">Date de publication : 24/06/2026</div>'
        + '<div class="qce-block-tracks-taxo__terms"><span>TRISTE</span><span>Piano</span></div>'
        + extra
    ).encode()


def beatstars(**changes):
    details = {
        "track_id": 123456,
        "type": "BEAT",
        "title": "Synthetic moon",
        "bpm": 150,
        "key_note": "F_MINOR",
        "release_date": "June 24, 2026",
        "musician": {"display_name": "Maker One"},
        "collaborators": [{"display_name": "Maker Two"}],
        "tags": {"list": [{"tag": "triste"}]},
        "stream_url": "MUST NOT PERSIST",
    }
    details.update(changes)
    return json.dumps(
        {"status": True, "response": {"data": {"track_id": "123456", "details": details}}}
    ).encode()


@pytest.fixture
def collection(tmp_path):
    with closing(Library.create(tmp_path / "collection")) as lib:
        identity = str(uuid4())
        lib.safe_path("audio/original.mp3").write_bytes(AUDIO)
        with lib.catalog() as c:
            c.execute(
                "INSERT INTO beats(id,title,youtube_id,audio_path,added_at,"
                "published_on,description) "
                "VALUES(?,?,?,?,?,?,?)",
                (
                    identity,
                    'Melodic type beat "Synthetic moon"',
                    "SHOPTEST001",
                    "audio/original.mp3",
                    "2026-11-01",
                    "2026-01-01",
                    f"Achat / Purchase : {JAKE}",
                ),
            )
        yield lib, identity


def mock_read(monkeypatch, *, market=False):
    calls = []

    def fetch(url, **kwargs):
        calls.append((url, kwargs))
        if url.startswith("https://bsta.rs/"):
            return BEAT, b"<html></html>"
        if kwargs.get("api"):
            return url, beatstars()
        return url, html()

    monkeypatch.setattr("yt_beat_m.marketplace_pages.fetch_product", fetch)
    return calls


def test_labeled_purchase_links_keep_exact_pages_and_ignore_other_social_links():
    description = (
        f"💰 Acheter l'instru | Purchase Link (0 tag) : {JAKE}\n"
        "Instagram : https://instagram.com/test\n"
        "Kit : https://maker.beatstars.com/sound-kits/not-a-beat-123\n"
    )
    assert purchase_links(description) == [
        JAKE,
        "https://maker.beatstars.com/sound-kits/not-a-beat-123",
    ]
    assert product_url(purchase_links(description)[1]) is None
    assert purchase_links("Purchase: https://user:secret@jakebmusic.com/produit/x/") == []


@pytest.mark.parametrize(
    "url",
    [
        "http://jakebmusic.com/produit/x/",
        "https://jakebmusic.com:443/produit/x/",
        "https://user:secret@jakebmusic.com/produit/x/",
        "https://jakebmusic.com.evil.test/produit/x/",
        "https://localhost/produit/x/",
        "https://127.0.0.1/produit/x/",
        "https://jakebmusic.com/produit/../content-restricted/",
        "https://jakebmusic.com/abonnements/",
        "https://www.beatstars.com/maker",
        "https://maker.beatstars.com/sound-kits/pack-123",
        "https://bsta.rs/..%2Fprivate",
        "https://www.beatstars.com/beat/a%2Fb-123",
    ],
)
def test_refused_urls_never_enter_the_network(monkeypatch, url):
    monkeypatch.setattr(
        "yt_beat_m.marketplace_http.PublicHTTPS", lambda *a, **k: pytest.fail("Network attempted")
    )
    assert product_url(url) is None
    with pytest.raises(MarketplaceError):
        fetch_product(url)


def test_http_redirects_rechecked_and_body_type_size_bounded(monkeypatch):
    instances = []
    responses = []

    class Response(BytesIO):
        def __init__(self, status=200, data=b"<html/>", **headers):
            super().__init__(data)
            self.status = status
            self.headers = {"Content-Type": "text/html", **headers}

        def getheader(self, name, default=None):
            return self.headers.get(name, default)

    class Connection:
        sock = None

        def __init__(self, *a, **k):
            instances.append((a, k))
            self.requests = []

        def request(self, *a, **k):
            self.requests.append((a, k))

        def getresponse(self):
            return responses.pop(0)

        def close(self):
            pass

    monkeypatch.setattr("yt_beat_m.marketplace_http.PublicHTTPS", Connection)
    responses.append(Response(302, Location="http://127.0.0.1:1234/private"))
    with pytest.raises(MarketplaceError):
        fetch_product(JAKE)
    assert len(instances) == 1
    for headers, data in [
        ({"Content-Type": "image/png"}, b"x"),
        ({"Content-Length": "2097153"}, b"x"),
        ({"Content-Encoding": "gzip"}, b"x"),
        ({}, b"x" * 2097153),
    ]:
        responses.append(Response(data=data, **headers))
        with pytest.raises(MarketplaceError):
            fetch_product(JAKE)
    responses.extend([Response(302, Location=JAKE), Response(data=b"ok")])
    assert fetch_product(JAKE) == (JAKE, b"ok")
    stop = threading.Event()
    stop.set()
    with pytest.raises(MarketplaceError):
        fetch_product(JAKE, stopping=stop)
    with pytest.raises(MarketplaceError):
        fetch_product(JAKE, deadline=time.monotonic() - 1)


@pytest.mark.parametrize(
    "address", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "fd00::1", "224.0.0.1"]
)
def test_dns_private_mixed_and_multicast_refused_before_connect(monkeypatch, address):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443)), (2, 1, 6, "", (address, 443))],
    )
    monkeypatch.setattr(
        socket, "create_connection", lambda *a, **k: pytest.fail("Private connection")
    )
    with pytest.raises(MarketplaceError):
        PublicHTTPS("jakebmusic.com").connect()


def test_dns_pins_numeric_peer_and_retains_tls_hostname(monkeypatch):
    calls = []
    raw = object()
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))]
    )
    monkeypatch.setattr(socket, "create_connection", lambda peer, **k: (calls.append(peer), raw)[1])

    class Context:
        def wrap_socket(self, sock, *, server_hostname):
            calls.append(server_hostname)
            assert sock is raw
            return object()

    connection = PublicHTTPS("jakebmusic.com")
    connection._context = Context()
    connection.connect()
    assert calls == [("93.184.216.34", 443), "jakebmusic.com"]


@pytest.mark.parametrize("stop_early", [True, False])
def test_slow_body_is_actively_closed_on_stop_or_deadline(monkeypatch, stop_early):
    stopped, started, released = threading.Event(), threading.Event(), threading.Event()
    errors = []

    class Sock:
        def shutdown(self, how):
            released.set()

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def getheader(self, key, default=None):
            return "text/html" if key == "Content-Type" else default

        def read(self, size):
            started.set()
            assert released.wait(2)
            raise OSError("socket closed")

    class Connection:
        sock = Sock()

        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return Response()

        def close(self):
            released.set()

    monkeypatch.setattr("yt_beat_m.marketplace_http.PublicHTTPS", Connection)

    def read():
        try:
            fetch_product(
                JAKE, stopping=stopped, deadline=time.monotonic() + (0.2 if not stop_early else 5)
            )
        except MarketplaceError as exc:
            errors.append(exc)

    thread = threading.Thread(target=read)
    thread.start()
    assert started.wait(1)
    if stop_early:
        stopped.set()
    thread.join(1)
    assert not thread.is_alive() and errors


def test_narrow_adapters_identity_ambiguity_collaborators_and_source_dates(monkeypatch):
    j = parse_jake(JAKE, html())
    assert j["bpm"] == 150 and j["musical_key"] == "F minor" and j["published_on"] == "2026-06-24"
    assert j["beatmakers"] == [] and j["tags"] == ["TRISTE", "Piano"]
    ambiguous = parse_jake(
        JAKE, html(extra='<div class="qce-block-info__gamme">Gamme : G mineur</div>')
    )
    assert ambiguous["musical_key"] is None and ambiguous["statuses"]["musical_key"] == "ambiguous"
    b = parse_beatstars("123456", beatstars())
    assert b["beatmakers"] == ["Maker One", "Maker Two"] and b["musical_key"] == "F minor"
    assert "MUST NOT PERSIST" not in json.dumps(b)
    with pytest.raises(MarketplaceError):
        parse_beatstars("123456", beatstars(track_id=123457))
    with pytest.raises(MarketplaceError):
        parse_beatstars("123456", beatstars(type="SOUND_KIT"))
    assert matching_title('[FREE] Melodic Type Beat "Synthetic moon"', "Synthetic moon")
    assert not matching_title("Synthetic moon", "Another product")
    assert not matching_title("Type beat", "Type beat")
    mock_read(monkeypatch)
    with pytest.raises(MarketplaceError):
        read_product(JAKE, "Another product")


def test_missing_values_auto_fill_provenance_cache_and_manual_tags_stay_put(
    collection, monkeypatch
):
    lib, identity = collection
    calls = mock_read(monkeypatch)
    with lib.catalog() as c:
        assert queue(c, identity)["state"] == "queued"
    assert enrich_next(lib, threading.Event())
    with lib.catalog() as c:
        row = c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        record = view(c, identity)
        assert (
            row["bpm"] == 150
            and row["musical_key"] == "F minor"
            and row["published_on"] == "2026-01-01"
        )
        assert json.loads(row["field_provenance"])["marketplace_sources"]["bpm"][0]["url"] == JAKE
        assert c.execute("SELECT count(*) FROM catalog_tags").fetchone()[0] == 0
        assert (
            record["state"] == "ready"
            and record["result"]["products"][0]["published_on"] == "2026-06-24"
        )
        assert len(calls) == 1
        with pytest.raises(LibraryError):
            queue(c, identity)
    assert lib.safe_path("audio/original.mp3").read_bytes() == AUDIO
    # Cache is available without invoking a fetch, and travels with the library.
    monkeypatch.setattr(
        "yt_beat_m.marketplace_pages.fetch_product", lambda *a, **k: pytest.fail("Offline")
    )
    with lib.catalog() as c:
        assert view(c, identity) == record


def test_late_manual_edits_win_and_link_change_discards_late_result(collection, monkeypatch):
    lib, identity = collection

    def read(*args, **kwargs):
        correct_metadata(
            lib, identity, MetadataUpdate(bpm=None, musical_key="C minor", beatmaker_ids=[])
        )
        return {**parse_jake(JAKE, html()), "url": JAKE, "data_url": JAKE, "source": "Jake B"}

    monkeypatch.setattr("yt_beat_m.marketplace.read_product", read)
    with lib.catalog() as c:
        queue(c, identity)
    enrich_next(lib, threading.Event())
    with lib.catalog() as c:
        row = c.execute("SELECT * FROM beats WHERE id=?", (identity,)).fetchone()
        assert (
            row["bpm"] is None
            and row["musical_key"] == "C minor"
            and row["profile_assignment"] == "manual"
        )
        c.execute("UPDATE marketplace_enrichments SET requested_at='2026-01-01T00:00:00+00:00'")
        queue(c, identity)

    def changed(*args, **kwargs):
        correct_metadata(lib, identity, MetadataUpdate(links=[]))
        return {**parse_jake(JAKE, html()), "url": JAKE, "data_url": JAKE, "source": "Jake B"}

    monkeypatch.setattr("yt_beat_m.marketplace.read_product", changed)
    enrich_next(lib, threading.Event())
    with lib.catalog() as c:
        assert view(c, identity)["state"] == "failed"


def test_explicit_acceptance_and_rollback_preserve_two_producer_entities(collection, monkeypatch):
    lib, identity = collection
    mock_read(monkeypatch)
    with lib.catalog() as c:
        c.execute(
            "INSERT INTO source_links(beat_id,url,label,provenance) VALUES(?,?,?,?)",
            (identity, BEAT, "Page de vente", "manual"),
        )
        c.execute(
            "UPDATE beats SET field_provenance=? WHERE id=?",
            (json.dumps({"links": "manual", "beatmaker": "manual"}), identity),
        )
        queue(c, identity)
    enrich_next(lib, threading.Event())
    # mock_read returns Jake HTML for direct beat page, then the exact BeatStars API object.
    value = "Maker One × Maker Two"
    with pytest.raises(LibraryError):
        correct_metadata(
            lib,
            identity,
            MetadataUpdate(beatmaker=value, tags=["Bad\x00"], marketplace_fields=["beatmaker"]),
        )
    with lib.catalog() as c:
        assert c.execute("SELECT count(*) FROM beatmaker_profiles").fetchone()[0] == 0
    assert correct_metadata(
        lib, identity, MetadataUpdate(beatmaker=value, marketplace_fields=["beatmaker"])
    )
    with lib.catalog() as c:
        assert (
            c.execute(
                "SELECT count(*) FROM beat_profile_links WHERE beat_id=?", (identity,)
            ).fetchone()[0]
            == 2
        )
        assert (
            json.loads(
                c.execute("SELECT field_provenance FROM beats WHERE id=?", (identity,)).fetchone()[
                    0
                ]
            )["beatmaker"]
            == "manual"
        )
    with pytest.raises(LibraryError):
        correct_metadata(lib, identity, MetadataUpdate(bpm=180, marketplace_fields=["bpm"]))


def test_api_protection_requests_existing_products_and_worker_is_independent(tmp_path, monkeypatch):
    root = tmp_path / "api"
    identity = str(uuid4())
    lib = Library.create(root)
    lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
    with lib.catalog() as c:
        c.execute(
            "INSERT INTO beats(id,title,audio_path,added_at,description) VALUES(?,?,?,?,?)",
            (identity, "Synthetic moon", "audio/kept.mp3", "2026-01-01", f"Purchase: {JAKE}"),
        )
    lib.close()
    mock_read(monkeypatch)
    with TestClient(
        create_app(preferences=tmp_path / "prefs", frontend=tmp_path / "dist"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        h = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert client.post("/api/library", headers=h, json={"path": str(root)}).is_success
        route = f"/api/beats/{identity}/enrichment"
        assert client.post(route).status_code == 403
        assert (
            client.post(route, headers={**h, "Origin": "https://external.example"}).status_code
            == 403
        )
        assert client.post(route, headers=h).is_success
        for _ in range(300):
            record = client.get(route).json()
            if record["state"] not in {"queued", "running"}:
                break
            time.sleep(0.01)
        assert record["state"] == "ready"
        assert client.get(f"/api/beats/{identity}").json()["musical_key"] == "F minor"
        assert client.get(f"/api/beats/{identity}/audio").content == AUDIO
        assert client.post(route, headers=h).status_code == 409
        assert client.post("/api/library/close", headers=h).is_success
        assert client.post("/api/library", headers=h, json={"path": str(root)}).is_success
        assert client.get(route).json() == record


def test_v10_upgrade_backup_rollback_then_move_preserves_catalog(tmp_path, monkeypatch):
    root = tmp_path / "old"
    migrations = storage.MIGRATIONS
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {n: f for n, f in migrations.items() if n <= 10})
        with closing(Library.create(root)) as lib:
            lib.safe_path("audio/kept.mp3").write_bytes(AUDIO)
    bad = tmp_path / "bad.sql"
    bad.write_text(migrations[11].read_text() + "\nINSERT INTO missing VALUES(1);\n")
    with monkeypatch.context() as p:
        p.setattr(storage, "MIGRATIONS", {**migrations, 11: bad})
        with pytest.raises(LibraryError):
            Library.open(root)
    with sqlite3.connect(root / "catalog.sqlite3") as c:
        assert c.execute("PRAGMA user_version").fetchone()[0] == 10
        assert not c.execute(
            "SELECT 1 FROM sqlite_master WHERE name='marketplace_enrichments'"
        ).fetchone()
    moved = root.with_name("moved")
    root.rename(moved)
    with closing(Library.open(moved)) as lib:
        assert lib.safe_path("audio/kept.mp3").read_bytes() == AUDIO
        with sqlite3.connect(next((moved / "backups").glob("catalog-v10-*.sqlite3"))) as c:
            assert c.execute("PRAGMA user_version").fetchone()[0] == 10
