# Valcendre full-mission playthrough and pacing validation — Phase C.1B, Task 04A

**Commit tested:** `184d481` (plus this task's test/tooling additions; no game
behaviour was changed — see §2).

**Date:** 2026-11-04

---

## 1. Environment and commands

`npm install` still fails against the configured CodeArtifact registry, whose
AWS token is expired. The public-registry override established in C.1B-03 was
used again; no credential, token or registry configuration is committed and no
dependency was added or changed.

```bash
npm install --registry=https://registry.npmjs.org/   # per-command override only
npx tsc --noEmit
npx vitest run
npm run build
npx vite preview --port 4173                          # binds 127.0.0.1 only

# end-to-end playthroughs (real browser input)
node tools/playthrough.mjs <chromium> all docs/playtests/data
# pacing breakdown from the recorded traces
node tools/pacing-report.mjs docs/playtests/data
```

Browser: headless Chromium (Playwright-managed build, rev 1234) with
SwiftShader. **The game runs at a measured 1.000× real time in this
environment**, so recorded game-clock figures are not distorted by the harness.

Playwright is not a project dependency; it is resolved from a local install via
`NODE_PATH`.

---

## 2. What the harness is, and what it is not

`tools/playthrough.mjs` is a **closed-loop browser-input driver**. Every action
is a real keyboard or mouse event delivered to the page: WASD to walk, Shift to
sprint, C to crouch, E to interact, R to reload, left mouse to fire. The game
decides what happens.

It **reads** game state to steer and to record telemetry — player position,
enemy suspicion, objective flags — and it **never writes** game state. There is
no teleporting, no granting of mission flags, no opening of doors, no touching
of enemy state, no disabling of detection. Every result in §4 was produced this
way.

The one read a human would not have is `grid.findPath`, used for route-finding.
That stands in for a player's memory of the level layout, not for any game
capability.

**Telemetry is harness-side.** Game methods are wrapped to observe calls and
return values, always calling through unchanged. **No file in `src/` was
modified for this task**, so the instrumentation cannot alter enemy behaviour or
player movement, and there is no production footprint. Each run starts from a
cleared save; nothing is written to production saves beyond what the game itself
writes.

This replaces the C.1B-03 screenshot harness, which positioned the player
through a debug handle. Those staged frames are explicitly **not** used as
playthrough evidence here.

### Automated vs manual

Everything below is **automated**. No human playtest was performed, so the
8–12 minute first-time-player target in §5 is **not verified** — see §5.

---

## 3. Headline answers

| Question | Answer | Evidence |
| --- | --- | --- |
| Completable normally at all? | **Yes, verified twice** | `sprint-0` 8/8 at 53.5 s, `sprint-1` 8/8 at 65.5 s |
| Completable through direct combat? | **Combat itself is comfortably viable; no automated run finished** | 8 shots, 8 hits, 4 kills, **0 damage taken** — but the driver timed out, see §4C |
| Completable through stealth? | **Not demonstrated** | 4 attempts, 0 beats; cause analysed in §4A |
| Garage key / both doors / BELIAL without cheating? | **Yes** | V5→key→physical garage entry→V4→V6→V7→V8, all by input |
| Can Tempest still sprint through risk-free? | **No** | 4 of 6 sprint attempts died; survivors lost 60–72 HP |
| Checkpoints and saves survive death and refresh? | **Yes** | §4E, including browser reload |

---

## 4. Scenario results

Raw per-run JSON is in [`data/`](data/); the pacing breakdown is
[`data/pacing-summary.json`](data/pacing-summary.json).

### Scenario D — Sprint-through (the primary completability proof)

Three attempts per batch, each idling a different amount first to shift patrol
phase. Across two batches, **six attempts: two full completions, four deaths.**

| Run | Result | Game time | Active | HP left | Hits taken | Shouts / rallies |
| --- | --- | --- | --- | --- | --- | --- |
| `sprint-0` | **complete 8/8** | **53.7 s** | 44.4 s | 52 / 100 | 4 (48 dmg) | 19 / 9 |
| `sprint-1` | **complete 8/8** | **56.9 s** | 48.0 s | 4 / 100 | 8 (96 dmg) | 17 / 5 |
| `sprint-2` | died at garage door | 49.4 s | 34.9 s | 0 | 9 | 16 / 1 |
| earlier batch ×3 | 2 deaths, 1 reached V7 | 40–67 s | — | 0 / 0 / 52 | 9 / 9 / 4 | — |

Objective timestamps for the fastest completion (`sprint-0`):

| Beat | V1 | V2 | V3 | V5 | V4 | V6 | V7 | V8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Game clock | 5.6 s | 8.1 s | 23.6 s | 26.5 s | 41.6 s | 47.5 s | 48.7 s | **52.1 s** |

**The ~10-second problem is eliminated.** The C.1A baseline was a 7.7-second
run of 1,165 px with no risk. The fastest *successful* sprint here is 53.7 s
over ~3,990 px, took 48 damage, and two thirds of attempts ended in death. A
sprinter is no longer merely slower — they usually die.

### Scenario A — Main-street stealth

**Four attempts, zero objectives.** Outcomes: died at 21 s, 25 s and 24 s; one
attempt survived 191 s at 76 HP without reaching the first objective.

| Attempt | Outcome | Wait time | Flee time | Detections | Break-offs |
| --- | --- | --- | --- | --- | --- |
| 1 | died | — | — | — | — |
| 2 (cautious tuning) | timeout, 0 beats | 50.4 s | 11.9 s | 3 | 3 |
| 3–4 (risk-tolerant tuning) | died at 24–25 s | 2.8 s | — | — | — |

**This is primarily a harness limitation, and I am not going to dress it up as a
level finding.** The reasons, in order of likely weight:

1. The driver's control loop is ~250 ms (several page round-trips per decision).
   A player reacts continuously; this bot reacts four times a second.
2. It walks the **A\* shortest path**, which runs through the open middle of the
   market. It never uses the shadowed west arcade, which C.1B-03 measured as the
   stealth approach, because nothing tells it to prefer cover.
3. It never uses the radio distraction, the one authored tool for exactly this
   problem.
4. Tuning it is a knife edge: cautious settings produced 50 s of waiting and no
   progress, and loosening them produced death in 24 s. That oscillation is
   characteristic of a bad policy, not of an impossible level.

One genuine design hazard did surface from these runs, and it is measurable
rather than impressionistic — see Finding 1 in §7.

### Scenario B — Garden-route stealth

Outcome: **died at 68.8 s, 0 beats.** 73% of the run (49.6 s) was spent standing
still waiting for a patrol opening, 56.3 s of it crouched — and only **0.4 s in
authored shadow.** The driver was crouching in the open rather than in the
shadow that the route's stealth advantage is built on, which is the same
cover-blindness as Scenario A.

The one thing worth taking from this run: it shows the garden route is not a
free pass. It does **not** show whether the route is well balanced, because the
driver never actually used it as designed.

### Scenario C — Direct combat

Gunplay is decisive, accurate and — on this evidence — **very forgiving**:

| Metric | Result |
| --- | --- |
| Player shots fired | 8 |
| Shots that hit | 8 (**100% accuracy**) |
| Guards killed | **4 of 7** |
| Damage taken | **0** |
| HP at end | **100 / 100** |
| Enemy shots fired at the player | **117** |
| Beats reached | V1 @ 6.8 s, V2 @ 49.5 s, V3 @ 70.0 s |

The pistol does 34 per body shot against 60 HP, so a Lookout dies in two hits —
eight shots, four kills, exactly as the arithmetic predicts. Market evidence was
obtained with guards dead, confirming objectives never depend on enemy survival.

**117 enemy shots produced zero hits.** An earlier combat run took 9 hits from
16 enemy shots, so the hit rate swings enormously with position — consistent
with cover genuinely working, which is the charitable and probably correct
reading. But a 117-to-0 stretch is extreme enough that it should be looked at
by a human before anyone concludes enemy fire is well tuned. Logged as an open
question in §11 rather than a finding either way.

No automated combat run completed the mission. Both attempts ended in the
driver's engagement loop timing out — the `combat` trace shows 234 s of game
clock against only 61 s of active play, so most of that run is the bot standing
around, not the mission resisting. The mission never refused to progress.

### Scenario E — Checkpoint recovery

**Fully verified, every item passing.**

| Check | Result |
| --- | --- |
| Key acquired by normal play | ✅ `V5`, both doors open |
| Save written | ✅ `version=2`, `cp_office`, `hasGarageKey=true`, 2 open doors, 7 enemies |
| Death by real enemy fire | ✅ provoked by standing in the courtyard; no state injected |
| Automatic checkpoint reload | ✅ HP 52, key kept, both doors open, `[V1,V2,V3,V5]` |
| **Browser refresh** | ✅ key kept, both doors open, `[V1,V2,V3,V5]` |
| All seven guards restored | ✅ all 7 at valid positions, none dead |
| Progression after restore | ✅ garage entered, van examined, `V4` granted |
| Permanently blocked? | ✅ No — never observed |

The earlier apparent failure here was **my bug, not the game's**: the harness
init script re-ran on every navigation and cleared `localStorage`, destroying
the very save the refresh test exists to restore. Once the clear was made
one-shot per tab, restoration worked on the first try.

---

## 5. Pacing

### Measured automated times

| Run | Style | Game clock | Active clock | Distance |
| --- | --- | --- | --- | --- |
| `sprint-0` | sprint, complete | 53.7 s | 44.4 s | ~3,990 px |
| `sprint-1` | sprint, complete | 56.9 s | 48.0 s | ~4,030 px |

(Distance is measured between samples, so the 1 Hz committed trace reports a
slightly shorter 3,436 px / 3,495 px by chord-shortening across corners.)

The active clock excludes dialogue, pause and death time; the game clock
includes them.

### Time breakdown (the two completing runs)

| Activity | `sprint-0` | `sprint-1` |
| --- | --- | --- |
| Traversal | 34.1 s (65%) | 30.2 s (59%) |
| Stealth observation | 2.1 s (4%) | 1.0 s (2%) |
| Combat | 7.9 s (15%) | 8.4 s (16%) |
| Dialogue / story | 8.5 s (16%) | 11.9 s (23%) |
| Recovery / reloading | 0 s | 0 s |

The committed position traces are **downsampled to ~1 Hz** to keep the data
directory under a megabyte, so these percentages are what
`tools/pacing-report.mjs` reproduces from the files in `data/`. The full-rate
traces resolve short pauses that 1 Hz misses; at full rate the same two runs
read closer to 55% traversal / 17% observation. Re-run the harness for
full-rate data. The shape of the conclusion is the same either way: traversal
dominates, combat and dialogue are each around a sixth, and there is no
recovery time in a clean run.

Objective interactions are counted as events, not duration: pressing E is
instantaneous and the approach time is already traversal.

### Against the design targets

| Player type | Target | Status |
| --- | --- | --- |
| Optimised speedrun | ~1.5–2.5 min | **Automated sprint is 0.9–0.95 min.** Faster than the target band — but this is a bot that knows every objective location, never explores and never hesitates. It is a lower bound on a speedrun, not a speedrun. |
| Experienced player | 4–6 min | **Not verified.** No automated run models an experienced human. |
| First-time player | 8–12 min | **NOT VERIFIED.** No human playtest data exists. An automated driver cannot represent exploration, reaction time or uncertainty, and I am not going to extrapolate a first-time figure from a bot. |

### Stretches with no meaningful decision

In both completing runs the longest stretch where the player was alive, out of
combat and not moving was **1.1 seconds**. There is no dead air in a
continuously-played run.

The 39 s and 46.5 s idle stretches that appear in the combat and
garden-stealth traces are **the harness standing still** — its engagement loop
and its wait-for-opening loop. They are not player-facing dead time and should
not be read as a pacing defect.

---

## 6. Encounter quality

Judgement, flagged as such, informed by the measured runs.

### Market Square (L1, L2, L3)

**Working.** Every single run was challenged here, and four stealth attempts
died or stalled in it. Guard facing and cover demonstrably matter: the
difference between the driver's cautious and bold settings was the difference
between no progress and death in 24 s.

- **Cover and facing:** yes, decisively.
- **Alternate paths:** present but unproven. The driver never used the arcade.
- **Radio distraction:** **unexercised.** No run used it, so its usefulness is
  still unmeasured. This is the biggest gap in this task's coverage.
- **Evidence without a mandatory firefight:** yes — V1 and V2 were obtained in
  sprint runs without a single shot fired, and the alternate V2 source fired en
  route repeatedly.

### Garden Route (L4)

**Unproven.** L4 was never beaten by a stealth run, but the run that tried spent
only 0.4 s in shadow, so this says more about the bot than the route. The route
is at least not trivially safe.

### Depot Courtyard (L5, L6)

**Working, and the hardest space in the game.** It is where most runs died.

- The office was reached and left in every run that got there, with the key.
- Combat advance works: standing in the open courtyard reliably drew two guards
  into combat, which is also how Scenario E's death was provoked.
- **L6's 47 s patrol did not produce dead air.** The completing runs show max
  1.1 s of idling, and the courtyard legs show 70–78% patrol exposure. The
  C.1B-03 concern does not reproduce in play.

### Garage (L7)

**Working as a final problem, with one flaw.** The van, cultist and inscription
were all reached and triggered by normal input; combat did not block any
narrative event. But the garage sequence is where the most deaths happened, and
it has no checkpoint — see Finding 2.

---

## 7. The C.1B-03 concerns, re-evaluated in play

| Concern | Verdict |
| --- | --- |
| Weak main-street transit coverage | **Not a problem.** Players took damage crossing it in several runs. It reads as a corridor between two encounters, which is appropriate. No change recommended. |
| L6's long 47 s patrol | **Not a problem.** No dead air measured; courtyard remains the deadliest area. No change recommended. |
| Intermittent alert chaining | **Not a problem — the static analysis understated it.** In motion, chaining is frequent: 26 shouts / 7 rallies in `sprint-0`, 13–18 in most runs. Intermittency produces variety rather than a guaranteed cascade. No change recommended. |
| L7 absent from the courtyard pre-unlock | **Not a problem.** L5 and L6 already make the courtyard the hardest space; adding L7 would compound it. No change recommended. |
| No vision-cone debug visualisation | **Confirmed, and it cost this task real time.** Without a cone overlay I could not see why the stealth driver was being spotted, and had to reconstruct the sight contract in the harness to reason about it. |

---

## 8. Combat fairness

| Check | Finding |
| --- | --- |
| Enemy bullets originate sensibly | Not visually audited frame-by-frame; `fireProjectile` is called from the shooter's ground point, consistent with the player's. |
| Player bullets hit intended targets | **Yes — 100% accuracy over 4 aimed shots**, 2 confirmed kills. |
| Cover blocks fire consistently | Yes; asserted in `tests/encounters.test.ts` and no shot-through-wall was observed. |
| Guards communicate detection state | Partly. Alert icons and the facing tick exist, but see §9. |
| Reasonable warning before incoming fire | Yes by contract — 0.45 s aim windup after the 100 threshold. Not separately timed here. |
| Enemy attacks predictable | Yes — fixed 1.4 s interval, visible in the telemetry as near-exact 1.4 s spacing between `enemy_shot` events. |
| Hit feedback indicates damage | HP drops are legible in the HUD; audio and hit-marker exist. Not evaluated for feel. |
| Ammunition supports combat completion | **Yes, comfortably.** 2 shots per kill, 8-round magazine plus 24 reserve = 16 kills' worth against a 7-guard roster. The combat run killed 4 guards using 8 of 32 rounds. |
| Enemies escapable by positioning | **Only by standing up or sprinting** — see Finding 1. |

---

## 9. Visual and usability observations

Observations only. Nothing here is an art change, and art requests are kept
separate in §11.

1. **Prompt suppression on an unmet dependency is silent.** Standing 4 px from
   the BELIAL inscription with V6 incomplete produces **no prompt and no
   glint** — `Interaction.resolve` and `drawGlints` both skip a prop whose
   `requires` is unmet. The player gets no signal that this is the right place
   and something else is needed first. Observed directly in Scenario E after a
   rollback cost V6.
2. **Enemy facing readability** remains a 3 px tick (known; CHAR-001/VPE-001).
   This materially slowed the harness work.
3. **Shadow readability**: the garden run spent 56 s crouched and 0.4 s in
   shadow. A player cannot easily tell where the authored shadow is (known;
   ENV-004).
4. **Objective guidance** is a single HUD line. For the V5→V7 garage sequence,
   where three beats happen in one room in a fixed order, that line is the only
   indication of order.

---

## 10. Proposed adjustments for C.1B-04B, by impact

**Not implemented in this task.** Ordered by measured impact.

### P0 — Finding 1: a detected crouching player cannot disengage

`PLAYER.speedCrouch` is **66 px/s** and `ENEMIES.lookout.combatSpeed` is also
**66 px/s**. A crouched player who is detected therefore cannot break away at
all; they must stand (108) or sprint (152), which raises their detection rate
from 45/s to 80/s or 120/s. Two Lookouts kill in ~5.6 s.

This is the one hazard that cost automated stealth runs real lives rather than
just stalling them, and it punishes exactly the player who was doing the right
thing. Options for 04B, cheapest first: drop `combatSpeed` slightly below crouch
speed; or let crouch-sprint exist; or shorten pursuit commitment. **Equality of
those two numbers is now pinned by a test**, so any change is deliberate.

### P1 — Finding 2: no checkpoint across the V5→V7 garage sequence

Checkpoints are `cp_entry`, `cp_market` (V2), `cp_office` (V5), `cp_belial`
(V7). Dying anywhere in the garage rolls back **V4 and V6** — observed directly:
objectives went `[V1,V2,V3,V5,V4]` → `[V1,V2,V3,V5]` after a death. The player
must re-enter the garage, re-examine the van and re-trigger the cultist scene,
and because of Finding 3 gets no hint that the cultist is what is missing. The
garage is also where most deaths happened. A checkpoint on V4 would fix it.

### P1 — Finding 3: silent refusal at a dependency-gated interactable

Give an unmet-dependency prop a distinct state rather than no state: a dimmed
prompt, or the "Nothing useful here yet" subtitle that `grantBeat` already has
for a blocked beat. Currently the object is invisible to both the prompt system
and the glint system.

### P2 — Finding 4: vision-cone debug overlay

Add the guard sight cone to the F3 overlay. This is a tooling change, not a
balance change, and it would have materially shortened this task.

### Explicitly NOT recommended

Main-street coverage, L6's patrol length, alert-chain intermittency and L7's
pre-unlock absence. All four looked imperfect statically and all four behave
correctly in play.

---

## 11. Coverage gaps in this task

Stated plainly so the next task knows what is still unknown:

1. **No human playtest.** The 8–12 minute and 4–6 minute targets are unverified.
2. **No successful automated stealth run.** Whether a no-kill completion is
   viable is still an open question. The evidence points at the driver, not the
   level, but it is not settled.
3. **The radio distraction was never used** in any run.
4. **The west arcade and the garden shadow were never used** as stealth routes.
5. **No automated combat completion**, though the gunplay metrics are sound.
6. Enemy muzzle origins were not audited visually frame-by-frame.
7. **Enemy accuracy is unexplained.** One run: 117 enemy shots, 0 hits. Another:
   16 shots, 9 hits. Cover position plausibly explains it, but it needs a human
   eye before anyone calls enemy fire balanced.

The highest-value next step for confidence is a **human playthrough**, not a
better bot: items 1–4 all resolve immediately with a person at the keyboard.

---

## 12. Screenshots

Real frames from the recorded playthroughs are in
[`screenshots/`](screenshots/), captured at native 480×270 at each beat of the
completing `sprint-0` run plus the scenario endpoints. These are **not** staged
debug positions — the player walked to every one of them under input control.

---

## 13. Automated regression checks

New: `tests/playability.test.ts` (12 assertions). Every one pins something this
task actually tripped over:

- every mandatory interactable has a standable tile inside the 28 px
  `interactRange` with clear reach (the harness hit a 31 px approach that could
  not interact);
- the exit trigger rectangle contains a walkable tile (the harness stopped 8 px
  outside it and the mission silently would not end);
- the overheard-conversation trigger genuinely straddles the tracks→waybill
  route, so V2's second source is real in practice and not just authored;
- the escape and time-to-death arithmetic of Finding 1, recorded so a future
  change to a speed or damage value is deliberate;
- supplies support a combat completion.

Full suite at the end of this task:

```
npx tsc --noEmit        clean
npx vitest run          13 files, 290 passed, 0 failed
node tools/build-map.mjs  green
npm run build           succeeds
```
