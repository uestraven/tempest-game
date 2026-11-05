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
import {
  ACCENTS,
  COVER,
  DOORS,
  FACADE_DOORS,
  OBJECTS,
  OBSTRUCTIONS,
  PROP_PLACEMENTS,
  REGIONS,
  SHADOWS,
  SURFACE_OVERRIDES,
} from './map-data-valcendre.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const STAGE = 'valcendre';
const TILESET_SRC = `art-source/TEMPEST_pixel_art_v1/environments/${STAGE}_tiles.json`;
const ROLES_SRC = 'src/art/data/tile-roles.json';
const PROPS_SRC = 'src/art/data/prop-metadata.json';
const OUT = 'public/assets/maps/village.json';

const W = 104;
const H = 72;
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

// The authored geometry, cover, props and objects live in
// tools/map-data-valcendre.mjs. Everything below is machinery.

// ---------------------------------------------------------------------- props
const propByName = new Map();
for (const [area, list] of Object.entries(propData)) {
  if (!Array.isArray(list)) continue;
  for (const prop of list) {
    if (typeof prop !== 'object' || prop === null) continue;
    propByName.set(`${area}.${prop.name}`, { area, ...prop });
  }
}

// Doors become objects, carrying their tile rect and what unlocks them.
for (const d of DOORS) {
  OBJECTS.push({
    name: d.name,
    type: 'door',
    x: d.x * TS,
    y: d.y * TS,
    width: d.w * TS,
    height: d.h * TS,
    props: { locked: d.locked, tileX: d.x, tileY: d.y, tileW: d.w, tileH: d.h },
  });
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
/**
 * Buildings and interior walls: carved back out of the regions above, so
 * everything still non-walkable becomes collision and the architecture pass
 * paints it. The reachability flood fill runs afterwards, so an obstruction
 * that seals a route fails the build.
 */
let obstructed = 0;
for (const o of OBSTRUCTIONS) {
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) {
      assertInside(`obstruction "${o.why}"`, x, y);
      if (walkable[idx(x, y)]) obstructed++;
      walkable[idx(x, y)] = false;
      areaOf[idx(x, y)] = null;
      surfaceOf[idx(x, y)] = null;
    }
  }
}

/**
 * Doors are carved back to walkable so the level is traversable once they open;
 * the runtime makes them solid while locked. The locked-door reachability check
 * further down proves the garage really is sealed until then.
 */
for (const d of DOORS) {
  for (let y = d.y; y < d.y + d.h; y++) {
    for (let x = d.x; x < d.x + d.w; x++) {
      assertInside(`door "${d.name}"`, x, y);
      walkable[idx(x, y)] = true;
      areaOf[idx(x, y)] = areaOf[idx(x, y)] ?? 'garageInterior';
      surfaceOf[idx(x, y)] = surfaceOf[idx(x, y)] ?? 'garageFloor';
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

/**
 * groundMaterial: INVISIBLE, not a collider, not a gameplay layer.
 *
 * Records each walkable tile's authored surface as that surface's BASE tile,
 * taken before the shadow pass below overwrites the floor. Without it the
 * exported map cannot say what material lies under a shaded tile: `shadowFloor`
 * and `voidFill` are both `deep_shadow`, so a shaded cobble tile, a shaded
 * brick tile and the dark fill behind a building wall are indistinguishable in
 * `floor`.
 *
 * The BASE tile, not the variant-rolled tile, and that distinction matters.
 * `floor_crack` is a low-probability decorative variant of four different
 * surfaces - alleyCobble, serviceBrick, yardGravel and roadDirt - so recording
 * the rolled tile would make a cracked cobble tile indistinguishable from a
 * cracked brick tile, and any consumer keying off it would either leave holes
 * in the cobblestone or paint over the brick. Recording the base says what the
 * level author chose; the appearance variant is the floor layer's business.
 *
 * `MapLoader` merges gameplay flags only from its closed GAMEPLAY_LAYERS set
 * (collision, cover, propCollision, shadowZones), so this layer is inert for
 * movement, vision, cover and concealment by construction. It is read only by
 * the ground presentation, to decide which tiles are cobblestone.
 */
const groundMaterial = blank();
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (!walkable[idx(x, y)]) continue;
    const surface = surfaceOf[idx(x, y)];
    if (!surface) continue;
    groundMaterial[idx(x, y)] = tileId(SURFACES[surface].base) + 1;
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

const blockedObjects = [];
for (const o of OBJECTS) {
  if (o.type === 'exit' || o.type === 'prop' || o.type === 'decor') continue;
  const tx = Math.floor(o.x / TS);
  const ty = Math.floor(o.y / TS);
  if (!reach[idx(tx, ty)]) blockedObjects.push(`${o.name} at ${tx},${ty}`);
}
if (blockedObjects.length > 0) {
  throw new Error(
    `${blockedObjects.length} unreachable object anchor(s):\n  ` + blockedObjects.join('\n  ')
  );
}

const exitObj = OBJECTS.find((o) => o.type === 'exit');
let exitOk = false;
for (let y = exitObj.y / TS; y < (exitObj.y + exitObj.height) / TS; y++)
  for (let x = exitObj.x / TS; x < (exitObj.x + exitObj.width) / TS; x++)
    if (reach[idx(x, y)]) exitOk = true;
if (!exitOk) throw new Error('exit rectangle is unreachable');

// Optional authoring aid: list every valid south-facing facade position.
if (process.env.MAP_DOOR_CANDIDATES) {
  const candidates = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!walkable[idx(x, y)] && distanceToWalkable(x, y, 2) === 1 && isWalkable(x, y + 1))
        candidates.push(`${x},${y}`);
  console.log(`south-facing facade candidates (${candidates.length}):`);
  console.log('  ' + candidates.join(' '));
}

/**
 * The garage must be SEALED while its doors are locked.
 *
 * Flood fill again with every door tile treated as solid: if the garage, the
 * dock or the exit is still reachable, some other passage bypasses the key and
 * the objective lock would be decoration. This is the authored guarantee behind
 * "neither entrance can bypass the key requirement".
 */
{
  const doorTiles = new Set();
  for (const d of DOORS)
    for (let y = d.y; y < d.y + d.h; y++)
      for (let x = d.x; x < d.x + d.w; x++) doorTiles.add(idx(x, y));

  const sealed = new Array(W * H).fill(false);
  const stack = [[Math.floor(spawnObj.x / TS), Math.floor(spawnObj.y / TS)]];
  sealed[idx(stack[0][0], stack[0][1])] = true;
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
      if (sealed[i] || solid[i] || doorTiles.has(i)) continue;
      sealed[i] = true;
      stack.push([nx, ny]);
    }
  }

  // The loading dock is deliberately NOT sealed: it is the open yard that leads
  // to the garage's second entrance, and the shutter in its west wall is that
  // entrance. What must be sealed is the garage itself and the exit beyond it.
  const mustBeSealed = [
    ['garage interior', 70, 14],
    ['garage west bay', 60, 9],
    ['north road exit', 62, 2],
  ];
  if (!sealed[idx(87, 15)])
    throw new Error('the loading dock should be reachable without the key; it is the approach');
  for (const [label, tx, ty] of mustBeSealed) {
    if (sealed[idx(tx, ty)])
      throw new Error(
        `${label} at ${tx},${ty} is reachable with both garage doors locked - ` +
          'some passage bypasses the garage key'
      );
  }
  console.log(
    `  locked-door check: garage and exit sealed behind ${DOORS.length} doors ` +
      `(${doorTiles.size} door tiles); dock reachable as the second approach`
  );
}

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
    tileLayer('groundMaterial', groundMaterial, false),
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
  `village.json: ${W}x${H} tiles (${W * TS}x${H * TS} px), ${walkableCount} walkable ` +
    `(${obstructed} tiles removed by buildings), ` +
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
