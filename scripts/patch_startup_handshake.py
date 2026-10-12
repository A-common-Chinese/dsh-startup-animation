#!/usr/bin/env python3
"""Make the film <-> parent handshake work when the app window is not http(s).

The DSH desktop window loads from the custom scheme `dsh-app://app`, while the film is
served over http://127.0.0.1:<port>. Upstream assumed both sides share one http origin:

  * startup-embed.js only accepted `http:`/`https:` parentOrigin values, so with
    `dsh-app://app` it left `target` null, `DSHEmbed.embedded` stayed false and the film
    never announced readiness - the overlay always fell through to its fail-open timer;
  * overlay.mjs dropped every message whose `event.origin !== location.origin`, so even a
    hand-made message could never reach the parent.

This patch keeps the unforgeable checks (`event.source === iframe.contentWindow`, the
random per-mount `channel`, `data.source`) and drops the origin-equality requirements,
posting with `*` because an opaque/custom-scheme parent has no comparable origin.

Idempotent. Usage:
  python scripts/patch_startup_handshake.py <overlay.mjs> <startup-embed.js> <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

OVERLAY_MARKER = "LOCAL PATCH: origin equality cannot hold"
EMBED_MARKER = "LOCAL PATCH: accept a non-http parent"
PREVIEW_MARKER = "LOCAL PATCH: opaque parent origin"

OVERLAY_OLD = "        if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'dsh-startup' || event.data.channel !== channel) return;"
OVERLAY_NEW = """        // LOCAL PATCH: origin equality cannot hold when the window is dsh-app://app and
        // the film is served over http. event.source is the unforgeable check that matters.
        if (event.source !== frame.contentWindow || event.data?.source !== 'dsh-startup' || event.data.channel !== channel) return;"""

EMBED_OLD = """    if (parent !== window && params.get('embed') === '1' &&
        ['http:', 'https:'].includes(origin.protocol) &&
        origin.origin === params.get('parentOrigin') && /^[a-zA-Z0-9_-]{16,128}$/.test(candidate)) {
      target = origin.origin;
      channel = candidate;
    }"""
EMBED_NEW = """    // LOCAL PATCH: accept a non-http parent (the desktop window is dsh-app://app). The
    // channel is a random per-mount value, and the parent re-validates event.source.
    if (parent !== window && params.get('embed') === '1' &&
        /^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(params.get('parentOrigin') || '') &&
        /^[a-zA-Z0-9_-]{16,128}$/.test(candidate)) {
      target = params.get('parentOrigin');
      channel = candidate;
    }"""

EMBED_SEND_OLD = "    if (target) parent.postMessage({ source: 'dsh-startup', channel, type }, target);"
EMBED_SEND_NEW = "    if (target) parent.postMessage({ source: 'dsh-startup', channel, type }, '*'); // LOCAL PATCH: a custom-scheme parent has no comparable origin"

EMBED_LISTEN_OLD = "    if (!target || finished || event.source !== parent || event.origin !== target) return;"
EMBED_LISTEN_NEW = "    if (!target || finished || event.source !== parent) return; // LOCAL PATCH: see above"

PREVIEW_OLD = " else{try{parent.postMessage({source:'dsh-startup',channel:feChannel,type:reason},feParent);}catch(_){ /* A blocked parent still cannot block the return. */ }}"
PREVIEW_NEW = " else{try{parent.postMessage({source:'dsh-startup',channel:feChannel,type:reason},'*');}catch(_){ /* A blocked parent still cannot block the return. */ }} // LOCAL PATCH: opaque parent origin"


def rewrite(path: Path, marker: str, pairs) -> str:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    for old, new in pairs:
        old_n = old.replace("\n", newline)
        if old_n not in text:
            return f"SKIPPED: anchor not found -> {old.splitlines()[0][:64]}"
        text = text.replace(old_n, new.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    overlay, embed, preview = (Path(a) for a in sys.argv[1:])
    failed = 0
    for path, marker, pairs in (
        (overlay, OVERLAY_MARKER, [(OVERLAY_OLD, OVERLAY_NEW)]),
        (embed, EMBED_MARKER, [(EMBED_OLD, EMBED_NEW), (EMBED_SEND_OLD, EMBED_SEND_NEW), (EMBED_LISTEN_OLD, EMBED_LISTEN_NEW)]),
        (preview, PREVIEW_MARKER, [(PREVIEW_OLD, PREVIEW_NEW)]),
    ):
        if not path.is_file():
            print(f"{path}: NOT FOUND")
            failed = 1
            continue
        result = rewrite(path, marker, pairs)
        print(f"{path.name}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
