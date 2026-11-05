# Valcendre shaded cobblestone and boundary integration — Phase B.2-05C-2

**Baseline commit:** `54c088c` — *Phase B.2-05C-2 (partial): ground material audit and shaded-boundary selection*
**Date:** 2026-11-05
**Status:** complete. The approved B.2-05A-1 and B.2-05A-2 artwork renders in the engine.

This supersedes the earlier partial report, which recorded the phase as blocked
on missing artwork. The artwork arrived; everything below is the finished
integration.

---

## 1. Preflight (§2)

| check | result |
| --- | --- |
| baseline commit | `54c088c` |
| B.2-05C-1 stall correction present | yes — `1de335a`, `7554cd6` |
| stall rendering tests pass **before** any change | **39/39** |
| stall rendering tests pass **after** | **39/39** (one assertion widened — §9) |
| B.2-04 texture registration inspected | `AssetRegistry.VALCENDRE_V2`, cobble as `tiles.valcendre.v2.cobble` 64×16/4 |
| map rendering inspected | `ValcendreV2Scene.buildPaving()`, a programmatic blank tilemap layer at depth 0.5 |
| approved manifests read | `valcendre_shaded_cobble_manifest.json`, `valcendre_shade_transition_manifest.json`, `CODING_AGENT_HANDOFF` lineage |

The stall correction's logic was not touched.

---

## 2. Approved source artwork (§3)

Verified before use, then archived at
`art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/08_shade_b205a/`.

| file | dimensions | tiles | SHA-256 | matches manifest |
| --- | --- | --- | --- | --- |
| `valcendre_proof_cobble_16x16.png` (B.2-03A, daylight) | 64×16 | 4 | `14e9b5c5…4349ee` | ✅ both packages name it as their source |
| `valcendre_shaded_cobble_16x16.png` (B.2-05A-1) | 64×16 | 4 | `1747da6a…d15b8` | ✅ |
| `valcendre_shade_boundaries_16x16.png` (B.2-05A-2) | 128×128 | 8×8 = 64 | `c88d2432…96bb0` | ✅ |
| `valcendre_shade_diagonal_corners_16x16.png` (B.2-05A-2) | 128×32 | 8×2 = 16 | `653d7542…f96be` | ✅ |

Nothing was redrawn, recoloured, resized, quantised or regenerated. The
packages' own build script was **not executed**; only the PNGs and manifests
were read.

### Pixel verification

| check | result |
| --- | --- |
| shaded strip opacity | 1024 / 1024 opaque, **0 partial-alpha** |
| cardinal atlas opacity | 16384 / 16384 opaque, **0 partial-alpha** |
| corner overlays | 448 opaque, 3648 transparent, **0 partial-alpha** — binary alpha as declared |
| palette | every opaque colour is in the approved 53-colour `valcendre_palette.json`; **0 new colours** |
| **mask 0 vs the plain shaded tile** | **0 differing pixels, all four variants** — the manifest's `mask_0_is_byte_identical_to_approved_shade` confirmed against the pixels |
| shaded variant ↔ daylight variant pairing | variant *n* maps to source variant *n* for all four |

---

## 3. Material audit (§4) — final

`tools/b205c2-ground-audit.mjs`. Cross-checked against the shipped map: **0**
carved-walkability mismatches, **0** shade mismatches.

### Why neither `shadowZones` nor the floor layer was usable as a material source

`build-map.mjs` held the authored material in `surfaceOf`, painted the floor
from it, then let the shadow pass overwrite the floor with `shadowFloor`. Both
`shadowFloor` and `voidFill` are `deep_shadow`, so in the shipped map a shaded
cobble tile, a shaded brick tile, and the dark fill behind a building wall were
indistinguishable.

**Fixed by exporting the material explicitly** — §5.

### The "~496 tiles" figure, corrected

| | tiles |
| --- | --- |
| `deep_shadow` floor tiles in the B.2-04 market region | 496 |
| …on **walkable ground** | **64** |
| …on **non-walkable `voidFill`** (building interiors, not ground) | **432** |

87% of the number this phase was scoped around was never paving. That was my
error in the B.2-04 report; it is corrected in place there and in the backlog.

### Classification of all authored shaded ground — 652 tiles map-wide

| Material class | Authored surface | Base tile | Tiles | Handling |
| --- | --- | --- | --- | --- |
| **Cobblestone** | `marketPaving`, `alleyCobble` | `floor_04`, `cobble` | **79** | **treated** |
| Cobble-tiled garden path | `gardenPath` | `cobble` | **116** | **excluded** — §8 |
| Brick | `serviceBrick` | `brick` | 372 | preserved; no artwork exists |
| Gravel | `yardGravel` | `ground_debris` | 46 | preserved; no artwork exists |
| Garage / industrial | `garageFloor` | `metal` | 24 | preserved; no artwork exists |
| Grass / garden | `gardenGrass` | `grass` | 15 | preserved |

### Treated cobblestone locations (§10)

| Region | Area | Shaded tiles | Extent |
| --- | --- | --- | --- |
| `marketArcade` | marketSquare | 40 | x9–12, y40–49 |
| `marketPlaza` (the two covered rows) | marketSquare | 24 | x16–21 and x25–30, y35–36 |
| `alley` | arrivalAlley | 15 | x6–8, y58–62 |
| | | **79** | |

Daylight cobblestone is now treated map-wide as well: **929 tiles**, up from
B.2-04's 443, because the treatment is no longer clipped to the market region.

---

## 4. New texture registration (§5)

Registered **alongside** the daylight strip; nothing was replaced.

| key | file | frames |
| --- | --- | --- |
| `tiles.valcendre.v2.cobbleShaded` | `valcendre_shaded_cobble_16x16.png` | 4 |
| `tiles.valcendre.v2.shadeBoundaries` | `valcendre_shade_boundaries_16x16.png` | 64 |
| `tiles.valcendre.v2.shadeCorners` | `valcendre_shade_diagonal_corners_16x16.png` | 16 |

Confirmed loaded in-engine at 64×16, 128×128 and 128×32.

### The material layer

`build-map.mjs` now emits `groundMaterial`: an **invisible appearance layer**
recording each walkable tile's authored surface **base** tile. 2719 tiles, six
distinct values (`cobble`, `brick`, `metal`, `ground_debris`, `grass`,
`floor_04`).

The base tile and not the variant-rolled tile, which matters: `floor_crack` is a
low-probability decorative variant of **four** different surfaces, so recording
the rolled tile made a cracked cobble tile indistinguishable from a cracked
brick tile. §9 describes the visible defect that caused and how it was fixed.

`MapLoader` merges tile flags only from its closed set — `collision`, `cover`,
`propCollision`, `shadowZones` — so the new layer is inert for movement, vision,
cover and concealment by construction. A test asserts it is absent from that
set. Regenerating the map changed **nothing else**: every pre-existing layer is
byte-identical, the object layer is identical, and the dimensions are unchanged.

### The visual / gameplay separation (§4 "Critical separation")

The two states are read from **two different layers on purpose**:

- **material** ← `groundMaterial`
- **visual shade** ← `floor` being `deep_shadow`
- **gameplay concealment** ← `shadowZones`, consulted by nothing in the
  presentation

Tests strip comments from `GroundShade.ts` and `ValcendreV2Scene.ts` and assert
neither mentions `shadowZones`. `GroundShade.ts` imports nothing at all and
mentions no gameplay concept.

---

## 5. Cardinal mask implementation (§6)

`src/art/GroundShade.ts`, Phaser-free, composed once during scene construction.

Bits as the manifest specifies — **N 1, E 2, S 4, W 8** — set when and only when
the neighbour is **daylight cobblestone**. Index `variant * 16 + mask`. The
tests re-derive all sixteen of the manifest's own direction sets and check they
equal their mask numbers, and pin the single-direction masks to literal 1/2/4/8
so a swapped bit assignment cannot pass.

**Neighbour eligibility.** A wall, grass, brick, gravel, garage plate, void
fill, the garden walk while excluded, or any coordinate off the map classifies
as `other` and **leaves its bit clear**. A shaded cobble tile against a wall is
therefore drawn as plain shaded cobble, never as a transition implying paving
that is not there.

**Mask 0 routing.** A shaded cell with mask 0 is drawn from the plain shaded
strip rather than the atlas, so a shaded interior never touches the transition
atlas. Safe because mask 0 is byte-identical to that tile — verified, not
assumed.

### Masks the authored map actually produces

| mask | directions lit | tiles |
| --- | --- | --- |
| 0 | — (plain shaded interior) | 38 |
| 1 | N | 9 |
| 2 | E | 14 |
| 3 | N+E | 2 |
| 4 | S | 11 |
| 6 | E+S | 3 |
| 9 | N+W | 1 |
| 12 | S+W | 1 |
| | **total** | **79** |

Eight of sixteen masks appear, because Valcendre's shade is authored as
axis-aligned rectangles. The other eight are covered synthetically in
`tests/ground-shade.test.ts`, and the art for them is in place if a future
layout needs them.

---

## 6. Diagonal overlay implementation (§7)

Index `variant * 4 + corner`, corners NW 0, NE 1, SE 2, SW 3 — the manifest's
own order. An overlay is emitted only when all three conditions hold: the centre
is shaded cobble, **both** cardinals adjoining that corner are shaded cobble,
and the diagonal is daylight cobble. Mere existence of a diagonal neighbour is
never sufficient; all four corners are tested across all eight combinations of
the three conditions.

Each corner gets its own tilemap layer, so several independent overlays can land
on one cell. Depths 0.55–0.58: above the ground tiles, below the architecture's
cast shade, so a corner relief is part of the ground and can never cover a
building. Alignment is exact — the overlay is written to the same tile cell as
its base, by the same loop.

**Zero overlays are drawn in Valcendre today, and that is correct, not a bug.**
An overlay needs a concave corner, and axis-aligned rectangles never produce
one: at a rectangle's corner two cardinals are lit, and one step inward the
diagonal is shaded. Verified independently with a standalone computation over
the map as well as in-engine. A test records the zero with that reasoning, so if
a future layout unions two shade stamps into an L or T the count rises and the
expectation fails loudly rather than silently.

---

## 7. Renderer architecture (§8, §14)

One programmatic tilemap, four tilesets at disjoint global-id bases, **five
static layers**:

| layer | depth | contents |
| --- | --- | --- |
| `valcendre_v2_paving` | 0.5 | daylight (gid 0–3), shaded (4–7), cardinal transitions (8–71) |
| `valcendre_v2_shade_corner_northwest` | 0.55 | corner overlays (gid 72–87) |
| …`_northeast` | 0.56 | |
| …`_southeast` | 0.57 | |
| …`_southwest` | 0.58 | |

Mixing three tilesets in the ground layer means daylight, shaded and transition
tiles coexist without a second pass. Composition runs once in `build()`; no
neighbour relationship is recomputed per frame, and there is no per-tile sprite.

### Measured performance

Camera driven across the arcade boundary at 1.5 px/frame for 5 seconds,
`tools/b205c2-perf-probe.mjs`:

| | |
| --- | --- |
| frames sampled | 301 |
| mean / median frame time | 16.66 ms / 16.66 ms |
| p95 / max frame time | 16.67 ms / **16.68 ms** |
| actual FPS | **59.9** |
| display-list objects | 195 |
| textures loaded | 126 |

Flat 60 fps with 0.02 ms spread across the whole scroll — vsync-capped, so this
shows the absence of hitching rather than headroom. Structurally the cost is
five static tilemap layers and 1008 `putTileAt` calls at construction.

| ground composition | count |
| --- | --- |
| daylight cells | 929 |
| plain shaded cells | 38 |
| cardinal boundary cells | 41 |
| overlay cells / overlays drawn | 0 / 0 |
| **total ground tiles painted** | **1008** |

---

## 8. The garden walk — an open decision, defaulted conservatively

`gardenPath` (116 tiles, x6–11 y3–22) is **named** a garden path but **paints**
`cobble` — the same base tile as `alleyCobble`. §1 says the artwork is "for
cobblestone surfaces only"; §4's table says "Grass / garden → preserve existing
treatment". Those point opposite ways.

**Left excluded** (`SHADE_GARDEN_PATH = false`), the conservative reading,
because it is 116 tiles — more than all the treated cobblestone put together —
and it is the route the level notes call "the safer route, and reads that way".
`01-after-bakery-garden.png` shows it unchanged.

My recommendation is still to include it: its rendered material is cobblestone,
and excluding it leaves the garden walk the only cobbled surface in Valcendre
still on the flat `deep_shadow` fill. Flipping the constant and regenerating
nothing else is the whole change. A test asserts the exclusion holds while the
flag is false.

---

## 9. Two defects found and fixed during integration

### 9a. Five flat dark holes in the arcade

The first working build left five tiles of flat `deep_shadow` in the middle of
the new shaded paving, at **(12,42), (11,43), (11,45), (11,47), (9,48)** —
clearly visible as textureless brown squares. Cause: `groundMaterial` initially
recorded the *variant-rolled* floor tile, and those five had rolled
`floor_crack`, which is not one of the four approved cobble variants.

Including `floor_crack` in the cobblestone set would have been wrong — it is
also a variant of `serviceBrick`, `yardGravel` and `roadDirt`, so cobblestone
would have been painted over brick and gravel. Fixed at the root instead:
`groundMaterial` now records the surface's **base** tile, so all `alleyCobble`
tiles read `cobble` whatever variant the floor rolled, and all `serviceBrick`
tiles read `brick`. The holes are gone and no unsupported material is touched.
A test asserts `floor_crack` never appears in the material layer.

### 9b. Harness faults, not game faults

The capture harness initially reported three false problems — it compared
Phaser's `frameTotal` (which counts the implicit `__BASE` frame) against the
tile count, and it tried to cross the arcade boundary by pushing east, which the
arcade's stone pillars block. Both fixed in the tool. A third flake, the V1
beat failing after two minutes of crouching and wandering, was fixed by running
that beat from a fresh load.

---

## 10. Before-and-after captures (§9, §13)

`docs/art-integration/screenshots/b205c2/` — 22 captures per pass at native
480×270, debug overlays off (`debugHitboxes: false` recorded), **identical
camera coordinates in both passes** (asserted: the scroll table is equal across
telemetry files).

| file | kind | shows |
| --- | --- | --- |
| `01-{before,after}-market-daylight.png` | STAGED | lit paving away from a boundary |
| `01-{before,after}-arcade-transition.png` | STAGED | the long straight light-to-shade edge at x12\|x13 |
| `01-{before,after}-arcade-north-end.png` / `-south-end` | STAGED | the two outside corners |
| `01-{before,after}-covered-rows.png` / `-east` | STAGED | shaded bands inside lit paving — N and S masks |
| `01-{before,after}-alley-shade.png` | STAGED | shaded cobble in an L against lit cobble |
| `01-{before,after}-bakery-garden.png` | STAGED | must be **unchanged** — grass and the garden walk are both excluded |
| `01-{before,after}-full-market.png` | STAGED | wide market view |
| `02-{before,after}-tempest-in-shade-lookout-in-light.png` | STAGED | both actors, opposite sides of one boundary |
| `03-{before,after}-actors-either-side-of-the-edge.png` | STAGED | last shaded tile / first lit tile |
| `04-{before,after}-played-walked-into-arcade-shade.png` | PLAYED | real input into the shade |
| `05-{before,after}-played-crouched-in-shade.png` | PLAYED | crouched by a real `C` press |
| `06-{before,after}-played-crossed-into-light.png` | PLAYED | real-input crossing out of the shade |
| `07-{before,after}-played-mission-progress.png` | PLAYED | **V1 taken by a real `E` press** |
| `08-{before,after}-scroll-00..06.png` | STAGED | camera moved across the edge at sub-tile offsets |
| `09-compare-*.png` | — | six side-by-side before/after pairs |

### What the captures show

| §9 / §13 check | result |
| --- | --- |
| no missing tiles | ✅ the arcade, both covered rows and the alley are fully covered |
| no texture-index errors | ✅ every atlas frame resolves; the engine frame audit passes |
| **no visible 16-pixel grid at the boundary** | ✅ the transition is the artwork's own 2–4 px inner band; stone coursing continues unbroken across it |
| no diagonal overlay misalignment | n/a — no overlay is eligible anywhere in this map (§6) |
| no animation or camera-scrolling artifacts | ✅ seven sub-tile scroll frames plus the 301-frame probe |
| no change to collision or concealment | ✅ measured, §11 |
| Tempest and Lookouts readable | ✅ `02-after-…` — both read clearly on shaded and lit cobble |
| bakery/garden unchanged | ✅ by design, the exclusion |

The clearest pair is `09-compare-arcade-transition.png`: the arcade goes from a
flat untextured brown band to shaded cobblestone whose coursing runs continuously
into the lit square.

---

## 11. Gameplay regression findings (§11)

Measured in-engine in **both** passes, from the same probes:

| | before | after |
| --- | --- | --- |
| grid tiles with `collides` | 4950 | **4950** |
| grid tiles with `shadow` | 652 | **652** |
| grid tiles with `blocksSight` | 4870 | **4870** |
| grid tiles with `lowCover` | 80 | **80** |
| enemies | 7 | 7 |

Concealment at ten representative positions — **all ten identical**:

| tile | before | after |
| --- | --- | --- |
| (11,45) arcade interior | shadow | shadow |
| (11,40) arcade north | shadow | shadow |
| (24,44) lit market | — | — |
| (13,45) first lit tile east of the arcade | — | — |
| (18,35) covered row | shadow | shadow |
| (18,34) lit, north of the covered row | — | — |
| (7,60) alley | shadow | shadow |
| (14,60) alley, lit | — | — |
| (8,10) garden walk (shaded, excluded from the artwork) | shadow | shadow |
| (30,47) V1 evidence tile | — | — |

The last two matter most: the garden walk is still concealing while being
visually untreated, and the evidence tile is still non-concealing while sitting
on new paving — the visual and gameplay states are demonstrably independent.

Driven by real input in both passes: walked into the arcade shade (engine agrees
`inShadow=true`), **crouched there with a real `C` press** and stayed concealed,
walked out into the light with the shadow flag flipping, and **took V1 with a
real `E` press**.

Unchanged and asserted: player speeds, body box, detection and suspicion
constants, vision occlusion, patrol routes, cover, bullet collision, mission
objectives, garage key and doors, saves, market stall rendering (39/39), and
fountain and architecture placement.

---

## 12. Tests (§12)

`tests/shaded-cobble-integration.test.ts` (27) and `tests/ground-shade.test.ts`
(41). Full suite **444 passing** across 17 files, up from 417; one pre-existing
assertion widened, none removed.

| §12 item | where |
| --- | --- |
| 1. texture paths and dimensions | registry entries, PNG headers on disk, and checksums against both manifests |
| 2. atlas registration | frame counts 4 / 64 / 16; disjoint tileset gid bases |
| 3. cardinal mask calculation | all 16 masks; manifest's own direction sets re-derived; literal bit pins |
| 4. diagonal overlay conditions | 4 corners × 8 condition combinations |
| 5. source variant preservation | shaded variant *n* ↔ daylight variant *n*; every cell on `pavingVariant` |
| 6. mask 0 parity | **pixel comparison**, 0 differing pixels × 4 variants |
| 7. boundary handling at map edges | out-of-bounds is `other`; lone tile, map corner, off-map diagonal |
| 8. no shading on non-cobblestone | every non-cobble tile on the real map asserted unpainted (1500+ checked) |
| 9. no tile-coordinate changes | map dimensions and the evidence object position |
| 10. no collision changes | collision 4769, cover 92, propCollision 83 |
| 11. no `shadowZones` changes | 652 tiles; presentation code asserted never to read it |
| 12. no mission or patrol changes | existing mission/patrol/encounter suites unchanged and passing |
| 13. reconstruction after reload | `composeRegion` pure and equal on re-run; variant a pure function of coordinates |
| 14. no B.2-05C-1 regression | `tests/stall-occlusion.test.ts` 39/39 |

---

## 13. Remaining limitations

1. **Eight of sixteen cardinal masks are unexercised** by this map, because the
   shade is authored as axis-aligned rectangles. Not a defect; recorded so the
   coverage claim is honest.

2. **No diagonal overlay is drawn anywhere.** Same cause (§6). The path is
   implemented and tested, just not reachable from the current authoring.

3. **The garden walk is untreated** — 116 shaded cobble-tiled tiles still on the
   flat `deep_shadow` fill, pending the §8 ruling. This is now the largest
   remaining visual inconsistency on any cobbled surface.

4. **372 shaded brick tiles, 46 gravel, 24 garage plate, 15 grass** keep their
   existing treatment, because no approved artwork exists for them. By area this
   is the biggest remaining inconsistency in Valcendre overall — the whole upper
   lane garden branch is brick.

5. **The north road gained daylight cobblestone.** `roadDirt` (northRoad,
   x60–64 y0–5, 30 daylight tiles) is authored as a dirt road but its base tile
   is `cobble`, so the material layer cannot distinguish it from `alleyCobble`.
   It now renders approved daylight cobble instead of legacy cobble — a
   like-for-like material upgrade on 30 tiles outside the mission route, flagged
   rather than hidden. Giving `roadDirt` its own base tile would separate it.

6. **The decorative `floor_crack` motif is lost on treated cobble.** The
   approved strip has four variants and no cracked variant, so a tile that
   rolled `floor_crack` now draws a plain approved variant. 5 such tiles were in
   the shaded arcade (§9a) and more are in the daylight areas. The alternative
   was leaving holes.

7. **A single console 404 in both passes.** Previously traced to the favicon,
   not an asset; every registered texture was confirmed present in-engine.

---

## 14. Issue categorisation (§15)

### ART AGENT — genuine missing source artwork

| id | gap | tiles | note |
| --- | --- | --- | --- |
| **ART-11** | shaded **brick** treatment for `serviceBrick` | 372 | the largest remaining gap by area |
| **ART-12** | shaded **gravel** for `yardGravel` | 46 | |
| **ART-13** | shaded **garage plate** for `garageFloor` | 24 | |
| **ART-14** | a cracked-paving variant for the daylight and shaded cobble strips | ~40 map-wide | would restore the `floor_crack` motif on treated cobble (§13.6). Low priority: a few pixels at native scale. |

ART-7, ART-8, ART-9 and ART-10 from the earlier report are **closed** — the
artwork and its manifests arrived and are integrated.

No approved artwork is suspected of being wrong. No authored-map composition
problem was found: every shade shape in the level resolves to a correct atlas
selection.

### CODING AGENT

| id | item |
| --- | --- |
| **CODE-5** | **closed** — the material data is now exported as `groundMaterial`. |
| **CODE-6** | **closed** — the renderer is wired and verified in-engine. |
| **CODE-7** | **open** — rule on the garden walk (§8). One constant. |
| **CODE-8** | **closed** — the stale 496 figure is corrected in the B.2-04 report and the backlog. |
| **CODE-9** | *new, low priority* — give `roadDirt` a base tile of its own so the north road can be excluded from cobblestone treatment (§13.5). |

---

## 15. Files changed

| file | change |
| --- | --- |
| `tools/build-map.mjs` | emits the invisible `groundMaterial` appearance layer, recording each walkable tile's authored surface base |
| `public/assets/maps/village.json` | regenerated — one new layer; every other layer, the objects and the dimensions byte-identical |
| `src/art/AssetRegistry.ts` | three new texture entries, alongside the daylight strip |
| `src/art/ValcendreV2.ts` | texture keys, `COBBLE_MATERIAL_TILES`, `SHADED_FLOOR_TILE`, `SHADE_GARDEN_PATH`, `SHADE_EXCLUDED_REGIONS`, corner depths |
| `src/art/ValcendreV2Scene.ts` | `buildPaving` composes the ground through `GroundShade` into five static layers; teardown releases them |
| `tests/stall-occlusion.test.ts` | one assertion widened: the presentation now has two `putTileAt` sites, not one |

Added: `public/assets/environments/valcendre_{shaded_cobble,shade_boundaries,shade_diagonal_corners}_16x16.png`,
`art-source/…/08_shade_b205a/` (the archived package),
`tests/shaded-cobble-integration.test.ts`,
`tools/b205c2-shade-capture.mjs`, `tools/b205c2-perf-probe.mjs`,
`docs/art-integration/screenshots/b205c2/`.

`src/art/GroundShade.ts` is unchanged from the baseline commit — the selection
logic written against the manifests before the art arrived needed no correction
once it did.

---

## 16. Verification (§16)

```
npx tsc --noEmit        clean
npx vitest run          17 files, 444 passed, 0 failed
npm run build           succeeds
node tools/build-map.mjs  green; all areas reachable, locked-door check passes
```

Production build verified in a real browser (Chromium, SwiftShader, native
480×270): textures load at their declared sizes, the ground composes to 1008
tiles, 60 fps across the boundary, and the mission beat completes on real input.

## 17. Completion requirements (§17)

| requirement | status |
| --- | --- |
| approved shaded paving renders in the engine | ✅ |
| all eligible cobblestone areas use appropriate materials | ✅ 79 shaded + 929 daylight |
| cardinal boundaries work correctly | ✅ 8 masks exercised, 16 tested |
| diagonal overlays work correctly | ✅ implemented and tested; 0 eligible in this map (§6) |
| narrow and irregular shade areas visually coherent | ✅ arcade, both covered rows, alley L |
| no unsupported material overwritten | ✅ asserted over the whole map |
| Tempest and Lookouts remain readable | ✅ |
| all gameplay concealment values unchanged | ✅ 4 grid totals and 10 probes identical |
| market stall correction intact | ✅ 39/39 |
| automated tests and production build pass | ✅ 444 tests |
| real engine captures document the result | ✅ 22 per pass + 6 comparisons |
| remaining issues categorised | ✅ §13, §14 |
