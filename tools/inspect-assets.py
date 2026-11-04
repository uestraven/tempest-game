#!/usr/bin/env python3
"""Dependency-free PNG inspector for validating the production art package.

Pillow is not available in this environment, so this decodes PNG directly with
zlib from the standard library. Used to verify dimensions, transparency, frame
layout and per-frame bounding boxes instead of trusting filenames or metadata.

Usage:
  python3 -I tools/inspect-assets.py info   <file.png> [...]
  python3 -I tools/inspect-assets.py sheet  <file.png> <frame_w> <frame_h>
  python3 -I tools/inspect-assets.py tiles  <file.png> <tile_w> <tile_h>
"""
import struct
import sys
import zlib


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def decode_png(path):
    """Return (width, height, pixels) where pixels is a list of rows of RGBA tuples."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path}: not a PNG")

    pos = 8
    idat = bytearray()
    palette = None
    trns = None
    width = height = depth = color = interlace = None

    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif ctype == b"PLTE":
            palette = [tuple(body[i : i + 3]) for i in range(0, len(body), 3)]
        elif ctype == b"tRNS":
            trns = body
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break

    if interlace:
        raise ValueError(f"{path}: interlaced PNG not supported")
    if depth != 8:
        raise ValueError(f"{path}: bit depth {depth} not supported")

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    stride = width * channels
    raw = zlib.decompress(bytes(idat))

    rows = []
    prev = bytearray(stride)
    offset = 0
    for _ in range(height):
        ftype = raw[offset]
        offset += 1
        line = bytearray(raw[offset : offset + stride])
        offset += stride
        if ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                upleft = prev[i - channels] if i >= channels else 0
                line[i] = (line[i] + _paeth(left, prev[i], upleft)) & 0xFF
        elif ftype != 0:
            raise ValueError(f"{path}: bad filter {ftype}")
        prev = line

        row = []
        for x in range(width):
            px = line[x * channels : (x + 1) * channels]
            if color == 6:
                row.append((px[0], px[1], px[2], px[3]))
            elif color == 2:
                row.append((px[0], px[1], px[2], 255))
            elif color == 0:
                row.append((px[0], px[0], px[0], 255))
            elif color == 4:
                row.append((px[0], px[0], px[0], px[1]))
            else:
                idx = px[0]
                r, g, b = palette[idx]
                a = trns[idx] if trns and idx < len(trns) else 255
                row.append((r, g, b, a))
        rows.append(row)

    return width, height, rows


def bbox(rows, x0, y0, w, h, alpha_threshold=8):
    """Bounding box of non-transparent pixels inside a sub-rectangle, frame-local."""
    min_x, min_y, max_x, max_y, count = w, h, -1, -1, 0
    for y in range(h):
        for x in range(w):
            if rows[y0 + y][x0 + x][3] > alpha_threshold:
                count += 1
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
    if count == 0:
        return None
    return {
        "x": min_x,
        "y": min_y,
        "w": max_x - min_x + 1,
        "h": max_y - min_y + 1,
        "opaque_px": count,
    }


def info(paths):
    for path in paths:
        w, h, rows = decode_png(path)
        alphas = set()
        colors = set()
        for row in rows:
            for px in row:
                alphas.add(px[3])
                if px[3] > 8:
                    colors.add(px[:3])
        transparent = sum(1 for row in rows for px in row if px[3] <= 8)
        partial = sum(1 for a in alphas if 8 < a < 255)
        print(
            f"{path}\n"
            f"  size={w}x{h} colors={len(colors)} "
            f"fully_transparent_px={transparent} ({100 * transparent / (w * h):.1f}%) "
            f"partial_alpha_levels={partial} has_alpha={'yes' if min(alphas) < 255 else 'NO'}"
        )


def sheet(path, fw, fh):
    w, h, rows = decode_png(path)
    cols, nrows = w // fw, h // fh
    print(f"{path}: {w}x{h} -> {cols} cols x {nrows} rows of {fw}x{fh}")
    if w % fw or h % fh:
        print(f"  WARNING: not an exact multiple of frame size ({w % fw}, {h % fh} left over)")
    for r in range(nrows):
        parts = []
        for c in range(cols):
            b = bbox(rows, c * fw, r * fh, fw, fh)
            if b is None:
                parts.append(f"[{c}] EMPTY")
            else:
                parts.append(
                    f"[{c}] x{b['x']:>2} y{b['y']:>2} {b['w']:>2}x{b['h']:>2} "
                    f"px{b['opaque_px']:>4} bottom{b['y'] + b['h']:>3}"
                )
        print(f"  row {r}: " + "  ".join(parts))


def tiles(path, tw, th):
    w, h, rows = decode_png(path)
    cols, nrows = w // tw, h // th
    print(f"{path}: {w}x{h} -> {cols}x{nrows} tiles of {tw}x{th}")
    for r in range(nrows):
        parts = []
        for c in range(cols):
            b = bbox(rows, c * tw, r * th, tw, th)
            idx = r * cols + c
            if b is None:
                parts.append(f"{idx:>2}:EMPTY")
            else:
                full = b["opaque_px"] == tw * th
                parts.append(f"{idx:>2}:{'FULL' if full else f'{b[chr(119)]}x{b[chr(104)]}'}")
        print("  " + " ".join(parts))


def prop(paths):
    """Whole-image content bbox: where a prop's art actually sits in its canvas."""
    for path in paths:
        w, h, rows = decode_png(path)
        b = bbox(rows, 0, 0, w, h)
        name = path.split("/")[-1]
        if b is None:
            print(f"{name:<28} {w}x{h}  EMPTY")
            continue
        print(
            f"{name:<28} canvas {w:>2}x{h:<2} content x{b['x']:>2} y{b['y']:>2} "
            f"{b['w']:>2}x{b['h']:<2} bottom{b['y'] + b['h']:>3} "
            f"pad(l{b['x']} r{w - b['x'] - b['w']} t{b['y']} b{h - b['y'] - b['h']}) "
            f"fill{100 * b['opaque_px'] / (w * h):>5.1f}%"
        )


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "prop":
        prop(sys.argv[2:])
    elif mode == "info":
        info(sys.argv[2:])
    elif mode == "sheet":
        sheet(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    elif mode == "tiles":
        tiles(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    else:
        raise SystemExit(__doc__)
