/**
 * Authoring aid: for each encounter area, rank candidate (post, facing) pairs
 * by how much of the main critical path the guard would see FROM ITS SPAWN,
 * which is the established exposure measurement (C.1A section 1.4).
 *
 *   npx vite-node tools/post-search.ts
 *
 * This only ranks options; it does not choose. Placement also has to respect
 * the encounter's role, leave a stealth line, and keep shooters per tile low,
 * none of which this scores.
 */

import {
  exposure,
  guardsFromMap,
  loadMap,
  samplePath,
  type MapObject,
} from '../tests/support/encounter-metrics';
import { TILE } from '../src/core/constants';

const map = loadMap();
const byName = (name: string): MapObject => {
  const found = map.objects.find((o) => o.name === name);
  if (!found) throw new Error(`no object named ${name}`);
  return found;
};
const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

const MAIN = [
  byName('spawn'),
  byName('interact_tracks'),
  byName('interact_waybill'),
  T(39, 48),
  T(77, 42),
  byName('interact_ledger'),
  T(82, 20),
  byName('interact_van'),
  byName('actor_cultist'),
  byName('interact_inscription'),
  { x: byName('exit_north').x + 24, y: byName('exit_north').y + 16 },
];
const samples = samplePath(
  map.grid,
  MAIN.map((p) => ({ x: p.x, y: p.y }))
);
console.log(`main critical path: ${samples.length} samples\n`);

/** Candidate boxes, one per guard role, in tiles. */
const AREAS: [string, number, number, number, number][] = [
  ['L1 market south approach', 12, 50, 13, 7],
  ['L2 market square', 13, 38, 22, 14],
  ['L3 covered market / plaza', 16, 32, 16, 7],
  ['L5 depot south gate', 68, 39, 14, 7],
  ['L6 depot courtyard', 50, 20, 36, 24],
  ['L7 garage + dock', 58, 6, 33, 16],
];

const FACINGS = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);

for (const [label, x0, y0, w, h] of AREAS) {
  const ranked: { tile: string; deg: number; covered: number }[] = [];
  for (let ty = y0; ty < y0 + h; ty++) {
    for (let tx = x0; tx < x0 + w; tx++) {
      if (map.grid.solidAt(tx, ty)) continue;
      const post = T(tx, ty);
      for (const facing of FACINGS) {
        const seen = exposure(
          map.grid,
          [{ guard: 'c', x: post.x, y: post.y, facing }],
          samples
        ).filter((s) => s.seenBy.length > 0).length;
        if (seen === 0) continue;
        ranked.push({
          tile: `${tx},${ty}`,
          deg: Math.round((facing * 180) / Math.PI),
          covered: seen,
        });
      }
    }
  }
  ranked.sort((a, b) => b.covered - a.covered);
  console.log(`${label}  (best 12 of ${ranked.length} scoring options)`);
  for (const r of ranked.slice(0, 12))
    console.log(
      `   ${r.tile.padEnd(8)} ${String(r.deg).padStart(4)}deg  ` +
        `${String(r.covered).padStart(3)} samples  ` +
        `${((r.covered / samples.length) * 100).toFixed(1)}%`
    );
  console.log();
}

// What the current roster actually achieves, for comparison.
const guards = guardsFromMap(map);
for (const g of guards) {
  const seen = exposure(
    map.grid,
    [{ guard: g.name, x: g.x, y: g.y, facing: g.facing }],
    samples
  ).filter((s) => s.seenBy.length > 0).length;
  console.log(
    `current ${g.name.replace('enemy_', '')} ` +
      `${Math.floor(g.x / TILE)},${Math.floor(g.y / TILE)} ` +
      `${Math.round((g.facing * 180) / Math.PI)}deg -> ${seen} samples ` +
      `(${((seen / samples.length) * 100).toFixed(1)}%)`
  );
}
