# Valcendre stealth disengagement, vision debugging and route validation — Phase C.1B, Task 04B-1

**Baseline tested:** `7ba9cb6`
**Date:** 2026-11-04

---

## 1. Headline

| Question | Answer |
| --- | --- |
| Does the intended recovery sequence work? | **Yes.** Detect → sprint to cover → lose line of sight → guard investigates last known → reposition → re-hide → guard returns to patrol. All verified. |
| Was a code-level defect found? | **Yes, one.** Sound localised to an *exact* position and stacked without limit, so a guard that had never seen the player tracked them perfectly by footstep noise. |
| Were movement or enemy speeds changed? | **No.** No speed, damage or health value was touched. |
| Does the F3 overlay exist? | **Yes**, tracing the engine's own occlusion. |
| Is no-kill completion verified? | **No.** Blocked by a *separate*, newly found defect — see §7. |

---

## 2. Environment

```bash
npm install --registry=https://registry.npmjs.org/   # per-command override only
npx tsc --noEmit            # clean
npx vitest run              # 13 files, 300 passed
npm run build               # succeeds
npx vite preview --port 4173                 # binds 127.0.0.1 only

node tools/disengage-tests.mjs <chromium>    # Scenarios A-I
node tools/stealth-shots.mjs  <chromium>     # screenshots + radio
node tools/patrol-audit.mjs   <chromium>     # the §7 defect
```

No credential or registry configuration is committed.

### What kind of test each thing is

- **`tools/disengage-tests.mjs`** — AI-unit tests. Each scenario places one guard
  and the player at *computed* coordinates and fixes the guard's facing;
  everything after that instant is the real engine, with the player moved by
  **real keyboard input**. Nothing declares the player invisible, grants an
  objective or edits suspicion. Labelled as unit tests, not playthrough claims.
- **`tools/playthrough.mjs`** (from 04A) — the only tool that may claim an
  end-to-end result. Input only, places nothing.
- **`tools/patrol-audit.mjs`** — read-only observation.

---

## 3. Observed disengagement behaviour

Answers to §1's required questions. **Observation** is measured; **reading** is
my interpretation.

| Question | Observation | Reading |
| --- | --- | --- |
| Does a Lookout stop receiving Tempest's position after losing sight? | `lastKnown` is assigned **only** when `canSee` returns visible (`Enemy.perceive`). In Scenario D the player travelled 281 px unseen and the guard re-targeted **0 times**. | Correct by construction. |
| Does entering cover transition combat → investigation? | Yes, on the **same frame** visibility is lost (`updateCombat`, `!visible` branch). Scenario C: at cover `LOS=false`, state `patrol`, suspicion `0`. | Correct, and generous to the player — no grace period for the guard. |
| Can Tempest escape using normal walk/sprint? | Yes. Walk 108 px/s and sprint 152 px/s against a Lookout's `combatSpeed` 66 px/s. | Works. Crouch at 66 px/s cannot escape, but crouch is for concealment. |
| Can Tempest resume concealment after disengaging? | Yes. Scenario D2: 16 s hidden and motionless → `patrol`, suspicion `0`. | Works. |
| Does sprint noise cause fair reacquisition? | **No — this was the defect.** See §4. | Fixed. |
| Can a guard shoot through cover after losing contact? | No. The firing branch in `updateCombat` is unreachable when `!visible`. | Correct. |
| Does suspicion decay correctly? | 18/s, and `stepSuspicion` floors at 0. 100 → below the 30 threshold in 3.9 s, inside the 8 s investigate timeout. | Correct — *once the defect in §4 stopped re-bumping it.* |
| Does a guard eventually return to patrol? | Yes, Scenario D2 and F. | Correct. |
| Do guards receiving a shout investigate the reported position without magic tracking? | `rally()` sets suspicion to `suspiciousThreshold + 20` (50) and calls `beginInvestigate(at)` — never combat. `hear()` caps at 99, so **no sound can start a fight by itself**. Scenario F: both guards de-escalated with **separate** destinations. | Correct. |

**So the escape sequence was already right**, and per §3 of the brief I did not
touch movement or enemy speeds. The 04A report's `speedCrouch == combatSpeed`
observation was a red herring: it is true, but crouch-fleeing is not the
intended recovery, and standing or sprinting escapes comfortably.

---

## 4. The defect: sound handed over an exact position, without limit

### Evidence

`Enemy.hear` set the investigate target to the sound's **exact** coordinates for
every kind except a gunshot, and applied a fixed suspicion bump per event with
no rate limit. The code's own comment showed the intent had been thought
through for gunshots —

> *"A gunshot raises the alarm but does not hand over the player's exact
> position: an unseen shot is investigated as an area, not a pinpoint."*

— and simply never applied to footsteps.

The arithmetic:

| Quantity | Value |
| --- | --- |
| Sprint speed | 152 px/s |
| One footstep every | 22 px travelled → **~6.9 events/s** |
| `footstepSprint` radius | 96 px (6 tiles) |
| Suspicion per event | 34, clamped to 99 |
| **Implied suspicion gain** | **~234/s** |
| Rate for *seeing* a sprinter | 120/s |
| Decay | 18/s |

So hearing a sprinter was nearly **twice as informative as seeing one**,
suspicion could never fall back below the 30 de-escalation threshold while the
player moved in earshot, and the 8 s investigate timer was re-armed about seven
times a second along with a fresh A\* path to the player's live position.

**Scenario H** isolates it deterministically — one footstep event through the
game's own `Hearing` bus, guard facing away, 64 px distant:

| | Pre-fix | Post-fix |
| --- | --- | --- |
| Destination offset from the noise point | **0 px (exact pinpoint)** | **48 px (an area)** |
| Suspicion from one step | 0 → 34 | 0 → 34 |

**Scenario G** shows the consequence in play — the player sprints past a guard
that is facing away and can never see them:

| | Pre-fix | Post-fix |
| --- | --- | --- |
| Peak suspicion while never seen | **100** | **32.8** |
| Final state | **`combat`** | `search`, decaying to 2.5 |
| Samples before it acquired sight | 7 of 20 | **20 of 20** |

A guard reaching full combat against a player it had never seen is the
unfairness; after the fix it becomes suspicious and searches an area, which is
the intended behaviour.

### The correction

Per the brief's preferred order this is categories **1 and 3** — incorrect
last-known-position tracking, and unreasonable reacquisition. No speed, damage
or health value changed. No invisibility frames, no suspicion reset, no escape
button.

`src/systems/Hearing.ts` now owns the localisation contract (Phaser-free, so it
is unit-testable):

```ts
export const SOUND_SCATTER: Record<SoundKind, number> = {
  footstep: 48,    // you hear a direction, not a position
  gunshot: 36,     // unchanged
  distraction: 0,  // the radio is a real object in a known place
  shout: 0,
};
export const SOUND_REFRACTORY = 0.6; // seconds between sound-driven bumps
```

`Enemy.hear` scatters the target by kind and ignores sounds inside the
refractory window. Rate-limited, sound now contributes at most 34/0.6 ≈ **57/s**
— deliberately *below* the 120/s for seeing a sprinter, preserving the ordering
"sight is more informative than sound". It also cuts the A\* re-path rate from
~7/s to ~1.7/s per guard.

`distraction` is **0 on purpose**: the radio is a fixed object and walking
straight to it is the entire mechanic (§6).

### Controlled before/after

The two constants were reverted to `footstep: 0` / `SOUND_REFRACTORY: 0`, which
reproduces the old behaviour exactly, and the suite re-run:

| Scenario | Pre-fix | Post-fix |
| --- | --- | --- |
| A crouch slows detection | PASS | PASS |
| B crouched but exposed | PASS | PASS |
| C sprint to hard cover | PASS | PASS |
| D reposition while hidden | PASS | PASS |
| D-silent control | PASS | PASS |
| D2 wait it out | PASS | PASS |
| E failed escape | PASS | PASS |
| F two guards | PASS | PASS |
| **G sprint past an unseeing guard** | **FAIL** | **PASS** |
| **H one footstep, deterministic** | **FAIL** | **PASS** |

Exactly the two failing behaviours changed and nothing else.

---

## 5. Scenario results (post-fix: 11/11)

| # | Scenario | Result |
| --- | --- | --- |
| A | Crouch vs standing in the same cone | **PASS** — 100 suspicion in 1.15 s standing vs 2.48 s crouching, a **2.16×** advantage (contract predicts 1.78×) |
| B | Crouched but exposed in the open | **PASS** — still peaks at 100 and enters combat; crouch slows detection, it does not prevent it |
| C | Sprint to hard cover, stand still | **PASS** — at cover `LOS=false`, state `patrol`, suspicion `0`, `lastKnown` cleared |
| D | Reposition while hidden | **PASS** — 281 px travelled unseen, **0** re-targets onto the player |
| D-silent | Same, crouched (silent control) | **PASS** — 590 px travelled, 0 re-targets. Isolates footstep noise as the only sound channel |
| D2 | Hold still behind cover 16 s | **PASS** — `patrol`, suspicion 0 |
| E | Walk back into the searching guard | **PASS** — re-enters combat, suspicion 100 |
| F | Two guards detect, then lose contact | **PASS** — both reach `combat/100`, both de-escalate to `patrol/0` with **independent** destinations |
| G | Sprint past a guard facing away | **PASS** — peak 32.8 while never seen |
| H | One footstep, deterministic | **PASS** — 48 px offset, not a pinpoint |
| I | Radio distraction | **PASS** — see §6 |

### A measurement mistake worth recording

My first three verdicts (A, D, E) were wrong because of my own test design, not
the game:

- **A** averaged a suspicion *rate* over 2.5 s. `stepSuspicion` clamps at 100,
  so every stance compressed to ~40/s and the comparison was meaningless.
  Replaced with **time to reach 100**.
- **D/E** assumed a static guard, but a searching guard legitimately walks away,
  so "step back into the sightline" and "is the player occluded from the guard
  post" both stopped being true mid-test. Re-judged against the guard's **live**
  position every sample.
- My observer reported `los` from `hasLineOfSight`, which is **occlusion only**.
  Gating "has the guard seen the player" on that was wrong because it ignores
  the 100° cone — the observer now reports `los` and `visible` separately.
- "Destination within 40 px of the player" could not distinguish tracking from
  the player hiding near the place the guard was legitimately searching.
  Replaced with a **re-targeting** count: a searching guard commits to a place,
  a tracking one keeps adopting new destinations that follow the player.

---

## 6. Radio distraction validation

Validated at unit level (guard placed in range) because the §7 defect means
waiting for a guard to patrol into the radio's 128 px radius is unreliable.

| §6 requirement | Result |
| --- | --- |
| Can be activated normally | **Yes** — reached and switched on with a real `E` press |
| Eligible guards hear it | **Yes** — a guard 105 px away, facing away, heard it |
| Guards investigate the **radio**, not Tempest's position | **Yes** — **11 of 16** investigation samples had the guard heading for the radio itself. `SOUND_SCATTER.distraction = 0` is what guarantees this |
| Creates a usable opening | **Yes** — pulled the guard **83 px** off its post (105 px → 22 px from the radio) |
| Does not permanently disable AI | **Yes** — returned to `patrol`, suspicion 0 |
| Guards resume appropriate behaviour | **Yes** |
| Completable if the radio is never used | **Yes** — 04A's two completing runs never used it |

**A real property worth knowing:** switching the radio on requires standing
within `interactRange` (28 px) of it, and the guard then walks *to the radio*.
In the test the guard arrived 22 px away and saw the player. **The radio is only
a distraction if you leave after triggering it.** That is a legitimate
characteristic of the mechanic, not a defect, and it is not something the static
C.1B-03 analysis could have shown.

A first attempt at this failed instructively: approaching the radio **sprinting**
alerted the market before arrival, and `hear()` returns early for a guard already
in combat — so the distraction had nothing left to distract. The crouched
approach reached the radio with **all seven guards at `patrol`/suspicion 0**,
which is itself a clean demonstration that silent movement works (crouch
footstep radius is 0).

---

## 7. NEW DEFECT, and it blocks no-kill verification

**Three of seven guards do not patrol.** Found while trying to validate the
radio: no guard ever came within the radio's 128 px radius because the two
market guards were not moving.

`tools/patrol-audit.mjs`, 45 s from a clean start:

| Guard | Travelled | Expected | Ratio | |
| --- | --- | --- | --- | --- |
| l1 | 1,220 px | 1,081 px | 1.13× | ok |
| **l2** | **108 px** | 1,409 px | **0.08×** | **STALLED** |
| **l3** | **179 px** | 1,363 px | **0.13×** | **STALLED** |
| l4 | 1,386 px | 1,307 px | 1.06× | ok |
| l5 | 1,421 px | 1,312 px | 1.08× | ok |
| **l6** | **196 px** | 1,576 px | **0.12×** | **STALLED** |
| l7 | 1,445 px | 1,510 px | 0.96× | ok |

All three stalls share an identical signature:

```
enemy_l3: tile 19,32   body 12x10 at 308,510   overhang into row above 2px
   blocked {left:false, right:true}  speed 44  destination 26,34
   A* reachable: true   next node 14px away
   3x3 solidity:  ..#  /  ...  /  ...
```

### Root cause

The feet collider is 12×10 and sits **2 px above the top of the tile row the
feet occupy**. So the body straddles two tile rows. A solid tile *diagonally*
adjacent — in the row above — catches the body's top corner and Arcade reports
`blocked.right`, refusing a move that A\* correctly believes is free along an
open row. The guard then pushes into the corner at full patrol speed forever:
`speed 44`, zero progress, `state: patrol`, `A* reachable: true`.

This is a **collider/grid mismatch in `followPath`**, not a pathfinding bug. It
is pre-existing code: `git show 184d481 -- src/actors/Enemy.ts` confirms
C.1B-03 touched neither `followPath` nor the body setup. What C.1B-03 did do is
author routes that happen to run past these corners, which is what exposed it.

### Why I did not fix it here

It is outside this task's scope — the brief is stealth disengagement plus
diagnostics, and its correction order is about the detection and pursuit chain.
A fix changes movement for every guard, which is exactly the kind of broad AI
change the brief warns against making casually. It is a clean, well-evidenced,
self-contained job for **04B-2**.

Candidate fixes, cheapest first: slide along the blocked axis when wedged; or
shrink the collider so it cannot straddle two rows; or nudge toward the centre
of the occupied tile row when `blocked` and not progressing.

### Consequence for this task

**No-kill mission completion remains unverified, and the precise blocker is
this.** A stealth route depends on patrol openings; with l2, l3 and l6
effectively static there are no openings in the market, the timing windows a
stealth player would read do not exist, and the radio cannot be used as
designed. Rebuilding the stealth harness (§5) against the *authored* routes
would therefore be measuring a level that is not running — so I have not
claimed a §5 result, and the improved stealth harness should be built in 04B-2
**after** the patrol fix, when the routes it is meant to exercise actually move.

What *is* verified is that every mechanic a stealth route depends on works:
crouch concealment (2.16× advantage), silent movement (radius 0, reached the
radio undetected past seven guards), cover breaking sight, de-escalation, and
the radio.

---

## 8. F3 vision-cone overlay

`Village.drawVisionDebug`, drawn on its own graphics layer at depth 68, off
unless F3 is pressed. Per guard:

- **Vision wedge** — filled and outlined, with both 50° edges drawn explicitly.
- **Facing centre line** to full range.
- **Suspicion bar** — 20 px, filled proportionally.
- **State colour** — teal `patrol`, amber `investigate`/`search`, red `combat`.
- **Last known player position** — hollow magenta square, dotted line to the guard.
- **Investigation/pursuit destination** — blue X.
- **Label** — `L6 COMBAT 100`.
- **Player readout** — stance, `+SHADOW`, the resulting suspicion rate, and the
  cone constants.

### It is exact, not an approximation

Each wedge boundary point comes from a new `Grid.raycastSight`, which uses the
engine's own occlusion predicate — the same `blocksSight` test `canSee` runs —
so a wedge clipped by a wall is clipped exactly where sight is lost. Only the
curvature *between* adjacent rays is interpolated (24 rays across 100°); the
range and half-angle are exact.

`raycastShot` would have been the wrong tool and is a real trap: it stops on
`collides`, and low cover collides with bullets while leaving a *standing*
target perfectly visible. `tests/grid.test.ts` pins this with a test that the
two raycasts deliberately disagree.

**One documented approximation:** the wedge is drawn for the player's *current*
stance, because low cover blocks sight only for a crouching target, so a single
wedge cannot be correct for both. The player readout states the stance in force.

Rendering is additive, reads state through read-only accessors
(`debugLastKnown`, `debugDestination`), writes nothing, and the labels are
created once and released on scene shutdown.

---

## 9. Regression assertions rewritten (§7 of the brief)

The 04A test asserting `PLAYER.speedCrouch === ENEMIES.lookout.combatSpeed` is
**gone**. It recorded a tuning coincidence as a requirement; the disengagement
suite then showed the escape sequence works fine at those speeds, so pinning
the equality would have blocked a harmless future tweak while testing nothing
about whether stealth recovers.

`tests/playability.test.ts` now asserts the contract:

- crouching buys ≥1.5× time-to-detection, shadow ≥2.5×;
- walking and sprinting both exceed a Lookout's pursuit speed (sprint by >2×);
- mobility costs concealment — sprinting raises the rate *and* is audible, while
  crouching is silent (`footstepCrouch == 0`);
- solid cover defeats both `hasLineOfSight` and `canSee`;
- low cover hides a crouching but not a standing player;
- **no sound yields an exact position, except the radio**;
- **hearing stays strictly less informative than seeing** — asserting both the
  unlimited rate exceeds `ratesSprinting` (the defect) and the limited rate does
  not (the fix);
- a full alert decays to 0 inside the investigate timeout.

Tuning values are kept in **one** test that records them as documentation, with
a comment saying a change should prompt a re-run of the disengagement suite
rather than an automatic failure.

Plus 5 new `tests/grid.test.ts` assertions for `raycastSight`.

---

## 10. Screenshots

Native 480×270, in [`screenshots/`](screenshots/). Shots 3–5 have the F3
overlay on, because the guard's reasoning is the point of those frames.

| § | File | Shows |
| --- | --- | --- |
| 1 | `04b1-shot1-undetected-crouched-cover.png` | Crouched behind the office block, undetected |
| 2 | `04b1-shot2-detection-beginning.png` | Suspicion climbing mid-range |
| 3 | `04b1-shot3-sprinting-to-cover.png` | Detected, sprinting for cover |
| 4 | `04b1-shot4-investigating-last-known.png` | Guard at the last known position; magenta marker and blue destination X visible |
| 5 | `04b1-shot5-repositioning-concealed.png` | Repositioning while concealed |
| 6 | `04b1-shot6-f3-vision-overlay.png` | The overlay — red combat wedge, clipped by the market hall |
| 6 | `04b1-shot6b-f3-overlay-investigating.png` | Overlay with the tile/shadow layer and player readout |
| 7 | `04b1-shot7-radio-activated.png` | The market radio, switched on by a real `E` press |
| 7 | `04b1-shot7b-radio-aftermath.png` | Guards afterwards |
| — | `04b1-A..I-*.png` | One frame per disengagement scenario |
| — | `04b1-patrol-stall.png` | The §7 stall |

**These are diagnostic frames of specific mechanics. None is evidence of a
completed playthrough** — 04A's `playthrough.mjs` owns that claim.

Machine-readable telemetry: [`data/disengagement.json`](data/disengagement.json)
(full per-sample traces for every scenario),
[`data/stealth-shots.json`](data/stealth-shots.json) (radio events and series),
[`data/patrol-audit.json`](data/patrol-audit.json), and
[`data/disengagement-prefix.json`](data/disengagement-prefix.json) — the same suite
run against the pre-fix constants, which is the §4 before/after evidence.

---

## 11. Build and test results

```
npx tsc --noEmit          clean
npx vitest run            13 files, 300 passed, 0 failed
npm run build             succeeds
node tools/build-map.mjs  green
tools/disengage-tests.mjs 11/11 scenarios pass
tools/patrol-audit.mjs    4/7 guards patrol correctly  <- §7
```

---

## 12. Remaining barriers to a no-detection completion

1. **The patrol stall (§7) is the blocker.** Three of seven guards are static,
   so the market has no patrol openings to time and the radio cannot be used as
   designed. Fix in 04B-2, then build the stealth route harness against routes
   that actually move.
2. **No human playtest.** Still outstanding from 04A.
3. **Dependency-gated interactables refuse silently** — carried over from 04A,
   assigned to 04B-3.
4. **Shadow is hard to read** (ENV-004) and **guard facing is a 3 px tick**
   (CHAR-001). Both are art requests, unchanged, and both make stealth harder
   to play than it is to model.
5. **One sprint footstep still pushes a guard over the suspicious threshold**
   (34 against a threshold of 30) within 96 px. That is now a single
   investigation of a 48 px area rather than a pinpoint chase, so it is fair —
   but it means sprinting anywhere near a guard always draws a look. Flagged as
   a tuning observation, deliberately **not** changed, since the proven defect
   was the localisation and the stacking, not the per-event value.

## 13. Art-agent requests

None new. No artwork was created or modified. The overlay uses debug graphics
only. CHAR-001 (directional Lookout sheets) and ENV-004 (shaded surface
variants) remain the two art items that most affect stealth legibility.
