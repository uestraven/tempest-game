# Market stall occlusion — Phase B.2-05C-1

**Baseline:** `61b35fb` (B.2-04 integration)
**Date:** 2026-11-05
**Change type:** rendering only. No artwork, geometry, collision, mission or gameplay constant was touched.

---

## 1. Required references

The implementation was built first against §5 and §6 of the brief, which restate
the contract. The three B.2-05B handoff documents were supplied afterwards and
the implementation was then re-checked against them, line by line — see §1b.
They are archived in-repo at
`art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/07_occlusion_b205b/`:

| file | SHA-256 |
| --- | --- |
| `valcendre_stall_occlusion_render_contract.json` | `70bfce78…c30c08` |
| `valcendre_stall_occlusion_validation.md` | `ec2ac001…8770ac` |
| `CODING_AGENT_HANDOFF.md` | `daeafacb…67c961` |

Also used:
`art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/03_props/market_stall/valcendre_market_stall_manifest.json`
(B.2-03B-2), for the shared envelope and the three layer orderings.

Two stall PNGs were also dropped at `public/assets/tmp/`. Both are
**byte-identical** to the already-imported approved files, so no revised art was
present and none was imported. They are left untracked — see §11.

---

## 1b. Conformance to the B.2-05B contract

Every structural clause is satisfied. The source rectangles, destination offsets
and geometry lock are now **read out of the contract JSON by the test suite**
rather than transcribed, so the two cannot drift apart.

| contract clause | implementation |
| --- | --- |
| `decision: NO_REPAINT`, preserve both PNGs byte-for-byte | ✅ both checksums match the contract's own `source_sha256` |
| `back_roof` src (0,0,80,17), dest offset (0,0), `behind_approaching_actors` | ✅ world y 752, depth 10.07525 |
| `front_valance` src (0,17,80,31), dest offset (0,**+17**), `in_front_of_actors_in_approach_band` | ✅ world y **769**, depth 10.0792 |
| handoff §2: "ensure the second source rectangle starts at world/local y+17, rather than y0" | ✅ 752 + 17 = 769 |
| counter read src (0,26,80,22), dest offset (0,+26) | ✅ world y **778**, depth 10.0799 |
| `source_rectangles_nonoverlapping` | ✅ 0–16 and 17–47, disjoint, contiguous |
| union is RGBA-identical to the original canopy | ✅ 796 + 593 = 1389 opaque, pixel-for-pixel |
| "draw the ORIGINAL full base first, before the canopy … preserves support/valance overlap" | ✅ `base_full` is drawn first and sorts below `canopy_rear` |
| "the posts remain UNDER the front beam" | ✅ base below the valance at every row |
| unoccupied composition pixel-identical to the approved assembly | ✅ **0 differing pixels** in a real 480×270 engine frame |
| `geometry_lock`: origin (464,752), cover x29–33 y49, clue (30,47) | ✅ all three verified in the engine |
| "confirm the actual integrated canopy's world top-left; the manifest *suggests* (464,752) only" | ✅ **confirmed (464,752)** from the live display list |
| "apply the same spatial rule to all actors; never key art treatment to Tempest identity" | ✅ nothing reads an actor; two-actor frame proves it |
| no change to collision, `shadowZones`, detection, range, mission, clue | ✅ tested |
| glint and HUD prompt stay above the awning | ✅ 19 and 100+ vs a 10.0799 maximum |
| `nearest-neighbor` native sampling | ✅ no scaling, filtering, tint or alpha on any piece |

### The one deliberate divergence

The contract's `draw_role` for the counter read is explicit:

> `"front-of-actor ONLY when behind cover; base already drew once below canopy"`

Its own `front` studio scenario nevertheless measures **170/288 (59%)** of the
character occluded by `base_foreground` at feet (488,808) — which would put the
counter over the legs of an actor standing *south* of the stall. That
contradicts the qualifier above and §6.B of this brief ("Do not incorrectly
place the counter over the player's legs").

Depth bands satisfy the qualifier without needing a condition: the counter sits
at 10.0799 and any actor south of the cover is at 10.081 or lower depth order,
so **the real engine measures 0/289 there**. A test pins it. This is the only
point where the implementation departs from the art side's measured scenario,
and it departs toward the contract's own stated intent.

### Convention note, no change needed

The contract gives `actor_anchor_local_px: [12, 30]`; the engine anchors at
`(12, 31)` (`CHAR_FEET_INSET = 1`, origin 31/32), measured as feet y 773.73 with
sprite top 742.73. These describe the same ground-contact row under different
conventions — row index 30 versus the boundary below it. Nothing was changed;
recorded so the art side can align its model.

### The contract's unresolved items, answered

1. **Real 480×270 frame, feet coords, origin, depths** — §2 and §5 of this
   document; captures in `screenshots/b205c1/`.
2. **Does (464,752) match the integrated stall?** Yes, confirmed from the live
   display list before any change.
3. **Do actors pop between depth states?** No: 0 ordering changes across a
   real-input walk and a driven Lookout walk; the one visible transition is
   unreachable inside the art's x-span.
4. **Do the glint and prompt stay distinguishable?** Yes; both draw above every
   stall layer and V1 was taken by a real `E` press.
5. **Same SHA-256 before and after?** Yes, both files.

The validation doc's open question — *"the reported severe runtime occlusion
depends on the player's actual position … it cannot be fully localized without
the real B.2-04 screenshot"* — is resolved in §5b: the real interaction position
is **(492.73, 773.73)**, between the art side's `south_approach` and `near_cover`
cases, where the pre-fix occlusion measured **66.4%**.

---

## 2. Gate 1 — the defect, reproduced and measured

Captured from the real build before any code changed, at native 480×270 with
debug overlays off (`debugHitboxes: false` recorded in the telemetry).

### Verified runtime geometry — the manifest's proposal was *not* assumed

Discovered by scanning the live Phaser display list for the approved texture
keys, not by reading the manifest:

| | base | canopy |
| --- | --- | --- |
| frame | `__BASE` | `__BASE` |
| source rect | (0, 0, 80, 48) | (0, 0, 80, 48) |
| world origin | **(464, 752)** | **(464, 752)** |
| Phaser origin | (0, 0) | (0, 0) |
| depth | 10.08 | 10.08005 |
| alpha / tint / blend | 1 / none / normal | 1 / none / normal |

So the manifest's proposed `(464,752)` **is** the actual runtime origin —
confirmed rather than taken on trust. Its own note asked for exactly this check.

### The real-input interaction position

Driven by keyboard events only, no placement:

| | value |
| --- | --- |
| player feet | **(492.73, 773.73)** |
| tile | **(30, 48)** |
| sprite top (world y) | 742.73 |
| animation | `anim.tempest.idle.up` |
| drawn torso | x 486.73, y 749.73, 12 × 18 |
| aim origin | (492.73, 758.73) |
| player depth | 10.077373 |
| camera scroll | (264, 657) |
| prompt | `E - INVESTIGATE STALL` |
| V1 by real `E` | **granted** |

### What that produced

The canopy's art occupies local y5–25 → **world y 757–777**, and the base's
occupies local y19–46 → world y 771–798. Both drew at depth ≈10.08, above the
player's 10.0774. Of the player's 32 sprite rows, **14 were visible** — the top
of the helmet and nothing else.

`03-before-staged-south-approach.png` shows it: Tempest is a grey sliver above
the awning ridge. The brief's "substantially obscured" is generous; at the tile
the mission requires, he was effectively **invisible**.

Walkability was asserted before staging anything. One listed position had to
move: **(31,45) is not standable** — it is inside the east market hall footprint
(x27–31, y44–46). The north relationship is shot from **(32,46)** instead, the
nearest walkable tile inside the stall's x-span. Row 49 is likewise not
standable, being the cover run itself.

---

## 3. The fix

### Source regions — the §5 contract, validated

The brief's split was checked against the pixels before being implemented:

| region | source rect | destination world y | opaque px |
| --- | --- | --- | --- |
| canopy rear roof | (0, 0, 80, 17) | 752 | 796 |
| canopy front valance | (0, 17, 80, 31) | **769** | 593 |
| base counter foreground | (0, 26, 80, 22) | **778** | 1329 |
| base, whole (unchanged) | (0, 0, 80, 48) | 752 | 1396 |

796 + 593 = **1389**, exactly the canopy's total opaque pixel count. The two
windows tile the file with no gap, no overlap and nothing lost. Both files have
**zero partial-alpha pixels**, which is what makes drawing the counter band a
second time idempotent.

Frames are added in memory with `Texture.add` at scene build; no file is read,
written or altered.

### Depth order

Four layers, each at a **constant** depth, with actors sorting between them on
their existing `10 + y/10000` rule:

| layer | sort row | depth | relative to an actor beneath the stall |
| --- | --- | --- | --- |
| base, whole | 752 | 10.0752 | behind |
| canopy rear roof | 752 (+ε) | 10.07525 | behind |
| *actors* | own feet y | 10.075–10.084 | — |
| canopy front valance | 792 | 10.0792 | in front |
| base counter foreground | 799 | 10.0799 | in front |

**Why 792 and 799.** The player's feet box is 10 px tall with its bottom edge
exactly on `sprite.y`, so against the solid counter row (world y 784–799):

- an actor **north** of the counter can reach at most feet y **784**
- an actor **south** of it can reach at best feet y **810**

Both front thresholds sit inside 784–799, where **no actor can ever stand**. An
actor therefore cannot straddle either one, so the ordering cannot flip beneath
a moving character. Both limits were confirmed by the engine independently:
Tempest walking south stopped at feet y **784.00**, and so did the Lookout.

The behind-band threshold at 752 *is* crossed, at feet y 752/753 — but the
stall's topmost art row is 757, and an actor standing there has their sprite
bottom at 753, so there is no art to reorder. A test pins that, and will fail if
art is ever added above world y 757.

### Why it is not an actor-specific exception

Nothing in `buildStall` reads the player, an enemy, or any position: a test
greps for it. There is no per-frame hook, no `setVisible`, `setAlpha`,
`setTint` or `setBlendMode`, and no scene-wide mode. The stall is four static
images and the actors move through them, which is why the decisive case works —
see `04-after-staged-tempest-and-lookout.png`: **Tempest beneath the canopy and
a Lookout south of the counter, correctly ordered in the same frame.** A
player-position toggle cannot produce that frame.

The same holds across animations: actor depth is assigned in exactly one place,
`Village.sortDepths`, from `y` alone. Walk, idle, aim and fire are all sorted
identically because none of them is an input to it.

---

## 4. A bug the audit caught

The first corrected build was wrong, and the frame audit in the capture harness
found it before any screenshot was examined:

```
FAIL __BASE @ worldY=752
FAIL valcendre_stall_base_counter @ worldY=778
   actual: frame=valcendre_stall_base_counter worldY=752 displayH=22 depth=10.0752
```

**Phaser promotes the first frame added to a single-image texture to be that
texture's default frame.** Registering the counter crop therefore changed what
an unqualified `add.image(stallBase)` resolves to: the "whole base" layer
silently became the 80×22 counter band, drawn 26 px too high, with the rest of
the structure missing.

Fixed by naming the frame explicitly on every piece, including the whole-image
`__BASE`. `tests/stall-occlusion.test.ts` now asserts `buildStall` has exactly
one `add.image` call site and that it passes four arguments, so an unqualified
call cannot come back.

---

## 5. Results — the four relationships

Measured from the live display list; "in front" means the layer's depth exceeds
the actor's.

| staged position | feet y | depth | layers in front | contract |
| --- | --- | --- | --- | --- |
| evidence tile (30,47) | 760 | 10.0760 | valance, counter | **A** ✅ |
| south approach (30,48) | 776 | 10.0776 | valance, counter | **A** ✅ |
| under canopy east (33,48) | 776 | 10.0776 | valance, counter | **A** ✅ |
| in front (31,51) | 824 | 10.0824 | *none* | **B** ✅ |
| beside (35,49) | 792 | 10.0792 | counter (no x overlap) | **C** ✅ |
| north (32,46) | 744 | 10.0744 | all four | **D** ✅ |

Case **C** needs no special handling and got none: the actor is outside the
80 px span, so the nominal ordering is invisible and no effect is applied.

### Readability

At the real-input interaction position, unoccluded sprite rows went from
**14 / 32 to 26 / 32**. At the staged south approach, **12 → 24**. Head,
shoulders, torso and thighs now read; the shins and feet sit behind the valance
and counter, which is the intended "standing under an awning" overlap.

## 5b. Measured occlusion, real engine vs the art side's model

The art review quantified occlusion as "how many of Tempest's 288 opaque sprite
pixels fall beneath a later-drawn opaque production pixel". The same quantity
was measured **in the running game**, at the art side's own feet coordinates, by
`tools/b205c-occlusion-measure.mjs`.

Method: four real frames per position — actor present/absent × stall
visible/hidden — restricted to the sprite's own 24×32 screen rect read from the
engine. The actor's pixels are those that change when only the actor moves; an
occluded pixel is one where the stall-visible frame is indistinguishable from
the no-actor frame. No compositing, no inference from the PNGs.

| art test case | feet (world) | **before** | **after** | art model: whole canopy | art model: split |
| --- | --- | --- | --- | --- | --- |
| `evidence_center` | (488, 760) | 28/289 (9.7%) | **0/289 (0%)** | 36 | 0 |
| `south_approach` | (488, 776) | 231/299 (77.3%) | **67/299 (22.4%)** | 234 | 76 |
| `near_cover` | (488, 780) | 252/289 (87.2%) | **112/289 (38.8%)** | 235 | 127 |
| `front` | (488, 808) | 0/289 | **0/289** | 0 | **170** |
| `beside` | (450, 776) | 0/286 | **0/286** | 0 | 0 |
| **real interaction position** | **(492.73, 773.73)** | **202/304 (66.4%)** | **36/304 (11.8%)** | — | — |

The art side's pixel model was accurate: it predicted 234 and the engine
measured 231 for the whole canopy at `south_approach`, and predicted 76 against
a measured 67 for the split. `near_cover` lands within 17 pixels on both. The
model is vindicated as a planning tool — and the one case where it disagrees is
`front`, where it predicted 170 occluded and the engine measures **0**, for the
reason given in §1b.

Isolating the behind layers — hiding only the valance and counter — gives
**0/299** and **0/304** occluded. The whole base and the rear roof never cover
the actor at the approach positions, which is exactly the
`behind_approaching_actors` role the contract assigns them.

Raw data: `occlusion-measurements-before.json`, `occlusion-measurements.json`.

### No popping

| check | result |
| --- | --- |
| Tempest, real-input walk south (40 samples, feet y 762.4 → 784.0) | **0 ordering changes**, display height constant 32 |
| Lookout, physics-driven walk east under the canopy (30 steady samples) | **0 ordering changes**, display height constant 32, valance + counter in front throughout |
| Ordered crossing frames, column 32, rows 44→51 | 4 layers in front at rows 44–46, 2 at rows 47–48, 0 at rows 50–51 |

The 2 → 0 transition cannot be seen at all: the stall's art spans tiles x29–33,
which is exactly the solid cover run, so an actor moving from row ≤48 to row ≥50
**must** detour to x28 or x34 — columns that abut the envelope and carry no
stall pixel. A test asserts that correspondence rather than describing it.

---

## 6. Pixel preservation

| check | result |
| --- | --- |
| base PNG SHA-256 | `40299ffc…c8346` — **matches approved** |
| canopy PNG SHA-256 | `3f878cd5…76493` — **matches approved** |
| partial-alpha pixels, either file | 0 |
| rear + valance opaque pixels vs whole canopy | 796 + 593 = 1389 = 1389 |
| region tiling | rear 0–16, valance 17–47, contiguous, no overlap |
| valance pixels re-landed on their authored rows | every one, rgb and alpha |
| empty-stall composite vs single-image composite | **0 differing pixels** |
| counter band drawn twice | **0 differing pixels** |
| **engine capture, whole frame, unoccupied stall, before vs after** | **0 differing pixels of 129,600** |

That last row is the strongest form of the §7 requirement: not a Python
compositor agreeing with itself, but two real 480×270 Phaser frames from two
builds, pinned to the same camera, identical everywhere.

The engine's own frame coordinates are additionally audited at runtime:

```
OK  __BASE                         src=(0,0,80,48)  world=(464,752) depth=10.0752
OK  valcendre_stall_canopy_rear    src=(0,0,80,17)  world=(464,752) depth=10.07525
OK  valcendre_stall_canopy_valance src=(0,17,80,31) world=(464,769) depth=10.0792
OK  valcendre_stall_base_counter   src=(0,26,80,22) world=(464,778) depth=10.0799
```

all with alpha 1, no tint, normal blend. The harness fails the run on any
mismatch; the before pass correctly reported the three new frames as absent.

---

## 7. Gameplay regression results

Automated (`tests/stall-occlusion.test.ts`, 34 assertions):

- every tile under the 80×48 art is exactly as solid as it was — only the
  pre-existing cover run at x29–33 y49 is solid, nothing else;
- the cover run is unmoved, and no shadow zone was added;
- the clue object `interact_stall` is still at tile **(30,47)**, with (30,47)
  and (30,48) both walkable;
- all four stall layers remain below the glint (19) and the HUD (100+);
- `speedWalk 108`, `speedCrouch 66`, `speedSprint 152`, `bodyWidth 12`,
  `bodyHeight 10` unchanged;
- the presentation imports no mission, save, patrol, hearing or vision module,
  and its only tilemap write is still the paving layer's `putTileAt`;
- actor depth is assigned from `y` alone, in one place.

Driven by real keyboard input, in both passes:

| | before | after |
| --- | --- | --- |
| reached the clue under real input | ✅ | ✅ |
| prompt | `E - INVESTIGATE STALL` | `E - INVESTIGATE STALL` |
| V1 granted by a real `E` press | ✅ | ✅ |
| objectives after | `V1` | `V1` |

Full suite: **371 tests passing** across 15 files (337 before, 34 added, 0
changed). `npx tsc --noEmit` clean. `npm run build` succeeds.

Interaction range, cover, collision, the clue position and the objective chain
are all untouched; the fix is entirely in what gets drawn and in what order.

---

## 8. Remaining limitations

1. **Case D is geometrically vacuous.** No reachable tile puts an actor north of
   the stall *and* overlapping its art. The east market hall occupies x28–31 at
   y44–46, and from (32,46) — the nearest walkable tile in the span — the
   sprite's bottom is world y 746, eleven pixels above the stall's first art row
   at 757, so nothing overlaps (`03-after-staged-behind.png` shows the actor
   clear of the stall entirely). Rows 47–48 serve as both "beneath" and
   "behind": the actor there is still overlapped by the valance and the counter,
   so they never "appear magically in front of the stall", but the brief's
   separate D case has no distinct position to occupy.

2. **The rear-roof reveal is a deliberate cheat.** Under a strict projection an
   actor standing beneath the awning's far slope would be hidden by it. Drawing
   them over it is what makes them readable, and it is the art side's own
   proposal; it does mean the head and torso overlap fabric that is nominally
   above them. It reads as standing behind the stall rather than on the canopy
   (`03-after-staged-south-approach.png`), but it is a convention, not physics.

3. **The behind-band threshold at world y 752 is crossed by actors**, at feet y
   752/753. It is unobservable only because no stall art reaches above 757. Any
   future art in rows 752–756 would need the threshold moved; the test fails if
   that art appears.

4. **67 base pixels above local y26** — the upper post stubs at world y 771–777
   — exist only in the behind copy, so the valance draws over them for an actor
   underneath. Identical to B.2-04 behaviour and invisible, since the valance
   spans the full width at those rows.

5. **The staged row-50 frame is 2 px inside the cover tile** (feet y 808 vs the
   810 an actor can actually reach there), because staging teleports. The
   ordering it shows is still correct, and the naturally reachable southern
   positions are covered by the row-51 and in-front frames.

6. **Scope is the stall only.** The two market halls still use B.2-04's
   one-depth-per-module rule. They do not have this problem because their
   footprints are solid and no actor can stand under them, but they have not
   been re-examined under this contract.

7. **A single console 404 appears in both passes.** A clean load with response
   logging showed no 404 for any asset; it is the favicon. Every registered
   texture was confirmed present in-engine.

---

## 9. Files modified

| file | change |
| --- | --- |
| `src/art/ValcendreV2.ts` | added `V2_STALL_REGIONS`, `V2_STALL_SORT`, `V2_STALL_ACTOR_LIMITS`. Data only. |
| `src/art/ValcendreV2Scene.ts` | `buildStall` now draws four layers; added `registerStallRegions`, `WHOLE_IMAGE_FRAME`, and `stallPieces` on the report. |

Added:

| file | purpose |
| --- | --- |
| `tests/stall-occlusion.test.ts` | the 34 assertions above |
| `tests/support/png.ts` | dependency-free PNG decode / crop / composite for pixel assertions |
| `tools/b205c-stall-capture.mjs` | before/after captures, telemetry, live frame audit |
| `tools/pngkit.py` | stdlib-only crop / zoom / diff / side-by-side for inspecting captures |
| `tools/b205c-occlusion-measure.mjs` | four-frame real-engine occlusion measurement (§5b) |
| `art-source/.../07_occlusion_b205b/` | the three B.2-05B handoff documents, archived |
| `docs/art-integration/screenshots/b205c1/` | 19 captures per pass + `telemetry-{before,after}.json` |

**No art file, map file, collision layer, mission file, save module, enemy,
patrol route or gameplay constant was modified.**

---

## 10. Captures

`docs/art-integration/screenshots/b205c1/`, 480×270, overlays off, camera pinned
to (504,792) in every staged frame so before/after pairs are directly
comparable. `PLAYED` frames are real keyboard input; `STAGED` frames place
actors through a debug handle and are labelled as such in
`capture-manifest`-equivalent fields inside each telemetry file.

| file | kind | what it shows |
| --- | --- | --- |
| `01-{before,after}-played-v1-interaction-position.png` | PLAYED | real-input stop at the clue |
| `02-{before,after}-played-v1-granted.png` | PLAYED | V1 taken by a real `E` press |
| `03-{before,after}-staged-evidence-tile.png` | STAGED | on the clue tile |
| `03-{before,after}-staged-south-approach.png` | STAGED | the (30,48) approach |
| `03-{before,after}-staged-under-canopy-east.png` | STAGED | (33,48) |
| `03-{before,after}-staged-in-front.png` | STAGED | case B |
| `03-{before,after}-staged-beside.png` | STAGED | case C |
| `03-{before,after}-staged-behind.png` | STAGED | case D, from (32,46) |
| `04-{before,after}-staged-tempest-and-lookout.png` | STAGED | **two actors, opposite sides, one frame** |
| `05-{before,after}-staged-empty-stall.png` | STAGED | the pixel-identity pair |
| `06-{before,after}-crossing-row{44..51}.png` | STAGED | ordered boundary crossing |
| `07-{before,after}-played-after-boundary-walk.png` | PLAYED | after the real-input walk south |
| `09-after-staged-lookout-walking-under-canopy.png` | STAGED | a Lookout mid-walk (after pass only — the harness gained this block after the baseline run; the baseline Lookout behaviour is in `04-before-staged-tempest-and-lookout.png`) |
| `10-measure-*-as-seen.png` / `-stall-hidden.png` | STAGED | the frame pair behind the §5b measurement |
| `08-compare-*-before-after.png` | — | side-by-side pairs, 3× |

---

## 11. One thing left alone

`public/assets/tmp/` holds two stall PNGs, byte-identical to the approved files
already imported. Anything under `public/` is copied into `dist/` and served, so
these would ship as duplicates — but they were dropped there rather than created
by this phase, so they have been left in place and **not committed**. Removing
them is a one-line `rm`; say the word and I will.

## 12. Completion gate

| requirement | status |
| --- | --- |
| Defect reproduced and measured before changing code | ✅ §2 |
| Runtime origin verified, not assumed | ✅ (464,752) confirmed |
| Approved PNGs byte-identical | ✅ both checksums |
| Source regions reconstruct the canopy | ✅ 796+593=1389 |
| Unoccupied stall unchanged | ✅ 0/129,600 pixels differ in-engine |
| Four relationships ordered correctly | ✅ A, B, C ✓; D vacuous, documented |
| No actor-specific hardcoding | ✅ grep-asserted; two-actor frame proves it |
| No popping during movement | ✅ 0 ordering changes, Tempest and Lookout |
| V1 still reachable and interactable | ✅ real `E` press, both passes |
| Collision / cover / mission / constants unchanged | ✅ |
| tsc, vitest, build | ✅ 371 tests |
| Real browser captures | ✅ 19 per pass + 4 measurement frames |
| Conformance to the B.2-05B contract | ✅ §1b, asserted against the contract JSON |
| Occlusion quantified in the art side's own units | ✅ §5b, 66.4% → 11.8% at the real interaction position |
