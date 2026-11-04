# TEMPEST — Valcendre Art Package v1 (B.2-03D complete)

**Status:** COMPLETE for a **controlled B.2-04 art integration proof only**. Not a finished replacement Valcendre environment atlas.

## Production source art (10 PNG files, all exact-source bytes)

- `02_architecture/valcendre_proof_cobble_16x16.png` — 64×16, four 16×16 paving variants
- `02_architecture/valcendre_proof_architecture_16x16.png` — 128×64, 8×4 = 32 modular tiles (shadow overlay IDs 13–15)
- `02_architecture/valcendre_proof_window_32x32.png` — 32×32 with opaque plaster backing
- `02_architecture/valcendre_proof_door_16x32.png` — 16×32 with opaque plaster backing
- `03_props/fountain/valcendre_fountain_32x32.png` — 32×32, anchor (16,29)
- `03_props/market_stall/valcendre_market_stall_base_80x48.png` — 80×48, paired base
- `03_props/market_stall/valcendre_market_stall_canopy_80x48.png` — 80×48, paired canopy with same origin
- `04_characters/lookout_guard/lookout_guard_24x32_dir.png` — 144×160, primary sheet
- `04_characters/lookout_guard/lookout_guard_walk_side_24x32.png` — 144×32, source strip (identical to secondary row 0)
- `04_characters/lookout_guard/lookout_guard_24x32_dir_b.png` — 144×160, final corrected B.2-03C-2R combat sheet

## Important references

- `01_palette/valcendre_palette.json` — 53-color environment palette (source unaltered)
- `00_docs/TEMPEST_ART_BIBLE_v2.md` — visual bible
- `02_architecture/valcendre_proof_manifest.json` — exact modular tile indices, connection rules and assembly order
- `04_characters/lookout_guard/lookout_guard_manifest.json` — animation frame/weapon contract
- `TEMPEST_VALCENDRE_ART_PACKAGE_v1.json` — master integration inventory
- `06_validation/COMPATIBILITY_AUDIT.md`, `CROSS_PACKAGE_AUDIT.json`, `SHA256SUMS.txt`
- `KNOWN_LIMITATIONS.md` — ongoing in-engine risks and art proof limitations

`05_previews/` contains art-review composites, including a new compatibility render that uses the actual B.2-03A source PNGs. **These are not Phaser engine screenshots** and must not be imported as assets. No game code, maps, or public/assets were edited.

## Approval boundary

Ready for the next **small B.2-04 market integration proof**. Coding agent owns all Phaser texture imports, tile remapping, depth sorting, geometry and test snapshots. Art agent retains production sprite authorship. Do not use this proof batch as a wholesale replacement of the existing 48-slot tilesheet.
