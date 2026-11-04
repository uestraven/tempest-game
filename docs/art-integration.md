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
