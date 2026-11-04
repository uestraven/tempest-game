/**
 * Prints the Valcendre encounter measurements. Run with:
 *
 *   npx vite-node tools/encounter-report.ts
 *
 * Reporting only; `tests/encounters.test.ts` asserts the same numbers from the
 * same module, so the table below and the suite cannot disagree.
 */

import {
  CONTRACT,
  acousticLinks,
  acousticLinksAlongPatrol,
  doorAudit,
  exposedFraction,
  exposure,
  guardsFromMap,
  loadMap,
  maxShooters,
  patrolMetrics,
  patrolPosts,
  samplePath,
  staticPosts,
  type MapObject,
} from '../tests/support/encounter-metrics';
import { TILE } from '../src/core/constants';

const map = loadMap();
const guards = guardsFromMap(map);
const byName = (name: string): MapObject => {
  const found = map.objects.find((o) => o.name === name);
  if (!found) throw new Error(`no object named ${name}`);
  return found;
};
const T = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
const tile = (p: { x: number; y: number }) => `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`;

console.log(
  `contract: ${CONTRACT.coneDegrees}deg cone, ${CONTRACT.maxDistance}px sight, ` +
    `${CONTRACT.engageRange}px engage, ${CONTRACT.shoutRadius}px shout, ` +
    `${CONTRACT.patrolSpeed}px/s patrol\n`
);

// ------------------------------------------------------------------- roster

console.log(`GUARDS (${guards.length})`);
console.log(
  'id'.padEnd(10) +
    'post'.padEnd(10) +
    'facing'.padEnd(8) +
    'wps'.padEnd(5) +
    'loop px'.padEnd(10) +
    'loop s'.padEnd(9) +
    'straight'.padEnd(10) +
    'valid'
);
for (const g of guards) {
  const m = patrolMetrics(map.grid, g);
  const ok = m.allWalkable && m.allLegsPathable ? 'ok' : 'BROKEN';
  console.log(
    g.name.replace('enemy_', '').padEnd(10) +
      tile(g).padEnd(10) +
      `${Math.round((g.facing * 180) / Math.PI)}deg`.padEnd(8) +
      String(m.waypoints).padEnd(5) +
      String(Math.round(m.loopPixels)).padEnd(10) +
      m.loopSeconds.toFixed(1).padEnd(9) +
      String(Math.round(m.straightLinePixels)).padEnd(10) +
      ok
  );
}

// ----------------------------------------------------------- critical paths

const MAIN: [string, { x: number; y: number }][] = [
  ['spawn', byName('spawn')],
  ['tracks', byName('interact_tracks')],
  ['waybill', byName('interact_waybill')],
  ['market exit E', T(39, 48)],
  ['courtyard S', T(77, 42)],
  ['ledger', byName('interact_ledger')],
  ['garage door', T(82, 20)],
  ['van', byName('interact_van')],
  ['cultist', byName('actor_cultist')],
  ['inscription', byName('interact_inscription')],
  ['exit', { x: byName('exit_north').x + 24, y: byName('exit_north').y + 16 }],
];
const GARDEN: [string, { x: number; y: number }][] = [
  ['spawn', byName('spawn')],
  ['tracks', byName('interact_tracks')],
  ['waybill', byName('interact_waybill')],
  ['market exit NW', T(17, 31)],
  ['courtyard NW', T(52, 27)],
  ['ledger', byName('interact_ledger')],
  ['garage door', T(82, 20)],
  ['van', byName('interact_van')],
  ['cultist', byName('actor_cultist')],
  ['inscription', byName('interact_inscription')],
  ['exit', { x: byName('exit_north').x + 24, y: byName('exit_north').y + 16 }],
];

const statics = staticPosts(guards);
const patrols = patrolPosts(map.grid, guards);

function report(label: string, route: [string, { x: number; y: number }][]): void {
  const samples = samplePath(
    map.grid,
    route.map(([, p]) => p)
  );
  const fromPosts = exposure(map.grid, statics, samples);
  const fromPatrol = exposure(map.grid, patrols, samples);
  console.log(`\n${label}: ${samples.length} samples`);
  console.log(
    `  static-post exposure : ${(exposedFraction(fromPosts) * 100).toFixed(1)}%  ` +
      `max shooters ${maxShooters(fromPosts)}`
  );
  console.log(
    `  patrol exposure      : ${(exposedFraction(fromPatrol) * 100).toFixed(1)}%  ` +
      `max shooters ${maxShooters(fromPatrol)}`
  );
  const crouch = exposure(map.grid, statics, samples, 'crouching');
  console.log(
    `  crouched (static)    : ${(exposedFraction(crouch) * 100).toFixed(1)}%  ` +
      `max shooters ${maxShooters(crouch)}`
  );

  // Where the pressure actually sits, per leg.
  for (let i = 0; i < route.length - 1; i++) {
    const leg = samplePath(map.grid, [route[i][1], route[i + 1][1]]);
    if (leg.length === 0) continue;
    const e = exposure(map.grid, statics, leg);
    const ep = exposure(map.grid, patrols, leg);
    const guardsSeen = [...new Set(ep.flatMap((s) => s.seenBy))].map((n) => n.replace('enemy_', ''));
    console.log(
      `    ${(route[i][0] + ' -> ' + route[i + 1][0]).padEnd(30)} ` +
        `post ${(exposedFraction(e) * 100).toFixed(0).padStart(3)}%  ` +
        `patrol ${(exposedFraction(ep) * 100).toFixed(0).padStart(3)}%  ` +
        `${guardsSeen.sort().join(' ') || '-'}`
    );
  }
}

report('MAIN-STREET CRITICAL PATH', MAIN);
report('GARDEN CRITICAL PATH', GARDEN);

// --------------------------------------------------------- area coverage

const AREAS: [string, number, number, number, number][] = [
  ['market square', 9, 32, 34, 25],
  ['depot courtyard', 50, 20, 36, 24],
  ['garage + dock', 58, 6, 33, 15],
];
console.log('\nAREA COVERAGE (walkable tiles seen, standing player)');
for (const [name, x0, y0, w, h] of AREAS) {
  const tiles: { x: number; y: number }[] = [];
  for (let ty = y0; ty < y0 + h; ty++)
    for (let tx = x0; tx < x0 + w; tx++)
      if (!map.grid.solidAt(tx, ty)) tiles.push(T(tx, ty));
  const post = exposure(map.grid, statics, tiles);
  const pat = exposure(map.grid, patrols, tiles);
  console.log(
    `  ${name.padEnd(18)} ${String(tiles.length).padStart(4)} tiles   ` +
      `post ${(exposedFraction(post) * 100).toFixed(1).padStart(5)}%   ` +
      `patrol ${(exposedFraction(pat) * 100).toFixed(1).padStart(5)}%   ` +
      `max shooters ${maxShooters(pat)}`
  );
}

// ------------------------------------------------------------ alert chains

console.log('\nACOUSTIC LINKS (shout, post-to-post)');
for (const l of acousticLinks(map.grid, guards).filter((l) => l.heard))
  console.log(
    `  ${l.from.replace('enemy_', '')} -> ${l.to.replace('enemy_', '')}  ` +
      `${Math.round(l.distance)}px  radius ${l.audibleRadius}  ` +
      `${l.clearLineOfSound ? 'clear' : 'through wall'}`
  );

console.log('\nACOUSTIC LINKS (shout, closest approach along patrols)');
for (const l of acousticLinksAlongPatrol(map.grid, guards).filter((l) => l.heard))
  console.log(
    `  ${l.from.replace('enemy_', '')} -> ${l.to.replace('enemy_', '')}  ` +
      `${Math.round(l.distance)}px  radius ${l.audibleRadius}  ` +
      `${l.clearLineOfSound ? 'clear' : 'through wall'}`
  );

const unheard = acousticLinksAlongPatrol(map.grid, guards).filter((l) => !l.heard);
console.log(`\n  (${unheard.length} pairs never within earshot - encounters stay separate)`);

// --------------------------------------------------- door-crossing audit

console.log('\nDOOR-STATE PATROL AUDIT (doors start LOCKED)');
console.log(
  'guard'.padEnd(10) +
    'wps sealed'.padEnd(12) +
    'wps open'.padEnd(10) +
    'door legs'.padEnd(11) +
    'sealed loop px'.padEnd(16) +
    'verdict'
);
for (const a of doorAudit(map, guards)) {
  const verdict = !a.hasSealedPatrol
    ? 'BROKEN: nowhere to patrol while sealed'
    : a.doorDependentLegs > 0
      ? 'ok (deferred legs skipped until unlock)'
      : 'ok (no door dependency)';
  console.log(
    a.guard.replace('enemy_', '').padEnd(10) +
      `${a.reachableSealed}/${guards.find((g) => g.name === a.guard)!.route.length}`.padEnd(12) +
      `${a.reachableOpen}`.padEnd(10) +
      String(a.doorDependentLegs).padEnd(11) +
      String(Math.round(a.sealedLoopPixels)).padEnd(16) +
      verdict
  );
}

// --------------------------------------- nearest approach between encounters

console.log('\nNEAREST APPROACH between every guard pair (shout carries 160px)');
for (const l of acousticLinksAlongPatrol(map.grid, guards).sort((a, b) => a.distance - b.distance))
  console.log(
    `  ${l.from.replace('enemy_', '')}-${l.to.replace('enemy_', '')}  ` +
      `${String(Math.round(l.distance)).padStart(5)}px  ` +
      `${l.clearLineOfSound ? 'clear ' : 'walled'}  radius ${l.audibleRadius}  ` +
      `${l.heard ? 'LINKED' : '-'}`
  );
