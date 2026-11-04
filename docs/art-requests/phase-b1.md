# Phase B.1A — art requests

Machine-readable form: [`phase-b1.json`](phase-b1.json). Evidence: [`../diagnostics/`](../diagnostics/).

Everything below was measured from the shipped PNGs with `tools/inspect-assets.py`
and `tools/diagnostics.py`, not inferred from filenames or `manifest.json`.
**No production artwork was generated, repainted or modified by the engine
agent.** Where a defect was worked around in code, the workaround is named so it
can be removed when the art lands.

Priority: **P0** blocks correct presentation · **P1** visible defect with a
working fallback · **P2** quality.

---

## Headline finding: the reported transparency is NOT in the PNGs

Characters were reported as "partially transparent, allowing environments to
show through their bodies and clothing". That is not what the files contain.

| Measurement | Result |
| --- | --- |
| Partial-alpha pixels (alpha 1–254) across all 7 sheets | **0** |
| Sprite alpha set below 1 anywhere in the renderer | **none** |
| Blend mode other than NORMAL on any character | **none** |
| Enclosed transparent holes, worst sheet | 14 (lookout_guard), largest single hole 44px (enforcer) |

Contact sheets over white, black, **magenta** and real cobblestone are in
`docs/diagnostics/transparency/<name>_contact.png`. Against magenta — where any
genuine see-through would be unmissable — the bodies and clothing are solid.

What *was* found, and fixed in code, is in
[`../art-integration.md`](../art-integration.md) §11. The two art-side
contributors are **CHAR-003** (opaque dark junk baked into the `down` row) and
**CHAR-004** (matting speckle).

---

## P0 — blocking

### CHAR-001 · One canonical directional character sheet

**Source:** all seven `public/assets/characters/<name>_24x32_4x6.png`
**Wanted:** `<name>_24x32_dir.png` + `<name>_24x32_dir_b.png`, 144×160 each,
24×32 frames, 6 columns × 5 rows

| Sheet A rows | Sheet B rows |
| --- | --- |
| `idle_down`, `idle_up`, `idle_side`, `walk_down`, `walk_up` | `walk_side`, `aim_side`, `aim_down`, `aim_up`, `fire_side` |

- All `*_side` rows face **RIGHT (+x)**. The engine mirrors for left — do not
  supply a left-facing variant.
- Pad a shorter state by repeating its first frame; never leave a column empty.
- Feet anchor **(12, 30)**: lowest opaque pixel on frame row 30, row 31 fully
  transparent, **identical on every frame of every row**.
- Alpha binary only (0 or 255), transparent background, no enclosed holes, no
  baked background.

**The problem.** The shipped sheets are 96×192, 4 columns × 6 rows, and the four
columns are pose variations rather than directions — the manifest says so. But
they *do* contain directional art, inconsistently, and **differently per
character**:

| Character | idle row | walk row | aim row |
| --- | --- | --- | --- |
| `tempest` | 2 FRONT + 2 BACK views | faces **LEFT** | faces **RIGHT** |
| `lookout_guard` | 4 FRONT views, **no back view** | faces **RIGHT** | faces **RIGHT** |

Evidence: `tempest_rows0-2_16x.png`, `lookout_guard_rows0-2_14x.png`,
`tempest_zoom8x.png`.

So there is no single frame contract, and no generic mapping is possible. Two
consequences, both now handled in code:

1. Phase B picked idle columns `[1, 2]` for every character. On tempest that is
   one front and one back frame — **the idle animation alternated between facing
   the camera and facing away, twice a second.**
2. Mirroring has to be relative to each clip's intrinsic facing. A blanket "flip
   when aiming left" turns a left-facing walk cycle the wrong way round.

**Acceptance:** identical row order and facing convention across all seven ·
within a row, every frame's alpha bbox height within 1px and width within 3px of
the row median · content bottom on row 30 everywhere · no partial alpha, no
enclosed holes, no baked background.

**Engine fallback in use:** `src/art/CharacterDefinitions.ts` records the
measured per-frame facing for the two verified characters and mirrors only where
a facing genuinely does not exist. Vertical walk falls back to the vertical idle,
because no front or back walk cycle exists. The other five sheets are marked
`verified: false` and pinned to a single-frame idle so they cannot flicker.

### CHAR-002 · Crouch poses

**Wanted:** `<name>_24x32_crouch.png`, 144×96, rows
`crouch_idle_down`, `crouch_idle_up`, `crouch_move_side`. Tempest at minimum.

**The problem.** There is no crouch artwork at all, and crouch is a core locked
mechanic (66 px/s, 45 suspicion/s, 28/s in shadow).

**Acceptance:** crouched silhouette 6–9px shorter than standing with the feet
still on row 30 · readable as crouching at 480×270.

**Engine fallback in use:** crouch keeps the standing art. Mechanics unchanged;
cues are the HUD stance pip and the supplied `eye`/`eye_hidden` icon. No squash
or scale — that would break the pixel contract — and no reuse of an unrelated
row such as `fire`.

### ENV-001 · Real wall edges and corners

**Source:** `<stage>_tiles_16x16.png` tiles 8–17

**The problem.** The tileset *names* ten wall pieces but six are the same art.
Measured near-identical groups (mean per-channel difference < 6/255):

```
floor_01, floor_05
floor_02, floor_03, floor_04, floor_07, floor_08, accent
wall_solid, wall_variant, wall_left, wall_right, wall_corner_tl, wall_corner_tr
stairs_up, stairs_down
ground_debris, rubble
carpet, carpet_edge
```

**Only 28 of 48 tiles are visually distinct.** There is no directional
information to build corners from, so a building outline cannot be drawn
correctly.

**Acceptance:** all ten wall pieces visually distinct and seamlessly tiling · a
3×3 building block built from corner + edge + fill reads as a building.

**Engine fallback in use:** the generator paints only the three measurably
distinct pieces (`wall_solid`, `wall_top`, `wall_bottom`) and synthesises depth
from a roof band instead of corners.

### ENV-002 · Valcendre building facades

**Wanted:** `public/assets/environments/valcendre_facades_16x16.png`, 128×128,
8 × 8 tiles of 16×16. Full tile list in the JSON; summary:

| Group | Tiles |
| --- | --- |
| Facades | plaster ×2, limestone ×2, timber ×2, base trim, cornice |
| Windows | shuttered open/closed, flowerbox, dark, lit, arched, small, boarded |
| Doors | wood L/R, arched, shop L/R, dark doorway, doorstep, wide garage |
| Shopfronts | awning L/M/R, bakery sign, blank sign, window L/R, crates |
| Roofs | tile ×2, ridge, eave N/S, valley, hip L/R, chimney, dormer, skylight, gutter |
| Transitions | cobble↔grass, cobble↔dirt, grass↔dirt, paving edge |
| Shadows | wall south, wall east, corner, under-eave *(binary alpha, overlays)* |
| Trim | string course, quoin, pilaster, plinth, sign/lamp bracket, drainpipe, cellar hatch |
| Indoor | floorboard, floor tile, threshold, wall base |

**The problem.** The base tileset has **one** door, **one** window, a flat red
roof tile and a roof edge. No facades, shutters, shopfronts, roof ridges, eaves,
ground transitions or environmental shadows. With 28 distinct tiles for an entire
stage, every street necessarily looks the same. This is the root cause of
"Valcendre is visually repetitive" — see
[`../art-integration.md`](../art-integration.md) §12 for what composition could
and could not fix.

**Acceptance:** a two-storey shopfront assembles without reusing a tile side by
side · roof pieces close a pitched roof over a 6×4 footprint · `shadow_*` tiles
composite correctly over cobble and grass · `transition_*` tiles remove hard
seams between surfaces.

**Engine fallback in use:** the generator synthesises depth from distance to the
nearest walkable tile — wall face, roof edge, roof, darkness — with a
deterministic window rhythm and seven authored doors. It is a composition trick,
not architecture.

---

## P1 — visible defects with working fallbacks

### CHAR-003 · `down` row has baked-in opaque background

Opaque near-black pixels that are not part of the character, apparently captured
from the source atlas during the crop. Visible against magenta in
`tempest_zoom8x.png`. Frame opacity 138–262px against bodies of ~250px, with
nearly every pixel a unique colour, so it is a dark gradient rather than a flat
key colour.

Also: `barnabe` down columns 0–1 have only **56 and 42** opaque pixels, and
`suzanne` columns 0–1 only **37 and 42** — effectively blank frames.

**Engine fallback in use:** corpses now use the purpose-made
`props/shared/body_*.png`. See `Enemy.applyCorpseSprite`.

### ENV-003 · Eight genuinely different floor tiles per stage

`floor_02/03/04/07/08` and `accent` are one tile repeated six times;
`floor_01`/`floor_05` are a second. A "floor variant" therefore changes nothing,
and the only tiles that *do* differ (`floor_inlay`, `checker`) are framed
decorative motifs that read as wallpaper when scattered.

**Acceptance:** no two of the eight within 8/255 mean per-channel difference ·
all eight tile seamlessly in any arrangement · none contains a framed motif.

**Engine fallback in use:** variant frequency dropped from 30% to 5–22% per area,
and the motif tiles were removed from random variation and placed deliberately as
authored accents.

### ENV-004 · Shaded surface variants

Wanted: `shade_cobble`, `shade_grass`, `shade_paving`, `shade_gravel`,
`shade_indoor`.

There is exactly one shadow tile, a flat dark grey. A concealment zone must be
legible, so the generator replaces the surface with it — which means the garden
lane, an authored shadow zone, cannot also read as grass.

**Engine fallback in use:** the lane keeps the dark concealment floor for
gameplay legibility, with grass and flowerbed drawn over it on the
appearance-only `decorBack` layer.

### ENV-005 · Stage differentiation

All four stage tilesets share a **byte-identical** tile name / `solid` / `cover` /
`occludes_vision` schema and the same 48 slots. The locked design calls for a
Burgundy village, a château, a Gothic abbey and a corrupted sanctum; a recolour
cannot express that.

**Acceptance:** each stage has ≥16 tiles with no counterpart elsewhere · Abbey
gets arcade, vault-rib and tomb-slab tiles · Estate gets parquet, wainscot and
dressed stone · Ascension gets fissure and ritual-floor tiles.

### PROP-002 · Mission objects with no artwork

| Name | Size | Note |
| --- | --- | --- |
| `transport_van` | 64×32 | Suzanne's transport — the level's central clue |
| `medkit` | 16×16 | Health pickup |
| `ammo_box_pistol` | 16×16 | Pistol ammunition |
| `radio_set` | 16×16 | The market distraction |
| `document_sheet` | 16×16 | Transport log, torn hymn page |
| `weapon_overlay_pistol` | 12×12 × 8 frames | 8-direction held pistol |

**Engine fallback in use:** generated placeholders, listed in
`src/art/textures.ts` `PLACEHOLDER_KEYS`. They are never shipped as production
art, and the gameplay objects were not removed for want of art.

---

## P2 — quality

### CHAR-004 · Matting speckle

Enclosed transparent holes, per sheet: `lookout_guard` 14 (largest 15px),
`enforcer` 11 (largest **44px**), `tempest` 9 (14px), `zealot_cultist` 7 (15px),
`barnabe` 5 (12px), `suzanne` 2, `ascendant_cultist` 1. The 44px hole in
`enforcer` idle column 0 and the 22px hole in its walk column 0 are big enough to
see the ground through the character.

**Acceptance:** `tools/inspect-assets.py alpha` reports 0 enclosed holes for
every frame of every sheet.

### CHAR-005 · Palette discipline

Each 24×32 frame has roughly as many unique colours as opaque pixels — tempest
idle column 0 is 315 opaque pixels in 315 unique colours. These are downscaled
renders. The tilesets, by contrast, use 12 colours total, so the characters will
not sit next to the environment.

**Acceptance:** ≤24 colours per character from a shared stage palette · readable
silhouette at 100% against both pale limestone and the dark garage floor.

### PROP-001 · `village_cross_16x32` wastes half its canvas

The art occupies only rows 16–31; the top 16 rows are fully transparent. Re-export
as 16×16 or extend the art.

### UI-001 · Portrait consistency

Sizes vary per file (`tempest` 64×54, `lookout_guard` 64×52, `enforcer` 65×53,
`zealot_cultist` 61×54, `ascendant_cultist` 62×54, `barnabe` 63×55, `suzanne`
65×54) and all seven are **100% opaque**. Wanted: exactly 64×56 with a
transparent background and the head in the same place in each.

**Engine fallback in use:** drawn 1:1 and centred in a fixed 65×54 panel slot.

---

## Diagnostic tooling the art agent can run

```bash
python3 -I tools/inspect-assets.py alpha    <png> 24 32   # per-frame alpha + enclosed holes
python3 -I tools/inspect-assets.py sheet    <png> 24 32   # per-frame bounding boxes
python3 -I tools/inspect-assets.py tilediff <png> 16 16 <tiles.json>  # near-identical tiles
python3 -I tools/inspect-assets.py prop     <png>...      # canvas vs content, padding
python3 -I tools/diagnostics.py contact                   # 4-background contact sheets
python3 -I tools/diagnostics.py alphamap                  # holes in magenta
python3 -I tools/diagnostics.py zoom <name>               # one sheet at 8x over magenta
python3 -I tools/diagnostics.py map                       # composed level render
```

No third-party packages required — PNG decode and encode are done with `zlib`
from the standard library, because Pillow is not available here.
