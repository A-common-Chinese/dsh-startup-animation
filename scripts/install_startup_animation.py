#!/usr/bin/env python3
"""Install the DSH startup animation into a DSH profile (desktop by default).

This is the desktop-first installer. It needs no npm, no Node toolchain and no
global install: it copies the addon next to your DSH home and mounts it in the
profile's patch layer by file URL, which is how the plugin can reach the DSH
desktop app (the official `--startup` addon only covers the CLI/Web profile).

  python scripts/install_startup_animation.py                    # desktop profile
  python scripts/install_startup_animation.py --profile web       # any profile name
  python scripts/install_startup_animation.py --dry-run           # show, change nothing
  python scripts/install_startup_animation.py --uninstall         # remove the mount
  python scripts/install_startup_animation.py --home /custom/.dsh # non-default DSH home

After installing, restart DSH completely: client plugins are scanned at boot.

The mount lives between two marker comments, so re-running the installer updates
the block in place instead of adding a second one, and --uninstall removes exactly
that block.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADDON = ROOT / "integrations" / "native-startup"
DOCS = ROOT / "docs"

BEGIN = "# >>> dsh-startup-animation (managed block — keep the markers) >>>"
END = "# <<< dsh-startup-animation <<<"
ENTRY_ID = "dsh-original-startup"


def resolve_home(explicit: Path | None) -> Path:
    if explicit:
        return explicit.expanduser().resolve()
    configured = os.environ.get("DSH_HOME", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / ".dsh").resolve()


def stage_package(destination: Path) -> int:
    """Mirror scripts/install_native_startup.py's stage_package() into `destination`."""
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    count = 0
    for path in sorted(ADDON.iterdir()):
        if path.is_file() and path.name != "test.mjs":
            shutil.copy2(path, destination / path.name)
            count += 1
    assets = destination / "assets"
    inner = assets / "assets"
    inner.mkdir(parents=True)
    for path in sorted(DOCS.glob("startup-*")):
        if path.suffix in (".html", ".js", ".css"):
            shutil.copy2(path, assets / path.name)
            count += 1
    for name in ("voice", "fonts", "licenses"):
        shutil.copytree(DOCS / "assets" / name, inner / name)
        count += sum(1 for _ in (inner / name).rglob("*") if _.is_file())
    for emblem in ("dsh-emblem.svg", "dsh-laterano-emblem.svg"):
        shutil.copy2(DOCS / "assets" / emblem, inner / emblem)
        count += 1
    return count


def mount_block(url: str) -> str:
    return (
        f"{BEGIN}\n"
        f"# 由 scripts/install_startup_animation.py 写入；`--uninstall` 可整块移除。\n"
        f"# 该包没有 main 字段，上游 dsh-native 也用「文件 URL」挂载，故此处同样处理。\n"
        f"# override: true = 每次启动都播（等价于 dsh-native 的 --startup）。\n"
        f"- insert:\n"
        f"    - id: {ENTRY_ID}\n"
        f"      name: '{url}'\n"
        f"      config:\n"
        f"        override: true\n"
        f"{END}\n"
    )


def upsert_mount(patch: Path, url: str, backup: bool = True) -> str:
    """Return 'created' | 'appended' | 'updated' | 'unchanged' | 'conflict'."""
    block = mount_block(url)
    text = patch.read_text(encoding="utf-8") if patch.exists() else ""

    if BEGIN in text and END in text:
        head, rest = text.split(BEGIN, 1)
        _, tail = rest.split(END, 1)
        updated = head + block + tail.lstrip("\n")
        if updated == text:
            return "unchanged"
        if backup:
            stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
            shutil.copy2(patch, patch.with_name(patch.name + f".bak-{stamp}"))
        patch.write_text(updated, encoding="utf-8")
        return "updated"

    # Someone mounted this entry by hand (a plain `insert` row without markers):
    # appending now would declare the same id twice, so refuse instead.
    if f"id: {ENTRY_ID}" in text:
        return "conflict"

    if backup and patch.exists():
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(patch, patch.with_name(patch.name + f".bak-{stamp}"))
    separator = "" if not text or text.endswith("\n") else "\n"
    patch.write_text(text + separator + ("\n" if text else "") + block, encoding="utf-8")
    return "appended" if text else "created"


def remove_mount(patch: Path, backup: bool = True) -> bool:
    if not patch.exists():
        return False
    text = patch.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        return False
    head, rest = text.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    cleaned = (head.rstrip("\n") + "\n" + tail.lstrip("\n")).rstrip("\n") + "\n"
    if backup:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(patch, patch.with_name(patch.name + f".bak-{stamp}"))
    patch.write_text(cleaned, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", default="desktop", help="DSH profile name (default: desktop)")
    parser.add_argument("--home", type=Path, help="DSH home directory (default: $DSH_HOME or ~/.dsh)")
    parser.add_argument("--uninstall", action="store_true", help="remove the managed mount block")
    parser.add_argument("--dry-run", action="store_true", help="report without changing anything")
    parser.add_argument("--no-backup", action="store_true", help="do not write a .bak-<timestamp> copy")
    args = parser.parse_args()

    home = resolve_home(args.home)
    profile_dir = home / "profiles" / args.profile
    patch = profile_dir / "cordis.patch.yml"
    stage = home / "startup-animation" / "plugin"
    url = (stage / "plugin.mjs").as_uri()

    print(f"DSH home    : {home}")
    print(f"profile     : {args.profile}  ({profile_dir})")
    print(f"patch file  : {patch}")
    print(f"staged addon: {stage}")

    if not (ADDON / "plugin.mjs").exists():
        print(f"! run this from a clone of the repository: {ADDON / 'plugin.mjs'} not found", file=sys.stderr)
        return 2

    if args.uninstall:
        if args.dry_run:
            print("would remove the managed mount block (dry run)")
            return 0
        removed = remove_mount(patch, backup=not args.no_backup)
        print("mount removed" if removed else "no managed mount block found")
        if stage.exists():
            shutil.rmtree(stage)
            print(f"staged addon removed: {stage}")
        print("restart DSH to apply.")
        return 0

    if not profile_dir.is_dir():
        print(f"! profile directory does not exist: {profile_dir}", file=sys.stderr)
        print("  pass --profile <name>; existing profiles:", file=sys.stderr)
        profiles = sorted(p.name for p in (home / "profiles").glob("*") if p.is_dir()) if (home / "profiles").is_dir() else []
        print("   ", ", ".join(profiles) or "(none found)", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"would stage the addon into {stage} and mount:\n{mount_block(url)}")
        return 0

    # Refuse before staging anything, so a rejected run leaves no half-install.
    if patch.exists():
        existing = patch.read_text(encoding="utf-8")
        if BEGIN not in existing and f"id: {ENTRY_ID}" in existing:
            print(
                f"! {patch} already declares `id: {ENTRY_ID}` outside this script's managed block.\n"
                f"  Remove that manual mount first (or keep using it), then re-run this installer.",
                file=sys.stderr,
            )
            return 4

    files = stage_package(stage)
    print(f"staged      : {files} files ({sum(1 for _ in stage.rglob('*') if _.is_file())} on disk)")

    for required in (stage / "plugin.mjs", stage / "assets" / "startup-preview.html", stage / "assets" / "assets" / "voice"):
        if not required.exists():
            print(f"! staging incomplete, missing {required}", file=sys.stderr)
            return 3

    action = upsert_mount(patch, url, backup=not args.no_backup)
    if action == "conflict":
        print(
            f"! {patch} already declares `id: {ENTRY_ID}` outside this script's managed block.\n"
            f"  Remove that manual mount first (or keep using it), then re-run this installer.",
            file=sys.stderr,
        )
        return 4
    print(f"mount       : {action}")
    print(f"entry       : {ENTRY_ID} -> {url}")
    print()
    print("Done. Restart DSH completely (not a page refresh) to see the animation.")
    print("Inside the animation: click to start, Enter/Space to advance the three")
    print("checkpoints, C for settings (visual style, continuous play, identity), Esc to skip.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
