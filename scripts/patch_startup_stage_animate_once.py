#!/usr/bin/env python3
"""Animate the capability stage once - when the read settles.

The paint trace showed the list itself is painted exactly once, but the same stage still
ran several text animations while it was reading: every streamed update rolled the
counters and the status words (载入中 -> 载入中 -> 已完成, … -> 36), and then the list rolled
in as well. Seen together that reads as the animation playing twice.

While the read is still running the counters and status words now update instantly (any
in-flight text motion is cancelled); the rolls and the list entrance happen once, on the
complete catalog.

Idempotent. Usage:
  python scripts/patch_startup_stage_animate_once.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: animate the stage once, when the read settles"

OLD = """  setText(count,known?String(loaded).padStart(2,'0'):inventory.status==='loading'?'…':'—',{kind:'roll'});
  setText(status,inventory.status==='complete'?'已完成':inventory.status==='loading'||inventory.stages[kind]==='loading'?'载入中':inventory.stages[kind]==='complete'?'已返回':'未载入',{kind:'roll',delay:.1}); // LOCAL PATCH: 未载入 / 载入中"""
NEW = """  const settle=inventory.status==='complete';
  const countText=known?String(loaded).padStart(2,'0'):inventory.status==='loading'?'…':'—';
  const statusText=inventory.status==='complete'?'已完成':inventory.status==='loading'||inventory.stages[kind]==='loading'?'载入中':inventory.stages[kind]==='complete'?'已返回':'未载入';
  /* LOCAL PATCH: animate the stage once, when the read settles. Rolling the counters and
     status words on every streamed update made the stage look like it animated twice. */
  if(settle){setText(count,countText,{kind:'roll'});setText(status,statusText,{kind:'roll',delay:.1});}
  else{textMotion.remove(count);textMotion.remove(status);count.textContent=countText;status.textContent=statusText;}"""


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
