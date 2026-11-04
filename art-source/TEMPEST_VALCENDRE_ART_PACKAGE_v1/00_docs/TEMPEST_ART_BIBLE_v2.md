# TEMPEST — Art Bible v2
## Valcendre Unified Pixel-Art Direction · B.2-02

**Status:** Proposed art direction for review; **not** a production tileset or Phaser asset replacement.

**Reference scene:** `valcendre_market_master_480x270.png`  
**Reference baseline:** `02-market-square.png`, supplied by the coding agent  
**Audit commit:** `0f07efb`  
**Source:** `valcendre-visual-audit.md`, `composition-report.json`, `colour-census.json`, market capture and approved Tempest directional art.

This art bible governs **how future assets must be drawn**, not how the game must be programmed. No code, collision or mission data is changed by this package.

---

## 1. Locked direction

TEMPEST is a late-SNES / early-PS1 **grounded French espionage thriller** which slowly admits occult corruption. It should not resemble a fantasy JRPG, a painterly matte painting, a mobile-game icon collection, or a smooth vector illustration. Graphics are made of **intentional pixel clusters at their native size**.

| System | Contract |
|---|---|
| Internal canvas | Exactly **480 × 270** |
| Environment grid | **16 × 16** world-pixel tiles |
| Human | **24 × 32** native pixels |
| Direction | Camera looks downward with a slight three-quarter elevation; facade faces are visible beneath roof planes |
| World lighting | Fixed light coming from **upper left / northwest** |
| Pixel treatment | Crisp orthogonal native-pixel artwork; no interpolation, gradients, blur, glow or photo texture |
| Opacity | Tiles normally opaque; sprites/props binary-alpha where isolated; no semi-transparent contamination |
| Character budget | Up to 24 opaque colors per ordinary actor |
| Valcendre master environment palette | **53 governed values**: see `valcendre_palette.json` |
| Approved Tempest art | **Immutable**: copy from approved directional sheet; no recolor, retracing or downsample |

A coherent scene is the objective. A low color count alone is **not** success: the colors must form legible forms with purposeful hierarchy, clean volumes, and controlled texture.

## 2. Production ownership and the nonnegotiable boundary

**ART AGENT** owns style, material ramps, pixel-cluster construction, production PNGs and asset metadata in later art tasks. **CODING AGENT** owns Phaser imports, asset placement, tile indexes, geometry, hitboxes, camera, patrol positions, animation state logic, concealment and y-sorting. The references in this package **do not** authorize changing gameplay geometry.

The composition is an exact **480 × 270** native-pixel study, not a flattened replacement map. Its two schematic buildings, concept Lookout and prop details are **guides to future construction**, not new sprites to load as production assets.

**Important:** The current market hall rectangles are all impassable in the audit. Facade windows are placed within the same solid footprints. We intentionally do **not** draw an apparent enterable door in those two blocked halls. A readable door must correspond to an actual coded passage or remain plainly decorative.

## 3. Palette governance

`valcendre_palette.json` is the normative color list. Each color has a unique semantic ID, exact hex code, material and shading purpose. It contains 53 environment values, including reference ramps for skin and the proposed lookout's uniform. The approved Tempest sprite retains its own 22-color set from the supplied directional A sheet; its colors are registered independently as **locked character data**, not force-replaced with near matches.

### 3.1 The core material ramps

| Material | Shadow → highlight (exact HEX) | Shading intent |
|---|---|---|
| Limestone | `#6A6861` · `#918A7B` · `#B8AC98` · `#D9C9AD` · `#E8DCC8` | Quiet light surfaces, strong edges only where relief occurs |
| Plaster | `#8C8172` · `#B1A38F` · `#D5C4AA` | Broad, nearly uniform walls; wear concentrated near footings |
| Cobble | `#857F73` · `#A79C89` · `#BFB09A` · `#D1C0A5` | Subdued mortar and irregular large stones |
| Slate | `#343F4D` · `#526171` · `#74818A` · `#939B9B` · `#B6B8AE` | Cold roof courses with sparse ridge light |
| Terracotta | `#784638` · `#9B5946` · `#BB7558` · `#D58D67` · `#E0AE87` | Warm roof planes; no near-white sparkle |
| Wood | `#503B34` · `#735244` · `#946E51` · `#B28A61` | Plank seams and clear edges; long grain clusters |
| Iron | `#30363A` · `#596367` · `#879293` · `#ABB4AD` | Almost-black frames and small high-value tips |
| Foliage | `#2C463D` · `#42634D` · `#638052` · `#87A16A` · `#B7BF8C` | Four broad foliage groups, very rare light leaf clusters |
| Shutters | `#334F61` · `#4D6A7B` · `#708C9C` · `#99A9AC` | Dusty blue that is visibly painted wood, not neon |
| Lookout uniform | `#2B3B48` · `#3B5567` · `#567489` · `#758A8C` | Character remains dark and identifiable on pale stone |
| Skin | `#815D4C` · `#B58B70` · `#D8B095` · `#E4C7A6` | Single coherent face planes, not noisy freckles |

The master includes additional shared ink, structural shadow, rust, brass and paper accents. **No generation step may create a fresh RGB value because a pixel occupies an unusual coordinate.** A prop should borrow its material colors instead of assembling a private 30–500-color palette.

**Practical budgets:** Large architecture combines several ramps. A simple 16×16 pot, lantern or small sign usually needs **4–12 colors total**. An enemy uses **≤24**. Shared colors are desirable: the same iron value should describe a guard's buckle and a gate hinge.

## 4. Pixel clusters and material surface design

Every material must communicate form at **100% native scale**, not merely after a 6× or 8× zoom. Pixel boundaries are single native pixels. Test final art at 480×270 before approving it.

### Cobble / limestone paving

- Use asymmetric interlocking cobbles broadly **6–12 px** across, with an occasional larger 12–16 px slab. A scene-scale texture should not resemble perfect chessboard squares.
- Keep most floor pixels in a single calm mid-light range. Low-contrast grout outlines the large stones; reserve deeper cracks for occasional isolated damage.
- Repeat **designed clusters**, not random speckles. Make at least **four visibly different** 16×16 floor variants. Keep tile edges seamlessly connectable.
- Main square, lane, arcade and depot may share base hues, but must receive different **patterns and material identities**.

### Stone walls / plaster

- Blocks are readable by broad color planes and joint layout. Shadows live under sill edges, in relief, beneath eaves and at footing transitions.
- Horizontal joins should connect across adjacent 16 px modules; corner modules must visibly turn those joins through 90°.
- Most facade surfaces are quiet. Do not dither whole walls with one-pixel damage.

### Slate and terracotta roofing

- Slate has dark overlapping courses and sparse 1–2 px cool highlights. Terracotta has warmer bands and deliberate roof-course separation.
- Roofs need a coherent **ridge, pitch plane, edge/eave and corner**. A repeated texture alone does not express a roof.
- Roof shading must follow the same northwest lighting used elsewhere.

### Wood, metal and cloth

- Wood: define plank orientation before texture; 2–4 intentional grain strokes per broad component is enough.
- Iron: high-contrast edges and 1 px fasteners should **serve a mechanical silhouette**, not decorate every pixel.
- Cloth: large base mass, one fold shadow and one fold highlight. Avoid photographic thread texture.

### Vegetation

- Build trees, hedges and planters from 4–6 contiguous leaf masses. Use dark holes only between distinct clusters, never a rectangular black source backdrop.
- Limit highlights to small upper-left groupings; no pointillist or alpha-blended foliage.

## 5. Buildings: consistent and reproducible architectural grammar

Buildings are assembled from reusable **16×16 modules**. A finished building is a structured composition of roof courses, ridge tiles, eave corners, facade, windows/shutters, threshold, foundation and contact shade. Larger compositions use **multi-tile components** that align on the same grid.

### Vertical construction

1. **Roof plane:** at least two rows on a legible building; slate and terracotta have distinct pitches. The top edge and ridge are lighter on the upper-left side.
2. **Eave band:** 3 px deep along the south-facing edge, 1 px upper highlight and dark recessed underside. The eave remains part of the solid architectural footprint.
3. **Facade:** normally **two rows / 32 px** for the exposed front face. Plaster or ashlar limestone; vertical seams shift between courses.
4. **Window:** overall component approximately **22×18 px**, composed on adjacent modules rather than a single cramped 16×16 tile. Blue shutters, deep aperture, masonry sill. Window openings do not imply passability.
5. **Door:** roughly **16 px wide**, framed with a lintel and step. Only suggest a functional traversal route where the engine already allows one.
6. **Plinth:** lower 3 px indicate a grounded building face and distinguish facade from paving.
7. **Contact/cast shade:** 2–3 px hard-edge band extends slightly southeast on the receiving floor; it does not alter collisions.

### Horizontal construction

- Straight facade → outside corner → returning facade must join both masonry courses and roof eaves.
- Roof corners, wall corners and stair transitions must be visibly distinct, not byte-identical copies of a center tile.
- Roof body should be an **interior surface**, not a bright brick outline around a dark empty rectangle.
- Doors, window shutters, awnings and signs are secondary rhythms, not repeated at every 16 px.

### Assembled reference A — village residence

See the left half of `valcendre_architecture_study.png`. **8 × 6 tiles** overall footprint, muted slate roof, smooth warm plaster over a limestone base, shuttered window, practical wooden door, narrow low vegetation at the facade. Modular construction reuses the same roof/eave/window/door family.

### Assembled reference B — bakery / shopfront

See the right half. **10 × 6 tiles** overall footprint, terracotta roof, ashlar facade, dusty striped awning with wooden trim, shuttered window and doorway. It should be recognizable as a commercial front **without requiring a brand sign or an Eiffel Tower silhouette**.

**Art direction only:** these footprints illustrate modular construction. They are not proposed new buildings at those coordinates in the actual Valcendre map.

## 6. Lighting: distinguish four separate visual functions

| Function | Authoring rule | Ownership |
|---|---|---|
| Material shading | Built into the material ramp, emphasizing edges, eaves, stone relief, fabric folds | ART |
| Architectural cast shadow | Hard pixels cast to the **south/east** from vertical walls, props and roof edges; tinted to local stone/ground ramp | ART design; coding agent places dynamically if needed |
| Gameplay concealment | Designated stealth zones should read as shaded paving **while retaining the stone pattern**. A black blanket is not a material | Code controls game state and any overlay; ART specifies ramp variants |
| Contact shadow | 1–3 px tightly beneath boots, pots, crates, trees and fountains; distinct from a detection or concealment zone | ART design; implementation depends on y-sort and decals |

**Critical:** In the audited build, `shadowZones` is **an invisible gameplay flag**, while `deep_shadow#29` is drawn directly as a floor tile. They need to be visually disentangled. A concealment area should never erase the floor identity or reduce Tempest to the same value as the surface. No global gray or black filter is part of this proposal.

## 7. 24×32 character language

- Realistic proportions, roughly **6–9 px head**, **9–12 px torso width**, **8–12 px leg reach** depending on coat and view. No chibi mass or comic-book armor.
- Preserve the approved Tempest's silver hair, square mature posture, warm field jacket and dark trousers. Use the **exact approved pixels**; this package copies a single idle-up frame into the scene without altering the original PNG.
- Lookout concept: muted navy cap and jacket, weathered flesh tones, dark trousers, deep outline and coherent 4-shade uniform ramp. A single native **24×32** figure in the composition demonstrates parity of scale and cluster size. It is **not** an approved directional sprite sheet.
- Character silhouettes must be identifiable against pale limestone **and** cooler dark paving. Solve with local material value separation rather than luminous outlines.
- Feet align at **(12,30)** on production actor sprites. World-space contact shade belongs under the sprite, not baked into transparent frames.
- Animation frames must keep anatomy mass and clothing features steady. Repeated frames are preferable to invented jitter.

## 8. The market composition's gameplay invariants

This reference uses the source market capture camera: **(152,593) px**, native canvas **480×270**, and stage footprint data from the coding-agent audit. The source map is **104×72 tiles** overall. The market subset is columns **8–44**, rows **30–58**, with the same solid/hitbox occupancy represented by the audit's ASCII plan.

| Fixed geometry / interaction | Source location | Design treatment |
|---|---|---|
| Fountain | tile **(24,47)** | Rebuilt as readable 32×32 limestone/water landmark at original anchor; size and position remain concept targets |
| West market hall | **(17–20,41–44)** | 4×4 blocked footprint; slate roof and shuttered limestone facade, no fictional enterable door |
| East market hall | **(27–31,44–46)** | 5×3 blocked footprint; terracotta roof and ashlar facade |
| West arcade stealth route | **x9–12, y40–49** | Open path under legible colonnade; no invented obstruction or black floor |
| East exit | **x35–42, y47–49** | Retained as readable unblocked passage to main street |
| South arrival connection | **x11–15, y56–57** | Retained, no construction blocking arrival |
| Northern garden access | **x16–19, y31** | Existing mouth retained, not visible in this camera |
| Low cover | **24 tiles** across exact source bands | Material reworked in concept; no new hitbox geometry |
| High cover | tiles **(12,42), (12,46)** | Kept as high cover, visually separate from low cover |
| V1 tyre tracks clue | **(24,48)** | Small nonblocking track decal concept; must remain examinable |
| V1 ransacked stall clue | **(30,47)** | Small evidence cluster at original interactive position; market awning is associated visually with nearby existing cover, not a new solid entity |
| V2 waybill clue | **(30,34)** | Off-camera here, retain current coordinate and intent |
| Radio distraction | **(31,34)** | Off-camera here, retain reachable interaction and 128 px distraction radius |
| Medkit | **(10,45)** | Existing interaction preserved; its final icon is not redesigned in this art-direction task |

### Market-stall composition caveat

The illustrated awning is drawn above the **existing five-tile low cover** at x29–33, y49. The raised canopy overlaps walkable picture space but **does not confer new collision**. A future production asset must be split into a ground/collision portion and a visual overhang or otherwise explicitly reviewed for actor layering; only the coding agent decides how to render that split. This is a documented integration request, not a hidden map edit.

### Other placement notes

- The concept Lookout stands in the **staged screenshot's approximate camera composition**. Guard patrol data must continue to come from the engine (L2 circuit, not from this PNG).
- Some decorative props are selectively omitted from the master scene to protect traversal clarity. Their **game object placements remain unchanged** in the original map.
- The code agent's diagnostic screenshot is **staged** rather than playthrough footage. Scene composition is therefore checked against coordinates and a static viewport, not falsely treated as validated encounter balance.

## 9. Gameplay contrast and texture hierarchy

**Priority 1:** Tempest, enemies, interactive evidence and danger.  
**Priority 2:** walls/cover, doors, stairs and line-of-sight boundaries.  
**Priority 3:** large-area floor motifs, chipped masonry, spare vegetation and ambient clutter.

Prefer a quiet warm floor beneath a strong, dark character, without gamey neon edge lighting. Avoid a 1 px black grid at high contrast across an entire 480×270 screen. The existing 1px bright garage metal stripes are an example of the *wrong* frequency distribution and should later be repainted with larger calmer planes.

### Readability test evidence bundled

- `valcendre_market_master_480x270.png` — **actual native-size visual decision**.
- `previews/valcendre_market_3x.png` — integer-only nearest-neighbor inspection.
- `previews/valcendre_market_grayscale_480x270.png` — value separation check.
- `previews/tempest_contrast_comparison.png` — 24×32 approved Tempest cropped onto four background families.
- `valcendre_before_after.png` — side-by-side at **identical unfiltered 480×270** areas; old image pasted with unchanged RGB bytes.

**Measured:** Proposed master image has **60 distinct RGB values**; every RGB triplet belongs to either the **53-color environment palette** or the locked approved Tempest character colors. The single concept Lookout is drawn only from master-palette values. Color membership is useful evidence, but visual test remains mandatory before production acceptance.

**Not yet validated:** Actual patrol readability during motion, in-engine roof y-sorting, dynamic concealment treatment, interaction readability when an alert icon appears, and all collision / overlap behavior. These are coding-agent integration and playtest gates for the **future small proof asset batch**.

## 10. How the mood deepens across TEMPEST

The game's four locales stay in one technical production language. **Do not change pixel density, actor proportions, outline rules or shadow grammar between acts.** Horror enters through material and shape, not a new illustration pipeline.

1. **Valcendre:** warm pale limestone, soft ochre plaster, weathered shutters, dusty slate and terracotta, muted greenery. Everyday architecture feels lived in; violent details are restrained, sharply legible exceptions.
2. **Estate:** retain the same geometry and cluster construction but shift toward colder cut stone, iron gates, managed vegetation, pale indoor parquet, isolated wine-red fabrics. More formal symmetry and long shadows imply concealment and power.
3. **Abbey:** weathered Gothic limestone, missing edges, broad candle-light planes, dark iron and sparse blood accents. Ruins must remain topologically readable; blood is a semantic cue, not a noise layer.
4. **Ascension:** charred crimson, black basalt, dim ritual gold, hard rim lighting and restrained organic breaks in architectural logic. Demonic forms remain native pixels and avoid huge effects obscuring stealth/combat cues.

The visual narrative is **continuity under corruption**: Valcendre's calm masonry grammar survives into the abbey but fractures; its warm brass becomes ritual gold; its brick red becomes the ritual crimson. This continuity makes supernatural intrusion more disturbing.

## 11. Explicit asset disposition and production priorities

The detailed, machine-readable inventory is `valcendre_asset_disposition.json`. It enumerates **all 48 old tile slots**, the Valcendre props found in the census, the approved Tempest pair, relevant legacy character sheets and missing art requests. Classification semantics:

- **KEEP:** art is compliant and **must not be touched** (approved Tempest directional sheets).
- **REWORK:** a recognizable existing indexed tile/art family can be improved **within its fixed tile contract** (primarily environment slots).
- **REPLACE:** an artwork is visually irredeemable as native pixel art because every opaque pixel gets its own color (old props, old lookouts/portraits).
- **NEW:** an unbuilt necessary element has no corresponding production asset (track clue, authentic modular roof/corner family, visible concealment design, etc.).

After this art-direction approval, the recommended **smallest test batch** is a few ground variants, one complete modular facade/corner set, one 32×32 fountain and one Lookout standing/walking sample. Those should be integrated and screenshot-captured at 480×270 **before** authorizing production of the remaining 45 props or other characters. This recommendation is a future gate only: **none** of that production work has been performed here.

## 12. Acceptance checks and unresolved questions

### Completed for this direction study

- Native **480×270** master reference generated at target pixel density; no downsampling of high-resolution paintings.
- Original approved Tempest pixel frame copied unchanged.
- Concept Lookout drawn on a native 24×32 grid.
- 53-color semantic environment palette with exact HEX values delivered; 60 combined colors used in scene.
- Market-reference architecture, floor, shutters, fountain, market cover/stall, trees, materials and hard shadows expressed through one shared pixel language.
- Baseline before image retained byte-for-byte; no global filter or old-prop lift.
- Native scene, 3× preview, grayscale and character contrast comparison included.
- Original map/collision unchanged because no game code or level data has been edited.

### Still requiring approval / game-engine confirmation

1. Is the amount of cobble detail **quiet enough at moving gameplay speed**?
2. Are the two market buildings sufficiently legible as structures while remaining *non-enterable* in the current map?
3. Does the market stall overhang need a separate foreground-y-sort layer to avoid obscuring actors?
4. Would an explicit, **non-black concealment decal** improve stealth communication without revealing hidden zones prematurely?
5. Does the new Lookout silhouette remain distinct from Tempest with muzzle flashes, alerts and weapons active?
6. Can the coding agent reproduce the precise asset and alignment contracts without changing routing or hitboxes?

**Stop:** This package establishes visual direction only. Do not extrapolate it into all stages, all character animations, an updated game tileset or an unseen game-code edit. Authorize the tiny proof batch in a separate task after reviewing this work.
