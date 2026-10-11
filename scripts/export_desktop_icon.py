#!/usr/bin/env python3
"""Rasterize original contours after running export_startup_emblem.cjs.

Requires Pillow. Both native icon variants share authored browser polygons.
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
destination = ROOT / "crates/dsh-desktop/assets"
destination.mkdir(parents=True, exist_ok=True)
for stem, rgba, ico, background, foreground in [
    ("dsh-emblem", "icon.rgba", "dsh-desktop.ico", (10,16,19,255), (234,238,234,255)),
    ("dsh-laterano-emblem", "icon-laterano.rgba", "dsh-laterano-desktop.ico", (243,246,251,255), (20,45,96,255)),
]:
    parts = json.loads((ROOT / "crates/dsh-tui/assets" / (stem + ".json")).read_text(encoding="utf-8"))["parts"]
    size = 1024
    image = Image.new("RGBA", (size, size), background)
    mask = Image.new("1", (size, size))
    for contours in parts:
        compound = Image.new("1", (size, size))
        for points in contours:
            ring = Image.new("1", (size, size))
            xy = [((x / 236 + .5) * size, (y / 236 + .5) * size) for x, y in points]
            ImageDraw.Draw(ring).polygon(xy, fill=1)
            compound = ImageChops.logical_xor(compound, ring)
        mask = ImageChops.logical_or(mask, compound)
    image.paste(foreground, mask=mask)
    icon = image.resize((256, 256), Image.Resampling.LANCZOS)
    (destination / rgba).write_bytes(icon.resize((128, 128), Image.Resampling.LANCZOS).tobytes())
    icon.save(ROOT / "docs/assets" / ico, sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Exported native DSH window and shortcut icons for both styles.")
