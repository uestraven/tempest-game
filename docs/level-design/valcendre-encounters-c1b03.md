# Valcendre guard placement and tactical encounters — Phase C.1B, Task 03

Seven Lookouts across three encounters, over the C.1B-01 geometry and the
C.1B-02 objective chain. Neither was modified: no dialogue, no objective
dependency, no production artwork, no weapon or combat constant.

Every figure below comes from `tests/support/encounter-metrics.ts`, which runs
the engine's **own** `Grid`, `canSee` and `Hearing` attenuation over the shipped
`village.json`. `tests/encounters.test.ts` asserts the same numbers from the
same module, so this document and the suite cannot drift apart. Reproduce with:

```
npx vite-node tools/encounter-report.ts
```

---

## 1. Preflight — verification is available for the first time

Previous phases could not run `npm test` or `npm run build`: `npm install`
failed with `E401` against the configured CodeArtifact registry. That registry
needs an AWS token that has expired (`aws codeartifact get-authorization-token`
returns `ExpiredTokenException`), and the public registry turned out to be
reachable. Installing with an explicit per-command override works:

```
npm install --registry=https://registry.npmjs.org/
```

No credential, token or registry configuration was committed, and no
dependency was added or changed. The override was passed on the command line,
not written into any file. `package-lock.json` is now generated but left
**untracked** — adding a lockfile changes how CI resolves dependencies, which
is a repository policy decision rather than part of this task.

Consequently, and for the first time in this project:

| Check | Result |
| --- | --- |
| `npx vitest run` | **278 passed, 12 files, 0 failed** |
| `npx tsc --noEmit` | **clean, 0 errors** |
| `npm run build` | **succeeds** (1,577 kB bundle, map generator green) |
| Headless browser | **works** — real 480×270 frames, see §8 |

**There were no C.1B-02 TypeScript errors to correct.** The previous phase's
hand audit held up: `tsc` reports zero errors on the baseline commit. The two
test failures found at preflight were stale assertions (`toHaveLength(3)` for
the old three-guard roster) in `map.test.ts` and `geometry.test.ts`, updated
here as part of the roster change.

---

## 2. The roster

Facing is in degrees, screen convention: 0 east, 90 **south**, 180 west, 270
north. Loop figures are **A\* traversal**, not straight lines, plus the engine's
1.1 s pause at each waypoint and the cost of its bounded 3 rad/s turn rate.

| ID | Post | Facing | Role | Waypoints | Loop | Loop time | Straight-line |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | 13,54 | 23° | Market south sentry | 2 | 173 px | 7.2 s | 163 px |
| L2 | 34,48 | 315° | **Mobile** market patrol | 6 | 889 px | 28.4 s | 791 px |
| L3 | 26,34 | 45° | Covered-market sentry | 2 | 315 px | 10.4 s | 295 px |
| L4 | 20,20 | 180° | **Mobile** garden obstacle | 4 | 488 px | 16.8 s | 452 px |
| L5 | 78,45 | 202° | Depot gate sentry | 2 | 277 px | 9.5 s | 258 px |
| L6 | 56,42 | 293° | **Mobile** courtyard patrol | 7 | 1,646 px | 47.0 s | 1,487 px |
| L7 | 69,16 | 315° | **Mobile** garage security | 5 | 1,171 px | 34.9 s | 1,033 px |

All four mobile patrols clear **both** halves of the target (≥450 px *and*
≥14 s). The three sentries are deliberately short: a sentry given a 450 px loop
is not watching anything, and the brief explicitly allows short authored
shifts. Every spawn and every one of the 26 waypoints stands on a walkable,
reachable tile — the map generator fails the build otherwise, and it caught two
bad waypoints during authoring (`wp_l7_4` at 78,14 was inside an obstruction).

Note the straight-line column: it understates every loop, which is why loop
length is measured by traversal.

### Patrol routes

| ID | Route (tiles, in order) |
| --- | --- |
| L1 | (13,54) → (18,53) |
| L2 | (34,48) → (24,50) → (15,48) → (15,41) → (24,40) → (33,44) |
| L3 | (26,34) → (17,32) |
| L4 | (20,20) → (12,22) → (12,29) → (17,27) |
| L5 | (78,45) → (71,41) |
| L6 | (56,42) → (61,40) → (78,40) → (84,20) → (65,23) → (52,27) → (51,36) |
| L7 | (69,16) → (76,13) → (66,9) → (87,11) → (88,17) |

### How the posts were chosen

Coverage comes from **facing and position only**. The 100° cone, the 176 px
sight range, the 170 px engagement range and every suspicion rate are untouched
and asserted untouched by `tests/encounters.test.ts`.

Each post is waypoint 0 of its route, and was selected by maximising how much of
the main critical path that guard's spawn cone covers, constrained to its role
area (`tools/post-optimise.ts`). The search found a greedy ceiling of 60.8%
against a measured best-single-post of 14.4%, so the target is met by
*placement*, not by widening anything.

---

## 3. Exposure measurements

Two metrics, reported separately because they are not interchangeable:

- **Static-post** — authored spawn, authored facing. This is the C.1A §1.4
  method, which is what the ≥45% target is stated against.
- **Patrol** — the union over the entire route, facing along travel. Strictly
  larger; a worst case, not a typical one.

| Path | Samples | Static-post | Patrol | Crouched (static) | Max shooters |
| --- | --- | --- | --- | --- | --- |
| **Main street** | 209 | **60.8%** ✅ ≥45% | 65.1% | 37.3% | **1** |
| Garden | 238 | 35.7% | 57.6% | 22.3% | **1** |

Baseline for comparison: the same main path measured **9.6%** static-post with
the old three guards.

**No critical-path sample has more than one effective shooter**, well inside the
limit of three. Pressure is spread along the route rather than massed, which is
a consequence of the near-zero overlap the optimiser found.

**Crouching cuts static exposure from 60.8% to 37.3%** — a 39% reduction, and
below the 45% target. The target is a floor on pressure for a player who walks
in upright; it is not a claim that stealth is impossible. That is asserted, not
asserted-by-assumption: `tests/encounters.test.ts` requires crouched exposure to
be under 75% of standing *and* under 45%.

### Per-leg, main-street route

| Leg | Static-post | Patrol | Guards |
| --- | --- | --- | --- |
| spawn → tracks | 62% | 48% | L1 L2 |
| tracks → waybill | 87% | 100% | L2 L3 |
| waybill → market exit E | 100% | 79% | L2 L3 |
| market exit E → courtyard S | 37% | 10% | L5 L6 |
| courtyard S → ledger | 89% | 74% | L5 L6 |
| ledger → garage door | 40% | 74% | L6 L7 |
| garage door → van | 80% | 100% | L6 L7 |
| van → cultist | 100% | 100% | L6 L7 |
| cultist → inscription | 50% | 100% | L6 L7 |
| inscription → exit | 6% | 69% | L7 |

### Area coverage (walkable tiles, standing player)

| Area | Tiles | Static-post | Patrol | Max shooters |
| --- | --- | --- | --- | --- |
| Market square | 454 | 30.6% | 90.1% | 3 |
| Depot courtyard | 634 | 15.6% | 83.3% | 2 |
| Garage + dock | 402 | 16.4% | 84.6% | 2 |

The garage went from **0.0%** static / 5.0% patrol under the old roster to
16.4% / 84.6%. That was the worst hole in the level: the whole V4→V6→V7 story
sequence happened with no guard able to see any of it.

### Sprint-through check

A sprinting player gains 120 suspicion/s and needs 100, so any continuous
exposure beyond ~0.84 s is a fight. The main route's longest unbroken exposed
run is **well over** the 127 px a sprinter covers in that window, so sprinting
the level end to end is no longer free. Asserted in the suite.

---

## 4. Alert chaining — measured, not assumed

Shout radius is 160 px, halved to 80 px when a wall stands between shouter and
hearer (`Hearing.audibleRadiusAt`). Measured at the **closest approach along
each pair of patrols**:

| Pair | Closest approach | Line of sound | Effective radius | Linked |
| --- | --- | --- | --- | --- |
| L5 – L6 | 32 px | clear | 160 | **yes** |
| L3 – L4 | 80 px | clear | 160 | **yes** |
| L1 – L2 | 80 px | clear | 160 | **yes** |
| L2 – L3 | 97 px | clear | 160 | **yes** |
| L6 – L7 | 58 px | through wall | 80 | **yes** |
| L2 – L4 | 195 px | through wall | 80 | no |
| …15 further pairs | 273 px – 1,021 px | — | — | no |

So the chains are **L1↔L2↔L3↔L4** (market, carrying into the garden) and
**L5↔L6↔L7** (courtyard, carrying into the garage). Five links out of 21 pairs;
**16 pairs are never within earshot of each other at any point on their
routes**, so no single detection can raise the level.

Two of those links are authored deliberately and would not otherwise exist:

- **L3→L4** needed L3's west shift moved to (17,32), the mouth of the
  north-west passage. Before that the pair were 107 px apart but wall-separated,
  so the attenuated 80 px radius did not reach — *close, but measurably not a
  link.*
- **L6→L7** needed L6's route extended to the dock ramp at (84,20), where the
  courtyard and loading dock are physically open to each other. Before that they
  were 113 px apart through a wall — again short of the attenuated radius.

**Honest caveat:** the **post-to-post** table is empty. No two guards are within
earshot from their *spawn* positions; every link above requires both guards to
be somewhere on their routes. Chaining is real but intermittent, not constant.

### Behaviour of the chain

`Enemy.rally` raises suspicion to `suspiciousThreshold + 20` (50) and calls
`beginInvestigate(at)` — the **reported** position. It explicitly does not enter
combat, and `Enemy.hear` caps suspicion at `combatThreshold - 1` (99), so no
sound can ever by itself start a fight. There is no detection jump. A guard that
loses sight falls back to `lastKnown` and then de-escalates to patrol on the 8 s
`investigateTimeout`, with suspicion bleeding at 18/s. No reinforcements are
spawned anywhere.

This was verified **at runtime**, not only by reading the code — see §8, shot 09.

---

## 5. The three encounters

### Market square — L1, L2, L3

L1 faces 23°, **across** the southern approach rather than down it, so arriving
from the alley neck is not an instant sighting; the player is seen only once
they commit to crossing. L2 runs a full 889 px circuit past both market halls
and both V1 evidence sites, so no single piece of cover is safe indefinitely.
L3 alternates between looking south-east into the square (the approach to the
east lane) and west to the garden-branch mouth.

Cones overlap: at least one market position is seen by two guards at once
(asserted). Patrol coverage is 90.1%, the highest of the three areas, and the
market is the only area reaching the 3-shooter limit — appropriate for the
first encounter, which has the most cover and the fountain, carts, stalls and
two halls to break line of sight behind.

The west arcade (x9–12, y40–49) is authored shadow and is outside every patrol,
so it remains the stealth approach. Both V1 sources have at least one adjacent
standing position that **no** authored post can see, so the player can wait
rather than time a dash — no frame-perfect timing (asserted).

The radio distraction at (31,34) reaches **L2, L3 and L4 only** — enough to
pull guards, not enough to pull the level (asserted).

### Garden route — L4

The garden branch is almost entirely authored shadow; the bakery yard is the one
lit space on it. L4 patrols only the lit interior, with every waypoint east of
x10, so the shadowed west strip (x6–10, 40+ shadow tiles verified) stays a
genuine bypass. Crouching there holds detection at 28/s instead of 80/s — a
3.6× longer time-to-detection.

Exactly one guard is on the branch, asserted, so it cannot become a second
combat corridor. The garden route stays measurably safer than main street
(35.7% vs 60.8% static), which is the point of it being the longer branch. The
route to the depot exists independently of L4's fate; no kill is required.

### Depot courtyard and garage — L5, L6, L7

L5 is posted in the gate itself looking back west down main street, the one
approach the short route must walk. L6 runs a 1,646 px circuit of the office
block — this is what stops the player crossing the 36-tile yard unseen,
taking static courtyard coverage from 8.0% to 15.6% and patrol coverage to
83.3%.

The office is reachable **and leaveable** from both the main-street and garden
approaches, with at least two hard-cover breaks on the gate-to-office path
(asserted). **No guard spawn or waypoint is inside the office interior** —
asserted, because a guard authored in there would be both a pathfinding trap and
an unavoidable fight for the key. The ledger's authored properties contain no
reference to any enemy, so the garage key does not depend on L5 or L6.

---

## 6. L7 and the garage doors

This is the part the brief flagged, and it is handled **by construction rather
than by special case**.

L7 spawns inside the garage. Waypoints 0–2 are in the garage; waypoints 3–4 are
in the loading dock, on the far side of the shutter. Because `Grid` is
door-aware, a waypoint behind a closed door has **no path at all**.

The old `updatePatrol` would have stored that empty path, and `followPath`
reports an empty path as *"arrived"* — so the guard would have ticked through its
whole route standing still at 1.1 s per waypoint, reading to a player as a guard
that walked through a locked door. That is a real pre-existing bug, exposed by
C.1B-02 adding doors.

The fix is `src/systems/Patrol.ts` — `nextReachableWaypoint`, extracted
Phaser-free so it is unit-testable, with 9 regression tests in
`tests/patrol.test.ts` that pin both the new rule and the old bug. It skips a
waypoint it cannot reach, bounded to one pass over the route. Re-planning still
only happens when the waypoint changes, so it adds **no** per-frame pathfinding.

Measured result:

| Guard | Waypoints reachable sealed | Reachable open | Door-dependent legs | Sealed loop |
| --- | --- | --- | --- | --- |
| L1–L6 | all | all | 0 | — |
| **L7** | **3 / 5** | **5 / 5** | 2 | **450 px** |

So while the doors are locked L7 has a real 450 px loop inside the garage, and
once the ledger grants the key the dock joins its circuit. Asserted directly:
with the doors sealed, **no waypoint-to-waypoint path for any guard crosses any
of the 6 door tiles**, and every guard has somewhere to patrol while sealed.

Both entrances stay useful, and the measurement corrected my first assumption
here. I had expected the dock shutter to sit inside L7's post cone and the
courtyard door to sit behind it. In fact **both entrances are beyond the 176 px
sight range from L7's post** — 195 px at the courtyard door, 210 px at the
shutter — so getting *in* either way is unobserved and neither door is a trap.
What L7's post does cover is the interior: the transport bay at 80 px and the
cultist at 176 px. Entry is free; working the garage is the problem. On patrol
L7 covers both entrances (asserted).

The cultist scene, the BELIAL inscription, the transport and the exit all remain
reachable past L7.

---

## 7. Checkpoint and save compatibility

Guard snapshots are keyed by name, but **a name alone does not make a position
valid**: this phase moved every guard and rewrote every route, so a save written
against the old three-Lookout layout describes `enemy_l1` standing somewhere
`enemy_l1` no longer patrols, with a `routeIndex` into a route that no longer
exists.

`Save.enemyRosterMatches` is the explicit content-revision policy. The roster is
compared **as a whole**, order-independently. On a mismatch, `applyCheckpoint`
resets *every* guard to its authored spawn rather than restoring any of them —
while still restoring the mission snapshot, so the player keeps objectives, the
garage key, door state and story events, and loses only stale guard positions.
That is cheaper for the player than rejecting the save, and it is explicit
rather than silently reinterpreting obsolete coordinates. `SAVE_VERSION` stays
at 2 because the mission schema did not change.

Seven cases are asserted: current roster accepted; order-independence;
pre-C.1B-03 three-guard save rejected; renamed guard rejected; missing guard
rejected; duplicate names rejected even when the count matches; and every
authored spawn verified walkable so a reset can never strand anyone.
`Enemy.restore` already clears `path` and `pathTarget`, so a guard cannot retain
a stale path across a door that a restore has re-locked.

---

## 8. Visual verification — actual gameplay frames

Nine native-resolution 480×270 captures in
[`../diagnostics/encounters/`](../diagnostics/encounters/), reproducible with
`tools/screenshots.mjs`.

**What these are, stated plainly.** They are real frames from the real engine:
real renderer at 480×270, real tilemap, all seven guards running the real
vision, patrol and alert code, confirmed live in-frame. **What they are not** is
a completed playthrough. The player is *placed* at each vantage point through a
debug handle on the live Phaser game rather than walked there with thousands of
pixels of simulated keypresses, and the garage shots set the mission's V5 flag
to unlock the doors the same way reading the ledger would. Genuine gameplay
frames, staged positions. No game code was modified to enable this — the game
instance is reached by defining a setter for `window.Phaser` before the bundle
runs. Playwright is not a project dependency.

| # | File | Shows | Live guard states |
| --- | --- | --- | --- |
| 1 | `01-market-patrol-coverage.png` | Market square, L1/L2/L3 over the V1 sites | all patrol |
| 2 | `02-market-patrol-coverage-debug.png` | Same frame, F3 overlay (cover + shadow tiles) | all patrol |
| 3 | `03-garden-stealth-approach.png` | Bakery yard, L4 in the one lit space | all patrol |
| 4 | `04-courtyard-from-main-street.png` | Courtyard from the gate, L5 post | all patrol |
| 5 | `05-courtyard-from-garden.png` | Courtyard from the garden descent | all patrol |
| 6 | `06-garage-dock-security.png` | Garage interior, L7 patrolling, doors unlocked | all patrol |
| 7 | `07-loading-dock.png` | Loading dock, the second entrance | all patrol |
| 8 | `08-courtyard-combat.png` | Player in the open: L5 **and** L6 enter combat unprompted | `l5 combat/100`, `l6 combat/100` |
| 9 | `09-alert-chain-investigate.png` | **The alert chain isolated** | `l5 search/27`, `l6 investigate/27` |

Shot 9 is the real verification of §4. The player is hidden inside the depot
office where L6 has no line of sight; a shout near the gate rallies both L5 and
L6, and the capture **asserts at runtime** that L6 is in `investigate`, not
`combat`. Suspicion reads 27, consistent with rally's 50 decaying at 18/s over
the 1.5 s hold. So the chain demonstrably moves guards to a *reported position*
without seeing the player, and without a detection jump.

Shot 8 is worth noting separately: standing in the open courtyard put **two**
guards into combat with no scripting at all. The courtyard is no longer a space
you can cross casually.

---

## 9. Automated test results

```
npx tsc --noEmit        clean
npx vitest run          12 files, 278 passed, 0 failed
npm run build           succeeds
node tools/build-map.mjs  green, all objects reachable, locked-door check passes
```

New in this phase: `tests/encounters.test.ts` (54 assertions),
`tests/patrol.test.ts` (9). Updated: `map.test.ts` and `geometry.test.ts` for
the seven-guard roster.

---

## 10. Remaining gameplay problems

Stated as found, none of them blocking:

1. **Main street is the weakest leg** — 37% static, 10% patrol for
   `market exit E → courtyard S`, the longest single leg on the route. L5 covers
   only its eastern end. It is a transit corridor between two encounters rather
   than an encounter, which is defensible, but it is the obvious place a future
   guard would go if the roster ever grows past seven.
2. **The exit leg is nearly unguarded** — 6% static for
   `inscription → exit`. Deliberate: it is the departure, after the last beat.
3. **Acoustic links are intermittent, not constant.** No pair is in earshot from
   their spawn posts; every link needs both guards to be somewhere on their
   routes. A player who gets unlucky with patrol phase will see a cascade; one
   who does not, will not.
4. **L6's 47 s loop is long.** It covers a 36×24 courtyard, so the yard is
   genuinely unwatched in places for stretches of that cycle. Patrol coverage is
   83.3%, but spread over 47 s.
5. **L7 is invisible until the garage opens.** Confined to the garage while
   sealed, it contributes nothing to the courtyard encounter. §6's optional
   "occasional exposure to L7 near the northern courtyard edge" is therefore
   **not** satisfied pre-unlock, and I have not faked it; L6's dock-ramp
   waypoint is what links the two spaces instead.
6. **Still no vision-cone debug rendering.** Guards draw a 3 px facing tick and
   an alert icon; there is no cone overlay, so the screenshots cannot show
   coverage directly and the numbers in §3 are the only way to read it. A cone
   added to the F3 overlay would make coverage self-evident in play. Out of
   scope here.

---

## 11. Requests for the art agent

No artwork was generated. All seven guards use the existing approved
`lookout_guard` sheet through the existing asset-loading system, and Tempest's
directional sheets and animation contracts are untouched.

Nothing new is strictly required by this phase. Two existing requests became
more acute, both visible in the screenshots:

| Request | Why this phase makes it matter more |
| --- | --- |
| **CHAR-001** directional sheets for the Lookout | Seven guards are now on screen instead of three, and reading a patrol's facing is the core stealth skill. A 3 px tick is carrying that entire read. This is the single highest-value art item for the game's feel |
| **CHAR-002** crouch poses | Crouching is now measurably the difference between 60.8% and 37.3% exposure, and it is still visually indistinguishable from standing |
| **ENV-004** shaded surface variants | The garden's shadow strip is the authored stealth bypass, and in `03-garden-stealth-approach.png` it does not read as meaningfully darker than the lit yard beside it. The mechanic is invisible |
| **VP-004 / VP-007** depot and dock props | Visible in shots 6 and 7: the garage and dock are the final encounter and are still largely bare floor |

One new, low priority:

### VPE-001 · Guard-facing indicator · P2

| | |
| --- | --- |
| **Output** | `public/assets/fx/facing_arrow_16x16_4f.png` |
| **Size** | 64 × 16 — 4 frames of 16 × 16, one per cardinal facing |
| **Why** | Pending CHAR-001, the facing tick is the only cue for where seven guards are looking. A purpose-made indicator would carry it better than a 2 px rectangle |
| **Accept** | Legible at 1:1 over both pale paving and dark garage floor · reads as a sight line rather than as a weapon or a UI element |
