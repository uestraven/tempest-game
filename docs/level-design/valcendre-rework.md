# Valcendre rework — Phase C.1A design

Design and investigation only. **Nothing in this document is implemented.**
Implementation is Phase C.1B, gated on review of this plan.

Art requests arising from it: [`../art-requests/valcendre-pacing.md`](../art-requests/valcendre-pacing.md).

---

## 1. Diagnosis — measured, not estimated

All figures below come from running the engine's own `Grid` A*, `Vision` and
constants against the shipped `public/assets/maps/village.json`. The harness is
preserved as `tests/pacing.test.ts` so C.1B can re-measure the same way.

### 1.1 The level is 7.7 seconds long

| Leg | Distance |
| --- | --- |
| spawn → van (V1) | 891 px · 55.7 tiles |
| van → log (V2) | **112 px · 7.0 tiles** |
| log → exit (VX) | **162 px · 10.1 tiles** |
| **Critical path total** | **1 165 px · 72.8 tiles** |

| Movement | Pure traversal time |
| --- | --- |
| Sprint (152 px/s) | **7.7 s** |
| Walk (108 px/s) | 10.8 s |
| Crouch (66 px/s) | 17.7 s |

7.7 s of sprinting plus three instant interactions and two skippable dialogue
exchanges is the reported ~10 seconds. **The report reproduces in the route
maths.** (It has not been reproduced in a browser — see §7.)

76% of the critical path is a single uninterrupted walk from spawn to the van.
The other two mandatory objectives sit 7 and 10 tiles from it, at the far end of
the map.

### 1.2 The level is 94% optional

| Area | Tiles authored | Tiles the speedrun route crosses |
| --- | --- | --- |
| Market square | 390 | 18 (5%) |
| **Garage yard** | **372** | **0 (0%)** |
| Garage interior | 179 | 19 (11%) |
| Service corridor | 83 | 13 (16%) |
| Arrival alley | 74 | 10 (14%) |
| **Garden lane** | **36** | **0 (0%)** |
| North road | 16 | 4 (25%) |

The route visits **64 distinct tiles of 1 027 walkable — 6.2% of the level.**

### 1.3 The "stealth route" is the speedrun route

| Approach to the van | Distance |
| --- | --- |
| Market → yard → garage door | 947 px |
| **Service corridor (the "stealth route")** | **901 px** |

The stealth bypass is **47 px shorter** than the main route. It is therefore not
an alternative — it is **strictly dominant**: shorter *and* safer *and* shadowed.
That single fact explains why the garage yard (372 tiles, two crate clusters,
two barrier rows, an ammunition box and a Lookout) is never visited. The
level's main combat space is dead content.

### 1.4 Ignoring enemies is free

| Stance | Suspicion | Seconds of visibility to reach combat |
| --- | --- | --- |
| Standing | 80/s | 1.25 (0.83 within 48 px) |
| Crouching | 45/s | 2.22 (1.48) |
| Crouch in shadow | 28/s | 3.57 (2.38) |
| **Sprinting** | **120/s** | **0.83 (0.56)** |

- A Lookout needs **0.45 s** of aim windup, plus up to **0.44 s** of bullet
  flight at 176 px — so **0.89 s** elapses after suspicion hits 100 before a
  round can land.
- A sprinting player must therefore stay continuously visible for **1.28 s**
  before a shot is even fired, covering **195 px (12.2 tiles)** in that time.
- Measured exposure: the critical path is visible from a guard's start post at
  **11 of 64 sampled steps — 17%**, about **1.3 s of the 7.7 s run.**

The exposure window and the time-to-first-shot are the same length. A sprinter
is essentially never shot at.

Worse, there is **no cost to being detected**. Guards pursue at 66 px/s
(`combatSpeed`) against a 152 px/s sprint, so the player simply leaves. Guards
investigate for 8 s and de-escalate.

### 1.5 Patrols are too small to matter

| Guard | Route | Loop length | Loop time |
| --- | --- | --- | --- |
| `enemy_l1` | 2 waypoints | 173 px | **6 s** |
| `enemy_l2` | 4 waypoints | 840 px | 23 s |
| `enemy_l3` | 4 waypoints | 731 px | 21 s |

`enemy_l1` paces a 173 px loop — it is scenery. Three guards cannot cover a
73-tile path.

### 1.6 BELIAL is skippable

V3, the inscription naming BELIAL, is marked `optional: true` and costs **83 px**
of detour. The campaign's central hook can be missed entirely, which also
contradicts the locked spec's information ladder (§11: "Level 1 — the word
BELIAL").

### 1.7 Root cause

**The problem is topology, not numbers.** Movement speeds, suspicion rates,
weapon damage and guard reaction times are all defensible. What is broken:

1. The mandatory objective graph is a 3-node straight line, 73 tiles long, with
   two nodes adjacent at the far end.
2. Guard coverage of that line is 17%.
3. The alternative route is shorter than the main route, so route choice has a
   dominant answer.
4. Detection has no consequence a sprint cannot outrun.
5. 94% of authored space is off the critical path.

Fixing it does **not** require slowing the player, inflating enemy health,
adding timers or buffing awareness — all of which the locked principles forbid
anyway. It requires a longer, branched, better-guarded objective graph.

---

## 2. Revised map plan

**104 × 72 tiles = 1 664 × 1 152 px.** (The brief's 100 × 70 hypothesis, plus a
margin for the wall ring and the roof band the Phase B.1 architecture pass
paints outside the playable area.)

Seven areas, one large counter-clockwise loop with one mid-mission branch.

```
                        [North road / EXIT]            x 68-72  y 0-5
                                 |
          [Loading dock]---[Garage interior]           x 58-84  y 6-19
            x 84-90                 |
            y 10-20        [Depot courtyard]           x 50-86  y 20-45
                            /              \
          [Depot office]---+                +---[Depot south gate]  x 62-66 y 45
            x 50-57 y 22-30                          |
                    ^                         [Main street]        x 42-74 y 46-56
                    |                                |
          [Garden wall walk / upper lane]            |
            x 6-11 y 10-22,  x 11-46 y 10-15         |
                    ^                                |
          [Bakery yard]  x 6-20 y 20-31              |
                    ^                                |
                    +---------[Market square]--------+  x 8-42 y 32-56
                                   |
                        [Arrival alley]  x 6-15 y 58-68
                                   |
                              START (10,66)
```

### 2.1 Area briefs

| Area | Tiles | Role | Surface (existing roles) |
| --- | --- | --- | --- |
| **Arrival alley** | x 6-15, y 58-68 | Quiet opening, teaches look-before-moving | `alleyCobble` |
| **Market square** | x 8-42, y 32-56 | First real encounter; covered market, stalls, fountain | `marketPaving` |
| **Bakery / garden route** | bakery yard x 6-20 y 20-31; wall walk x 6-11 y 10-22; upper lane x 11-46 y 10-15 | Long stealth branch, heavily shadowed, narrow | `gardenGrass`, `gardenPath`, `serviceBrick` |
| **Main street** | x 42-74, y 46-56 | Short combat branch, open lanes, hard cover | `alleyCobble` |
| **Depot courtyard** | x 50-86, y 20-45 | Main encounter; long shooting lanes | `yardGravel` |
| **Depot office** | x 50-57, y 22-30 | Ledger + garage key; interior space | `garageFloor` |
| **Garage interior** | x 58-84, y 6-19 | Van, cultist beat, BELIAL | `garageFloor` |
| **Loading dock** | x 84-90, y 10-20 | Side stealth access to the garage | `yardGravel` |
| **North road** | x 68-72, y 0-5 | Exit | `roadDirt` |

Every surface, cover role and prop named above **already exists**. The redesign
needs no new art to be *playable* — the art request is for differentiation and
story props, not for blockers.

### 2.2 Why this geometry fixes the diagnosis

- **The two routes reconnect at the depot courtyard**, as the brief requires,
  and the garden branch is deliberately **longer** (see §2.3), so it is a
  trade-off rather than a dominant answer.
- **The garage is the only way to the exit.** The north road sits beyond the
  garage, so the final security problem cannot be bypassed.
- **The courtyard must be crossed twice on different lines** — in at the south
  gate, west to the office, then north-east to the garage door. A Z, not a
  retrace: no ground is walked twice.
- Three distinct encounter spaces (market, courtyard, garage) sit on the
  critical path, where there was previously one half-crossed square.

### 2.3 Route arithmetic

| Leg | Target distance |
| --- | --- |
| spawn → market: convoy stop (V1) | 520 px |
| V1 → waybill / overheard lead (V2) | 300 px |
| V2 → route split | 260 px |
| **Main street** split → depot south gate | **820 px** |
| *Garden route* split → courtyard north-west | *1 450 px* |
| Depot gate → office (V5 + key) | 700 px |
| Office → garage door | 620 px |
| Garage door → van (V4) | 240 px |
| Van → cultist (V6) → BELIAL (V7) | 120 px |
| → north road (V8) | 300 px |

| Route | Critical path | Sprint traversal |
| --- | --- | --- |
| Main street (combat) | **3 880 px** | 25.5 s |
| Garden (stealth) | **4 510 px** | 29.7 s |

**3.3× the current path length**, and the stealth branch is now **630 px (4.1 s)
longer** than the combat branch instead of 47 px shorter.

---

## 3. Objective graph

Eight beats, six mandatory interactions, four distinct areas. No fetch quests,
no backtracking, and no mandatory kill.

| ID | Beat | Where | Mandatory | Alternate solutions |
| --- | --- | --- | --- | --- |
| **V1** | Find where the convoy stopped | Market square | yes | **Two sources, one flag:** tyre marks + casings by the fountain, *or* the overturned stall with a dropped sidearm |
| **V2** | Learn where she was taken | Market square | yes | **Two sources:** the carter's waybill nailed in the covered market, *or* overhearing the two market guards (proximity trigger, no kill) |
| **V3** | Reach the transport depot | Traversal | yes | Main street *or* garden route |
| **V5** | Recover the ledger page naming Barnabé | Depot office | yes | Ledger on the desk; the **garage key** is on the same desk |
| **V4** | Find Suzanne's transport | Garage interior | yes | — |
| **V6** | Witness cult fanaticism | Garage interior | yes | Scripted: a wounded cultist refuses aid and dies willingly. **Non-combatant**, cannot be required to kill, triggers on approach |
| **V7** | **BELIAL** | Garage interior | **yes — no longer optional** | The dying cultist's line points at the inscription behind the van; examining it is one interaction |
| **V8** | Leave by the north road | North road | yes | — |

Dependency order is enforced by **geography and one key**, not by artificial
locks:

```
V1 ──► V2 ──► V3 ──► V5 (ledger + garage key) ──► V4 ──► V6 ──► V7 ──► V8
        │                      │
        └─ both market sources │
           grant the same flag └─ garage door needs the key; the exit is past the garage
```

- Crossing the market is unavoidable: both routes north leave from it.
- The garage door needs the office key, so the courtyard Z is mandatory.
- The exit is past the garage, so V4/V6/V7 cannot be skipped.
- **The key is on a desk, never on a guard** — the locked spec forbids vital
  keys on missable enemies, and §4 of this brief forbids requiring a kill.

V3 is a traversal flag, not an interaction, so the six interactions are V1, V2,
V5, V4, V7 and V8. Optional lore (torn hymn, chapel sigil, depot manifest) stays
optional and off the critical path.

Dialogue: two short exchanges only (arrival, and the cultist's dying line),
2–3 lines each, skippable after first view.

---

## 4. Enemy encounters — seven Lookouts

No new archetypes. No stat changes (see §6).

| # | Post | Area | Role |
| --- | --- | --- | --- |
| L1 | Market south gate | Market | Teaches the vision cone at low stakes |
| L2 | Market roamer | Market | Long loop across the square |
| L3 | Covered market | Market | Watches **both** north exits — the route split |
| L4 | Garden wall walk | Garden route | The stealth branch's own obstacle |
| L5 | Depot south gate | Main street / courtyard | Static gate guard; cone covers street *and* courtyard |
| L6 | Courtyard long patrol | Courtyard | The main combat encounter |
| L7 | Garage / loading dock | Garage | Final security problem |

### 4.1 Coverage targets

| Metric | Now | Target |
| --- | --- | --- |
| Critical-path exposure (visible from a guard's post) | 17% | **≥ 45%** |
| Shortest patrol loop | 173 px / 6 s | **≥ 450 px / ≥ 14 s** |
| Encounter spaces on the critical path | 1 | **3** |

Measured the same way as §1.4, by `tests/pacing.test.ts`.

### 4.2 Detection has a consequence: acoustic chaining

The engine already rallies guards within 160 px of a shout
(`SOUND_RADIUS.shout`, `Enemy.rally`), and a rallied guard investigates the
*reported* spot rather than tracking the player. The redesign **exploits that
instead of changing any numbers**: guard posts are placed so that consecutive
encounters sit within one shout of each other along the critical path.

A player who is detected in the market therefore arrives at the route split with
L3 already turned and searching, and a player detected in the courtyard reaches
the garage with L7 alert. The cost of being seen is that the *next* encounter is
harder — which scales naturally, needs no timers, no respawns and no stat
inflation, and is fully recoverable: suspicion decays at 18/s and searches end
after 8 s.

### 4.3 Every encounter guarantees

- a route that can be taken undetected, with cover or shadow the whole way;
- a route that can be fought through, with hard cover and at most 3 guards
  holding lines of fire at once (locked spec §6);
- patrol cycles ≥ 14 s, so timing windows are seconds wide, never
  frame-perfect;
- recoverable alert states — nothing latches permanently;
- no supernatural awareness: cones, line of sight and hearing are unchanged.

---

## 5. The three tactical encounters

### 5.1 Market Square

*Overlapping patrols, market cover, distraction, multiple approaches.*

| | |
| --- | --- |
| **Guards** | L1 at the south gate (14,52) facing south, 160° arc toward the alley mouth. L2 roaming: (14,50) → (36,50) → (36,36) → (14,36), ~1 100 px loop ≈ 30 s. L3 static-ish at the covered market (28,34), facing south, sweeping ±40° |
| **Cover** | Two stall rows (`barrierLow`) at y 42 and y 46; fountain (high cover, existing prop) at (24,44); hay cart (high) at (16,48); barrels (high) at (34,42); shadow zones under the covered market (x 26-32, y 35-37) and along the west arcade (x 9-12, y 38-48) |
| **Stealth** | Enter crouched along the west arcade shadow while L1 faces south; wait out L2's westward leg behind the hay cart; V1 is at the fountain, reachable from cover; V2's waybill sits inside the covered market shadow, and L3's sweep leaves a 6–8 s window. Exit north-west to the garden route behind L3's back |
| **Combat** | Two hard-cover lines (fountain, cart) break the square into thirds. L1 and L2 can be engaged separately; L3 only joins if it hears the shots. Pistol lanes are 180–220 px — inside the 220 px effective range, so cover matters |
| **Distraction** | The market radio (existing `interact_radio`, 128 px) sits on the east stalls. Switching it on pulls L2 and L3 east, opening the whole west arcade and the covered market |
| **Resources** | 1 medkit under the west arcade; 1 pistol ammo box behind the covered market (rewards the stealth line) |
| **Alert** | L1 shouts reach L2; L2's reach L3. A loud market means the route split is watched |
| **Exit** | V1 + V2 complete; leave north-west (garden) or north-east (main street) |
| **Decisions** | Which clue source to use; whether to spend the radio here or save it; which branch to commit to — the split is visible from inside the square so the choice is informed |

### 5.2 Depot Courtyard

*Stronger overlapping coverage, meaningful shooting lanes, alternative stealth access.*

| | |
| --- | --- |
| **Guards** | L5 static at the south gate (64,45) facing north into the courtyard — its cone covers the last 170 px of main street *and* the gate's inside. L6 long patrol: (56,42) → (80,42) → (80,26) → (58,26), ~1 500 px ≈ 40 s. L7 enters the courtyard's north edge on its own loop roughly every 35 s, giving a periodic **three-way overlap** near the garage door |
| **Cover** | Two crate clusters (high) at (62,38) and (74,32); a low stone trough row (`barrierLow`) at y 34, x 66-72; the office's outer wall as hard cover on the west; shadow along the north wall (x 58-66, y 21-23) and inside the loading dock |
| **Shooting lanes** | Three deliberate lanes: gate→office (west, 700 px, broken twice by crates), gate→garage door (north-east, 620 px, broken once), and office→garage (the Z's second leg, 620 px, crossing both other lanes). Every lane has at least one hard-cover break, so no lane is a pure gauntlet |
| **Stealth** | Two separate options. **(a)** Garden route arrives at the north-west (46-52, 15-24), *behind* L5 and L6's outbound leg; hug the north-wall shadow to the office, then the dock shadow to the garage. **(b)** From the south gate, the office's west wall shields a crouched approach while L6 is on its eastern leg — a 12–14 s window |
| **Combat** | Enter at the gate behind the crates; L5 must be dealt with first (it holds the only cone covering the entry). The trough row lets the player advance to mid-courtyard. At most 3 guards hold lines at once, and only while L7 is on its southern leg |
| **Resources** | 1 pistol ammo box behind the gate crates (reachable on the combat line); 1 medkit inside the office (reachable on either line); the office is a hard-cover retreat with one door |
| **Alert** | L5 and L6 are within shout range of each other; L7 is within shout of L6's northern leg only. So a quiet office entry keeps the garage calm even if the courtyard goes loud later |
| **Exit** | V5 + garage key; leave through the garage door (north-east) or the loading dock (east) |
| **Decisions** | Which of the two stealth lines; whether to take L5 down to secure the gate as a retreat; whether to cross to the office first or the dock first; whether to fight in the open or pull guards into the office doorway |

### 5.3 Garage / Exit

*A final security problem, then the evidence and the cult beat.*

| | |
| --- | --- |
| **Guards** | L7 only, patrolling garage interior → loading dock → courtyard north edge, ~700 px ≈ 20 s plus waypoint pauses. It is the **final security problem**: the garage has two entrances and L7's loop covers both in turn, never both at once |
| **Cover** | The van itself (high cover, 4×2 tiles); two crate stacks (high) at (62,14) and (78,16); the dock's pallet row (low); shadow in the garage's west bay (x 58-62, y 7-12) and along the dock |
| **Stealth** | L7's loop leaves each entrance clear for ~8 s. Enter by whichever is clear, move behind the van, and every remaining objective (V4, V6, V7) is reachable from behind it without re-crossing the floor |
| **Combat** | A single guard in a confined space with hard cover — a deliberately low-stakes finish, since the story beat follows |
| **Story beat** | V6: a wounded cultist slumped against the dock wall. Non-combatant, cannot be looted, triggers on approach within 40 px. Two or three lines, refuses aid, dies willingly, and the last line points at the wall behind the van. V7: examining the inscription yields **BELIAL**, now mandatory |
| **Resources** | 1 medkit on the dock; ammunition floor is restored at level start regardless (locked spec §6), so the exit cannot be softlocked |
| **Exit** | V8: the north road, 300 px past the garage, with no guard — the mission ends on the story beat, not on a fight |
| **Decisions** | Which entrance; whether to neutralise L7 before triggering the cult beat (the beat is interruptible and resumes, so neither order is punished) |

---

## 6. Pacing analysis

### 6.1 Budget

| Playthrough | Target | Composition |
| --- | --- | --- |
| **First time** | **8–12 min** | 30 s traversal + 3 encounters × 90–150 s (observing patrols, failed attempts, retreats) + 6 clue interactions with dialogue + optional exploration + 1–3 detections or deaths with checkpoint reloads |
| **Experienced stealth** | **4–6 min** | ~50 s traversal at a crouch/walk mix + 3 encounters × 40–60 s of known patrol windows + 6 interactions |
| **Optimised run** | **1.5–2.5 min** | 25.5 s pure sprint + 6 forced interactions + three chokepoints that cannot be sprinted blind |

### 6.2 Honest note on the speedrun target

The brief asks for roughly 2–3 minutes. The arithmetic says a 3 880 px critical
path is **25.5 s of pure sprinting**, so reaching 2–3 minutes requires 95–155 s
of non-traversal time from six interactions and three chokepoints.

A realistic optimised run lands at **90–150 s**, i.e. the lower half of the
target. Pushing reliably past 2 minutes would need either a longer path (more
map, or backtracking the brief forbids) or harder gating. **Recommendation:
accept 1.5–2.5 min** and treat the lower bound as the real guarantee. What
matters is the stated principle — *"a player who ignores enemies and sprints
directly at the final objective should face meaningful danger and should not
reliably complete the mission in seconds"* — and that is satisfied: the floor
rises from 7.7 s to 25.5 s of sprinting, through three guarded spaces with 45%+
exposure and cascading alerts, with a key gate that forces the courtyard Z.

### 6.3 What creates the time, and what does not

**Does:** a 3.3× longer critical path; six objectives across four areas; 45%+
guard coverage; a genuine route trade-off; detection that makes the *next*
encounter harder; three encounters that reward observation.

**Does not, and is deliberately absent:** slower movement, inflated enemy
health, artificial timers, forced waiting, respawning reinforcements, forced
stealth, mandatory kills, and any change to suspicion rates, weapon damage or
guard reaction times.

---

## 7. Constraints, risks and what C.1B must verify

### 7.1 No parameter changes proposed

The measured detection maths is sound: 0.83–3.57 s to combat by stance, 0.89 s
guard reaction, 8 s search, 18/s decay. The failure was 17% coverage, not the
rates. **This design changes no gameplay constant.**

One hypothesis worth *testing* in C.1B, not applying blind: if cascading alerts
prove too weak because suspicion decays before the player reaches the next
encounter, `VISION.decayPerSecond` 18 → 12 would lengthen the cascade. Do not
change it without measuring first.

### 7.2 Acceptance criteria for C.1B

Measurable with `tests/pacing.test.ts`:

1. Critical path (combat route) **3 600–4 200 px**; garden route **≥ 500 px
   longer** than the combat route.
2. Critical-path exposure from guard posts **≥ 45%**.
3. Shortest patrol loop **≥ 450 px** and **≥ 14 s**.
4. Critical path visits **≥ 25%** of walkable tiles (currently 6.2%).
5. Seven enemies, all `lookout`, each with **≥ 3 waypoints**.
6. Every mandatory objective reachable from spawn; every patrol waypoint
   walkable; the generator's existing reachability gate still passes.
7. No mandatory objective anchored on an enemy or requiring a kill.
8. V7 (BELIAL) is **not** `optional`.
9. At most 3 guards can hold a line of fire on any critical-path tile.
10. No change to `PLAYER`, `VISION`, `COMBAT`, weapon or enemy constants.

### 7.3 Compatibility with Phase B.1 art work

- Uses only existing tile roles, surfaces and the architecture band, so the
  Phase B.1A composition system reskins the new areas unchanged.
- Uses only existing Valcendre props as blockers and cover; everything in the
  art request is **differentiation and story dressing**, never a blocker.
- Tempest's directional sheets and the pose-atlas Lookout are untouched.
- New interior spaces (depot office, garage) will benefit from the already
  requested **ENV-002** facade/indoor tiles but do not depend on them.

### 7.4 Risks

| Risk | Mitigation |
| --- | --- |
| 104 × 72 is 2.6× the current map; build-map authoring effort grows | Author area by area; the generator's reachability gate catches mistakes, as it already caught a lamppost on a waypoint |
| A 35 × 23 market may feel empty with the current 28 distinct tiles | Per-area surfaces plus the requested market props; the covered market breaks the space |
| Seven guards on one map may exceed the 3-simultaneous-shooter rule | Encounter specs keep posts in separate acoustic pockets; criterion 9 measures it |
| Longer level makes checkpoint placement matter more | Checkpoints after V2, after V5 and before the garage; the existing snapshot system already restores enemy and objective state |

### 7.5 Not reproduced in a browser

The 10-second completion was reproduced **in route arithmetic only**. `npm
install` fails with the CodeArtifact `E401` in this environment, so the game has
never been launched and no timed playthrough was recorded. Every number here
comes from the engine's own `Grid`, `Vision` and constants run headless over the
shipped map. A browser playthrough should confirm the baseline before C.1B lands.
