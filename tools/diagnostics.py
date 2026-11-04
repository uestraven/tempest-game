#!/usr/bin/env python3
"""Diagnostic image generator. Produces TEST IMAGES ONLY.

Nothing this script writes is a production game asset. Output goes to
docs/diagnostics/ and is never loaded by the game. It exists so sprite
transparency and level composition can be inspected without a browser, since
`npm install` is blocked in this environment.

Pillow is unavailable, so PNG encoding is done directly with zlib.

Usage:
  python3 -I tools/diagnostics.py contact   # character sheets over 4 backgrounds
  python3 -I tools/diagnostics.py alphamap  # per-pixel alpha / enclosed holes
  python3 -I tools/diagnostics.py tileset   # enlarged tilesets with a tile grid
  python3 -I tools/diagnostics.py map       # composed Valcendre level render
  python3 -I tools/diagnostics.py all
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module

_inspect = import_module("inspect-assets")
decode_png = _inspect.decode_png

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
OUT = os.path.join(ROOT, "docs", "diagnostics")

CHARACTERS = [
    "tempest",
    "lookout_guard",
    "enforcer",
    "zealot_cultist",
    "ascendant_cultist",
    "barnabe",
    "suzanne",
]
STAGES = ["valcendre", "estate", "abbey", "ascension"]


# ------------------------------------------------------------------- PNG write
def write_png(path, width, height, pixels):
    """pixels: list of rows of (r, g, b, a) tuples."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b"IEND", b""))


def blank(width, height, color=(0, 0, 0, 0)):
    return [[color for _ in range(width)] for _ in range(height)]


def blit(dst, src, dx, dy, sx=0, sy=0, w=None, h=None, scale=1):
    """Alpha-composites src onto dst at (dx, dy), nearest-neighbour scaled."""
    sh = len(src)
    sw = len(src[0]) if sh else 0
    w = sw if w is None else w
    h = sh if h is None else h
    for y in range(h):
        for x in range(w):
            px = src[sy + y][sx + x]
            if px[3] == 0:
                continue
            for oy in range(scale):
                for ox in range(scale):
                    ty = dy + y * scale + oy
                    tx = dx + x * scale + ox
                    if 0 <= ty < len(dst) and 0 <= tx < len(dst[0]):
                        if px[3] == 255:
                            dst[ty][tx] = px
                        else:
                            bg = dst[ty][tx]
                            a = px[3] / 255
                            dst[ty][tx] = (
                                round(px[0] * a + bg[0] * (1 - a)),
                                round(px[1] * a + bg[1] * (1 - a)),
                                round(px[2] * a + bg[2] * (1 - a)),
                                255,
                            )


def fill(dst, x, y, w, h, color):
    for ty in range(y, min(y + h, len(dst))):
        for tx in range(x, min(x + w, len(dst[0]))):
            dst[ty][tx] = color


# ---------------------------------------------------------- character contacts
def cobble_tile():
    """Real cobble tile from the Valcendre tileset, as a diagnostic backdrop."""
    _, _, rows = decode_png(os.path.join(PUB, "assets/environments/valcendre_tiles_16x16.png"))
    tile_index = 38  # 'cobble'
    tx, ty = (tile_index % 8) * 16, (tile_index // 8) * 16
    return [[rows[ty + y][tx + x] for x in range(16)] for y in range(16)]


BACKGROUNDS = [
    ("white", (255, 255, 255, 255)),
    ("black", (0, 0, 0, 255)),
    ("magenta", (255, 0, 255, 255)),
    ("cobble", None),
]


def contact():
    """One sheet per character: the 4x6 frame grid over each of 4 backgrounds."""
    cobble = cobble_tile()
    scale = 3
    fw, fh = 24, 32
    pad = 4
    block_w = 4 * fw * scale + pad
    block_h = 6 * fh * scale

    for name in CHARACTERS:
        _, _, src = decode_png(os.path.join(PUB, f"assets/characters/{name}_24x32_4x6.png"))
        width = len(BACKGROUNDS) * block_w + pad
        height = block_h + pad * 2
        img = blank(width, height, (24, 24, 28, 255))

        for bi, (_, color) in enumerate(BACKGROUNDS):
            ox = pad + bi * block_w
            if color is not None:
                fill(img, ox, pad, 4 * fw * scale, block_h, color)
            else:
                for ty in range(0, block_h, 16 * scale):
                    for tx in range(0, 4 * fw * scale, 16 * scale):
                        blit(img, cobble, ox + tx, pad + ty, scale=scale)
            for r in range(6):
                for c in range(4):
                    blit(
                        img,
                        src,
                        ox + c * fw * scale,
                        pad + r * fh * scale,
                        sx=c * fw,
                        sy=r * fh,
                        w=fw,
                        h=fh,
                        scale=scale,
                    )
        out = os.path.join(OUT, "transparency", f"{name}_contact.png")
        write_png(out, width, height, img)
        print(f"  wrote {os.path.relpath(out, ROOT)} ({width}x{height})")


def alphamap():
    """Alpha classification per pixel, so holes are unmistakable.

    black = opaque, grey = transparent outside the figure, RED = partial alpha,
    MAGENTA = transparent pixel fully enclosed by the figure (a see-through hole).
    """
    scale = 4
    fw, fh = 24, 32
    for name in CHARACTERS:
        _, _, src = decode_png(os.path.join(PUB, f"assets/characters/{name}_24x32_4x6.png"))
        width = 4 * fw * scale
        height = 6 * fh * scale
        img = blank(width, height, (40, 40, 46, 255))
        for r in range(6):
            for c in range(4):
                holes = _enclosed_mask(src, c * fw, r * fh, fw, fh)
                for y in range(fh):
                    for x in range(fw):
                        a = src[r * fh + y][c * fw + x][3]
                        if a == 255:
                            col = (18, 18, 22, 255)
                        elif a == 0:
                            col = (255, 0, 255, 255) if holes[y][x] else (120, 122, 130, 255)
                        else:
                            col = (255, 40, 40, 255)
                        fill(img, (c * fw + x) * scale, (r * fh + y) * scale, scale, scale, col)
        out = os.path.join(OUT, "transparency", f"{name}_alphamap.png")
        write_png(out, width, height, img)
        print(f"  wrote {os.path.relpath(out, ROOT)} ({width}x{height})")


def _enclosed_mask(rows, x0, y0, w, h):
    transparent = [[rows[y0 + y][x0 + x][3] == 0 for x in range(w)] for y in range(h)]
    reached = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if transparent[y][x] and not reached[y][x]:
                reached[y][x] = True
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if transparent[y][x] and not reached[y][x]:
                reached[y][x] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and transparent[ny][nx] and not reached[ny][nx]:
                reached[ny][nx] = True
                stack.append((nx, ny))
    return [[transparent[y][x] and not reached[y][x] for x in range(w)] for y in range(h)]


# --------------------------------------------------------------- tileset sheet
def tileset():
    """Each stage tileset at 6x with a tile grid, for judging what art exists."""
    scale = 6
    for stage in STAGES:
        _, _, src = decode_png(os.path.join(PUB, f"assets/environments/{stage}_tiles_16x16.png"))
        cols, rows_n = 8, 6
        gap = 2
        width = cols * (16 * scale + gap) + gap
        height = rows_n * (16 * scale + gap) + gap
        img = blank(width, height, (200, 60, 200, 255))
        for r in range(rows_n):
            for c in range(cols):
                x = gap + c * (16 * scale + gap)
                y = gap + r * (16 * scale + gap)
                blit(img, src, x, y, sx=c * 16, sy=r * 16, w=16, h=16, scale=scale)
        out = os.path.join(OUT, "tilesets", f"{stage}_tiles_6x.png")
        write_png(out, width, height, img)
        print(f"  wrote {os.path.relpath(out, ROOT)} ({width}x{height})")


# ------------------------------------------------------------------ map render
def _load_prop(area, name, w, h):
    path = os.path.join(PUB, f"assets/props/{area}/{name}_{w}x{h}.png")
    _, _, rows = decode_png(path)
    return rows


def map_render():
    """Composites the generated Valcendre map: tiles, then props in depth order.

    This is a static composition check, not a Phaser screenshot: it draws the
    same layers in the same order the renderer does, so repetition, facades and
    prop grounding can be judged. It does not include lighting or FX.
    """
    with open(os.path.join(PUB, "assets/maps/village.json")) as fh:
        m = json.load(fh)
    _, _, tiles = decode_png(os.path.join(PUB, "assets/environments/valcendre_tiles_16x16.png"))
    with open(os.path.join(ROOT, "src/art/data/prop-metadata.json")) as fh:
        prop_meta = json.load(fh)

    props_by_name = {}
    for area, items in prop_meta.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue  # the _comment block is a list of strings
            props_by_name[f"{area}.{item['name']}"] = {"area": area, **item}

    tw = m["tilewidth"]
    W, H = m["width"] * tw, m["height"] * tw
    img = blank(W, H, (10, 10, 14, 255))

    def draw_layer(name):
        layer = next((l for l in m["layers"] if l.get("name") == name), None)
        if not layer or "data" not in layer:
            return
        for i, gid in enumerate(layer["data"]):
            if gid == 0:
                continue
            t = gid - 1
            sx, sy = (t % 8) * 16, (t // 8) * 16
            dx, dy = (i % m["width"]) * tw, (i // m["width"]) * tw
            blit(img, tiles, dx, dy, sx=sx, sy=sy, w=16, h=16)

    # Same visible layers, in the same order, as src/core/MapLoader.ts.
    for name in ("floor", "decorBack", "architecture", "cover"):
        draw_layer(name)

    objects = next(l for l in m["layers"] if l["type"] == "objectgroup")["objects"]

    def props_of(obj):
        return {p["name"]: p["value"] for p in obj.get("properties", [])}

    # Ground-depth props, then y-sorted props, then front props: the same order
    # the scene's depth values produce.
    drawn = []
    for obj in objects:
        if obj.get("type") != "prop":
            continue
        p = props_of(obj)
        d = props_by_name[f"{p['area']}.{p['prop']}"]
        order = {"ground": 0, "sorted": 1, "front": 2}[d["depth"]]
        drawn.append((order, obj["y"], obj, d))
    drawn.sort(key=lambda e: (e[0], e[1]))

    for _, _, obj, d in drawn:
        art = _load_prop(d["area"], d["name"], d["width"], d["height"])
        lift = d.get("overheadLift", 0)
        x = round(obj["x"] - d["width"] / 2)
        y = round(obj["y"] - (d["height"] - d["feetInset"]) - lift)
        blit(img, art, x, y)

    out = os.path.join(OUT, "map", "valcendre_full.png")
    write_png(out, W, H, img)
    print(f"  wrote {os.path.relpath(out, ROOT)} ({W}x{H})")

    # Native-resolution 480x270 crops, one per authored area.
    crops = [
        ("arrival_alley", 0, 440),
        ("market_square", 60, 190),
        ("garden_lane", 0, 330),
        ("bakery_corridor", 290, 70),
        ("garage_yard", 480, 280),
        ("garage_interior", 560, 40),
    ]
    for name, cx, cy in crops:
        cw, ch = 480, 270
        cx = max(0, min(cx, W - cw))
        cy = max(0, min(cy, H - ch))
        crop = [[img[cy + y][cx + x] for x in range(cw)] for y in range(ch)]
        out = os.path.join(OUT, "map", f"valcendre_{name}_480x270.png")
        write_png(out, cw, ch, crop)
        print(f"  wrote {os.path.relpath(out, ROOT)} (480x270 @ {cx},{cy})")


def zoom():
    """One character's rows at 8x over magenta, to judge pose facing and junk."""
    scale = 8
    fw, fh = 24, 32
    name = sys.argv[2] if len(sys.argv) > 2 else "tempest"
    _, _, src = decode_png(os.path.join(PUB, f"assets/characters/{name}_24x32_4x6.png"))
    width = 4 * fw * scale
    height = 6 * fh * scale
    img = blank(width, height, (255, 0, 255, 255))
    for r in range(6):
        for c in range(4):
            blit(img, src, c * fw * scale, r * fh * scale,
                 sx=c * fw, sy=r * fh, w=fw, h=fh, scale=scale)
    out = os.path.join(OUT, "transparency", f"{name}_zoom8x.png")
    write_png(out, width, height, img)
    print(f"  wrote {os.path.relpath(out, ROOT)} ({width}x{height})")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode == "zoom":
        zoom()
    if mode in ("contact", "all"):
        contact()
    if mode in ("alphamap", "all"):
        alphamap()
    if mode in ("tileset", "all"):
        tileset()
    if mode in ("map", "all"):
        map_render()
