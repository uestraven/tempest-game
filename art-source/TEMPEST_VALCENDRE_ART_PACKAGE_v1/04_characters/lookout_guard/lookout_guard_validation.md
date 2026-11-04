# TEMPEST — B.2-03C-2R Validation (Lookout Combat Correction)

**Status:** Production secondary sheet revised; all requested machine tests passed. Character targeting assessed visually at native 1x and 7x. **All previews are ART-REVIEW RENDERS, not engine captures.**

## Visual correction

- **aim_side:** handgun slide changed from mostly upright mass to 4-pixel horizontal +X slide; hand/sleeve adjust locally. The feet, legs, belt, torso, face and cap preserve their C-2 pixels.
- **fire_side:** ready is pixel-identical to revised aim_side; recoil retracts the gun 2 pixels on the horizontal firing axis; recovery moves it one pixel forward and one pixel down before returning to the held ready frame. Firing pose slots are `0=ready, 1=recoil, 2=recovery, 3/4/5=ready`.
- **aim_down / aim_up:** visually rechecked at 1x; front pistol points forward/down with foreshortened muzzle at (12,24), rear pistol points upward with dark receiver at (19,10). No corrections needed; rows 2–3 are **exact RGBA copies** of original C-2.
- Pixel changes are confined to **side rows 1 and 4** at local coordinates x=16..23, y=15..22. Nothing below y22 was edited in those rows. All original sources remain on disk untouched.

## Automated checks

| Check | Result |
|---|---|
| PNG dimensions | **PASS** — secondary 144x160 RGBA, exact 6x5 grid of 24x32 frames |
| All animation cells | **PASS** — 30/30 nonempty |
| Approved primary sheet | **PASS** — source file hash unchanged |
| Approved side-walking strip | **PASS** — secondary row 0 exact 144x32 RGBA byte equality to C-1 |
| Secondary noncombat rows | **PASS** — row 0 and rows 2–3 unchanged from C-2 source |
| Side directions | **PASS (visual)** — aiming/firing horizontal +X; up/down face correctly |
| Binary alpha | **PASS** — alpha {0,255} only |
| Enclosed transparency | **PASS** — 0 holes in 30 cells (4-connected boundary flood fill) |
| Baked backgrounds / ground shadow | **PASS** — none introduced; clear RGB on alpha=0 pixels |
| Palette | **PASS** — 16 combined primary+secondary opaque colors (primary 16, secondary 15), all in approved Valcendre palette, maximum 24 |
| Feet anchor | **PASS** — all frames hit local y30, local y31 is fully transparent; pivot (12,30) |
| Bounds and row stability | **PASS** — all frame silhouettes in cell; heights vary <=1px and widths <=3px in each row |
| Weapon containment | **PASS** — latest opaque barrel pixel x=23, within [0,23] |
| Fire recoil | **PASS** — three distinct upper-body poses, lower body y23..31 unchanged |
| Side muzzle origins | **PASS** — checked against opaque iron pixels in revised pose |
| Manifest secondary-sheet existence | **PASS** — complete, no stale nonexistent-sheet claim |
| Original C-2 sheet | **PASS** — preserved as reference; source SHA unchanged |
| In-engine animation / effect layering | **NOT TESTED** — coding agent integration later |

## Updated muzzle-tip pixels (local zero-indexed coordinates)

- Aiming right and fire-ready: **(23,18)**; mirroring left produces **(0,18)**.
- Fire recoil: **(21,18)**; left mirrored **(2,18)**.
- Fire recovery: **(22,19)**; left mirrored **(1,19)**.
- Aiming down (unchanged): **(12,24)**; aiming up (unchanged): **(19,10)**.

Coordinates identify the last opaque iron pixel of the rendered muzzle, not a new game projectile position. External muzzle flash and projectile origins are coding-agent decisions. Do **not** overlay a second pistol on any aim/fire sprite: its pistol is baked into the frame.

## Approved-source fingerprints (SHA-256)

- C-1 primary `lookout_guard_24x32_dir.png`: `898b3df1a437c827b412ef24a217790a6d419514a6e2dd5947be695a518827af`
- C-1 side-walk `lookout_guard_walk_side_24x32.png`: `ffaed216839a90b3826bc3933da9a21fbb8000e0cb3fc1510225c9034b4b992b`
- Original C-2 combat sheet: `39bb84215f3ab39d6140fd8c502f3458eeaa617f9f82ca225a1275157034c1c0`
- Revised C-2R combat sheet: `14f164185bb330d7102f41c36c230e9be029449017fe03bec20a006699e88385`

No primary character art, walking art, old C-2 delivery, game code, `public/assets/`, maps, levels, gameplay rules or props were modified. **Stop condition fulfilled.**
