from yt_beat_m import diagnostics


def test_missing_command_has_actionable_hint(monkeypatch):
    monkeypatch.setattr(diagnostics, "command_version", lambda *_: None)
    result = diagnostics.get_diagnostics()
    assert result["ready"] is False
    ffmpeg = next(item for item in result["dependencies"] if item["name"] == "FFmpeg")
    assert not ffmpeg["available"]
    assert "PATH" in ffmpeg["hint"]


def test_old_node_is_not_ready(monkeypatch):
    monkeypatch.setattr(diagnostics, "command_version", lambda *_: "v20.19.0")
    result = diagnostics.get_diagnostics()
    assert not next(item for item in result["dependencies"] if item["name"] == "Node.js")[
        "available"
    ]
