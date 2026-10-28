import json
import shutil
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.catalog import CatalogFilters, beat_details, filter_options, list_beats
from yt_beat_m.import_source import source_metadata
from yt_beat_m.key_refresh import refresh_missing_keys
from yt_beat_m.library import Library
from yt_beat_m.metadata import MetadataUpdate, correct_metadata
from yt_beat_m.musical_keys import canonical_key, extract_key


@pytest.mark.parametrize(
    "text,expected",
    [
        ("BPM : 130 Clé : E minor", "E minor"),
        ("144bpm 🎵 / Abm 🎹", "Ab minor"),
        ("CLE\u00a0:\u00a0mi mineur", "E minor"),
        ("Clé\n:\nF♯ mineur", "F# minor"),
        ("Cle\u0301 = Ré♭ majeur", "Db major"),
        ("KEY — c MINOR 🎹 Achetez ici", "C minor"),
        ("Tonalité - Sol# min; BPM: 120", "G# minor"),
        ("tonalite: Fmaj", "F major"),
        ("Gamme : Fa majeur", "F major"),
        ("Key Dm", "D minor"),
        ("key: Bb major. Description", "Bb major"),
        ("144 BPM / C#maj 🎹", "C# major"),
        ("BPM: 130 | F♯min", "F# minor"),
        ("Abm 🎹 / 144bpm", "Ab minor"),
        ("150 bpm / ré mineur", "D minor"),
        ("Clé : Cmin\nKEY: Do mineur", "C minor"),
        ("Key: E minor / E min", "E minor"),
        ("144bpm / Abm\nKey: Ab minor", "Ab minor"),
    ],
)
def test_explicit_and_contextual_keys_share_the_catalogue_normalization(text, expected):
    assert extract_key("Une prod", text) == expected
    assert canonical_key(expected) == expected
    result = source_metadata(
        {"id": "abcdefghijk", "title": "Une prod", "duration": 30, "description": text},
        "abcdefghijk",
    )
    assert result["musical_key"] == expected


@pytest.mark.parametrize(
    "text",
    [
        "Je suis la pour la famille. am available. Contact ma team.",
        "Titre en Abm, ambiance triste",  # No explicit field or BPM block.
        "144bpm 🎵 / am available",
        "144bpm / family",
        "144bpm / Abmajorly talented",
        "144bpm and a new story in Abm",  # Words break the musical block.
        "Contact: info@key.am / https://example.org/key:Am",
        "https://example.org/?key=Cminor",
        "Monkeys: E minor",  # Label embedded in a word.
        "Clé: E",  # No mode: do not assume major.
        "Key: C mixolydian",  # Unsupported mode.
        "Key: Cminority",
        "2026bpm / Abm",
        "120 bpm\nAcheter la prod / Abm",
        "Key: E minor\nClé: F minor",
        "Key: Cmin / Cmaj",
        "Key: E minor ou F# minor",
        "Key: F# minor, Gb minor",  # Enharmonic spellings stay distinct.
        "144bpm / Abm 🎹\nKey: C major",
        "144bpm / Abm / Cmaj",
    ],
)
def test_ordinary_words_urls_unsupported_modes_and_conflicts_stay_unknown(text):
    assert extract_key("Une prod", text) is None


def test_title_and_description_are_checked_together_without_inventing_a_mode():
    assert extract_key("Type beat [Key: Cmin]", "Clé: Do mineur") == "C minor"
    assert extract_key("Type beat [Key: Cmin]", "Clé: F mineur") is None
    assert extract_key("Type beat [144bpm / Abm]", "") == "Ab minor"


def seed(library, title="Une prod", description="BPM : 130 Clé : E minor", key=None):
    identity = str(uuid4())
    with library.catalog() as connection:
        connection.execute(
            "INSERT INTO beats(id,title,description,musical_key,audio_path,added_at,"
            "field_provenance) VALUES(?,?,?,?,?,'2026-10-01T00:00:00Z',?)",
            (identity, title, description, key, f"audio/{identity}.mp3", '{"bpm":"manual"}'),
        )
    library.safe_path(f"audio/{identity}.mp3").write_bytes(b"unchanged original audio")
    return identity


def test_legacy_french_keys_are_presented_in_english_without_rewriting_the_catalogue(tmp_path):
    library = Library.create(tmp_path / "collection")
    try:
        identity = seed(library, key="Ré♭ majeur")
        assert beat_details(library, identity)["musical_key"] == "Db major"
        assert list_beats(library, 100, 0)["beats"][0]["musical_key"] == "Db major"
        with library.catalog() as connection:
            assert connection.execute("SELECT musical_key FROM beats").fetchone()[0] == "Ré♭ majeur"
    finally:
        library.close()


def test_backfill_is_idempotent_portable_and_keeps_manual_empty_values_and_original_sources(
    tmp_path,
):
    library = Library.create(tmp_path / "collection")
    detected = seed(library)
    compact = seed(library, description="144bpm 🎵 / Abm 🎹")
    manual = seed(library)
    empty = seed(library)
    existing = seed(library, key="D major")
    ambiguous = seed(library, description="Key: Cmin\nClé: F minor")
    corrected_description = seed(library)
    correct_metadata(library, manual, MetadataUpdate(musical_key="G mineur"))
    correct_metadata(library, empty, MetadataUpdate(musical_key=None))
    correct_metadata(
        library, corrected_description, MetadataUpdate(description="Texte réécrit sans clé")
    )
    with library.catalog() as connection:
        before = {row["id"]: dict(row) for row in connection.execute("SELECT * FROM beats")}
    assert refresh_missing_keys(library) == {"updated": 3, "preserved": 2, "unresolved": 1}
    assert refresh_missing_keys(library) == {"updated": 0, "preserved": 2, "unresolved": 1}
    assert filter_options(library)["keys"] == ["Ab minor", "D major", "E minor", "G minor"]
    assert list_beats(library, 100, 0, filters=CatalogFilters(keys=["Mi mineur"]))["total"] == 2
    library.close()
    relocated = tmp_path / "disque" / "collection"
    relocated.parent.mkdir()
    shutil.move(tmp_path / "collection", relocated)
    reopened = Library.open(relocated)
    try:
        with reopened.catalog() as connection:
            after = {row["id"]: dict(row) for row in connection.execute("SELECT * FROM beats")}
        for identity, old in before.items():
            assert reopened.safe_path(old["audio_path"]).read_bytes() == b"unchanged original audio"
            for field in old:
                if field not in {"musical_key", "field_provenance"}:
                    assert after[identity][field] == old[field]
            if identity not in {detected, compact, corrected_description}:
                assert after[identity] == old
        assert after[existing]["musical_key"] == "D major"
        assert after[ambiguous]["musical_key"] is None
        sources = json.loads(after[corrected_description]["field_provenance"])
        assert sources["bpm"] == sources["description"] == "manual"
        assert sources["musical_key"] == "explicit_text"
        assert (
            sources["original_metadata"]["description"]["value"] == before[detected]["description"]
        )
    finally:
        reopened.close()


def test_existing_refresh_route_backfills_without_download_and_keeps_api_protection(tmp_path):
    library = Library.create(tmp_path / "collection")
    identity = seed(library)
    library.close()
    with TestClient(
        create_app(frontend=tmp_path, preferences=tmp_path / "prefs.json"),
        base_url="http://127.0.0.1:8765",
    ) as client:
        assert client.post("/api/library/refresh").status_code == 403
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert client.post(
            "/api/library", json={"path": str(tmp_path / "collection")}, headers=headers
        ).is_success
        result = client.post("/api/library/refresh", headers=headers)
        assert result.is_success
        assert result.json()["musical_keys"] == {"updated": 1, "preserved": 0, "unresolved": 0}
        assert client.get(f"/api/beats/{identity}").json()["musical_key"] == "E minor"
        assert client.get("/api/beats", params={"keys": "Mi mineur"}).json()["total"] == 1
        assert client.get("/api/imports").json()["jobs"] == []
