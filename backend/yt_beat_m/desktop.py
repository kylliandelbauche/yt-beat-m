"""Private desktop engine: owned socket, readiness after startup, lifetime tied to stdin."""

import asyncio
import json
import socket
import sys
import threading
from pathlib import Path

import uvicorn
from platformdirs import user_config_path

from yt_beat_m.app import create_app


async def serve(preferences: Path, frontend: Path) -> None:
    # Binding before creating the API avoids port races and never attaches to a
    # pre-existing engine. The port is known before Host/Origin validation is set.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        app = create_app(port=port, frontend=frontend, preferences=preferences)
        server = uvicorn.Server(
            uvicorn.Config(
                app,
                log_level="warning",
                access_log=False,
                loop="asyncio",
                timeout_graceful_shutdown=8,
            )
        )

        def watch_parent():
            # The pipe is private and held open by the Rust parent. EOF handles
            # normal closure and parent crashes without depending on its PID.
            sys.stdin.buffer.read()
            server.should_exit = True

        threading.Thread(target=watch_parent, daemon=True).start()
        task = asyncio.create_task(server.serve(sockets=[sock]))
        try:
            while not server.started and not task.done():
                await asyncio.sleep(0.02)
            if server.started and not server.should_exit:
                print(json.dumps({"port": port}), flush=True)
            await task
        finally:
            server.should_exit = True
            if not task.done():
                await task


def main() -> None:
    # Tests can supply isolated preferences on the private startup pipe. Normal
    # launch uses its own settings and never silently opens the web app's library.
    raw = sys.stdin.buffer.readline(8193)
    options = json.loads(raw)
    if len(raw) > 8192 or not isinstance(options, dict):
        raise ValueError("Invalid desktop startup configuration")
    preferences = options.get("preferences")
    if preferences is not None and not isinstance(preferences, str):
        raise ValueError("Invalid preferences")
    preferences = (
        Path(preferences)
        if preferences
        else user_config_path("yt-beat-m-desktop") / "preferences.json"
    )
    frontend = Path(__file__).resolve().parents[1] / "frontend"
    if not (frontend / "index.html").is_file():
        raise RuntimeError("Desktop interface is missing")
    asyncio.run(serve(preferences, frontend))


if __name__ == "__main__":
    main()
