import re
import unicodedata
from pathlib import Path

import pytest
from yt_beat_m.audio_filename import audio_filename


def test_filename_has_requested_order_and_decimal_bpm():
    assert (
        audio_filename("Ozone", {"title": "Nuit blanche", "bpm": 130.5, "musical_key": "E minor"})
        == "Ozone_Nuit-blanche_130.5BPM_E-minor.mp3"
    )


def test_unknown_values_are_explicit():
    assert (
        audio_filename(None, {"title": "Titre", "bpm": None, "musical_key": None})
        == "Beatmaker-inconnu_Titre_BPM-inconnu_Tonalité-inconnue.mp3"
    )


@pytest.mark.parametrize("reserved", ["CON", "nul.wav", "LPT1", "COM¹", "CONOUT$"])
def test_reserved_names_are_sanitized(reserved):
    name = audio_filename(reserved, {"title": reserved, "bpm": 140, "musical_key": "F# minor"})
    assert name.startswith("_" + reserved + "__" + reserved)


def test_unicode_limits_invalid_characters_and_metadata_are_preserved(tmp_path):
    name = audio_filename(
        "é" * 500,
        {"title": '../CON: "été"\\<>|?*\x00\n' + "🎹" * 300, "bpm": 144, "musical_key": "Ab minor"},
    )
    assert len(unicodedata.normalize("NFD", name).encode("utf-8")) <= 180
    assert not re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
    assert name.endswith("_144BPM_Ab-minor.mp3")
    assert not re.search(r"\s", name)
    assert unicodedata.normalize("NFC", name) == name
    file = tmp_path / name
    file.write_bytes(b"test")
    assert file.read_bytes() == b"test"
    assert file.name == name
    assert Path(name).name == name


def test_user_example_uses_underscores_and_no_spaces():
    assert (
        audio_filename(
            "Black Eagle",
            {
                "title": "(FREE) Not just-a-guitar-type beat-chapter1-Story-of-my-life",
                "bpm": 150,
                "musical_key": None,
            },
        )
        == "Black-Eagle_(FREE)-Not-just-a-guitar-type-beat-chapter1-Story-of-my-life"
        "_150BPM_Tonalité-inconnue.mp3"
    )


@pytest.mark.parametrize("space", [" ", "\t", "\n", "\r\n", "\u00a0", "\u202f", "\u2003"])
def test_unicode_whitespace_is_replaced_in_every_field(space):
    name = audio_filename(
        f"Black{space}Eagle",
        {
            "title": f"Une{space}prod",
            "bpm": 150,
            "musical_key": f"F#{space}minor",
        },
    )
    assert name == "Black-Eagle_Une-prod_150BPM_F#-minor.mp3"
    assert not any(char.isspace() for char in name)
