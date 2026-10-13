#!/usr/bin/env python3
"""Space needs two presses to abort the show, so a stray keypress cannot trigger it.

Design
  single Space   the original meaning, applied after EC_DOUBLE_MS so a second press can
                 still cancel it: start the show / advance the phase
  double Space   emergency abort, exactly as before
  Enter / click  untouched and instant, so impatience never waits for the timer
  during panel   one Space still skips the panel at once (deliberately not advertised)

Idempotent. Usage:
  python scripts/patch_startup_double_space.py <startup-preview.js> <bridge.mjs>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: one Space keeps its original meaning"
LEGEND_MARKER = "Space ×2 · 紧急中止"

OLD_CONSTS = "const EC_PANEL_MS=2400,EC_BAR_MS=2050,EC_RED_MS=Math.round(EC_BAR_MS/3),EC_VOICE_DELAY_MS=140;"
NEW_CONSTS = """const EC_PANEL_MS=2400,EC_BAR_MS=2050,EC_RED_MS=Math.round(EC_BAR_MS/3),EC_VOICE_DELAY_MS=140;
const EC_DOUBLE_MS=320;
let ecSpaceTimer=0;"""

OLD_KEY = " if(e.key===' '&&!e.target.closest('button')){e.preventDefault();emergency();return;} // LOCAL PATCH: Space = emergency abort"
NEW_KEY = """ if(e.key===' '&&!e.target.closest('button')){
  e.preventDefault();
  if(emergencyActive){finishEmbedded('skip');return;} // during the panel: skip it (not advertised)
  /* LOCAL PATCH: one Space keeps its original meaning; two within EC_DOUBLE_MS abort the
     show, so the emergency panel can no longer be triggered by a stray keypress. */
  if(ecSpaceTimer){clearTimeout(ecSpaceTimer);ecSpaceTimer=0;emergency();return;}
  ecSpaceTimer=setTimeout(()=>{ecSpaceTimer=0;activate();},EC_DOUBLE_MS);
  return;
 }"""

OLD_LEGEND = "Space · 紧急中止（红黑确认后直接进入）"
NEW_LEGEND = "Space ×2 · 紧急中止（连按两次，防误触）"


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
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    preview, bridge = Path(sys.argv[1]), Path(sys.argv[2])
    failed = 0
    for path, marker, pairs in (
        (preview, MARKER, [(OLD_CONSTS, NEW_CONSTS), (OLD_KEY, NEW_KEY)]),
        (bridge, LEGEND_MARKER, [(OLD_LEGEND, NEW_LEGEND)]),
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
