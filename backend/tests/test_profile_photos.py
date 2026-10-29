import base64
import json
from pathlib import Path

import pytest
from test_profiles import add_beat
from yt_beat_m.library import Library, LibraryError
from yt_beat_m.profile_photos import (
    download_avatar,
    enrich_next_photo,
    fetch_channel,
    request_photo,
    trusted_image,
)
from yt_beat_m.profiles import (
    ProfileUpdate,
    delete_profile,
    get_profile,
    list_profiles,
    save_profile,
)

JPEG = base64.b64decode((Path(__file__).parent / "fixtures/mint-cover.jpg.base64").read_text())


def test_portrait_owner_only_failure_cooldown_retry_and_manual_priority(tmp_path, monkeypatch):
    lib = Library.create(tmp_path / "Library")
    try:
        add_beat(lib, "LACCO x @m3nacebeats", channel="prodlacco")
        profiles = list_profiles(lib)["profiles"]
        owner = next(p for p in profiles if p["name"] == "LACCO")
        guest = next(p for p in profiles if p["name"] == "@m3nacebeats")
        assert get_profile(lib, guest["id"])["youtube_channels"] == [
            {"url": "https://www.youtube.com/@m3nacebeats", "label": "@m3nacebeats"}
        ]
        assert enrich_next_photo(lib, None)  # controlled offline default
        assert enrich_next_photo(lib, None)  # guest uses its own explicit handle
        assert not enrich_next_photo(lib, None)  # cooldown, not one request per render
        assert not get_profile(lib, owner["id"])["photo_url"]
        request_photo(lib, owner["id"])
        monkeypatch.setattr(
            "yt_beat_m.profile_photos.fetch_channel", lambda *a: (JPEG, "image/jpeg")
        )
        assert enrich_next_photo(lib, None)
        assert get_profile(lib, owner["id"])["photo_origin"] == "youtube"
        assert not get_profile(lib, guest["id"])["photo_url"]
        save_profile(
            lib, ProfileUpdate(name="LACCO", photo=base64.b64encode(JPEG).decode()), owner["id"]
        )
        with pytest.raises(LibraryError, match="manuelle"):
            request_photo(lib, owner["id"])
        assert not enrich_next_photo(lib, None)
        save_profile(lib, ProfileUpdate(name="LACCO", photo=None), owner["id"])
        assert not enrich_next_photo(lib, None)  # explicit removal is respected
        request_photo(lib, owner["id"])

        def concurrent_manual(*args):
            save_profile(lib, ProfileUpdate(name="LACCO", photo=None), owner["id"])
            return JPEG, "image/jpeg"

        monkeypatch.setattr("yt_beat_m.profile_photos.fetch_channel", concurrent_manual)
        enrich_next_photo(lib, None)
        assert not get_profile(lib, owner["id"])["photo_url"]
        request_photo(lib, owner["id"])

        def concurrent_delete(*args):
            delete_profile(lib, owner["id"])
            return JPEG, "image/jpeg"

        monkeypatch.setattr("yt_beat_m.profile_photos.fetch_channel", concurrent_delete)
        enrich_next_photo(lib, None)
        assert not get_profile(lib, owner["id"])
    finally:
        lib.close()


@pytest.mark.parametrize(
    "url",
    [
        "http://yt3.googleusercontent.com/image",
        "https://localhost/x",
        "https://127.0.0.1/x",
        "https://yt3.googleusercontent.com.evil.org/x",
        "https://user@yt3.googleusercontent.com/x",
        "https://yt3.googleusercontent.com:443/x",
        "file:///tmp/photo",
        "https://yt3.googleusercontent.com/\nx",
    ],
)
def test_untrusted_avatar_urls_never_requested(url):
    assert not trusted_image(url)
    with pytest.raises(LibraryError):
        download_avatar(url)


def test_metadata_avatar_only_validated_channel_no_video_thumbnail(monkeypatch):
    import yt_beat_m.profile_photos as photos

    captured = []

    class Runner:
        def run(self, args, *, timeout):
            captured.append(args[-1])
            assert timeout == 15 and "--playlist-items" in args
            return json.dumps(
                {
                    "channel_id": "UC" + "a" * 22,
                    "channel": "Samoss",
                    "thumbnails": [
                        {"url": "https://i.ytimg.com/video.jpg"},
                        {"url": "https://yt3.googleusercontent.com/portrait", "width": 900},
                    ],
                }
            )

    monkeypatch.setattr(
        photos,
        "download_avatar",
        lambda u, **kwargs: (JPEG, "image/jpeg") if u.endswith("/portrait") else None,
    )
    assert fetch_channel("UC" + "a" * 22, None, Runner()) == (JPEG, "image/jpeg")
    assert captured == ["https://www.youtube.com/channel/UC" + "a" * 22]
    with pytest.raises(LibraryError):
        fetch_channel("UC" + "b" * 22, None, Runner())
    with pytest.raises(LibraryError):
        fetch_channel(None, "http://localhost", Runner())
    with pytest.raises(LibraryError):
        fetch_channel(None, "OtherArtist", Runner())


def test_redirect_to_localhost_is_refused_and_size_is_bounded(monkeypatch):
    from urllib.error import HTTPError

    import yt_beat_m.profile_photos as photos

    calls = []

    class Redirect:
        def open(self, request, timeout):
            calls.append(request.full_url)
            raise HTTPError(
                request.full_url, 302, "redirect", {"Location": "http://127.0.0.1/private"}, None
            )

    monkeypatch.setattr(photos, "build_opener", lambda *a: Redirect())
    with pytest.raises(LibraryError):
        download_avatar("https://yt3.ggpht.com/portrait")
    assert len(calls) == 1

    class Response:
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def read(self, limit):
            assert limit == 2 * 1024 * 1024 + 1
            return b"\xff\xd8\xff" + b"x" * (limit - 3)

    class BigImage:
        def open(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr(photos, "build_opener", lambda *a: BigImage())
    with pytest.raises(LibraryError):
        download_avatar("https://yt3.ggpht.com/portrait")


def test_existing_source_channel_wins_over_display_name_and_guest_stays_separate(tmp_path):
    from yt_beat_m.profile_photos import photo_candidate

    lib = Library.create(tmp_path / "Collection")
    try:
        beat = add_beat(lib, "Elegance", channel="Elegance isn't it?")
        identity = list_profiles(lib)["profiles"][0]["id"]
        channel_id = "UC" + "a" * 22
        with lib.catalog() as c:
            c.execute(
                "UPDATE beats SET channel_id=?,youtube_id=? WHERE id=?",
                (channel_id, "abcdefghijk", beat),
            )
            assert photo_candidate(c, identity) == (
                identity,
                channel_id,
                "Elegance isn't it?",
                "abcdefghijk",
            )
        assert get_profile(lib, identity)["youtube_channels"] == [
            {"url": "https://www.youtube.com/channel/" + channel_id, "label": "Elegance isn't it?"}
        ]
        # A guest in a collaboration cannot inherit this uploader's portrait.
        other = add_beat(lib, "Owner x Guest", channel="Owner channel")
        guest = next(p for p in list_profiles(lib)["profiles"] if p["name"] == "Guest")
        with lib.catalog() as c:
            c.execute("UPDATE beats SET channel_id=? WHERE id=?", ("UC" + "b" * 22, other))
            assert photo_candidate(c, guest["id"]) is None
        assert get_profile(lib, guest["id"])["youtube_channels"] == []
    finally:
        lib.close()


def test_legacy_source_resolves_channel_from_video_without_guessing_handle(monkeypatch):
    import yt_beat_m.profile_photos as photos

    calls = []
    channel_id = "UC" + "a" * 22

    class Runner:
        def run(self, args, *, timeout):
            calls.append(args[-1])
            if "/watch?v=" in args[-1]:
                return json.dumps({"id": "abcdefghijk", "channel_id": channel_id})
            return json.dumps(
                {
                    "channel_id": channel_id,
                    "thumbnails": [{"url": "https://yt3.googleusercontent.com/portrait"}],
                }
            )

    monkeypatch.setattr(photos, "download_avatar", lambda *a, **k: (JPEG, "image/jpeg"))
    assert fetch_channel(None, "A different display name", Runner(), "abcdefghijk") == (
        JPEG,
        "image/jpeg",
    )
    assert calls == [
        "https://www.youtube.com/watch?v=abcdefghijk",
        "https://www.youtube.com/channel/" + channel_id,
    ]
    calls.clear()
    with pytest.raises(LibraryError):
        fetch_channel(None, "GuessedHandle", Runner())
    assert not calls

    class WrongVideo:
        def run(self, *args, **kwargs):
            return json.dumps({"id": "wrongvideo1", "channel_id": channel_id})

    with pytest.raises(LibraryError):
        fetch_channel(None, "Name", WrongVideo(), "abcdefghijk")
