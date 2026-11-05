# Valcendre B.2-04 integration follow-ups

Raised by the controlled market integration. Every item below is something the
integration **found**, not something it worked around: no approved pixel was
edited, no missing art was drawn with Phaser graphics, and no gameplay geometry
was moved to make art fit.

Full result: [`../art-integration/valcendre-b204.md`](../art-integration/valcendre-b204.md).
Screenshots: `docs/art-integration/screenshots/b204/`.

---

## ART AGENT — new or revised artwork

### ART-1 — Shaded paving variants (highest impact)

> **RE-SCOPED by the B.2-05C-2 material audit — this request overstated the need.**
> The 496 figure below counts `deep_shadow` *floor tiles*, but `voidFill` and
> `shadowFloor` both paint `deep_shadow`, so **432 of those 496 are non-walkable
> building interiors**, not paving. Only **64** are walkable shaded ground inside
> the market region, and map-wide the genuinely cobblestone shaded ground is
> **79 tiles**. A further 372 shaded tiles are `serviceBrick`, which needs its
> own artwork (ART-11) rather than cobblestone. Superseded by ART-7/8/9 in
> [`../art-integration/valcendre-b205c2.md`](../art-integration/valcendre-b205c2.md).

| | |
| --- | --- |
| Asset | new companion sheet to `valcendre_proof_cobble_16x16.png` |
| Intended dimensions | **64×16**, four 16×16 variants, same four-variant order as the lit sheet so `pavingVariant()` indexes both identically |
| Visible defect | **496 tiles** inside the market region are still legacy `deep_shadow` and sit as unconverted legacy art directly against the new paving |
| Screenshot | `03-v2-paving.png` (lit paving), `20-v2-integrated-market.png` (the boundary against the shadow bands) |

The west arcade and the plaza shadow bands use `deep_shadow` as their **floor**,
and that shade is a gameplay read — concealment. Substituting the lit cobble
would erase it, so those tiles were left legacy. This is the single largest
remaining incoherence in the slice. Ideally a third "transition" edge tile too,
for the lit/shaded boundary.

Also, if cheap: a grass variant (12 tiles) and a cracked-paving variant (1 tile).
Minor by comparison.

### ART-2 — Window and door components that can be placed

| | |
| --- | --- |
| Assets | `valcendre_proof_window_32x32.png`, `valcendre_proof_door_16x32.png` |
| Intended dimensions | a **16×16 window** variant and a **16×16 door head / 16×16 door foot** pair, or the same components with transparent rather than plaster-filled backing |
| Visible defect | neither component appears anywhere in the slice; both market halls are blank facades |
| Screenshot | `04-v2-architecture-west-hall.png`, `05-v2-architecture-east-hall.png` |

Both components are registered and load, but neither could be placed:

1. They carry an **opaque plaster backdrop**. Placing one over a facade module
   means its own backing replaces the wall, which only works if the backing
   matches the wall it lands on — it does not for `wall_plaster_course`.
2. The deepest facade either existing footprint offers is **one 16 px row**. The
   window is 32×32 and the door is 16×32, so either overhangs the roof above or
   the plinth below.

Neither can be fixed on the coding side without editing approved pixels or
moving collision, both forbidden.

### ART-3 — Market stall canopy occludes Tempest on the evidence tile

> **RESOLVED in Phase B.2-05C-1 — no art change was needed.** The canopy is now
> drawn as two source regions at different depths, so an actor beneath it is in
> front of the awning's rear slope and behind its front valance. Unoccluded
> sprite rows at the interaction position went from 14/32 to 26/32, and the
> unoccupied stall renders pixel-identically. See
> [`../art-integration/valcendre-b205c1.md`](../art-integration/valcendre-b205c1.md).
> The original report is kept below for the record.

| | |
| --- | --- |
| Asset | `valcendre_market_stall_canopy_80x48.png` |
| Intended dimensions | unchanged 80×48; the ask is the **canopy art band**, currently local y5–25 |
| Visible defect | standing on the only tiles from which the mandatory V1 evidence is reachable, Tempest is substantially hidden under the awning |
| Screenshot | **`08-v2-stall-player-behind.png`** |

The canopy's art band maps to world rows **47–48**. The V1 evidence sits at tile
**(30,47)**; `interactRange` is 28 px, row 49 is solid cover, and row 50 is 48 px
away — so the player **must** stand under the awning to take the clue.

Layering itself is correct: all three of the manifest's orderings are reproduced,
the glint (depth 19) and the prompt (HUD, 100+) both draw above the canopy, and
V1 was granted by a real `E` press from that tile. The clue is discoverable; the
*character* is not readable there.

§10 forbids solving this with a global transparency effect or by redrawing the
canopy, so this is referred rather than patched. Two options for the reviewer:

- **Art:** raise or shorten the canopy band so local y5–25 clears one tile row —
  i.e. the awning covers only world row 48, leaving row 47 open.
- **Engine (if the art should stand):** restrict the canopy image to the rows
  south of the evidence tile, or give it a cutout. Either is a change to
  `ValcendreV2Scene.buildStall()` and needs an art-direction decision first,
  because it changes the awning's read.

### ART-4 — Cover-piece art

| | |
| --- | --- |
| Asset | none exists |
| Intended dimensions | 16×16, low cover (crouch-height) and a pillar |
| Visible defect | **26 legacy cover tiles** (24 `cover_low`, 2 `pillar`) render inside the region in the old style |
| Screenshot | `20-v2-integrated-market.png` |

Cover is drawn *and* collided, so these are load-bearing for gameplay and
unusually visible — the player looks right at them while using them.

### ART-5 — The remaining legacy environment inside the region

Quantified so the next art task can be scoped rather than estimated:

| Legacy art still rendering | Count |
| --- | --- |
| `architecture` tiles (only 31 of 384 replaced) | **353** |
| `decorBack` tiles, incl. the 4-tile `checker` inlay at (23–24, 44–45) | 17 |
| legacy props: `hay_cart`, `tree` ×2, `bench` ×2, `lamppost` ×2, `barrels`, `flower_box` ×2, `flower_pot`, `clothesline`, `french_flag`, `village_cross`, `stone_cover` | 16 |

The `checker` inlay is worth singling out: it draws at depth 1, correctly above
the new paving at 0.5, so the ordering is right and the clash is purely stylistic
— the highest-contrast legacy tile in the slice sitting on the quietest new one.

### ART-6 — Deeper building assemblies

| | |
| --- | --- |
| Assets | `valcendre_proof_architecture_16x16.png` |
| Visible defect | the east hall reads as a roofed outbuilding rather than a market hall |
| Screenshot | `05-v2-architecture-east-hall.png` |

The B.2-03A reference building is **8×6** and fits neither market footprint
(4×4 west, 5×3 east). Nothing was resized. The east hall at 3 rows cannot carry
ridge + eave + facade + plinth, so it uses `roof_to_facade` and ends up
shallower than the west hall. This is a composition question, not a bug: either
accept the shallow read for short footprints, or supply modules tuned for a
3-row building.

---

## CODING AGENT — engine work, no art generation

### CODE-1 — Per-instance character sheet selection

The engine registers **one definition per character key**, so the Lookout switch
changes **all seven** Lookouts, not only the market guards. B.2-04 preferred
market-only; doing it properly means threading a variant through `CharacterDef`,
the animation registry and `Enemy` construction.

- Modules: `src/art/CharacterDefinitions.ts`, `src/art/Animations.ts`,
  `src/actors/Enemy.ts`
- Current mitigation: `?art=legacy` reverts every guard together.
- Not urgent — the directional sheets are strictly better than the pose atlas
  everywhere, so "all seven" is not a visible defect. It matters when a second
  guard variant ships.

### CODE-2 — Promote or retire the `ART_MODE` switch

`src/art/ValcendreV2.ts` resolves the mode from `?art=` at module load. That is
right for an A/B proof and wrong for a shipping game: it is load-time only, so it
cannot be toggled in play, and a query string is not a user-facing setting.
Before this stops being a proof, either fold the proof art into the default
presentation and delete the switch, or move it into the real settings path.

### CODE-3 — Paving layer scope

`buildPaving()` runs over a 34×28 authored region and creates one blank tilemap
layer. Fine at this size. If the proof expands to the whole map, the skip list
(`PAVED_LEGACY_TILES`) should move into the map data rather than staying a
hard-coded array in `ValcendreV2.ts`, so a level designer owns which surfaces are
paved.

### CODE-4 — Pre-existing, unrelated to art: three of seven guards do not patrol

Carried over from C.1B-04B-1 and already assigned to 04B-2. Recorded here only so
it is not mistaken for an integration regression: a 2 px collider overhang into
the row above a diagonally adjacent solid stops three guards leaving their first
waypoint. It is a `followPath`/collider mismatch, present before any of this art
landed, and it blocks no-kill verification.

---

## Explicitly not raised

- **Fountain** — correct at its existing tile, exactly one instance, no duplicate.
- **Paving seams** — none at any camera position; the variant function is
  deterministic and non-checkerboard.
- **Character readability on cobble and plaster** — good; the Lookout and
  Tempest sit in the same style (`12-v2-lookout-and-tempest.png`).
- **Duplicate enemy weapon** — impossible: the engine has no enemy weapon-overlay
  path at all, and a test keeps it that way.
- **Enemy fire animation** — was genuinely broken (`updateAnimation` had no fire
  branch, so **any** sheet's fire row was unreachable). Fixed in this phase
  without touching rate of fire, damage or telegraph.
