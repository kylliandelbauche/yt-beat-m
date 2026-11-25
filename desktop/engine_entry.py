"""Frozen entry point; yt-dlp subprocesses re-enter this binary, not a system Python."""

import sys

if __name__ == "__main__":
    if sys.argv[1:3] == ["-m", "yt_dlp"]:
        from yt_dlp import main

        main(sys.argv[3:])
    else:
        from yt_beat_m.desktop import main

        main()
