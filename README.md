# TEMPEST — Phase A vertical slice

Top-down tactical stealth shooter. This repository currently contains **Phase A only**:
the Valcendre arrival alley, market square and transport garage as one contiguous map,
with movement, the suppressed pistol, three Lookouts, stealth/cover/noise, one authored
distraction, fixed supplies, the van clue chain, checkpoints and the north-road exit.

Per the locked spec's deliverable sequence, no other level is built yet.

## Running it

```bash
npm install          # requires registry access (see "Known blocker")
npm run dev          # http://127.0.0.1:5173
npm test             # detection, cover, objective-gate and map-contract tests
npm run build        # typecheck + static build into dist/
```

`npm run dev` and `npm run build` regenerate `assets/maps/village.json` first.

### Known blocker

`npm install` currently fails with `E401 Unable to authenticate` against the configured
CodeArtifact registry (`amazon-149122183214.d.codeartifact.us-west-2.amazonaws.com`).
Refresh the registry token, then install. Nothing in the source needs changing.

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
| F3 | Toggle the hitbox debug overlay |

### Hitbox debug overlay (F3)

| Drawn | Meaning |
| --- | --- |
| Cyan box | Player movement collider (12×10, at the feet) |
| Green box | Player torso hurtbox (12×18, y−24 to y−6) |
| Blue box | Enemy movement collider |
| Magenta box | Enemy torso hurtbox |
| White / yellow cross | Player / enemy sight origin (AI vision, muzzle) |
| Grey / red line | Last player shot rays — red when the ray hit a hurtbox |

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
  main.ts                 Phaser config: 480x270 virtual pixels, FIT + nearest neighbour
  core/
    constants.ts          Every tuning value from the locked spec, in one place
    Grid.ts               Occlusion, line of sight, hitscan, bounded A* (Phaser-free)
    hitbox.ts             Torso hurtbox + ray/rect intersection (Phaser-free)
    MapLoader.ts          Tiled layers -> gameplay Grid via per-tile properties
  art/textures.ts         Deterministic placeholder pixel art (16px tiles, 24x32 chars)
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
  ui/{font,HUD,DialogueBox,PauseMenu}.ts
  data/{weapons,enemies,objectives,dialogue}.ts
  scenes/{Boot,Title,Village}.ts
tools/build-map.mjs       Authored geometry -> Tiled JSON, with reachability assertions
tests/                    Grid, Vision, Objectives and map-contract tests
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
- **Three separate collision concepts.** Movement collision is the small 12×10 box at
  the feet, so walking through doorways feels right. Bullets are judged against a
  dedicated 12×18 torso hurtbox (`core/hitbox.ts`) by exact ray/rectangle
  intersection — what you read as the body is what a shot has to cross. AI vision
  and muzzle positions use a third, separate sight origin, kept low inside the feet
  body so it can never land in a wall tile an actor is hugging. Shooters aim at the
  hurtbox centre rather than the sight origin, which sits on its bottom edge. Press
  F3 to see all three at once.
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
