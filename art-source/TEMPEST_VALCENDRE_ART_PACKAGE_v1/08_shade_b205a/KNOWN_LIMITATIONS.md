# B.2-05A-2 — Limitations and Coding-Agent Handoff

## Accepted art limitations

1. **Four-bit topology.** A shaded center has 16 cardinal masks. The 16 inset corner overlays cover diagonal-only daylight adjacency; not every topologically complex T-junction can be guaranteed a perfectly continuous tonal contour at all four pixels of a shared junction without expanding the state space. The 12 stress configurations passed art review, but authored map edge cases still need an engine visual check.
2. **Cobblestone material only.** The previously reported ~496 shaded cells are an aggregate. Other materials should retain their own designed surfaces until separately approved transition art exists.
3. **No source changes.** B.2-03A daylight and B.2-05A-1 shaded strips are hash-verified and copied untouched. B.2-03A architecture, characters, stall and fountain are untouched.
4. **Not a runtime solution.** The review previews use art-side compositing, not Phaser. There is no alpha gradient or runtime filter, and the art does not implement shadows or detection.

## Open coding-agent checks — not blockers for art delivery

- Identify exact cobblestone cells within the affected shaded-ground population; do not map every shaded cell indiscriminately.
- Pick an approved cobblestone variant (0–3) consistently with existing map authoring. For shaded centers, calculate the four-neighbor daylight mask and select `variant*16+mask`; apply diagonal overlay only under the conditions stated in the manifest.
- Draw the ground with the selected tile and applicable diagonal overlay before architecture/characters. No added collision or concealment behavior.
- Inspect one-tile alleys, T-junctions, the bakery garden walk, and arcade passages at native resolution during an actual playthrough. Distinguish authored visual shadow from `shadowZones` collision/detection flags.
- Check Tempest crouching after its approved frame source is available. Current previews verify standing Tempest and Lookout idle/combat, not an unprovided crouch asset.

## Blockers

**None for this pixel-art proof.** Full gameplay integration and overall replacement of all shaded surfaces remain outside this task and cannot be described as completed.
