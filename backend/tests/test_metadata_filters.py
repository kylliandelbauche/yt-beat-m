import json
import shutil
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from yt_beat_m.app import create_app
from yt_beat_m.beatmakers import refresh_beatmakers
from yt_beat_m.catalog import CatalogFilters, beat_details, filter_options, list_beats
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.metadata import MetadataUpdate, canonical_key, correct_metadata


@pytest.fixture
def annotated(tmp_path):
    library = Library.create(tmp_path / "catalogue")
    rows = [
        (130, "Cmin", "Nova", "Archives", ["R&B"], ["Mélancolique"], "2026-01-01"),
        (145, "Do mineur", "Ryo", "Autre", ["Drill"], ["Sombre"], "2026-02-01"),
        (150, "F minor", "Nova", "Archives", ["Drill"], ["Mélancolique"], "2026-03-01"),
        (None, None, None, None, [], [], None),
        (140, "C major", "Nova", "Archives", ["R&B"], ["Sombre"], "2026-01-01"),
        (130, "C minor", "Nova", "Autre", ["R&B", "Drill"], ["Sombre"], None),
    ]
    ids = [str(UUID(int=n + 1)) for n in range(len(rows))]
    with library.catalog() as connection:
        for i, (bpm, key, maker, channel, styles, moods, publication) in enumerate(rows):
            connection.execute(
                "INSERT INTO beats(id,title,beatmaker,channel,audio_path,added_at,published_on,"
                "bpm,musical_key,description,field_provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    ids[i],
                    f"Prod {i}",
                    maker,
                    channel,
                    f"audio/{ids[i]}.mp3",
                    f"2026-10-{10 + i:02d}T12:00:00Z",
                    publication,
                    bpm,
                    key,
                    "Texte source inchangé",
                    json.dumps({"bpm": "explicit_text"}),
                ),
            )
            (library.root / "audio" / f"{ids[i]}.mp3").write_bytes(b"original audio")
            for kind, tags in (("style", styles), ("mood", moods)):
                for label in tags:
                    connection.execute(
                        "INSERT OR IGNORE INTO tags(kind,label,normalized_label) VALUES(?,?,?)",
                        (kind, label, label.casefold()),
                    )
                    tag = connection.execute(
                        "SELECT id FROM tags WHERE kind=? AND label=?", (kind, label)
                    ).fetchone()[0]
                    connection.execute("INSERT INTO beat_tags VALUES(?,?)", (ids[i], tag))
    yield library, ids
    library.close()


def matching(library, **kwargs):
    return {r["id"] for r in list_beats(library, 100, 0, filters=CatalogFilters(**kwargs))["beats"]}


def test_card_tags_are_batched_per_beat_without_changing_pagination(annotated):
    library, ids = annotated
    page = list_beats(library, 3, 0, filters=CatalogFilters(sort="added_asc"))
    assert page["total"] == len(ids)
    assert [beat["id"] for beat in page["beats"]] == ids[:3]
    for beat in page["beats"]:
        detail = beat_details(library, beat["id"])
        assert beat["styles"] == detail["styles"]
        assert beat["moods"] == detail["moods"]
    missing = list_beats(library, 1, 3, filters=CatalogFilters(sort="added_asc"))["beats"][0]
    assert missing["styles"] == missing["moods"] == []


def test_categories_are_and_values_within_category_are_or(annotated):
    library, ids = annotated
    assert matching(
        library,
        bpm_min=130,
        bpm_max=145,
        keys=["C minor"],
        makers=["Nova", "Ryo"],
        styles=["R&B", "Drill"],
    ) == {ids[0], ids[1], ids[5]}
    assert matching(
        library,
        bpm_min=130,
        bpm_max=130,
        keys=["Do mineur"],
        channels=["Archives"],
        moods=["MELANCOLIQUE"],
    ) == {ids[0]}
    assert matching(library, bpm_min=145, bpm_max=150) == {ids[1], ids[2]}
    assert matching(library, keys=["F mineur"], styles=["R&B"]) == set()
    assert list_beats(library, 48, 0, "nova melancolique")["total"] == 2
    assert list_beats(library, 48, 0, "%")["total"] == 0


def test_missing_values_are_explicit_and_can_be_combined_with_known_values(annotated):
    library, ids = annotated
    for field in [
        "bpm_missing",
        "key_missing",
        "maker_missing",
        "channel_missing",
        "style_missing",
        "mood_missing",
    ]:
        assert matching(library, **{field: True}) == {ids[3]}
    assert matching(library, bpm_min=150, bpm_missing=True) == {ids[2], ids[3]}
    assert matching(library, keys=["F minor"], key_missing=True) == {ids[2], ids[3]}
    assert matching(library, moods=["Mélancolique"], mood_missing=True) == {ids[0], ids[2], ids[3]}


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Cmin", "C minor"),
        ("Do mineur", "C minor"),
        ("Ré♭ majeur", "Db major"),
        ("Abm", "Ab minor"),
        ("F# minor", "F# minor"),
        ("C", None),
        ("maybe minor", None),
    ],
)
def test_key_normalization_is_conservative(value, expected):
    assert canonical_key(value) == expected


@pytest.mark.parametrize(
    "filters",
    [
        CatalogFilters(bpm_min=150, bpm_max=130),
        CatalogFilters(bpm_min=0),
        CatalogFilters(bpm_max=float("nan")),
        CatalogFilters(sort="DROP TABLE beats"),
    ],
)
def test_invalid_filters_do_not_silently_change_results(annotated, filters):
    with pytest.raises(LibraryError):
        list_beats(annotated[0], 48, 0, filters=filters)


def test_pagination_after_filter_and_sort_with_unknown_publications_last(annotated):
    library, ids = annotated
    for sort in ["added_desc", "added_asc", "published_desc", "published_asc"]:
        filters = CatalogFilters(keys=["C minor", "F minor"], sort=sort)
        whole = list_beats(library, 100, 0, filters=filters)
        pages = [
            list_beats(library, 1, offset, filters=filters) for offset in range(whole["total"])
        ]
        assert [p["beats"][0]["id"] for p in pages] == [r["id"] for r in whole["beats"]]
        assert len({p["beats"][0]["id"] for p in pages}) == whole["total"] == 4
        if sort.startswith("published"):
            assert whole["beats"][-1]["id"] == ids[5]


def test_annotations_keep_originals_and_survive_restart_and_relocation(annotated, tmp_path):
    library, ids = annotated
    before = beat_details(library, ids[0])
    assert correct_metadata(
        library,
        ids[0],
        MetadataUpdate(
            bpm=150,
            musical_key="F mineur",
            styles=["  Drill ", "DRILL"],
            moods=["Été", "ete"],
            links=[{"url": "https://example.org/purchase", "label": "Acheter"}],
        ),
    )
    assert correct_metadata(library, ids[0], MetadataUpdate(bpm=None))
    refresh_beatmakers(library)
    root = library.root
    library.close()
    moved = tmp_path / "disque" / "bibliotheque"
    moved.parent.mkdir()
    shutil.move(root, moved)
    reopened = Library.open(moved)
    try:
        beat = beat_details(reopened, ids[0])
        assert beat["bpm"] is None and beat["musical_key"] == "F minor"
        assert beat["styles"] == ["Drill"] and beat["moods"] == ["Été"]
        assert beat["published_on"] == before["published_on"]
        assert (
            beat["added_at"] == before["added_at"] and beat["description"] == before["description"]
        )
        assert (moved / "audio" / f"{ids[0]}.mp3").read_bytes() == b"original audio"
        sources = beat["metadata_provenance"]
        assert sources["bpm"] == sources["musical_key"] == "manual"
        assert sources["original_metadata"]["bpm"] == {"value": 130, "source": "explicit_text"}
        assert sources["original_metadata"]["musical_key"]["value"] == "Cmin"
        assert matching(reopened, keys=["Fa mineur"], bpm_missing=True) == {ids[0]}
        assert "Été" in filter_options(reopened)["moods"]
        assert beat["links"] == [{"url": "https://example.org/purchase", "label": "Acheter"}]
        assert correct_metadata(
            reopened, ids[0], MetadataUpdate(musical_key=None, styles=[], moods=[], links=[])
        )
        assert beat_details(reopened, ids[0])["links"] == []
    finally:
        reopened.close()


@pytest.mark.parametrize(
    "payload,field",
    [
        ({"bpm": -1}, "BPM"),
        ({"bpm": float("inf")}, "BPM"),
        ({"musical_key": "F???"}, "Tonalité"),
        ({"styles": ["x" * 81]}, "Styles"),
        ({"links": [{"url": "javascript:alert(1)"}]}, "Lien"),
        ({"links": [{"url": "https://user:pass@example.org/"}]}, "Lien"),
        ({"links": [{"url": "https://example.org:invalid/"}]}, "Lien"),
    ],
)
def test_invalid_patch_is_atomic(annotated, payload, field):
    library, ids = annotated
    before = beat_details(library, ids[0])
    with pytest.raises(LibraryError, match=field):
        correct_metadata(library, ids[0], MetadataUpdate(**payload))
    assert beat_details(library, ids[0]) == before


def test_api_protection_options_repeated_filters_partial_patch_and_restart(annotated, tmp_path):
    library, ids = annotated
    root, identity = library.root, library.manifest["id"]
    library.close()
    preferences = tmp_path / "preferences.json"
    preferences.write_text(json.dumps({"library_root": str(root), "library_id": identity}))
    with TestClient(
        create_app(frontend=tmp_path, preferences=preferences), base_url="http://127.0.0.1:8765"
    ) as client:
        path = f"/api/beats/{ids[0]}/metadata"
        assert client.patch(path, json={"bpm": 150}).status_code == 403
        headers = {
            "Origin": "http://127.0.0.1:8765",
            "X-Session-Token": client.get("/api/session").json()["token"],
        }
        assert (
            client.patch(
                path, json={"bpm": 150, "musical_key": "F mineur"}, headers=headers
            ).status_code
            == 200
        )
        assert (
            client.get(
                "/api/beats?keys=F%20minor&makers=Nova&makers=Ryo&bpm_min=150&bpm_max=150"
            ).json()["total"]
            == 2
        )
        assert client.get("/api/beats?bpm_min=150&bpm_max=120").status_code == 400
        assert "F minor" in client.get("/api/catalog/filters").json()["keys"]
        assert (
            client.patch(path, json={"published_on": "2026-01-01"}, headers=headers).status_code
            == 422
        )
        assert (
            client.patch(
                f"/api/beats/{uuid4()}/metadata", json={"bpm": 150}, headers=headers
            ).status_code
            == 404
        )
    with TestClient(
        create_app(frontend=tmp_path, preferences=preferences), base_url="http://127.0.0.1:8765"
    ) as client:
        beat = client.get(f"/api/beats/{ids[0]}").json()
        assert beat["bpm"] == 150 and beat["musical_key"] == "F minor"
        assert beat["styles"] == ["R&B"] and beat["moods"] == ["Mélancolique"]


def test_tag_edits_reuse_readable_labels_from_existing_catalogues(annotated):
    library, ids = annotated
    assert correct_metadata(library, ids[1], MetadataUpdate(moods=["MELANCOLIQUE", "mélancolique"]))
    beat = beat_details(library, ids[1])
    assert beat["moods"] == ["Mélancolique"]
    assert filter_options(library)["moods"].count("Mélancolique") == 1
    with library.catalog() as connection:
        assert connection.execute("SELECT count(*) FROM tags WHERE kind='mood'").fetchone()[0] == 2


def test_unified_save_is_atomic_and_preserves_source_text(annotated):
    library, ids = annotated
    initial = beat_details(library, ids[0])
    # A channel rule must not be recorded when another field is invalid.
    with pytest.raises(LibraryError, match="Tonalité"):
        correct_metadata(
            library,
            ids[0],
            MetadataUpdate(beatmaker="Studio", remember_channel=True, musical_key="invalid"),
        )
    assert beat_details(library, ids[0]) == initial
    assert correct_metadata(
        library,
        ids[0],
        MetadataUpdate(
            title="Titre corrigé",
            description="Produced by Another",
            beatmaker="Studio",
            remember_channel=True,
            bpm=155,
        ),
    )
    corrected = beat_details(library, ids[0])
    assert (
        corrected["title"] == "Titre corrigé" and corrected["description"] == "Produced by Another"
    )
    assert corrected["beatmaker"] == "Studio" and corrected["channel"] == "Archives"
    assert corrected["channel_alias"]["beatmaker"] == "Studio"
    originals = corrected["metadata_provenance"]["original_metadata"]
    assert originals["title"]["value"] == initial["title"]
    assert originals["description"]["value"] == initial["description"]
    # Deleting a rule and a bad producer correction in one save must roll back together.
    with pytest.raises(LibraryError, match="beatmaker"):
        correct_metadata(
            library,
            ids[0],
            MetadataUpdate(
                forget_channel_alias=True, beatmaker="bad\x00name", title="Pas enregistré"
            ),
        )
    assert beat_details(library, ids[0]) == corrected
    assert correct_metadata(
        library, ids[0], MetadataUpdate(forget_channel_alias=True, reset_beatmaker=True)
    )
    reset = beat_details(library, ids[0])
    assert reset["channel_alias"] is None
    assert (
        reset["beatmaker"] == "Archives"
    )  # Proposal uses the original source, not the edited text.
    assert reset["bpm"] == 155
    assert (
        reset["published_on"] == initial["published_on"]
        and reset["added_at"] == initial["added_at"]
    )
