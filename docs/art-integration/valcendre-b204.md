# Valcendre controlled market art integration — Phase B.2-04

**Repository baseline:** `e332a54`
**Date:** 2026-11-04

---

## 1. Source package

| | |
| --- | --- |
| Package | `TEMPEST_VALCENDRE_ART_PACKAGE_v1` |
| Master manifest version | **1.0-incomplete** (`package_date` 2026-11-04) |
| Declared status | `COMPLETE_FOR_CONTROLLED_B2_04_ART_INTEGRATION_PROOF` |
| Location | `art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/` (relocated — see below) |
| Checksums | **all 56 entries in `06_validation/SHA256SUMS.txt` verify** |
| Palette | `01_palette/valcendre_palette.json`, 53 environment colours |

The archive was not supplied as `TEMPEST_Valcendre_B203D_Complete_Download.zip`;
the unpacked `TEMPEST_VALCENDRE_ART_PACKAGE_v1/` tree was already in place with
every file the brief lists. Since nothing was missing and every checksum
verified, the task proceeded rather than stopping.

**One relocation, bytes unchanged.** The tree was extracted at
`public/assets/tmp/`. Everything under `public/` is copied verbatim into `dist/`
by Vite and served, so the whole 1.1 MB source package — previews, contact
sheets, validation reports — was shipping in the web bundle, and it is not game
content. It was moved to `art-source/`, alongside the B.2-03A proof, which is
where this repository already keeps art sources and is not served. All **57
files re-verified byte-identical after the move**; only the ten production PNGs
live under `public/assets/`. Nothing was edited.

All 10 production PNGs were independently re-measured before import: correct
dimensions, **zero partial-alpha pixels** in every file.

### Imported files and source checksums

Copied byte-for-byte; a test re-verifies byte identity against the package on
every run.

| Source (SHA-256 prefix) | Imported to |
| --- | --- |
| `14e9b5c5…` cobble 64×16 | `public/assets/environments/valcendre_proof_cobble_16x16.png` |
| `3aca8fee…` architecture 128×64 | `public/assets/environments/valcendre_proof_architecture_16x16.png` |
| `8cf51be2…` window 32×32 | `public/assets/environments/valcendre_proof_window_32x32.png` |
| `a0fec7bd…` door 16×32 | `public/assets/environments/valcendre_proof_door_16x32.png` |
| `4af7d8f4…` fountain 32×32 | `public/assets/props/valcendre/valcendre_fountain_32x32.png` |
| `40299ffc…` stall base 80×48 | `public/assets/props/valcendre/valcendre_market_stall_base_80x48.png` |
| `3f878cd5…` stall canopy 80×48 | `public/assets/props/valcendre/valcendre_market_stall_canopy_80x48.png` |
| `898b3df1…` lookout dir_a 144×160 | `public/assets/characters/lookout_guard_24x32_dir.png` |
| `14f16418…` lookout dir_b 144×160 | `public/assets/characters/lookout_guard_24x32_dir_b.png` |
| `ffaed216…` walk_side 144×32 | `public/assets/characters/lookout_guard_walk_side_24x32.png` — **copied, deliberately NOT registered** |

The side-walk strip is byte-identical to row 0 of the secondary sheet per its
own manifest, so registering it would give one animation two sources. A test
asserts it never becomes a texture.

---

## 2. Integration strategy — additive and reversible

Nothing legacy was replaced. The 48-slot `valcendre_tiles_16x16.png` is
untouched and still drives every tile layer in `village.json`; all 45 legacy
props and the Lookout's 4×6 atlas remain registered and loadable.

**`ART_MODE` switch.** `src/art/ValcendreV2.ts` resolves the presentation once
at module load, defaulting to `valcendre_v2_proof`. Appending `?art=legacy` to
the URL selects the shipped look instead — which is how the A/B baseline below
was captured from a single build. Verified live: in legacy mode the scene
reports `artV2=false` and the Lookout renders from `char.lookout_guard`; in
proof mode `artV2=true` and it renders from `char.lookout_guard.dir_a`.

**Files added**

| File | Purpose |
| --- | --- |
| `src/art/ValcendreV2.ts` | Placement data only: texture keys, the manifest's 32 semantic tile indices, the authored market region, the two building assemblies, prop contracts, depth bands. Contains no artwork. |
| `src/art/ValcendreV2Scene.ts` | Builds the presentation in the live scene and owns its teardown. |
| `tests/art-integration.test.ts` | 36 assertions on the integration contract. |
| `tools/b204-capture.mjs` | The engine capture harness. |

**Files modified**

| File | Change |
| --- | --- |
| `src/art/AssetRegistry.ts` | 7 new texture entries; Lookout's two directional sheets registered *alongside* its atlas. |
| `src/art/CharacterDefinitions.ts` | Lookout split into `LOOKOUT_LEGACY` / `LOOKOUT_V2`, selected by `ART_MODE`; added `LOOKOUT_MUZZLE_OFFSET`. |
| `src/scenes/Village.ts` | Constructs/destroys the presentation; `addPropSprite` now returns its image so the fountain texture can be swapped at spawn. |
| `src/actors/Enemy.ts` | Added a fire-pose branch to `updateAnimation` — see §7. |
| `tests/tempest-directional.test.ts` | Two stale assertions updated (the Lookout is no longer pose-atlas-only). |

---

## 3. Texture and tile mappings

### Paving

`tiles.valcendre.v2.cobble`, 64×16, four 16×16 frames, registered as a
**separate tile family**. The proof draws it into a second, programmatic
`Tilemap` blank layer (`valcendre_v2_paving`) rather than rewriting the shipped
`floor` layer, so the legacy ground stays intact underneath and removal is one
`destroy()`.

Variant selection is deterministic and authored:
`pavingVariant(tx,ty) = (tx*3 + ty*5) % 4`. Both coefficients are coprime with
4, so the pattern neither falls into single-variant rows/columns nor reduces to
a checkerboard; a test pins both properties. The same tile gets the same variant
in every run, so a screenshot is reproducible and a seam would be a real defect.

**Measured coverage: 443 tiles paved.** Skipped, and why:

| Legacy surface | Tiles | Reason |
| --- | --- | --- |
| `deep_shadow` | **496** | The west arcade and the plaza shadow bands use it as their *floor*. The package has no shaded paving variant, so substituting the lit cobble would erase the concealment read. **Corrected by the B.2-05C-2 audit: only 64 of these 496 are walkable shaded ground; the other 432 are non-walkable `voidFill` behind building walls, which is also painted `deep_shadow` and is not paving at all.** See [`valcendre-b205c2.md`](valcendre-b205c2.md). |
| `grass` | 12 | No approved grass. |
| `floor_crack` | 1 | No approved equivalent. |

### Architecture

`tiles.valcendre.v2.architecture`, 128×64, 8 columns × 4 rows = 32 frames,
addressed by the manifest's **own** semantic indices. A test cross-checks every
one of the 32 names against `valcendre_proof_manifest.json`, and separately pins
that the two numbering schemes are not confused — proof index 8 is
`wall_corner_tl` while legacy index 8 is `wall_solid`; proof 16 is
`roof_slate_a` while legacy 16 is `wall_corner_bl`.

### Characters

The approved Lookout sheets use **exactly** the row layout the engine already
had for Tempest's Art Task 01 pair, so `dirClip` was reused rather than adding a
second animation system:

| Row | Sheet A | Sheet B |
| --- | --- | --- |
| 0 | `idle_down` | `walk_side` |
| 1 | `idle_up` | `aim_side` |
| 2 | `idle_side` | `aim_down` |
| 3 | `walk_down` | `aim_up` |
| 4 | `walk_up` | `fire_side` |

Distinct poses (idle 2, walk 6, aim 1, fire 3) match the manifest's `animation`
block exactly; a test compares every row against the manifest rather than
trusting the constant.

---

## 4. Depth-layer rules

| Thing | Depth | Rationale |
| --- | --- | --- |
| legacy `floor` | 0 | unchanged |
| **v2 paving** | **0.5** | above the legacy floor, below `decorBack` |
| **v2 ground shade** | **0.75** | on the paving, under anything vertical |
| legacy `decorBack` | 1 | unchanged |
| legacy `architecture` / `collision` | 5 | unchanged |
| legacy `cover` | 6 | unchanged |
| **v2 building modules** | **y-sorted** `10 + (moduleBottomY)/10000` | so an actor south of a hall draws in front and one north of it is occluded, with no roof-specific special case |
| **v2 stall base** | **y-sorted at the counter row** (`10 + 800/10000`) | |
| **v2 stall canopy** | same row **+0.00005** | both layers resolve against an actor together; the epsilon only stops the two z-fighting |
| actors | `10 + y/10000` | unchanged (`Village.sortDepths`) |
| evidence glint | 19 | unchanged — **above** the canopy |
| HUD | 100+ | unchanged — **above** the canopy |

Buildings sort by each module's **bottom** edge rather than its top, so a roof
row high on a building still sorts behind an actor standing level with the
facade.

---

## 5. Controlled building integration

The B.2-03A reference building is **8×6** and fits neither market footprint.
Nothing was resized and no collision was widened; each existing footprint got
the deepest coherent assembly its own height allows, using the manifest's
smaller modules.

**West hall — existing 4×4 at x17–20, y41–44** (confirmed solid in
`village.json`):

| Row | Modules |
| --- | --- |
| y41 | `roof_corner_tl` · `roof_ridge` ×2 · `roof_corner_tr` |
| y42 | `roof_corner_bl` · `roof_eave` ×2 · `roof_corner_br` |
| y43 | `wall_edge_left` · `wall_plaster_course` ×2 · `wall_edge_right` |
| y44 | `wall_corner_bl` · `wall_plinth` ×2 · `wall_corner_br` |

**East hall — existing 5×3 at x27–31, y44–46:**

| Row | Modules |
| --- | --- |
| y44 | `roof_corner_tl` · `roof_ridge` ×3 · `roof_corner_tr` |
| y45 | `roof_eave_corner_l` · `roof_to_facade` ×3 · `roof_eave_corner_r` |
| y46 | `wall_corner_bl` · `wall_plinth` ×3 · `wall_corner_br` |

The east hall exercises `roof_to_facade`, which the manifest supplies precisely
for a building only one roof row deep.

**No window or door was placed.** Both components carry an opaque plaster
backdrop, and the deepest facade either footprint offers is a single 16 px row
against a 32 px window — it cannot be placed without overhanging the roof or the
plinth. Erasing the backing would mean editing approved pixels, which is
forbidden. Logged as ART-2. Nothing draws a usable doorway through a solid wall.

---

## 6. Fountain

The approved sprite **replaces the texture** on the existing map object
`prop_fountain_5` at its authored tile **(24,47)**, verified unchanged in
`village.json`. The object, its prop footprint and its cover are untouched.

The manifest's `(16,29)` bottom-centre authoring anchor became a Phaser origin
of `(0.5, 0.90625)` — not a new coordinate. The manifest itself says the anchor
"is an authoring reference, not an instruction to replace coded origin
coordinates."

**Exactly one fountain renders.** Measured live: 1 object with
`prop.valcendre.fountain_v2`, **0** with the legacy `prop.valcendre.fountain`.

---

## 7. Lookout animation and the weapon audit

**No duplicate pistol is possible, and this was audited rather than assumed.**
The engine has **no enemy weapon-overlay code path at all** — nothing draws a
gun sprite over an enemy. The pistol exists only inside the approved aim/fire
frames. Every aim and fire clip is tagged `weapon: 'in-frame'`, and a test
greps `Enemy.ts` for any overlay construct to keep it that way.

Muzzle origins come from the manifest's `muzzle_origin_local_px`, converted to
offsets from the `(12,30)` feet anchor by subtraction. A test re-derives all four
from the manifest and checks the manifest's own mirroring rule
(`mirrored x = 23 − source x`).

### A real defect found and fixed

`Enemy.updateAnimation` had **no fire branch at all**:

```
stumble ? 'hit' : (combat && stationary) ? 'aim' : moving ? 'walk' : 'idle'
```

`'fire'` was never selected, so **any** sheet's fire row could never appear —
the player selects `'fire'`, enemies never did. The approved `fire_side` row,
with its three-pose recoil, would have been dead art.

Fixed with a cosmetic `fireAnimTimer` set where the shot is actually taken and
held for 0.22 s, capped at the attack interval. **Rate of fire, damage,
telegraph and hitscan are untouched** — `attackTimer` still owns timing, and a
test pins that the pose is set *after* `attackTimer` and never replaces it.
Confirmed in-engine: the capture harness now reaches
`anim.lookout_guard.fire.right`.

### Scope, reported rather than buried

The engine registers one definition per character key, so this switch changes
**all seven Lookouts**, not only the market guards. The brief prefers
market-only; per-instance sheet selection would mean threading a variant through
`CharacterDef`, the animation registry and `Enemy` construction — far more than
this proof warrants. `?art=legacy` reverts every guard together.

The sheet has a real back view, so `idle_up` and `walk_up` are authored instead
of reusing the front pose as the legacy atlas had to. Enforcer, Zealot,
Ascendant, Barnabé, Suzanne and Tempest are untouched, and a test asserts it.

---

## 8. Market stall — the layering test

Two 80×48 images at one shared world origin **(464,752)**, which is the
manifest's own proposal, verified against `village.json` to land the envelope's
bottom band on the **existing** cover run at x29–33, y49.

**Measured depth behaviour** (player depth vs canopy depth, sampled live with
frames running):

| Player tile | Player depth | Canopy over player? | Manifest case |
| --- | --- | --- | --- |
| (31,52) south | 10.0840 | no | `layer_order_for_front_actor` ✅ |
| (31,50) south | 10.0808 | no | `layer_order_for_front_actor` ✅ |
| (30,48) under | 10.0776 | **yes** | `layer_order_for_behind_actor` ✅ |
| (30,47) evidence | 10.0760 | **yes** | `layer_order_for_behind_actor` ✅ |
| (33,48) under | 10.0776 | **yes** | ✅ |

All three of the manifest's orderings fall out of one y-sort rule. No global
transparency, no redrawn canopy.

**No collision, cover or concealment was added.** A test walks all 15 tiles
under the 80×48 art and asserts every one except the pre-existing cover row is
still walkable with no shadow-zone change.

### The limitation, stated plainly

The canopy's art band (local y5–25 → world y757–777 → tile rows **47–48**) sits
over the only ground from which the mandatory V1 evidence at **(30,47)** is
reachable: `interactRange` is 28 px, y49 is solid cover, and y50 is 48 px away.
So the player **must** stand under the awning, and standing there they are
substantially occluded — visible in `08-v2-stall-player-behind.png`.

What still works, verified by real input:
- the evidence **glint** is depth 19, far above the canopy's ~10.08;
- the **prompt** is HUD depth 100+ and was captured reading
  `E - INVESTIGATE STALL`;
- **V1 was granted by a real `E` press** at that tile.

So the clue is discoverable and interactable; it is *Tempest* who is hidden, not
the evidence. Per §10 this is documented rather than solved with transparency or
by redrawing the canopy — see ART-3, which offers both an art fix and a
one-line engine alternative for the reviewer to choose.

---

## 9. Verified gameplay invariants

Automated (`tests/art-integration.test.ts` §6 plus the existing suite):

- both market hall footprints still solid, and the tiles immediately outside
  each still walkable — **no footprint grew**;
- `interact_tracks` (24,48), `interact_stall` (30,47), `interact_waybill`
  (30,34), `interact_radio` (31,34) all at their authored tiles;
- both market exits open — the garden mouth x16–19,y31 and the east lane
  x35–42,y48;
- all **seven** guards present, every guard and waypoint on a walkable tile;
- `speedWalk 108`, `speedCrouch 66`, `speedSprint 152`, `coneDegrees 100`,
  `maxDistance 176`, `SAVE_VERSION 2` unchanged;
- the stall adds no collision, cover or concealment;
- the evidence tile is still standable.

Driven by **real keyboard and mouse input** (`PLAYED` captures):

| Exercise | Result |
| --- | --- |
| Walk from spawn into the market | ✅ |
| Full circuit around the fountain (N, E, S, W) | ✅ |
| Walk the gap beside the west hall | ✅ |
| Reach the ransacked-stall evidence | ✅ prompt `E - INVESTIGATE STALL` |
| Trigger V1 with a real `E` press | ✅ objectives `V1` |
| Switch on the market radio with a real `E` press | ✅ |
| Observe a Lookout patrol / aim / fire | ✅ incl. `fire` row reached |
| Leave by an intended market exit | ⚠️ see below |

The "leave by the east lane" step did not reach the lane in the final run — not
a defect: the player walked through the **overheard-conversation trigger**, V2's
alternate source, which granted V2, advanced the objective to *Reach the
transport depot* and opened a dialogue the travel loop then fought with. The
frame (`19-played-leaving-east-lane.png`) shows the guard line and the advanced
objective. An earlier identical run did reach the lane. Mission progression
working, harness navigation losing a race with a dialogue box.

---

## 10. Visual assessment

Against `05_previews/B2-02_REFERENCE_valcendre_market_master_480x270.png` and
`valcendre_package_compatibility_APPROVED_B203A_480x270.png`, used as direction
references rather than pixel targets. The A/B pair is
`01-legacy-market-baseline.png` vs `02-v2-market-same-frame.png` — identical
camera and actor placement, one build, two URLs.

| Question | Assessment |
| --- | --- |
| Does the building read as complete architecture? | **Yes for the west hall** — ridge, eave, plaster facade and plinth read as a structure. The east hall reads as a roofed outbuilding; at 3 rows it cannot carry a full facade. Both are a clear improvement on grey brick outlines. |
| Is the cobblestone quieter than the original floor? | **Yes, markedly.** The legacy floor was a flat tan field with sparse flecks; the approved paving has real coursed stone structure at lower contrast, and no 16 px lattice is visible at any camera position. |
| Does the fountain appear integrated? | **Yes.** It sits on the paving at its existing tile and reads as stone with contained water, not a checkerboard. |
| Does the market stall feel grounded? | **Yes.** The counter aligns with the existing cover run and the canopy reads as an awning over it. |
| Are character silhouettes clearly readable? | **Yes** against the cobble and the plaster. Not evaluated on the dark garage floor, which is outside this slice (the package's own limitations note flags it). |
| Does the Lookout fit Tempest's style? | **Yes** — see `12-v2-lookout-and-tempest.png`. Same palette discipline, same silhouette weight, same 24×32 proportions. |
| Do canopy and architecture occlude characters correctly? | **Architecture yes.** Canopy: correct per the manifest's three orderings, but it hides Tempest on the evidence tile — §8. |
| Obvious patches of incompatible legacy artwork? | **Yes, and extensively.** Quantified below. |
| Closer to one coherent pixel-art production? | **In the paved, built and propped parts, clearly yes.** The slice is not yet coherent overall, because most of the region's non-floor art is still legacy. |

### Legacy artwork still rendering inside the region — counted

| Legacy layer / asset | Tiles or instances | Note |
| --- | --- | --- |
| `architecture` tiles | **353** | only 31 replaced by the two halls; the rest are the region's other walls, roofs and roof edges |
| `cover_low` / `pillar` | 24 / 2 | drawn *and* collided; the package has no cover-piece art |
| `decorBack` tiles | 17 | incl. a 4-tile `checker` inlay at (23–24, 44–45) that draws over the new paving — correct ordering, legacy art |
| `deep_shadow` floor | 496 | the west arcade and plaza bands, left legacy — but see the correction above: 432 of these are non-walkable void fill, not ground |
| legacy props | **16** | `hay_cart`, `tree` ×2, `bench` ×2, `lamppost` ×2, `barrels`, `flower_box` ×2, `flower_pot`, `clothesline`, `french_flag`, `village_cross`, `stone_cover`, and the legacy `fountain` object (texture swapped) |

Per §13 these are recorded, not quietly edited. No colour grading or contrast
filter was applied to disguise the mismatch.

---

## 11. Verification

```
npx tsc --noEmit        clean
npx vitest run          14 files, 337 passed, 0 failed
npm run build           succeeds
node tools/build-map.mjs  green, map unchanged
```

`tests/art-integration.test.ts` contributes 36 of those assertions. Browser
validation: Chromium (Playwright-managed rev 1234, SwiftShader), native
480×270, debug overlays off (`debugHitboxes === false` asserted in the capture).
24 captures in `docs/art-integration/screenshots/b204/`, each tagged `STAGED` or
`PLAYED` in `capture-manifest.json`.

One console 404 appears during the Title scene in both modes. A clean page load
with response logging shows **no 404s for any asset**; it is a favicon request,
not a missing texture, and every registered texture was confirmed present
in-engine.

---

## 12. Completion gate

| # | Item | Status |
| --- | --- | --- |
| 1 | New art loads correctly in the real game | ✅ all 7 v2 textures + both Lookout sheets confirmed in-engine |
| 2 | Controlled slice uses approved paving | ✅ 443 tiles; 509 skipped for want of shaded/grass art (of which 432 turned out to be non-walkable void fill — B.2-05C-2 audit) |
| 3 | ≥1 footprint demonstrates the modular art without collision changes | ✅ **two** footprints, collision asserted unchanged |
| 4 | Fountain correctly positioned | ✅ existing tile (24,47), exactly one instance |
| 5 | Stall base/canopy layering functional | ✅ all three manifest orderings reproduced |
| 6 | Mandatory evidence discoverable and accessible | ✅ glint and prompt above the canopy; V1 granted by real input |
| 7 | Lookout directional animations work | ✅ incl. the back view and the fire row |
| 8 | No duplicate weapon rendered | ✅ no overlay path exists; audited and pinned |
| 9 | Tempest and Lookout readable at 480×270 | ⚠️ **yes except** under the stall canopy — §8 |
| 10 | Existing gameplay mechanics unchanged | ✅ constants, geometry, objectives, patrols, saves |
| 11 | Tests and build pass | ✅ |
| 12 | Real browser screenshots document the result | ✅ 24 engine captures |

Item 9 is the one qualified pass. Item 2 is complete for the surfaces the
package covers and explicitly incomplete for the `deep_shadow` tiles, which is
an art gap rather than an integration failure — though the B.2-05C-2 audit later
showed that gap to be 64 tiles of real shaded ground here, not 496.

Follow-ups: [`../art-requests/valcendre-b204-followups.md`](../art-requests/valcendre-b204-followups.md).
