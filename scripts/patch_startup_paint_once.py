#!/usr/bin/env python3
"""Paint the capability list exactly once, and only from phase 3 onwards.

The paint trace showed two passes:

  13:20:49.746  render phase=0 status=complete   -> paint skills/plugins  (the preload,
                which finishes during the prologue, so it burns the entrance animation
                while the panel is not even the subject of the scene)
  13:21:14.770  render phase=3 status=complete   -> paint again            (something reset
                the inventory to idle in between - the checkpoints call cancelLoad - so
                phase 3 does a real read and paints a second time)

This closes both: the list is painted only for a finished catalog, only from phase 3, and
only once per film. restart() clears the flag so a replay animates again.

Usage:
  python scripts/patch_startup_paint_once.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: the list paints exactly once"

OLD_STATE = "let profileDirty=false,draftRevision=0,localRevision=0,inventorySeen=null,profileSeen=null;"
NEW_STATE = "let profileDirty=false,draftRevision=0,localRevision=0,inventorySeen=null,profileSeen=null,inventoryPainted=false;"

OLD_GUARD = " const inventory=local.inventory;if(inventorySeen===inventory)return;inventorySeen=inventory;"
NEW_GUARD = """ const inventory=local.inventory;if(inventorySeen===inventory)return;inventorySeen=inventory;
 /* LOCAL PATCH: the list paints exactly once - for a finished catalog, from phase 3 on. */
 const paintList=inventory.status==='complete'&&sequence.phase>=3&&!inventoryPainted;
 if(paintList)inventoryPainted=true;"""

OLD_LOOP = "  if(inventory.status!=='complete')continue;"
NEW_LOOP = "  if(!paintList)continue;"

OLD_RESTART = "function restart(playNow=false){generation++;starting=false;stopAudio();cancelVoice();sequence.restart();"
NEW_RESTART = "function restart(playNow=false){generation++;starting=false;stopAudio();cancelVoice();inventoryPainted=false;sequence.restart();"


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
    for old, new in ((OLD_STATE, NEW_STATE), (OLD_GUARD, NEW_GUARD), (OLD_LOOP, NEW_LOOP), (OLD_RESTART, NEW_RESTART)):
        old_n = old.replace("\n", newline)
        if old_n not in text:
            print(f"{path.name}: SKIPPED: anchor not found -> {old.splitlines()[0][:56]}")
            return 1
        text = text.replace(old_n, new.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    print(f"{path.name}: patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
