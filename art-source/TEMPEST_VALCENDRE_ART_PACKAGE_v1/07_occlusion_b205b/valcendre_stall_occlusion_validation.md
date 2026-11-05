# TEMPEST B.2-05B — Stall canopy occlusion validation

**Decision:** **NO CHANGE to approved production PNGs.** The canopy artwork itself is internally consistent. The source has one 80×48 roof/valance layer and its current all-foreground rendering can obscure the player. A non-destructive depth-order split of existing source pixels is sufficient in the test composition.

**Evidence constraint:** B.2-04 real engine screenshot of Tempest under this canopy was **not available**. These are pixel-accurate, non-engine art-review simulations, NOT verified runtime repairs. The original B.2-03B-2 manifest lists the envelope world origin (464,752) as a *recommended* registration, not proven by current engine capture.

## Input integrity

| Source | SHA-256 |
|---|---|
| `valcendre_market_stall_base_80x48.png` | `40299ffca78f01a294d8690ae273fd9f3296b4c78eb145f2ed611ce47e4c8346` |
| `valcendre_market_stall_canopy_80x48.png` | `3f878cd5582d66ecf28ba14a63a5c1b26e8d7a0a03f966af806cd364cc576493` |
| `tempest_24x32_dir.png` | `10da3b44d66948d618146ce5c539e3a7e38c23695222aafe8b0f459ac127c7e7` |
| `valcendre_proof_cobble_16x16.png` | `14e9b5c58301f037b87573dbb77487f0ea906b952b015adc8255aeef3b4349ee` |
| `valcendre_palette.json` | `971bb420afe6f0a92988de752d7aa04baa704720155ea1d2fc6d573d0d3fc7e8` |

## Automated and visual checks

| Validation | Result |
|---|---|
| Structural base unchanged, 80×48 RGBA | PASS, original read-only |
| Canopy unchanged, 80×48 RGBA | PASS, original read-only |
| Approved Tempest unchanged, 24×32 idle frame | PASS, source read-only |
| 53-color palette membership for base and canopy | PASS |
| Binary alpha for base, canopy, and Tempest | PASS |
| Source-rect union reconstructs canopy **exactly RGBA pixel-for-pixel** | PASS |
| Counter and canopy support alignment | PASS, no source pixels changed |
| **Composed stall without actor exactly RGBA-equal to original base+canopy** | **PASS** |
| Locked cover (x29–33, y49) and V1 evidence (30,47) | PASS, source metadata only |
| No new collision, shadow or objective | PASS, no code/map files created |
| Front-of-stall character visibility | PASS in art-review composition |
| Beside-stall non-overlap | PASS in art-review composition |
| South-approach evidence visibility | Improved in pixel-accurate art-review composition |
| Actual B.2-04 renderer behavior | **NOT VERIFIED — screenshot unavailable** |

## Occlusion measurements

Counts indicate how many of Tempest's 288 opaque sprite pixels fall beneath a later-drawn opaque production pixel, not a visibility score from a running game. Tempest is not brightened or otherwise changed.

| Artist's test case | World feet (using proposed origin) | Whole canopy foreground | Proposed rear roof / front valance + base |
|---|---|---:|---:|
| `evidence_center` | (488, 760) | 36/288 | 0/288 |
| `south_approach` | (488, 776) | 234/288 | 76/288 |
| `near_cover` | (488, 780) | 235/288 | 127/288 |
| `front` | (488, 808) | 0/288 | 170/288 |
| `beside` | (450, 776) | 0/288 | 0/288 |

### Body-region coverage on south approach (24×32 original Tempest, local y ranges)

| Region | Opaque pixels | Entire canopy foreground | Proposed source-region order |
|---|---:|---:|---:|
| cap and head (y5–11) | 57 | 9 | 0 |
| shoulders and arms (y12–18) | 89 | 89 | 0 |
| torso (y19–23) | 75 | 75 | 15 |
| legs and boots (y24–30) | 67 | 61 | 61 |

At the **south approach** (tile 30,48 center; world feet 488,776), whole-canopy-over-actor rendering covers **234/288 (81.2%)** of the sprite's opaque pixels, including all visible shoulders and torso pixels. Rendering the existing roof portion behind the actor and existing front valance above it covers **76/288 (26.4%)**, while keeping the cap and upper body visible. No pixels were added or removed from the canopy. This is an illustrative adjacent walkable tile, **not a recorded engine interaction position**.

At the exact **evidence tile center** (488,760), the canopy would cover only 36/288 pixels (lower legs). The reported severe runtime occlusion therefore depends on the player’s actual position and/or renderer origin; it cannot be fully localized without the real B.2-04 screenshot and actor world position.

## Visual depth contract

Keep the same `valcendre_market_stall_canopy_80x48.png` source, but define two *render-region* reads in the coding agent:

- **Back roof**: source rectangle `(x=0,y=0,w=80,h=17)`, same 80×48 original local origin, drawn **behind** approaching actors.
- **Front valance and beam**: source rectangle `(x=0,y=17,w=80,h=31)`, starts at local y17 with destination offset `(0,+17)` for a cropped sprite, drawn **in front of** approaching actors.
- **Structural base**: draw the ORIGINAL full base first, before the canopy as originally assembled (this preserves support/valance overlap). For actors behind the counter, redraw **only its lower counter source rectangle** `(x=0,y=26,w=80,h=22)` last, at offset `(0,+26)` so the bottom mass hides legs without covering the canopy's support joints.

The canopy rectangles are disjoint and their RGBA union equals the original canopy exactly. Repeating the lower base region leaves the complete base+canopy assembly exactly RGBA-identical to the original even without actors. No new exported production texture is required. For an actor truly in front of the stall (south of low cover), draw the complete stall first, then the actor; beside the stall, keep normal ordering because the visual extents do not overlap. Use position-based logic uniformly for all actors, not character-specific overrides.

The visibility of the mandatory V1 evidence prompt and glint must remain independent of the awning art (using the existing UI/interaction rendering scheme). The illustrative gold tile locator in review previews is an **annotation, not the engine's glint**.

## Unresolved runtime confirmation

1. Coding agent must provide real 480×270 B.2-04 frame at V1 interaction, camera top-left, player feet world coords, image origin and Phaser layer/depth values.
2. Confirm the recommended source origin `(464,752)` matches the integrated stall. If not, derive render rectangles from the verified source sprite position without moving collision or clue data.
3. Verify standing/moving actors never pop between depth states, and front-of-stall and beside-stall positions stay visible.
4. Confirm the clue glint/HUD prompt remain distinguishable, without altering discovery or interaction range.
5. Confirm exact same canopy and base SHA-256 before and after integration; the next action is rendering only.

**Source-art pixel-difference report:** NOT APPLICABLE — **zero production PNGs edited, zero production pixels changed**.
