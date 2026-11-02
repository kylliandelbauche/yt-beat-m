import json
import shutil
import sqlite3
from contextlib import closing
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m import library as storage
from yt_beat_m.app import create_app
from yt_beat_m.beatmakers import (
    correct_beatmaker,
    forget_channel_alias,
    producer_credit,
    propose,
    refresh_beatmakers,
    reset_beatmaker,
)
from yt_beat_m.catalog import beat_details, list_beats
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.metadata import MetadataUpdate, correct_metadata


@pytest.fixture
def library(tmp_path):
    value = Library.create(tmp_path / "collection")
    yield value
    value.close()


def add_beat(
    library,
    *,
    title="Prod test",
    description=None,
    channel="prod_oson",
    channel_id=None,
    beatmaker=None,
    source=None,
):
    identity = str(uuid4())
    fields = {"title": "youtube", "bpm": "explicit_text"}
    if source:
        fields["beatmaker"] = source
    with library.catalog() as connection:
        connection.execute(
            "INSERT INTO beats(id,title,description,channel,channel_id,beatmaker,field_provenance,"
            "audio_path,added_at,bpm,favorite) "
            "VALUES(?,?,?,?,?,?,?,?,'2026-10-24T12:00:00Z',135,1)",
            (
                identity,
                title,
                description,
                channel,
                channel_id,
                beatmaker,
                json.dumps(fields),
                f"audio/{identity}.mp3",
            ),
        )
    library.safe_path(f"audio/{identity}.mp3").write_bytes(b"media to preserve unchanged")
    return identity


@pytest.mark.parametrize(
    ("title", "description", "expected"),
    [
        ("Beat (prod.oson)", None, ("oson", "explicit_credit")),
        ("Beat [Prod. Oson]", "Produced by oson", ("Oson", "explicit_credit")),
        (
            "Beat",
            "Merci de me créditer (Prod. Samoss) ou @samossprod",
            ("Samoss", "explicit_credit"),
        ),
        ("Beat", "Produit par Étoile\nBPM : 130", ("Étoile", "explicit_credit")),
        ("Beat", "Beat by Nova", ("Nova", "explicit_credit")),
        ("Beat (Prod. by Nova)", None, ("Nova", "explicit_credit")),
        ("Beat (prod.oson x jissa)", None, ("oson x jissa", "explicit_credit")),
        ("Beat", "Produced by Nova & Ryo", ("Nova & Ryo", "explicit_credit")),
        ("Beat (prod. Nova)", "Produced by Ryo", (None, "ambiguous_credit")),
        ("Beat (prod. Nova x Ryo)", "Produced by Nova", (None, "ambiguous_credit")),
        ("[FREE] Drake type beat", "Instagram : @nova\nPurchase https://example.org", (None, None)),
        ("Beat", "Produced by https://example.org", (None, None)),
        ("Beat", "Produced by artist@example.org", (None, None)),
        ("Beat", "Production tips and tricks", (None, None)),
        ("Prod test", None, (None, None)),
        ("Prod beatmaker 1", "Produced by Raw", ("Raw", "explicit_credit")),
        ("Beat", "Prod. 130 BPM", (None, None)),
    ],
)
def test_only_explicit_consistent_credits_are_names(title, description, expected):
    assert producer_credit(title, description) == expected


def test_channel_fallback_and_missing_sources_are_honest(library):
    with library.catalog() as connection:
        assert propose(
            connection, {"title": "Beat", "channel": "Collectif", "description": None}
        ) == ("Collectif", "channel")
        assert propose(connection, {"title": "Beat", "channel": None}) == (None, None)
        assert propose(
            connection,
            {"title": "Beat (prod. Nova)", "channel": "Archive", "description": "Produced by Ryo"},
        ) == (None, "ambiguous_credit")


def test_alias_uses_stable_id_and_preserves_other_producers_and_collaborations(library):
    first = add_beat(library, title="Beat (prod. Raw)", channel_id="UC-stable")
    same = add_beat(
        library, title="Other (Prod. RAW)", channel="Renamed channel", channel_id="UC-stable"
    )
    fallback = add_beat(library, channel="Renamed again", channel_id="UC-stable")
    guest = add_beat(library, title="Beat (prod. Guest)", channel_id="UC-stable")
    collab = add_beat(library, title="Beat (prod. Raw x Nova)", channel_id="UC-stable")
    unrelated = add_beat(library, channel_id="UC-another")
    assert correct_beatmaker(library, first, "Canonical", True)
    result = refresh_beatmakers(library)
    assert result["preserved"] == 1
    for identity in (first, same, fallback):
        assert beat_details(library, identity)["beatmaker"] == "Canonical"
    assert beat_details(library, same)["beatmaker_source"] == "channel_alias"
    assert beat_details(library, guest)["beatmaker"] == "Guest"
    assert beat_details(library, collab)["beatmaker"] == "Raw x Nova"
    assert beat_details(library, unrelated)["beatmaker"] == "prod_oson"
    assert list_beats(library, 48, 0, "canonical")["total"] == 3


def test_legacy_name_alias_can_be_forgotten_without_losing_corrections(library):
    first = add_beat(library, channel=" prod_oson ")
    second = add_beat(library, channel="PROD_OSON")
    correct_beatmaker(library, first, "oson", True)
    refresh_beatmakers(library)
    assert beat_details(library, second)["beatmaker"] == "oson"
    assert beat_details(library, first)["channel_alias"]["uses_channel_id"] is False
    assert forget_channel_alias(library, first)
    assert beat_details(library, first)["beatmaker"] == "oson"
    assert beat_details(library, first)["channel_alias"] is None
    refresh_beatmakers(library)
    assert beat_details(library, second)["beatmaker"] == "PROD_OSON"
    assert reset_beatmaker(library, first)
    assert beat_details(library, first)["beatmaker"] == " prod_oson "


def test_refresh_preserves_manual_empty_legacy_values_other_fields_and_media(library):
    manual = add_beat(library, title="Beat (prod. Nova)")
    legacy = add_beat(library, beatmaker="Historical name")
    automatic = add_beat(library, title="Beat (prod.oson)")
    correct_beatmaker(library, manual, None, False)
    refresh_beatmakers(library)
    assert beat_details(library, manual)["beatmaker"] is None
    assert beat_details(library, manual)["beatmaker_source"] == "manual"
    assert beat_details(library, legacy)["beatmaker"] == "Historical name"
    assert beat_details(library, automatic)["beatmaker"] == "oson"
    assert refresh_beatmakers(library)["updated"] == 0
    for identity in (manual, legacy, automatic):
        detail = beat_details(library, identity)
        assert detail["bpm"] == 135 and detail["favorite"] is True
        assert detail["added_at"] == "2026-10-24T12:00:00Z"
        assert (
            library.safe_path(f"audio/{identity}.mp3").read_bytes()
            == b"media to preserve unchanged"
        )
    reset_beatmaker(library, manual)
    assert beat_details(library, manual)["beatmaker"] == "Nova"


def test_invalid_alias_is_transactional_and_unknown_ids_are_reported(library):
    ambiguous = add_beat(library, title="Beat (prod. Nova)", description="Produced by Ryo")
    with pytest.raises(LibraryError, match="contradictoires"):
        correct_beatmaker(library, ambiguous, "Nova", True)
    assert beat_details(library, ambiguous)["beatmaker"] is None
    assert beat_details(library, ambiguous)["channel_alias"] is None
    for value in ["Two\nLines", "Zero\u200bWidth"]:
        with pytest.raises(LibraryError, match="une ligne"):
            correct_beatmaker(library, ambiguous, value, False)
    missing_channel = add_beat(library, channel=None)
    with pytest.raises(LibraryError, match="chaîne"):
        correct_beatmaker(library, missing_channel, "Nova", True)
    assert not correct_beatmaker(library, str(uuid4()), "Nova", False)
    assert not reset_beatmaker(library, str(uuid4()))
    assert not forget_channel_alias(library, str(uuid4()))


def test_real_v1_migration_backup_alias_and_correction_move_with_library(tmp_path, monkeypatch):
    root = tmp_path / "Ancien disque été"
    with monkeypatch.context() as context:
        context.setattr(storage, "MIGRATIONS", {1: storage.MIGRATIONS[1]})
        old = Library.create(root)
        identity = str(uuid4())
        with old.catalog() as connection:
            connection.execute(
                "INSERT INTO beats(id,title,channel,audio_path,added_at) VALUES(?,?,?,?,?)",
                (identity, "Beat (prod.oson)", "prod_oson", f"audio/{identity}.mp3", "2026-10-24"),
            )
        old.close()
    migrated = Library.open(root)
    assert migrated.summary()["schema_version"] == max(storage.MIGRATIONS)
    backup = next((root / "backups").glob("*.sqlite3"))
    with closing(sqlite3.connect(backup)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
        assert connection.execute("SELECT channel FROM beats").fetchone()[0] == "prod_oson"
    refresh_beatmakers(migrated)
    correct_beatmaker(migrated, identity, "oson officiel", True)
    migrated.close()
    moved = tmp_path / "Autre disque"
    shutil.move(root, moved)
    reopened = Library.open(moved)
    try:
        detail = beat_details(reopened, identity)
        assert detail["beatmaker"] == "oson officiel"
        assert detail["channel_alias"]["beatmaker"] == "oson officiel"
        assert detail["beatmaker_source"] == "manual"
    finally:
        reopened.close()


def test_api_protection_validation_and_persistence_after_restart(library, tmp_path):
    identity = add_beat(library, title="Beat (prod.oson)", channel_id="UC-stable")
    root = library.root
    library_id = library.manifest["id"]
    library.close()
    preferences = tmp_path / "prefs.json"
    preferences.write_text(json.dumps({"library_root": str(root), "library_id": library_id}))

    def app():
        return TestClient(
            create_app(frontend=tmp_path, preferences=preferences), base_url="http://127.0.0.1:8765"
        )

    path = f"/api/beats/{identity}/beatmaker"
    with app() as client:
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        for method, endpoint in [
            ("PATCH", path),
            ("DELETE", path),
            ("DELETE", f"/api/beats/{identity}/channel-alias"),
            ("POST", "/api/library/beatmakers/refresh"),
        ]:
            assert client.request(method, endpoint, json={"beatmaker": "oson"}).status_code == 403
        assert client.patch(path, json={"beatmaker": "x" * 201}, headers=headers).status_code == 422
        assert (
            client.patch(
                path, json={"beatmaker": "oson officiel", "remember_channel": True}, headers=headers
            ).status_code
            == 200
        )
    with app() as client:
        detail = client.get(f"/api/beats/{identity}").json()
        assert detail["beatmaker"] == "oson officiel"
        assert detail["channel_alias"]["uses_channel_id"] is True
        assert client.get("/api/beats?q=oson%20officiel").json()["total"] == 1
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert (
            client.post("/api/library/beatmakers/refresh", headers=headers).json()["preserved"] == 1
        )
        assert (
            client.delete(f"/api/beats/{identity}/channel-alias", headers=headers).json()[
                "channel_alias"
            ]
            is None
        )
        assert client.delete(path, headers=headers).json()["beatmaker"] == "oson"
        assert (
            client.patch(
                f"/api/beats/{uuid4()}/beatmaker", json={"beatmaker": "Nova"}, headers=headers
            ).status_code
            == 404
        )


def test_old_name_rule_reaches_new_import_and_stable_rule_takes_priority(library):
    old = add_beat(library, channel="Archives", title="Beat (prod. Raw)")
    future = add_beat(library, channel="Archives", channel_id="UC-stable", title="Beat (prod. Raw)")
    correct_beatmaker(library, old, "Canonical", True)
    refresh_beatmakers(library)
    assert beat_details(library, future)["beatmaker"] == "Canonical"
    assert beat_details(library, future)["channel_alias"]["uses_channel_id"] is False
    correct_beatmaker(library, future, "Stable name", True)
    assert beat_details(library, future)["channel_alias"]["uses_channel_id"] is True
    assert reset_beatmaker(library, future)
    assert beat_details(library, future)["beatmaker"] == "Stable name"
    forget_channel_alias(library, future)
    assert beat_details(library, future)["channel_alias"] is None
    assert beat_details(library, old)["beatmaker"] == "Canonical"


def test_channel_name_correction_also_maps_a_later_matching_explicit_credit(library):
    first = add_beat(library, channel="Nova", channel_id="UC-stable")
    next_beat = add_beat(library, channel="Nova", channel_id="UC-stable", title="Beat (prod. Nova)")
    correct_beatmaker(library, first, "Nova Studio", True)
    refresh_beatmakers(library)
    assert beat_details(library, next_beat)["beatmaker"] == "Nova Studio"


@pytest.mark.parametrize("pronoun", ["me", "MYSELF", "moi", "moi-même", "moi‑même"])
def test_self_references_are_not_confirmed_artist_names(library, pronoun):
    assert producer_credit("Beat", f"prod by {pronoun}") == (pronoun, "self_credit")
    with library.catalog() as connection:
        assert propose(
            connection,
            {
                "title": "Beat",
                "description": f"prod by {pronoun}",
                "channel": "prodlacco",
            },
        ) == ("prodlacco", "channel_self_credit")
        assert propose(
            connection,
            {
                "title": "Beat",
                "description": f"prod by {pronoun}",
                "channel": None,
            },
        ) == (None, "unresolved_self_credit")


@pytest.mark.parametrize("separator", [" x ", " & ", " + ", " × ", " et ", " and "])
def test_self_collaborations_keep_the_guest_and_do_not_infer_a_person_from_socials(
    library, separator
):
    description = (
        f"prod by me{separator}@m3nacebeats   💰 Download / Purchase: https://example.org\n"
        "Instagram: prod.lacco\n© LACCO – All rights reserved\nContact: lacco@example.org"
    )
    with library.catalog() as connection:
        assert propose(
            connection,
            {
                "title": "Old money",
                "description": description,
                "channel": "prodlacco",
            },
        ) == ("prodlacco x @m3nacebeats", "channel_self_credit")
        # A repost or collective channel remains an unconfirmed source, not proof
        # that Instagram/copyright or the uploading channel is the composer.
        assert propose(
            connection,
            {
                "title": "Old money",
                "description": description,
                "channel": "Archives / collectif",
            },
        ) == ("Archives / collectif x @m3nacebeats", "channel_self_credit")
        assert propose(
            connection,
            {
                "title": "Old money",
                "description": description,
                "channel": None,
            },
        ) == ("À préciser x @m3nacebeats", "unresolved_self_credit")


@pytest.mark.parametrize("label", ["Compositeur", "COMPOSITEURS", "Compositrice"])
def test_explicit_french_composer_is_used_instead_of_channel_or_socials(library, label):
    description = (
        f"Crédit :\r\nNom de l’instrumentale : LA VIE EST BELLE\r\n{label}\u00a0: Jake B\r\n"
    )
    with library.catalog() as connection:
        assert propose(
            connection,
            {
                "title": "Melodic Hoodtrap Type Beat",
                "description": description,
                "channel": "Autre chaîne",
            },
        ) == ("Jake B", "explicit_credit")


def test_handles_and_names_containing_pronoun_letters_are_not_rewritten(library):
    for name in ["Meek", "MyselfBeats", "MoiRecords", "@me", "@myself", "ＮＯＶＡ"]:
        assert producer_credit("Beat", f"Produced by {name}") == (name, "explicit_credit")
    with library.catalog() as connection:
        assert propose(
            connection,
            {
                "title": "Beat (prod. Nova x @Guest)",
                "description": "prod by me x @Guest",
                "channel": "Reuploads",
            },
        ) == ("Nova x @Guest", "explicit_credit")
        assert propose(
            connection,
            {
                "title": "Beat (prod. Nova x Ryo)",
                "description": "prod by me",
                "channel": "Archives",
            },
        ) == (None, "ambiguous_credit")
        assert propose(
            connection,
            {
                "title": "Beat (prod. Nova)",
                "description": "Compositeur: Jake B",
                "channel": "Archives",
            },
        ) == (None, "ambiguous_credit")


def test_known_channel_rule_resolves_only_the_owner_and_keeps_each_new_guest(library):
    first = add_beat(library, title="Beat (prod. Raw)", channel_id="UC-known")
    correct_beatmaker(library, first, "Laco", True)
    guests = []
    for guest in ["@m3nacebeats", "@Other"]:
        identity = add_beat(
            library, description=f"prod by moi x {guest}", channel="Renamed", channel_id="UC-known"
        )
        guests.append(identity)
    refresh_beatmakers(library)
    for identity, guest in zip(guests, ["@m3nacebeats", "@Other"], strict=True):
        detail = beat_details(library, identity)
        assert detail["beatmaker"] == f"Laco x {guest}"
        assert detail["beatmaker_source"] == "channel_alias_self_credit"
    assert refresh_beatmakers(library)["updated"] == 0


def test_rule_correcting_a_self_collaboration_does_not_leak_its_guest(library):
    first = add_beat(library, description="prod by me x @m3nacebeats", channel_id="UC-known")
    correct_beatmaker(library, first, "Laco x @m3nacebeats", True)
    next_beat = add_beat(library, description="prod by me x @Other", channel_id="UC-known")
    refresh_beatmakers(library)
    assert beat_details(library, first)["beatmaker"] == "Laco x @m3nacebeats"
    assert beat_details(library, first)["beatmaker_source"] == "manual"
    assert beat_details(library, next_beat)["beatmaker"] == "Laco x @Other"


@pytest.mark.parametrize(
    "explicit,expected,origin",
    [
        ("Raw", "Canonical x @Guest", "channel_alias_self_credit"),
        ("Other producer", "Other producer x @Guest", "explicit_credit"),
    ],
)
def test_named_self_credit_uses_matching_alias_without_overriding_a_different_artist(
    library,
    explicit,
    expected,
    origin,
):
    first = add_beat(library, title="Beat (prod. Raw)", channel_id="UC-known")
    correct_beatmaker(library, first, "Canonical", True)
    identity = add_beat(
        library,
        title=f"Beat (prod. {explicit} x @Guest)",
        description="prod by me x @Guest",
        channel_id="UC-known",
    )
    refresh_beatmakers(library)
    detail = beat_details(library, identity)
    assert detail["beatmaker"] == expected
    assert detail["beatmaker_source"] == origin


def test_a_whole_collective_alias_is_not_reused_as_a_single_author(library):
    first = add_beat(library, title="Beat (prod. Raw x Guest)", channel_id="UC-collective")
    correct_beatmaker(library, first, "Canonical collective", True)
    next_beat = add_beat(library, description="prod by me x @Other", channel_id="UC-collective")
    refresh_beatmakers(library)
    assert beat_details(library, first)["beatmaker"] == "Canonical collective"
    assert beat_details(library, next_beat)["beatmaker"] == "prod_oson x @Other"
    assert beat_details(library, next_beat)["beatmaker_source"] == "channel_self_credit"


def test_existing_self_credits_refresh_from_original_text_and_keep_manual_values_and_media(library):
    automatic = add_beat(
        library,
        description="prod by me x @Guest",
        channel="prodlacco",
        beatmaker="me x @Guest",
        source="explicit_credit",
    )
    manual = add_beat(library, description="prod by me x @Guest")
    empty = add_beat(library, description="prod by moi")
    correct_beatmaker(library, manual, "Mon crédit choisi", False)
    correct_beatmaker(library, empty, None, False)
    correct_metadata(library, automatic, MetadataUpdate(description="Description corrigée"))
    with library.catalog() as connection:
        before = {row["id"]: dict(row) for row in connection.execute("SELECT * FROM beats")}
    result = refresh_beatmakers(library)
    assert result == {"updated": 1, "preserved": 2, "unresolved": 0}
    assert beat_details(library, automatic)["beatmaker"] == "prodlacco x @Guest"
    assert beat_details(library, manual)["beatmaker"] == "Mon crédit choisi"
    assert beat_details(library, empty)["beatmaker"] is None
    with library.catalog() as connection:
        for row in connection.execute("SELECT * FROM beats"):
            for field in row.keys():
                if field not in {"beatmaker", "field_provenance"}:
                    assert row[field] == before[row["id"]][field]
            assert (
                library.safe_path(row["audio_path"]).read_bytes() == b"media to preserve unchanged"
            )
    assert beat_details(library, automatic)["metadata_provenance"]["description"] == "manual"
