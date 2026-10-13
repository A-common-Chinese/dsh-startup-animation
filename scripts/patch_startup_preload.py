#!/usr/bin/env python3
"""Make the capability stage play smoothly instead of stuttering.

Two independent causes, both measurable on a loaded profile (36 skills + 199 plugins):

  A. render churn - startup-local.js calls onChange() once per streamed item, and every
     onChange re-renders the panel and redraws the canvas, so ~235 events mean ~235 full
     renders while the film is also animating. emit() now coalesces to at most one render
     per animation frame. Behaviour is unchanged; only the number of renders drops.

  B. late start - beginLocalLoad() only fires when phase 3 opens and is playing, so the
     stage always waits for a ~16 ms server walk plus the stream. With --preload the
     inventory is warmed right after the prologue connects, so the panel is populated the
     moment it appears. The phase-3 trigger stays as the fallback.

Usage:
  python scripts/patch_startup_preload.py <startup-local.js> <startup-preview.js> [--preload]
"""
from __future__ import annotations

import sys
from pathlib import Path

EMIT_MARKER = "LOCAL PATCH: coalesce streamed inventory renders"
PRELOAD_MARKER = "LOCAL PATCH: warm the local inventory"

EMIT_OLD = "    emit() { this.onChange(this); }"
EMIT_NEW = """    emit() {
      // LOCAL PATCH: coalesce streamed inventory renders - one per frame, not one per item.
      if (this._emitPending) return;
      const run = () => { this._emitPending = 0; this.onChange(this); };
      this._emitPending = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(run) : setTimeout(run, 16);
    }"""

PRELOAD_OLD = "void local.connect().then(connected=>connected&&savePendingStyle());window.DSHEmbed?.ready();"
PRELOAD_NEW = "void local.connect().then(connected=>{if(!connected)return;savePendingStyle();/* LOCAL PATCH: warm the local inventory so the capability stage has nothing to wait for. */if(['idle','cancelled'].includes(local.inventory.status))void local.load();});window.DSHEmbed?.ready();"


def rewrite(path: Path, marker: str, pairs) -> str:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return "already patched"
    newline = "\r\n" if "\r\n" in text else "\n"
    for old, new in pairs:
        old_n = old.replace("\n", newline)
        if old_n not in text:
            return f"SKIPPED: anchor not found -> {old.splitlines()[0][:60]}"
        text = text.replace(old_n, new.replace("\n", newline), 1)
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preload = "--preload" in sys.argv
    if len(args) != 2:
        print(__doc__)
        return 2
    client, preview = (Path(a) for a in args)
    jobs = [(client, EMIT_MARKER, [(EMIT_OLD, EMIT_NEW)])]
    if preload:
        jobs.append((preview, PRELOAD_MARKER, [(PRELOAD_OLD, PRELOAD_NEW)]))
    failed = 0
    for path, marker, pairs in jobs:
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
