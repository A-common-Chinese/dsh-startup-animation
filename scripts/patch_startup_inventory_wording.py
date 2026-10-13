#!/usr/bin/env python3
"""Show the capability stage as 未载入 -> 载入中 -> 已完成, and drop the preload.

Two changes, both asked for after watching the stage:

  1. the prologue preload is reverted. It was added when phase 3 felt slow, but the real
     cost was the per-item render churn (fixed separately by coalescing renders and by
     painting the list once), so the preload only removed the stage's own loading state:
     the panel opened already full instead of reading in front of the user.
  2. the per-list status words say 未载入 / 载入中 / 已完成 (was 尚未读取 / 正在读取 /
     等待本地结果 / 已返回).

Idempotent. Usage:
  python scripts/patch_startup_inventory_wording.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: 未载入 / 载入中"

PRELOAD_OLD = "void local.connect().then(connected=>{if(!connected)return;savePendingStyle();/* LOCAL PATCH: warm the local inventory so the capability stage has nothing to wait for. */if(['idle','cancelled'].includes(local.inventory.status))void local.load();});window.DSHEmbed?.ready();"
PRELOAD_NEW = "void local.connect().then(connected=>connected&&savePendingStyle());window.DSHEmbed?.ready();"

STATUS_OLD = "  setText(status,inventory.status==='complete'?'已完成':inventory.stages[kind]==='loading'?'正在读取':inventory.stages[kind]==='complete'?'已返回':inventory.status==='loading'?'等待本地结果':'尚未读取',{kind:'roll',delay:.1});"
STATUS_NEW = "  setText(status,inventory.status==='complete'?'已完成':inventory.status==='loading'||inventory.stages[kind]==='loading'?'载入中':inventory.stages[kind]==='complete'?'已返回':'未载入',{kind:'roll',delay:.1}); // LOCAL PATCH: 未载入 / 载入中"

EMPTY_OLD = "  else setText(list,inventory.status==='complete'?'此工作区没有加载项目。':inventory.status==='loading'?'等待本地 DSH 返回真实名称…':'未读取真实数据。',{kind:'mask',delay:.1});"
EMPTY_NEW = "  else setText(list,inventory.status==='complete'?'此工作区没有加载项目。':inventory.status==='loading'?'载入中…':'未载入。',{kind:'mask',delay:.1});"


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
    for old, new in ((PRELOAD_OLD, PRELOAD_NEW), (STATUS_OLD, STATUS_NEW), (EMPTY_OLD, EMPTY_NEW)):
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
