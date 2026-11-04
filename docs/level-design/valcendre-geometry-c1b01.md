# Valcendre geometry — Phase C.1B-01 as built

Implements §2 of [`valcendre-rework.md`](valcendre-rework.md). **Geometry only**:
no new objectives, enemies, encounters, checkpoints, animations or artwork.

All figures below are measured from the generated
`public/assets/maps/village.json` by running the engine's own `Grid` A*, not
copied from the design document.

---

## 1. Dimensions

| | Before (C.1A) | After (C.1B-01) |
| --- | --- | --- |
| Map | 60 × 40 tiles · 960 × 640 px | **104 × 72 tiles · 1664 × 1152 px** |
| Walkable tiles | 1 027 | **2 725** (2.65×) |
| Tiles removed by buildings | — | 143 |
| Objects | 63 | 98 |
| Props placed | 37 | 61 |
| Windows / doors | 36 / 7 | 38 / 18 |

## 2. Areas as built

| Area | Tile rects | Walkable |
| --- | --- | --- |
| Arrival alley | `6,58 10×11` + neck `11,56 5×2` | 117 |
| Market square | main `13,38 22×14`, plaza `16,32 16×6`, approach `13,52 12×5`, west arcade `9,40 4×10`, east lane `35,47 8×3` | 497 |
| Bakery / garden route | passage `16,31 4×1`, yard `6,20 15×11`, wall walk `6,3 6×20`, upper lane west `11,3 18×4`, jog `26,6 6×16`, east `30,16 10×4`, north `37,8 6×9`, final `42,8 10×4`, descent `46,11 6×16` | 639 |
| Main street | `43,46 36×11` + depot gate `75,44 4×2` | 368 |
| Depot courtyard | north `56,20 30×6`, mid `50,26 32×4`, west `50,30 2×9`, east `59,30 23×9`, south `50,39 32×5` | 627 |
| Depot office | interior `53,31 5×7` + door `55,38 2×1` | 37 |
| Garage interior | `58,6 27×13` + door `81,19 3×1` | 333 |
| Loading dock | `84,10 7×11` | 77 |
| North road (exit) | `60,0 5×6` | 30 |

Seven buildings and interior walls were carved back out to break sight lines:
two market halls, two main-street blocks creating a dog-leg, three courtyard
structures, and a garage workbench.

## 3. Connectivity

```
                      [NORTH ROAD / EXIT]  60-64, 0-5
                               |  (only opening is the garage's north wall)
                      [GARAGE INTERIOR]  58-84, 6-18
                        |              \
            garage door 81-83,19        [LOADING DOCK]  84-90, 10-20
                        |              /   (second garage entrance)
                      [DEPOT COURTYARD]  50-85, 20-43
                       /        |        \
      descent 46-51,11-26   office door   depot gate 75-78,44
             |              55-56,38           |
      [UPPER LANE + GARDEN WALK]        [MAIN STREET]  43-78, 46-56
             |                                 |
      [BAKERY YARD]  6-20,20-30         market east lane 35-42,47-49
             |                                 |
      bakery passage 16-19,31                  |
             |                                 |
             +---------[MARKET SQUARE]---------+   9-42, 32-56
                               |
                      alley neck 11-15,56
                               |
                      [ARRIVAL ALLEY]  6-15,58-68   START 10,66
```

Verified by test, not by inspection:

- **No isolated walkable region.** A flood fill from spawn reaches every
  walkable tile — 2 725 of 2 725.
- **The market is unavoidable.** Both branch mouths are inside it, and every
  route from the alley to either mouth passes through the square.
- **The garden route cannot bypass the courtyard.** Its descent lands at the
  courtyard's north-west corner (x50-51, y26); the only way on to the garage is
  across the courtyard.
- **The exit is only reachable through the garage.** The north road's single
  opening is the garage's north wall.
- **Both garage entrances work**: the main door off the courtyard's east side,
  and the loading dock.

## 4. Measured routes

| Leg | Main street | Garden route |
| --- | --- | --- |
| spawn → convoy stop (V1 site) | 337 | 337 |
| V1 → waybill (V2 site) | 409 | 409 |
| V2 → branch mouth | 331 | 228 |
| branch → courtyard | **702** | **1 419** |
| courtyard arrival → office ledger (V5 site) | 395 | 381 |
| office → garage door | 631 | 631 |
| garage door → van (V4) | 232 | 232 |
| van → BELIAL (V7 site) | 135 | 135 |
| BELIAL → north road (V8) | 304 | 304 |
| **Total** | **3 635 px** | **4 172 px** |
| Pure sprint time | **23.9 s** | 27.4 s |

| Target | Required | Measured | |
| --- | --- | --- | --- |
| Main-street critical path | 3 600–4 200 px | **3 635 px** | pass |
| Garden route longer by | ≥ 500 px | **+537 px** | pass |
| Branch segment ratio | — | garden is **2.02×** main street | pass |

Other distances: spawn → office 1 314 px · spawn → garage 1 567 px ·
spawn → exit 1 868 px · courtyard gate → garage door 420 px ·
gate → dock ramp 506 px · dock → van 344 px.

**The old baseline was 1 165 px / 7.7 s.** The critical path is now 3.1× longer
and 23.9 s of pure sprinting — before any guard, objective or dialogue is
involved. No waypoint loops or artificial padding were used; the length comes
from spreading the objective anchors to opposite corners of the market, moving
the depot gate to the main street's east end, putting the office at the
courtyard's west and the garage door at its east (so the courtyard is crossed as
a Z on two different lines), and putting the exit at the garage's far west.

## 5. Deviations from the approved plan

| Approved | As built | Why |
| --- | --- | --- |
| "Two northern exits leading to the route split" | One northern exit (bakery passage) and one **eastern** exit (market east lane) | The depot is east. Routing the main street north then east would have crossed the garden route's corridor and created a shortcut between the two branches. The functional requirement — two exits, both leaving the market, reconnecting at the depot — is met. |
| Market square `8,32 35×25` as one rectangle | Five composed rects, 497 walkable | A 35 × 25 rectangle is 560 × 400 px: larger than one 480 × 270 screen and mostly empty floor. Composing it adds the west arcade and two halls. |
| Courtyard `50,20 36×24` | Five composed rects plus three buildings, 627 walkable | Same reason. Still the most open space on the map — see §6. |
| Depot gate at x62-66 | x75-78 | Moving it to the street's east end forces the whole street to be walked and lengthened the courtyard crossing. |
| Garage door at x68-70 | x81-83 | Puts the office-to-garage leg across the full courtyard and makes the garage itself a west-bound crossing to the exit. |
| North road at x68-72 | x60-64 | So the garage is crossed, rather than entered and immediately exited. |
| Upper lane as one straight 36-tile corridor | A climb, a jog and a north leg | A 36-tile straight is both a clean sight line and too short. The zig is what makes the garden route 2× the main street. |

## 6. Visual findings

Renders: [`../diagnostics/map/`](../diagnostics/map/) — full 1664 × 1152
overview plus a native 480 × 270 crop of each of the twelve regions.

**These are static layer composites, not Phaser screenshots.** `npm install`
fails with the CodeArtifact `E401` in this environment, so the game has never
been launched. They draw the same visible layers in the same order as
`src/core/MapLoader.ts`, so connections, doorways, wall placement and prop
grounding can be judged — but no lighting, FX, characters, HUD or camera.

| Check | Finding |
| --- | --- |
| Connection points | All nine openings read as openings; the alley neck, bakery passage, depot gate, office door and garage door are each visibly framed by wall faces |
| Doorways | 18 authored doors land on south-facing wall faces, which are the only ones the top-down camera shows |
| Interior transitions | The office reads as a building with one door; the garage reads as an interior off the courtyard |
| Unexpected walls | None found. The three large dark areas between the market, garden and courtyard are intended building mass |
| Impassable props | None. Every prop footprint is validated against object anchors and the reachability fill |
| Rendering order | Correct: floor → decorBack → architecture → cover, then props by depth |
| **Oversized empty space** | **The depot courtyard is the one real concern.** At 36 × 24 tiles it is 576 × 384 px — larger than one screen. Three buildings and ~12 cover pieces were added and it now has cover within view at any point, but it still reads as the emptiest space. It should feel correct once C.1B-3 places the three-guard encounter and the requested depot props land; if it still feels bare then, the fix is more internal structure, not a smaller courtyard, because the three shooting lanes the encounter design needs require the span. |
| Spaciousness generally | The market, main street, bakery yard and garage all read at a sensible density. The garden walk and upper lane are deliberately narrow (4–6 tiles) |

## 7. What stayed temporary, by instruction

- **Objectives unchanged.** The V1 → V2 → V3 → exit chain still works, with the
  van, log and inscription relocated into the new garage. No new dependency and
  no new lock: the garage key, expanded clue chain, wounded cultist and
  mandatory BELIAL are C.1B-2.
- **Nine future objective sites reserved** as `reserved` map objects carrying a
  `beat` and a `note` only. The scene asks for specific object types and ignores
  unknown ones, so they are inert. Sites: convoy stop and its alternate, waybill
  and its alternate, office ledger, garage key, office checkpoint, wounded
  cultist, BELIAL.
- **Three Lookouts**, re-routed onto the new geometry with valid waypoints. The
  seven-guard placement is C.1B-3, so no encounter balance is implied by these
  positions.
- **No gameplay constant changed.** No player, enemy, weapon or detection value
  was touched.

## 8. Test and build results

`tools/build-map.mjs` passes its own gates: every role and surface names a real
tile, no surface tile is solid, every facade door sits on a south-facing wall
face, every object anchor and patrol waypoint is reachable, and no walkable tile
is orphaned.

`tests/geometry.test.ts` — 25 assertions, all passing — covers the ten required
checks: dimensions, region connectivity, both branch routes, route lengths, the
office, the garage, the exit, mission anchors, existing interactions, and
deterministic regeneration (re-running the generator produces a byte-identical
file).

`tests/map.test.ts` was updated for the new coordinates. Its blocker-count
assertion was replaced with the correct invariant — a tile is solid in the grid
exactly when the collision layer, a cover tile or a prop footprint blocks it —
because the old count compared region-walkable against grid-walkable and so
double-counted cover.

The Phase C.1A baseline is archived at
[`../../tests/fixtures/valcendre-baseline-c1a.json`](../../tests/fixtures/valcendre-baseline-c1a.json),
with its original assertions preserved alongside as
`valcendre-baseline-c1a.test.ts.disabled`. It describes the old 60 × 40 map and
must never be asserted against the current one.

**Not run:** `npm test` and `npm run build`. `npm install` fails with the
CodeArtifact `E401`. Verified out-of-band under Node type stripping: 1 301
assertions pass — 1 237 Phase B invariants, 25 new geometry, 39 core unit.

## 9. The 25%-of-walkable metric

The C.1A plan proposed that the critical path visit ≥ 25% of walkable tiles.
**Reviewed and rejected as a target.** The route now visits 196 of 2 551 tiles —
7.7%. Chasing 25% on a 2 725-tile map would mean either deleting two thirds of
the playable space or forcing backtracking, both of which the brief forbids.

The metric that matters is whether the route traverses the required encounter
areas, and it does:

| Area | Steps on the main route |
| --- | --- |
| Arrival alley | 10 |
| Market square | 52 |
| Main street | 25 |
| Depot courtyard | 46 |
| Garage interior | 21 |
| North road | 5 |

Every area the mission needs is crossed. The unvisited remainder is the garden
branch (an alternative, by design), the loading dock (a second entrance, by
design), and the breadth of the market and courtyard that makes flanking
possible — which is the point of an encounter space.
