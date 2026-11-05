# B.2-05A — Follow-on Shadow Boundary Atlas Requirements

**Status:** Design requirements only — **no transition artwork produced** in B.2-05A-1.

The approved B.2-03A stone coursing must remain visually continuous across every shaded-to-normal transition. Neither shading nor transition graphics may alter collision or independently set `shadowZones`.

## Normal → shaded paving

- **North/south straight edges:** A narrow, authored 2–4 pixel value-shift band follows the existing stone faces on the appropriate edge of the affected tile. Mortar joints remain on the original y=2, 8, 13 course rows, including the wrapped course across y=15→0. No full-width near-black line.
- **East/west straight edges:** Preserve each stone's vertical joint position; the transition travels through the stone material, not as a new 1 px grout column. Existing mortar at x0 and x15 remains absent.
- **Outside corners:** Curved/stepped shadow falloff in hard pixel clusters over both adjoining edge directions; avoid four-way square outlines or isolated dark pixels.
- **Inside corners:** Small wedge of retained ambient light on an inner recess, using the same predefined shaded/normal ramps; avoid a dark corner knot larger than the surrounding paving details.
- **Narrow shaded passages (one or two tiles):** Opposed transitions must meet cleanly without a high-contrast double-line; at least one compact readable stone body remains visible.
- **Irregular authored boundaries:** Build 4-neighbor (N,E,S,W) mask tests plus diagonal corner qualifiers, including concave/convex cases. The boundary atlas must handle isolated tiles, T junctions, one-tile corridors and stair-step edges without visible shadow-cell outlines.

## Quality gates for the later task

1. Source stone placement, joints and wrap courses remain exactly unchanged after material and transition composition.
2. All 16 ordered source/shade variant pairings and normal/shaded edge combinations connect in both axes.
3. No 16px grid emerges in heavy use, especially repeated single-variant runs.
4. Actor silhouettes remain visible at 1× on transition regions; do not compensate by brightening actors.
5. Verify actual authored `shadowZones` boundaries rather than equating floor tile IDs with concealment state.
6. No soft blur, global postfilter, alpha blending gradients, or black contour surrounding a concealment polygon.

**Implementation authority:** Art agent creates transition sprite assets later. Coding agent retains Phaser layering, tile selection, authored maps, `shadowZones`, and collision.
