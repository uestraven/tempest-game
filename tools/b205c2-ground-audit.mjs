/**
 * Phase B.2-05C-2, section 4: classify Valcendre's shaded ground by its ACTUAL
 * authored material.
 *
 *   node tools/b205c2-ground-audit.mjs [--json out.json]
 *
 * Why this is not a one-liner over `shadowZones`:
 *
 * `tools/build-map.mjs` keeps the authored material per tile in `surfaceOf`,
 * paints the floor from it, and THEN stamps the shadow pass, which overwrites
 * the floor tile with `shadowFloor` (= `deep_shadow`). The exported
 * `village.json` therefore no longer records what material lies under a shaded
 * tile - every one of them reads `deep_shadow` whether it is cobble, grass,
 * brick, gravel or garage plate.
 *
 * Worse, `voidFill` is ALSO `deep_shadow`, so every NON-WALKABLE tile carries
 * the same floor tile as a genuine shadow zone. Counting `deep_shadow` in the
 * floor layer therefore counts building interiors as "shaded ground".
 *
 * So the authored data in `tools/map-data-valcendre.mjs` is the only source of
 * truth for material, and this tool recomputes `surfaceOf` from it with the
 * same precedence `build-map.mjs` uses, then cross-checks every conclusion
 * against the shipped `village.json`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  DOORS,
  OBSTRUCTIONS,
  REGIONS,
  SHADOWS,
  SURFACE_OVERRIDES,
} from './map-data-valcendre.mjs';

const roles = JSON.parse(readFileSync('src/art/data/tile-roles.json', 'utf8'));
const map = JSON.parse(readFileSync('public/assets/maps/village.json', 'utf8'));
const W = map.width;
const H = map.height;
const firstgid = map.tilesets[0].firstgid;
const layer = (n) => map.layers.find((l) => l.name === n)?.data ?? null;
const floor = layer('floor');
const collision = layer('collision');
const cover = layer('cover');
const propCollision = layer('propCollision');
const shadowZones = layer('shadowZones');

const TILE_NAMES = JSON.parse(
  readFileSync('src/art/data/tile-roles.json', 'utf8')
).tiles
  ? null
  : null;
// The canonical name list lives in TypeScript; read it out of the source rather
// than duplicating it, so a tileset edit cannot silently invalidate this audit.
const tsSrc = readFileSync('src/art/TilesetRegistry.ts', 'utf8');
const nameBlock = tsSrc.slice(
  tsSrc.indexOf('export const TILE_NAMES = ['),
  tsSrc.indexOf('] as const;')
);
const NAMES = [...nameBlock.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
if (NAMES.length < 40) throw new Error(`failed to read TILE_NAMES (got ${NAMES.length})`);

const idx = (x, y) => y * W + x;
const floorName = (x, y) => {
  const g = floor[idx(x, y)];
  return g === 0 ? null : (NAMES[g - firstgid] ?? `#${g - firstgid}`);
};
const solid = (x, y) =>
  [collision, cover, propCollision].some((l) => l && l[idx(x, y)] !== 0);

// ---------------------------------------------------------------- surfaceOf
// Same precedence as build-map.mjs: regions, then obstructions clear, then
// doors backfill, then overrides.
const walkable = new Array(W * H).fill(false);
const surfaceOf = new Array(W * H).fill(null);
const regionOf = new Array(W * H).fill(null);
const areaOf = new Array(W * H).fill(null);

for (const r of REGIONS)
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      walkable[idx(x, y)] = true;
      surfaceOf[idx(x, y)] = r.surface;
      regionOf[idx(x, y)] = r.id;
      areaOf[idx(x, y)] = r.area;
    }
for (const o of OBSTRUCTIONS)
  for (let y = o.y; y < o.y + o.h; y++)
    for (let x = o.x; x < o.x + o.w; x++) {
      walkable[idx(x, y)] = false;
      surfaceOf[idx(x, y)] = null;
      regionOf[idx(x, y)] = null;
      areaOf[idx(x, y)] = null;
    }
for (const d of DOORS)
  for (let y = d.y; y < d.y + d.h; y++)
    for (let x = d.x; x < d.x + d.w; x++) {
      walkable[idx(x, y)] = true;
      surfaceOf[idx(x, y)] = surfaceOf[idx(x, y)] ?? 'garageFloor';
      areaOf[idx(x, y)] = areaOf[idx(x, y)] ?? 'garageInterior';
    }
for (const o of SURFACE_OVERRIDES)
  for (let y = o.y; y < o.y + o.h; y++)
    for (let x = o.x; x < o.x + o.w; x++)
      if (walkable[idx(x, y)]) surfaceOf[idx(x, y)] = o.surface;

// Shadow stamps, restricted to walkable ground exactly as build-map does.
const shaded = new Array(W * H).fill(false);
for (const s of SHADOWS)
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++)
      if (walkable[idx(x, y)]) shaded[idx(x, y)] = true;

// ------------------------------------------------------------- cross-checks
const problems = [];
let carveMismatch = 0;
let shadeMismatch = 0;
let explainedByCoverOrProp = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    // Carve check: the recomputed regions vs the shipped `collision` layer
    // alone. `cover` and `propCollision` are deliberately NOT included - they
    // are stamped on top of carved ground, so a cover tile is carved floor that
    // the runtime also makes solid. It still renders a floor tile underneath,
    // so it remains eligible ground for this audit.
    const isDoor = DOORS.some(
      (d) => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h
    );
    const carvedSolid = collision ? collision[idx(x, y)] !== 0 : false;
    if (!isDoor && walkable[idx(x, y)] === carvedSolid) carveMismatch++;
    if (walkable[idx(x, y)] && !carvedSolid && solid(x, y)) explainedByCoverOrProp++;
    // Shade: our recomputation vs the shipped shadowZones layer.
    const flagged = shadowZones ? shadowZones[idx(x, y)] !== 0 : false;
    if (flagged !== shaded[idx(x, y)]) shadeMismatch++;
  }
if (carveMismatch) problems.push(`${carveMismatch} tiles disagree on carved walkability`);
if (shadeMismatch) problems.push(`${shadeMismatch} tiles disagree on shade`);

// ------------------------------------------------- material classification
/**
 * Which authored surfaces are cobblestone, by the TILES THEY ACTUALLY PAINT -
 * not by their name. `gardenPath` is called a garden path but paints the same
 * `cobble`/`floor_01` tiles as `alleyCobble`, so it is reported separately and
 * a decision is surfaced rather than taken.
 */
const COBBLE_TILES = new Set(['cobble', 'floor_01', 'floor_02', 'floor_03', 'floor_04', 'floor_05', 'floor_06', 'floor_07', 'floor_08']);
const CLASS = {
  marketPaving: 'cobblestone',
  alleyCobble: 'cobblestone',
  gardenPath: 'cobblestone_garden_path',
  gardenGrass: 'grass_garden',
  serviceBrick: 'brick',
  garageFloor: 'garage_industrial',
  yardGravel: 'gravel',
  roadDirt: 'dirt_road',
};

const byClass = new Map();
const bySurface = new Map();
const byRegion = new Map();
const coords = new Map();
let shadedWalkable = 0;

for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (!shaded[idx(x, y)]) continue;
    shadedWalkable++;
    const surface = surfaceOf[idx(x, y)] ?? '(none)';
    const klass = CLASS[surface] ?? 'other';
    if (!CLASS[surface]) problems.push(`unclassified surface "${surface}" at ${x},${y}`);
    byClass.set(klass, (byClass.get(klass) ?? 0) + 1);
    bySurface.set(surface, (bySurface.get(surface) ?? 0) + 1);
    const rid = regionOf[idx(x, y)] ?? '(door)';
    byRegion.set(rid, (byRegion.get(rid) ?? 0) + 1);
    if (!coords.has(rid)) coords.set(rid, []);
    coords.get(rid).push([x, y]);
  }

// ------------------------------- what B.2-04 actually counted, and why it differed
const MARKET_REGION = { x: 9, y: 30, w: 34, h: 28 };
let b204DeepShadow = 0;
let b204OnWalkable = 0;
let b204OnVoid = 0;
for (let y = MARKET_REGION.y; y < MARKET_REGION.y + MARKET_REGION.h; y++)
  for (let x = MARKET_REGION.x; x < MARKET_REGION.x + MARKET_REGION.w; x++) {
    if (floorName(x, y) !== 'deep_shadow') continue;
    b204DeepShadow++;
    if (walkable[idx(x, y)]) b204OnWalkable++;
    else b204OnVoid++;
  }

const bbox = (list) => ({
  x0: Math.min(...list.map((p) => p[0])),
  x1: Math.max(...list.map((p) => p[0])),
  y0: Math.min(...list.map((p) => p[1])),
  y1: Math.max(...list.map((p) => p[1])),
});

const report = {
  map: { width: W, height: H },
  crossChecks: {
    carvedWalkabilityMismatches: carveMismatch,
    shadeMismatches: shadeMismatch,
    carvedGroundAlsoSolidViaCoverOrProps: explainedByCoverOrProp,
    note: 'zero mismatches means the recomputed authored data agrees with the shipped village.json; cover and prop tiles sit ON carved ground and are counted separately',
  },
  b204Figure: {
    region: MARKET_REGION,
    deepShadowFloorTiles: b204DeepShadow,
    onWalkableGround: b204OnWalkable,
    onNonWalkableVoidFill: b204OnVoid,
    note:
      'voidFill and shadowFloor both paint deep_shadow, so the B.2-04 count mixed real shaded ground with building interiors',
  },
  shadedWalkableTotal: shadedWalkable,
  byClass: Object.fromEntries([...byClass].sort((a, b) => b[1] - a[1])),
  bySurface: Object.fromEntries([...bySurface].sort((a, b) => b[1] - a[1])),
  byRegion: [...byRegion]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const r = REGIONS.find((q) => q.id === id);
      return {
        region: id,
        area: r?.area ?? null,
        surface: r?.surface ?? null,
        class: r ? (CLASS[r.surface] ?? 'other') : 'other',
        tiles: n,
        bbox: bbox(coords.get(id)),
      };
    }),
  problems,
};

console.log('=== cross-checks against the shipped map ===');
console.log(`  carved-walkability mismatches: ${carveMismatch}`);
console.log(`  carved ground also solid via cover/props: ${explainedByCoverOrProp}`);
console.log(`  shade mismatches:       ${shadeMismatch}`);
console.log('\n=== the B.2-04 "496" figure, decomposed ===');
console.log(`  deep_shadow floor tiles in the market region: ${b204DeepShadow}`);
console.log(`    on walkable ground (real shaded ground):    ${b204OnWalkable}`);
console.log(`    on non-walkable void fill (not ground):     ${b204OnVoid}`);
console.log('\n=== all authored shaded ground, by material class ===');
for (const [k, v] of Object.entries(report.byClass)) console.log(`  ${k.padEnd(26)} ${String(v).padStart(4)}`);
console.log('\n=== by authored surface ===');
for (const [k, v] of Object.entries(report.bySurface)) console.log(`  ${k.padEnd(26)} ${String(v).padStart(4)}`);
console.log('\n=== by authored region ===');
for (const r of report.byRegion)
  console.log(
    `  ${String(r.tiles).padStart(4)}  ${r.region.padEnd(16)} ${String(r.surface).padEnd(14)} ${r.class.padEnd(24)} x${r.bbox.x0}-${r.bbox.x1} y${r.bbox.y0}-${r.bbox.y1}`
  );
console.log(`\n  TOTAL authored shaded walkable ground: ${shadedWalkable}`);
if (problems.length) console.log(`\nPROBLEMS: ${problems.join(' | ')}`);
else console.log('\nno problems');

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag > -1 && process.argv[jsonFlag + 1]) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(report, null, 1));
  console.log(`\nwrote ${process.argv[jsonFlag + 1]}`);
}
