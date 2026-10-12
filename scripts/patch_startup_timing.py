#!/usr/bin/env python3
"""Stop the startup overlay from closing before the inventory has been readable.

Two independent causes are addressed:

A. overlay.mjs — the parent's 15 s fail-open timer was cleared only by the iframe's
   'ready' message. Any other valid message now clears it too (proof the animation is
   alive) and the fallback is raised to 30 s, so a slow start can no longer make the
   overlay vanish mid-show.

B. startup-preview.js — barriers() released the capability stage the moment the
   inventory finished loading, after which phases 4 and 5 run their fixed durations
   and the show ends. The panel is now held until it has been readable for
   PANEL_MIN_MS, and the load-start stall escape is kept.

Idempotent. Usage:
  python scripts/patch_startup_timing.py <startup-preview.js> <overlay.mjs>
"""
from __future__ import annotations

import sys
from pathlib import Path

PREVIEW_MARKER = "LOCAL_PANEL_MIN_MS"
OVERLAY_MARKER = "LOCAL PATCH: any iframe message proves the animation is alive"

OLD_PREVIEW = """/* LOCAL PATCH: beginLocalLoad() was only called from start() (still phase 0, so its
   phase===3 guard never passed) and from the manual reconnect button. Entering phase 3
   therefore never started the inventory, loadFinished() stayed false, and barriers()
   held the stage until the user clicked. Start the load as soon as phase 3 opens, and
   stop holding after 30 s so a stalled stream can never require a click. */
let localLoadWaiting=0;
function barriers(){
  if(sequence.phase===3){beginLocalLoad();if(!localLoadWaiting&&!loadFinished())localLoadWaiting=performance.now();}else localLoadWaiting=0;
  const localLoadStalled=Boolean(localLoadWaiting)&&performance.now()-localLoadWaiting>30000;
  for(let i=0;i<6;i++){if((i===2&&accessBlocked())||(i===3&&!loadFinished()&&!localLoadStalled)||(i===sequence.phase&&voice()?.busy))sequence.hold(i);else sequence.release(i);}
}"""

NEW_PREVIEW = """/* LOCAL PATCH: two behaviours the upstream stage machine got wrong.
   1. beginLocalLoad() was only called from start() (still phase 0, so its phase===3
      guard never passed) and from the manual reconnect button, so entering phase 3
      never started the inventory at all.
   2. The stage was released the instant the inventory finished loading, after which
      phases 4 and 5 simply run their fixed durations and the show ends — the skills
      and plugins list flashed by. Keep the panel readable for PANEL_MIN_MS, and keep
      the 30 s stall escape so a dead stream still cannot require a click. */
let localLoadWaiting=0,localLoadDoneAt=0;
const LOCAL_PANEL_MIN_MS=3200,LOCAL_LOAD_STALL_MS=30000;
function barriers(){
  if(sequence.phase<3){localLoadWaiting=0;localLoadDoneAt=0;}
  if(sequence.phase===3){beginLocalLoad();if(!localLoadWaiting&&!loadFinished())localLoadWaiting=performance.now();}
  if(loadFinished()&&!localLoadDoneAt)localLoadDoneAt=performance.now();
  const localLoadStalled=Boolean(localLoadWaiting)&&performance.now()-localLoadWaiting>LOCAL_LOAD_STALL_MS;
  const localPanelReadable=Boolean(localLoadDoneAt)&&performance.now()-localLoadDoneAt>=LOCAL_PANEL_MIN_MS;
  for(let i=0;i<6;i++){if((i===2&&accessBlocked())||(i===3&&!(localPanelReadable||localLoadStalled))||(i===sequence.phase&&voice()?.busy))sequence.hold(i);else sequence.release(i);}
}"""

OLD_OVERLAY_CLEAR = "        if (event.data.type === 'ready') clearTimeout(deadline);"
NEW_OVERLAY_CLEAR = """        // LOCAL PATCH: any iframe message proves the animation is alive; the old code
        // cleared the fail-open timer only on 'ready', so a slow start killed the show.
        clearTimeout(deadline);
        if (event.data.type === 'ready') { /* cleared above */ }"""

OLD_OVERLAY_TIMEOUT = "      deadline = setTimeout(dismiss, 15000);"
NEW_OVERLAY_TIMEOUT = "      deadline = setTimeout(dismiss, 30000);"


def apply(path: Path, pairs, marker: str) -> str:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    for old, new in pairs:
        old_n, new_n = old.replace("\n", newline), new.replace("\n", newline)
        if old_n not in text:
            return f"SKIPPED: anchor not found -> {old.splitlines()[0][:60]}"
        text = text.replace(old_n, new_n, 1)
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    preview, overlay = Path(sys.argv[1]), Path(sys.argv[2])
    failed = 0
    for path, pairs, marker in (
        (preview, [(OLD_PREVIEW, NEW_PREVIEW)], PREVIEW_MARKER),
        (overlay, [(OLD_OVERLAY_CLEAR, NEW_OVERLAY_CLEAR), (OLD_OVERLAY_TIMEOUT, NEW_OVERLAY_TIMEOUT)], OVERLAY_MARKER),
    ):
        if not path.is_file():
            print(f"{path}: NOT FOUND")
            failed = 1
            continue
        result = apply(path, pairs, marker)
        print(f"{path}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
