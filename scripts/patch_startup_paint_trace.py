#!/usr/bin/env python3
"""Trace when the capability list is re-rendered, with the phase it happened in.

Temporary instrumentation for the fork: every inventory change logs `render` (phase,
status, counts) and every actual list paint logs `paint` (kind, phase, rows), both through
the addon's own /debug sink, so the log shows exactly what happens between phases.

Usage:
  python scripts/patch_startup_paint_trace.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL DEBUG: trace capability-list paints"

OLD_GUARD = " const inventory=local.inventory;if(inventorySeen===inventory)return;inventorySeen=inventory;"
NEW_GUARD = """ const inventory=local.inventory;if(inventorySeen===inventory)return;inventorySeen=inventory;
 try{fetch('/__dsh_startup/debug?from=preview&event=render&detail='+encodeURIComponent('phase='+sequence.phase+' status='+inventory.status+' stages='+inventory.stages.skills+'/'+inventory.stages.plugins+' sk='+inventory.skills.length+' pl='+inventory.plugins.length),{cache:'no-store'});}catch(_){} // LOCAL DEBUG: trace capability-list paints"""

OLD_PAINT = """  if(inventory.status!=='complete')continue;
  textMotion.remove(list);"""
NEW_PAINT = """  if(inventory.status!=='complete')continue;
  try{fetch('/__dsh_startup/debug?from=preview&event=paint&detail='+encodeURIComponent(kind+' phase='+sequence.phase+' rows='+items.length),{cache:'no-store'});}catch(_){} // LOCAL DEBUG: trace capability-list paints
  textMotion.remove(list);"""


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
    for old, new in ((OLD_GUARD, NEW_GUARD), (OLD_PAINT, NEW_PAINT)):
        old_n = old.replace("\n", newline)
        if old_n not in text:
            print(f"{path.name}: SKIPPED: anchor not found -> {old.splitlines()[0][:50]}")
            return 1
        text = text.replace(old_n, new.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    print(f"{path.name}: patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
