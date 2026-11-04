#!/usr/bin/env node
/**
 * Builds public/assets/maps/village.json (Tiled 1.10 JSON) for the Valcendre
 * vertical slice, against the PRODUCTION tileset.
 *
 * The geometry is AUTHORED, not generated: every region, cover piece, prop,
 * patrol waypoint and object position below is written out by hand. This script
 * exists so the hand-authored numbers stay readable and the 2400-tile Tiled
 * arrays stay in sync.
 *
 * It is also the gate that keeps art and gameplay honest. It fails the build if:
 *   - a semantic role names a tile the supplied tileset does not define;
 *   - a role's gameplay flags contradict the tileset's own solid/cover hints;
 *   - a floor-variation tile is actually solid;
 *   - a prop, cover piece or wall makes any walkable tile or object anchor
 *     unreachable from the spawn point.
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

/** role -> { id, flags, layer }, validated against the artwork's own hints. */
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
  // never claim a solid art tile is walkable - that would let the player walk
  // through something that visibly blocks the way.
  if (art.solid && !flags.collides) {
    throw new Error(
      `role "${role}" -> "${raw.tile}": tileset marks this tile solid but the role is walkable`
    );
  }
  if (art.occludes_vision && !flags.blocksSight && !flags.lowCover) {
    throw new Error(
      `role "${role}" -> "${raw.tile}": tileset marks this tile vision-occluding but the role does not block sight`
    );
  }
  ROLES[role] = { id: art.id, flags, layer: raw.layer, tile: raw.tile };
}

for (const [surface, names] of Object.entries(roleData.floorVariants)) {
  for (const name of names) {
    const art = tileByName.get(name);
    if (!art) throw new Error(`floor variant "${name}" (${surface}) is not in the tileset`);
    if (art.solid) throw new Error(`floor variant "${name}" (${surface}) is solid; floors must be walkable`);
  }
}

const roleId = (role) => {
  if (!ROLES[role]) throw new Error(`unknown tile role "${role}"`);
  return ROLES[role].id;
};

/** Deterministic floor variation: same input always produces the same map. */
const variantFor = (surface, x, y) => {
  const names = roleData.floorVariants[surface];
  if (!names) return roleId(surface);
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  // Keep the base tile dominant so surfaces stay readable at 480x270.
  const pick = h % 100 < 70 ? 0 : 1 + (h % (names.length - 1));
  return tileId(names[pick]);
};

// ------------------------------------------------------------------- surfaces
const REGIONS = [
  { id: 'alley', x: 5, y: 30, w: 6, h: 9, surface: 'cobble' },
  { id: 'alleyNeck', x: 6, y: 26, w: 4, h: 5, surface: 'cobble' },
  { id: 'market', x: 4, y: 12, w: 26, h: 15, surface: 'marketDirt' },
  { id: 'gardenLane', x: 1, y: 24, w: 3, h: 11, surface: 'cobbleAlt' },
  { id: 'gardenLink', x: 4, y: 32, w: 1, h: 3, surface: 'cobbleAlt' },
  { id: 'yardCorridor', x: 30, y: 20, w: 5, h: 6, surface: 'cobble' },
  { id: 'yard', x: 35, y: 16, w: 19, h: 18, surface: 'concrete' },
  { id: 'garage', x: 38, y: 4, w: 16, h: 11, surface: 'concrete' },
  { id: 'garageDoor', x: 45, y: 15, w: 3, h: 1, surface: 'concrete' },
  { id: 'northRoad', x: 46, y: 0, w: 4, h: 4, surface: 'road' },
  { id: 'rearCorridorV', x: 25, y: 6, w: 4, h: 7, surface: 'cobbleAlt' },
  { id: 'rearCorridorH', x: 28, y: 6, w: 11, h: 3, surface: 'cobbleAlt' },
  { id: 'bakeryNook', x: 20, y: 8, w: 4, h: 4, surface: 'cobbleAlt' },
  { id: 'bakeryLink', x: 23, y: 9, w: 3, h: 2, surface: 'cobbleAlt' },
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

/**
 * Tile-based cover. The market stall counters stay as `cover_low` tiles because
 * the tileset draws that tile as a purpose-made waist-height counter; the cart
 * and the well are now PROPS instead (hay_cart, fountain), so their tiles are
 * gone from this list - no duplicate visuals, no duplicated collision.
 */
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

const DECOR_BACK = [
  { x: 1, y: 24, w: 3, h: 2, role: 'grass' },
  { x: 1, y: 33, w: 3, h: 2, role: 'grass' },
  { x: 35, y: 16, w: 2, h: 1, role: 'grass' },
  { x: 43, y: 11, w: 1, h: 1, role: 'sigil' },
  { x: 48, y: 8, w: 1, h: 1, role: 'sigil' },
];

// ---------------------------------------------------------------------- props
const propByName = new Map();
for (const [area, list] of Object.entries(propData)) {
  if (!Array.isArray(list)) continue;
  for (const prop of list) propByName.set(`${area}.${prop.name}`, { area, ...prop });
}

/**
 * Prop placements. `tx`/`ty` are the tile the prop's base sits in; `dx` is the
 * anchor's pixel offset inside that tile (8 = tile centre, 16 = the boundary
 * with the next tile, which aligns a 32px prop to a two-tile block).
 *
 * Gameplay roles come from prop-metadata.json, so a placement cannot
 * accidentally invent cover the collision grid does not have.
 */
const PROP_PLACEMENTS = [
  // --- market square: the heart of the village ---
  // Replaces the old 2x2 "well" cover tiles.
  { prop: 'valcendre.fountain', tx: 25, ty: 19, dx: 16 },
  // Replaces the old 2x1 "cart" cover tiles.
  { prop: 'valcendre.hay_cart', tx: 7, ty: 24, dx: 16 },
  { prop: 'valcendre.tree', tx: 6, ty: 20, dx: 8 },
  { prop: 'valcendre.bench', tx: 14, ty: 24, dx: 16 },
  { prop: 'valcendre.barrels', tx: 27, ty: 22, dx: 16 },
  { prop: 'valcendre.flower_box', tx: 4, ty: 14, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 22, ty: 13, dx: 8 },
  // Not on tile (24,24): that is patrol waypoint wp_l2_2, and the generator's
  // reachability assertion rejects a prop that sits on an authored waypoint.
  { prop: 'valcendre.lamppost', tx: 22, ty: 25, dx: 8 },
  { prop: 'valcendre.clothesline', tx: 9, ty: 15, dx: 16 },
  { prop: 'valcendre.french_flag', tx: 20, ty: 12, dx: 8 },

  // --- arrival alley ---
  { prop: 'valcendre.clothesline', tx: 7, ty: 31, dx: 16 },
  { prop: 'valcendre.flower_pot', tx: 9, ty: 37, dx: 8 },

  // --- west garden lane: greenery and the solitary village cross ---
  { prop: 'valcendre.tree', tx: 2, ty: 27, dx: 8 },
  { prop: 'valcendre.village_cross', tx: 2, ty: 31, dx: 8 },

  // --- bakery rear nook ---
  { prop: 'valcendre.flower_box', tx: 20, ty: 11, dx: 16 },

  // --- yard corridor: one cover break on the direct route ---
  { prop: 'valcendre.stone_cover', tx: 31, ty: 22, dx: 16 },

  // --- transport garage yard ---
  // Replaces the old 2x1 crate cover tiles in front of the garage door.
  { prop: 'valcendre.barrels', tx: 44, ty: 24, dx: 16 },
  { prop: 'valcendre.stone_cover', tx: 41, ty: 30, dx: 16 },
  { prop: 'valcendre.lamppost', tx: 36, ty: 20, dx: 8 },
  { prop: 'valcendre.barrels', tx: 50, ty: 18, dx: 16 },
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

// Props become objects too, so the scene can instantiate their sprites.
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
const floor = blank();
for (const r of REGIONS) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      assertInside(r.id, x, y);
      walkable[idx(x, y)] = true;
      floor[idx(x, y)] = variantFor(r.surface, x, y) + 1;
    }
  }
}

const shadowZones = blank();
for (const s of SHADOWS) {
  stamp(s, roleId('shadow'), shadowZones, true);
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++)
      if (walkable[idx(x, y)]) floor[idx(x, y)] = roleId('shadow') + 1;
}

// collision = the complement of the carved floor. Tiles touching floor get the
// limestone wall face; everything further out reads as rooftops.
const collision = blank();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (walkable[idx(x, y)]) continue;
    collision[idx(x, y)] = (touchesFloor(x, y) ? roleId('wall') : roleId('void')) + 1;
  }
}

const cover = blank();
for (const c of COVER) stamp(c, roleId(c.role), cover, true);

const decorBack = blank();
for (const d of DECOR_BACK) stamp(d, roleId(d.role), decorBack, true);
// decorFront stays empty in this slice: there is no awning tile in the supplied
// tileset, so overhead decoration is handled by front-depth props instead.
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
  const role =
    def.cover === 'low' ? 'barrierLow' : def.blocksSight ? 'crateHigh' : 'wall';

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
  if (o.type === 'exit') continue;
  const tx = Math.floor(o.x / TS);
  const ty = Math.floor(o.y / TS);
  // A prop's own anchor tile may legitimately be inside its own collision box.
  if (o.type === 'prop') continue;
  if (!reach[idx(tx, ty)]) throw new Error(`object ${o.name} at tile ${tx},${ty} is unreachable`);
}

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

// Per-tile gameplay properties, emitted only for tiles a role actually uses.
const tileProperties = [];
for (const def of Object.values(ROLES)) {
  const entries = Object.entries(def.flags).filter(([, v]) => v);
  if (entries.length === 0) continue;
  if (tileProperties.some((t) => t.id === def.id)) continue;
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
    tileLayer('collision', collision),
    tileLayer('cover', cover),
    tileLayer('propCollision', propCollision, false),
    tileLayer('shadowZones', shadowZones, false),
    tileLayer('decorFront', decorFront, true, 0.92),
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
const propTiles = propCollision.filter(Boolean).length;
console.log(
  `village.json: ${W}x${H} tiles (${W * TS}x${H * TS} px), ${walkableCount} walkable, ` +
    `${OBJECTS.length} objects (${PROP_PLACEMENTS.length} props), ` +
    `${propTiles} prop-collision tiles, tileset "${STAGE}" (${tilesetMeta.tilecount} tiles). All reachable.`
);
for (const r of propCollisionRoles) {
  if (r.claimed === 0)
    console.log(`  note: ${r.prop} footprint claims no tile (decorative in practice)`);
}
