#!/usr/bin/env python3
"""Stop the capability list from replaying its staggered roll animation.

renderLocal() re-ran setText() for every cached row on each inventory update, and setText
re-triggers the text animation. With a streamed inventory that means the whole list - 235
rows on the test profile, each with delay = index * 32 ms - animates once when the items
arrive and again when the final `complete` event lands, which reads as the same animation
playing twice.

The rows themselves were already cached; only the text write was unconditional. Now the
text is written only when it actually changed, so new rows still animate in while
unchanged ones stay put.

Idempotent. Usage:
  python scripts/patch_startup_inventory_anim.py <startup-preview.js>
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "LOCAL PATCH: animate only text that actually changed"

OLD = """  const delay=Math.min(.3,index*.032);
  setText(name,sign+'  '+item.name,{kind:'roll',delay});setText(source,detail,{kind:'mask',delay:delay+.09});return row;"""
NEW = """  const delay=Math.min(.3,index*.032);
  /* LOCAL PATCH: animate only text that actually changed. Re-running setText on every
     inventory update replayed the whole staggered roll for every row - once when the items
     streamed in and again when the final complete event landed. */
  const nameText=sign+'  '+item.name;
  if(nodes.nameText!==nameText){nodes.nameText=nameText;setText(name,nameText,{kind:'roll',delay});}
  if(nodes.sourceText!==detail){nodes.sourceText=detail;setText(source,detail,{kind:'mask',delay:delay+.09});}
  return row;"""


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
