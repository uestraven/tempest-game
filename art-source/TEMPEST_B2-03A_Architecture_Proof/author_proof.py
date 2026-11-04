#!/usr/bin/env python3
"""
TEMPEST B.2-03A — Valcendre modular architecture and ground proof.

Authoring tool for the production PNGs in this folder.

    python3 -I art-source/TEMPEST_B2-03A_Architecture_Proof/author_proof.py

EVERY PIXEL COMES FROM AUTHORED DATA. No random number generator, no
procedural noise, no photographic source. Base surfaces are explicit ASCII maps
(one character = one pixel, width-checked). Edge, corner and transition tiles
are derived from those bases by named, authored operations - add a lit return
face, add a footing, cap with a ridge - which is how a real tileset is built and
which guarantees the courses actually line up instead of being redrawn by hand
each time. Re-running reproduces identical bytes.

Colours are looked up BY ID from valcendre_palette.json; no hex literal appears
in this file, so a tile cannot drift off-palette. An unknown legend character
raises rather than inventing a colour.

Light is upper-left / northwest. Cast shadow falls south and east.

Geometry decisions, from TEMPEST_ART_BIBLE_v2 section 5:
  masonry  1 px joint + 7 px ashlar course, twice per 16 px module, so joints
           land every 8 px when modules stack and the bond breaks between
           courses (seams at x5/x11 against x2/x8/x14).
  slate    1 px crevice + 1 px lit upper edge + 6 px body, twice per module,
           vertical seams offset 8 px between the two courses.
  eave     3 px band, 1 px upper highlight, dark recessed underside.
  plinth   lower 3 px, distinguishing facade from paving.
"""

import json
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PALETTE_PATH = os.path.join(REPO, "public", "assets", "tmp", "valcendre_palette.json")

with open(PALETTE_PATH) as fh:
    _pal = json.load(fh)
PALETTE_VERSION = _pal["schema_version"]
HEX = {c["id"]: c["hex"] for c in _pal["colors"]}
assert len(HEX) == 53, f"expected 53 palette colours, got {len(HEX)}"


def rgba(cid):
    h = HEX[cid].lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CLEAR = (0, 0, 0, 0)

LEGEND = {
    " ": CLEAR,
    "#": rgba("ink"),
    "~": rgba("outline_soft"),
    "@": rgba("cast_neutral"),
    "0": rgba("limestone_0"),
    "1": rgba("limestone_1"),
    "2": rgba("limestone_2"),
    "3": rgba("limestone_3"),
    "4": rgba("limestone_4"),
    "p": rgba("plaster_0"),
    "q": rgba("plaster_1"),
    "r": rgba("plaster_2"),
    "-": rgba("paving_0"),
    ",": rgba("paving_1"),
    ".": rgba("paving_2"),
    "'": rgba("paving_3"),
    "a": rgba("slate_0"),
    "b": rgba("slate_1"),
    "c": rgba("slate_2"),
    "d": rgba("slate_3"),
    "e": rgba("slate_4"),
    "w": rgba("wood_0"),
    "x": rgba("wood_1"),
    "y": rgba("wood_2"),
    "z": rgba("wood_3"),
    "i": rgba("iron_0"),
    "j": rgba("iron_1"),
    "k": rgba("iron_2"),
    "S": rgba("shutter_0"),
    "T": rgba("shutter_1"),
    "U": rgba("shutter_2"),
    "V": rgba("shutter_3"),
}


def png(path, w, h, px):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes(px[y][x])
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b"IEND", b""))


def art(rows, width=16):
    """ASCII map -> character grid, width-checked."""
    for y, r in enumerate(rows):
        if len(r) != width:
            raise ValueError(f"row {y} is {len(r)} wide, want {width}: {r!r}")
    if len(rows) % 1:
        raise ValueError("bad height")
    return [list(r) for r in rows]


def to_px(grid):
    return [[LEGEND[c] for c in row] for row in grid]


def copy(grid):
    return [row[:] for row in grid]


# ---------------------------------------------------------------- authored ops
def set_col(g, x, chars):
    """Paint column x. `chars` is one char (whole column) or a per-row string."""
    for y in range(len(g)):
        g[y][x] = chars if len(chars) == 1 else chars[y]
    return g


def set_row(g, y, chars):
    for x in range(len(g[0])):
        g[y][x] = chars if len(chars) == 1 else chars[x]
    return g


def overlay_rows(g, y0, rows):
    """Stamp a list of full-width strings starting at row y0."""
    for i, r in enumerate(rows):
        for x, c in enumerate(r):
            g[y0 + i][x] = c
    return g


# =====================================================================
# ASSET A — cobblestone paving, four seamless interchangeable variants
# =====================================================================
#
# Coursed French pavé. Horizontal mortar joints at y2, y8, y13 -> stacking
# gives joint spacing 6,5,5,6,5,5 and NEVER a joint on the 16 px boundary, so
# there is no visible tile lattice. Three courses:
#
#   A  y3..y7    5 px   joints vary per variant
#   B  y9..y12   4 px   joints vary per variant
#   C  y14,y15 + y0,y1  wraps across the horizontal tile boundary
#
# Course C uses ONE shared joint set in all four variants, which is what makes
# the tiles freely interchangeable. Every course keeps stone (never a joint) at
# x=0, so no vertical joint lands on the 16 px boundary either.
#
# Tones are authored per stone: "." main, "," darker stone, "'" gets a
# northwest-facing lit upper-left face.

MORTAR_ROWS = (2, 8, 13)
BANDS = {"A": (3, 7), "B": (9, 12), "Cb": (14, 15), "Ct": (0, 1)}

# Grout is paving_1, ONE step from the paving_2 body, not paving_0. The first
# pass used paving_0 and the floor read as high-contrast brickwork; the bible
# asks for low-contrast grout with most floor pixels in a single calm mid-light
# range, and reserves the darkest shade for occasional damage.
GROUT = ","
BODY = "."
LIT = "'"
CRACK = "-"

COURSE_C = ([6, 13], [BODY, BODY, BODY])

# Joints, tones, and BRIDGES. A bridge is an x-range on a horizontal joint row
# that stays stone, so a tall stone spans two courses and the paving interlocks
# instead of reading as continuous courses. Bridges sit in tile interiors, so
# they never affect the tile seams.
COBBLE = [
    {"A": ([5, 12], [BODY, LIT, BODY]), "B": ([4, 11], [BODY, BODY, BODY]),
     "bridge": {2: [(6, 11)], 8: [(1, 3)], 13: []}},
    {"A": ([3, 10], [BODY, BODY, BODY]), "B": ([6, 12], [BODY, LIT, BODY]),
     "bridge": {2: [(1, 2)], 8: [(7, 11)], 13: [(4, 8)]}},
    {"A": ([4, 10], [BODY, LIT, BODY]), "B": ([7, 13], [BODY, BODY, BODY]),
     "bridge": {2: [], 8: [(2, 6)], 13: [(9, 12)]}},
    {"A": ([6, 11], [BODY, BODY, BODY]), "B": ([5, 10], [BODY, LIT, BODY]),
     "bridge": {2: [(9, 13)], 8: [], 13: [(1, 4)]}},
]

# Rare isolated damage: one short deeper crack per variant, in paving_0.
# Kept clear of x0 and x15 so a crack can never land on a tile boundary and
# read as a seam.
CRACKS = [[(3, 5, 10)], [(11, 9, 12)], [(6, 11, 14)], [(14, 4, 7)]]


def cobble_tile(v):
    g = [[GROUT] * 16 for _ in range(16)]

    def lay(y0, y1, joints, tones, lit):
        edges = [0] + list(joints) + [16]
        for s_i in range(len(edges) - 1):
            x0 = edges[s_i] + (1 if s_i else 0)
            x1 = edges[s_i + 1] - 1
            if x1 < x0:
                continue
            tone = tones[s_i % len(tones)]
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    g[y][x] = BODY
            # Northwest-facing lit face on the stone's upper-left corner only.
            if tone == LIT and lit:
                for x in range(x0, min(x0 + 4, x1 + 1)):
                    g[y0][x] = LIT

    spec = COBBLE[v]
    ja, ta = spec["A"]
    jb, tb = spec["B"]
    jc, tc = COURSE_C
    lay(*BANDS["A"], ja, ta, True)
    lay(*BANDS["B"], jb, tb, True)
    lay(*BANDS["Cb"], jc, tc, True)
    lay(*BANDS["Ct"], jc, tc, False)

    # Horizontal joints, then bridges punched back through them so stones
    # interlock across courses.
    for y in MORTAR_ROWS:
        for x in range(16):
            g[y][x] = GROUT
        for (bx0, bx1) in spec["bridge"].get(y, []):
            for x in range(bx0, bx1 + 1):
                g[y][x] = BODY

    # One isolated deeper crack, the only place paving_0 appears.
    for (cy, cx0, cx1) in CRACKS[v]:
        for x in range(cx0, cx1 + 1):
            g[cy][x] = CRACK
    return g


# =====================================================================
# ASSET B — modular limestone / slate architecture atlas
# =====================================================================

# Ashlar limestone, bond A: seams x5/x11 upper course, x2/x8/x14 lower.
LIMESTONE_A = art([
    "0000000000000000",
    "3333303333303333",
    "2222202222202222",
    "2222202222202222",
    "2222202222202222",
    "1111101111101111",
    "1111101111101111",
    "1111101111101111",
    "0000000000000000",
    "3303333303333303",
    "2202222202222202",
    "2202222202222202",
    "2202222202222202",
    "1101111101111101",
    "1101111101111101",
    "1101111101111101",
])

# Bond B: the two courses swapped, so neighbours never repeat.
LIMESTONE_B = art([
    "0000000000000000",
    "3303333303333303",
    "2202222202222202",
    "2202222202222202",
    "2202222202222202",
    "1101111101111101",
    "1101111101111101",
    "1101111101111101",
    "0000000000000000",
    "3333303333303333",
    "2222202222202222",
    "2222202222202222",
    "2222202222202222",
    "1111101111101111",
    "1111101111101111",
    "1111101111101111",
])

# Plaster: quiet broad planes, two faint scour lines. No whole-wall dither.
# Quiet by design: the bible says most facade surfaces are quiet and must not
# be dithered. The first pass carried two full-width plaster_1 scour rows, which
# read as unexplained stripes across the finished facade, so the fill is now
# clean and the only horizontal line in a facade comes from wall_plaster_course.
PLASTER = art([
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "qqqqqqqqqqqqqqqq",
    "qqqqqqqqqqqqqqqq",
])

# Slate plane A: 1 px crevice, 1 px lit upper edge, 6 px body; seams offset
# 8 px between the module's two courses.
# 1px slate_0 crevice then a 7px slate_1 body. The first pass also put a
# full-width slate_2 line under every crevice, which at 8px spacing read as
# corrugated metal rather than slate; the reference keeps its light accents
# sparse, so the highlight is now only a short glint on individual slates.
# Slates are 11-15px wide, not 4-8px, for the same reason.
SLATE_A = art([
    "aaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "aaaaaaaaaaaaaaaa",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
])

# Slate plane B: bond reversed plus two sparse 2 px glints, so alternating A
# and B across a roof prevents a readable 16 px grid.
# Variant B: seams in the other places, plus two sparse 2px slate_2 glints.
SLATE_B = art([
    "aaaaaaaaaaaaaaaa",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "bbccbabbbbbbbbbb",
    "bbbbbabbbbbbbbbb",
    "aaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabbbb",
    "bbbbbbbbbbbabccb",
    "bbbbbbbbbbbabbbb",
])

# --- authored derivations -------------------------------------------
# limestone_4 down a whole column read as a bright outline and made the
# building float. The return face is limestone_3 with a single
# limestone_4 pixel-wide arris.
LIT_RETURN = ("4", "3")
SHADE_RETURN = ("0", "1")  # 1px recess, then the shaded return face


def wall_edge_left(base):
    g = copy(base)
    set_col(g, 0, LIT_RETURN[1])  # the return plane itself
    set_col(g, 1, LIT_RETURN[1])
    for y in range(0, 16, 8):
        g[y][0] = LIT_RETURN[0]   # arris catching the light at each course
    return g


def wall_edge_right(base):
    g = copy(base)
    set_col(g, 14, SHADE_RETURN[0])  # recess line
    set_col(g, 15, SHADE_RETURN[1])  # shaded return plane
    return g


def wall_cap(g):
    """Lit coping along the top of a wall."""
    g = copy(g)
    set_row(g, 0, "4")
    set_row(g, 1, "3")
    return g


def wall_footing(g):
    """Dark footing where masonry meets the ground."""
    g = copy(g)
    overlay_rows(g, 12, [
        "1111111111111111",
        "0000000000000000",
        "~~~~~~~~~~~~~~~~",
        "0000000000000000",
    ])
    return g


PLASTER_COURSE = overlay_rows(copy(PLASTER), 0, [
    "1111111111111111",
    "3333333333333333",
])

WALL_EDGE_TOP = wall_cap(LIMESTONE_A)
WALL_EDGE_BOTTOM = wall_footing(LIMESTONE_A)
WALL_EDGE_LEFT = wall_edge_left(LIMESTONE_A)
WALL_EDGE_RIGHT = wall_edge_right(LIMESTONE_A)
WALL_CORNER_TL = wall_cap(wall_edge_left(LIMESTONE_A))
WALL_CORNER_TR = wall_cap(wall_edge_right(LIMESTONE_A))
WALL_CORNER_BL = wall_footing(wall_edge_left(LIMESTONE_A))
WALL_CORNER_BR = wall_footing(wall_edge_right(LIMESTONE_A))

# Foundation / plinth course: heavier blocks, no highlight, dark base line.
WALL_PLINTH = art([
    "0000000000000000",
    "2222222222222222",
    "1111111111111111",
    "1111111111111111",
    "1111111111111111",
    "1111111111111111",
    "1111111111111111",
    "0000000000000000",
    "2222222222222222",
    "1111111111111111",
    "1111111111111111",
    "1111111111111111",
    "0000000000000000",
    "~~~~~~~~~~~~~~~~",
    "0000000000000000",
    "~~~~~~~~~~~~~~~~",
])

# --- structural shadow overlays (binary alpha) ----------------------
SHADE_FOOTING = art([
    "----------------",
    "----------------",
    "----------------",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
])

SHADE_UNDER_EAVE = art([
    "~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
])

SHADE_CORNER = art([
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
    "---             ",
])

# --- roof derivations -----------------------------------------------
RIDGE_CAP = ["eeeeeeeeeeeeeeee", "dddddddddddddddd"]
# Bible 5.2: a 3px eave with a 1px lit upper edge and a dark recessed
# underside. The first pass used one pixel per band and the roof had no
# readable thickness where it met the facade.
EAVE_BAND = [
    "dddddddddddddddd",  # lit upper edge of the fascia
    "cccccccccccccccc",  # fascia face
    "cccccccccccccccc",
    "aaaaaaaaaaaaaaaa",  # fascia shadow line
    "~~~~~~~~~~~~~~~~",  # recessed underside, onto the facade below
]


def roof_ridge(base):
    g = copy(base)
    overlay_rows(g, 0, RIDGE_CAP)
    return g


def roof_eave(base):
    """3 px eave band with a lit upper edge and a dark recessed underside."""
    g = copy(base)
    overlay_rows(g, 11, EAVE_BAND)
    return g


def roof_left(base):
    g = copy(base)
    set_col(g, 0, "c")   # verge board catching the light
    return g


def roof_right(base):
    g = copy(base)
    set_col(g, 15, "a")  # shaded verge
    set_col(g, 14, "a")
    return g


ROOF_RIDGE = roof_ridge(SLATE_A)
ROOF_EAVE = roof_eave(SLATE_A)
ROOF_EDGE_LEFT = roof_left(SLATE_A)
ROOF_EDGE_RIGHT = roof_right(SLATE_A)
ROOF_CORNER_TL = roof_ridge(roof_left(SLATE_A))
ROOF_CORNER_TR = roof_ridge(roof_right(SLATE_A))
ROOF_CORNER_BL = roof_eave(roof_left(SLATE_A))
ROOF_CORNER_BR = roof_eave(roof_right(SLATE_A))

# Roof-to-facade transition: eave underside over the top of a plaster facade.
ROOF_TO_FACADE = art([
    "dddddddddddddddd",
    "cccccccccccccccc",
    "aaaaaaaaaaaaaaaa",
    "~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~",
    "1111111111111111",
    "3333333333333333",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "qqqqqqqqqqqqqqqq",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
])

# Eave corner transitions: the eave underside wrapping onto a masonry return.
ROOF_EAVE_CORNER_L = wall_cap(wall_edge_left(LIMESTONE_A))
overlay_rows(ROOF_EAVE_CORNER_L, 0, [
    "dddddddddddddddd",
    "cccccccccccccccc",
    "aaaaaaaaaaaaaaaa",
    "~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~",
])
for _y in range(5, 16):
    ROOF_EAVE_CORNER_L[_y][0] = "4"
    ROOF_EAVE_CORNER_L[_y][1] = "3"

ROOF_EAVE_CORNER_R = wall_cap(wall_edge_right(LIMESTONE_A))
overlay_rows(ROOF_EAVE_CORNER_R, 0, [
    "dddddddddddddddd",
    "cccccccccccccccc",
    "aaaaaaaaaaaaaaaa",
    "~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~",
])
for _y in range(5, 16):
    ROOF_EAVE_CORNER_R[_y][15] = "0"
    ROOF_EAVE_CORNER_R[_y][14] = "1"

# Doorway threshold / step, sitting on the paving.
THRESHOLD = art([
    "1111111111111111",
    "3333333333333333",
    "2222222222222222",
    "1111111111111111",
    "0000000000000000",
    "----------------",
    "----------------",
    ".....,,,,,......",
    "................",
    "-------.--------",
    ".,,,,,,.,,,,,,,.",
    "................",
    "................",
    "-----.-------.--",
    "................",
    "................",
])

ATLAS = [
    ("wall_limestone_a", LIMESTONE_A),
    ("wall_limestone_b", LIMESTONE_B),
    ("wall_plaster", PLASTER),
    ("wall_plaster_course", PLASTER_COURSE),
    ("wall_edge_top", WALL_EDGE_TOP),
    ("wall_edge_bottom", WALL_EDGE_BOTTOM),
    ("wall_edge_left", WALL_EDGE_LEFT),
    ("wall_edge_right", WALL_EDGE_RIGHT),
    ("wall_corner_tl", WALL_CORNER_TL),
    ("wall_corner_tr", WALL_CORNER_TR),
    ("wall_corner_bl", WALL_CORNER_BL),
    ("wall_corner_br", WALL_CORNER_BR),
    ("wall_plinth", WALL_PLINTH),
    ("shade_footing", SHADE_FOOTING),
    ("shade_under_eave", SHADE_UNDER_EAVE),
    ("shade_corner", SHADE_CORNER),
    ("roof_slate_a", SLATE_A),
    ("roof_slate_b", SLATE_B),
    ("roof_ridge", ROOF_RIDGE),
    ("roof_eave", ROOF_EAVE),
    ("roof_edge_left", ROOF_EDGE_LEFT),
    ("roof_edge_right", ROOF_EDGE_RIGHT),
    ("roof_corner_tl", ROOF_CORNER_TL),
    ("roof_corner_tr", ROOF_CORNER_TR),
    ("roof_corner_bl", ROOF_CORNER_BL),
    ("roof_corner_br", ROOF_CORNER_BR),
    ("roof_to_facade", ROOF_TO_FACADE),
    ("roof_eave_corner_l", ROOF_EAVE_CORNER_L),
    ("roof_eave_corner_r", ROOF_EAVE_CORNER_R),
    ("roof_ridge_end_l", roof_ridge(roof_left(SLATE_B))),
    ("roof_ridge_end_r", roof_ridge(roof_right(SLATE_B))),
    ("threshold", THRESHOLD),
]

# =====================================================================
# ASSET C — window and doorway components
# =====================================================================
# Shuttered limestone window inside a 32x32 component. The 22 px motif sits on
# a plaster ground so it drops onto a facade without a halo. Depth comes from a
# dark reveal on the sunward side of the aperture, shutters proud of the wall,
# and a lit sill with dark returns underneath.
WINDOW = art([
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrr00000000000000000000000rrrr",
    "rrrrr03333333333333333333330rrrr",
    "rrrrr0~~~~~~~~~~~~~~~~~~~~~0rrrr",
    "rrrrr0~SSSSS~iiiiiii~SSSSS~0rrrr",
    "rrrrr0~STTTS~iaaaaai~STTTS~0rrrr",
    "rrrrr0~SVVVS~iacccai~SVVVS~0rrrr",
    "rrrrr0~STTTS~iacccai~STTTS~0rrrr",
    "rrrrr0~SUUUS~iacccai~SUUUS~0rrrr",
    "rrrrr0~STTTS~iaaaaai~STTTS~0rrrr",
    "rrrrr0~SVVVS~iacccai~SVVVS~0rrrr",
    "rrrrr0~STTTS~iacccai~STTTS~0rrrr",
    "rrrrr0~SUUUS~iacccai~SUUUS~0rrrr",
    "rrrrr0~STTTS~iaaaaai~STTTS~0rrrr",
    "rrrrr0~SSSSS~iiiiiii~SSSSS~0rrrr",
    "rrrrr0~~~~~~~~~~~~~~~~~~~~~0rrrr",
    "rrrr0" + "4" * 23 + "0rrr",
    "rrrr0" + "3" * 23 + "0rrr",
    "rrrr0" + "~" * 23 + "0rrr",
    "rrrrr" + "r" * 23 + "rrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
], 32)

# Wooden doorway, 16x32: limestone lintel, framed plank leaf, iron handle,
# stone step. Two facade rows tall, so it drops straight onto a 32 px facade.
DOOR = art([
    "rrrrrrrrrrrrrrrr",
    "0000000000000000",
    "3333333333333333",
    "0~~~~~~~~~~~~~~0",
    "0~wwwwwwwwwwww~0",
    "0~wyyywwyyyyw~~0",
    "0~wyzywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyjkyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wyyywwyyyyw~~0",
    "0~wwwwwwwwwwww~0",
    "0~~~~~~~~~~~~~~0",
    "0111111111111110",
    "0000000000000000",
    "~~~~~~~~~~~~~~~~",
    "0000000000000000",
])

COMPONENTS = [
    ("valcendre_proof_window_32x32.png", WINDOW, 32, 32),
    ("valcendre_proof_door_16x32.png", DOOR, 16, 32),
]

COLS, ROWS = 8, 4


def build():
    cob = [[CLEAR] * 64 for _ in range(16)]
    for i in range(4):
        t = to_px(cobble_tile(i))
        for y in range(16):
            for x in range(16):
                cob[y][i * 16 + x] = t[y][x]
    png(os.path.join(HERE, "valcendre_proof_cobble_16x16.png"), 64, 16, cob)

    atlas = [[CLEAR] * (COLS * 16) for _ in range(ROWS * 16)]
    for idx, (name, g) in enumerate(ATLAS):
        if len(g) != 16 or any(len(r) != 16 for r in g):
            raise ValueError(f"atlas tile {name} is not 16x16")
        t = to_px(g)
        ox, oy = (idx % COLS) * 16, (idx // COLS) * 16
        for y in range(16):
            for x in range(16):
                atlas[oy + y][ox + x] = t[y][x]
    png(os.path.join(HERE, "valcendre_proof_architecture_16x16.png"), COLS * 16, ROWS * 16, atlas)

    for fname, g, w, h in COMPONENTS:
        png(os.path.join(HERE, fname), w, h, to_px(g))

    print(f"cobble  64x16  4 tiles")
    print(f"atlas   {COLS*16}x{ROWS*16}  {len(ATLAS)} tiles  {COLS}x{ROWS}")
    for fname, _, w, h in COMPONENTS:
        print(f"{fname}  {w}x{h}")
    for i, (n, _) in enumerate(ATLAS):
        print(f"  [{i:2}] r{i//COLS}c{i%COLS}  {n}")


if __name__ == "__main__":
    build()
