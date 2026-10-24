#!/usr/bin/env python3
"""Fingerprint gate v2: follow the emblem's parallax, cover every waiting checkpoint, and
stop the ready stage from waiting for a click.

  * the emblem is drawn with a pointer parallax (26/20 local units); the read ring now
    uses the same offset so it stays locked to the emblem instead of floating;
  * the gate arms on any checkpoint the sequence is waiting at (phase 0 and now phase 2),
    instead of phase 0 only;
  * `checkpoints` drops 4, so the ready stage plays straight through; the toggle and the
    announce strings say two checkpoints.

Idempotent (each file carries a `fingerprint gate v2` marker). Usage:
  python scripts/patch_startup_hover_gate2.py <startup-preview.js> <startup-sequence.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "fingerprint gate v2"

GATE_OLD = "function hoverGateActive(){return sequence.phase===0&&!sequence.playing&&!sequence.completed&&!manualPause&&!starting;}"
GATE_NEW = "function hoverGateActive(){return Boolean(sequence.waiting)&&!sequence.completed&&!manualPause&&!starting;}"

RING_OLD = " const cx=width/2,cy=height*.47,R=hoverZoneRadius();"
RING_NEW = (" /* LOCAL PATCH: fingerprint gate v2 - the emblem is drawn with a 26/20 local-unit pointer\n"
            "    parallax, so the read ring has to follow it instead of sitting at the static centre. */\n"
            " const unitCss=Math.min(width,height)/1000,trackX=reducedMotion.matches?0:(pointer.x-.5)*26*unitCss,trackY=reducedMotion.matches?0:(pointer.y-.5)*20*unitCss;\n"
            " const cx=width/2+trackX,cy=height*.47+trackY,R=hoverZoneRadius();")

ANNOUNCE_OLD = "announce(sequence.waiting?phases[sequence.phase][0]+'。点按任意位置确认。'"
ANNOUNCE_NEW = "announce(sequence.waiting?phases[sequence.phase][0]+'。点按画面或悬停中心确认。'"

TOGGLE_OLD = "sequence.interactive?'三段交互':'连续播放'"
TOGGLE_NEW = "sequence.interactive?'两段交互':'连续播放'"

TOGGLE_MSG_OLD = "announce(sequence.interactive?'已启用三个确认节点。':'已切换为连续播放。')"
TOGGLE_MSG_NEW = "announce(sequence.interactive?'已启用两个确认节点。':'已切换为连续播放。')"

CHECKPOINTS_OLD = "  const checkpoints = Object.freeze([0, 2, 4]);"
CHECKPOINTS_NEW = ("  /* LOCAL PATCH: fingerprint gate v2 - the ready stage (4) no longer waits for a click. */\n"
                   "  const checkpoints = Object.freeze([0, 2]);")


def patch(path: Path, pairs) -> str:
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
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
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    preview, sequence = Path(sys.argv[1]), Path(sys.argv[2])
    r1 = patch(preview, [
        (GATE_OLD, GATE_NEW),
        (RING_OLD, RING_NEW),
        (ANNOUNCE_OLD, ANNOUNCE_NEW),
        (TOGGLE_OLD, TOGGLE_NEW),
        (TOGGLE_MSG_OLD, TOGGLE_MSG_NEW),
    ])
    print(f"{preview.name}: {r1}")
    r2 = patch(sequence, [(CHECKPOINTS_OLD, CHECKPOINTS_NEW)])
    print(f"{sequence.name}: {r2}")
    failed = 0
    for r in (r1, r2):
        if r.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
