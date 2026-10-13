#!/usr/bin/env python3
"""Add an on-demand replay so the film can be previewed without restarting DSH.

The film lives in an iframe whose assets are fetched with no-store on every mount, so a
fresh mount always shows the current files. The overlay only needed a way to be told to
mount again:

  * Ctrl+Alt+P (or window.__dshStartupPreview()) forgets the per-instance "already seen"
    flag and mounts the film again;
  * an in-flight film is never double-mounted;
  * the DOMContentLoaded kickoff is wrapped, because addEventListener would otherwise pass
    the Event object as `force` and make the first mount ignore `enabled`/`seen`.

Idempotent. Usage:
  python scripts/patch_startup_preview_hotkey.py <overlay.mjs>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: on-demand replay"

OLD_HEAD = "  const start = async () => {"
NEW_HEAD = """  let mounted = false;
  const start = async (force = false) => {
    if (mounted) return;"""

OLD_GUARD = "      if (!enabled || seen) return;"
NEW_GUARD = "      if (!force && (!enabled || seen)) return;"

OLD_APPEND = "      document.body.append(frame); frame.focus();"
NEW_APPEND = """      mounted = true;
      document.body.append(frame); frame.focus();"""

OLD_FINISH = """          dbg('finish', 'frame removed');
          frame.remove();"""
NEW_FINISH = """          dbg('finish', 'frame removed');
          mounted = false;
          frame.remove();"""

OLD_KICK = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();"
NEW_KICK = """  /* LOCAL PATCH: on-demand replay. Ctrl+Alt+P (or window.__dshStartupPreview()) mounts the
     film again with the current files, so iterating on the animation no longer needs a DSH
     restart - although the injected overlay.js itself still needs one page load to update. */
  const replay = () => { void start(true); };
  globalThis.__dshStartupPreview = replay;
  globalThis.addEventListener('keydown', event => {
    if (event.ctrlKey && event.altKey && event.code === 'KeyP') { event.preventDefault(); replay(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(), { once: true }); else start();"""


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
    for old, new in ((OLD_HEAD, NEW_HEAD), (OLD_GUARD, NEW_GUARD), (OLD_APPEND, NEW_APPEND),
                     (OLD_FINISH, NEW_FINISH), (OLD_KICK, NEW_KICK)):
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
