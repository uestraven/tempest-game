# Garden walkway and north road material correction — Phase B.2-05C-2R

**Baseline commit:** `1961487` — *Phase B.2-05C-2: Valcendre shaded cobblestone and boundary integration*
**Date:** 2026-11-05

Two material-classification corrections. No artwork, geometry, mission, AI,
movement or concealment mechanic was changed.

---

## 1. Root cause (§3)

Both problems had **one** cause: the `groundMaterial` layer stored the authored
surface's **base tile** — a drawing instruction — and used it as material
identity.

`alleyCobble` and `roadDirt` are different materials that happen to be drawn
with the same picture:

| surface | base tile | what it is |
| --- | --- | --- |
| `alleyCobble` | `cobble` | cobbled street |
| `gardenPath` | `cobble` | cobbled garden walk |
| `roadDirt` | `cobble` | **dirt road** |

So "base tile is `cobble`" meant "cobblestone", and the north road inherited
paving it should never have had. Symmetrically, the garden walk was excluded by
a hand-maintained coordinate rectangle (`SHADE_EXCLUDED_REGIONS`) rather than by
anything the authored data said — a second workaround for the same missing
concept.

**The fix is the concept, not two patches.** `src/art/data/tile-roles.json` now
carries an explicit `material` label per surface, and `groundMaterial` stores
that label:

| surface | material | base tile |
| --- | --- | --- |
| `alleyCobble` | `cobblestone` | `cobble` |
| `marketPaving` | `cobblestone` | `floor_04` |
| `gardenPath` | `cobblestone` | `cobble` |
| `roadDirt` | **`dirt`** | `cobble` |
| `gardenGrass` | `grass` | `grass` |
| `serviceBrick` | `brick` | `brick` |
| `yardGravel` | `gravel` | `ground_debris` |
| `garageFloor` | `industrial` | `metal` |

The layer stores `1 + index into MATERIAL_KINDS`, and the kind list is published
in the map's own properties (`groundMaterialKinds` =
`brick,cobblestone,dirt,grass,gravel,industrial`) so the renderer resolves it
**by name**, never by assuming an order. `build-map.mjs` throws if any ground
surface lacks a label, so a new surface cannot be added without classifying it.

This is the smallest location that fixes it: material identity now lives with
the authored surface definition, and adding or restyling a tile can never again
change a classification. `SHADE_GARDEN_PATH` and `SHADE_EXCLUDED_REGIONS` are
gone — the data answers the question they were working around.

---

## 2. Garden walkway (§1, §2)

### Verified footprint

| | |
| --- | --- |
| region | `gardenWalk`, `tools/map-data-valcendre.mjs` |
| authored bounds | **x6–11, y3–22** (6 × 20 = 120 tiles) |
| surface | `gardenPath` → material **cobblestone** |
| walkable | **116** (4 lost to obstructions) |
| inside an authored shadow stamp | **116 of 116** — `SHADOWS` entry `x6 y3 w6 h20` |
| **treated** | **116** |

`SURFACE_OVERRIDES` sets x8–9, y4–22 to `gardenPath` as well, which is already
its surface — no change. `gardenWalk` appears after `bakeryYard` in `REGIONS`,
so it wins the x6–11, y20–22 overlap and those tiles are walkway, not grass.

### What was *not* included

The adjacent `bakeryYard` grass (material `grass`, 15 shaded tiles) is
untouched, as are soil, vegetation and every decorative prop. Nothing but
material `cobblestone` is painted — asserted over all 2719 walkable tiles.

### No artificial transitions against grass or soil (§2)

Every one of the 116 walkway tiles is a **plain shaded tile**: `base: 'shaded'`,
`mask: 0`, no overlays. Because a mask bit is set only by a **daylight
cobblestone** neighbour, and the walkway is bounded by grass and walls, no
transition art is generated anywhere along it.

Measured consequence: the map's cardinal boundary count is **41 before and 41
after** — the garden work added zero transitions. A test asserts both the
per-tile condition and that total.

No new texture system and no garden-specific palette: the already-integrated
B.2-05A-1 strip and the existing cardinal/diagonal logic do all of it.

---

## 3. North road (§3)

| | |
| --- | --- |
| region | `northRoad`, x60–64, y0–5 |
| surface | `roadDirt` → material **dirt** |
| tiles | 30, all daylight (no shadow stamp) |
| before | 30 tiles of approved daylight cobblestone |
| after | **0 treated** — the legacy dirt-road appearance is restored |

`09-compare-north-road.png` shows it: smooth approved cobbles on the left,
the legacy stippled dirt-road tiles on the right. No dirt artwork was generated;
the original floor layer simply renders again, untouched.

---

## 4. Before / after material counts (§7)

| | before | after | delta |
| --- | --- | --- | --- |
| cobblestone tiles recorded | — (tile-keyed) | **1094** | — |
| cobblestone **daylight** painted | 929 | **899** | **−30** north road |
| cobblestone **shaded** painted | 79 | **195** | **+116** garden walk |
| ground tiles painted in total | 1008 | **1094** | +86 |
| plain shaded (mask 0) | 38 | **154** | +116 |
| cardinal boundary cells | 41 | **41** | **0** |
| diagonal overlays | 0 | **0** | 0 |
| ground layers | 5 | 5 | 0 |

Material census, all 2719 walkable tiles:
`cobblestone 1094, gravel 703, industrial 373, brick 372, grass 147, dirt 30`.

Mask histogram: `0→154, 1→9, 2→14, 3→2, 4→11, 6→3, 9→1, 12→1`. The
non-zero masks are unchanged from B.2-05C-2 — every new tile is a plain
interior.

---

## 5. Renderer contract preserved (§4)

| | |
| --- | --- |
| approved PNGs | **unmodified** — same three checksums, asserted by test |
| cardinal bits | N 1, E 2, S 4, W 8 — unchanged |
| cardinal index | `variant * 16 + mask` — unchanged |
| diagonal index | `variant * 4 + corner`, NW/NE/SE/SW — unchanged |
| diagonal overlays drawn | **0**, and that remains valid — the map's topology has no concave shade corner. Nothing was bent to force overlay usage. |
| `src/art/GroundShade.ts` | **unchanged** from `1961487` |
| B.2-05C-1 stall correction | **unchanged**; 39/39 tests pass and the stall frame is **pixel-identical** |

---

## 6. Regression verification (§5)

Measured in-engine in both passes, from the same probes.

| | before | after |
| --- | --- | --- |
| grid `collides` | 4950 | **4950** |
| grid `shadow` | 652 | **652** |
| grid `blocksSight` | 4870 | **4870** |
| grid `lowCover` | 80 | **80** |
| guard patrol points | — | **identical** (all 7 routes compared element-wise) |
| mission object positions | — | **identical** (every prop's tile compared) |
| enemy roster | 7 | 7, identical |
| map layers other than `groundMaterial` | — | **byte-identical** |
| objects layer | — | **byte-identical** |
| map dimensions | 104×72 | 104×72 |
| collision / cover / propCollision layer counts | 4769 / 92 / 83 | unchanged |
| garage door states | sealed behind 2 doors, 6 door tiles | unchanged (build check passes) |
| **existing 79 market shaded tiles** | 79 | **79** — asserted by excluding the garden walk footprint and recounting |

### Concealment probes — all eleven identical

| tile | what it tests | before | after |
| --- | --- | --- | --- |
| (8,7) | garden walkway, north | shadow | shadow |
| (8,13) | garden walkway, middle | shadow | shadow |
| (8,21) | garden walkway, south | shadow | shadow |
| (9,24) | **bakery grass: shaded but NOT cobblestone** | shadow | shadow |
| (11,45) | market arcade | shadow | shadow |
| (24,44) | lit market paving | — | — |
| (13,45) | first lit tile east of the arcade | — | — |
| (18,35) | covered market row | shadow | shadow |
| (7,60) | arrival alley | shadow | shadow |
| (30,47) | **V1 evidence: visually treated, NOT concealed** | — | — |
| (62,3) | **north road: dirt, no treatment** | — | — |

The three bolded rows are the independence proof, in both directions:

- **(9,24)** is concealed and visually **untreated** — grass, so the artwork
  never touches it while the stealth benefit stands.
- **(30,47)** is visually **treated** (approved daylight cobble) and **not
  concealed** — new paving confers no stealth.
- **(8,13)** gained artwork this phase and its concealment did not move.

On "visually shaded paving outside a concealment zone": **no such tile exists in
Valcendre**, because `build-map.mjs` paints the darker floor from the same
`SHADOWS` stamps that set `shadowZones` — the audit found 0 mismatches between
the two. The sets coincide *by authoring*, not by derivation: the renderer reads
material from `groundMaterial` and visual shade from `floor`, and tests strip
comments from `GroundShade.ts` and `ValcendreV2Scene.ts` and assert neither
mentions `shadowZones`. If a future map shades ground outside a concealment
zone, the artwork will follow the floor and the stealth state will not change.

### Real input

Driven by keyboard only, both passes: walked from the lit bakery yard onto the
garden walkway (engine reports `inShadow=true`), **crouched there with a real
`C` press** and stayed concealed, then walked out and watched the flag flip to
false. `leftConcealment` observed both states in the sample stream.

---

## 7. Captures (§6)

`docs/art-integration/screenshots/b205c2r/` — 13 per pass, native 480×270,
`debugHitboxes: false`, **identical camera coordinates in both passes**
(asserted: the scroll table is equal across telemetry files).

| file | kind | shows |
| --- | --- | --- |
| `01-{before,after}-garden-walk-north.png` | STAGED | walkway, north stretch |
| `01-{before,after}-garden-walk-mid.png` | STAGED | walkway, middle |
| `01-{before,after}-garden-walk-grass-edge.png` | STAGED | where the walkway meets grass — no transition art |
| `01-{before,after}-north-road.png` | STAGED | the dirt road |
| `01-{before,after}-market-arcade.png` | STAGED | no regression |
| `01-{before,after}-market-stall.png` | STAGED | the B.2-05C-1 fix |
| `02-{before,after}-garden-walk-tempest-standing.png` | STAGED | Tempest standing |
| `03-{before,after}-garden-walk-tempest-crouching.png` | STAGED | Tempest crouching |
| `04-{before,after}-garden-walk-lookout-near.png` | STAGED | a Lookout on the path |
| `05-{before,after}-garden-walk-lookout-moving.png` | STAGED | Lookout mid-walk, 21 samples, display height constant |
| `06-{before,after}-played-entered-garden-concealment.png` | PLAYED | real input onto the walkway |
| `07-{before,after}-played-crouched-on-walkway.png` | PLAYED | crouched by a real `C` press |
| `08-{before,after}-played-left-garden-concealment.png` | PLAYED | real input out of concealment |
| `09-compare-*.png` | — | six side-by-side pairs |

### Pixel checks on the frames that must not change

| frame | differing pixels |
| --- | --- |
| market arcade | **0 of 129,600** |
| market stall | **0 of 129,600** |
| north road | 7,447 — **expected**: this is the correction, cobbles reverting to dirt |

The clearest pair is `09-compare-garden-walk-mid.png`: a flat untextured dark
band becomes shaded cobblestone with visible coursing, grass edges untouched.

---

## 8. Tests (§7)

Full suite **449 passing** across 17 files (was 449 at the baseline with
different content: 5 tests replaced, 5 added). `tests/stall-occlusion.test.ts`
39/39.

| required test | where |
| --- | --- |
| semantic differentiation of cobblestone vs dirt | asserts both surfaces base on the `cobble` tile, that their labels differ, and that all 30 north-road tiles read `dirt` in the shipped map |
| garden walkway material assignment | 116 tiles, all cobblestone, all shaded, all painted |
| north-road material preservation | 0 of 30 classified cobblestone; none painted |
| no unsupported material replacement | all 1625 non-cobblestone walkable tiles asserted unpainted |
| existing cardinal and diagonal selection | all 16 masks and all 32 corner cases still covered in `ground-shade.test.ts`; map histogram and the 41 boundary cells pinned |
| all gameplay layer invariants | shadowZones 652, collision 4769, cover 92, propCollision 83, dimensions, evidence object |
| no regression in market paving | shaded cobblestone outside the garden footprint recounted as exactly **79** |
| no regression in stall occlusion | `tests/stall-occlusion.test.ts` 39/39, plus a pixel-identical engine frame |
| every ground surface has a material label | iterates `tile-roles.json`; fails if one is missing or unpublished |
| the kind list is published and resolved by name | map property compared to the expected six kinds |

---

## 9. Files changed

| file | change |
| --- | --- |
| `src/art/data/tile-roles.json` | added a `material` label to all eight ground surfaces |
| `tools/build-map.mjs` | `groundMaterial` now stores the semantic material index; publishes `groundMaterialKinds`; throws on an unlabelled ground surface; logs a material census |
| `public/assets/maps/village.json` | regenerated — only `groundMaterial` changed; every other layer, the objects and the dimensions byte-identical |
| `src/art/ValcendreV2.ts` | `COBBLE_MATERIAL_KIND` and `MATERIAL_KINDS_PROPERTY` replace `COBBLE_MATERIAL_TILES`; `SHADE_GARDEN_PATH` and `SHADE_EXCLUDED_REGIONS` removed |
| `src/art/ValcendreV2Scene.ts` | classifies by material kind read from the map properties; reports a material census |
| `tests/shaded-cobble-integration.test.ts` | material section rewritten for semantic kinds; garden walk, north road and market-preservation tests added |

Added `tools/b205c2r-capture.mjs` and the capture directory.
`src/art/GroundShade.ts` is untouched.

---

## 10. Remaining limitations

1. **372 shaded brick tiles, 46 gravel, 24 industrial, 15 grass** still keep
   their existing treatment — no approved artwork exists. Unchanged by this
   phase and still the largest remaining inconsistency by area (ART-11..13).

2. **Eight of sixteen cardinal masks and all diagonal overlays remain
   unexercised** by this map's topology. Valid per §4; the garden walk, being
   bounded by grass and walls, adds no new mask.

3. **The `floor_crack` decorative motif is still lost on treated cobble** —
   about 40 tiles map-wide draw a plain approved variant instead. ART-14,
   low priority.

4. **`gardenPath` also covers `bakeryPassage`** (x16–19, y31, 4 daylight
   tiles), which now takes approved daylight cobblestone. Correct by material,
   and noted for completeness.

5. **A single console 404 in both passes** — previously traced to the favicon,
   not an asset.

---

## 11. Verification (§7)

```
npx tsc --noEmit        clean
npx vitest run          17 files, 449 passed, 0 failed
npm run build           succeeds
node tools/build-map.mjs  green; locked-door check passes; all areas reachable
```

Production build verified in a real browser (Chromium, SwiftShader, native
480×270) in both passes.

## 12. Success criteria

| | |
| --- | --- |
| every eligible cobblestone area uses the approved artwork | ✅ 1094 tiles: 899 daylight + 195 shaded, garden walkway included |
| dirt remains distinct from cobblestone | ✅ explicit `material` labels; 30 north-road tiles read `dirt` and keep their legacy appearance |
| all existing gameplay behaviour unchanged | ✅ four grid totals, eleven concealment probes, patrol points, mission objects and door states all identical |
