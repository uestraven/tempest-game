#!/usr/bin/env node
/**
 * Builds public/assets/maps/village.json (Tiled 1.10 JSON) for the Valcendre
 * vertical slice, against the PRODUCTION tileset.
 *
 * Geometry is AUTHORED, not generated: every region, cover piece, prop, patrol
 * waypoint and object position below is written out by hand.
 *
 * APPEARANCE IS SEPARATE FROM COLLISION.
 *   - `collision` (invisible, collider) carries one blocker tile for every
 *     non-walkable tile. This is the gameplay truth and is derived purely from
 *     the carved regions, so repainting the village cannot change where the
 *     player can walk.
 *   - `architecture` (visible, not a collider) paints what the player actually
 *     sees outside the playable area: stone wall faces with windows and doors,
 *     then a roof edge, then red roof tiles, then darkness.
 *   - `floor` paints a per-area surface so each authored space reads
 *     differently.
 *
 * It is also the gate that keeps art and gameplay honest. It fails the build if
 * a role or surface names a tile the tileset does not define, if a gameplay role
 * calls a solid art tile walkable, if a surface tile is solid, or if a prop,
 * cover piece or wall makes any walkable tile, object anchor or patrol waypoint
 * unreachable from the spawn point.
 *
 * Re-run with `npm run map` (also run automatically by `dev` and `build`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const STAGE = 'valcendre';
const TILESET_SRC = `art-source/TEMPEST_pixel_art_v1/environments/${STAGE}_tiles.json`;
const ROLES_SRC = 'src/art/data/tile-roles.json';
const PROPS_SRC = 'src/art/data/prop-metadata.json';
const OUT = 'public/assets/maps/village.json';

const W = 60;
const H = 40;
const TS = 16;

// ------------------------------------------------- production tileset metadata
const tilesetMeta = read(TILESET_SRC);
const roleData = read(ROLES_SRC);
const propData = read(PROPS_SRC);

const tileByName = new Map(tilesetMeta.tiles.map((t) => [t.name, t]));
const tileId = (name) => {
  const tile = tileByName.get(name);
  if (!tile) throw new Error(`tileset "${STAGE}" has no tile named "${name}"`);
  return tile.id;
};

/** Gameplay roles, validated against the artwork's own hints. */
const ROLES = {};
for (const [role, raw] of Object.entries(roleData.roles)) {
  const art = tileByName.get(raw.tile);
  if (!art) throw new Error(`role "${role}" names unknown tile "${raw.tile}"`);
  const flags = {
    collides: !!raw.collides,
    blocksSight: !!raw.blocksSight,
    lowCover: !!raw.lowCover,
    shadow: !!raw.shadow,
  };
  // A role may be stricter than the artwork hint (authored cover), but it must
  // never claim a solid art tile is walkable.
  if (art.solid && !flags.collides) {
    throw new Error(
      `role "${role}" -> "${raw.tile}": tileset marks this tile solid but the role is walkable`
    );
  }
  ROLES[role] = { id: art.id, flags, layer: raw.layer, tile: raw.tile };
}

const roleId = (role) => {
  if (!ROLES[role]) throw new Error(`unknown tile role "${role}"`);
  return ROLES[role].id;
};

/** Per-area ground surfaces. Appearance only; never touches walkability. */
const SURFACES = {};
for (const [name, raw] of Object.entries(roleData.surfaces)) {
  if (name.startsWith('_')) continue;
  for (const tile of [raw.base, ...raw.variants]) {
    const art = tileByName.get(tile);
    if (!art) throw new Error(`surface "${name}" names unknown tile "${tile}"`);
    if (art.solid) throw new Error(`surface "${name}" uses solid tile "${tile}"; floors must be walkable`);
  }
  SURFACES[name] = raw;
}

const ARCH = {};
for (const [name, tile] of Object.entries(roleData.architecture)) {
  if (name.startsWith('_')) continue;
  ARCH[name] = tileId(tile);
}

/** Deterministic hash: the same input always produces the same map. */
const hash = (x, y, salt = 0) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  return (h ^ (h >>> 13)) >>> 0;
};

const surfaceTile = (surface, x, y) => {
  const def = SURFACES[surface];
  if (!def) throw new Error(`unknown surface "${surface}"`);
  if (def.variants.length === 0) return tileId(def.base);
  const roll = hash(x, y, 7) % 100;
  if (roll >= def.variantChance) return tileId(def.base);
  return tileId(def.variants[hash(x, y, 11) % def.variants.length]);
};

// ------------------------------------------------------------------- surfaces
// Each region names the AREA it belongs to; the area decides its surface.
const REGIONS = [
  { id: 'alley', area: 'arrivalAlley', x: 5, y: 30, w: 6, h: 9, surface: 'alleyCobble' },
  { id: 'alleyNeck', area: 'arrivalAlley', x: 6, y: 26, w: 4, h: 5, surface: 'alleyCobble' },
  { id: 'market', area: 'marketSquare', x: 4, y: 12, w: 26, h: 15, surface: 'marketPaving' },
  { id: 'gardenLane', area: 'gardenLane', x: 1, y: 24, w: 3, h: 11, surface: 'gardenGrass' },
  { id: 'gardenLink', area: 'gardenLane', x: 4, y: 32, w: 1, h: 3, surface: 'gardenPath' },
  { id: 'yardCorridor', area: 'garageYard', x: 30, y: 20, w: 5, h: 6, surface: 'alleyCobble' },
  { id: 'yard', area: 'garageYard', x: 35, y: 16, w: 19, h: 18, surface: 'yardGravel' },
  { id: 'garage', area: 'garageInterior', x: 38, y: 4, w: 16, h: 11, surface: 'garageFloor' },
  { id: 'garageDoor', area: 'garageInterior', x: 45, y: 15, w: 3, h: 1, surface: 'garageFloor' },
  { id: 'northRoad', area: 'northRoad', x: 46, y: 0, w: 4, h: 4, surface: 'roadDirt' },
  { id: 'rearCorridorV', area: 'serviceCorridor', x: 25, y: 6, w: 4, h: 7, surface: 'serviceBrick' },
  { id: 'rearCorridorH', area: 'serviceCorridor', x: 28, y: 6, w: 11, h: 3, surface: 'serviceBrick' },
  { id: 'bakeryNook', area: 'serviceCorridor', x: 20, y: 8, w: 4, h: 4, surface: 'serviceBrick' },
  { id: 'bakeryLink', area: 'serviceCorridor', x: 23, y: 9, w: 3, h: 2, surface: 'serviceBrick' },
];

/**
 * A garden path strip down the middle of the grass lane, so the lane reads as a
 * residential garden route rather than a green rectangle. Appearance only.
 */
const SURFACE_OVERRIDES = [
  { x: 2, y: 24, w: 1, h: 11, surface: 'gardenPath' },
];

/** Authored dark zones: crouching here accumulates suspicion slowly. */
const SHADOWS = [
  { x: 1, y: 24, w: 3, h: 11 },
  { x: 4, y: 32, w: 1, h: 3 },
  { x: 25, y: 6, w: 4, h: 7 },
  { x: 28, y: 6, w: 11, h: 3 },
  { x: 20, y: 8, w: 4, h: 4 },
  { x: 23, y: 9, w: 3, h: 2 },
  { x: 8, y: 17, w: 5, h: 1 },
  { x: 16, y: 17, w: 5, h: 1 },
  { x: 5, y: 30, w: 2, h: 4 },
  { x: 38, y: 4, w: 4, h: 2 },
  { x: 52, y: 4, w: 2, h: 11 },
];

/** Tile-based cover. The cart and the well are props now, not tiles. */
const COVER = [
  { x: 8, y: 16, w: 5, h: 1, role: 'barrierLow' },
  { x: 16, y: 16, w: 5, h: 1, role: 'barrierLow' },
  { x: 10, y: 21, w: 5, h: 1, role: 'barrierLow' },
  { x: 18, y: 21, w: 5, h: 1, role: 'barrierLow' },
  { x: 11, y: 25, w: 4, h: 1, role: 'barrierLow' },
  { x: 38, y: 28, w: 2, h: 2, role: 'crateHigh' },
  { x: 50, y: 29, w: 2, h: 2, role: 'crateHigh' },
  { x: 41, y: 26, w: 4, h: 1, role: 'barrierLow' },
  { x: 48, y: 20, w: 3, h: 1, role: 'barrierLow' },
  { x: 40, y: 6, w: 2, h: 2, role: 'crateHigh' },
  { x: 50, y: 12, w: 2, h: 2, role: 'crateHigh' },
  { x: 44, y: 9, w: 4, h: 2, role: 'van' },
];

/**
 * Authored decorative accents on the decorBack layer. These are the framed
 * motif tiles, placed deliberately instead of scattered as floor variation.
 */
const ACCENTS = [
  // A small paved medallion under the market fountain. Kept to 2x2: the
  // `checker` tile is high-contrast and reads as a chessboard at any larger size.
  { x: 25, y: 18, w: 2, h: 2, tile: 'accentChecker' },
  // Thresholds on the walkable tile in front of each authored door.
  { x: 9, y: 12, w: 2, h: 1, tile: 'threshold' },
  { x: 14, y: 12, w: 2, h: 1, tile: 'threshold' },
  { x: 5, y: 30, w: 1, h: 1, tile: 'threshold' },
  { x: 37, y: 16, w: 2, h: 1, tile: 'threshold' },
  // Garden-lane greenery, drawn over the lane's dark concealment floor so the
  // residential route reads as a shaded garden without altering the shadow zone.
  { x: 1, y: 24, w: 2, h: 2, tile: 'grass' },
  { x: 1, y: 28, w: 1, h: 3, tile: 'grass' },
  { x: 3, y: 26, w: 1, h: 2, tile: 'grass' },
  { x: 1, y: 33, w: 2, h: 2, tile: 'grass' },
  { x: 3, y: 30, w: 1, h: 1, tile: 'flowerbed' },
  { x: 1, y: 26, w: 1, h: 1, tile: 'flowerbed' },
  { x: 3, y: 33, w: 1, h: 1, tile: 'flowerbed' },
  // Hedge dressing along the market's shaded north-west corner.
  { x: 4, y: 17, w: 2, h: 1, tile: 'hedge' },

  // The scratched sigils: the recurring symbol that ties the levels together.
  { x: 43, y: 11, w: 1, h: 1, tile: 'accentInlay' },
  { x: 48, y: 8, w: 1, h: 1, tile: 'accentInlay' },
];

/**
 * Authored facade openings. `face` is the wall tile the opening replaces, found
 * by walking the 1-tile-thick wall ring. Appearance only: the collision layer
 * still blocks these tiles, so a window or door changes nothing mechanically.
 */
const FACADE_DOORS = [
  // Market square shopfronts, on the north wall - the only wall face a
  // top-down camera shows, since it has walkable floor directly below it.
  { x: 9, y: 11 },
  { x: 10, y: 11 },
  { x: 14, y: 11 },
  { x: 15, y: 11 },
  // A house door onto the arrival alley.
  { x: 5, y: 29 },
  // Service door onto the garage yard.
  { x: 37, y: 15 },
  { x: 38, y: 15 },
];

// ---------------------------------------------------------------------- props
const propByName = new Map();
for (const [area, list] of Object.entries(propData)) {
  if (!Array.isArray(list)) continue;
  for (const prop of list) {
    if (typeof prop !== 'object' || prop === null) continue;
    propByName.set(`${area}.${prop.name}`, { area, ...prop });
  }
}

/**
 * Prop placements. `tx`/`ty` are the tile the prop's base sits in; `dx` is the
 * anchor's pixel offset inside that tile (8 = tile centre, 16 = the boundary
 * with the next tile, which aligns a 32px prop to a two-tile block).
 */
const PROP_PLACEMENTS = [
  // --- market square ---
  { prop: 'valcendre.fountain', tx: 25, ty: 19, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 7, ty: 24, dx: 16 },
  { prop: 'valcendre.tree', tx: 6, ty: 20, dx: 8 },
  { prop: 'valcendre.tree', tx: 28, ty: 15, dx: 8 },
  { prop: 'valcendre.bench', tx: 14, ty: 24, dx: 16 },
  { prop: 'valcendre.bench', tx: 22, ty: 19, dx: 16 },
  { prop: 'valcendre.barrels', tx: 27, ty: 22, dx: 16 },
  { prop: 'valcendre.flower_box', tx: 4, ty: 14, dx: 16 },
  { prop: 'valcendre.flower_box', tx: 17, ty: 13, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 22, ty: 13, dx: 8 },
  { prop: 'valcendre.flower_pot', tx: 11, ty: 13, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 22, ty: 25, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 12, ty: 18, dx: 8 },
  { prop: 'valcendre.clothesline', tx: 9, ty: 15, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 16, ty: 20, dx: 16 },
  { prop: 'valcendre.french_flag', tx: 20, ty: 13, dx: 8 },

  // --- arrival alley ---
  { prop: 'valcendre.clothesline', tx: 7, ty: 32, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 9, ty: 37, dx: 8 },
  { prop: 'valcendre.barrels', tx: 9, ty: 34, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 5, ty: 36, dx: 8 },

  // --- west garden lane ---
  { prop: 'valcendre.tree', tx: 2, ty: 27, dx: 8 },
  { prop: 'valcendre.village_cross', tx: 2, ty: 31, dx: 8 },
  { prop: 'valcendre.flower_box', tx: 1, ty: 25, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 3, ty: 34, dx: 8 },

  // --- bakery rear nook and service corridor ---
  { prop: 'valcendre.flower_box', tx: 20, ty: 11, dx: 16 },
  { prop: 'valcendre.barrels', tx: 22, ty: 9, dx: 16 },
  { prop: 'valcendre.barrels', tx: 36, ty: 8, dx: 16 },
  { prop: 'valcendre.clothesline', tx: 26, ty: 8, dx: 16 },

  // --- yard corridor ---
  { prop: 'valcendre.stone_cover', tx: 31, ty: 22, dx: 16 },

  // --- transport garage yard ---
  { prop: 'valcendre.barrels', tx: 44, ty: 24, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 41, ty: 30, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 47, ty: 32, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 36, ty: 20, dx: 8 },
  { prop: 'valcendre.lamppost', tx: 52, ty: 25, dx: 8 },
  { prop: 'valcendre.barrels', tx: 50, ty: 18, dx: 16 },
  { prop: 'valcendre.hay_cart', tx: 38, ty: 17, dx: 16 },

  // --- north road ---
  { prop: 'valcendre.village_cross', tx: 48, ty: 2, dx: 8 },
];

// ------------------------------------------------------------------- objects
const px = (t) => t * TS + TS / 2;

const OBJECTS = [
  pt('spawn', 'spawn', 7, 36, { facing: 0 }),

  ...route('l1', [
    [7, 26],
    [8, 31],
  ]),
  ...route('l2', [
    [10, 14],
    [24, 14],
    [24, 24],
    [10, 24],
  ]),
  ...route('l3', [
    [40, 24],
    [46, 18],
    [46, 12],
    [39, 7],
  ]),

  pt('enemy_l1', 'enemy', 7, 28, { kind: 'lookout', route: 'l1', facing: 90 }),
  pt('enemy_l2', 'enemy', 10, 14, { kind: 'lookout', route: 'l2', facing: 0 }),
  pt('enemy_l3', 'enemy', 40, 24, { kind: 'lookout', route: 'l3', facing: 270 }),

  pt('item_medkit_market', 'item', 13, 19, { kind: 'medkit' }),
  pt('item_ammo_yard', 'item', 36, 22, { kind: 'ammo_pistol' }),
  pt('item_ammo_rear', 'item', 26, 9, { kind: 'ammo_pistol' }),

  pt('interact_radio', 'interactable', 23, 14, {
    kind: 'radio',
    prompt: 'E - SWITCH ON RADIO',
    noise: 128,
    oneShot: true,
  }),
  pt('interact_van', 'interactable', 43, 10, {
    kind: 'van',
    prompt: 'E - EXAMINE TRANSPORT',
    objective: 'V1',
    glint: true,
  }),
  pt('interact_log', 'interactable', 48, 10, {
    kind: 'log',
    prompt: 'E - READ TRANSPORT LOG',
    objective: 'V2',
    glint: true,
    requires: 'V1',
  }),
  pt('interact_sigil', 'interactable', 49, 8, {
    kind: 'sigil',
    prompt: 'E - EXAMINE INSCRIPTION',
    objective: 'V3',
    glint: true,
    requires: 'V2',
  }),
  pt('interact_hymn', 'interactable', 21, 9, {
    kind: 'hymn',
    prompt: 'E - READ TORN PAGE',
  }),

  pt('checkpoint_entry', 'checkpoint', 7, 35, { id: 'cp_entry' }),
  pt('checkpoint_log', 'checkpoint', 48, 12, { id: 'cp_log' }),

  rect('exit_north', 'exit', 46, 0, 4, 2, { to: 'estate', requires: 'V2' }),

  // Generated-placeholder decor. The van's gameplay collision comes from the
  // `van` cover tiles beneath it; this 64x32 sprite covers those four-by-two
  // tiles exactly, so no cover tile is left visible under it.
  {
    name: 'decor_van',
    type: 'decor',
    point: true,
    x: 46 * TS,
    y: 11 * TS,
    width: 0,
    height: 0,
    props: { sprite: 'prop_van', depth: 'sorted' },
  },
];

function pt(name, type, tx, ty, props = {}) {
  return { name, type, point: true, x: px(tx), y: px(ty), width: 0, height: 0, props };
}
function rect(name, type, tx, ty, tw, th, props = {}) {
  return { name, type, x: tx * TS, y: ty * TS, width: tw * TS, height: th * TS, props };
}
function route(id, points) {
  return points.map(([tx, ty], i) =>
    pt(`wp_${id}_${i}`, 'waypoint', tx, ty, { route: id, index: i })
  );
}

let propIndex = 0;
for (const placement of PROP_PLACEMENTS) {
  const def = propByName.get(placement.prop);
  if (!def) throw new Error(`unknown prop "${placement.prop}"`);
  const dx = placement.dx ?? def.width / 2;
  OBJECTS.push({
    name: `prop_${def.name}_${propIndex++}`,
    type: 'prop',
    point: true,
    x: placement.tx * TS + dx,
    y: placement.ty * TS + TS,
    width: 0,
    height: 0,
    props: { area: def.area, prop: def.name },
  });
}

// ------------------------------------------------------------------ rasterise
const blank = () => new Array(W * H).fill(0);
const idx = (x, y) => y * W + x;

const walkable = new Array(W * H).fill(false);
const areaOf = new Array(W * H).fill(null);
const surfaceOf = new Array(W * H).fill(null);

for (const r of REGIONS) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      assertInside(r.id, x, y);
      walkable[idx(x, y)] = true;
      areaOf[idx(x, y)] = r.area;
      surfaceOf[idx(x, y)] = r.surface;
    }
  }
}
for (const o of SURFACE_OVERRIDES) {
  for (let y = o.y; y < o.y + o.h; y++)
    for (let x = o.x; x < o.x + o.w; x++)
      if (walkable[idx(x, y)]) surfaceOf[idx(x, y)] = o.surface;
}

// ---- floor: per-area surfaces, plus the dark fill beyond the buildings.
const floor = blank();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    floor[idx(x, y)] = walkable[idx(x, y)]
      ? surfaceTile(surfaceOf[idx(x, y)], x, y) + 1
      : surfaceTile('voidFill', x, y) + 1;
  }
}

// ---- shadow zones: gameplay flag, plus a darker floor where they apply.
const shadowZones = blank();
for (const s of SHADOWS) {
  stamp(s, roleId('shadow'), shadowZones, true);
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++)
      if (walkable[idx(x, y)]) floor[idx(x, y)] = surfaceTile('shadowFloor', x, y) + 1;
}

// ---- collision: INVISIBLE. One blocker tile per non-walkable tile.
const collision = blank();
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (!walkable[idx(x, y)]) collision[idx(x, y)] = roleId('blocker') + 1;

/**
 * architecture: VISIBLE, not a collider.
 *
 * Painted by Chebyshev distance to the nearest walkable tile, so the ring of
 * identical wall tiles becomes a street of buildings: wall face, roof edge, red
 * roof, darkness. Windows and doors are placed on south-facing faces, which are
 * the ones the top-down camera actually shows.
 */
const ROOF_EDGE_DIST = 2;
const ROOF_DEPTH = 4;
const architecture = blank();
const doorSet = new Set(FACADE_DOORS.map((d) => `${d.x},${d.y}`));

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (walkable[idx(x, y)]) continue;
    const dist = distanceToWalkable(x, y, ROOF_DEPTH + 1);
    if (dist === 1) {
      const openSouth = isWalkable(x, y + 1);
      const openNorth = isWalkable(x, y - 1);
      let tile = openSouth ? ARCH.wallSouth : openNorth ? ARCH.wallNorth : ARCH.wallFace;
      if (openSouth) {
        if (doorSet.has(`${x},${y}`)) tile = ARCH.door;
        // Deterministic window rhythm along south-facing facades.
        else if ((x + y * 3) % 5 === 2) tile = ARCH.window;
      }
      architecture[idx(x, y)] = tile + 1;
    } else if (dist === ROOF_EDGE_DIST) {
      architecture[idx(x, y)] = ARCH.roofEdge + 1;
    } else if (dist <= ROOF_DEPTH) {
      architecture[idx(x, y)] = ARCH.roof + 1;
    }
    // Beyond ROOF_DEPTH the floor layer's dark fill is all that shows.
  }
}

function isWalkable(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H && walkable[idx(x, y)];
}
function distanceToWalkable(x, y, limit) {
  for (let r = 1; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkable(x + dx, y + dy)) return r;
      }
  }
  return limit + 1;
}

// ---- cover: gameplay.
const cover = blank();
for (const c of COVER) stamp(c, roleId(c.role), cover, true);

// ---- decorBack: authored accents, below characters, appearance only.
const decorBack = blank();
for (const a of ACCENTS) {
  if (!(a.tile in ARCH)) throw new Error(`accent names unknown architecture tile "${a.tile}"`);
  for (let y = a.y; y < a.y + a.h; y++)
    for (let x = a.x; x < a.x + a.w; x++) {
      assertInside(`accent@${x},${y}`, x, y);
      decorBack[idx(x, y)] = ARCH[a.tile] + 1;
    }
}

// decorFront stays empty: the tileset has no overhead art, so foreground
// decoration is handled by front-depth props instead.
const decorFront = blank();

/**
 * propCollision: never rendered, but merged into the gameplay grid and used as a
 * physics collider. This is how a prop provides cover without a duplicate cover
 * tile being drawn under its sprite.
 *
 * A tile is claimed only when the footprint genuinely overlaps it - at least 6px
 * horizontally and 4px vertically - so a thin tree trunk cannot silently become
 * a full 16px wall.
 */
const MIN_OVERLAP_X = 6;
const MIN_OVERLAP_Y = 4;
const propCollision = blank();
const propCollisionRoles = [];

for (const placement of PROP_PLACEMENTS) {
  const def = propByName.get(placement.prop);
  if (!def.footprint || !def.blocksMove) continue;
  const dx = placement.dx ?? def.width / 2;
  const anchorX = placement.tx * TS + dx;
  const anchorY = placement.ty * TS + TS;
  const box = {
    x0: anchorX - def.footprint.width / 2,
    x1: anchorX + def.footprint.width / 2,
    y0: anchorY - def.footprint.height,
    y1: anchorY,
  };
  const role = def.cover === 'low' ? 'barrierLow' : def.blocksSight ? 'crateHigh' : 'blocker';

  let claimed = 0;
  for (let ty = Math.floor(box.y0 / TS); ty <= Math.floor((box.y1 - 1) / TS); ty++) {
    for (let tx = Math.floor(box.x0 / TS); tx <= Math.floor((box.x1 - 1) / TS); tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const overlapX = Math.min(box.x1, (tx + 1) * TS) - Math.max(box.x0, tx * TS);
      const overlapY = Math.min(box.y1, (ty + 1) * TS) - Math.max(box.y0, ty * TS);
      if (overlapX < MIN_OVERLAP_X || overlapY < MIN_OVERLAP_Y) continue;
      if (!walkable[idx(tx, ty)]) continue; // already a wall; nothing to add
      propCollision[idx(tx, ty)] = roleId(role) + 1;
      claimed++;
    }
  }
  propCollisionRoles.push({ prop: placement.prop, role, claimed });
}

function stamp(r, tile, target, requireFloor) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      assertInside(`stamp@${x},${y}`, x, y);
      if (requireFloor && !walkable[idx(x, y)])
        throw new Error(`tile ${x},${y} (tile id ${tile}) is not on carved floor`);
      target[idx(x, y)] = tile + 1;
    }
  }
}
function assertInside(what, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`${what}: ${x},${y} out of bounds`);
}

// ------------------------------------------------------- authoring guarantees
const flagsForTile = new Map();
for (const def of Object.values(ROLES)) flagsForTile.set(def.id, def.flags);

const solid = new Array(W * H).fill(false);
for (let i = 0; i < solid.length; i++) {
  const layers = [cover[i], propCollision[i]];
  const blocked = layers.some((gid) => gid && flagsForTile.get(gid - 1)?.collides);
  solid[i] = !walkable[i] || blocked;
}

const spawnObj = OBJECTS.find((o) => o.type === 'spawn');
const reach = floodFill(Math.floor(spawnObj.x / TS), Math.floor(spawnObj.y / TS));

let orphans = 0;
for (let i = 0; i < solid.length; i++) if (!solid[i] && !reach[i]) orphans++;
if (orphans > 0) throw new Error(`${orphans} walkable tiles are unreachable from spawn`);

for (const o of OBJECTS) {
  if (o.type === 'exit' || o.type === 'prop' || o.type === 'decor') continue;
  const tx = Math.floor(o.x / TS);
  const ty = Math.floor(o.y / TS);
  if (!reach[idx(tx, ty)]) throw new Error(`object ${o.name} at tile ${tx},${ty} is unreachable`);
}

const exitObj = OBJECTS.find((o) => o.type === 'exit');
let exitOk = false;
for (let y = exitObj.y / TS; y < (exitObj.y + exitObj.height) / TS; y++)
  for (let x = exitObj.x / TS; x < (exitObj.x + exitObj.width) / TS; x++)
    if (reach[idx(x, y)]) exitOk = true;
if (!exitOk) throw new Error('exit rectangle is unreachable');

// Facade openings must land on the 1-tile wall ring, or they would be painted
// into roof tiles where no one can see them.
for (const d of FACADE_DOORS) {
  assertInside(`door@${d.x},${d.y}`, d.x, d.y);
  if (walkable[idx(d.x, d.y)]) throw new Error(`facade door ${d.x},${d.y} is on walkable floor`);
  if (distanceToWalkable(d.x, d.y, 2) !== 1)
    throw new Error(`facade door ${d.x},${d.y} is not on the wall face ring`);
  if (!isWalkable(d.x, d.y + 1))
    throw new Error(`facade door ${d.x},${d.y} does not face south onto walkable floor`);
}

function floodFill(sx, sy) {
  const seen = new Array(W * H).fill(false);
  if (solid[idx(sx, sy)]) throw new Error(`flood seed ${sx},${sy} is solid`);
  const stack = [[sx, sy]];
  seen[idx(sx, sy)] = true;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = idx(nx, ny);
      if (seen[i] || solid[i]) continue;
      seen[i] = true;
      stack.push([nx, ny]);
    }
  }
  return seen;
}

// ----------------------------------------------------------------- emit Tiled
let layerId = 1;
const tileLayer = (name, data, visible = true, opacity = 1) => ({
  id: layerId++,
  name,
  type: 'tilelayer',
  data,
  width: W,
  height: H,
  x: 0,
  y: 0,
  opacity,
  visible,
  properties: [],
});

const tiledProps = (obj) =>
  Object.entries(obj).map(([name, value]) => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'float' : 'string',
    value,
  }));

let objectId = 1;
const objectLayer = {
  id: layerId++,
  name: 'objects',
  type: 'objectgroup',
  draworder: 'index',
  opacity: 1,
  visible: true,
  x: 0,
  y: 0,
  properties: [],
  objects: OBJECTS.map((o) => ({
    id: objectId++,
    name: o.name,
    type: o.type,
    class: o.type,
    x: o.x,
    y: o.y,
    width: o.width ?? 0,
    height: o.height ?? 0,
    rotation: 0,
    visible: true,
    ...(o.point ? { point: true } : {}),
    properties: tiledProps(o.props ?? {}),
  })),
};

// Per-tile gameplay properties, emitted only for tiles a gameplay role uses.
const tileProperties = [];
for (const def of Object.values(ROLES)) {
  const entries = Object.entries(def.flags).filter(([, v]) => v);
  if (entries.length === 0) continue;
  const existing = tileProperties.find((t) => t.id === def.id);
  if (existing) continue;
  tileProperties.push({
    id: def.id,
    properties: entries.map(([name, value]) => ({ name, type: 'bool', value })),
  });
}

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  compressionlevel: -1,
  width: W,
  height: H,
  tilewidth: TS,
  tileheight: TS,
  nextlayerid: layerId,
  nextobjectid: objectId,
  properties: tiledProps({ level: 'village', displayName: 'Valcendre', stage: STAGE }),
  layers: [
    tileLayer('floor', floor),
    tileLayer('decorBack', decorBack),
    tileLayer('architecture', architecture),
    tileLayer('collision', collision, false),
    tileLayer('cover', cover),
    tileLayer('propCollision', propCollision, false),
    tileLayer('shadowZones', shadowZones, false),
    tileLayer('decorFront', decorFront),
    objectLayer,
  ],
  tilesets: [
    {
      firstgid: 1,
      name: `${STAGE}_tiles`,
      image: `../environments/${STAGE}_tiles_16x16.png`,
      imagewidth: tilesetMeta.columns * TS,
      imageheight: (tilesetMeta.tilecount / tilesetMeta.columns) * TS,
      tilewidth: TS,
      tileheight: TS,
      tilecount: tilesetMeta.tilecount,
      columns: tilesetMeta.columns,
      margin: 0,
      spacing: 0,
      tiles: tileProperties,
    },
  ],
};

const out = resolve(ROOT, OUT);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map, null, 1) + '\n');

const walkableCount = walkable.filter(Boolean).length;
const areaCounts = {};
for (let i = 0; i < areaOf.length; i++)
  if (areaOf[i]) areaCounts[areaOf[i]] = (areaCounts[areaOf[i]] ?? 0) + 1;
const windows = architecture.filter((g) => g === ARCH.window + 1).length;
const doors = architecture.filter((g) => g === ARCH.door + 1).length;

console.log(
  `village.json: ${W}x${H} tiles (${W * TS}x${H * TS} px), ${walkableCount} walkable, ` +
    `${OBJECTS.length} objects (${PROP_PLACEMENTS.length} props), ` +
    `${propCollision.filter(Boolean).length} prop-collision tiles, ` +
    `${windows} windows, ${doors} doors. All reachable.`
);
console.log(
  '  areas: ' +
    Object.entries(areaCounts)
      .map(([a, n]) => `${a} ${n}`)
      .join(', ')
);
for (const r of propCollisionRoles)
  if (r.claimed === 0)
    console.log(`  note: ${r.prop} footprint claims no tile (decorative in practice)`);
