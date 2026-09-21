#!/usr/bin/env python3
"""Tiny PNG writer for toolbar icons. No extra deps."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, rgba: bytes) -> None:
    raw = b"".join(b"\x00" + rgba[y * size * 4 : (y + 1) * size * 4] for y in range(size))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def icon(size: int) -> bytes:
    px = bytearray(size * size * 4)
    bg = (15, 17, 20)
    gold = (232, 180, 76)
    ink = (17, 17, 17)

    def put(x: int, y: int, color: tuple[int, int, int], a: int = 255) -> None:
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            px[i : i + 4] = bytes((*color, a))

    radius = size * 0.22
    cx = cy = size / 2
    inner = size * 0.34

    for y in range(size):
        for x in range(size):
            dx = min(x + 0.5, size - x - 0.5)
            dy = min(y + 0.5, size - y - 0.5)
            if dx <= 0 or dy <= 0:
                continue
            # rounded square
            if dx < radius and dy < radius:
                if (dx - radius) ** 2 + (dy - radius) ** 2 > radius * radius:
                    continue
            put(x, y, bg)
            dist = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if dist <= inner:
                put(x, y, gold)

    # simple "S" bar cuts
    bar = max(1, size // 12)
    for y in range(int(size * 0.38), int(size * 0.38) + bar):
        for x in range(int(size * 0.32), int(size * 0.68)):
            put(x, y, ink)
    for y in range(int(size * 0.58), int(size * 0.58) + bar):
        for x in range(int(size * 0.32), int(size * 0.68)):
            put(x, y, ink)
    return bytes(px)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(OUT / f"icon-{size}.png", size, icon(size))
        print("wrote", OUT / f"icon-{size}.png")


if __name__ == "__main__":
    main()
