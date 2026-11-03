#!/usr/bin/env node
/**
 * Builds assets/maps/village.json (Tiled 1.10 JSON) for the Phase A vertical slice:
 * Valcendre's arrival alley, market square and transport garage as one contiguous map.
 *
 * The geometry below is AUTHORED, not generated: every region, cover piece, patrol
 * waypoint and item position is written out by hand. This script exists only so the
 * hand-authored numbers stay readable and the 2400-tile Tiled arrays stay in sync.
 *
 * Re-run with `npm run map`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const W = 60;
const H = 40;
const TS = 16;

// ---------------------------------------------------------------- tile indices
const T = {
  VOID: 0,
  COBBLE_A: 1,
  COBBLE_B: 2,
  MARKET_DIRT: 3,
  SHADOW: 4,
  CONCRETE: 5,
  ROAD: 6,
  WALL: 7,
  CRATE_HIGH: 8,
  BARRIER_LOW: 9,
  WELL: 10,
  CART: 11,
  SIGIL: 12,
  AWNING: 13,
  GRASS: 14,
  VAN: 15,
};
const TILE_COUNT = 16;

/** Per-tile properties consumed by src/core/Grid.ts. */
const TILE_PROPS = {
  [T.VOID]: { collides: true, blocksSight: true },
  [T.WALL]: { collides: true, blocksSight: true },
  [T.CRATE_HIGH]: { collides: true, blocksSight: true, highCover: true },
  [T.WELL]: { collides: true, blocksSight: true, highCover: true },
  [T.CART]: { collides: true, blocksSight: true, highCover: true },
  [T.VAN]: { collides: true, blocksSight: true, highCover: true },
  [T.BARRIER_LOW]: { collides: true, lowCover: true },
  [T.SHADOW]: { shadow: true },
};

// ------------------------------------------------------------------- surfaces
// Each carved region names the floor tile it paints.
const REGIONS = [
  { id: 'alley', x: 5, y: 30, w: 6, h: 9, tile: T.COBBLE_A },
  { id: 'alleyNeck', x: 6, y: 26, w: 4, h: 5, tile: T.COBBLE_A },
  { id: 'market', x: 4, y: 12, w: 26, h: 15, tile: T.MARKET_DIRT },
  { id: 'gardenLane', x: 1, y: 24, w: 3, h: 11, tile: T.COBBLE_B },
  { id: 'gardenLink', x: 4, y: 32, w: 1, h: 3, tile: T.COBBLE_B },
  { id: 'yardCorridor', x: 30, y: 20, w: 5, h: 6, tile: T.COBBLE_A },
  { id: 'yard', x: 35, y: 16, w: 19, h: 18, tile: T.CONCRETE },
  { id: 'garage', x: 38, y: 4, w: 16, h: 11, tile: T.CONCRETE },
  { id: 'garageDoor', x: 45, y: 15, w: 3, h: 1, tile: T.CONCRETE },
  { id: 'northRoad', x: 46, y: 0, w: 4, h: 4, tile: T.ROAD },
  { id: 'rearCorridorV', x: 25, y: 6, w: 4, h: 7, tile: T.COBBLE_B },
  { id: 'rearCorridorH', x: 28, y: 6, w: 11, h: 3, tile: T.COBBLE_B },
  { id: 'bakeryNook', x: 20, y: 8, w: 4, h: 4, tile: T.COBBLE_B },
  { id: 'bakeryLink', x: 23, y: 9, w: 3, h: 2, tile: T.COBBLE_B },
];

/** Authored dark/shadow zones (crouching here accumulates suspicion slowly). */
const SHADOWS = [
  { x: 1, y: 24, w: 3, h: 11 }, // west garden lane
  { x: 4, y: 32, w: 1, h: 3 },
  { x: 25, y: 6, w: 4, h: 7 }, // rear service corridor
  { x: 28, y: 6, w: 11, h: 3 },
  { x: 20, y: 8, w: 4, h: 4 }, // bakery rear nook
  { x: 23, y: 9, w: 3, h: 2 },
  { x: 8, y: 17, w: 5, h: 1 }, // under the market awnings
  { x: 16, y: 17, w: 5, h: 1 },
  { x: 5, y: 30, w: 2, h: 4 }, // alley building shade
  { x: 38, y: 4, w: 4, h: 2 }, // garage back corners
  { x: 52, y: 4, w: 2, h: 11 },
];

/** cover layer: solid props. High blocks all sight; low blocks sight of a crouched player only. */
const COVER = [
  // market stalls
  { x: 8, y: 16, w: 5, h: 1, tile: T.BARRIER_LOW },
  { x: 16, y: 16, w: 5, h: 1, tile: T.BARRIER_LOW },
  { x: 10, y: 21, w: 5, h: 1, tile: T.BARRIER_LOW },
  { x: 18, y: 21, w: 5, h: 1, tile: T.BARRIER_LOW },
  { x: 11, y: 25, w: 4, h: 1, tile: T.BARRIER_LOW },
  { x: 25, y: 18, w: 2, h: 2, tile: T.WELL },
  { x: 7, y: 24, w: 2, h: 1, tile: T.CART },
  // garage yard
  { x: 38, y: 28, w: 2, h: 2, tile: T.CRATE_HIGH },
  { x: 50, y: 29, w: 2, h: 2, tile: T.CRATE_HIGH },
  { x: 44, y: 24, w: 2, h: 1, tile: T.CRATE_HIGH },
  { x: 41, y: 26, w: 4, h: 1, tile: T.BARRIER_LOW },
  { x: 48, y: 20, w: 3, h: 1, tile: T.BARRIER_LOW },
  // garage interior
  { x: 40, y: 6, w: 2, h: 2, tile: T.CRATE_HIGH },
  { x: 50, y: 12, w: 2, h: 2, tile: T.CRATE_HIGH },
  { x: 44, y: 9, w: 4, h: 2, tile: T.VAN }, // Suzanne's transport
];

/** decorBack: below characters. decorFront: above characters. Neither collides. */
const DECOR_BACK = [
  { x: 1, y: 24, w: 3, h: 2, tile: T.GRASS },
  { x: 1, y: 33, w: 3, h: 2, tile: T.GRASS },
  { x: 35, y: 16, w: 2, h: 1, tile: T.GRASS },
  { x: 43, y: 11, w: 1, h: 1, tile: T.SIGIL }, // scratched sigil beside the van
  { x: 48, y: 8, w: 1, h: 1, tile: T.SIGIL },
];
const DECOR_FRONT = [
  { x: 8, y: 15, w: 5, h: 1, tile: T.AWNING },
  { x: 16, y: 15, w: 5, h: 1, tile: T.AWNING },
];

// ------------------------------------------------------------------- objects
const px = (t) => t * TS + TS / 2;

const OBJECTS = [
  pt('spawn', 'spawn', 7, 36, { facing: 0 }),

  // --- patrol waypoint graphs (authored, looping) ---
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

  // --- enemies ---
  pt('enemy_l1', 'enemy', 7, 28, { kind: 'lookout', route: 'l1', facing: 90 }),
  pt('enemy_l2', 'enemy', 10, 14, { kind: 'lookout', route: 'l2', facing: 0 }),
  pt('enemy_l3', 'enemy', 40, 24, { kind: 'lookout', route: 'l3', facing: 270 }),

  // --- supplies (fixed, authored; the direct route reaches one of each) ---
  pt('item_medkit_market', 'item', 13, 19, { kind: 'medkit' }),
  pt('item_ammo_yard', 'item', 36, 22, { kind: 'ammo_pistol' }),
  pt('item_ammo_rear', 'item', 26, 9, { kind: 'ammo_pistol' }),

  // --- interactables ---
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

  // --- checkpoints ---
  pt('checkpoint_entry', 'checkpoint', 7, 35, { id: 'cp_entry' }),
  pt('checkpoint_log', 'checkpoint', 48, 12, { id: 'cp_log' }),

  // --- exit ---
  rect('exit_north', 'exit', 46, 0, 4, 2, { to: 'estate', requires: 'V2' }),
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

// ------------------------------------------------------------------ rasterise
const blank = () => new Array(W * H).fill(0);
const idx = (x, y) => y * W + x;

const walkable = new Array(W * H).fill(false);
const floor = blank();
for (const r of REGIONS) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      assertInside(r.id, x, y);
      walkable[idx(x, y)] = true;
      // Checkerboard the cobbles so the 16px grid stays legible.
      const alt = r.tile === T.COBBLE_A && (x + y) % 7 === 0 ? T.COBBLE_B : r.tile;
      floor[idx(x, y)] = alt + 1;
    }
  }
}

const shadowZones = blank();
for (const s of SHADOWS) {
  stamp(s, T.SHADOW, shadowZones, true);
  // Shadowed ground also reads darker in the floor layer.
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++)
      if (walkable[idx(x, y)]) floor[idx(x, y)] = T.SHADOW + 1;
}

// collision = the complement of the carved floor. Tiles touching floor get the
// limestone wall face; everything further out is dark void.
const collision = blank();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (walkable[idx(x, y)]) continue;
    collision[idx(x, y)] = (touchesFloor(x, y) ? T.WALL : T.VOID) + 1;
  }
}

const cover = blank();
for (const c of COVER) stamp(c, c.tile, cover, true);

const decorBack = blank();
for (const d of DECOR_BACK) stamp(d, d.tile, decorBack, true);
const decorFront = blank();
for (const d of DECOR_FRONT) stamp(d, d.tile, decorFront, false);

function stamp(r, tile, target, requireFloor) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      assertInside(`stamp@${x},${y}`, x, y);
      if (requireFloor && !walkable[idx(x, y)])
        throw new Error(`tile ${x},${y} (tile ${tile}) is not on carved floor`);
      target[idx(x, y)] = tile + 1;
    }
  }
}
function touchesFloor(x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && walkable[idx(nx, ny)]) return true;
    }
  return false;
}
function assertInside(what, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`${what}: ${x},${y} out of bounds`);
}

// ------------------------------------------------------- authoring guarantees
// Solid cover must never seal a walkable region off: flood fill from spawn and
// confirm every object anchor and every walkable tile that isn't cover is reached.
const solid = new Array(W * H).fill(false);
for (let i = 0; i < solid.length; i++) {
  const covered = cover[i] ? cover[i] - 1 : -1;
  solid[i] = !walkable[i] || (covered >= 0 && !!TILE_PROPS[covered]?.collides);
}
const spawnObj = OBJECTS.find((o) => o.type === 'spawn');
const reach = floodFill(Math.floor(spawnObj.x / TS), Math.floor(spawnObj.y / TS));

let orphans = 0;
for (let i = 0; i < solid.length; i++) if (!solid[i] && !reach[i]) orphans++;
if (orphans > 0) throw new Error(`${orphans} walkable tiles are unreachable from spawn`);

for (const o of OBJECTS) {
  if (o.type === 'exit') continue; // exit is a trigger rectangle, walked into from the road
  const tx = Math.floor(o.x / TS);
  const ty = Math.floor(o.y / TS);
  if (!reach[idx(tx, ty)]) throw new Error(`object ${o.name} at tile ${tx},${ty} is unreachable`);
}
// The exit rectangle must have at least one reachable tile.
const exitObj = OBJECTS.find((o) => o.type === 'exit');
let exitOk = false;
for (let y = exitObj.y / TS; y < (exitObj.y + exitObj.height) / TS; y++)
  for (let x = exitObj.x / TS; x < (exitObj.x + exitObj.width) / TS; x++)
    if (reach[idx(x, y)]) exitOk = true;
if (!exitOk) throw new Error('exit rectangle is unreachable');

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
  properties: tiledProps({ level: 'village', displayName: 'Valcendre' }),
  layers: [
    tileLayer('floor', floor),
    tileLayer('decorBack', decorBack),
    tileLayer('collision', collision),
    tileLayer('cover', cover),
    tileLayer('shadowZones', shadowZones, false),
    tileLayer('decorFront', decorFront, true, 0.9),
    objectLayer,
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      image: 'tilesets/tiles.png',
      imagewidth: TILE_COUNT * TS,
      imageheight: TS,
      tilewidth: TS,
      tileheight: TS,
      tilecount: TILE_COUNT,
      columns: TILE_COUNT,
      margin: 0,
      spacing: 0,
      tiles: Object.entries(TILE_PROPS).map(([id, props]) => ({
        id: Number(id),
        properties: tiledProps(props),
      })),
    },
  ],
};

const out = resolve(ROOT, 'assets/maps/village.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map, null, 1) + '\n');

const walkableCount = walkable.filter(Boolean).length;
console.log(
  `village.json: ${W}x${H} tiles (${W * TS}x${H * TS} px), ` +
    `${walkableCount} walkable tiles, ${OBJECTS.length} objects, all reachable.`
);
