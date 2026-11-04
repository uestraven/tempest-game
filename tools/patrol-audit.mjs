/**
 * Audits whether all seven Valcendre guards actually complete their patrols.
 *
 *   node tools/patrol-audit.mjs <chromium> [outDir]
 *
 * Found during Phase C.1B-04B-1 while trying to validate the radio
 * distraction: three of seven guards travel roughly a tenth of their expected
 * distance because their feet collider wedges on a diagonal wall corner. The
 * audit records, per guard, distance travelled against the authored loop and -
 * for anything that stalls - the physics blocked flags, the 3x3 solidity around
 * it, and whether A* still believes the next step is walkable.
 *
 * Read-only. It presses Enter to start the level and then only observes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/playtests/data'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/patrol-audit.mjs <chromium> [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HOOK = () => {
  let r;
  Object.defineProperty(window, 'Phaser', {
    configurable: true,
    get() {
      return r;
    },
    set(v) {
      r = v;
      const O = v.Game;
      function P(...a) {
        const g = new O(...a);
        window.__g = g;
        return g;
      }
      P.prototype = O.prototype;
      Object.setPrototypeOf(P, O);
      v.Game = P;
    },
  });
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
};

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.addInitScript(HOOK);
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__g?.scene?.isActive('Title'), { timeout: 30000 });
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => {
    const s = window.__g?.scene?.getScene('Village');
    return s?.scene.isActive() && s.enemies?.length === 7;
  },
  { timeout: 30000 }
);
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
}

const SAMPLE = () =>
  window.__g.scene.getScene('Village').enemies.map((e) => ({
    n: e.name,
    x: Math.round(e.x),
    y: Math.round(e.y),
    state: e.state,
    routeIndex: e.routeIndex,
  }));

const OBSERVE_SECONDS = 45;
const series = [await page.evaluate(SAMPLE)];
for (let i = 0; i < OBSERVE_SECONDS * 2; i++) {
  await page.waitForTimeout(500);
  series.push(await page.evaluate(SAMPLE));
}

const DIAGNOSE = () => {
  const s = window.__g.scene.getScene('Village');
  return s.enemies.map((e) => {
    const b = e.sprite.body;
    const tx = Math.floor(e.x / 16);
    const ty = Math.floor(e.y / 16);
    const neigh = [];
    for (let dy = -1; dy <= 1; dy++) {
      let row = '';
      for (let dx = -1; dx <= 1; dx++) row += s.level.grid.solidAt(tx + dx, ty + dy) ? '#' : '.';
      neigh.push(row);
    }
    const dest = e.debugDestination;
    const path = dest ? s.level.grid.findPath({ x: e.x, y: e.y }, dest, 60000) : null;
    return {
      n: e.name,
      tile: `${tx},${ty}`,
      feetTileSolid: s.level.grid.isSolidWorld(e.x, e.y),
      body: { x: Math.round(b.x), y: Math.round(b.y), w: b.width, h: b.height },
      // The body's top edge versus the top of the tile the feet occupy. A
      // positive overhang means the collider intrudes into the row above, which
      // is what lets a diagonal solid block an axis-aligned move.
      overhangIntoRowAbove: Math.round(ty * 16 - b.y),
      blocked: { up: b.blocked.up, down: b.blocked.down, left: b.blocked.left, right: b.blocked.right },
      speed: Math.round(b.velocity.length()),
      neighbourhood: neigh,
      destination: dest ? `${Math.floor(dest.x / 16)},${Math.floor(dest.y / 16)}` : null,
      astarSaysReachable: !!path,
      nextNodeDistance: path && path[0] ? Math.round(Math.hypot(path[0].x - e.x, path[0].y - e.y)) : null,
    };
  });
};
const diagnosis = await page.evaluate(DIAGNOSE);
await page.screenshot({ path: 'docs/playtests/screenshots/04b1-patrol-stall.png' });
await browser.close();

// Authored loop lengths, measured in Phase C.1B-03.
const LOOP_PX = {
  enemy_l1: 173,
  enemy_l2: 889,
  enemy_l3: 315,
  enemy_l4: 488,
  enemy_l5: 277,
  enemy_l6: 1646,
  enemy_l7: 1171,
};
const LOOP_S = {
  enemy_l1: 7.2,
  enemy_l2: 28.4,
  enemy_l3: 10.4,
  enemy_l4: 16.8,
  enemy_l5: 9.5,
  enemy_l6: 47.0,
  enemy_l7: 34.9,
};

const report = [];
console.log(`observed ${OBSERVE_SECONDS}s from a clean start\n`);
console.log(
  'guard'.padEnd(10) + 'travelled'.padEnd(12) + 'expected'.padEnd(11) + 'ratio'.padEnd(8) + 'verdict'
);
for (const g of series[0].map((x) => x.n)) {
  const pts = series.map((s) => s.find((y) => y.n === g));
  const travelled = pts.reduce(
    (a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0),
    0
  );
  const expected = (LOOP_PX[g] / LOOP_S[g]) * OBSERVE_SECONDS;
  const ratio = travelled / expected;
  const d = diagnosis.find((x) => x.n === g);
  const stalled = ratio < 0.5;
  report.push({ guard: g, travelled: Math.round(travelled), expected: Math.round(expected), ratio: +ratio.toFixed(2), stalled, diagnosis: d });
  console.log(
    g.replace('enemy_', '').padEnd(10) +
      `${Math.round(travelled)}px`.padEnd(12) +
      `${Math.round(expected)}px`.padEnd(11) +
      `${ratio.toFixed(2)}x`.padEnd(8) +
      (stalled ? 'STALLED' : 'ok')
  );
}

const stalled = report.filter((r) => r.stalled);
if (stalled.length) {
  console.log('\n--- stalled guards ---');
  for (const r of stalled) {
    const d = r.diagnosis;
    console.log(
      `${r.guard}: tile ${d.tile}, body ${d.body.w}x${d.body.h} at ${d.body.x},${d.body.y}, ` +
        `overhang into row above ${d.overhangIntoRowAbove}px`
    );
    console.log(
      `   blocked ${JSON.stringify(d.blocked)}, speed ${d.speed}, ` +
        `destination ${d.destination}, A* reachable ${d.astarSaysReachable}, ` +
        `next node ${d.nextNodeDistance}px`
    );
    console.log(`   3x3 solidity: ${d.neighbourhood.join(' / ')}`);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  `${outDir}/patrol-audit.json`,
  JSON.stringify({ observedSeconds: OBSERVE_SECONDS, report, series }, null, 1)
);
console.log(`\nwrote ${outDir}/patrol-audit.json`);
