#!/usr/bin/env python3
"""Fingerprint gate v3: four refinements.

  1. the ready stage lingers 0.2 s longer (LOCAL_PANEL_MIN_MS 3200 -> 3400), which is the
     pause the old checkpoint click used to occupy;
  2. the 6 s idle fallback applies to the opening stage only - the identity stage must
     keep waiting for a deliberate click or a completed read;
  3. the faint always-on track ring is gone; only the progress arc itself is drawn now,
     so nothing shows until the read starts;
  4. the ready phase itself is 0.2 s longer in both duration tables, so the stage is not
     cut short now that its click is gone.

Idempotent. Usage:
  python scripts/patch_startup_hover_gate3.py <startup-preview.js> <startup-sequence.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "fingerprint gate v3"

PREVIEW_PAIRS = [
    ("const LOCAL_PANEL_MIN_MS=3200,LOCAL_LOAD_STALL_MS=30000;",
     "/* LOCAL PATCH: fingerprint gate v3 - 0.2 s longer where the ready-stage click used to be. */\n"
     "const LOCAL_PANEL_MIN_MS=3400,LOCAL_LOAD_STALL_MS=30000;"),
    (" if(performance.now()-lastInteract>=HOVER_IDLE_MS){lastInteract=performance.now();hoverFlash=1;activate();}",
     " if(sequence.phase===0&&performance.now()-lastInteract>=HOVER_IDLE_MS){lastInteract=performance.now();hoverFlash=1;activate();}"),
    (""" if(active){
  ctx.globalAlpha=.12;ctx.strokeStyle=accent;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
 }
""", ""),
]

SEQUENCE_PAIRS = [
    ("  const durations = Object.freeze([2.1, 1.8, 2.2, 3.4, 1.8, 2.5]);",
     "  /* LOCAL PATCH: fingerprint gate v3 - the ready phase gained the 0.2 s its click used to take. */\n"
     "  const durations = Object.freeze([2.1, 1.8, 2.2, 3.4, 2.0, 2.5]);"),
    ("  const lateranoDurations = Object.freeze([3.4, 2.6, 3.6, 4.2, 2.8, 3.8]);",
     "  const lateranoDurations = Object.freeze([3.4, 2.6, 3.6, 4.2, 3.0, 3.8]);"),
]


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
    if MARKER not in text:
        return "SKIPPED: marker missing from patch payload"
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    preview, sequence = Path(sys.argv[1]), Path(sys.argv[2])
    failed = 0
    for path, pairs in ((preview, PREVIEW_PAIRS), (sequence, SEQUENCE_PAIRS)):
        result = patch(path, pairs)
        print(f"{path.name}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
