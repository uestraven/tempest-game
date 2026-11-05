# TEMPEST B.2-05A-2 — Art-Side Validation Report

**Scope:** Four approved Valcendre cobblestone variants in daylight and architectural shade.  
**Status:** **PASS — art-file validation**; runtime integration and game-map acceptance not tested.  
**Production outputs:** 64 cardinal tiles and 16 independent diagonal-overlay tiles.

## Source and provenance

The exact, unmodified B.2-03A source strip was verified before authoring:

- `valcendre_proof_cobble_16x16.png`: SHA-256 `14e9b5c58301f037b87573dbb77487f0ea906b952b015adc8255aeef3b4349ee` — **MATCH**.
- `valcendre_shaded_cobble_16x16.png`: SHA-256 `1747da6acbecaf9ca38f3dd9f438362c5b030681ec2457311b028afb248d15b8` — **MATCH**.
- Approved 53-color `valcendre_palette.json`, schema `2.0`; no new colors.
- Source files are duplicated under `source_references/` *unaltered* solely for provenance and reproducibility; they are **not** replacements to import.

## Measured acceptance checks

| Test | Result |
|---|---|
| Cardinal atlas size / tiles | **PASS** — 128×128, 8×8, 64 × 16×16 |
| Diagonal atlas size / tiles | **PASS** — 128×32, 8×2, 16 × 16×16 |
| Atlas RGBA opacity | **PASS** — cardinal alpha 255 only; diagonal alpha 0 or 255 |
| Palette membership | **PASS** — all opaque pixels from 53 approved colors |
| Unique sprite values | **PASS** — 64 distinct cardinal tiles; 16 distinct diagonal overlays |
| All cells nonempty | **PASS** — 80/80 |
| Mask 0 source parity | **PASS** — all 4 source variants pixel-identical to B.2-05A-1 shading |
| Mask 15 preserved core | **PASS** — all 4 tiles retain shaded center pixel |
| Stone/mortar/crack role coordinates | **PASS** — original material-role mapping preserved in every atlas cell and allowed overlay combination |
| Normal-edge values | **PASS** — an exposed cardinal border matches original normal paving exactly |
| Shaded-side interior | **PASS** — side interior rows 4–11 stay fully shaded where adjacent tile is shaded |
| Original mortar connections | **PASS** — all 16 ordered variant pairs connect in horizontal and vertical orientation, zero joint-type mismatches |
| Normal/shade and shade/shade pair tests | **PASS** — 16 pairings for each of 4 cases (64 total) |
| Valid diagonal overlay subsets | **PASS** — correct pixel roles and full final opacity for all tested subsets |
| Exhaustive eight-neighbor cases | **PASS** — 256 neighbor states × 4 variants = 1,024 local tile composites |
| 12 prescribed boundary stress cases | **PASS** — generated all 12 mixed and repeated configurations; no off-palette terrain pixels |
| Tempest and Lookout scale test | **VISUAL REVIEW** — original 24×32 sprite pixels retained; recognizable at 1× on both light and shaded paving |
| 480×270 arcade context | **ART-REVIEW COMPOSITE** — not an engine screenshot or map integration result |
| Full-level/in-engine output | **NOT TESTED** — exclusively coding-agent responsibility |

### Production palette IDs

Cardinal atlas (7 unique colors): `cast_neutral`, `limestone_0`, `limestone_1`, `paving_0`, `paving_1`, `paving_2`, `plaster_1`.  
Diagonal overlay (4 unique colors): `limestone_0`, `limestone_1`, `limestone_2`, `plaster_1`.  

Cardinal SHA-256: `c88d2432d974e65441944e659452e941dec2a2e1d7a8aab0909bdd95a7296bb0`  
Diagonal SHA-256: `653d75427703ee0efb4b9c8d0a2ad3f1d5c90369992eee73ad03242cec2f96be`

## Visual examination and noteworthy limitations

- **Straight transitions:** light stone meets shaded stone across a narrow 2–4px stepped band; the same mortar pattern runs through the boundary. 1× and 2× are shown in the comparison and stress previews.
- **Opposing transitions and single-tile shade:** both edges leave a shaded interior. No perimeter grout outline is added.
- **Corners, L/T junctions, irregular edges:** the step profiles vary in pixel clusters rather than introducing a new 16px brightness-grid line. Inset diagonal wedges supply only diagonal-ambient light when both adjacent cardinals are shaded.
- **Corner topology limitation:** a 4-neighbor cardinal mask alone cannot represent every 8-neighbor edge-of-shadow junction with globally continuous tonal values at every corner pixel. Diagonal overlays handle *diagonal-only* light; small stepped brightness joins remain possible at pathological T-junctions. The atlases deliberately do not expand past the proposed 64+16 contract. Review map-specific oddities in-engine before declaring full-level acceptance.
- **Non-cobblestone materials excluded:** this artwork must not be assigned wholesale to all ~496 reported shaded tiles, because some may be grass, brick, or garage materials.
- **Gameplay concealment is independent:** palette shading has no authority to grant cover, influence NPC detection, modify `shadowZones`, or change collision.
- **Character sources:** original approved standing Tempest, standing Lookout, and aimed Lookout were composited unchanged. A separately approved Tempest crouch frame was not available for this preview.

## Reproduction

Run `python build_boundaries.py` from this folder, with Pillow available. The script reads immutable source references, reconstructs the two production PNGs, re-creates review previews, and refuses to complete if required source hashes or pixel-level assertions fail. `validation_results.json` records the machine-readable measured checks.
