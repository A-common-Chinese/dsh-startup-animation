#!/usr/bin/env python3
"""Reveal the load result only on the ready stage (phase 4), not while reading (phase 3).

Wanted behaviour: phase 3 ("展开能力档案") shows an empty list and a 载入中 status even
once the data has arrived; phase 4 ("能力档案就绪") reveals everything at once - counters,
已完成, and the list entrance animation.

Three parts are needed, because the panel is only repainted when the inventory object
changes:

  * renderLocal() gains a `reveal` state (complete AND phase >= 4) that drives the
    counters, the status words and the single list paint;
  * its early-return also watches `reveal`, so the phase-4 transition is not swallowed;
  * renderUI() (which already runs every frame) nudges renderLocal() while the reveal is
    still pending, because nothing else fires at a phase change.

Usage:
  python scripts/patch_startup_reveal_on_ready.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: reveal on the ready stage"

OLD_STATE = "let profileDirty=false,draftRevision=0,localRevision=0,inventorySeen=null,profileSeen=null,inventoryPainted=false;"
NEW_STATE = "let profileDirty=false,draftRevision=0,localRevision=0,inventorySeen=null,profileSeen=null,inventoryPainted=false,revealSeen=false;"

OLD_GUARD = """ const inventory=local.inventory;if(inventorySeen===inventory)return;inventorySeen=inventory;
 /* LOCAL PATCH: the list paints exactly once - for a finished catalog, from phase 3 on. */
 const paintList=inventory.status==='complete'&&sequence.phase>=3&&!inventoryPainted;
 if(paintList)inventoryPainted=true;"""
NEW_GUARD = """ const inventory=local.inventory,reveal=inventory.status==='complete'&&sequence.phase>=4;
 if(inventorySeen===inventory&&revealSeen===reveal)return;inventorySeen=inventory;revealSeen=reveal;
 /* LOCAL PATCH: reveal on the ready stage - the reading stage stays empty and 载入中 even
    when the data has already arrived; phase 4 shows the counters and the list once. */
 const paintList=reveal&&!inventoryPainted;
 if(paintList)inventoryPainted=true;"""

OLD_SETTLE = "  const settle=inventory.status==='complete';"
NEW_SETTLE = "  const settle=reveal;"

OLD_STATUS = "  const statusText=inventory.status==='complete'?'已完成':inventory.status==='loading'||inventory.stages[kind]==='loading'?'载入中':inventory.stages[kind]==='complete'?'已返回':'未载入';"
NEW_STATUS = "  const statusText=reveal?'已完成':sequence.phase===3?'载入中':inventory.status==='loading'||inventory.stages[kind]==='loading'?'载入中':inventory.stages[kind]==='complete'?'已返回':'未载入';"

OLD_KNOWN = "  const known=inventory.status==='complete'||items.length>0||inventory.stages[kind]==='complete';"
NEW_KNOWN = "  const known=reveal||items.length>0||inventory.stages[kind]==='complete';"

OLD_UI = "function renderUI(){"
NEW_UI = """function renderUI(){
 if(!inventoryPainted&&local.inventory.status==='complete'&&sequence.phase>=4)renderLocal(); // LOCAL PATCH: reveal on the ready stage"""

OLD_RESTART = "function restart(playNow=false){generation++;starting=false;stopAudio();cancelVoice();inventoryPainted=false;sequence.restart();"
NEW_RESTART = "function restart(playNow=false){generation++;starting=false;stopAudio();cancelVoice();inventoryPainted=false;revealSeen=false;sequence.restart();"


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
    pairs = ((OLD_STATE, NEW_STATE), (OLD_GUARD, NEW_GUARD), (OLD_SETTLE, NEW_SETTLE),
             (OLD_STATUS, NEW_STATUS), (OLD_KNOWN, NEW_KNOWN), (OLD_UI, NEW_UI), (OLD_RESTART, NEW_RESTART))
    for old, new in pairs:
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
