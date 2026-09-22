#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0

"""Objective check of the rendered output without a vision model.

Can't judge aesthetics this way, but can measure what was actually painted: the real
colours present, the real row geometry, and the real contrast of the gain/loss text
against the row backgrounds it sits on.

CAUTION — read before reporting a finding from this tool
--------------------------------------------------------
This measures pixels, so it reports *artifacts of rendering* as well as real defects.
A previous run flagged two colours (#bbfafa, #de983d) as "not in the token set, so
something is painting outside the design language". That was WRONG. Locating them by
pixel position showed ~966 pixels scattered along glyph edges across the whole page:
subpixel (LCD) antialiasing fringes on text, not a design leak. Retracted.

Rule: before reporting an unknown colour as a leak, locate its bounding box. Scattered
single pixels along glyph edges are antialiasing; a dense rectangle is a real element.
"""
from collections import Counter
from PIL import Image
import struct, glob, os, sys

TOKENS = {
    "positive light": (0x0A, 0x7D, 0x46),
    "negative light": (0xC6, 0x28, 0x28),
    "outline light": (0xDA, 0xDC, 0xE0),
    "border light": (0x75, 0x75, 0x75),
    "positive dark": (0x4C, 0xAF, 0x50),
    "negative dark": (0xEF, 0x53, 0x50),
    "border dark": (0x75, 0x75, 0x75),
}


def rel_lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = rel_lum(a), rel_lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def analyse(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    print(f"\n=== {os.path.basename(path)}  {w}x{h} ===")

    counts = Counter()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            counts[px[x, y]] += 1
    total = sum(counts.values())
    print("top rendered colours:")
    for c, n in counts.most_common(8):
        print(f"   #{c[0]:02x}{c[1]:02x}{c[2]:02x}  {100*n/total:5.1f}%")

    # horizontal separator lines -> row pitch
    sep = (0xDA, 0xDC, 0xE0) if "light" in path else (0x3A, 0x3A, 0x3A)
    lines = []
    for y in range(h):
        hits = sum(1 for x in range(0, w, 4) if px[x, y] == sep)
        if hits > (w / 4) * 0.6:
            lines.append(y)
    runs, cur = [], [lines[0]] if lines else []
    for y in lines[1:]:
        if y - cur[-1] <= 2:
            cur.append(y)
        else:
            runs.append(sum(cur) // len(cur)); cur = [y]
    if cur:
        runs.append(sum(cur) // len(cur))
    pitches = [b - a for a, b in zip(runs, runs[1:]) if 8 < b - a < 200]
    if pitches:
        print(f"row separators detected: {len(runs)}  row pitch (median): {sorted(pitches)[len(pitches)//2]}px")

    # real painted contrast of the gain/loss colours against white and the zebra tint
    for name, rgb in TOKENS.items():
        if name.split()[1] not in path:
            continue
        n = sum(c for col, c in counts.items() if col == rgb)
        if n == 0:
            print(f"token {name:16} not found in the rendered pixels")
            continue
        bg = (0xFF, 0xFF, 0xFF) if "light" in path else (0x12, 0x12, 0x12)
        bg2 = (0xF6, 0xF6, 0xF6) if "light" in path else (0x18, 0x18, 0x18)
        print(f"token {name:16} painted {n:>5} sampled px | contrast {contrast(rgb, bg):.2f}:1 on bg, {contrast(rgb, bg2):.2f}:1 on zebra  (AA needs 4.5)")


base = sys.argv[1] if len(sys.argv) > 1 else '.'
for f in ["chromium-desktop-light.png", "chromium-desktop-dark.png", "chromium-mobile-light.png"]:
    p = os.path.join(base, f)
    if os.path.exists(p):
        analyse(p)
    else:
        print('missing:', p)
