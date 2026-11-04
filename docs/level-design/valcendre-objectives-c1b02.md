# Valcendre objective chain and narrative — Phase C.1B, Task 02

Implementation report for the eight-beat mission, the evidence interactables,
the story triggers, the garage key and the checkpoint persistence.

Geometry is unchanged from
[`valcendre-geometry-c1b01.md`](valcendre-geometry-c1b01.md) except for the two
garage doors described in §4, which are carved openings in an existing wall.
No patrol route, detection rate, weapon value, enemy stat or movement speed was
touched. No production artwork was generated.

---

## 1. The chain

Eight beats, in **narrative** order. Array order in `src/data/objectives.ts`
drives the HUD pointer, and it is deliberately not ID order: V5 precedes V4
because the ledger carries the key to the garage the van is in.

| # | ID | Beat | Source(s) | Requires |
| --- | --- | --- | --- | --- |
| 1 | `V1` | The convoy's last stop | `interact_tracks` **or** `interact_stall` | — |
| 2 | `V2` | Where Suzanne was taken | `interact_waybill` **or** `trigger_overheard` | `V1` |
| 3 | `V3` | Reach the transport depot | `trigger_depot_street` **or** `trigger_depot_garden` | `V2` |
| 4 | `V5` | Search the depot office | `interact_ledger` → **grants the garage key** | `V3` |
| 5 | `V4` | Locate Suzanne's transport | `interact_van` | `V5` |
| 6 | `V6` | The wounded man by the dock | `actor_cultist` (scripted scene) | `V4` |
| 7 | `V7` | Look behind the transport | `interact_inscription` → **BELIAL** | `V6` |
| 8 | `V8` | Leave by the north road | `exit_north` | `V7` |

### ID reuse

In the Phase B prototype `V3` was an *optional* BELIAL mark and `VX` was the
exit. Both meanings are gone. A version-1 save therefore describes progress
that cannot be translated, so `SAVE_VERSION` is **2** and `readSave` rejects
anything older outright rather than mis-reading it as progress
(`src/core/constants.ts`, `src/systems/Save.ts`).

### Why V1, V2 and V3 have two sources each

The three beats a player can plausibly walk past have an alternate. The three
that sit at the end of a deliberate approach do not:

- **V1** — the market is the first space and the player does not yet know what
  they are looking for, so either the tyre tracks or the ransacked stall will do.
- **V2** — the waybill is a thing to find; the overheard conversation is a thing
  to be *near*. The conversation additionally needs a living guard within 220 px,
  which is a spatial condition, **not** a progression one: if the player has
  killed everyone, the waybill still completes V2. There is no state in
  `Mission` that a dead guard can change.
- **V3** — the depot has two approaches (main street and the garden branch), so
  it has a trigger on each.

A second source grants nothing: `Mission.complete` reports `granted` only on the
incomplete→complete transition, so the clue, the dialogue and the checkpoint all
fire exactly once. Each V1 source has its own dialogue line so the repeat is not
noticeable if the player finds both.

---

## 2. `Mission` — one owner for the rules

`src/systems/Mission.ts` is **Phaser-free on purpose**. It owns the objective
chain, the garage key, the door state, one-shot story events and fired triggers;
the scene owns sprites, dialogue, audio and physics.

That split is what makes the whole progression contract testable headlessly
rather than inferrable from a playthrough — see §6.

```
complete(id) -> { granted, blockedBy?, def? }
```

An out-of-order attempt returns the **specific** missing prerequisite, which is
what lets the scene say something useful instead of ignoring the input.

---

## 3. Triggers that cannot strand the player

`checkTriggers` only calls `fireTrigger` once the beat has actually been
granted. A player who crosses the depot gate before finishing V2 does not
consume the trigger: the moment V2 lands while they are still standing in the
yard, V3 completes. There is no walking back to a trigger already crossed.

The cultist scene is deferred, never skipped: if the player is in a firefight or
mid-dialogue when they come into range, `pendingScene` holds the actor and the
scene plays as soon as combat ends. It is one-shot through
`Mission.markEvent('scene_actor_cultist')`, so interrupting it cannot lose it
and a checkpoint reload cannot replay it.

---

## 4. The garage key is geometry, not a flag

The depot garage previously had no door. It now has two, both locked by the one
key the ledger supplies:

| Door | Tiles | What it is |
| --- | --- | --- |
| `door_garage_courtyard` | (81,19) 3×1 | the main door off the courtyard |
| `door_garage_dock` | (84,13) 1×3 | the loading-dock shutter |

The implementation has three layers that cannot disagree, because they are
driven from one place:

1. **`Grid.at()` is door-aware.** A closed door tile reports `collides` and
   `blocksSight`. Every consumer reads the same answer without knowing doors
   exist — line of sight, hitscan, enemy vision and A* alike. A closed door
   cannot be seen through, shot through or pathed through.
2. **One static image per door tile** is both the picture and the Arcade
   collider. The door tiles are carved *out* of the map's collision layer so
   pathing works once they open, which means without this body a closed door
   would stop bullets and sight but not feet.
3. **`Mission` holds the lock**, and `restore()` repairs the invariant: if V5 is
   complete the key is granted and both doors open, so no save — including a
   hand-edited one — can produce a read ledger and a sealed garage.

The map generator asserts the seal at build time rather than trusting it:

```
locked-door check: garage and exit sealed behind 2 doors (6 door tiles);
dock reachable as the second approach
```

`tests/geometry.test.ts` then re-proves it against the shipped map by closing
the door tiles in the engine's own `Grid` and confirming the van, the
inscription, the cultist and the garage interior are all unreachable — and that
**either** door opened alone admits the player. Neither entrance is the one that
quietly bypasses the lock.

---

## 5. Checkpoints restore the level, not the HUD line

`Checkpoint.objectives` is replaced by `mission: MissionSnapshot`, carrying the
objective set, the key, the open doors, the one-shot events and the fired
triggers. `applyCheckpoint` then re-applies the *physical* state: `refreshDoors`
re-locks or re-opens the doors in the grid, in physics and in the sprite frame,
and a cultist whose scene already played stays still and untinted-to-dead rather
than standing back up to be talked to again.

Checkpoints: `cp_entry` (arrival), `cp_market` (V2), `cp_office` (V5, with the
key) and `cp_belial` (V7).

---

## 6. What was tested, and how

`tests/mission.test.ts` — 36 assertions, all passing — covers the brief's
required cases:

| Required | Covered by |
| --- | --- |
| Both V1 sources complete the beat | *the convoy stop has two sources* |
| Using both grants nothing twice | *grants nothing the second time* |
| Both V2 sources complete the beat | *the destination has two sources* |
| Guard death does not block V2 | *still completes V2 … when every guard is dead* |
| Both V3 routes work; office reachable | *both routes reach the depot and the office* |
| V5 grants the key | *grants the key exactly when V5 completes* |
| Neither entrance bypasses the key | *leaves neither garage entrance passable* |
| Both entrances open after unlocking | *opens BOTH entrances with the one key* |
| V4 requires V5 | *the transport is behind the key* |
| V6 plays once and is never missable | *the cultist and BELIAL are mandatory and one-shot* |
| V7 requires V6 and is mandatory | same |
| V8 follows V7 | *departure* |
| No kill is required | *the mission never requires a kill* |
| An aggressive playthrough still finishes | same |
| Checkpoints restore key / doors / evidence / cultist | *checkpoints restore the physical level* |
| Old saves are handled | *refuses a pre-rework save outright* |
| Finishable after a reload | *finishable after a reload taken at every checkpoint beat* |

Plus a door-geometry test that proves movement, sight, hitscan and pathing all
agree with the door's visible state, in both states.

`tests/geometry.test.ts` (27) and `tests/map.test.ts` (27) were updated for the
renamed objects and now assert the chain is wired into the shipped map, that
V1/V2/V3 have exactly two sources each and V4–V7 exactly one, that the
`reserved` placeholders are retired, and that the lock holds spatially.

Totals across the ten suites: **215 assertions, 0 failures.**

### What was NOT done — read this before trusting the above

- **`npm test` has never run in this environment.** `npm install` fails with
  `E401 Unable to authenticate` against the CodeArtifact registry, and using the
  public registry is not permitted here. The numbers above come from executing
  the same test files under `node --experimental-strip-types` with a minimal
  `describe`/`it`/`expect` shim. The assertions are real and really ran; the
  runner is not vitest, so vitest-specific behaviour is unverified. CI remains
  the authority.
- **There was no browser playthrough.** `npm run dev` and `npm run build` are
  unavailable for the same reason. Nothing in this report is a claim about
  rendering, input feel, pacing-in-practice or the eight-to-twelve-minute
  target. §15 of the brief (runtime validation) is **not satisfied**.
- **No type check ran.** `tsc` is not installed and cannot be installed here.
  Village.ts was verified to *parse*, and every import, private field and
  `override` was audited by hand against the patterns that have previously
  failed CI — but a type-only error would still reach CI rather than being
  caught here.

---

## 7. Art still missing

No artwork was generated for this task. Five of the seven mandatory evidence
sites have **no approved sprite** and currently show only the interaction
glint. The paper evidence reuses the existing document sprite; the transport is
drawn by its own `decor_van` object; the cultist reuses the approved
`prop.shared.body_cultist` with a 1 px breathing bob while alive.

Outstanding, already filed in
[`../art-requests/valcendre-pacing.md`](../art-requests/valcendre-pacing.md) and
now blocking how the chain *reads* rather than whether it works:

| Request | Site it leaves empty |
| --- | --- |
| **VP-001** BELIAL inscription | `interact_inscription` — V7, the campaign's central hook |
| **VP-002** wounded cultist | `actor_cultist` — V6 currently uses a corpse sprite |
| **VP-003** convoy-stop decals | `interact_tracks`, `interact_stall` — both V1 sources |
| **VP-004** depot and dispatch props | `interact_ledger` — the office is bare floor |

The chain is complete and testable without any of them.
