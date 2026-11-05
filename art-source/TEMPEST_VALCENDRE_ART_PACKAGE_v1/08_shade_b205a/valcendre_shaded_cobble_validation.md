# TEMPEST — B.2-05A-1 Shaded Cobblestone Validation

**Result:** All machine-testable asset requirements pass. Material identity, character contrast and 1× readability were visually reviewed in the supplied composites. **In-engine approval remains open.**

## Source authenticity

- **Actual approved B.2-03A source:** `valcendre_proof_cobble_16x16.png`; recovered from accessible file library, not replaced by the B.2-02 concept paving.
- Source SHA-256: `14e9b5c58301f037b87573dbb77487f0ea906b952b015adc8255aeef3b4349ee`.
- Derived shaded output SHA-256: `1747da6acbecaf9ca38f3dd9f438362c5b030681ec2457311b028afb248d15b8`.
- Original source data has not been altered. Every source pixel's material role is mapped to exactly one approved palette value, with no spatial changes.
- Cross-check: B.2-03A manifest describes four freely interchangeable 16×16 course-aligned cobblestone tiles; all four source variants were read directly.

## Technical checks

| Requirement | Actual check | Status |
|---|---|---|
| Exactly 64×16 | `64×16` | **PASS** |
| Four 16×16 cells | 4 columns × 1 row | **PASS** |
| Fully opaque | Only alpha `[255]` | **PASS** |
| Approved 53-color palette only | All 1024 output pixels match approved hex values | **PASS** |
| Four distinct variants | Minimum paired difference 57 pixels of 256; maximum 67 | **PASS** |
| Geometry exactly matches B.2-03A | Original per-pixel role masks unchanged; only color lookup differs | **PASS** |
| 16 ordered horizontal variant pairs | No unintended 16px-border grout strokes outside course rows; verified 16/16 | **PASS** |
| 16 ordered vertical variant pairs | Wrap-course joints x6/x13 continue across y15→y0, verified 16/16 | **PASS** |
| Uniform/heavy/mixed repeats | Viewed 12×8 cycle, 87% variant-0, uniform and seeded mixed mosaics during review | **PASS — visual review** |
| Random RGB noise | Exactly 4 preselected colors, no generated noise | **PASS** |
| Lighting consistency | NW lit stone face remains in same pixels; cooler neutral values | **PASS — visual review** |
| Character separation | Approved Tempest and Lookout unaltered in 1× contrast comparison | **PASS — visual review** |
| Original source unchanged | SHA-256 at end equals initial source | **PASS** |

Source mean sRGB-linear luminance (0–255 scaled): **105.9**; shaded: **62.4**, a **-41.1%** relative change. This quantifies material value reduction, *not* visibility in-engine.

## Palette substitution (no new colors)

| Original material role | Original | Shaded role | Output |
|---|---|---|---|
| `paving_0` | `#857F73` | `cast_neutral` | `#686A66` |
| `paving_1` | `#A79C89` | `paving_0` | `#857F73` |
| `paving_2` | `#BFB09A` | `limestone_1` | `#918A7B` |
| `paving_3` | `#D1C0A5` | `paving_1` | `#A79C89` |

## Visual review summary

- **Identity:** Rectangular/ragged coursed paving and staggered stone joints remain intact; preserved exactly from the B.2-03A approved authoring grid.
- **Mood:** Cooler and lower-value than sunlit paving; not blue-painted stone, not featureless black.
- **Characters:** Lookout's navy silhouette and Tempest's mature silhouette remain visually separate against the shaded paving in the native-scale comparison. Lookout aim pose is shown without modifying the original sprite.
- **Buildings:** An art-review composite uses the actual B.2-03A building assembly, mapping only paving-color pixels and copying architectural pixels unchanged. Approved fountain and stall are placed as separate, unmodified overlays for scale.

## Limitations / open checks

1. **No approved crouch sprite was provided.** Tempest crouch contrast cannot be claimed as tested; only his approved standing pose was reviewed.
2. **B.2-04 post-integration screenshots were not available** in the accessible source files. The provided older garden/arcade captures were used only for the known readability problem, not treated as B.2-04 proof. The 480×270 context is explicitly an **ART REVIEW — NOT ENGINE** render.
3. **No boundary transitions in this task.** Hard visual breaks between shaded and normal cobbles require the follow-on transition atlas; four interior tiles cannot cover arbitrary concealment boundaries or all 496 tiles.
4. **Stealth behavior not inferred.** The drawn shade is a material treatment; only coding-agent `shadowZones` determines concealment and gameplay behavior.
5. No engine-level screen capture or measured on-device motion readability has been performed. The coding agent will run integration checks later.

No architecture, actors, stall, fountain, map, collision, or code files have been edited. This package contains the shaded interior strip, metadata, comparisons and boundary plan only.

## Repeated-tile stress study

`valcendre_shaded_cobble_seam_tests.png` contains four actual **12×8** tilings at 1× (uniform cycle, seeded mixed, 87% variant 0, and only variant 2). All show the authored y=2/8/13 mortar courses and the shared vertical wrap joint at x=6/13. There is no additional mortar on x0/x15 outside the authored coursing. These are visual repeat checks, not a substitute for in-engine evaluation.
