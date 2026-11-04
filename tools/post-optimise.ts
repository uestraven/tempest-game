/**
 * Authoring aid: greedy union maximisation of static-post critical-path
 * coverage, one post per role area.
 *
 *   npx vite-node tools/post-optimise.ts
 *
 * Reports the greedy pick order so the marginal contribution of each guard is
 * visible, and prints the shooter-count consequence. Ranking only - the final
 * placement is a design decision, not this script's output.
 */

import {
  exposure,
  loadMap,
  samplePath,
  type MapObject,
  type Post,
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

const AREAS: [string, number, number, number, number][] = [
  ['L1', 12, 50, 13, 7],
  ['L2', 13, 38, 22, 14],
  ['L3', 16, 32, 16, 7],
  ['L5', 68, 39, 14, 7],
  ['L6', 50, 20, 36, 24],
  ['L7', 58, 6, 33, 16],
];
const FACINGS = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);

/** Precompute the covered-sample index set for every candidate in every area. */
interface Candidate {
  area: string;
  tx: number;
  ty: number;
  facing: number;
  covers: Set<number>;
}
const candidates: Candidate[] = [];
for (const [area, x0, y0, w, h] of AREAS) {
  for (let ty = y0; ty < y0 + h; ty++) {
    for (let tx = x0; tx < x0 + w; tx++) {
      if (map.grid.solidAt(tx, ty)) continue;
      const post = T(tx, ty);
      for (const facing of FACINGS) {
        const e = exposure(map.grid, [{ guard: area, x: post.x, y: post.y, facing }], samples);
        const covers = new Set<number>();
        e.forEach((s, i) => {
          if (s.seenBy.length > 0) covers.add(i);
        });
        if (covers.size > 0) candidates.push({ area, tx, ty, facing, covers });
      }
    }
  }
}
console.log(`${samples.length} path samples, ${candidates.length} candidate posts\n`);

const chosen: Candidate[] = [];
const union = new Set<number>();
const remaining = new Set(AREAS.map(([a]) => a));

while (remaining.size > 0) {
  let best: Candidate | null = null;
  let bestGain = -1;
  for (const c of candidates) {
    if (!remaining.has(c.area)) continue;
    let gain = 0;
    for (const i of c.covers) if (!union.has(i)) gain++;
    if (gain > bestGain) {
      bestGain = gain;
      best = c;
    }
  }
  if (!best) break;
  chosen.push(best);
  for (const i of best.covers) union.add(i);
  remaining.delete(best.area);
  console.log(
    `  pick ${best.area}  ${best.tx},${best.ty}  ` +
      `${String(Math.round((best.facing * 180) / Math.PI)).padStart(3)}deg  ` +
      `+${String(bestGain).padStart(3)} new  ` +
      `union ${union.size} (${((union.size / samples.length) * 100).toFixed(1)}%)`
  );
}

console.log(
  `\ngreedy ceiling: ${union.size}/${samples.length} = ` +
    `${((union.size / samples.length) * 100).toFixed(1)}% static-post exposure`
);

const posts: Post[] = chosen.map((c) => ({
  guard: c.area,
  ...T(c.tx, c.ty),
  facing: c.facing,
}));
const e = exposure(map.grid, posts, samples);
const worst = e.reduce((m, s) => Math.max(m, s.shooters.length), 0);
const over3 = e.filter((s) => s.shooters.length > 3).length;
console.log(`max effective shooters on any path sample: ${worst} (samples over 3: ${over3})`);
