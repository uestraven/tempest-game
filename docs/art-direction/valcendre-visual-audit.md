# Valcendre integrated visual composition audit — Phase B.2-01

**For:** the ART AGENT
**From:** the CODING AGENT
**Commit audited:** `0f07efb`
**Date:** 2026-11-04

This documents the **existing** presentation. Nothing was redesigned, no
artwork was created or modified, no geometry or gameplay changed, and no colour
filter was applied. Reproduce everything here with:

```bash
npm run build && npx vite preview --port 4173    # binds 127.0.0.1 only
node tools/visual-capture.mjs <chromium>          # the frames in baseline/
node tools/visual-audit.mjs                       # composition-report.json
```

---

## 1. The headline: two incompatible art productions are being composited

This is the root cause of "muddy, visually inconsistent", and it is measurable
rather than a matter of taste. Counting **unique RGB values per 1,000 opaque
pixels** across every shipped asset:

| Asset group | Images | Colours | Density |
| --- | --- | --- | --- |
| **Tilesets** (all four stages) | 4 | **12 colours** per 12,288 px sheet | **1 / 1k** |
| **Tempest directional sheets** (Task 02, approved) | 2 | **22–23 colours** per ~8,400 px | **2.6 / 1k** |
| Character pose atlases | 7 | 5,507–6,635 colours | 886–980 / 1k |
| Character portraits | 7 | 2,234–2,702 colours | 671–807 / 1k |
| Props (all stages) | 45 | — | **median 1000 / 1k** |

A density of **1000 / 1k means every single opaque pixel holds a unique RGB
value** — no colour is ever reused. Verified against raw decoded pixels, not
inferred:

```
flower_pot_16x16.png   76 opaque px, 76 unique RGB, every count == 1
  adjacent values: (99,107,74) (49,65,66) (183,121,75) (159,152,143) ...
lamppost_16x32.png     90 opaque px, 90 unique RGB, 71 distinct red channels
```

That is **per-pixel noise, not pixel art**. A 16×16 pixel-art prop normally
uses 4–12 colours.

### What this does on screen

In `02-market-square.png` the ground is drawn from a **12-colour** tileset, the
hero is a **22-colour** sprite, the Lookout standing next to him is a
**5,639-colour** sprite, and the fountain between them is **450 colours in 451
pixels**. Everything noisy reads as a soft, desaturated smudge against a clean
flat background, which is simultaneously:

- **muddy** — the noisy assets have no flat areas and no readable silhouette;
- **inconsistent** — the tileset and Tempest obey a palette, nothing else does;
- **low contrast** — a 6,000-colour character against a 12-colour floor
  averages out to roughly the floor's value, so characters sink into it.

**The two assets that look right are exactly the two that were produced as
approved pixel art** (the tilesets and Tempest's Task-02 directional sheets).
That is the strongest available evidence about which pipeline to keep.

Full per-file numbers: [`baseline/colour-census.json`](baseline/colour-census.json).

---

## 2. Capture package

[`baseline/`](baseline/) — native **480×270**, real engine renders of the
shipped build, **no debug overlays** (`debugOverlayOff: true` is recorded in the
manifest). The HUD is left on because it is part of the presentation.

| File | Area | Camera (px) | Visible tiles |
| --- | --- | --- | --- |
| `01-arrival-alley.png` | Arrival alley | 0,881 | 0,55 → 30,71 |
| `02-market-square.png` | Market square, **Tempest + Lookout in frame** | 152,593 | 9,37 → 39,54 |
| `03-bakery-garden.png` | Bakery and garden route | 0,273 | 0,17 → 30,33 |
| `03b-garden-walk-shadow-corridor.png` | Garden wall walk | 0,65 | 0,4 → 30,20 |
| `03c-upper-lane.png` | Upper lane | 88,0 | 5,0 → 35,16 |
| `04-main-street.png` | Main street | 728,673 | 45,42 → 75,58 |
| `05-depot-courtyard.png` | Depot courtyard | 824,401 | 51,26 → 81,43 |
| `06-garage-exterior.png` | Garage exterior | 1064,225 | 66,14 → 96,30 |
| `07-garage-interior.png` | Garage interior | 920,81 | 57,5 → 87,21 |
| `00-map-overview.png` | **Whole level**, 1664×1152, one engine render | 0,0 | 0,0 → 103,71 |
| `tileset-valcendre-6x.png` | The 48-tile sheet at 6× with a grid | — | — |

`03b` and `03c` are additions beyond the seven requested: the composition data
shows `deep_shadow#29` is 79% of the garden branch's floor, and none of the
seven frames looks at it, so "excessively dark surfaces" could not otherwise be
judged.

### These are STAGED CAMERA CAPTURES, not playthrough footage

The camera is centred on each area through the debug handle, and for frames
with a guard, Tempest and one Lookout are positioned so both are in shot. Guards
not wanted in frame are parked off-playfield. The garage frame sets the V5 flag
to open the doors.

Nothing is redrawn or post-processed — these are real frames of the real
renderer — but they are **not** evidence of a playthrough. Actual
real-input playthrough frames exist separately in
[`../playtests/screenshots/`](../playtests/screenshots/) from Phase C.1B-04A.

The overview resizes the canvas to the full level at zoom 1. Note the game's own
`applyScale` handler picks the largest *integer* zoom for the viewport, so the
zoom has to be forced back to 1 after the resize or the shot comes out at 3×.

---

## 3. Rendering layers

From `src/core/MapLoader.ts`. Drawn in this order; depth in brackets.

| Layer | Depth | Visible | Collides | Contents |
| --- | --- | --- | --- | --- |
| `floor` | 0 | yes | no | Per-area ground surface, plus the dark fill beyond buildings |
| `shadowZones` | 0 | **no** | no | Concealment flags only — **draws nothing** |
| `decorBack` | 1 | yes | no | Authored accents under characters |
| `architecture` | 5 | yes | no | Wall faces, windows, doors, roof band |
| `collision` | 5 | **no** | **yes** | One blocker per non-walkable tile |
| `cover` | 6 | yes | yes | The only layer that is both drawn and collided |
| `propCollision` | 6 | **no** | yes | Rasterised prop footprints |
| `decorFront` | 20 | yes | no | Overhead tile art (empty in this level) |

Actors and props sort between these: props at depth 3 (`ground`) or 22
(`front`), y-sorted props at `10 + y/10000`, enemies at 9, player ~10, corpses
at 4, FX 28–31, HUD 100+.

**`shadowZones` is invisible.** Concealment is a gameplay flag with no
rendering of its own; the only reason a shadowed area looks dark is that the
level author chose `deep_shadow` as its *floor* tile. The two can and do
disagree.

---

## 4. Measured composition problems

From [`baseline/composition-report.json`](baseline/composition-report.json).

### 4.1 Ground repetition

Share of each area's floor held by its single commonest tile:

| Area | Walkable tiles | Distinct floor tiles | Commonest | Share | Shadow flag |
| --- | --- | --- | --- | --- | --- |
| Arrival alley | 120 | 5 | `cobble#38` | 75% | 13% |
| **Market square** | 528 | **3** | `floor_04#3` | **75%** | 12% |
| Bakery + garden | 641 | 4 | `deep_shadow#29` | **79%** | 79% |
| Main street | 404 | 5 | `cobble#38` | **80%** | 0% |
| **Depot courtyard** | 693 | **3** | `ground_debris#27` | **83%** | 3% |
| Depot office | 37 | 2 | `metal#43` | **97%** | 0% |
| Garage interior | 354 | 3 | `metal#43` | **81%** | 7% |
| Loading dock | 77 | 3 | `ground_debris#27` | 57% | 31% |
| North road | 30 | 3 | `cobble#38` | 77% | 0% |

The 693-tile depot courtyard — larger than one screen — is 83% a single tile.

### 4.2 Near-identical tiles (the variety is not real)

`python3 -I tools/inspect-assets.py tilediff public/assets/environments/valcendre_tiles_16x16.png 16 16`

**Only 28 of the 48 tiles are visually distinct.** Byte-identical clusters:

| Cluster | Tiles |
| --- | --- |
| Floors ×6 | `floor_02#1` `floor_03#2` `floor_04#3` `floor_07#6` `floor_08#7` `accent#46` |
| Floors ×2 | `floor_01#0` `floor_05#4` |
| **Walls ×6** | `wall_solid#8` `wall_variant#9` `wall_left#12` `wall_right#13` `wall_corner_tl#14` `wall_corner_tr#15` |
| Stairs ×2 | `stairs_up#22` `stairs_down#23` |
| Debris ×2 | `ground_debris#27` `rubble#37` |
| Carpet ×2 | `carpet#41` `carpet_edge#42` |

The commonest floor tile in the market (`floor_04#3`) is a member of the
six-way identical cluster — so even where the map varies the tile id, the
player sees one surface. `FLOOR_VARIANTS` is doing nothing visible.

### 4.3 Missing architectural transitions — 100%

**78 outside wall corners exist in the level. All 78 are drawn with a
non-corner tile.** Not a placement oversight: `wall_corner_tl` and
`wall_corner_tr` are byte-identical to `wall_solid`, and `wall_corner_bl` /
`wall_corner_br` are never placed. There is no visual difference available
between a straight wall run and a corner, so every building is a flat brick
outline with hard 90° steps. Sample coordinates in the report.

There is also **no wall base, cap or ground transition** anywhere: the floor
tile runs straight into the wall tile. Clearest in `07-garage-interior.png`,
where the striped metal floor abuts brick with no skirting.

### 4.4 Buildings do not read as structures

In `00-map-overview.png` every building in the level — bakery, market halls,
depot office, garage, houses — is the **same red brick outline** with a hollow
interior filled by the dark `roof`/darkness tile. There are no pitched roofs,
eaves, gutters, sills, thresholds or facades. The only facade features are 38
`window#21` tiles and 18 `door_closed#18` tiles scattered on wall rings.

In the market bounding box (§5) there are **7 windows and 7 facade doors**
across roughly 160 wall tiles.

### 4.5 One material for the entire level

Both the overview and every area frame show a single brick wall material and
(outside the garden and the metal interiors) a single tan ground. A working
transport depot, a bakery, a covered market and a residential alley are
indistinguishable by material.

### 4.6 Excessively dark and noisy surfaces

- `deep_shadow#29` is the **floor** of the garden walk and upper lane — 79% of
  that branch. In `03b` the result is a dark strip where **the player is barely
  separable from the ground**, which is also the worst character-contrast case
  in the level.
- The darkness beyond the buildings is a flat featureless fill occupying most of
  `00-map-overview.png`.
- Noise is quantified in §1: props and 14 of 16 character sheets have no
  palette at all.

### 4.7 Inconsistent shadow treatment

Three unrelated things all mean "shadow":

1. `shadowZones` — invisible gameplay flag.
2. `deep_shadow#29` — a floor tile used as a surface.
3. Nothing at all — no prop or character casts a contact shadow, so every
   sprite floats slightly.

The garden's authored concealment is 79% `shadowZones` **and** mostly
`deep_shadow` floor, but the bakery yard is `gardenGrass` with shadow flags over
it — so in `03-bakery-garden.png` concealment is invisible while in `03b` it is
a dark corridor. Same mechanic, two different looks.

### 4.8 Texture scale

Wall brick is a fine 2–3px course; the floor tiles are near-flat with a sparse
4px fleck; the metal garage floor is a hard 1px vertical stripe at 100%
contrast. Three different frequencies and contrasts in one frame, with the
highest-contrast pattern on the largest surface (`07-garage-interior.png`).

### 4.9 Props disconnected from buildings

Measured as props with **no** solid tile within 2 tiles: only **2 of 61** —
`prop_clothesline_26` at `16,22` and `prop_clothesline_31` at `40,11`, both
clotheslines strung with nothing to attach to.

**This is a minor problem.** Props are mostly placed against structure; they
read as disconnected because of §1 (noise) and scale, not position.

### 4.10 Depth and layering

No incorrect layering was found in these frames. The `overheadLift` mechanism
fixed the Phase B clothesline case, `decorFront` is at full opacity, and props
are y-sorted against actors. One structural note: `cover` is the only layer both
drawn and collided, so **a cover piece's art is also its hitbox** — in
`05-depot-courtyard.png` the brick stubs are simultaneously the visual and the
collision, which constrains how they may be redrawn (see §5).

---

## 5. Market square — gameplay geometry constraints

**These are gameplay constraints. The art agent may propose composition
changes, but only the coding agent may change geometry.** Everything below is
load-bearing for pathing, cover, detection or progression.

Solid / cover map, tiles x8–44, y30–58. `#` wall · `W` window · `D` facade door
· `c` drawn cover (also collides) · `p` invisible prop footprint (collides) ·
`.` walkable

```
     1         2         3         4
   8901234567890123456789012345678901234
30 .............########################
31 ########....##DDW#DD#W###############
32 ########................#############
33 ########............pp..#############
34 ########..pp............#############
35 ########................#############
36 ########cccccc...cccccc.#############
37 ######DD................#############
38 #####......................##########
39 ##W##.................pp...##########
40 #..........................##########
41 #........####..........p...##########
42 #...c....####.cccc.........##########
43 #........####..............##########
44 #........###W......#####...##########
45 #..................#####.p.##########
46 #...c.ccc......pp..##W##...####W###..
47 #....................................
48 #.................pp.................
49 #..p.................ccccc...........
50 #####..pp.....p..........pp########..
51 #####.......p..............########..
52 #####............##################..
53 #####............##################..
54 #####............##################..
55 ####W............##################..
56 ###..............##################.p
57 D##.....#############################
58 ........#############################
```

**452 walkable tiles. 24 low-cover tiles, 2 high-cover tiles.**

### Fixed object positions

| Thing | Tile | Notes |
| --- | --- | --- |
| **Fountain** | `24,47` | 32×32 prop, footprint collides |
| **Market hall, west** | `17,41` 4×4 | Solid building block |
| **Market hall, east** | `27,44` 5×3 | Solid building block |
| **Radio distraction** | `31,34` | 128 px noise radius; must stay reachable and recognisable |
| **Clue: tyre tracks** (V1) | `24,48` | Mandatory. **No sprite exists** — glint only |
| **Clue: ransacked stall** (V1) | `30,47` | Mandatory alternate. **No sprite exists** — glint only |
| **Clue: waybill** (V2) | `30,34` | Mandatory. Uses the generic `prop_doc` sprite |
| Overheard trigger (V2 alt) | `22,32` rect 10×6 | Invisible region; needs a living guard within 220 px |
| Checkpoint | `36,48` | |
| Medkit | `10,45` | |

### Cover tiles (art is also the hitbox)

- **Low** (24): `16–21,36` · `25–30,36` · `22–25,42` · `14–16,46` · `29–33,49`
- **High** (2): `12,42` · `12,46`

### Guard posts and patrol lanes

| Guard | Post | Waypoints |
| --- | --- | --- |
| L1 | `13,54` | `13,54` → `18,53` |
| L2 | `34,48` | `34,48` → `24,50` → `15,48` → `15,41` → `24,40` → `33,44` |
| L3 | `26,34` | `26,34` → `17,32` |

Patrol lanes must stay walkable. L2's circuit passes both market halls and both
V1 clue sites.

### Passage openings

- North-west passage to the garden: `16–19,31` — the garden branch mouth.
- East lane to main street: `35–42,47–49`.
- South approach from the arrival alley: `11–15,56–57`.
- West arcade: `9–12,40–49` — authored shadow, the stealth approach. **Must
  remain readable as a passable colonnade, not a wall.**

### Props (18 in the market bounding box)

`fountain 24,47` · `hay_cart 16,51` · `tree 31,42` · `tree 20,52` ·
`bench 27,49` · `bench 19,35` · `barrels 34,51` · `flower_box 29,34` ·
`flower_pot 24,37` · `lamppost 22,51` · `lamppost 33,46` ·
`clothesline 18,40` · `french_flag 20,34` · `village_cross 11,50` ·
`stone_cover 31,40` · `tree 8,30` · `flower_box 18,30` · `tree 44,57`

---

## 6. Problem triage

### A — Fixable by better asset placement or map authoring (coding agent)

No new artwork required.

1. **Floor variety is authored but invisible.** `FLOOR_VARIANTS` already
   scatters several tile ids per surface; six of the eight `floor_*` tiles are
   the same image, so the scatter achieves nothing. Once distinct floor art
   exists this becomes free.
2. **Corner tiles are never placed** (`wall_corner_bl`/`br` unused, 78/78
   corners flat). The generator can place them as soon as they differ.
3. **Two orphan clotheslines** at `16,22` and `40,11`.
4. **Garden concealment reads two ways** — the branch mixes `deep_shadow` floor
   with grass-plus-shadow-flag. An authoring choice, not an art limit.
5. **`shadowZones` draws nothing.** If concealment should be visible, that is a
   renderer feature (a tint layer or decal), which is a coding change — flagged
   here because the art agent may otherwise assume shadow art exists.

### B — Requires new source artwork (art agent)

1. **Repaint props and characters to a palette.** The single highest-impact
   item. 45 props and 14 of 16 character sheets are per-pixel noise; the
   tilesets (12 colours) and Tempest's directional sheets (22 colours) are the
   reference to match. Until this is done, no placement or lighting change will
   stop the scenes looking muddy.
2. **Real wall corners, edges, bases and caps** — currently byte-identical to
   the flat wall (ENV-001).
3. **Distinct floor tiles per surface** — at least 3–4 genuinely different
   images each (ENV-003).
4. **Facade art**: roofs with pitch, eaves, sills, thresholds. 38 windows and 18
   doors across the whole level are the only facade features (ENV-002).
5. **Material differentiation.** One brick serves bakery, market, depot and
   garage.
6. **Shaded surface variants** so concealment can read without using a
   near-black floor (ENV-004).
7. **Lower-contrast large-area surfaces.** The garage's 1px striped metal covers
   354 tiles and fights everything drawn on it.
8. **Contact shadows** under props and characters — nothing is grounded.
9. **Missing clue art** — the V1 tracks and stall have no sprite at all, only a
   glint (VP-003); the BELIAL inscription is a 16×16 floor mark (VP-001).
10. **Recognisable structure art** for the market halls, depot office and
    garage, which are currently rectangles.

### Carried over, still open

`CHAR-001` directional sheets for the six pose-atlas characters ·
`CHAR-002` crouch poses · `VP-001`–`VP-010` and `VPG-001`–`VPG-002` from
[`../art-requests/valcendre-pacing.md`](../art-requests/valcendre-pacing.md) ·
`VPD-001` garage door · `VPE-001` guard-facing indicator.

---

## 7. What I did not do

- No artwork created, modified or replaced.
- No map geometry, collision, AI, objective or gameplay change.
- No global colour filter or any other cosmetic workaround.
- No visual corrections of any kind.
- No other campaign level touched.

Two new read-only tools were added — `tools/visual-capture.mjs` and
`tools/visual-audit.mjs` — plus this report and `baseline/`.

**Next task belongs to the ART AGENT.** The one decision I would flag as most
consequential: §1 shows the project has two art pipelines in it, and the two
assets that read correctly are the ones produced as palette-disciplined pixel
art. Everything else in §6-B follows from choosing that pipeline.
