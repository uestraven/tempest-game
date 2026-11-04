# Phase B — production pixel-art integration

How `TEMPEST_pixel_art_v1` is wired into the game, what the package actually
contains versus what the integration brief expected, and what is still
outstanding.

## 1. What the package turned out to be

Everything below was measured from the files with `tools/inspect-assets.py`
(a dependency-free PNG decoder — Pillow is not available in this environment),
cross-checked against `manifest.json` and the package README. Filenames and
inventory names were not trusted.

| Area | Measured | Notes |
| --- | --- | --- |
| Characters | 7 sheets, **96×192**, 4 cols × 6 rows of 24×32, hard alpha | Rows are `idle, walk, aim, fire, hit, down` |
| Portraits | 7 files, **61–65 × 52–55**, fully opaque | Irregular sizes, no transparency |
| Tilesets | 4 × **128×96**, 8 × 6 of 16×16, 12 colours, no alpha | All four share one 48-tile schema |
| Props | 45 files, dimensions match filenames | Every prop has exactly 1px transparent padding below its art |
| FX | 9 files; `_4f` are 64×16 strips, `_1f` are 16×16 | Matches the manifest |
| UI | font 128×32 (16×4 cells of 8×8, 5×7 glyph inset at (1,0)); panel 48×48; awareness 64×16 | `hud_256x48_example.png` is a mockup, not a runtime asset |
| Boss | `belial_64x64_4x4.png` 256×256, 4×4 of 64×64 | `belial_full_concept_crop.png` is 260×178 and opaque: concept art |

### The brief's central assumption was wrong, and the package says so

The brief anticipated "four directions and six frames per direction", possibly
"144×128". The sheets are **96×192** and the package is explicit:

> "Human sheet layout is 4 columns by 6 animation rows (idle, walk, aim, fire,
> hit, down); 4 columns are frames, NOT cardinal directions." — `manifest.json`

> "4 frames in each row are poses / animation variations, **not four cardinal
> directions**." — package README

**There is no directional character art in the package at all.** Every frame is
a front/three-quarter view. This is the single largest gap, and it drove the
fallbacks in section 4.

## 2. Asset architecture

Runtime assets moved to `public/assets/` (Vite `publicDir: 'public'`), so paths
resolve identically under `dev`, `build` and `preview`. Non-runtime material —
the README, manifest, `build_tempest_assets.py`, `reference/`, `previews/`, the
tileset `.json`/`.tsx` metadata, `font.json`, the HUD mockup and the Belial
concept crop — stays in `art-source/TEMPEST_pixel_art_v1/`, unmodified. Files
were *moved*, not copied, so the production PNGs are byte-identical originals
and nothing is duplicated in the repo.

```
public/assets/{characters,characters/portraits,environments,props/<area>,fx,ui,boss,maps}
art-source/TEMPEST_pixel_art_v1/{README.md,manifest.json,build_tempest_assets.py,
                                reference,previews,environments/*.json,*.tsx,ui/font.json}
```

| Module | Responsibility |
| --- | --- |
| `src/art/AssetRegistry.ts` | Every texture key, path and measured dimension. 77 runtime files. |
| `src/art/AssetLoader.ts` | Queues the registry, then validates each loaded texture's size and frame count; forces NEAREST filtering. |
| `src/art/AnimationRegistry.ts` | Registers character and FX animations from explicit metadata. |
| `src/art/CharacterDefinitions.ts` | Sheet layout, row order, per-character frame picks, feet inset, origin. |
| `src/art/PropDefinitions.ts` | Prop size, ground anchor, depth class, collision footprint, cover semantics. |
| `src/art/TilesetRegistry.ts` | The 48-tile schema and the gameplay-role → tile mapping. |
| `src/art/data/prop-metadata.json` | Prop data shared by the runtime and the map generator. |
| `src/art/data/tile-roles.json` | Role → tile → gameplay-flags mapping, shared the same way. |

`Boot` stops on a validation failure and prints the problems instead of starting
the game with a wrong frame grid.

## 3. Tileset mapping

The old prototype used 16 hand-rolled procedural tile indices with no
relationship to the new ones, so the mapping is explicit:
**gameplay role → tile name → tile index**, in `src/art/data/tile-roles.json`.
Gameplay flags live with the role, not the artwork, so re-skinning a role cannot
silently change collision.

All four stage `*_tiles.json` files were compared and carry byte-identical
`name`/`solid`/`cover`/`occludes_vision` lists, so one mapping re-skins all four
stages. Estate, Abbey and Ascension are registered and validated; no levels are
built for them.

| Role | Tile | Gameplay |
| --- | --- | --- |
| `void` | `roof` | solid, blocks sight — reads as rooftops over a non-walkable block |
| `wall` | `wall_solid` | solid, blocks sight |
| `cobble` / `cobbleAlt` | `cobble` / `brick` | walkable street |
| `marketDirt` | `floor_04` | walkable market square |
| `concrete` | `metal` | walkable yard/garage slab |
| `road` | `ground_debris` | walkable north road |
| `shadow` | `deep_shadow` | walkable, concealment zone |
| `crateHigh` | `cover_high` | solid, blocks sight (high cover) |
| `well` | `pillar` | solid, blocks sight |
| `van` | `cover_high` | solid, blocks sight — placeholder sprite drawn over it |
| `barrierLow` | `cover_low` | solid, blocks sight of a crouched player only |
| `grass`, `sigil` | `grass`, `ritual_mark` | decorative |

`tools/build-map.mjs` fails the build if a role names a tile the tileset does not
define, if a role calls a solid art tile walkable, or if a floor-variation tile
is solid. Floors get deterministic variation (70% base tile) so large surfaces
read without repeating.

The old `cart` role was removed: it mapped to `rubble`, which the tileset marks
non-solid, and the `hay_cart` prop replaces it.

## 4. Character animation mapping

Registered from `CharacterDefinitions.ts`, which records per-frame alpha
bounding boxes and excludes frames that would make the sprite bob or stretch.

| State | Source | Behaviour |
| --- | --- | --- |
| idle | row 0, 2 matched columns | loop, 3 fps |
| walk | row 1, 3–4 matched columns | loop, 9 fps, rate tracks movement speed |
| aim | row 2, column 0 | static; enemies in combat and holding position |
| fire | row 3 | one-shot recoil pose, 0.12 s |
| hit | row 4 | shown during the stumble |
| down | row 5 | the corpse, per archetype |

Excluded frames, with the measurement that disqualified each, are listed in
`CharacterDefinitions.ts` and asserted non-empty by `tests/assets.test.ts`.
Examples: `lookout_guard` walk column 0 has a 23×22 bbox against 30-tall
siblings (an 8px height jump); `enforcer` walk column 3 ends one row higher than
the rest (a 1px bob); `zealot_cultist` walk column 2 is 12px wide against 15–18.

### Missing animation states and their documented fallbacks

1. **No directional art.** Facing is expressed by horizontal mirroring, and only
   for left/right — aiming up or down keeps the previous mirror so the sprite
   never snaps for no reason. The package itself recommends this ("mirror or
   redraw for directional play").
   - For the **player**, aim direction is legible because the mouse crosshair is
     the aim, and the generated 8-direction weapon overlay points along it.
   - For **enemies**, facing matters for stealth, so `Enemy.drawAlert` renders a
     3px facing tick at the guard's look direction. Without it a patrol walking
     up or down the screen would have unreadable facing.
   - **Needed from the art pass:** 4-directional (ideally 8) idle and walk rows.
2. **No crouch art.** The crouch *mechanic* is untouched — speed 66 px/s,
   suspicion 45/s (28/s in shadow), unchanged collision. The visual cue is the
   HUD stance pip plus the supplied `eye`/`eye_hidden` concealment icon above the
   player. Deliberately **no** vertical squash (that would break the pixel
   contract) and **no** reuse of an unrelated row such as `fire`.
   - **Needed from the art pass:** a crouch row, ideally directional.
3. **Degenerate `down` frames.** `barnabe` down columns 0–1 carry 56 and 42
   opaque pixels, `suzanne` columns 0–1 carry 37 and 42 — effectively blank.
   Those characters are not instantiated in Valcendre; the frame picks avoid
   them, and this is flagged for cleanup.

## 5. Props integrated

All 12 Valcendre props are registered; 11 are placed (20 placements):
`fountain`, `hay_cart`, `tree` ×2, `bench`, `barrels` ×3, `flower_box` ×2,
`flower_pot` ×2, `lamppost` ×2, `clothesline` ×2, `french_flag`,
`village_cross`, `stone_cover` ×2.

Each prop carries explicit metadata: canvas size, feet inset, ground anchor,
depth class, collision footprint, `blocksMove`, `blocksSight`, cover level and
whether it is decorative.

**Collision is never the sprite rectangle.** A 32×32 tree is a 10×8 trunk. The
map generator rasterises each footprint into an invisible `propCollision` tile
layer, which feeds both the gameplay grid and the physics colliders. Consequences:

- no cover tile is drawn under a prop, so there are no duplicate visuals
  (`tests/map.test.ts` asserts the cover and propCollision layers never overlap);
- the generator's reachability flood-fill runs against real prop collision, so an
  oversized footprint **fails `npm run map`** rather than quietly walling off a
  route. It already caught one: a lamppost placed on patrol waypoint `wp_l2_2`.
- a tile is only claimed when the footprint overlaps it by ≥6px horizontally and
  ≥4px vertically, so a thin trunk cannot become a 16px wall.

Depth: `ground` draws below characters, `front` above (overhead laundry, flags),
and `sorted` is y-sorted with characters at `10 + y/10000`. That y-sorting gives
the behaviour the brief asked for — a character south of a tree trunk draws in
front of the canopy, one north of it draws behind — with no special-casing.

Two tile-cover pieces were **replaced** by props and their tiles removed:
the 2×2 `well` → `fountain`, the 2×1 `cart` → `hay_cart`.

## 6. Placeholder artwork still in use, and why

The package has no artwork for these gameplay objects. They are generated in
`src/art/textures.ts` at true pixel size with NEAREST filtering, and every one
is a live gameplay object that must not be deleted for want of art.

| Key | Object | Why |
| --- | --- | --- |
| `prop_van` | Suzanne's transport | The mission's central clue. No van in the package. 64×32, covers its four-by-two `van` cover tiles exactly, so no cover tile shows through. |
| `prop_medkit` | Health pickup | No medkit art. |
| `prop_ammo` | Pistol ammunition pickup | No ammo-box art. |
| `prop_radio` | Market radio distraction | No radio art. |
| `prop_doc` | Transport log, torn hymn page | No document art. |
| `gun` | 8-direction weapon overlay | The only directional art in the game; carries the player's facing. |
| `bullet`, `crosshair`, `px` | Projectile, cursor, bar fills | Trivial, not worth an art request. |

## 7. Hitbox work — and a coordinate-space bug this milestone fixed

The previous milestone replaced a point-plus-radius test with a ray/rectangle
test against the **drawn torso** rectangle. Writing the four-cardinal-direction
and cover-boundary tests the brief asked for exposed that this was still wrong.

This game is top-down with a 2D tile grid, so gameplay geometry is only
meaningful in the **ground plane**: an actor's `y` is a position on the ground,
not a height. Resolving a shot against a screen-space torso rectangle in that
same space puts the ray roughly one tile north of the ground line — so **bullets
sailed over cover standing between the two actors**. Four harness assertions
failed on exactly that, in all four directions.

The model now separates the two readings of the same 12×18 box:

- `bulletHitbox(x, y)` — ground plane, centred on the actor. All occlusion and
  hit tests use this, in the tile grid's own space.
- `drawnTorso(x, y)` — screen space, `y-24`…`y-6`. What the player sees.
- `aimOrigin(x, y)` — centre of the drawn torso, `y-15`.

The pipeline: the aim angle is measured in **screen space** from the shooter's
`aimOrigin` to the crosshair; the shot is then resolved in the **ground plane**
from the shooter's position. Because both actors are drawn with the same
vertical offset, that angle equals the ground-plane angle to the target — so
"aiming at the visible torso hits" and "cover blocks what it visually blocks"
are both true at once. Tracers, impacts, blood and enemy projectiles are drawn
with `TORSO_OFFSET_Y` applied; projectiles keep their logical position in the
ground plane and only the sprite is offset.

This also removed a hack: enemies previously aimed at the hurtbox centre because
the old sight origin sat on the box's bottom edge and produced grazing shots.
They now simply aim at the player's ground position.

Vision was moved to the ground plane too (it previously ran 6px north of the
true line), so a guard's sight line is blocked by exactly the cover the player
can see between them — asserted by the "LOS and bullets agree" case.

Four distinct concepts, as the brief required:

| Concept | Shape | Space |
| --- | --- | --- |
| Movement collider | 12×10 at the feet (Arcade body) | ground |
| Bullet hitbox | 12×18 centred on the actor | ground |
| Vision origin | the actor's position | ground |
| Shooting origin | the actor's position (angle from `aimOrigin`) | ground (angle from screen) |

### F3 debug overlay

| Drawn | Meaning |
| --- | --- |
| Cyan / blue solid box | Player / enemy movement collider |
| Green / magenta solid box | Player / enemy ground-plane bullet hitbox |
| Pale dashed box | The drawn torso rectangle those correspond to |
| White / yellow cross | Player / enemy ground position (vision + shot origin) |
| Light blue cross | The player's `aimOrigin`, showing the render offset |
| Grey / red line | Last 32 shot rays, red when the ray connected |

### Tests

`tests/hitbox-directions.test.ts` reproduces the full pipeline and covers: hits
from all four cardinal directions, four diagonals and point blank; misses below,
above, beside and behind; range limits; cover in the line of fire from all four
directions; cover one tile off the line; low cover stopping bullets while only
hiding a crouched target; an enemy hugging its own cover being unhittable until
flanked; and agreement between line of sight and bullets.
`tests/hitbox.test.ts` covers both box readings and the slab intersection,
including the regression guard for the original point-plus-radius test.

## 8. UI, portraits and effects

- **Font.** The supplied 5×7 glyphs are blitted 1:1 from the 8×8 cell grid and
  recoloured with a `source-in` composite — no scaling, no browser font
  rendering anywhere in game. `CHARSET` is asserted identical to the shipped
  `font.json`, including every `character_to_index` entry, and a test checks that
  every string the game renders is covered. 6px advance, 9px line height.
  Lowercase folds to uppercase and accents fold to ASCII, per `font.json`.
- **Nine-slice panel.** Used for the dialogue box (480×56) and the pause menu
  (432×230). 16px borders need ≥32px in both axes, so corners are drawn 1:1 and
  only the middle strips stretch. The small HUD strips (objective line, prompt,
  clue toast) are 11px tall — below that minimum — so they keep flat translucent
  fills rather than a stretched panel.
- **Portraits.** All seven registered. Tempest's appears in dialogue; Suzanne,
  Barnabé and the lookout are mapped and ready for later levels. They are drawn
  1:1, centred in a fixed 65×54 slot, which is what absorbs the per-file size
  differences. Dialogue only — never a permanent HUD element.
- **Awareness.** Per-enemy state uses the `alert_question` / `alert_suspicious` /
  `alert_detected` icons above each guard, alongside the existing suspicion arc,
  so the cue is carried by shape as well as colour. The 4-frame awareness strip
  (`?`, `!`, `!!`, detected-eye — read from the artwork) shows the highest alert
  in the level, top-right.
- **Muzzle flash** plays at `Player.muzzlePoint`, along the aim beyond the weapon
  overlay — not at the player's feet. 4 frames at 24 fps finishes well inside the
  0.36 s pistol interval, so it never sits on a target.
- **Blood** plays at ground-plane impact points, lifted by `TORSO_OFFSET_Y`.
- **Concealment** uses `eye` / `eye_hidden`; **interaction** marks the object the
  bottom-of-screen prompt refers to.
- **Belial** is registered and dimension-validated (256×256, 4×4 of 64×64, rows
  idle/grasp/blast/hit). Not instantiated. `belial_full_concept_crop.png` is
  opaque concept art and is deliberately **not** a runtime asset.

## 9. Pixel-rendering

480×270 virtual resolution, 16×16 tiles, 24×32 characters, `pixelArt: true`,
`roundPixels: true`, NEAREST forced on every loaded texture after load.

Scaling prefers **integer** zoom: `Phaser.Scale.NONE` with
`zoom = floor(min(w/480, h/270))`, centred and letterboxed, so every game pixel
is exactly N×N screen pixels. **Documented fallback:** when the viewport is
smaller than one full 480×270, integer scaling would crop the playfield, so the
game switches to `FIT` — the one place a fractional factor is accepted, because
showing the whole level matters more than per-pixel crispness there.

Sprite origins resolve to whole pixels: characters use `31/32` vertically
(31 is an integer), and `tests/assets.test.ts` asserts every prop anchor lands
on a whole pixel.

## 10. Asset problems for the art-generation agent

Ordered by impact.

1. **No directional character art** (blocking). 4 columns are poses, not
   directions. Needs 4- or 8-directional `idle` and `walk` rows per character.
2. **No crouch row** (blocking for stealth readability). The mechanic works but
   looks identical to standing.
3. **Frame registration drift within rows.** Measured bbox outliers:
   `lookout_guard` walk col 0 (23×22 vs ~30 tall), `enforcer` walk col 3 (ends
   1px higher), `zealot_cultist` walk col 2 (12px wide vs 15–18),
   `barnabe` idle col 0 (3px shorter). Currently worked around by excluding them.
4. **Degenerate `down` frames**: `barnabe` cols 0–1 and `suzanne` cols 0–1 are
   near-empty (37–56 opaque pixels).
5. **Characters are not palette-limited pixel art.** ~5,500–6,600 unique colours
   across ~6,700 opaque pixels per sheet — effectively a downscaled render, not
   authored pixels. Alpha is hard-edged (good), but the interiors will not hold
   up next to the genuinely authored 12-colour tilesets.
6. **Portraits are irregular and opaque**: 61–65 × 52–55, zero transparency.
   A uniform size with an alpha background would let them composite cleanly.
7. **`village_cross_16x32` wastes half its canvas** — the art occupies only rows
   16–31, so it is effectively a 16×16 sprite in a 16×32 file.
8. **`manifest.json` origin y is ambiguous**: it states `[12, 30]`, and the
   lowest opaque pixel is indeed row 30, with row 31 transparent. The integration
   uses a `feetInset` of 1 to make that explicit. Worth stating in the manifest.
9. **No artwork for the van, medkit, ammo box, radio or documents** — see
   section 6. These are gameplay objects on the critical path.
10. **`cart`-style props contradict tileset hints**: `rubble` is marked
    non-solid, which is reasonable for rubble but meant it could not back an
    authored cover role. Cover-capable tiles are limited to `cover_low`,
    `cover_high`, `hedge` and `pillar`.

---

# Phase B.1A — visual diagnostics and engine corrections

## 11. Transparency diagnosis

**Verdict: the reported transparency is not in the PNGs. The visible defects
were in the engine, plus two minor art contributors.**

### Evidence that the source art is opaque

| Measurement | Method | Result |
| --- | --- | --- |
| Partial-alpha pixels (alpha 1–254), all 7 sheets | `inspect-assets.py alpha` | **0** |
| Sprite alpha below 1 on any character | code audit of every `setAlpha`/`alpha` use | **none** |
| Non-NORMAL blend mode on any character | code audit of every `setBlendMode` use | **none** |
| Tint left applied | `setTintFill`/`setTint` are hit flashes with `clearTint` on a timer | temporary only |
| Visual check over magenta | `diagnostics.py contact` | bodies and clothing **solid** |

Contact sheets over white, black, magenta and real cobblestone:
`docs/diagnostics/transparency/<name>_contact.png`. Per-pixel alpha
classification, with enclosed holes painted magenta:
`<name>_alphamap.png`. Magenta is the decisive background — any genuine
see-through would be unmissable, and there is none.

### What actually looked wrong, and why

Four engine defects, all fixed:

1. **The idle animation alternated between facing the camera and facing away.**
   Phase B picked idle columns `[1, 2]` for every character. On tempest, column 1
   is a FRONT view and column 2 is a BACK view, so at 3 fps the character spun
   front/back twice a second. This is the most likely source of "the character
   looks wrong / see-through" — the body silhouette changed every frame.
   *Fixed:* directional clips, with front frames in `idle.down` and back frames
   in `idle.up`. `tests/assets.test.ts` guards against a clip ever mixing them.

2. **Mirroring fought the art.** Facing was derived from the aim angle and
   applied as a blanket `flipX`. But tempest's walk row is drawn facing **left**
   and the lookout's facing **right**, so one of them was always reversed —
   legs striding one way while the weapon overlay pointed the other.
   *Fixed:* each clip records its intrinsic facing and whether it needs
   mirroring; the actor applies the clip's flag, never a guess.

3. **Overhead props were drawn across characters' bodies.** `clothesline` and
   `french_flag` sit at fixed depth 22 (above characters) but were anchored at
   ground level, so a 32×16 laundry line at 85% fill was composited over the
   player's torso and legs. Two clotheslines were placed on walking routes —
   the market and the arrival alley. A character with an environment element
   drawn across their body reads exactly as "the environment is showing through
   them".
   *Fixed:* `overheadLift` in the prop metadata raises overhead props clear of a
   31px character (32px for laundry, 26px for wall-mounted flags), while depth
   sorting still uses the ground anchor.

4. **A translucent foreground tile layer.** `decorFront` was created at
   `alpha 0.92`. It is empty in this slice, so it was latent rather than active,
   but any tile placed on it would have tinted every character underneath by 8%.
   *Fixed:* full opacity. Characters in front of foreground art are handled by
   depth sorting, not by making the art see-through.

### Art-side contributors (handed off, not worked around in the art)

- **CHAR-003** — the `down` row has an opaque dark region that is not the body.
  Corpses now use the purpose-made `props/shared/body_*.png` instead, which are
  properly matted. The character sheets were not modified.
- **CHAR-004** — matting speckle: enclosed transparent holes, worst case a 44px
  hole in `enforcer` idle column 0. In Valcendre's two instantiated characters
  the used frames have holes of ≤4px, which is not visible in play.

## 12. Environmental audit — why Valcendre looked repetitive

Both causes were real, and they are separable.

### Cause A: genuinely missing artwork (handed off)

`inspect-assets.py tilediff` grouped tiles within a mean per-channel difference
of 6/255: **only 28 of the 48 tiles are visually distinct.** Six of the ten named
wall pieces are the same image, and six of the eight floor tiles are the same
image. The tileset has one door, one window, a flat roof tile and a roof edge —
no facades, shutters, shopfronts, roof ridges, eaves, ground transitions or
environmental shadows. All four stage tilesets share a byte-identical schema.

No amount of composition fixes that. See **ENV-001**, **ENV-002**, **ENV-003**,
**ENV-004**, **ENV-005**.

### Cause B: implementation mistakes (fixed)

The diagnostic renders made these obvious — `docs/diagnostics/map/`:

| Problem | Fix |
| --- | --- |
| `void` mapped to `roof`, a **red brick** tile, so the entire out-of-bounds area was a loud red-brick field that dominated every screenshot | out-of-bounds is now a dark fill; red roof tiles are used as a 2-tile *roof band* just outside wall faces, where they read as French tile roofs |
| Floor variation ran at 30% using `floor_inlay`, a **framed decorative diamond** — the market square read as patterned wallpaper | variant chance cut to 5–22% per area; motif tiles removed from random variation and placed deliberately as accents |
| `concrete` → `metal` (grey vertical stripes) used for **both** the outdoor yard and the garage interior | yard is gravel, garage interior keeps metal |
| `floor_stain` (red blood spatter) scattered across the yard at 5% | removed — blood is an Abbey/Ascension escalation in the locked design, not village set dressing |
| Buildings were a uniform 1-tile ring of identical `wall_solid` | architecture band: wall face → roof edge → roof → darkness, with a deterministic window rhythm (17 windows) and 7 authored doors |
| Every area shared one surface, so all six looked alike | per-area surfaces: alley cobble, market paving, garden grass + path, service **red brick**, yard gravel, garage metal, road dirt |
| 20 props clustered in the market and yard | 37 placements, all 12 Valcendre props used, spread across every authored area |

### Architecture: appearance is now independent of collision

This was the structural fix that made the rest safe.

- `collision` is **invisible** and carries one blocker tile per non-walkable
  tile, derived purely from the carved regions.
- `architecture` is **visible** and is never a collider.
- `MapLoader` merges tile flags from an **allowlist** of gameplay layers only
  (`collision`, `cover`, `propCollision`, `shadowZones`).

So repainting the village cannot change where the player walks — and a
decorative tile can no longer leak a gameplay role's flags, which was a live
footgun: painting the dark `deep_shadow` tile outside the map would otherwise
have made every authored shadow zone solid.

All gameplay geometry is preserved by construction: regions, patrol routes,
cover, objectives, waypoints and exits are untouched, and the generator still
fails the build if any walkable tile, object anchor or waypoint becomes
unreachable.

## 13. F3 debug view

Disabled by default, drawn into its own `Graphics` object, and it touches no
production sprite's alpha, tint, depth or blend mode.

| Drawn | Meaning |
| --- | --- |
| Cyan / blue solid box | Player / enemy movement collider (12×10 at the feet) |
| Green / magenta solid box | Player / enemy ground-plane bullet hitbox (12×18) |
| Pale dashed box | The drawn torso rectangle those correspond to |
| White / yellow cross + 3×3 dot | Player / enemy ground position and **feet anchor** |
| Light blue cross | The player's aim origin, showing the render offset |
| Yellow line from each guard | Vision origin and cone centre |
| Pink tile outline | Solid + vision-blocking |
| Green tile outline | Low cover (bullets always, sight only when crouched) |
| **Orange** tile outline | **Prop-derived** collision — distinct from authored cover, so an oversized footprint is obvious |
| Indigo tile outline | Concealment zone |
| Grey / red ray | Last 32 shot rays, red when the ray connected |

Only on-screen tiles are drawn, so the overlay costs nothing off-camera.

---

# Task 02 — Tempest directional sheet integration

## 14. What changed

Tempest moved from the pose-atlas format to the two Art Task 01 directional
sheets. Nothing else moved: the other six characters, the tilesets, props,
level layout and gameplay mechanics are untouched.

| File | Change |
| --- | --- |
| `src/art/AssetRegistry.ts` | Generalized `CharacterSheetSpec` / `CHARACTER_SHEETS`: a character may own several sheets in either format. Tempest registers the two 144×160 sheets; the other six keep one 96×192 sheet each |
| `src/art/CharacterDefinitions.ts` | `Clip` gains `sheet` and `weapon`. Directional row table, distinct-pose table, `dirClip`, Tempest's definition, measured muzzle offsets. Legacy defs now build clips via `atlasClip(name)` |
| `src/art/AnimationRegistry.ts` | Animation frames carry their own texture key, so a character can span sheets. `staticFrame` returns `{ sheet, frame }` |
| `src/actors/Player.ts` | Directional state machine, weapon-ready timer, weapon rule, muzzle from the drawn barrel. **Gun overlay removed** |
| `src/actors/Enemy.ts` | Uses the new `staticFrame` shape; otherwise unchanged |
| `src/art/textures.ts` | `GUN_KEY` and the 8-direction overlay generator deleted |
| `src/scenes/Village.ts` | Dropped the overlay depth-sort line |
| `tests/tempest-directional.test.ts` | New: 30 assertions covering the whole task checklist |
| `tests/assets.test.ts` | Format-aware; legacy expectations scoped to the six pose-atlas characters |

The superseded `tempest_24x32_4x6.png` is **left on disk untouched** and simply
no longer registered. The engine agent does not delete production artwork.

## 15. Verification of the delivery

Measured independently with `tools/inspect-assets.py`, not taken on trust:

| Claim | Verified |
| --- | --- |
| Both sheets 144×160, 6×5 of 24×32, 30 frames | yes |
| Content bottom on row 30, row 31 transparent, all 60 frames | yes |
| Alpha binary (0 or 255 only) | yes — 0 partial-alpha pixels |
| Palette within 24 colours | yes — 22 and 23 |
| Heights constant 26px, widths constant per row | yes — so the figure cannot bob or pulse |
| Distinct poses: idle 2, walk 6, aim 1, fire 3 | yes — by byte comparison; held slots are **identical** to slot 0 |
| Down front, up back, all side rows +X | yes — 7× contact sheet |
| Enclosed holes | 12 of 1–3px, the intentional between-leg voids the report declares |

## 16. Animation mapping

| Animation | Sheet | Row | Frames used | FPS | Loop |
| --- | --- | --- | --- | --- | --- |
| `idle_down` | A | 0 | 0, 1 | 3 | yes |
| `idle_up` | A | 1 | 6, 7 | 3 | yes |
| `idle_side` | A | 2 | 12, 13 | 3 | yes |
| `walk_down` | A | 3 | 18–23 | 9 | yes |
| `walk_up` | A | 4 | 24–29 | 9 | yes |
| `walk_side` | B | 0 | 0–5 | 9 | yes |
| `aim_side` | B | 1 | 6 | static | no |
| `aim_down` | B | 2 | 12 | static | no |
| `aim_up` | B | 3 | 18 | static | no |
| `fire_side` | B | 4 | 24, 25, 26 | 18 | no |

Only the distinct leading slots are animated. Animating all six slots of a
two-pose idle row would hold the first pose for five frames out of six.

Walk frame rate still tracks movement speed, as before: 80 ms/frame sprinting,
110 walking, 150 crouching.

State selection in `Player.updateAnimation`:

```
fireFlash > 0      -> fire   (0.12 s after each shot)
moving             -> walk
weaponReady > 0    -> aim    (1.2 s after firing or while the fire button is held)
otherwise          -> idle
```

The 1.2 s weapon-ready window exists so the aim pose does not drop between
shots at the pistol's 0.36 s cadence, which would flick the drawn pistol in and
out.

## 17. Directional aiming and the weapon rule

**Facing.** Four body facings are selected from the exact aim angle by
`facingFromAngle`. `down` is the authored front view, `up` the authored back
view; the side rows are authored facing +X and mirrored for left. Front and back
frames are never mirrored, and front-facing art is never used to represent
facing away — both are asserted by tests.

**Eight-direction aiming is unchanged.** `Player.aim` remains the exact mouse
angle and is what drives hitscan, the aim origin and the tracer. Only the body
pose quantises, to the nearest of the four authored facings:

| Mouse angle | Body facing |
| --- | --- |
| 0° (right) | right |
| 45°, 90° | down |
| 135°, 180° | left |
| 225°, 270° | up |
| 315° | right |

No hitscan mathematics were changed to compensate. A diagonal aim row is
requested as **CHAR-006**.

**Weapon rule — exactly one pistol, ever.** Each clip declares where its weapon
comes from:

| Clip | `weapon` | Rendering |
| --- | --- | --- |
| `aim_*`, `fire_*` | `in-frame` | the artwork contains the pistol; nothing is drawn over it |
| `idle_*`, `walk_*` | `none` | the weapon is lowered in the pose; nothing is drawn |

The separate 8-direction gun overlay was **deleted outright** —
`GUN_KEY`, its generator, the `Player.gun` object and its depth-sort line are all
gone. Two pistols therefore cannot be drawn simultaneously by construction, not
merely by a visibility flag. A test asserts no clip ever requests `overlay`.

**Muzzle flash** is placed on the barrel drawn inside the frame, using offsets
measured from the delivered sheets rather than projected along the aim angle:

| Facing | Offset from the feet anchor | Source |
| --- | --- | --- |
| right | (+11, −13) | rightmost weapon-metal pixel of `aim_side` / `fire_side`, frame (23, 17) |
| left | (−11, −13) | mirror of the above |
| down | (0, −10) | weapon pixels of `aim_down`, rows 20–26 |
| up | (+3, −20) | weapon pixels of `aim_up`, rows 9–11 |

The left offset is 1px inside the exact mirrored tip: flipping a 24-wide frame
maps column *c* to 23−*c*, so an integer anchor at x=12 lands at x=11 when
mirrored. 1px on a 16px flash at native resolution is not visible, and the
symmetric relation is what the test pins.

## 18. Gameplay alignment and crouch

The delivered anchor (12, 30) with row 31 transparent is exactly the inset the
engine already assumed, so **no world offset changed**: `CHAR_FEET_INSET` is
still 1 and the sprite origin is still 31/32 vertically, an integer 31px. The
movement collider, bullet hitbox, ground/aim origins, cover interaction,
movement speeds and stealth detection rates are all untouched. Every delivered
frame has a 26px silhouette ending on row 30 and no clip applies its own offset,
so switching between idle, walk, aim and fire cannot make the feet jump.

**Crouch** keeps the existing fallback: the standing art, unmodified. No squash,
no scale, no distortion, and no reuse of an unrelated row. Crouch speed,
detection rates, concealment and the HUD stance pip are unchanged. Art Task 03
delivers the crouch row; Step 04 integrates it.

**Backward compatibility.** The other six sheets, their metadata and their
loaders are untouched, and a test asserts all six are still `pose-atlas-4x6`
with 24 frames and clips pointing at their own single sheet. No save or
serialisation format changed, so existing Valcendre checkpoints remain valid.
