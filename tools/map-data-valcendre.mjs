/**
 * AUTHORED GEOMETRY for Valcendre. Hand-written, never generated.
 *
 * Phase C.1B-01 rebuild: 104x72 tiles, seven connected areas with a branching
 * mid-mission route, per docs/level-design/valcendre-rework.md.
 *
 * Coordinates are tiles. The model is deliberately simple and has one rule:
 *
 *   REGIONS carve walkable floor. OBSTRUCTIONS carve it back out. Everything
 *   still non-walkable afterwards becomes collision, and the architecture pass
 *   paints it as wall face -> roof edge -> roof -> darkness.
 *
 * So a building is just an un-carved gap, and an interior is a region inside a
 * gap. There is no separate wall list to keep in sync with collision.
 */

// --------------------------------------------------------------------- layout
/**
 * Seven areas. `area` groups regions for the per-area surface report; `surface`
 * is appearance only and can never change walkability.
 *
 * Connectivity, which the reachability flood fill verifies on every build:
 *
 *   alley --neck--> market(south approach)
 *   market(main) <--> west arcade, north plaza, east lane
 *   market(north plaza) --passage--> bakery yard        [GARDEN BRANCH]
 *   bakery yard <--> garden wall walk <--> upper lane <--> descent
 *   descent --> courtyard (north-west corner, behind the gate)
 *   market(east lane) --> main street                   [COMBAT BRANCH]
 *   main street --depot gate--> courtyard (south)
 *   courtyard --office door--> depot office
 *   courtyard --garage door--> garage
 *   courtyard --dock ramp--> loading dock <--> garage
 *   garage --> north road (EXIT)
 */
export const REGIONS = [
  // --- 1. arrival alley -------------------------------------------------
  { id: 'alley', area: 'arrivalAlley', x: 6, y: 58, w: 10, h: 11, surface: 'alleyCobble' },
  { id: 'alleyNeck', area: 'arrivalAlley', x: 11, y: 56, w: 5, h: 2, surface: 'alleyCobble' },

  // --- 2. market square: composed, not one rectangle --------------------
  { id: 'marketMain', area: 'marketSquare', x: 13, y: 38, w: 22, h: 14, surface: 'marketPaving' },
  { id: 'marketPlaza', area: 'marketSquare', x: 16, y: 32, w: 16, h: 6, surface: 'marketPaving' },
  { id: 'marketApproach', area: 'marketSquare', x: 13, y: 52, w: 12, h: 5, surface: 'marketPaving' },
  // West arcade: a shadowed colonnade, separated from the square by pillars
  // rather than a wall, so it reads as cover rather than a corridor.
  { id: 'marketArcade', area: 'marketSquare', x: 9, y: 40, w: 4, h: 10, surface: 'alleyCobble' },
  { id: 'marketEastLane', area: 'marketSquare', x: 35, y: 47, w: 8, h: 3, surface: 'marketPaving' },

  // --- 3. bakery and garden route (the LONG branch) ---------------------
  { id: 'bakeryPassage', area: 'bakeryGarden', x: 16, y: 31, w: 4, h: 1, surface: 'gardenPath' },
  { id: 'bakeryYard', area: 'bakeryGarden', x: 6, y: 20, w: 15, h: 11, surface: 'gardenGrass' },
  { id: 'gardenWalk', area: 'bakeryGarden', x: 6, y: 3, w: 6, h: 20, surface: 'gardenPath' },
  { id: 'upperLaneWest', area: 'bakeryGarden', x: 11, y: 3, w: 18, h: 4, surface: 'serviceBrick' },
  { id: 'upperLaneJog', area: 'bakeryGarden', x: 26, y: 6, w: 6, h: 16, surface: 'serviceBrick' },
  { id: 'upperLaneEast', area: 'bakeryGarden', x: 30, y: 16, w: 10, h: 4, surface: 'serviceBrick' },
  { id: 'upperLaneNorth', area: 'bakeryGarden', x: 37, y: 8, w: 6, h: 9, surface: 'serviceBrick' },
  { id: 'upperLaneFinal', area: 'bakeryGarden', x: 42, y: 8, w: 10, h: 4, surface: 'serviceBrick' },
  { id: 'laneDescent', area: 'bakeryGarden', x: 46, y: 11, w: 6, h: 16, surface: 'serviceBrick' },

  // --- 4. main street (the SHORT branch) --------------------------------
  { id: 'mainStreet', area: 'mainStreet', x: 43, y: 46, w: 36, h: 11, surface: 'alleyCobble' },
  { id: 'depotGate', area: 'mainStreet', x: 75, y: 44, w: 4, h: 2, surface: 'yardGravel' },

  // --- 5. depot courtyard, composed around the office building ----------
  { id: 'courtyardNorth', area: 'depotCourtyard', x: 56, y: 20, w: 30, h: 6, surface: 'yardGravel' },
  { id: 'courtyardMid', area: 'depotCourtyard', x: 50, y: 26, w: 32, h: 4, surface: 'yardGravel' },
  { id: 'courtyardWest', area: 'depotCourtyard', x: 50, y: 30, w: 2, h: 9, surface: 'yardGravel' },
  { id: 'courtyardEast', area: 'depotCourtyard', x: 59, y: 30, w: 23, h: 9, surface: 'yardGravel' },
  { id: 'courtyardSouth', area: 'depotCourtyard', x: 50, y: 39, w: 32, h: 5, surface: 'yardGravel' },

  // --- 6. depot office: interior inside the un-carved footprint ---------
  // Footprint x52-58, y30-38; the ring is simply never carved.
  { id: 'officeInterior', area: 'depotOffice', x: 53, y: 31, w: 5, h: 7, surface: 'garageFloor' },
  { id: 'officeDoor', area: 'depotOffice', x: 55, y: 38, w: 2, h: 1, surface: 'garageFloor' },

  // --- 7. garage, loading dock and the exit -----------------------------
  { id: 'garage', area: 'garageInterior', x: 58, y: 6, w: 27, h: 13, surface: 'garageFloor' },
  { id: 'garageDoor', area: 'garageInterior', x: 81, y: 19, w: 3, h: 1, surface: 'garageFloor' },
  { id: 'loadingDock', area: 'loadingDock', x: 84, y: 10, w: 7, h: 11, surface: 'yardGravel' },
  { id: 'northRoad', area: 'northRoad', x: 60, y: 0, w: 5, h: 6, surface: 'roadDirt' },
];

/**
 * Building blocks and interior walls, carved back out of the regions above.
 *
 * These exist to break long sight lines and stop any space reading as an empty
 * rectangle - the Phase C.1A review flagged oversized empty floor. The
 * reachability flood fill runs after them, so an obstruction that seals a route
 * fails the build.
 */
export const OBSTRUCTIONS = [
  // Market: two halls that break the square into readable thirds.
  { x: 17, y: 41, w: 4, h: 4, why: 'market hall, west' },
  { x: 27, y: 44, w: 5, h: 3, why: 'market hall, east' },
  // Main street: a dog-leg, so the street is not a 32-tile shooting gallery.
  { x: 52, y: 46, w: 4, h: 4, why: 'street block, north side' },
  { x: 62, y: 53, w: 5, h: 4, why: 'street block, south side' },
  // Courtyard: breaks the three shooting lanes the encounter design needs.
  { x: 64, y: 33, w: 5, h: 4, why: 'depot fuel store' },
  { x: 73, y: 31, w: 4, h: 3, why: 'depot shed' },
  // Garage: a workbench run along the west bay.
  { x: 62, y: 10, w: 4, h: 3, why: 'garage workbench' },
  // More courtyard structure: at 36x24 tiles the courtyard is larger than one
  // 480x270 screen, and the first render showed too much open gravel.
  { x: 68, y: 36, w: 5, h: 3, why: 'depot outbuilding, south' },
  { x: 56, y: 22, w: 3, h: 3, why: 'depot gatehouse stub, north-west' },
  { x: 78, y: 28, w: 3, h: 3, why: 'depot store, east' },
  // Wall the garage/dock junction so the dock is a real second ENTRANCE rather
  // than part of the same room. The shutter at x84,y13-15 is carved back by
  // DOORS, so with the doors locked the garage is sealed.
  { x: 84, y: 10, w: 1, h: 9, why: 'garage east wall, pierced by the dock shutter' },
];

/**
 * Lockable doors. Carved back to walkable AFTER the obstructions, so pathing
 * and reachability work once they are open, and registered as `door` objects so
 * the runtime can make them solid, sight-blocking and visibly shut while locked.
 *
 * The garage has two entrances by design. BOTH are doors, so neither can be the
 * one that quietly bypasses the key.
 */
export const DOORS = [
  {
    name: 'door_garage_courtyard',
    x: 81,
    y: 19,
    w: 3,
    h: 1,
    locked: 'garage_key',
    why: "the garage's main door off the courtyard",
  },
  {
    name: 'door_garage_dock',
    x: 84,
    y: 13,
    w: 1,
    h: 3,
    locked: 'garage_key',
    why: 'the loading dock shutter, the garage\'s second entrance',
  },
];

/** Appearance-only surface overrides. */
export const SURFACE_OVERRIDES = [
  // A path worn down the middle of the garden lane.
  { x: 8, y: 4, w: 2, h: 19, surface: 'gardenPath' },
];

/** Authored dark zones: crouching here accumulates suspicion slowly. */
export const SHADOWS = [
  // Arrival alley: building shade on the approach.
  { x: 6, y: 58, w: 3, h: 5 },
  // Market west arcade, the stealth line across the square.
  { x: 9, y: 40, w: 4, h: 10 },
  // Under the covered market rows.
  { x: 16, y: 35, w: 6, h: 2 },
  { x: 25, y: 35, w: 6, h: 2 },
  // The whole garden branch is the safer route, and reads that way.
  { x: 6, y: 20, w: 5, h: 6 },
  { x: 6, y: 3, w: 6, h: 20 },
  { x: 11, y: 3, w: 18, h: 4 },
  { x: 26, y: 6, w: 6, h: 16 },
  { x: 30, y: 16, w: 10, h: 4 },
  { x: 37, y: 8, w: 6, h: 9 },
  { x: 42, y: 8, w: 10, h: 4 },
  { x: 46, y: 11, w: 6, h: 16 },
  // Courtyard north wall, the garden route's arrival line.
  { x: 56, y: 20, w: 10, h: 2 },
  // Garage west bay and the dock.
  { x: 58, y: 6, w: 4, h: 6 },
  { x: 85, y: 10, w: 6, h: 4 },
];

/**
 * Tile-based cover. Roles come from src/art/data/tile-roles.json:
 *   barrierLow - blocks bullets always, sight only of a crouched player
 *   crateHigh  - solid, blocks sight
 *   well       - solid, blocks sight (the arcade's stone pillars)
 *   van        - solid, blocks sight; the placeholder van sprite covers it
 */
export const COVER = [
  // --- market: stall rows and arcade pillars ---
  { x: 16, y: 36, w: 6, h: 1, role: 'barrierLow' },
  { x: 25, y: 36, w: 6, h: 1, role: 'barrierLow' },
  { x: 14, y: 46, w: 3, h: 1, role: 'barrierLow' },
  { x: 22, y: 42, w: 4, h: 1, role: 'barrierLow' },
  { x: 29, y: 49, w: 5, h: 1, role: 'barrierLow' },
  { x: 12, y: 42, w: 1, h: 1, role: 'well' },
  { x: 12, y: 46, w: 1, h: 1, role: 'well' },
  // --- main street: planters and crates breaking the lanes ---
  { x: 47, y: 50, w: 4, h: 1, role: 'barrierLow' },
  { x: 57, y: 51, w: 4, h: 1, role: 'barrierLow' },
  { x: 69, y: 48, w: 4, h: 1, role: 'barrierLow' },
  { x: 58, y: 47, w: 2, h: 2, role: 'crateHigh' },
  { x: 71, y: 54, w: 2, h: 2, role: 'crateHigh' },
  // --- courtyard: the primary tactical space ---
  { x: 61, y: 22, w: 2, h: 2, role: 'crateHigh' },
  { x: 78, y: 23, w: 2, h: 2, role: 'crateHigh' },
  { x: 66, y: 40, w: 4, h: 1, role: 'barrierLow' },
  { x: 55, y: 41, w: 3, h: 1, role: 'barrierLow' },
  { x: 76, y: 41, w: 4, h: 1, role: 'barrierLow' },
  { x: 60, y: 30, w: 2, h: 2, role: 'crateHigh' },
  { x: 79, y: 35, w: 2, h: 2, role: 'crateHigh' },
  // --- garage: the van and crate stacks ---
  { x: 70, y: 10, w: 4, h: 2, role: 'van' },
  { x: 78, y: 14, w: 2, h: 2, role: 'crateHigh' },
  { x: 66, y: 16, w: 2, h: 2, role: 'crateHigh' },
  // --- loading dock ---
  { x: 86, y: 16, w: 3, h: 1, role: 'barrierLow' },
];

/** Authored decorative accents on decorBack. Appearance only. */
export const ACCENTS = [
  // Market: a paved medallion at the fountain, and greenery in the arcade.
  { x: 23, y: 44, w: 2, h: 2, tile: 'accentChecker' },
  { x: 9, y: 40, w: 2, h: 2, tile: 'grass' },
  { x: 9, y: 48, w: 2, h: 2, tile: 'grass' },
  { x: 11, y: 44, w: 1, h: 1, tile: 'flowerbed' },
  // Garden branch greenery, over the dark concealment floor.
  { x: 6, y: 20, w: 3, h: 3, tile: 'grass' },
  { x: 6, y: 27, w: 2, h: 3, tile: 'grass' },
  { x: 9, y: 24, w: 2, h: 2, tile: 'grass' },
  { x: 6, y: 8, w: 2, h: 4, tile: 'grass' },
  { x: 6, y: 18, w: 2, h: 3, tile: 'grass' },
  { x: 10, y: 21, w: 1, h: 1, tile: 'flowerbed' },
  { x: 7, y: 14, w: 1, h: 1, tile: 'flowerbed' },
  { x: 18, y: 24, w: 3, h: 1, tile: 'hedge' },
  // Thresholds in front of the authored facade doors.
  { x: 17, y: 32, w: 2, h: 1, tile: 'threshold' },
  { x: 14, y: 52, w: 2, h: 1, tile: 'threshold' },
  { x: 55, y: 39, w: 2, h: 1, tile: 'threshold' },
  // The recurring sigil: scratched in the garage, beside the van.
  { x: 69, y: 13, w: 1, h: 1, tile: 'accentInlay' },
  { x: 75, y: 11, w: 1, h: 1, tile: 'accentInlay' },
];

/**
 * Facade openings. Appearance only - the collision layer still blocks these
 * tiles, so a window or door changes nothing mechanically. Each must sit on the
 * 1-tile wall ring with walkable floor directly below it, which the build
 * asserts; run with MAP_DOOR_CANDIDATES=1 to list valid positions.
 */
export const FACADE_DOORS = [
  // Arrival alley: a house door the player passes on the way out.
  { x: 7, y: 57 },
  { x: 8, y: 57 },
  // Market north plaza: two shopfronts, on the only wall the camera shows.
  { x: 22, y: 31 },
  { x: 23, y: 31 },
  { x: 26, y: 31 },
  { x: 27, y: 31 },
  // Market north-west: a house front onto the square.
  { x: 14, y: 37 },
  { x: 15, y: 37 },
  // Bakery: its own door onto its yard.
  { x: 14, y: 19 },
  { x: 15, y: 19 },
  // Main street: a depot outbuilding, and a house near the gate.
  { x: 46, y: 45 },
  { x: 47, y: 45 },
  { x: 66, y: 45 },
  { x: 67, y: 45 },
  // Depot office front, flanking its doorway at x55-56.
  { x: 53, y: 38 },
  { x: 54, y: 38 },
  // Depot workshop door onto the courtyard.
  { x: 64, y: 19 },
  { x: 65, y: 19 },
];

/**
 * Prop placements. `tx`/`ty` is the tile the prop's base sits in; `dx` is the
 * anchor's pixel offset inside it (8 = tile centre, 16 = the boundary with the
 * next tile, which aligns a 32px prop to a two-tile block).
 *
 * Gameplay roles come from src/art/data/prop-metadata.json, so a placement
 * cannot invent cover the collision grid does not have.
 */
export const PROP_PLACEMENTS = [
  // --- arrival alley ---
  { prop: 'valcendre.lamppost', tx: 8, ty: 62, dx: 8 },
  { prop: 'valcendre.barrels', tx: 13, ty: 60, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 9, ty: 64, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 14, ty: 66, dx: 8 },
  { prop: 'valcendre.bench', tx: 7, ty: 67, dx: 16 },

  // --- market square ---
  { prop: 'valcendre.fountain', tx: 23, ty: 46, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 15, ty: 50, dx: 16 },
  { prop: 'valcendre.tree', tx: 31, ty: 41, dx: 8 },
  { prop: 'valcendre.tree', tx: 20, ty: 51, dx: 8 },
  { prop: 'valcendre.bench', tx: 26, ty: 48, dx: 16 },
  { prop: 'valcendre.bench', tx: 18, ty: 34, dx: 16 },
  { prop: 'valcendre.barrels', tx: 33, ty: 50, dx: 16 },
  { prop: 'valcendre.flower_box', tx: 28, ty: 33, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 24, ty: 36, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 22, ty: 50, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 33, ty: 45, dx: 8 },
  { prop: 'valcendre.clothesline', tx: 17, ty: 39, dx: 16 },
  { prop: 'valcendre.french_flag', tx: 20, ty: 33, dx: 8 },
  { prop: 'valcendre.village_cross', tx: 11, ty: 49, dx: 8 },
  { prop: 'valcendre.stone_cover', tx: 30, ty: 39, dx: 16 },

  // --- bakery yard and garden route ---
  { prop: 'valcendre.tree', tx: 8, ty: 29, dx: 8 },
  { prop: 'valcendre.tree', tx: 9, ty: 12, dx: 8 },
  { prop: 'valcendre.flower_box', tx: 17, ty: 29, dx: 16 },
  { prop: 'valcendre.flower_box', tx: 6, ty: 23, dx: 16 },
  { prop: 'valcendre.barrels', tx: 19, ty: 22, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 13, ty: 27, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 15, ty: 21, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 7, ty: 10, dx: 8 },
  { prop: 'valcendre.village_cross', tx: 10, ty: 18, dx: 8 },
  { prop: 'valcendre.barrels', tx: 24, ty: 5, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 34, ty: 18, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 39, ty: 10, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 48, ty: 20, dx: 8 },

  // --- main street ---
  { prop: 'valcendre.lamppost', tx: 46, ty: 52, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 68, ty: 52, dx: 8 },
  { prop: 'valcendre.flower_box', tx: 49, ty: 55, dx: 16 },
  { prop: 'valcendre.barrels', tx: 56, ty: 55, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 60, ty: 50, dx: 16 },
  { prop: 'valcendre.bench', tx: 66, ty: 51, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 73, ty: 50, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 50, ty: 47, dx: 16 },
  { prop: 'valcendre.tree', tx: 44, ty: 56, dx: 8 },
  { prop: 'valcendre.barrels', tx: 76, ty: 53, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 77, ty: 49, dx: 8 },

  // --- depot courtyard ---
  { prop: 'valcendre.barrels', tx: 57, ty: 24, dx: 16 },
  { prop: 'valcendre.barrels', tx: 70, ty: 25, dx: 16 },
  { prop: 'valcendre.barrels', tx: 80, ty: 38, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 71, ty: 43, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 59, ty: 42, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 74, ty: 28, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 66, ty: 28, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 51, ty: 37, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 81, ty: 22, dx: 8 },
  { prop: 'valcendre.barrels', tx: 61, ty: 38, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 79, ty: 32, dx: 16 },

  // --- garage and loading dock ---
  { prop: 'valcendre.barrels', tx: 60, ty: 17, dx: 16 },
  { prop: 'valcendre.barrels', tx: 82, ty: 18, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 75, ty: 17, dx: 16 },
  { prop: 'valcendre.barrels', tx: 86, ty: 13, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 89, ty: 19, dx: 8 },

  // --- north road ---
  { prop: 'valcendre.village_cross', tx: 63, ty: 3, dx: 8 },
];

const px = (t) => t * TS_SIZE + TS_SIZE / 2;
const TS_SIZE = 16;

function pt(name, type, tx, ty, props = {}) {
  return { name, type, point: true, x: px(tx), y: px(ty), width: 0, height: 0, props };
}
function rect(name, type, tx, ty, tw, th, props = {}) {
  return {
    name,
    type,
    x: tx * TS_SIZE,
    y: ty * TS_SIZE,
    width: tw * TS_SIZE,
    height: th * TS_SIZE,
    props,
  };
}
function route(id, points) {
  return points.map(([tx, ty], i) =>
    pt(`wp_${id}_${i}`, 'waypoint', tx, ty, { route: id, index: i })
  );
}

/**
 * Objects.
 *
 * TEMPORARY OBJECTIVE SET. Phase C.1B-01 is geometry only: the existing V1/V2/
 * V3/VX chain still has to be completable, so the van, log and inscription move
 * to sensible places in the new garage and nothing is gated behind anything new.
 *
 * Future objective sites are reserved as `reserved` objects. The scene asks for
 * specific object types and ignores unknown ones, so these carry position and
 * intent into C.1B-2 without creating a dependency or a lock today.
 *
 * Enemies stay at three Lookouts. The seven-guard encounter placement is
 * C.1B-3.
 */
export const OBJECTS = [
  pt('spawn', 'spawn', 10, 66, { facing: 0 }),

  // --- patrol routes (three guards; C.1B-3 expands to seven) ---
  ...route('l1', [
    [13, 57],
    [14, 53],
    [19, 53],
  ]),
  ...route('l2', [
    [17, 39],
    [32, 40],
    [32, 50],
    [16, 49],
  ]),
  ...route('l3', [
    [60, 41],
    [80, 40],
    [76, 22],
    [60, 23],
  ]),

  pt('enemy_l1', 'enemy', 14, 53, { kind: 'lookout', route: 'l1', facing: 90 }),
  pt('enemy_l2', 'enemy', 17, 39, { kind: 'lookout', route: 'l2', facing: 0 }),
  pt('enemy_l3', 'enemy', 60, 41, { kind: 'lookout', route: 'l3', facing: 0 }),

  // --- the market distraction (unchanged) ---
  pt('interact_radio', 'interactable', 31, 34, {
    kind: 'radio',
    prompt: 'E - SWITCH ON RADIO',
    noise: 128,
    oneShot: true,
  }),

  // --- supplies ---
  pt('item_medkit_market', 'item', 10, 45, { kind: 'medkit' }),
  pt('item_ammo_street', 'item', 60, 49, { kind: 'ammo_pistol' }),
  pt('item_ammo_lane', 'item', 28, 18, { kind: 'ammo_pistol' }),
  pt('item_medkit_courtyard', 'item', 54, 33, { kind: 'medkit' }),

  // --- the eight-beat investigation (docs/level-design/valcendre-rework.md) ---
  // V1: two sources, either one completes the beat.
  pt('interact_tracks', 'interactable', 24, 48, {
    kind: 'tracks',
    prompt: 'E - EXAMINE TRACKS',
    objective: 'V1',
    glint: true,
  }),
  pt('interact_stall', 'interactable', 30, 47, {
    kind: 'stall',
    prompt: 'E - INVESTIGATE STALL',
    objective: 'V1',
    glint: true,
  }),

  // V2: the waybill, or overhearing the market guards.
  pt('interact_waybill', 'interactable', 30, 34, {
    kind: 'waybill',
    prompt: 'E - READ WAYBILL',
    objective: 'V2',
    requires: 'V1',
    glint: true,
  }),
  // Proximity trigger covering the whole covered market, so the player never
  // has to stand on a precise tile. It needs a living guard within earshot but
  // never requires one: if they are all dead the waybill still works.
  rect('trigger_overheard', 'trigger', 22, 32, 10, 6, {
    objective: 'V2',
    requires: 'V1',
    needsLivingGuardWithin: 220,
    dialogue: 'village_overheard',
  }),

  // V3: depot traversal. One trigger per approved route, so either works.
  rect('trigger_depot_street', 'trigger', 74, 40, 6, 5, {
    objective: 'V3',
    requires: 'V2',
    dialogue: 'village_depot',
  }),
  rect('trigger_depot_garden', 'trigger', 50, 26, 4, 4, {
    objective: 'V3',
    requires: 'V2',
    dialogue: 'village_depot',
  }),

  // V5: the ledger, which carries the garage key. On a desk, never on a guard.
  pt('interact_ledger', 'interactable', 55, 33, {
    kind: 'ledger',
    prompt: 'E - READ DEPOT LEDGER',
    objective: 'V5',
    requires: 'V3',
    glint: true,
  }),

  // V4: the transport.
  pt('interact_van', 'interactable', 69, 11, {
    kind: 'van',
    prompt: 'E - EXAMINE TRANSPORT',
    objective: 'V4',
    requires: 'V5',
    glint: true,
  }),

  // V6: the wounded cultist. A non-combatant scripted scene, triggered by
  // approach from either garage entrance, deferred while the player is in
  // combat. Placed between the two entrances so it cannot be missed.
  pt('actor_cultist', 'story', 80, 16, {
    kind: 'cultist',
    objective: 'V6',
    requires: 'V4',
    radius: 44,
    dialogue: 'village_cultist',
  }),

  // V7: BELIAL. Mandatory, and the exit checks it.
  pt('interact_inscription', 'interactable', 75, 10, {
    kind: 'inscription',
    prompt: 'E - EXAMINE INSCRIPTION',
    objective: 'V7',
    requires: 'V6',
    glint: true,
  }),

  pt('interact_hymn', 'interactable', 12, 25, {
    kind: 'hymn',
    prompt: 'E - READ TORN PAGE',
  }),

  // Checkpoints: entry, after the market intelligence, after the ledger and
  // key, and after BELIAL - so no failure repeats a long story beat.
  pt('checkpoint_entry', 'checkpoint', 10, 63, { id: 'cp_entry' }),
  pt('checkpoint_market', 'checkpoint', 36, 48, { id: 'cp_market' }),
  pt('checkpoint_office', 'checkpoint', 55, 36, { id: 'cp_office' }),
  pt('checkpoint_belial', 'checkpoint', 70, 8, { id: 'cp_belial' }),

  rect('exit_north', 'exit', 60, 0, 5, 2, { to: 'estate', requires: 'V7' }),

  // Generated-placeholder decor. The van's collision comes from the `van` cover
  // tiles beneath it; this 64x32 sprite covers those four-by-two tiles exactly.
  {
    name: 'decor_van',
    type: 'decor',
    point: true,
    x: 72 * TS_SIZE,
    y: 12 * TS_SIZE,
    width: 0,
    height: 0,
    props: { sprite: 'prop_van', depth: 'sorted' },
  },

];
