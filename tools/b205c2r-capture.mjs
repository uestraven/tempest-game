/**
 * Phase B.2-05C-2R captures: garden walkway and north road.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/b205c2r-capture.mjs <chromium> before|after [outDir]
 *
 * Identical camera coordinates in both passes. Native 480x270, overlays off.
 * STAGED frames place actors through a debug handle; PLAYED frames are driven
 * entirely by real keyboard events.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, label = 'after', outDir = 'docs/art-integration/screenshots/b205c2r'] =
  process.argv.slice(2);
if (!executablePath || !['before', 'after'].includes(label)) {
  console.error('usage: node tools/b205c2r-capture.mjs <chromium> before|after [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require('playwright');
  } catch {
    return require('playwright-core');
  }
})();
mkdirSync(outDir, { recursive: true });

const T = (tx, ty) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

const SHOTS = [
  { id: 'garden-walk-north', cam: T(8, 7), note: 'Garden walkway, north stretch (gardenWalk x6-11 y3-22).' },
  { id: 'garden-walk-mid', cam: T(8, 13), note: 'Garden walkway, middle stretch.' },
  { id: 'garden-walk-grass-edge', cam: T(9, 21), note: 'Garden walkway where it meets the bakery grass: no transition art may appear.' },
  { id: 'north-road', cam: T(62, 3), note: 'North road: authored dirt, must keep its legacy appearance.' },
  { id: 'market-arcade', cam: T(13, 45), note: 'Market arcade, unchanged by this phase.' },
  { id: 'market-stall', cam: { x: 504, y: 792 }, note: 'Market stall: the B.2-05C-1 occlusion fix must still hold.' },
];

/** Concealment probes repeated from B.2-05C-2, plus the garden walkway. */
const CONCEAL_PROBES = [
  [8, 7], // garden walkway, shaded + now visually treated
  [8, 13], // garden walkway
  [8, 21], // garden walkway, south end
  [9, 24], // bakery grass, shaded but NOT cobblestone
  [11, 45], // market arcade, shaded
  [24, 44], // lit market paving
  [13, 45], // first lit tile east of the arcade
  [18, 35], // covered market row, shaded
  [7, 60], // arrival alley, shaded
  [30, 47], // V1 evidence tile: visually treated daylight cobble, NOT concealed
  [62, 3], // north road: dirt, no treatment
];

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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160));
});
await page.addInitScript(HOOK);

const boot = async () => {
  await page.waitForFunction(() => window.__g?.scene?.isActive('Title'), { timeout: 30000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const s = window.__g?.scene?.getScene('Village');
      return s?.scene.isActive() && s.enemies?.length === 7 && s.player;
    },
    { timeout: 30000 }
  );
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(130);
  }
};

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await boot();

const manifest = [];
const problems = [];

// =====================================================================
// 1. engine state and gameplay invariants
// =====================================================================
const state = await page.evaluate((probes) => {
  const s = window.__g.scene.getScene('Village');
  const g = s.level.grid;
  let collides = 0;
  let shadow = 0;
  let blocksSight = 0;
  let lowCover = 0;
  for (let y = 0; y < s.level.map.height; y++)
    for (let x = 0; x < s.level.map.width; x++) {
      const f = g.at(x, y);
      if (f.collides) collides++;
      if (f.shadow) shadow++;
      if (f.blocksSight) blocksSight++;
      if (f.lowCover) lowCover++;
    }
  const objects = {};
  for (const p of s.props) objects[p.id ?? p.kind] = [Math.floor(p.x / 16), Math.floor(p.y / 16)];
  return {
    artV2: !!s.artV2,
    debugHitboxes: s.debugHitboxes,
    report: s.artV2 ? s.artV2.report : null,
    mapProperties: s.level.map.properties,
    totals: { collides, shadow, blocksSight, lowCover },
    conceal: probes.map(([x, y]) => ({ tile: [x, y], shadow: g.at(x, y).shadow })),
    enemies: s.enemies.map((e) => ({ name: e.name, tile: [Math.floor(e.x / 16), Math.floor(e.y / 16)] })),
    patrolPoints: s.enemies.map((e) => (e.route ?? []).map((w) => [w.x, w.y])),
    doors: s.level.grid.doorStates ? s.level.grid.doorStates() : null,
    objects,
  };
}, CONCEAL_PROBES);

console.log(`\n--- ${label}: engine state ---`);
console.log(`  artV2=${state.artV2} debugOverlay=${state.debugHitboxes}`);
console.log(`  grid totals: ${JSON.stringify(state.totals)}`);
if (state.report?.ground) {
  const g = state.report.ground;
  console.log(
    `  ground: daylight=${g.daylightTiles} shadedInterior=${g.shadedInteriorTiles} boundary=${g.boundaryTiles} overlays=${g.overlayTiles}/${g.overlaysDrawn} layers=${g.layers}`
  );
  if (g.materials) console.log(`  materials: ${JSON.stringify(g.materials)}`);
}
console.log(`  concealment: ${state.conceal.map((c) => `${c.tile}=${c.shadow ? 'shadow' : '-'}`).join(' ')}`);

if (label === 'after') {
  const g = state.report?.ground;
  if (!g) problems.push('no ground report');
  else {
    if (g.daylightTiles !== 899) problems.push(`daylight tiles ${g.daylightTiles}, expected 899`);
    if (g.shadedInteriorTiles + g.boundaryTiles !== 195)
      problems.push(`shaded tiles ${g.shadedInteriorTiles + g.boundaryTiles}, expected 195`);
    if (g.materials?.dirt !== 30) problems.push(`dirt material tiles ${g.materials?.dirt}, expected 30`);
  }
}

// =====================================================================
// 2. STAGED captures
// =====================================================================
const park = () =>
  page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    let i = 0;
    for (const e of s.enemies) {
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
    s.player.sprite.setPosition(8, 8);
    s.player.sprite.body.reset(8, 8);
    s.cameras.main.stopFollow();
  });

const pin = (cam) =>
  page.evaluate((c) => {
    const s = window.__g.scene.getScene('Village');
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(c.x, c.y);
    return { scrollX: s.cameras.main.scrollX, scrollY: s.cameras.main.scrollY };
  }, cam);

async function shot(file, kind, note, extra = {}) {
  await page.screenshot({ path: `${outDir}/${file}` });
  manifest.push({ file, kind, note, ...extra });
  console.log(`  ${kind.padEnd(6)} ${file}  ${note}`);
}

console.log(`\n--- ${label}: staged ---`);
await park();
const scrolls = {};
for (const sh of SHOTS) {
  scrolls[sh.id] = await pin(sh.cam);
  await page.waitForTimeout(420);
  await shot(`01-${label}-${sh.id}.png`, 'STAGED', sh.note, { camera: sh.cam, scroll: scrolls[sh.id] });
}

// Actors on the garden walkway.
const placeOnWalk = (player, crouched, guard) =>
  page.evaluate(
    (c) => {
      const s = window.__g.scene.getScene('Village');
      s.player.sprite.setPosition(c.player.x, c.player.y);
      s.player.sprite.body.reset(c.player.x, c.player.y);
      s.player.crouched = c.crouched;
      if (c.guard) {
        const g = s.enemies[1];
        g.sprite.setPosition(c.guard.x, c.guard.y);
        g.sprite.body.reset(c.guard.x, c.guard.y);
        g.state = 'patrol';
        g.suspicion = 0;
      }
      s.cameras.main.stopFollow();
      s.cameras.main.centerOn(c.cam.x, c.cam.y);
      return { crouched: s.player.crouched, inShadow: s.level.grid.isShadowWorld(s.player.x, s.player.y) };
    },
    { player, crouched, guard, cam: T(8, 13) }
  );

let r = await placeOnWalk(T(8, 13), false, null);
await page.waitForTimeout(500);
await shot(`02-${label}-garden-walk-tempest-standing.png`, 'STAGED', `Tempest standing on the garden walkway. inShadow=${r.inShadow}`);

r = await placeOnWalk(T(8, 13), true, null);
await page.waitForTimeout(500);
await shot(`03-${label}-garden-walk-tempest-crouching.png`, 'STAGED', `Tempest crouching on the garden walkway. crouched=${r.crouched} inShadow=${r.inShadow}`);

r = await placeOnWalk(T(8, 15), false, T(9, 12));
await page.waitForTimeout(500);
await shot(`04-${label}-garden-walk-lookout-near.png`, 'STAGED', 'A Lookout on the garden path near Tempest.');

// Lookout walking, physics-driven, on the walkway.
const walkSamples = [];
{
  const t0 = Date.now();
  while (Date.now() - t0 < 2200) {
    walkSamples.push(
      await page.evaluate(() => {
        const s = window.__g.scene.getScene('Village');
        const g = s.enemies[1];
        g.sprite.body.setVelocity(0, 40);
        return {
          y: Math.round(g.y * 100) / 100,
          anim: g.sprite.anims.currentAnim?.key ?? null,
          displayH: g.sprite.displayHeight,
        };
      })
    );
    await page.waitForTimeout(90);
  }
  await page.evaluate(() => {
    window.__g.scene.getScene('Village').enemies[1].sprite.body.setVelocity(0, 0);
  });
}
const sizes = new Set(walkSamples.map((s) => s.displayH));
if (sizes.size !== 1) problems.push(`lookout display height changed: ${[...sizes]}`);
await shot(
  `05-${label}-garden-walk-lookout-moving.png`,
  'STAGED',
  `Lookout mid-walk on the garden path; ${walkSamples.length} samples, display height ${[...sizes].join('/')}`
);

// =====================================================================
// 3. PLAYED - enter and leave the garden concealment area
// =====================================================================
const keys = async (held, list) => {
  const want = new Set(list);
  for (const k of [...held])
    if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of want)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
};
const obs = () =>
  page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    return {
      x: s.player.x,
      y: s.player.y,
      tile: [Math.floor(s.player.x / 16), Math.floor(s.player.y / 16)],
      crouched: s.player.crouched,
      inShadow: s.level.grid.isShadowWorld(s.player.x, s.player.y),
      objectives: s.mission.snapshot().objectives.completed,
    };
  });

async function travel(to, ms = 90000, samples = null) {
  const held = new Set();
  const t0 = Date.now();
  let stuck = 0;
  let last = null;
  while (Date.now() - t0 < ms) {
    const o = await obs();
    if (samples) samples.push(o);
    if (Math.hypot(to.x - o.x, to.y - o.y) < 12) break;
    const path = await page.evaluate((t) => {
      const s = window.__g.scene.getScene('Village');
      const p = s.level.grid.findPath({ x: s.player.x, y: s.player.y }, t, 60000);
      return p ? p.map((q) => ({ x: q.x, y: q.y })) : null;
    }, to);
    if (!path?.length) {
      await keys(held, [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']][stuck % 4]);
      await page.waitForTimeout(200);
      await keys(held, []);
      if (++stuck > 8) break;
      continue;
    }
    let next = path[0];
    for (const n of path)
      if (Math.hypot(n.x - o.x, n.y - o.y) > 10) {
        next = n;
        break;
      }
    const dx = next.x - o.x;
    const dy = next.y - o.y;
    const mag = Math.hypot(dx, dy) || 1;
    const k = [];
    if (dx / mag > 0.38) k.push('KeyD');
    else if (dx / mag < -0.38) k.push('KeyA');
    if (dy / mag > 0.38) k.push('KeyS');
    else if (dy / mag < -0.38) k.push('KeyW');
    if (!k.length) k.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'KeyD' : 'KeyA') : dy > 0 ? 'KeyS' : 'KeyW');
    k.push('ShiftLeft');
    await keys(held, k);
    await page.waitForTimeout(85);
    if (last && Math.hypot(o.x - last.x, o.y - last.y) < 1.2) {
      if (++stuck > 18) {
        await keys(held, ['KeyD']);
        await page.waitForTimeout(250);
        stuck = 0;
      }
    } else stuck = 0;
    last = { x: o.x, y: o.y };
  }
  await keys(held, []);
}

const tap = async (code, hold = 130) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(80);
};

console.log(`\n--- ${label}: played ---`);
await page.reload({ waitUntil: 'networkidle' });
await boot();

const played = {};

// Enter the garden concealment area from the lit bakery yard.
const enter = [];
await travel(T(9, 24), 90000, enter); // bakery grass, shaded but not cobblestone
await travel(T(8, 20), 60000, enter); // onto the walkway
let o = await obs();
played.enteredWalkway = o.tile[0] >= 6 && o.tile[0] <= 11 && o.tile[1] >= 3 && o.tile[1] <= 22;
played.walkwayConcealed = o.inShadow;
await shot(
  `06-${label}-played-entered-garden-concealment.png`,
  'PLAYED',
  `Walked onto the garden walkway under real input. tile=${o.tile} engine inShadow=${o.inShadow}`
);

await tap('KeyC');
o = await obs();
played.crouchedOnWalkway = o.crouched;
played.crouchConcealed = o.inShadow;
await shot(
  `07-${label}-played-crouched-on-walkway.png`,
  'PLAYED',
  `Crouched by a real C press: ${o.crouched}; inShadow=${o.inShadow}`
);
await tap('KeyC');

// Leave the concealment area, sampling the flag as it flips.
const leave = [];
await travel(T(14, 27), 90000, leave); // out of the garden stamp, into the lit yard
o = await obs();
played.leftConcealment = leave.some((s) => s.inShadow) && leave.some((s) => !s.inShadow);
played.finalInShadow = o.inShadow;
await shot(
  `08-${label}-played-left-garden-concealment.png`,
  'PLAYED',
  `Walked out of the garden concealment. transitions seen=${played.leftConcealment} final inShadow=${o.inShadow}`
);

if (!played.enteredWalkway) problems.push('never reached the garden walkway under real input');
if (!played.walkwayConcealed) problems.push('garden walkway did not report concealment');
if (!played.leftConcealment) problems.push('no concealment transition observed on leaving');

if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);

writeFileSync(
  `${outDir}/telemetry-${label}.json`,
  JSON.stringify({ label, state, scrolls, played, enter, leave, walkSamples, shots: manifest, errors, problems }, null, 1)
);

await page.close();
await browser.close();

console.log(`\n--- ${label} summary ---`);
for (const [k, v] of Object.entries(played)) console.log(`  ${k}: ${v}`);
console.log(problems.length ? `  PROBLEMS: ${problems.join(' | ')}` : '  no problems');
console.log(`\nwrote ${manifest.length} captures + telemetry-${label}.json to ${outDir}`);
