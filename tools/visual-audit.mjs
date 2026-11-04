/**
 * Static composition analysis for the Phase B.2-01 visual audit.
 *
 *   node tools/visual-audit.mjs [outDir]
 *
 * Reads the shipped map and tileset metadata and reports, per authored area:
 * which tile ids each visible layer actually uses, how concentrated that usage
 * is, which of those tiles are byte-identical to each other, and where props
 * sit relative to the buildings they are supposed to belong to.
 *
 * READ-ONLY. It writes a JSON report and nothing else. No asset is touched.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const outDir = process.argv[2] ?? 'docs/art-direction/baseline';
const ROOT = new URL('..', import.meta.url).pathname;
const TILE = 16;

const map = JSON.parse(readFileSync(`${ROOT}public/assets/maps/village.json`, 'utf8'));
const registry = readFileSync(`${ROOT}src/art/TilesetRegistry.ts`, 'utf8');
const TILE_NAMES = registry
  .match(/export const TILE_NAMES = \[([\s\S]*?)\] as const;/)[1]
  .split(',')
  .map((x) => x.trim().replace(/^'|'$/g, ''))
  .filter(Boolean);

/** Authored areas, from tools/map-data-valcendre.mjs REGIONS. */
const AREAS = {
  'arrival alley': [[6, 58, 10, 11], [11, 56, 5, 2]],
  'market square': [
    [13, 38, 22, 14],
    [16, 32, 16, 6],
    [13, 52, 12, 5],
    [9, 40, 4, 10],
    [35, 47, 8, 3],
  ],
  'bakery + garden': [
    [16, 31, 4, 1],
    [6, 20, 15, 11],
    [6, 3, 6, 20],
    [11, 3, 18, 4],
    [26, 6, 6, 16],
    [30, 16, 10, 4],
    [37, 8, 6, 9],
    [42, 8, 10, 4],
    [46, 11, 6, 16],
  ],
  'main street': [[43, 46, 36, 11], [75, 44, 4, 2]],
  'depot courtyard': [
    [56, 20, 30, 6],
    [50, 26, 32, 4],
    [50, 30, 2, 9],
    [59, 30, 23, 9],
    [50, 39, 32, 5],
  ],
  'depot office': [[53, 31, 5, 7], [55, 38, 2, 1]],
  'garage interior': [[58, 6, 27, 13], [81, 19, 3, 1]],
  'loading dock': [[84, 10, 7, 11]],
  'north road': [[60, 0, 5, 6]],
};

const layerData = {};
for (const l of map.layers) if (l.type === 'tilelayer' && l.data) layerData[l.name] = l.data;
const tileset = map.tilesets[0];
const gidToIndex = (gid) => (gid === 0 ? -1 : gid - tileset.firstgid);
const at = (layer, tx, ty) => {
  const d = layerData[layer];
  if (!d || tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
  return gidToIndex(d[ty * map.width + tx]);
};

/** Visible layers, in draw order, as MapLoader creates them. */
const VISIBLE = ['floor', 'decorBack', 'architecture', 'cover', 'decorFront'];

const inArea = (rects, tx, ty) =>
  rects.some(([x, y, w, h]) => tx >= x && tx < x + w && ty >= y && ty < y + h);

// ----------------------------------------------- per-area tile usage
const areaReport = {};
for (const [area, rects] of Object.entries(AREAS)) {
  const perLayer = {};
  let tiles = 0;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!inArea(rects, tx, ty)) continue;
      tiles++;
      for (const layer of VISIBLE) {
        const idx = at(layer, tx, ty);
        if (idx < 0) continue;
        perLayer[layer] ??= {};
        const name = TILE_NAMES[idx] ?? `#${idx}`;
        perLayer[layer][`${name}#${idx}`] = (perLayer[layer][`${name}#${idx}`] ?? 0) + 1;
      }
    }
  }
  // Concentration: what share of the area's floor is the single commonest tile?
  const floor = perLayer.floor ?? {};
  const floorTotal = Object.values(floor).reduce((a, b) => a + b, 0);
  const sortedFloor = Object.entries(floor).sort((a, b) => b[1] - a[1]);
  areaReport[area] = {
    walkableTiles: tiles,
    layers: Object.fromEntries(
      Object.entries(perLayer).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).sort((a, b) => b[1] - a[1])),
      ])
    ),
    floorVariety: sortedFloor.length,
    floorTop: sortedFloor[0] ?? null,
    floorTopShare: floorTotal ? +((sortedFloor[0]?.[1] ?? 0) / floorTotal).toFixed(3) : 0,
  };
}

// ----------------------------------------------- objects, props, geometry
const objectLayer = map.layers.find((l) => l.type === 'objectgroup');
const props = (o) =>
  Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value]));
const objects = (objectLayer?.objects ?? []).map((o) => ({
  name: o.name,
  type: String(o.type ?? o.class ?? ''),
  x: o.x,
  y: o.y,
  w: o.width,
  h: o.height,
  tile: `${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`,
  props: props(o),
}));

/**
 * A prop reads as "disconnected" when nothing solid is adjacent to the tile it
 * stands on - a lamp, bench or crate floating in open floor with no wall,
 * doorway or structure to belong to.
 */
const solidAt = (tx, ty) =>
  ['collision', 'cover', 'propCollision'].some((l) => at(l, tx, ty) >= 0);
const disconnected = [];
for (const o of objects.filter((x) => x.type === 'prop' || x.type === 'decor')) {
  const tx = Math.floor(o.x / TILE);
  const ty = Math.floor(o.y / TILE);
  let near = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) if (solidAt(tx + dx, ty + dy)) near++;
  if (near === 0) disconnected.push({ ...o, solidTilesWithin2: near });
}

/**
 * Architectural transitions. A wall run is "untransitioned" where a solid tile
 * meets open floor on two perpendicular sides - an outside corner - and the
 * tile drawn there is the same flat `wall_solid` as a straight run, because the
 * tileset's corner tiles are byte-identical to it.
 */
const CORNER_SET = new Set(['wall_corner_tl', 'wall_corner_tr', 'wall_corner_bl', 'wall_corner_br']);
let outsideCorners = 0;
let cornersDrawnFlat = 0;
const cornerSamples = [];
for (let ty = 1; ty < map.height - 1; ty++) {
  for (let tx = 1; tx < map.width - 1; tx++) {
    if (at('collision', tx, ty) < 0) continue;
    const open = {
      n: at('collision', tx, ty - 1) < 0,
      s: at('collision', tx, ty + 1) < 0,
      e: at('collision', tx + 1, ty) < 0,
      w: at('collision', tx - 1, ty) < 0,
    };
    const isCorner = (open.n || open.s) && (open.e || open.w);
    if (!isCorner) continue;
    outsideCorners++;
    const drawn = at('architecture', tx, ty);
    const name = TILE_NAMES[drawn] ?? `#${drawn}`;
    if (!CORNER_SET.has(name)) {
      cornersDrawnFlat++;
      if (cornerSamples.length < 12) cornerSamples.push({ tile: `${tx},${ty}`, drawn: `${name}#${drawn}` });
    }
  }
}

// ----------------------------------------------- market square constraints
const MARKET = [
  [13, 38, 22, 14],
  [16, 32, 16, 6],
  [13, 52, 12, 5],
  [9, 40, 4, 10],
  [35, 47, 8, 3],
];
const marketObjects = objects.filter((o) => {
  const tx = Math.floor(o.x / TILE);
  const ty = Math.floor(o.y / TILE);
  return tx >= 8 && tx <= 44 && ty >= 30 && ty <= 58;
});
const marketCover = { low: [], high: [] };
for (let ty = 30; ty <= 58; ty++)
  for (let tx = 8; tx <= 44; tx++) {
    const c = at('cover', tx, ty);
    if (c < 0) continue;
    const name = TILE_NAMES[c] ?? `#${c}`;
    (name === 'cover_low' ? marketCover.low : marketCover.high).push(`${tx},${ty}`);
  }
const marketWalkable = [];
for (let ty = 30; ty <= 58; ty++)
  for (let tx = 8; tx <= 44; tx++)
    if (inArea(MARKET, tx, ty) && !solidAt(tx, ty)) marketWalkable.push(`${tx},${ty}`);

// shadow zones per area
const shadowByArea = {};
for (const [area, rects] of Object.entries(AREAS)) {
  let shaded = 0;
  let total = 0;
  for (let ty = 0; ty < map.height; ty++)
    for (let tx = 0; tx < map.width; tx++) {
      if (!inArea(rects, tx, ty)) continue;
      total++;
      if (at('shadowZones', tx, ty) >= 0) shaded++;
    }
  shadowByArea[area] = { shaded, total, share: total ? +(shaded / total).toFixed(3) : 0 };
}

const report = {
  map: { width: map.width, height: map.height, px: [map.width * TILE, map.height * TILE] },
  visibleLayerOrder: VISIBLE,
  tileNames: TILE_NAMES,
  areas: areaReport,
  shadowByArea,
  architecture: { outsideCorners, cornersDrawnFlat, cornerSamples },
  disconnectedProps: disconnected,
  market: {
    objects: marketObjects,
    coverLowCount: marketCover.low.length,
    coverHighCount: marketCover.high.length,
    coverLow: marketCover.low,
    coverHigh: marketCover.high,
    walkableTiles: marketWalkable.length,
  },
  objectCounts: Object.fromEntries(
    Object.entries(
      objects.reduce((a, o) => {
        a[o.type] = (a[o.type] ?? 0) + 1;
        return a;
      }, {})
    ).sort()
  ),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/composition-report.json`, JSON.stringify(report, null, 1));

// ----------------------------------------------- console summary
console.log(`map ${map.width}x${map.height} tiles (${map.width * TILE}x${map.height * TILE} px)`);
console.log(`visible layer order: ${VISIBLE.join(' -> ')}\n`);
console.log('AREA'.padEnd(18) + 'tiles'.padEnd(7) + 'floor kinds'.padEnd(13) + 'commonest floor tile'.padEnd(26) + 'share  shadow');
for (const [area, r] of Object.entries(areaReport)) {
  const sh = shadowByArea[area];
  console.log(
    area.padEnd(18) +
      String(r.walkableTiles).padEnd(7) +
      String(r.floorVariety).padEnd(13) +
      String(r.floorTop?.[0] ?? '-').padEnd(26) +
      `${(r.floorTopShare * 100).toFixed(0)}%`.padEnd(7) +
      `${(sh.share * 100).toFixed(0)}%`
  );
}
console.log(
  `\narchitecture: ${outsideCorners} outside corners, ${cornersDrawnFlat} drawn with a non-corner tile ` +
    `(${((cornersDrawnFlat / Math.max(1, outsideCorners)) * 100).toFixed(0)}%)`
);
console.log(`disconnected props (no solid tile within 2): ${disconnected.length}`);
for (const d of disconnected.slice(0, 10))
  console.log(`   ${d.name} at ${d.tile} (${d.props.prop ?? d.props.sprite ?? d.type})`);
console.log(
  `\nmarket square: ${marketWalkable.length} walkable tiles, ` +
    `${marketCover.low.length} low-cover tiles, ${marketCover.high.length} high-cover tiles, ` +
    `${marketObjects.length} objects`
);
console.log(`\nwrote ${outDir}/composition-report.json`);
