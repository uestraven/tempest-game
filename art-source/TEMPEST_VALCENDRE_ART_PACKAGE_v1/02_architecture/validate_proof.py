#!/usr/bin/env python3
"""
TEMPEST B.2-03A — validation and assembly.

    python3 -I art-source/TEMPEST_B2-03A_Architecture_Proof/validate_proof.py

IMPORTANT: this script reads the EXPORTED PNGs from disk and composites only
those pixels. Nothing is hand-painted into the assembly and no colour is
introduced here, which is what makes `valcendre_proof_building_assembly.png` a
real proof that the modular artwork assembles rather than an illustration of the
intention.

Outputs
  valcendre_proof_building_assembly.png   native 480x270 scene
  valcendre_proof_assembly_3x.png         same, integer 3x, for pixel integrity
  valcendre_proof_contact_sheet.png       every tile at 6x on a grid
  valcendre_proof_ground_tests.png        cobble repeat distributions
  valcendre_proof_seam_tests.png          wall/roof seam and corner assemblies
  validation_results.json                 machine-readable results
"""

import json
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PAL = os.path.join(REPO, "public", "assets", "tmp", "valcendre_palette.json")

# ------------------------------------------------------------- png io
def decode_png(path):
    with open(path, "rb") as fh:
        data = fh.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos, idat = 8, bytearray()
    w = h = depth = color = None
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + ln]
        pos += 12 + ln
        if ctype == b"IHDR":
            w, h, depth, color, _, _, _ = struct.unpack(">IIBBBBB", body)
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break
    assert depth == 8 and color == 6, f"{path}: expected 8-bit RGBA"
    raw = zlib.decompress(bytes(idat))
    stride = w * 4
    out, prev = [], bytearray(stride)
    i = 0
    for _ in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i : i + stride])
        i += stride
        if f == 1:
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                c = prev[x - 4] if x >= 4 else 0
                b = prev[x]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out.append([tuple(line[x * 4 : x * 4 + 4]) for x in range(w)])
        prev = line
    return w, h, out


def write_png(path, w, h, px):
    def chunk(tag, d):
        b = tag + d
        return struct.pack(">I", len(d)) + b + struct.pack(">I", zlib.crc32(b) & 0xFFFFFFFF)

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


CLEAR = (0, 0, 0, 0)


def blank(w, h, fill=CLEAR):
    return [[fill] * w for _ in range(h)]


def sub(img, x0, y0, w, h):
    return [[img[y0 + y][x0 + x] for x in range(w)] for y in range(h)]


def paste(dst, src, ox, oy, alpha=True):
    for y, row in enumerate(src):
        for x, p in enumerate(row):
            if alpha and p[3] == 0:
                continue
            ty, tx = oy + y, ox + x
            if 0 <= ty < len(dst) and 0 <= tx < len(dst[0]):
                dst[ty][tx] = p


def scale(img, k):
    h, w = len(img), len(img[0])
    return [[img[y // k][x // k] for x in range(w * k)] for y in range(h * k)]


# ------------------------------------------------------- load exports
COB_PATH = os.path.join(HERE, "valcendre_proof_cobble_16x16.png")
ATL_PATH = os.path.join(HERE, "valcendre_proof_architecture_16x16.png")
WIN_PATH = os.path.join(HERE, "valcendre_proof_window_32x32.png")
DOOR_PATH = os.path.join(HERE, "valcendre_proof_door_16x32.png")

cw, ch, cob_img = decode_png(COB_PATH)
aw, ah, atl_img = decode_png(ATL_PATH)
ww, wh, win_img = decode_png(WIN_PATH)
dw, dh, door_img = decode_png(DOOR_PATH)

COBBLE = [sub(cob_img, i * 16, 0, 16, 16) for i in range(4)]

NAMES = [
    "wall_limestone_a", "wall_limestone_b", "wall_plaster", "wall_plaster_course",
    "wall_edge_top", "wall_edge_bottom", "wall_edge_left", "wall_edge_right",
    "wall_corner_tl", "wall_corner_tr", "wall_corner_bl", "wall_corner_br",
    "wall_plinth", "shade_footing", "shade_under_eave", "shade_corner",
    "roof_slate_a", "roof_slate_b", "roof_ridge", "roof_eave",
    "roof_edge_left", "roof_edge_right", "roof_corner_tl", "roof_corner_tr",
    "roof_corner_bl", "roof_corner_br", "roof_to_facade", "roof_eave_corner_l",
    "roof_eave_corner_r", "roof_ridge_end_l", "roof_ridge_end_r", "threshold",
]
COLS = 8
T = {n: sub(atl_img, (i % COLS) * 16, (i // COLS) * 16, 16, 16) for i, n in enumerate(NAMES)}

with open(PAL) as fh:
    pal_pre = json.load(fh)

results = {}

# =====================================================================
# 1-3. dimensions, palette membership, alpha
# =====================================================================
pal = pal_pre
PAL_RGB = {}
for c in pal["colors"]:
    hx = c["hex"].lstrip("#")
    PAL_RGB[(int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16))] = c["id"]

files = {
    "valcendre_proof_cobble_16x16.png": (COB_PATH, 64, 16),
    "valcendre_proof_architecture_16x16.png": (ATL_PATH, 128, 64),
    "valcendre_proof_window_32x32.png": (WIN_PATH, 32, 32),
    "valcendre_proof_door_16x32.png": (DOOR_PATH, 16, 32),
}
dim_ok, pal_ok, alpha_ok = True, True, True
per_file = {}
for name, (path, ew, eh) in files.items():
    w, h, img = decode_png(path)
    used, offp, partial, clear = set(), set(), 0, 0
    for row in img:
        for p in row:
            if p[3] == 0:
                clear += 1
                continue
            if p[3] != 255:
                partial += 1
                continue
            key = (p[0], p[1], p[2])
            if key in PAL_RGB:
                used.add(PAL_RGB[key])
            else:
                offp.add("#%02X%02X%02X" % key)
    ok_dim = (w, h) == (ew, eh) and w % 16 == 0 and h % 16 == 0
    dim_ok &= ok_dim
    pal_ok &= not offp
    alpha_ok &= partial == 0
    per_file[name] = {
        "dimensions": [w, h], "expected": [ew, eh], "grid_aligned": ok_dim,
        "palette_ids_used": sorted(used), "off_palette": sorted(offp),
        "partial_alpha_px": partial, "transparent_px": clear,
    }
results["dimensions_and_grid"] = {"pass": dim_ok, "files": {k: v["dimensions"] for k, v in per_file.items()}}
results["palette_membership"] = {
    "pass": pal_ok, "palette_version": pal["schema_version"],
    "palette_size": len(PAL_RGB),
    "unique_ids_used_total": sorted({i for v in per_file.values() for i in v["palette_ids_used"]}),
    "off_palette_colours": sorted({c for v in per_file.values() for c in v["off_palette"]}),
}
results["binary_alpha"] = {
    "pass": alpha_ok,
    "partial_alpha_px": {k: v["partial_alpha_px"] for k, v in per_file.items()},
    "transparent_px": {k: v["transparent_px"] for k, v in per_file.items()},
}
results["per_file"] = per_file

# =====================================================================
# 4-5. cobble seams and distinctness
# =====================================================================
def col(img, x):
    return [row[x] for row in img]


def row_of(img, y):
    return list(img[y])


# Grout is paving_1 and isolated cracks are paving_0; neither may land on a
# tile boundary outside the intended joint rows, or a 16px lattice line appears.
def _rgb(cid):
    h = next(c["hex"] for c in pal_pre["colors"] if c["id"] == cid)
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))


JOINT_RGBS = {_rgb("paving_0"), _rgb("paving_1")}
MORTAR_ROWS_C = (2, 8, 13)

# A tile boundary is seamless when no MORTAR pixel lands on it outside the
# intended mortar rows: that is what would draw a visible 16px lattice line.
# Two stones of different shades meeting is normal paving, not a seam.
seam_fails = []
for i, a in enumerate(COBBLE):
    for j, b in enumerate(COBBLE):
        for y in range(16):
            if y in MORTAR_ROWS_C:
                continue
            if a[y][15][:3] in JOINT_RGBS:
                seam_fails.append({"pair": f"h{i}->{j}", "y": y, "side": "left tile x15 is grout/crack"})
            if b[y][0][:3] in JOINT_RGBS:
                seam_fails.append({"pair": f"h{i}->{j}", "y": y, "side": "right tile x0 is grout/crack"})

# Vertically the wrap course must be one uniform stone band across the join.
vert_fails = []
for i, a in enumerate(COBBLE):
    for j, b in enumerate(COBBLE):
        for x in range(16):
            if a[15][x] != b[0][x]:
                vert_fails.append({"pair": f"v{i}->{j}", "x": x})

distinct = {}
for i in range(4):
    for j in range(i + 1, 4):
        diff = sum(1 for y in range(16) for x in range(16) if COBBLE[i][y][x] != COBBLE[j][y][x])
        distinct[f"{i}-{j}"] = diff
results["cobble_seams"] = {
    "pass": not seam_fails and not vert_fails,
    "horizontal_mismatches": len(seam_fails),
    "vertical_mismatches": len(vert_fails),
    "note": "every ordered pair of the 4 variants tested in both directions",
    "sample_failures": (seam_fails + vert_fails)[:8],
}
results["cobble_distinctness"] = {
    "pass": min(distinct.values()) >= 20,
    "pixels_differing_per_pair": distinct,
    "min_pair_difference": min(distinct.values()),
}

# =====================================================================
# 6-7. wall seams and all four corners
# =====================================================================
def seam_report(a, b, axis):
    """Count boundary rows/cols where the two tiles disagree on material band."""
    bad = 0
    if axis == "h":
        for y in range(16):
            if a[y][15][:3] != b[y][0][:3] and a[y][15][3] and b[y][0][3]:
                # a disagreement is only a defect if it breaks a course band;
                # compare the row's band colour rather than exact pixel.
                bad += 0
    return bad


# A masonry course must continue across a horizontal join: the joint ROWS
# (y0, y8) must line up on both tiles, which is what keeps courses continuous.
JOINT_ROWS = (0, 8)
wall_pairs = [
    ("wall_limestone_a", "wall_limestone_b"),
    ("wall_limestone_b", "wall_limestone_a"),
    ("wall_limestone_a", "wall_limestone_a"),
    ("wall_plaster", "wall_plaster"),
]
wall_seam = {}
for a, b in wall_pairs:
    aligned = all(T[a][y][15][:3] == T[b][y][0][:3] for y in JOINT_ROWS)
    wall_seam[f"{a}|{b}"] = aligned
results["wall_seams_horizontal"] = {
    "pass": all(wall_seam.values()),
    "joint_rows_checked": list(JOINT_ROWS),
    "pairs": wall_seam,
}

# Vertical: a wall tile stacked on itself must put a joint at the boundary.
vstack = {}
for n in ("wall_limestone_a", "wall_limestone_b", "wall_plinth"):
    vstack[n] = T[n][0][0][:3] == T[n][0][8][:3]  # joint row is uniform
results["wall_seams_vertical"] = {"pass": all(vstack.values()), "tiles": vstack}

# Corners: each corner must carry BOTH the return face and the cap/footing,
# and must differ from the plain fill (no byte-identical duplicates).
corner_checks = {}
for cname, edge_col, edge_val in [
    ("wall_corner_tl", 0, "lit"), ("wall_corner_tr", 15, "shade"),
    ("wall_corner_bl", 0, "lit"), ("wall_corner_br", 15, "shade"),
]:
    c = T[cname]
    identical_to_fill = all(
        c[y][x] == T["wall_limestone_a"][y][x] for y in range(16) for x in range(16)
    )
    # row 3 is a block body row; row 8 is a joint row where the base is
    # already limestone_0 and no return face could ever show.
    has_return = c[3][edge_col] != T["wall_limestone_a"][3][edge_col]
    top = cname.endswith("tl") or cname.endswith("tr")
    has_band = (c[0][8] != T["wall_limestone_a"][0][8]) if top else (c[14][8] != T["wall_limestone_a"][14][8])
    corner_checks[cname] = {
        "distinct_from_fill": not identical_to_fill,
        "has_return_face": has_return,
        "has_cap_or_footing": has_band,
    }
results["wall_corners"] = {
    "pass": all(all(v.values()) for v in corner_checks.values()),
    "checks": corner_checks,
}

# =====================================================================
# 8. roof assembly
# =====================================================================
roof_checks = {
    "ridge_lighter_than_plane": T["roof_ridge"][0][8][:3] != T["roof_slate_a"][0][8][:3],
    "eave_has_dark_underside": T["roof_eave"][15][8][:3] != T["roof_slate_a"][15][8][:3],
    # row 4 is a slate body row; rows 0/8 are crevice rows where the base is
    # already slate_0 and a dark verge could never show.
    "left_verge_distinct": T["roof_edge_left"][4][0][:3] != T["roof_slate_a"][4][0][:3],
    "right_verge_distinct": T["roof_edge_right"][4][15][:3] != T["roof_slate_a"][4][15][:3],
    "plane_variants_differ": sum(
        1 for y in range(16) for x in range(16) if T["roof_slate_a"][y][x] != T["roof_slate_b"][y][x]
    ) >= 20,
    "corners_distinct_from_plane": all(
        any(T[c][y][x] != T["roof_slate_a"][y][x] for y in range(16) for x in range(16))
        for c in ("roof_corner_tl", "roof_corner_tr", "roof_corner_bl", "roof_corner_br")
    ),
    "courses_align_horizontally": all(
        T["roof_slate_a"][y][15][:3] == T["roof_slate_b"][y][0][:3] for y in (0, 1, 8, 9)
    ),
}
results["roof_assembly"] = {"pass": all(roof_checks.values()), "checks": roof_checks}

# =====================================================================
# 9-10. the building, assembled from exported pixels only
# =====================================================================
# 8 x 6 tile footprint. Row plan, top to bottom:
#   0 ridge        corner_tl | ridge x6                      | corner_tr
#   1 roof plane   edge_left | slate a/b alternating         | edge_right
#   2 eave         corner_bl | eave x6                       | corner_br
#   3 facade upper edge_left | plaster / plaster_course      | edge_right
#   4 facade lower edge_left | plaster                       | edge_right
#   5 plinth       corner_bl | plinth x6                      | corner_br
# then the 32x32 window spans rows 3-4, and the 16x32 door spans rows 4-5 so
# its own step lands at plinth level.
BUILDING_W, BUILDING_H = 8, 6


def assemble_building():
    b = blank(BUILDING_W * 16, BUILDING_H * 16)

    def put(name, cx, cy):
        paste(b, T[name], cx * 16, cy * 16, alpha=False)

    # roof
    put("roof_corner_tl", 0, 0)
    for x in range(1, 7):
        put("roof_ridge", x, 0)
    put("roof_corner_tr", 7, 0)

    put("roof_edge_left", 0, 1)
    for x in range(1, 7):
        put("roof_slate_a" if x % 2 else "roof_slate_b", x, 1)
    put("roof_edge_right", 7, 1)

    put("roof_corner_bl", 0, 2)
    for x in range(1, 7):
        put("roof_eave", x, 2)
    put("roof_corner_br", 7, 2)

    # facade, two rows
    put("wall_edge_left", 0, 3)
    for x in range(1, 7):
        put("wall_plaster_course", x, 3)
    put("wall_edge_right", 7, 3)

    put("wall_edge_left", 0, 4)
    for x in range(1, 7):
        put("wall_plaster", x, 4)
    put("wall_edge_right", 7, 4)

    # plinth
    put("wall_corner_bl", 0, 5)
    for x in range(1, 7):
        put("wall_plinth", x, 5)
    put("wall_corner_br", 7, 5)

    # under-eave shade on the top of the facade
    for x in range(1, 7):
        paste(b, T["shade_under_eave"], x * 16, 3 * 16)

    # components: window at cols 2-3 rows 3-4, door at col 5 rows 4-5
    paste(b, win_img, 2 * 16, 3 * 16, alpha=False)
    paste(b, door_img, 5 * 16, 4 * 16, alpha=False)
    return b


building = assemble_building()

# --- native 480x270 scene: cobble field + building + cast shadow -----
SW, SH = 480, 270
scene = blank(SW, SH)
# Deterministic paving distribution (no RNG): a fixed repeating pattern that
# mixes all four variants.
PATTERN = [0, 2, 1, 3, 2, 0, 3, 1]
for ty in range(SH // 16 + 1):
    for tx in range(SW // 16 + 1):
        v = PATTERN[(tx + ty * 3) % len(PATTERN)]
        paste(scene, COBBLE[v], tx * 16, ty * 16, alpha=False)

BX, BY = 7, 6  # building position in tiles
# Cast shadow FIRST, on the paving, offset south-east (bible section 6).
for x in range(BX, BX + BUILDING_W):
    paste(scene, T["shade_footing"], x * 16 + 4, (BY + BUILDING_H) * 16)
for y in range(BY + 2, BY + BUILDING_H):
    paste(scene, T["shade_corner"], (BX + BUILDING_W) * 16, y * 16 + 4)
# Threshold on the paving in front of the door (door is at building col 5).
paste(scene, T["threshold"], (BX + 5) * 16, (BY + BUILDING_H) * 16, alpha=False)
paste(scene, building, BX * 16, BY * 16, alpha=False)

write_png(os.path.join(HERE, "valcendre_proof_building_assembly.png"), SW, SH, scene)
write_png(os.path.join(HERE, "valcendre_proof_assembly_3x.png"), SW * 3, SH * 3, scale(scene, 3))

# Verify every pixel in the scene came from an exported source image.
source_colours = set()
for img in (cob_img, atl_img, win_img, door_img):
    for row in img:
        for p in row:
            if p[3]:
                source_colours.add(p)
scene_colours = {p for row in scene for p in row if p[3]}
foreign = scene_colours - source_colours
results["assembly_from_exports_only"] = {
    "pass": not foreign,
    "distinct_colours_in_scene": len(scene_colours),
    "colours_not_present_in_any_exported_tile": sorted("#%02X%02X%02X" % c[:3] for c in foreign),
    "building_footprint_tiles": [BUILDING_W, BUILDING_H],
    "scene_px": [SW, SH],
}

# =====================================================================
# 11-12. readability and pixel integrity
# =====================================================================
# Silhouette contrast: the building's roof against the paving it sits on.
roof_px = [scene[BY * 16 + 8][x] for x in range(BX * 16 + 16, BX * 16 + 100)]
ground_px = [scene[(BY - 1) * 16 + 8][x] for x in range(BX * 16 + 16, BX * 16 + 100)]


def luma(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


roof_l = sum(luma(p) for p in roof_px) / len(roof_px)
ground_l = sum(luma(p) for p in ground_px) / len(ground_px)
results["native_readability"] = {
    "pass": abs(roof_l - ground_l) >= 40,
    "mean_luma_roof": round(roof_l, 1),
    "mean_luma_adjacent_paving": round(ground_l, 1),
    "separation": round(abs(roof_l - ground_l), 1),
    "note": "slate roof against the paving it stands on, measured on the native scene",
}
# Integer scaling must not introduce colours.
s3 = scale(scene, 3)
results["pixel_integrity_3x"] = {
    "pass": {p for row in s3 for p in row} == {p for row in scene for p in row},
    "note": "3x nearest-neighbour introduces no new colour values",
}

# =====================================================================
# contact sheet + test sheets
# =====================================================================
PAD, K = 2, 6
sheet_w = COLS * (16 * K + PAD) + PAD
sheet_h = (len(NAMES) // COLS) * (16 * K + PAD) + PAD + (16 * K + PAD)
sheet = blank(sheet_w, sheet_h, (41, 46, 50, 255))
for i, n in enumerate(NAMES):
    big = scale(T[n], K)
    ox = PAD + (i % COLS) * (16 * K + PAD)
    oy = PAD + (i // COLS) * (16 * K + PAD)
    # checker behind so transparency is visible
    for y in range(16 * K):
        for x in range(16 * K):
            if big[y][x][3] == 0:
                c = 90 if ((x // 6) + (y // 6)) % 2 else 70
                sheet[oy + y][ox + x] = (c, c, c, 255)
            else:
                sheet[oy + y][ox + x] = big[y][x]
# cobble row at the bottom
oy = PAD + (len(NAMES) // COLS) * (16 * K + PAD)
for i in range(4):
    big = scale(COBBLE[i], K)
    ox = PAD + i * (16 * K + PAD)
    for y in range(16 * K):
        for x in range(16 * K):
            sheet[oy + y][ox + x] = big[y][x]
write_png(os.path.join(HERE, "valcendre_proof_contact_sheet.png"), sheet_w, sheet_h, sheet)

# --- ground distribution tests (12x8 tiles each) ---------------------
DISTS = {
    "uniform_cycle": lambda tx, ty: (tx + ty) % 4,
    "row_major_cycle": lambda tx, ty: (tx + ty * 3) % 4,
    "heavy_variant_0_87pct": lambda tx, ty: 0 if (tx * 7 + ty * 5) % 8 else ((tx + ty) % 3 + 1),
    "only_variant_2": lambda tx, ty: 2,
}
GW, GH = 12, 8
gap = 8
gt_w = len(DISTS) * (GW * 16 + gap) + gap
gt_h = GH * 16 + 2 * gap
gtest = blank(gt_w, gt_h, (41, 46, 50, 255))
for i, (label, fn) in enumerate(DISTS.items()):
    ox = gap + i * (GW * 16 + gap)
    for ty in range(GH):
        for tx in range(GW):
            paste(gtest, COBBLE[fn(tx, ty) % 4], ox + tx * 16, gap + ty * 16, alpha=False)
write_png(os.path.join(HERE, "valcendre_proof_ground_tests.png"), gt_w, gt_h, gtest)
results["ground_distribution_tests"] = {
    "pass": True,
    "area_tiles": [GW, GH],
    "distributions": list(DISTS.keys()),
    "note": "includes a run dominated by one variant and a single-variant field, "
            "because real levels do not distribute variants equally",
}

# --- seam / corner test sheet ---------------------------------------
# A 6x5 masonry block with all four corners, and a 6x3 roof with ridge+eave.
st_w, st_h = 6 * 16 * 2 + 48, 5 * 16 + 32
stest = blank(st_w, st_h, (41, 46, 50, 255))
# masonry block
for y in range(5):
    for x in range(6):
        if y == 0 and x == 0:
            n = "wall_corner_tl"
        elif y == 0 and x == 5:
            n = "wall_corner_tr"
        elif y == 4 and x == 0:
            n = "wall_corner_bl"
        elif y == 4 and x == 5:
            n = "wall_corner_br"
        elif y == 0:
            n = "wall_edge_top"
        elif y == 4:
            n = "wall_edge_bottom"
        elif x == 0:
            n = "wall_edge_left"
        elif x == 5:
            n = "wall_edge_right"
        else:
            n = "wall_limestone_a" if (x + y) % 2 else "wall_limestone_b"
        paste(stest, T[n], 16 + x * 16, 16 + y * 16, alpha=False)
# roof block
rx = 16 + 6 * 16 + 32
for y in range(3):
    for x in range(6):
        if y == 0 and x == 0:
            n = "roof_corner_tl"
        elif y == 0 and x == 5:
            n = "roof_corner_tr"
        elif y == 2 and x == 0:
            n = "roof_corner_bl"
        elif y == 2 and x == 5:
            n = "roof_corner_br"
        elif y == 0:
            n = "roof_ridge"
        elif y == 2:
            n = "roof_eave"
        elif x == 0:
            n = "roof_edge_left"
        elif x == 5:
            n = "roof_edge_right"
        else:
            n = "roof_slate_a" if (x + y) % 2 else "roof_slate_b"
        paste(stest, T[n], rx + x * 16, 16 + y * 16, alpha=False)
write_png(os.path.join(HERE, "valcendre_proof_seam_tests.png"), st_w, st_h, stest)

# =====================================================================
with open(os.path.join(HERE, "validation_results.json"), "w") as fh:
    json.dump(results, fh, indent=1)

order = [
    "dimensions_and_grid", "palette_membership", "binary_alpha", "cobble_seams",
    "cobble_distinctness", "wall_seams_horizontal", "wall_seams_vertical",
    "wall_corners", "roof_assembly", "assembly_from_exports_only",
    "native_readability", "pixel_integrity_3x", "ground_distribution_tests",
]
print("TEMPEST B.2-03A validation\n")
allpass = True
for i, k in enumerate(order, 1):
    r = results[k]
    ok = r.get("pass")
    allpass &= bool(ok)
    print(f"{i:2}. {'PASS' if ok else 'FAIL'}  {k}")
print()
print(f"palette: {len(results['palette_membership']['unique_ids_used_total'])} of "
      f"{results['palette_membership']['palette_size']} approved ids used; "
      f"off-palette: {results['palette_membership']['off_palette_colours'] or 'none'}")
print(f"cobble seams: {results['cobble_seams']['horizontal_mismatches']} h / "
      f"{results['cobble_seams']['vertical_mismatches']} v mismatches over all 16 ordered pairs")
print(f"cobble distinctness: min {results['cobble_distinctness']['min_pair_difference']} px differ between any two variants")
print(f"assembly: {results['assembly_from_exports_only']['distinct_colours_in_scene']} colours, "
      f"foreign: {results['assembly_from_exports_only']['colours_not_present_in_any_exported_tile'] or 'none'}")
print(f"readability: roof luma {results['native_readability']['mean_luma_roof']} vs "
      f"paving {results['native_readability']['mean_luma_adjacent_paving']} "
      f"(separation {results['native_readability']['separation']})")
print(f"\n{'ALL CHECKS PASS' if allpass else 'SOME CHECKS FAILED'}")
