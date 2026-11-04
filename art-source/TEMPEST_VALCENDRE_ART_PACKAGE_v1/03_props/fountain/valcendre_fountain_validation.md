# TEMPEST — Valcendre fountain production validation (B.2-03B-1)

**Asset:** `valcendre_fountain_32x32.png`  
**Baseline:** `e332a54`  
**Scope:** standalone fountain only; no game code or original assets changed.

## Automated validation

| Check | Result |
| --- | --- |
| canvas 32x32 | PASS |
| mode RGBA | PASS |
| binary alpha only | PASS |
| palette subset exact | PASS |
| no enclosed transparent holes | PASS |
| unpainted edges | PASS |
| no opaque ground background | PASS |
| context exact 480x270 | PASS |
| no unapproved rgb context | PASS |

- Size: **32 × 32**, RGBA.
- Alpha values: **[0, 255]**.
- Opaque pixel count: **464**.
- Opaque content bounding box (x0,y0,x1-exclusive,y1-exclusive): **[2, 4, 31, 30]**.
- Palette use: **9 colors**, all exact matches from approved 53-color Valcendre palette.
- Used palette IDs: `limestone_0`, `limestone_1`, `limestone_2`, `limestone_3`, `limestone_4`, `shutter_1`, `shutter_2`, `slate_0`, `slate_1`.
- Enclosed transparent holes: **0**.
- Background: transparent. No paving baked into the standalone prop; no added ground-shadow decal.

## Visual review

- Rim and south-facing basin establish a clear limestone silhouette and visible water depth.
- Blue-gray water is recessed behind the warm stone lip; NW-facing highlights are discrete pixel clusters.
- Native cobble and unchanged approved Tempest test are combined in `valcendre_fountain_contact.png`.
- `valcendre_fountain_context_480x270.png` is **an art review composite, not an engine capture**. The previous fountain is covered using repeating approved B2-02 cobble sample before the new PNG is pasted. This can leave a small tiled seam near the modified region and is not proof of in-engine rendering or collision.
- Anchor convention: **bottom center (16,29)** in the 32×32 asset; preserve source market tile **(24,47)**, existing transform, collision and footprint.

## Reference availability and limitations

Read **Art Bible v2**, the approved 53-color palette, the B2-02 480×270 market master, and the original noisy 32×32 fountain for visual diagnosis. The named **B2-03A building assembly and proof cobble PNGs were not available** in the working files, so strict side-by-side verification against that exact proof remains **OPEN**. The mock-up uses the approved B2-02 market master’s material treatment instead.

**In-engine layering, final 100% contrast in motion, and collision alignment remain unverified.** These require a coding-agent integration pass after art approval; no code or public/assets/ files were modified here.
