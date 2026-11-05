# Valcendre shaded cobblestone and boundary integration — Phase B.2-05C-2

**Baseline commit:** `7554cd6` — *B.2-05C-1 follow-up: verify against the B.2-05B contract, measure the real occlusion*
**Date:** 2026-11-05

> ## Status: PARTIALLY BLOCKED — the approved artwork is not in the repository
>
> Three of the four source files §3 names do not exist on this machine. Nothing
> was painted, generated or substituted. What could be completed without them
> was completed; what depends on them is listed in §9 and left undone.
>
> | §3 asset | expected | present |
> | --- | --- | --- |
> | `valcendre_proof_cobble_16x16.png` (B.2-03A, daylight) | 64×16, 4 tiles | **yes** — `14e9b5c5…4349ee` |
> | `valcendre_shaded_cobble_16x16.png` (B.2-05A-1) | 64×16, 4 tiles | **no** |
> | `valcendre_shade_boundaries_16x16.png` (B.2-05A-2) | 128×128, 8×8 = 64 | **no** |
> | `valcendre_shade_diagonal_corners_16x16.png` (B.2-05A-2) | 128×32, 8×2 = 16 | **no** |
>
> Searched: the whole repository, `art-source/` (including the
> `TEMPEST_VALCENDRE_ART_PACKAGE_v1` tree and its `07_occlusion_b205b` folder),
> `public/assets/tmp/`, `~/Downloads`, `$HOME` and `/tmp` to depth 3, plus any
> archive modified since 2026-11-04. No B.2-05A-1 or B.2-05A-2 manifest or
> validation report either, so the checksums §3 and §15 require could not be
> verified and the §6 "mask 0 is pixel-identical to the shaded tile" check could
> not be run against real pixels.

---

## 1. Preflight (§2)

| check | result |
| --- | --- |
| current main commit | `7554cd6` |
| B.2-05C-1 stall correction present | yes — `1de335a` and `7554cd6` |
| stall rendering tests still pass | **39/39** in `tests/stall-occlusion.test.ts` |
| B.2-04 texture registration inspected | `src/art/AssetRegistry.ts` → `VALCENDRE_V2`; cobble registered as `tiles.valcendre.v2.cobble`, 64×16, 4 frames |
| map rendering inspected | `src/art/ValcendreV2Scene.ts` → `buildPaving()`, a programmatic blank tilemap layer at depth 0.5 |
| approved shaded manifests read | **not possible — absent** |

The stall correction was not modified. Its tests are re-run as part of the full
suite below and still pass.

---

## 2. Material audit (§4)

`tools/b205c2-ground-audit.mjs`, output in `b205c2-ground-audit.json`.

### Why `shadowZones` and the floor layer are both the wrong source

`tools/build-map.mjs` holds the authored material per tile in `surfaceOf`,
paints the floor from it, and **then** stamps the shadow pass, which overwrites
the floor tile with `shadowFloor`. `shadowFloor` and `voidFill` are **both**
`deep_shadow`. So in the shipped `village.json`:

- a shaded tile no longer records what material is under it, and
- every **non-walkable** tile carries the same `deep_shadow` floor tile as a
  genuine shadow zone.

The authored data in `tools/map-data-valcendre.mjs` is therefore the only source
of truth for material. The audit recomputes `surfaceOf` with the same precedence
the build uses (regions → obstructions clear → doors backfill → overrides) and
cross-checks every conclusion against the shipped map:

| cross-check | result |
| --- | --- |
| recomputed carved walkability vs the `collision` layer | **0 mismatches** |
| recomputed shade vs the `shadowZones` layer | **0 mismatches** |
| carved ground that is *also* solid via `cover`/`propCollision` | 175 tiles (expected; stamped on top of carved floor, still renders ground beneath) |

### The "~496 tiles" figure is not 496 tiles of shaded ground

| | tiles |
| --- | --- |
| `deep_shadow` floor tiles inside the B.2-04 market region | 496 |
| …of those, on **walkable ground** (real shaded ground) | **64** |
| …of those, on **non-walkable `voidFill`** (building interiors, not ground at all) | **432** |

B.2-04's own limitation note — mine — counted `deep_shadow` floor tiles and
reported them as unconverted ground. 87% of that number is the dark fill behind
building walls. It is not paving, it is not walkable, and it must never receive
cobblestone artwork.

### Classification of all authored shaded ground, map-wide

**652** tiles of authored shaded walkable ground exist in Valcendre.

| Material class | Authored surface | Tiles | Required handling |
| --- | --- | --- | --- |
| **Cobblestone** | `marketPaving`, `alleyCobble` | **79** | **eligible** for approved shaded treatment |
| Cobble-tiled garden path | `gardenPath` | **116** | **decision required** — see below |
| Brick | `serviceBrick` | **372** | preserve; no matching artwork exists |
| Gravel | `yardGravel` | 46 | preserve; no matching artwork exists |
| Garage / industrial | `garageFloor` | 24 | preserve; no matching artwork exists |
| Grass / garden | `gardenGrass` | 15 | preserve existing treatment |

### Eligible cobblestone locations

| Region | Area | Surface | Tiles | Extent |
| --- | --- | --- | --- | --- |
| `marketArcade` | marketSquare | `alleyCobble` | 40 | x9–12, y40–49 |
| `marketPlaza` | marketSquare | `marketPaving` | 24 | x16–30, y35–36 (the two covered market rows) |
| `alley` | arrivalAlley | `alleyCobble` | 15 | x6–8, y58–62 |
| | | **total** | **79** | |

The market arcade is the §9 controlled-integration region: 40 tiles of shaded
cobble directly abutting lit `marketPaving` across a pillar line, with straight
edges, two outside corners and a narrow colonnade — every boundary shape the
brief asks to verify, in one place.

### The one open decision

`gardenPath` (116 tiles, x6–11 y3–22, the garden walk) is **named** a garden
path but **paints** `cobble` and `floor_01` — the same tiles as `alleyCobble`.
§1 says the artwork is "for cobblestone surfaces only"; §4's table says
"Grass / garden → preserve existing treatment". Those point opposite ways here.

Not decided unilaterally, because it is 116 tiles — 59% more than all the
unambiguous cobblestone put together — and it is the stealth route the design
notes call "the safer route, and reads that way". Treated as **not eligible**
pending a ruling, so the conservative reading wins by default.

Recommendation: include it. Its rendered material is cobblestone, and excluding
it would leave the garden walk the only cobbled surface in Valcendre still using
the flat `deep_shadow` fill.

### The visual / gameplay separation (§4 "Critical separation")

Honoured structurally, not just by intention: the selection module
(`src/art/GroundShade.ts`) imports nothing, mentions no gameplay concept, and a
test greps it for `shadowZones`, `suspicion`, `conceal`, `detect`, `vision`,
`player`, `enemy`, `crouch` and `Phaser` and fails if any appears. Concealment
continues to come from the `shadowZones` layer alone, and nothing reads the new
artwork or its palette to decide stealth.

---

## 3. Boundary selection implementation (§6, §7, §8)

`src/art/GroundShade.ts` — **Phaser-independent**, as §8 prefers, which is what
makes the exhaustive tests below possible. It decides which approved atlas tile
belongs on which cell and nothing else: no texture, no display object, no scene,
no actor, no per-frame work.

### Cardinal masks

Bits exactly as specified — north 1, east 2, south 4, west 8 — set when, and
only when, the neighbour in that direction is **daylight cobblestone**.

```
tileIndex = sourceVariant * 16 + boundaryMask      (8×8 atlas = 4 × 16)
```

`cardinalMask()` returns 0 for any cell that is not itself shaded cobblestone,
because the mask is meaningless there.

### Neighbour eligibility (§6)

A wall, grass tile, brick, gravel, garage plate, void fill, or any coordinate
off the edge of the map classifies as `other` and **leaves its bit clear**. So
a shaded cobble tile against a wall is drawn as plain shaded cobble, not as a
transition implying paving that is not there. Tested against each unsupported
material individually and at map edges and corners.

### Diagonal overlays

```
tileIndex = sourceVariant * 4 + cornerIndex        (8×2 atlas = 4 × 4)
cornerIndex: NW 0, NE 1, SE 2, SW 3
```

An overlay is emitted only when all three conditions hold: the centre is shaded
cobble, **both** cardinals adjoining that corner are shaded cobble, and the
diagonal is daylight cobble. Mere existence of a diagonal neighbour is never
sufficient — tested across all eight combinations of the three conditions, for
all four corners (32 cases). Several corners may qualify on one cell and each is
an independent overlay; the all-four case is tested.

### Mask 0 routing

§6 asks that mask 0 be pixel-identical to the B.2-05A-1 shaded tile. Rather than
rely on that, a shaded cell with mask 0 is routed to the **plain shaded strip**
at `frame = variant`, so the interior of a shaded region never touches the
transition atlas at all. If the approved mask-0 tiles do differ from the plain
strip, the interior is unaffected. The pixel comparison itself is in §9's
blocked list — it needs the files.

### Variant preservation (§5)

Each cell keeps its authored variant: the daylight frame, the shaded frame and
both atlas indices are all derived from the same `variant(tx,ty)`. Variant 0
maps to shaded variant 0 and so on, by construction. An out-of-range variant
throws rather than wrapping to the wrong tile. Overlay frames resolve on the
**centre** cell's variant, not the diagonal's.

Determinism: the existing `pavingVariant(tx,ty) = (tx*3 + ty*5) % 4` is a pure
function of tile coordinates, so it is already stable across save, load and
refresh; `composeRegion` is likewise pure and returns identical output on
repeated runs (tested).

### Composition cost (§14)

`composeRegion()` walks a region once and returns one record per owned cell, for
writing straight into a tilemap layer during construction — no neighbour
relationship is recomputed per frame. `summarise()` reports the counts the
performance budget needs: daylight cells, plain shaded cells, cells needing the
cardinal atlas, and overlay cells. On the 79 eligible tiles the boundary and
overlay populations are small enough that the existing tilemap-layer approach
used for B.2-04 paving is sufficient; no new sprite-per-tile scheme is needed.
Measured frame-time figures are in §9's blocked list — they need the renderer,
which needs the art.

---

## 4. Tests

`tests/ground-shade.test.ts`, **41 assertions**, all passing:

| §12 item | covered |
| --- | --- |
| 3. cardinal mask calculation | all **16** masks, each verified to equal its own value; single-direction masks pinned to literal 1/2/4/8 so a swapped bit assignment cannot pass |
| 4. diagonal overlay conditions | all 4 corners × all 8 condition combinations; plus "diagonal exists but a cardinal is daylight" negative cases |
| 5. source variant preservation | every cell on its own variant; overlays on the centre's variant; out-of-range variant throws |
| 6. mask 0 parity | mask-0 cells routed to the plain shaded strip at `frame = variant`, so parity is structural |
| 7. map-edge boundary handling | out-of-bounds classified `other`; lone tile, map corner, off-map diagonal |
| 8. no shading on non-cobblestone | each unsupported material individually; `composeCell` returns `null`; `composeRegion` omits them |
| — authored shapes from §10 | long straight edge, L-knee, T-pinch, narrow passage, stair-step, daylight island, mask-15 island |
| — §4 separation | module names no gameplay concept and imports nothing |

Mutation-checked rather than assumed: swapping the east and west bits fails
three tests; the earlier version failed only one, and was strengthened.

§12 items 1, 2, 13 and 14 and the remaining regression items are in §9 — they
need registered textures or a running scene.

Full suite: **417 tests passing** across 16 files (376 before, 41 added, 0
changed). `npx tsc --noEmit` clean. `npm run build` succeeds.

---

## 5. What was deliberately not changed

No texture was registered, no scene was touched, no map was regenerated, and
`src/art/ValcendreV2Scene.ts` is byte-identical to its B.2-05C-1 state.

Registering a texture whose file is absent would 404 at load and leave a missing
texture in the scene, and §9 requires the controlled region to be verified in
the engine before any wider application. Both gates need the artwork, so the
renderer is left for the change that can actually pass them.

| Preserved per §11 | status |
| --- | --- |
| player speed, crouch, sprint | untouched |
| detection, suspicion, vision occlusion | untouched |
| guard patrol routes, cover, bullet collision | untouched |
| mission objectives, garage key, doors, checkpoints, saves | untouched |
| market stall rendering | untouched — 39/39 tests pass |
| fountain and architecture placement | untouched |
| `shadowZones` | untouched — audit confirms 0 mismatches |
| map dimensions, encounter geometry, tile coordinates | untouched |

---

## 6. An architectural prerequisite found by the audit

Before the renderer can select shaded cobblestone at runtime it needs to know
each tile's **material**, and the shipped map no longer carries it: the shadow
pass overwrites the floor tile, so a shaded cobble tile and a shaded brick tile
are indistinguishable in `village.json`.

Two ways forward, for the reviewer to pick:

1. **Emit the authored material as an extra appearance layer** (recommended).
   `build-map.mjs` already has `surfaceOf`; writing it out as e.g.
   `groundMaterial` is additive. `MapLoader` merges gameplay flags only from
   `GAMEPLAY_LAYERS` (`collision`, `cover`, `propCollision`, `shadowZones`), so a
   new appearance layer is inert for gameplay by construction. Costs one
   regenerated map.
2. **Stop destroying the data**: have the shadow pass keep the material tile and
   let the renderer apply shade, rather than replacing the floor tile with
   `deep_shadow`. Cleaner long-term, but it changes what the legacy build looks
   like in `?art=legacy`, so it is a bigger behavioural change than this phase
   should make.

Either is a small change, but both touch generated map output, so neither was
done speculatively while the artwork that justifies them is absent.

---

## 7. Screenshots

**None taken, and none should be inferred.** §9 and §13 both require captures of
the new shaded paving in the real engine; with no artwork there is nothing new
to capture, and a before/after pair where both halves are the current build
would be misleading. The existing B.2-04 and B.2-05C-1 captures already document
the current market appearance.

---

## 8. Issue categorisation (§15)

### ART AGENT — missing source artwork, blocking

| id | asset | expected | note |
| --- | --- | --- | --- |
| **ART-7** | `valcendre_shaded_cobble_16x16.png` | 64×16, four 16×16 tiles, variant order matching B.2-03A | B.2-05A-1. Without it there is no shaded paving to draw. |
| **ART-8** | `valcendre_shade_boundaries_16x16.png` | 128×128, 8×8 atlas, 64 tiles, `variant*16 + mask` | B.2-05A-2 cardinal transitions. |
| **ART-9** | `valcendre_shade_diagonal_corners_16x16.png` | 128×32, 8×2 atlas, 16 transparent overlays, binary alpha, `variant*4 + corner` | B.2-05A-2 diagonal corners. |
| **ART-10** | B.2-05A-1 / B.2-05A-2 manifests + validation reports with SHA-256 | — | §3 and §15 require checksum verification; §6 requires the mask-0 parity check. Neither is possible without them. |

Also still open from B.2-04, and now **re-scoped by this audit** — the earlier
request overstated the need by a wide margin:

| id | revised |
| --- | --- |
| **ART-1** (shaded paving) | superseded by ART-7/8/9. The real eligible population is **79 tiles**, not ~496 — and 372 further shaded tiles are **brick**, which is a separate request if it is wanted at all. |

### ART AGENT — material coverage, not blocking this phase

| id | gap | tiles |
| --- | --- | --- |
| **ART-11** | shaded **brick** treatment for `serviceBrick` | 372 |
| **ART-12** | shaded **gravel** for `yardGravel` | 46 |
| **ART-13** | shaded **garage plate** for `garageFloor` | 24 |

These are the largest remaining visual inconsistency in Valcendre by area — the
whole upper-lane garden branch is brick. Left untouched per §1 and §10.

### CODING AGENT — this repository's own work

| id | item |
| --- | --- |
| **CODE-5** | the material data is destroyed by the shadow pass; §6 above, with two concrete options. Prerequisite for the renderer. |
| **CODE-6** | wire `GroundShade` into `ValcendreV2Scene` behind the existing `ART_MODE` switch, write the composed cells into a tilemap layer, and run the §9 controlled verification in the market arcade. Blocked on ART-7/8/9. |
| **CODE-7** | decide `gardenPath` eligibility (§2) — a one-line classification change either way. |
| **CODE-8** | B.2-04's limitation note should be corrected in place: it reports 496 unconverted shaded tiles, of which 432 are non-walkable void fill. Done in this document; the older file still carries the original figure. |

No authored-map composition problem was found. No approved artwork is suspected
of being wrong — none of it could be inspected.

---

## 9. Blocked on the missing artwork

Everything below is untouched, not attempted, and not claimed:

| § | requirement |
| --- | --- |
| 3 | verify source checksums |
| 5 | register the shaded strip; apply it to eligible areas |
| 6 | verify mask 0 is pixel-identical to the approved shaded tile |
| 9 | controlled first integration in the market arcade, and its 7 captures |
| 10 | extend across the remaining eligible areas; inspect the special review locations |
| 11 | before/after concealment comparison at representative positions **in the engine** (the static invariants are covered; the runtime comparison is not) |
| 12 | items 1, 2, 13, 14 — texture paths and dimensions, atlas registration, reconstruction after scene reload, in-engine stall regression |
| 13 | all 10 browser captures |
| 14 | measured ground-composition cost, boundary/overlay cell counts in the real map, texture count, scrolling stability |
| 15 | approved art source checksums; before/after screenshots |
| 17 | "approved shaded paving renders in the engine" and every item that follows from it |

When ART-7/8/9/10 land, the remaining work is: resolve CODE-5, register three
textures, wire the composed cells into a tilemap layer, run the §9 arcade
verification, then extend to the other eligible regions. The selection logic
they will use is already written and exhaustively tested.

---

## 10. Verification

```
npx tsc --noEmit        clean
npx vitest run          16 files, 417 passed, 0 failed
npm run build           succeeds
node tools/build-map.mjs  green, map unchanged
```

`tests/stall-occlusion.test.ts` 39/39 — the B.2-05C-1 correction is intact.

No browser verification was performed, because nothing user-visible changed.
