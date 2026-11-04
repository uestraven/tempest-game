# TEMPEST — Valcendre vertical slice (production art)

Top-down tactical stealth shooter. This repository contains the Valcendre
vertical slice — arrival alley, market square and transport garage as one
contiguous map — with movement, the suppressed pistol, three Lookouts,
stealth/cover/noise, one authored distraction, fixed supplies, the van clue
chain, checkpoints and the north-road exit.

The placeholder art has been replaced with the `TEMPEST_pixel_art_v1` production
package. **Read [docs/art-integration.md](docs/art-integration.md)** for the
asset architecture, the animation mapping, the tileset mapping, what is still a
placeholder, the Phase B.1A transparency diagnosis and the environmental audit.

Outstanding artwork is specified in
[docs/art-requests/phase-b1.md](docs/art-requests/phase-b1.md) (and
[`phase-b1.json`](docs/art-requests/phase-b1.json)). Supporting measurements are
in [docs/diagnostics/](docs/diagnostics/) — test images only, never shipped.

Per the locked spec's deliverable sequence, no other level is built yet.

## Running it

```bash
npm install          # requires registry access (see "Known blocker")
npm run dev          # http://127.0.0.1:5173
npm test             # detection, cover, objective-gate and map-contract tests
npm run build        # typecheck + static build into dist/
```

`npm run dev` and `npm run build` regenerate `public/assets/maps/village.json`
first. That generator is also a gate: it fails the build if a tile role, a cover
piece or a prop footprint makes any walkable tile, object anchor or patrol
waypoint unreachable from the spawn point.

### Known blocker

`npm install` fails with `E401 Unable to authenticate` against the configured
CodeArtifact registry (`amazon-149122183214.d.codeartifact.us-west-2.amazonaws.com`).
Refresh the registry token, then install. Nothing in the source needs changing.

Because of that, `npm test`, `npm run build`, `npm run dev` and `npm run preview`
have **not** been run against this tree, and no screenshots have been captured.
The Phaser-free half (grid, hitboxes, vision, objectives, asset registry,
character/tileset/prop metadata, font charset, generated map) was verified
out-of-band under Node's type stripping: 742 assertions, all passing. Anything
that needs Phaser or a browser is unverified.

## Controls

| Input | Function |
| --- | --- |
| WASD | 8-direction movement, normalised diagonals |
| Mouse | Aim independently of movement |
| Left mouse | Fire |
| R | Reload (cancelled by weapon swap or takedown) |
| C | Toggle crouch |
| Shift (held) | Sprint (automatically exits crouch) |
| E | Interact / silent takedown |
| 1 / 2 | Pistol / shotgun (shotgun unlocks in Level 2, not in this slice) |
| Esc | Pause — objective recap, controls, K restart checkpoint, Q quit to title |
| F3 | Toggle the debug overlay (off by default) |

### Debug overlay (F3)

Off by default. Drawn into its own `Graphics` object, so it cannot affect
production rendering.

| Drawn | Meaning |
| --- | --- |
| Cyan / blue solid box | Player / enemy movement collider (12×10, at the feet) |
| Green / magenta solid box | Player / enemy ground-plane bullet hitbox (12×18) |
| Pale dashed box | The drawn torso rectangle those correspond to (y−24 to y−6) |
| White / yellow cross + dot | Player / enemy ground position and feet anchor |
| Light blue cross | The player's aim origin, showing the render offset |
| Yellow line from a guard | Vision origin and cone centre |
| Pink / green / orange / indigo tile outline | Solid · low cover · **prop-derived** collision · concealment zone |
| Grey / red line | Last 32 shot rays — red when the ray connected |

## Testing both routes

The slice is built so either approach completes it:

- **Action route** — arrival alley → market square → corridor → garage yard → garage.
  Cover is market stalls, a parked cart, the stone well and low limestone barriers.
  A pistol ammo box sits at the yard crossroads and a medkit between the market stalls,
  so a fully loud run resupplies without entering the stealth route.
- **Near-zero-shot route** — arrival alley → shadowed west garden lane → market north
  edge → bakery rear nook → rear service corridor → garage rear. The third Lookout
  patrols both the garage door and the rear corridor mouth, so it must be timed,
  distracted with the market radio, or taken down. Nothing mandatory requires a kill.

Neither the van, the transport log nor the exit depends on any enemy, so no enemy can
be made to hold a mandatory flag.

## Architecture

```
src/
  main.ts                 Phaser config: 480x270, integer zoom, nearest neighbour
  core/
    constants.ts          Every tuning value from the locked spec, in one place
    Grid.ts               Occlusion, line of sight, hitscan, bounded A* (Phaser-free)
    hitbox.ts             Ground-plane hitbox, drawn torso, ray/rect (Phaser-free)
    MapLoader.ts          Tiled layers -> gameplay Grid via per-tile properties
  art/
    AssetRegistry.ts      Every texture key, path and measured dimension
    AssetLoader.ts        Preload + post-load validation, NEAREST enforcement
    AnimationRegistry.ts  Character and FX animations from explicit metadata
    CharacterDefinitions  Sheet layout, measured frame picks, origins
    PropDefinitions.ts    Prop size, anchor, depth, collision footprint, cover
    TilesetRegistry.ts    48-tile schema and gameplay-role -> tile mapping
    textures.ts           The few generated placeholders the package lacks
    data/*.json           Prop and tile-role data, shared with the map generator
  actors/{Player,Enemy}.ts
  systems/
    Vision.ts             Cone, suspicion rates, alert levels (Phaser-free)
    Hearing.ts            Sound bus with wall attenuation for non-gunshots
    Combat.ts             Player hitscan, tracers, visible enemy projectiles
    Interaction.ts        Single context prompt; takedown beats generic props
    Objectives.ts         Event-driven, idempotent objective state machine
    Save.ts               Versioned localStorage snapshots
    Audio.ts              Procedural SFX placeholders
    Camera.ts             Follow camera, small dead zone, pixel snapping
  ui/{font,font-data,HUD,DialogueBox,PauseMenu}.ts
  data/{weapons,enemies,objectives,dialogue}.ts
  scenes/{Boot,Title,Village}.ts
tools/build-map.mjs       Authored geometry -> Tiled JSON, with reachability assertions
tests/                    Grid, Vision, Objectives, hitbox, asset and map tests
tools/inspect-assets.py   Dependency-free PNG inspector used to measure the art
art-source/               Art package sources, references and previews
public/assets/            Runtime art, by category
```

### Notable implementation choices

- **No binary assets.** Tiles, characters, the gun overlay, props and the HUD font are
  all drawn as literal pixels into canvas textures at their true size. Swapping in
  hand-drawn sheets of the same dimensions needs no code change beyond the loader.
  The 3x5 bitmap font exists so HUD text is as crisp as the world art — no browser
  font rendering is used anywhere in game.
- **Map geometry is authored, not generated.** `tools/build-map.mjs` writes the Tiled
  JSON from hand-written region, cover, waypoint and object tables, and fails the build
  if any object anchor or walkable tile is unreachable from the spawn point.
- **One gameplay space, one rendering offset.** Movement collision is the small
  12×10 box at the feet. Bullets are judged against a 12×18 body hitbox by exact
  ray/rectangle intersection — in the **ground plane**, the same space as the tile
  grid, so cover blocks exactly what it visibly blocks. The aim angle is the only
  screen-space step: it is measured from the centre of the shooter's *drawn* torso
  to the crosshair, which (because both actors share the same render offset) equals
  the ground-plane angle to the target. That is what makes "aim at the visible
  torso" and "cover stops the shot" true at the same time. Press F3 to see every
  box and origin at once; `docs/art-integration.md` §7 has the full reasoning.
- **Occlusion has one source of truth.** The gameplay `Grid` is derived from the same
  tile properties the renderer draws, so cover you can see always matches cover that
  blocks. High cover blocks all sight; low cover blocks bullets always and sight only
  of a crouched player.
- **Bounded timestep.** Gameplay steps in fixed 1/60 s increments (max 5 per frame), and
  edge-triggered inputs are applied on the first substep only, so a keypress can never
  be handled twice.
- **Phaser-free detection core.** `Grid`, `Vision` and `Objectives` have no Phaser
  imports, which is what lets the detection, cover and gate rules be unit tested.

## Spec conformance notes for this slice

Implemented: virtual resolution and scaling contract, 16px grid with ≥2-tile openings,
feet-anchored sprites with a 12x10 foot collision body, four-directional art plus an
8-direction gun overlay, movement speeds and stance rules, pistol combat contract,
vision cone and suspicion calibration, hearing radii with investigate-at-source
behaviour, body discovery triggering a local search, contextual takedown with rear-arc
and non-combat requirements, authored distraction, fixed supplies with the level-start
ammo floor, idempotent objective gates, checkpoints restoring HP/resources/enemies/
objectives/pickups, versioned localStorage, HUD layout, pause recap, alert cues readable
by shape as well as colour, and audio cues with visual subtitles.

Deliberately not in this slice (later phases per the spec): the prologue and the other
three levels, the shotgun pickup, Enforcer/Zealot/Ascendant placements, the V4 martyrdom
beat, authored music and final art, and the Cloudflare Pages deployment step.
