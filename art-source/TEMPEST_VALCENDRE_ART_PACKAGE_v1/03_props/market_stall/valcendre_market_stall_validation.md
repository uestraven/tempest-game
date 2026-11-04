# TEMPEST — B.2-03B-2 layered Valcendre stall validation

Status: **native-pixel asset delivered; integration pending coding-agent review.**

## Automated assertions

| Test | Outcome |
|---|---|
| Base image exactly 80×48 RGBA | PASS |
| Canopy image exactly 80×48 RGBA | PASS |
| Both layers binary alpha only | PASS |
| Every opaque RGB value belongs to canonical 53-color environment palette | PASS |
| Consistent shared local origin (0,0) | PASS |
| Left/right canopy-to-post registration | PASS |
| No baked background or large ground shadow | PASS |
| Combined opaque RGB colors | 13 colors: accent_paper, accent_rust, limestone_2, limestone_3, plaster_1, terracotta_0, terracotta_1, terracotta_2, terracotta_3, wood_0, wood_1, wood_2, wood_3 |
| Base opaque pixels | 1396 |
| Canopy opaque pixels | 1389 |
| Context preview exactly 480×270 | PASS |
| Original code/maps/approved source assets modified | NO (output directory only) |

## Visual inspection

- **Stall readability:** Broad muted red / warm-cream striped awning sits on a dark timber frame; counter remains an independently legible low-cover block, concentrated within local y32–47.
- **Material language:** Deliberate stone-adjacent wood grain, coarse fabric folds, sparse details and upper-left lighting. No anti-aliasing, smoothing, procedural per-pixel noise or added RGB colors.
- **Layer assembly:** Roof and the two rear timber posts register without an unintentional gap. Both PNGs have identical origin, dimensions and transparent empty areas.
- **Collision separation:** No playable collision, concealment or cover data changed. Rails, awning and display crates are decorative; the only authored cover remains x29–33/y49.
- **Characters:** Actual approved Tempest 24×32 idle frame copied into three nearest-neighbor preview cases; front/side/behind display orders are documented as examples, not implemented in Phaser.
- **Clue:** Authored evidence stays at (30,47). Context preview has a **preview-only** small paper marker at its fixed coordinate; not added to either layer.

## Source limitations and required rechecks

- The requested **B.2-03A architecture proof directory**, `valcendre_proof_building_assembly.png`, and `valcendre_proof_cobble_16x16.png` were not available in the supplied workspace or accessible retrieval results. **Direct compatibility with B.2-03A is NOT VERIFIED**. B.2-02 master architecture and paving were used instead and are explicitly identified in the material preview.
- The approved B.2-03B-1 fountain, palette JSON, architecture study, market reference and Tempest source sheet were available and inspected.
- Actual in-engine occlusion behavior, cover collision, registration of renderer origins and clarity while moving require a coding-agent integration screenshot; these previews are **art-review composites, not engine captures**.
- No new object, evidence, collision or gameplay footprint was authorized or introduced.

**Stop condition met:** Only this layered market stall and its review/metadata files were produced. No Lookout, other props, tilesets, interactions, or code edits.
