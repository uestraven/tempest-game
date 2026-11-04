# Tempest directional integration — diagnostic renders

**TEST IMAGES ONLY.** Not production assets, not loaded by the game.

These are **static composites, not Phaser screenshots**: `npm install` is
blocked in this environment, so the game cannot be launched. What they do verify
is real, though — they are driven by the **engine's own resolved clip table**,
dumped from `src/art/CharacterDefinitions.ts`, composited over the actual
generated Valcendre map with the actual tileset and props. So frame selection,
mirroring, facing, feet anchoring and muzzle placement are all exercised.

What they do **not** exercise: input, physics, depth sorting against moving
actors, the HUD, FX timing, or anything in Phaser's render path.

| File | Shows |
| --- | --- |
| `01_idle_four_facings` | Standing down / up / left / right |
| `02_walk_four_facings` | Walking, mid-cycle, all four facings |
| `03_aim_four_facings` | Aiming, all four facings |
| `04_walk_cycle_<facing>` | All six walk phases of each facing |
| `05_aim_eight_octants` | All eight mouse octants with the crosshair at the exact angle and the body at the nearest authored facing |
| `06_fire_recoil_and_muzzle` | Three recoil phases, left and right, with the muzzle flash on the drawn barrel |
| `07_layering_against_facade` | Against a building facade, a stall counter and props |
| `08_crouch_fallback` | The temporary crouch fallback: standing art reused unmodified |
| `09_inspection_6x` | All of the above at 6× over real cobblestone, for close inspection |

Regenerate with:

```bash
# dump the engine's clip table, then render
node --experimental-strip-types -e "...CharacterDefinitions..." > /tmp/tempest-clips.json
python3 -I tools/diagnostics.py tempest
```
