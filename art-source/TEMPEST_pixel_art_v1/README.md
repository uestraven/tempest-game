# TEMPEST — Pixel Art Production Starter Set

A unified late-SNES / early-PS1 top-down pixel-art set for **TEMPEST**. Four escalating stage palettes: Valcendre (warm limestone), Estate (cool slate), Abbey (ruined graphite/blood), Ascension (basalt/crimson/ritual gold).

## Contents

- `reference/TEMPEST_master_art_direction.png`: generated unified art-direction atlas.
- `characters/`: **seven** named 96×192 RGBA PNG sheets. Each contains 24 frames (4 columns × 6 rows), at **24×32 pixels per frame**. Row order: **idle, walk, aim, fire, hit, down**. Four frames in each row are poses / animation variations, **not four cardinal directions**.
- `characters/portraits/`: character concept portraits.
- `environments/`: **four** 128×96 tilesets at 16×16 px, 48 tiles per stage. Each has JSON tile names/properties and a `.tsx` Tiled tileset. Basic solid and cover hints are included.
- `props/`: scene props and shared downed-body props; transparent RGBA PNGs at the dimensions in filenames.
- `fx/`: 16×16 PNG animation strips for muzzle, blood, alert/awareness, and action indicators.
- `ui/`: original 5×7 bitmap font packed into 8×8 cells, dialogue-panel-style UI texture, HUD demonstration and warning strip. `font.json` maps characters to glyph cells. Lowercase text should fall back to uppercase.
- `boss/`: concept-compatible Belial study and 64×64 pose atlas. Rows are idle, grasp, blast, hit.
- `previews/`: contact sheet and **native 480×270** placement/layout test.
- `manifest.json`: machine-readable paths, dimensions, animation rows, stage tiles and known limitations.

## Integration rules

1. Import PNGs without mipmapping or texture filtering: **NEAREST** only. Disable texture compression if it changes pixels or alpha edges.
2. Set game internal framebuffer to **480×270**; preserve aspect ratio; use integer nearest-neighbor scale when possible.
3. Tile size **16×16**. Human frame size **24×32**, origin **(12,30)**. Layer characters by foot Y, not by the entire 32px sprite rectangle.
4. Gameplay collision is separate from image alpha: update Tiled solids for actual authored maps. Props should have explicit cover/occluder metadata when placed.
5. Enemy silhouettes should remain clearly distinguishable during 480×270 play; never overlay particles on target centers for longer than a few frames.
6. Use palette progression in order; keep HUD neutral and reserve bright gold/crimson for high-stakes encounter readability.

## Production honesty / limitations

The **character and prop images are extracted from one generated concept atlas** and are **reference-quality/vertical-slice-ready** rather than a fully hand-checked final release. Matting, silhouette irregularities, pose registration, frame-to-frame consistency, missing directional animations, isolated 1px noise, and sprite/level relationships **need artist review**. Pixel-precise exported dimensions and transparent backdrops are provided, but this alone does not make every pose animation-production-ready.

The **environment tiles, font, HUD and FX are pixel-authored at native size**, and include usable import metadata. These are intentionally modest in detail, in order to read at native size rather than at concept-art zoom.

## Source & workflow

The art direction originated from a TEMPEST concept atlas generated for this project; `build_tempest_assets.py` (also packaged) performs deterministic crop/extraction and writes the native palette tiles, font and effects. The original PNG is kept so a human pixel artist can re-author exact sprites from the reference as needed.
