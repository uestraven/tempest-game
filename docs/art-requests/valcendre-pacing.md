# Art requests — Valcendre pacing rework (Phase C.1A)

Additional production artwork required by
[`../level-design/valcendre-rework.md`](../level-design/valcendre-rework.md).
This file lists **only** what the rework adds; earlier outstanding requests are
in [`phase-b1.md`](phase-b1.md) and still stand.

**The redesign is playable without any of this.** Every blocker, cover piece and
walkable surface in the plan uses an existing approved asset, so C.1B can be
implemented and tested before any of these land. Everything below is
differentiation and story dressing — it changes how the level *reads*, not
whether it works.

Priority: **P0** the level cannot tell its story without it · **P1** an area
reads as a duplicate of another without it · **P2** polish.

All props follow the established conventions: 16px grid, binary alpha
(0 or 255 only), transparent background, and **1px of transparent padding below
the ground-contact row**, matching every existing prop.

---

## P0 — story-critical

### VP-001 · BELIAL inscription

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/inscription_belial_32x32.png` |
| **Size** | 32 × 32, single frame |
| **Anchor** | Wall-mounted; ground-contact row 31, drawn at `front` depth with an `overheadLift` of 0 (it sits on a wall the player stands below) |
| **Why** | V7 is now a **mandatory** beat and the campaign's central hook. It is currently a 16 × 16 `ritual_mark` floor tile, which cannot carry a legible word |
| **Needs** | The recurring sigil, with the word **BELIAL** carved beneath it, legible at 480 × 270 without zooming. Scratched into limestone, not painted |
| **Accept** | The word is readable at 1:1 on the pale limestone and dark garage surfaces · the sigil matches the one used on the existing `ritual_mark` tile so the motif ties the levels together |

### VP-002 · Wounded cultist

| | |
| --- | --- |
| **Output** | `public/assets/characters/cultist_wounded_24x32_3f.png` |
| **Size** | 72 × 32 — 3 frames of 24 × 32, one row |
| **Frames** | `slumped_breathing_a`, `slumped_breathing_b`, `dead` |
| **Anchor** | (12, 30), row 31 transparent — identical to the Task 01 sheets |
| **Transparency** | Binary alpha; no enclosed holes; no baked background |
| **Why** | V6 is the first on-screen evidence of cult fanaticism. The actor is a **non-combatant** that cannot be fought or looted, so it needs no directional or combat frames |
| **Needs** | Seated against a wall, robed, visibly wounded but calm. Frames A/B are a 2-frame breathing loop at 2 fps; the third is the same pose gone still |
| **Accept** | Reads as a cultist rather than a guard at 1:1 · plainly non-combatant · same palette discipline as the Task 01 Tempest sheets (≤ 24 colours) |

### VP-003 · Convoy-stop evidence decals

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `tyre_marks_32x16.png` · `shell_casings_16x16.png` · `drag_marks_32x16.png` |
| **Anchor** | Ground decals, drawn at `ground` depth below characters |
| **Why** | V1 has two alternate sources and currently nothing to look at. The locked spec wants the story told in the environment |
| **Needs** | Tyre marks: two parallel skid arcs on cobble. Casings: a scatter of 4–6 brass cases. Drag marks: scuffs leading away, suggesting someone pulled from a vehicle |
| **Accept** | Legible on both `cobble` and `marketPaving` without an outline · reads as evidence, not as damage or decoration |

---

## P1 — area differentiation

### VP-004 · Depot and dispatch props

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `dispatch_board_32x32.png` (V2's waybill source) · `office_desk_32x16.png` (V5 ledger + garage key) · `filing_shelf_16x32.png` · `depot_sign_32x16.png` (reads *DÉPÔT* — accented glyphs fold to ASCII in the HUD font but the sign is artwork, so the accent is welcome) |
| **Collision** | Desk and shelf: solid, `low` and `high` cover respectively. Board and sign: decorative, no collision |
| **Why** | The depot office is a new interior and the only place V5 happens. Without it the office is an empty room with a placeholder document sprite |
| **Accept** | The desk reads as waist-height cover · the dispatch board is obviously interactive at 1:1 |

### VP-005 · Covered market structure

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `market_awning_32x16.png` (tiling, `front` depth, `overheadLift` 32) · `market_stall_32x24.png` (solid, `low` cover) · `produce_crates_32x16.png` (solid, `low` cover) · `hanging_scales_16x16.png` (decorative, `front`, lift 30) |
| **Why** | The market is the largest space in the plan (35 × 23) and the first encounter. The existing `cover_low` tile reads as a generic counter; a covered market needs a roof line to break sightlines readably |
| **Accept** | Three awning segments tile horizontally with no seam · the stall reads as a market stall rather than a crate · the awning does not hide a guard standing under it (the player must still be able to read patrols) |

### VP-006 · Garden route dressing

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `garden_wall_32x24.png` (solid, `high` cover) · `trellis_vine_16x32.png` (decorative, `front`, lift 26) · `wheelbarrow_32x16.png` (solid, `low`) · `bakery_oven_vent_16x16.png` (decorative) |
| **Why** | The garden branch is 1 450 px — the longest single leg in the plan — and currently has only grass, a tree and a flowerbed. Without dressing it reads as a green corridor and the player will not believe it is a back way between houses |
| **Accept** | The wall reads as garden height (chest) rather than building height · the trellis does not obscure the shadow zone's boundary |

### VP-007 · Loading dock

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `dock_ramp_32x24.png` (walkable, decorative) · `pallet_stack_32x16.png` (solid, `low`) · `oil_drums_32x24.png` (solid, `high`) · `dock_chain_16x32.png` (decorative, `front`, lift 28) |
| **Why** | The dock is the garage's alternative stealth entrance. It needs to read as a *second way in* at a glance, or players will not find it |
| **Accept** | The ramp reads as walkable and the drums as cover, with no ambiguity at 1:1 |

### VP-008 · Depot gate

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/depot_gate_48x32.png` |
| **Size** | 48 × 32, two frames (`closed`, `open`) — 96 × 32 sheet |
| **Collision** | Closed: solid, blocks sight. Open: no collision |
| **Why** | The courtyard's south gate is the main-street route's chokepoint and L5's post. The estate's `iron_gate` exists but is château ironwork, wrong for a working transport depot |
| **Accept** | Reads as a wide vehicle gate · the open frame leaves a ≥ 2-tile walkable opening, matching the locked spec's door-width rule |

---

## P2 — polish

### VP-009 · Interaction-state glints

| | |
| --- | --- |
| **Output** | `public/assets/fx/glint_16x16_4f.png` |
| **Size** | 64 × 16 — 4 frames of 16 × 16 |
| **Why** | Mandatory evidence currently glints via a hand-drawn 3px vector sparkle. With six mandatory interactions across four areas, a proper cue matters more |
| **Accept** | Subtle at 1:1 — the locked spec says evidence glints *on first approach*, not constantly · legible over both pale and dark surfaces |

### VP-010 · Market and street signage

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `sign_boulangerie_32x16.png` · `sign_rue_16x16.png` · `notice_board_16x24.png` |
| **Why** | Named French signage is the cheapest way to make three similar streets distinguishable, and the locked spec's aesthetic table asks for bakery signs by name |
| **Accept** | Lettering legible at 1:1 at 16px cell height, or stylised to read as signage rather than as noise |

---

## Reused without change

Listed so the art agent does not re-make them: `fountain`, `hay_cart`,
`barrels`, `bench`, `flower_box`, `flower_pot`, `lamppost`, `stone_cover`,
`tree`, `village_cross`, `clothesline`, `french_flag`, all three
`body_*` corpses, every Valcendre tile role and surface, the architecture band,
and all FX (`muzzle`, `blood`, `alert_*`, `eye`, `eye_hidden`, `interaction`).

## Still blocking from the earlier request

The rework does not remove these, and the P0 items still matter more than
anything in this file:

- **CHAR-001** — directional sheets for the six pose-atlas characters. The
  Lookout is on screen for the whole mission with no back view.
- **CHAR-002** — crouch poses (Art Task 03). Crouch is the core stealth verb in
  all three encounters here and is currently visually indistinguishable from
  standing.
- **ENV-001 / ENV-002** — wall edges, corners and a facade sheet. The rework
  adds two interiors (depot office, garage) and a third street, all of which
  will be built from the same 28 distinct tiles.

---

## C.1B-01 addendum — what the built geometry needs

The 104 × 72 layout is now implemented and playable
([`../level-design/valcendre-geometry-c1b01.md`](../level-design/valcendre-geometry-c1b01.md)).
Nothing below blocks it: every space is built from existing approved tiles and
props. These are the places where the built geometry makes an existing request
more urgent, plus two items the rebuild newly needs.

### Priority raised by the rebuild

| Request | Why it matters more now |
| --- | --- |
| **ENV-002** facade sheet | The map went from 1 wall ring to **18 authored doors and 38 windows** across seven areas, all drawn from one `wall_solid` tile plus one `window` and one `door_closed`. Every street now reads as the same wall |
| **ENV-001** wall edges and corners | The layout is deliberately irregular — five composed market rects, five courtyard rects, seven building blocks. Irregular outlines are exactly what needs real corner tiles, and six of the ten named wall pieces are the same image |
| **ENV-003** distinct floor tiles | Nine surfaces are now in use across nine areas, and six of the eight `floor_*` tiles are one repeated image |
| **ENV-004** shaded surface variants | The garden branch is now 639 walkable tiles and almost entirely an authored shadow zone, so it is all one flat dark tile. It is the longest single space on the map |
| **VP-004** depot and dispatch props | The depot office is built: a 5 × 7 interior with one door. It currently contains nothing but floor |
| **VP-007** loading dock props | The dock is built as the garage's second entrance. Without the ramp and drums it reads as an empty 7 × 11 side room rather than a way in |

### New, from the built geometry

#### VPG-001 · Depot courtyard structures · P1

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `depot_outbuilding_48x32.png` · `fuel_tank_32x24.png` · `gantry_crane_48x32.png` (decorative, `front` depth, `overheadLift` 34) · `pallet_rack_32x24.png` |
| **Collision** | Outbuilding and fuel tank: solid, `high` cover. Pallet rack: solid, `low`. Crane: decorative |
| **Why** | The courtyard is 36 × 24 tiles — **larger than one 480 × 270 screen** — and is the map's one genuinely open space. Three building blocks and a dozen cover pieces were added from existing props and it still reads as the emptiest area. The encounter design needs the span for its three shooting lanes, so the fix is internal structure, not a smaller courtyard |
| **Accept** | Each piece breaks a sight line without closing a lane · the outbuilding reads as part of a working transport depot, not a house · at 1:1 the courtyard reads as a yard with somewhere to take cover |

#### VPG-002 · Garden wall and upper lane · P2

| | |
| --- | --- |
| **Output** | `public/assets/props/valcendre/` |
| **Items** | `garden_gate_16x24.png` (solid when closed) · `wall_buttress_16x24.png` (solid, `high`) · `lane_steps_32x16.png` (walkable, decorative) · `washing_line_pole_16x32.png` (decorative) |
| **Why** | The garden branch climbs from y31 to y3 and runs 36 tiles east — a 1 419 px route. It is the longest space on the map and currently has four prop types in it. A buttress was wanted to break the 18-tile straight but could not be placed, because a building block there collided with the authored shadow zone; a prop would sit on top of the shadow instead |
| **Accept** | The steps make the climb legible at 1:1 · the buttress breaks the straight without narrowing the lane below two tiles |

### Confirmed not needed

The rebuild removed the service corridor, so the Phase B request for corridor
dressing is withdrawn. No new blocker, cover piece or walkable surface is
required by the geometry: it is complete and testable as built.
