#!/usr/bin/env python3
"""Stop phases 3 and 4 from showing the same stage copy.

phaseCopy() returned the load-result headline for `sequence.phase===3 || ===4`, so as soon
as the read completed both stages showed the same headline, the same "36 skills · 199
plugins" line and the same lists - they looked identical. The load result belongs to the
ready stage; the reading stage keeps its own copy.

Loading and error states are untouched, so a stalled or failed read is still surfaced on
either stage.

Usage:
  python scripts/patch_startup_phase_copy_split.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: phase 3 keeps its own copy"

OLD = """  if(data.status==='complete'){
   const tools=data.plugins.reduce((sum,item)=>sum+(item.tool_count||0),0);"""
NEW = """  if(data.status==='complete'){
   /* LOCAL PATCH: phase 3 keeps its own copy while the read lands; the load-result
      headline belongs to the ready phase, so the two stages no longer look identical. */
   if(sequence.phase===3)return normal;
   const tools=data.plugins.reduce((sum,item)=>sum+(item.tool_count||0),0);"""


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
