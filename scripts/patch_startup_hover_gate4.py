#!/usr/bin/env python3
"""Fingerprint gate v4: put the extra 0.2 s only at the end of the ready phase.

v3 raised two things: the archive panel's readable minimum (3200 -> 3400) and the ready
phase duration (1.8 -> 2.0). The request was the latter only - the moment phase 4 ends -
so the panel minimum goes back to 3200 and the duration keeps its 0.2 s.

Idempotent. Usage:
  python scripts/patch_startup_hover_gate4.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "fingerprint gate v4"

OLD = "/* LOCAL PATCH: fingerprint gate v3 - 0.2 s longer where the ready-stage click used to be. */\nconst LOCAL_PANEL_MIN_MS=3400,LOCAL_LOAD_STALL_MS=30000;"
NEW = "/* LOCAL PATCH: fingerprint gate v4 - the extra 0.2 s lives at the ready phase's end, not here. */\nconst LOCAL_PANEL_MIN_MS=3200,LOCAL_LOAD_STALL_MS=30000;"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"{path.name}: already patched")
        return 0
    newline = "\r\n" if "\r\n" in text else "\n"
    old_n = OLD.replace("\n", newline)
    if old_n not in text:
        print(f"{path.name}: SKIPPED: anchor not found")
        return 1
    path.write_text(text.replace(old_n, NEW.replace("\n", newline), 1), encoding="utf-8")
    print(f"{path.name}: patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
