# TEMPEST B.2-03A — validation results

**Package:** `TEMPEST_B2-03A_Architecture_Proof`
**Palette:** `valcendre_palette.json` schema 2.0, 53 environment colours
**Date:** 2026-11-04

Reproduce with:

```bash
python3 -I art-source/TEMPEST_B2-03A_Architecture_Proof/author_proof.py     # draw
python3 -I art-source/TEMPEST_B2-03A_Architecture_Proof/validate_proof.py   # check + assemble
python3 -I art-source/TEMPEST_B2-03A_Architecture_Proof/make_manifest.py    # manifest
```

Machine-readable results: [`validation_results.json`](validation_results.json).

---

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | Exact dimensions and grid alignment | **PASS** |
| 2 | Unique colour values and palette membership | **PASS** |
| 3 | Binary-alpha validation | **PASS** |
| 4 | Cobblestone seamless-repeat testing | **PASS** |
| 5 | Distinctness of ground variants | **PASS** |
| 6 | Wall horizontal and vertical seam testing | **PASS** |
| 7 | All four wall-corner connections | **PASS** |
| 8 | Roof plane, ridge, eave and corner assembly | **PASS** |
| 9 | Window and door alignment | **PASS** |
| 10 | Full building assembled exclusively from exported assets | **PASS** |
| 11 | Native-resolution readability | **PASS** |
| 12 | Integer-scaled pixel-integrity inspection | **PASS** |

---

## 1. Dimensions and grid alignment

| File | Dimensions | Tile | Atlas |
| --- | --- | --- | --- |
| `valcendre_proof_cobble_16x16.png` | 64 × 16 | 16 × 16 | 4 × 1 |
| `valcendre_proof_architecture_16x16.png` | 128 × 64 | 16 × 16 | 8 × 4 = 32 tiles |
| `valcendre_proof_window_32x32.png` | 32 × 32 | component | spans 2 × 2 tiles |
| `valcendre_proof_door_16x32.png` | 16 × 32 | component | spans 1 × 2 tiles |

Every dimension is an exact multiple of 16.

## 2. Palette membership

**27 of the 53 approved environment colours used. Zero off-palette values.**

Colours are looked up by ID from `valcendre_palette.json` at authoring time —
no hex literal appears in `author_proof.py` — so a tile cannot drift off
palette, and an unknown legend character raises instead of inventing a colour.

```
iron_0 iron_1 iron_2
limestone_0 limestone_1 limestone_2 limestone_3 limestone_4
outline_soft
paving_0 paving_1 paving_2 paving_3
plaster_1 plaster_2
shutter_0 shutter_1 shutter_2 shutter_3
slate_0 slate_1 slate_2 slate_3 slate_4
wood_0 wood_2 wood_3
```

The 26 unused IDs are the material ramps this task does not cover — terracotta,
vegetation, skin, clothing, accents, `ink`, `cast_neutral`, `plaster_0`,
`wood_1`, `iron_3`. No palette revision is proposed.

## 3. Binary alpha

**Zero partial-alpha pixels across all four PNGs.**

| File | Partial alpha | Transparent |
| --- | --- | --- |
| cobble | 0 | 0 — fully opaque ground |
| architecture atlas | 0 | 640 |
| window | 0 | 0 — fully opaque |
| door | 0 | 0 — fully opaque |

The atlas's 640 transparent pixels are exactly the three structural-shadow
overlays (indices 13–15), which are intended to be mostly transparent:
768 total − 128 opaque = 640. All 29 other tiles are fully opaque. No
background colour is baked into any transparent region.

## 4. Cobblestone seamless repeat

**All 16 ordered pairs of the four variants tested in both axes: 0 mismatches.**

The test is specific about what a seam is: a tile boundary fails when a grout
pixel (`paving_1`) or a crack pixel (`paving_0`) lands on it outside the
intended joint rows, because that is what draws a visible 16 px lattice line.
Two differently-shaded *stones* meeting across a boundary is normal paving and
is not a failure.

Construction:

- Horizontal joints at y2, y8, y13 → stacked spacing 6, 5, 5, 6, 5, 5 and
  **never a joint on the 16 px boundary**.
- Every course keeps stone, never a joint, at x0 and x15.
- One wrap course (y14, y15 + y0, y1 of the tile below) uses a single shared
  joint set and a single shared tone in all four variants, which is what makes
  the tiles freely interchangeable.
- Stone widths including the wrap: 3–10 px, with the bible's occasional wider
  slab.

See `valcendre_proof_ground_tests.png` — four 12 × 8 distributions:
`uniform_cycle`, `row_major_cycle`, **`heavy_variant_0_87pct`** and
**`only_variant_2`**. The last two exist because real levels will not
distribute variants equally. No lattice is visible in any of them.

## 5. Ground variant distinctness

Minimum **57 of 256 pixels differ** between any two variants (range 57–96).
Variation comes from joint positions, interlock bridges and which stone carries
the north-west lit face.

## 6. Wall seams

**Horizontal:** masonry joint rows y0 and y8 align across every tested pair
(`limestone_a|b`, `b|a`, `a|a`, `plaster|plaster`), so courses run continuously
through an adjacent module.

**Vertical:** `wall_limestone_a`, `wall_limestone_b` and `wall_plinth` each put
a uniform joint row at y0, so a stacked tile continues the coursing.

Geometry: 1 px joint + 7 px ashlar course, twice per module. Bond breaks
between courses — seams at x5/x11 against x2/x8/x14 — and `limestone_b` is
`limestone_a` with the two courses swapped, so neighbours never repeat.

## 7. Wall corners

All four outside corners pass three checks each: **distinct from the plain
fill**, **carries a return face**, and **carries a cap or footing**.

| Tile | Return | Cap / footing |
| --- | --- | --- |
| `wall_corner_tl` | lit west return | lit cap |
| `wall_corner_tr` | shaded east return | lit cap |
| `wall_corner_bl` | lit west return | dark footing |
| `wall_corner_br` | shaded east return | dark footing |

None is a byte-identical copy of a centre tile.

> **Two real defects were found and fixed here.** The east return was first
> drawn in `limestone_0`, which is also the joint colour, so the return face
> disappeared on every joint row — it is now a 1 px recess plus a
> `limestone_1` return plane that reads at all rows. And the return-face test
> initially sampled row 8, a joint row where no return could ever show; it now
> samples a block body row.

## 8. Roof assembly

Seven checks, all passing: ridge lighter than the plane, eave has a dark
underside, both verges distinct from the plane, the two plane variants differ,
all four corners differ from the plane, and courses align horizontally.

See the right half of `valcendre_proof_seam_tests.png`: a 6 × 3 roof with
ridge, two plane rows and an eave, with all four corners.

> **The first roof pass was rejected on inspection.** It carried a full-width
> `slate_2` line under every 8 px crevice, and at that spacing it read as
> corrugated metal rather than slate; slates were also only 4–8 px wide. The
> full-width light line is gone, the light accents are now sparse 2 px glints
> as the reference study uses, and slates are 11–15 px wide.

## 9. Window and door alignment

Both components are grid-aligned, fully opaque, and sit on `plaster_2` so they
drop onto a plaster facade with no halo.

- **Window** — 23 × 19 motif inside a 32 × 32 field, matching art bible 5.4's
  "approximately 22 × 18 composed on adjacent modules". Depth comes from a dark
  reveal, shutters proud of the wall, and a lit sill with a recessed underside.
  Weathered French blue shutters (`shutter_0..3`) with louvre slats.
- **Door** — 16 px wide with a limestone lintel, framed plank leaf, iron
  handle and a stone foot, two facade rows tall so it drops straight onto a
  32 px facade.

## 10. Full building assembled exclusively from exported assets

`valcendre_proof_building_assembly.png` — native **480 × 270**.

**This is verified, not asserted.** `validate_proof.py` decodes the four
exported PNGs from disk and composites only those pixels; it then collects
every colour present in the finished scene and subtracts every colour present
in the source images. The result is empty:

```
distinct colours in scene: 27
colours not present in any exported tile: none
```

Nothing is hand-painted into the proof. The building is **8 × 6 tiles**, with
the row plan given in the manifest's `suggested_assembly_order`.

`valcendre_proof_assembly_3x.png` is the same scene at integer 3×.

## 11. Native-resolution readability

Measured on the native scene, slate roof against the paving it stands on:

| | Mean luma |
| --- | --- |
| Roof | 61.7 |
| Adjacent paving | 161.9 |
| **Separation** | **100.2** |

The silhouette is unambiguous at 480 × 270 without an outline. The building
reads as a solid volume rather than decoration placed on a floor, and the
paving sits well below the facade in value so the wall-to-ground contact is
clear.

## 12. Integer-scaled pixel integrity

3× nearest-neighbour upscaling introduces **no new colour values** — the colour
set of the 3× image equals the colour set of the native image. No anti-aliasing,
no blur, no resampling artefacts.

---

## Contact sheet

`valcendre_proof_contact_sheet.png` — all 32 atlas tiles at 6× on a grid with
transparency shown as a checker, plus the four cobble variants.

---

## Production notes and unresolved limitations

Stated plainly, since these are what the next task needs to know.

1. **The window component carries its own plaster background.** It drops onto a
   `wall_plaster` facade invisibly, but on an ashlar `wall_limestone` facade the
   surrounding 9 px of `plaster_2` would show as a patch. Either mask it on
   import or a second limestone-ground variant is needed. Not produced here
   because this proof builds the bible's reference A, which is plaster over a
   limestone base.

2. **Only the slate roof is covered.** `terracotta_0..4` is in the palette and
   the bible's reference B is a terracotta shopfront, but this task scoped one
   building system. A terracotta family would need its own plane, ridge, eave
   and corner set — the slate modules are not recolourable one-for-one because
   terracotta has deliberate course separation that slate does not.

3. **No gable or pitched end.** The roof is presented as a flat plane with ridge
   and eave, as the reference study shows. A building seen from an angle needing
   a visible gable triangle has no module for it.

4. **`roof_ridge_end_l/r` are thin.** They terminate a ridge at a verge using
   bond B, but they are near-duplicates of `roof_corner_tl/tr`. They are kept
   because a long roof wants a different bond at its ends, but a reviewer may
   reasonably decide two of these four are redundant.

5. **The plinth reads as masonry, not as a damp course.** `wall_plinth` is
   heavier coursing with a dark base line. The bible asks for "lower 3 px
   indicating a grounded building face"; at 16 px this is a whole module, so a
   building using it gains a full tile row of base. A 3 px plinth strip as an
   overlay on the facade's bottom row may be preferable, and is not produced.

6. **`shade_corner` is a full-height column.** It shades the whole tile east of
   a building. A building whose east side is partly open would want a shorter
   variant.

7. **Cast shadow length is a guess.** The bible says 2–3 px hard-edged; the
   assembly offsets `shade_footing` 4 px east and `shade_corner` 4 px south for
   the north-west light. Whether the engine places these statically or
   dynamically is the coding agent's call, and the offset may need to change.

8. **Vegetation at the facade is absent.** Reference A shows "narrow low
   vegetation at the facade"; the `leaf_0..4` ramp is unused here because
   planters were not in this task's asset list.

9. **27 of 53 palette colours are exercised.** The unused ramps are genuinely
   out of scope, but it does mean this proof has not stress-tested terracotta,
   vegetation or accent colours against the paving.

10. **No collision, footprint, map coordinate or mission claim is made
    anywhere in this package.** The manifest states this explicitly. The door
    is a reusable component and its presence in the proof image does not
    propose a traversable route.

### Three defects found during validation and fixed

Recorded because they are the kind of thing that survives into production if
the checks are only run once:

- **Paving read as high-contrast brickwork.** Grout was `paving_0`, two steps
  from the body. It is now `paving_1`, one step, with `paving_0` reserved for a
  single isolated crack per variant — which is what the bible actually asks
  for. Interlock bridges were added so stones span courses instead of the floor
  reading as continuous bands.
- **The wrapped boundary stone changed shade mid-stone.** Each variant assigned
  its own tone to the first and last stone of a course, so the stone straddling
  a tile boundary was two different values. First and last tones are now fixed
  across all four variants and all variation lives in the interior stones.
- **The facade carried unexplained stripes.** `wall_plaster` had two full-width
  `plaster_1` scour rows which, once assembled, looked like mistakes crossing
  the wall. The fill is now quiet and the only horizontal line in a facade
  comes from `wall_plaster_course`.
