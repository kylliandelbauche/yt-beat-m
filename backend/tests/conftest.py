import pytest


@pytest.fixture(autouse=True)
def no_channel_network(monkeypatch):
    # No live YouTube requests in automated tests. Photo tests inject controlled responses.
    def unavailable(*args):
        from yt_beat_m.library import LibraryError

        raise LibraryError("Offline fixture")

    monkeypatch.setattr("yt_beat_m.profile_photos.fetch_channel", unavailable)
