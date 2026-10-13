#!/usr/bin/env python3
"""Apply the "do not cut the closing beat" patch to a startup-preview.js copy.

The continuous-play path used to stop the score and hand control back in the same
frame the last phase's timer expired, so the closing chord and the final frame
were never seen. This patch:

  1. keeps the score alive when playback ends *by completion* (only a pause or a
     phase change stops it, as before), and
  2. defers finishEmbedded('complete') until the closing narration has finished
     and the last frame has been on screen for ~1.4 s.

Idempotent: re-running is a no-op. Usage:
  python scripts/patch_startup_completion.py <path-to-startup-preview.js> [...]
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: do not cut the closing beat"

OLD_STOP = "if(wasPlaying&&!sequence.playing){stopAudio();if(sequence.completed)announce("
NEW_STOP = "if(wasPlaying&&!sequence.playing){if(!sequence.completed)stopAudio();if(sequence.completed)announce("

OLD_HEAD = """function finishEmbedded(reason){
  if(!window.DSHEmbed?.embedded||embeddedEnded)return embeddedEnded;"""
NEW_HEAD = """let completionDwell=0,completionSettled=false;
function finishEmbedded(reason){
  if(!window.DSHEmbed?.embedded||embeddedEnded)return embeddedEnded;
  /* LOCAL PATCH: do not cut the closing beat. Continuous playback reached this
     point the same frame the last phase's timer expired, which stopped the score
     and dismissed the overlay before the closing chord and final frame were seen.
     Wait for the narration to end, then hold the last frame for ~0.3 s so the hand-back
     stays immediate. */
  if(reason==='complete'&&!completionSettled){
    if(completionDwell===0)completionDwell=performance.now();
    const voiceBusy=Boolean(window.DSHVoice&&window.DSHVoice.busy);
    if(voiceBusy||performance.now()-completionDwell<300){
      setTimeout(()=>{if(!embeddedEnded)finishEmbedded(reason);},160);
      return true;
    }
    completionSettled=true;
  }"""
# The source uses two-space indentation inside the function; accept both forms.
OLD_HEAD_FLAT = """function finishEmbedded(reason){
 if(!window.DSHEmbed?.embedded||embeddedEnded)return embeddedEnded;"""
NEW_HEAD_FLAT = NEW_HEAD.replace("\n  ", "\n ")


def patch(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        return "already patched"
    if OLD_STOP not in text:
        return "SKIPPED: score-stop anchor not found"
    # Honour the file's own line endings (the repository checks out CRLF on Windows).
    newline = "\r\n" if "\r\n" in text else "\n"
    head_old = head_new = None
    for old, new in ((OLD_HEAD, NEW_HEAD), (OLD_HEAD_FLAT, NEW_HEAD_FLAT)):
        candidate = old.replace("\n", newline)
        if candidate in text:
            head_old, head_new = candidate, new.replace("\n", newline)
            break
    if head_old is None:
        return "SKIPPED: finishEmbedded anchor not found"
    text = text.replace(OLD_STOP, NEW_STOP, 1).replace(head_old, head_new, 1)
    path.write_text(text, encoding="utf-8")
    return "patched"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    failed = 0
    for raw in sys.argv[1:]:
        path = Path(raw).expanduser()
        if not path.is_file():
            print(f"{path}: NOT FOUND")
            failed = 1
            continue
        result = patch(path)
        print(f"{path}: {result}")
        if result.startswith("SKIPPED"):
            failed = 1
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
