#!/usr/bin/env python3
"""Serve the startup animation for a browser preview — no DSH, no install.

The addon has a built-in static-preview mode: when `/api/access` and `/api/profile`
both 404, the page knows there is no host and plays the show on its own (the inventory
panel simply stays "未读取"). This server provides exactly that environment plus the one
path remap the page expects, so the animation, the voice and the Space emergency panel
can all be reviewed in any browser.

  python scripts/preview_startup_animation.py                 # staged addon, port 8788
  python scripts/preview_startup_animation.py --port 9000
  python scripts/preview_startup_animation.py --root /path/to/plugin

Loopback only. Read-only: it never writes and never touches a DSH profile.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

DEFAULT_PORT = 8788


def _open(url: str) -> None:
    try:
        webbrowser.open(url)
    except Exception:
        pass


def resolve_root(explicit: Path | None) -> Path:
    if explicit:
        return explicit.expanduser().resolve()
    home = Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh"))
    return (home / "startup-animation" / "plugin").resolve()


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves the addon directory with the preview's expected path layout."""

    def __init__(self, *args, root: Path, **kwargs):
        self.root = root
        super().__init__(*args, directory=str(root), **kwargs)

    def log_message(self, fmt, *args):  # keep the console readable
        if "/api/" not in str(args[0] if args else ""):
            sys.stderr.write("  %s\n" % (fmt % args))

    def _send_json(self, status: int, payload: str) -> None:
        body = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/assets/startup-preview.html")
            self.end_headers()
            return
        if path.startswith("/api/"):
            # Both 404s are what put the page into its static-preview mode.
            self._send_json(404, '{"error":"preview"}')
            return
        if path.startswith("/assets/voice/"):
            self.path = "/assets/assets/voice/" + path[len("/assets/voice/"):]
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def free_port(preferred: int) -> int:
    for candidate in (preferred, preferred + 1, preferred + 2, 0):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", candidate))
            except OSError:
                continue
            return candidate if candidate else probe.getsockname()[1]
    raise SystemExit("no free port")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, help="addon directory (default: $DSH_HOME/startup-animation/plugin)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-open", action="store_true", help="do not open a browser")
    args = parser.parse_args()

    root = resolve_root(args.root)
    page = root / "assets" / "startup-preview.html"
    if not page.is_file():
        print(f"! not an assembled addon: {page} is missing", file=sys.stderr)
        print("  run scripts/install_startup_animation.py first, or pass --root", file=sys.stderr)
        return 2
    if not (root / "assets" / "assets" / "voice").is_dir():
        print(f"! narration assets missing under {root / 'assets' / 'assets' / 'voice'}", file=sys.stderr)
        return 2

    port = free_port(args.port)
    handler = functools.partial(Handler, root=root)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as httpd:
        url = f"http://127.0.0.1:{port}/assets/startup-preview.html"
        print(f"serving  : {root}")
        print(f"preview  : {url}")
        print("keys     : click/Enter start · Space emergency panel · C settings · M mute · Esc skip")
        print("stop     : Ctrl+C")
        if not args.no_open:
            # Open once the socket is actually accepting, not before.
            threading.Timer(0.6, lambda: _open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
