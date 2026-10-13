#!/usr/bin/env python3
"""Paint the capability list exactly once, on the finished catalog.

Guarding the text writes stopped the per-row roll from being re-triggered, but the list
container is still rebuilt with replaceChildren() on every inventory update, and that
re-inserts the row nodes - so any entry animation on the rows replays with them. With a
streamed inventory the list therefore still animated twice: while the items arrived, and
again when the final `complete` event landed.

This is the blunt version the maintainer of this fork asked for: while the read is still
running the panel shows only the counters and the status words (counts, 正在读取, 等待本地
结果), and the rows are painted only once, on the complete catalog. The counters keep
updating live, so the stage still reads as live work rather than a frozen panel.

Idempotent. Usage:
  python scripts/patch_startup_inventory_single.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: paint the list once, on the finished catalog"

OLD = """  textMotion.remove(list);
  const itemRows=rows(items,kind);"""
NEW = """  /* LOCAL PATCH: paint the list once, on the finished catalog. Streaming rows were
     rebuilt with replaceChildren() on every update, which re-inserted the nodes and
     replayed their entry animation - once while items arrived and again at completion. */
  if(inventory.status!=='complete')continue;
  textMotion.remove(list);
  const itemRows=rows(items,kind);"""


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
