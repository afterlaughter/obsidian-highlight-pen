#!/usr/bin/env python3
"""Build a 256 entry GIF palette that reserves slots for the plugin's colours.

ffmpeg's palettegen allocates by how much screen area a colour covers across the
whole film. The twelve palette swatches on the closing card cover a few hundred
pixels for two seconds, so they lose every time, and paletteuse then maps them to
the nearest survivor. #6BB8FF came out as #B0B8C6, a grey.

So: let palettegen pick 241 colours, then append the sixteen colours the plugin
actually ships. Those land exactly, because paletteuse picks the nearest entry and
the distance is now zero.
"""
import sys
import numpy as np
from PIL import Image

BRAND = [0xFFE814, 0x7BF59B, 0x4FE8E0, 0x6BB8FF, 0xFF7AB8, 0xFFA53D,   # highlights
         0xE01B24, 0xF57C00, 0x00B8B0, 0x1A73E8, 0x00A152, 0x8E44FF,   # text colours
         0x0B0910, 0xF0EDF7, 0x15121C, 0xE4DEF2]                       # ink, paper, chrome


def rgb(h):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def main(src, dst):
    pal = [tuple(p) for p in np.asarray(Image.open(src).convert("RGB")).reshape(-1, 3).tolist()]
    uniq, seen = [], set()
    for c in pal:
        if c not in seen:
            uniq.append(c)
            seen.add(c)
    brand = [rgb(h) for h in BRAND if rgb(h) not in seen]
    full = uniq[:256 - len(brand)] + brand
    print("film %d, brand %d, total %d" % (len(uniq), len(brand), len(full)))
    full += [(0, 0, 0)] * (256 - len(full))
    Image.fromarray(np.array(full, dtype=np.uint8).reshape(16, 16, 3)).save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
