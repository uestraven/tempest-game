/**
 * Phase B.2-05C-2 engine verification and captures.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/b205c2-shade-capture.mjs <chromium> before|after [outDir]
 *
 * Identical camera coordinates in both passes, so every before/after pair is a
 * like-for-like frame of the same world. Native 480x270, debug overlays off.
 *
 *   STAGED  camera and actors placed through a debug handle.
 *   PLAYED  driven entirely by real keyboard events.
 *
 * Also records, as data rather than impression: the loaded texture dimensions,
 * the ground composition counts, the concealment flag at representative
 * positions, and the shadowZones / collision totals - so "gameplay unchanged"
 * is a measurement and not a claim.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, label = 'after', outDir = 'docs/art-integration/screenshots/b205c2'] =
  process.argv.slice(2);
if (!executablePath || !['before', 'after'].includes(label)) {
  console.error('usage: node tools/b205c2-shade-capture.mjs <chromium> before|after [outDir]');
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

/**
 * Camera targets, fixed across both passes.
 *
 * Chosen from the material audit's eligible regions:
 *   marketArcade  x9-12  y40-49  shaded alleyCobble, abutting lit marketPaving
 *                                along the whole x12|x13 line - the longest
 *                                straight transition in the level
 *   marketPlaza   x16-30 y35-36  two shaded bands inside lit paving, which is
 *                                where the island, T and corner cases live
 *   alley         x6-8   y58-62  shaded cobble in an L against the lit alley
 */
const SHOTS = [
  { id: 'market-daylight', cam: T(24, 44), note: 'Lit market paving, away from any boundary.' },
  { id: 'arcade-transition', cam: T(13, 45), note: 'West arcade: the long straight light-to-shade edge at x12|x13.' },
  { id: 'arcade-north-end', cam: T(11, 41), note: 'Arcade north end: the outside corner where the shade stops.' },
  { id: 'arcade-south-end', cam: T(11, 49), note: 'Arcade south end: the other outside corner.' },
  { id: 'covered-rows', cam: T(19, 36), note: 'Covered market row: a shaded band inside lit paving on all sides.' },
  { id: 'covered-rows-east', cam: T(28, 36), note: 'The second covered row, for the T and corner cases.' },
  { id: 'alley-shade', cam: T(7, 60), note: 'Arrival alley: shaded cobble in an L against lit cobble.' },
  { id: 'bakery-garden', cam: T(10, 24), note: 'Bakery/garden route. Grass and the garden walk are both excluded, so this must be UNCHANGED.' },
  { id: 'full-market', cam: T(24, 42), note: 'Wide market view after integration.' },
];

/** Concealment probes: the flag must be identical before and after. */
const CONCEAL_PROBES = [
  [11, 45], // arcade interior, shaded
  [11, 40], // arcade north, shaded
  [24, 44], // lit market
  [13, 45], // first lit tile east of the arcade
  [18, 35], // covered row, shaded
  [18, 34], // lit tile north of the covered row
  [7, 60], // alley, shaded
  [14, 60], // alley, lit
  [8, 10], // garden walk, shaded but excluded from the treatment
  [30, 47], // the V1 evidence tile
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
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
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

const manifest = [];
const problems = [];

// =====================================================================
// 1. what the engine actually loaded and composed
// =====================================================================
const state = await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  const tex = (k) => {
    const t = s.textures.exists(k) ? s.textures.get(k) : null;
    if (!t) return { key: k, loaded: false };
    const src = t.source[0];
    return {
      key: k,
      loaded: true,
      width: src.width,
      height: src.height,
      frameTotal: t.frameTotal,
    };
  };
  const layerNames = s.level.map.layers.map((l) => l.name);
  const groundLayers = s.level.map.layers
    .filter((l) => l.name.startsWith('valcendre_v2'))
    .map((l) => l.name);
  return {
    artV2: !!s.artV2,
    debugHitboxes: s.debugHitboxes,
    report: s.artV2 ? s.artV2.report : null,
    textures: [
      'tiles.valcendre.v2.cobble',
      'tiles.valcendre.v2.cobbleShaded',
      'tiles.valcendre.v2.shadeBoundaries',
      'tiles.valcendre.v2.shadeCorners',
    ].map(tex),
    mapLayerNames: layerNames,
    programmaticGroundLayers: groundLayers,
  };
});

console.log(`\n--- ${label}: engine state ---`);
console.log(`  artV2=${state.artV2} debugOverlay=${state.debugHitboxes}`);
for (const t of state.textures)
  console.log(
    `  ${t.loaded ? 'OK  ' : 'MISSING'} ${t.key.padEnd(36)} ${t.loaded ? `${t.width}x${t.height} frames=${t.frameTotal}` : ''}`
  );
if (state.report?.ground) {
  const g = state.report.ground;
  console.log(
    `  ground: daylight=${g.daylightTiles} shadedInterior=${g.shadedInteriorTiles} boundary=${g.boundaryTiles} overlayCells=${g.overlayTiles} overlaysDrawn=${g.overlaysDrawn} layers=${g.layers} gardenWalk=${g.gardenWalkIncluded}`
  );
  console.log(`  total ground tiles painted: ${state.report.pavingTiles}`);
}
if (label === 'after') {
  const expected = {
    'tiles.valcendre.v2.cobbleShaded': [64, 16, 4],
    'tiles.valcendre.v2.shadeBoundaries': [128, 128, 64],
    'tiles.valcendre.v2.shadeCorners': [128, 32, 16],
  };
  for (const [key, [w, h, frames]] of Object.entries(expected)) {
    const t = state.textures.find((q) => q.key === key);
    if (!t?.loaded) problems.push(`${key} did not load`);
    // Phaser's frameTotal counts the implicit whole-image `__BASE` frame, so a
    // 64-tile atlas reports 65.
    else if (t.width !== w || t.height !== h || t.frameTotal !== frames + 1)
      problems.push(`${key} is ${t.width}x${t.height}/${t.frameTotal}, expected ${w}x${h}/${frames + 1}`);
  }
  if (!state.report?.ground?.boundaryTiles) problems.push('no cardinal boundary tiles were painted');
}

// =====================================================================
// 2. gameplay invariants, measured
// =====================================================================
const invariants = await page.evaluate((probes) => {
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
  return {
    totals: { collides, shadow, blocksSight, lowCover },
    conceal: probes.map(([x, y]) => ({ tile: [x, y], shadow: g.at(x, y).shadow, collides: g.at(x, y).collides })),
    enemies: s.enemies.length,
    objectives: s.mission.snapshot().objectives.completed,
    speeds: { walk: s.player.constructor.name },
  };
}, CONCEAL_PROBES);

console.log(`\n--- ${label}: gameplay invariants ---`);
console.log(`  grid totals: ${JSON.stringify(invariants.totals)}`);
console.log(`  concealment probes: ${invariants.conceal.map((c) => `${c.tile}=${c.shadow ? 'shadow' : '-'}`).join(' ')}`);

// =====================================================================
// 3. STAGED captures at fixed camera coordinates
// =====================================================================
const park = async () =>
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

console.log(`\n--- ${label}: staged ground captures ---`);
await park();
const scrolls = {};
for (const s of SHOTS) {
  scrolls[s.id] = await pin(s.cam);
  await page.waitForTimeout(420);
  await shot(`01-${label}-${s.id}.png`, 'STAGED', s.note, { camera: s.cam, scroll: scrolls[s.id] });
}

// =====================================================================
// 4. STAGED actors across a boundary
// =====================================================================
console.log(`\n--- ${label}: actors at a boundary ---`);
const placeActors = (player, guard) =>
  page.evaluate(
    (c) => {
      const s = window.__g.scene.getScene('Village');
      s.player.sprite.setPosition(c.player.x, c.player.y);
      s.player.sprite.body.reset(c.player.x, c.player.y);
      if (c.guard) {
        const g = s.enemies[1];
        g.sprite.setPosition(c.guard.x, c.guard.y);
        g.sprite.body.reset(c.guard.x, c.guard.y);
        g.state = 'patrol';
        g.suspicion = 0;
      }
      s.cameras.main.stopFollow();
      s.cameras.main.centerOn(c.cam.x, c.cam.y);
      return { player: { x: s.player.x, y: s.player.y }, guard: c.guard ? { x: s.enemies[1].x, y: s.enemies[1].y } : null };
    },
    { player, guard, cam: T(12, 45) }
  );

await placeActors(T(11, 45), T(14, 45));
await page.waitForTimeout(500);
await shot(
  `02-${label}-tempest-in-shade-lookout-in-light.png`,
  'STAGED',
  'Tempest on shaded arcade cobble, a Lookout on lit paving, same frame across the boundary.'
);

await placeActors(T(12, 45), T(13, 45));
await page.waitForTimeout(500);
await shot(
  `03-${label}-actors-either-side-of-the-edge.png`,
  'STAGED',
  'Tempest on the last shaded tile, the Lookout on the first lit tile.'
);

// =====================================================================
// 5. PLAYED - real input through the affected ground
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
    const t = s.interaction.resolve(s.player, s.enemies, (id) => s.mission.isComplete(id));
    return {
      x: s.player.x,
      y: s.player.y,
      tile: [Math.floor(s.player.x / 16), Math.floor(s.player.y / 16)],
      crouched: s.player.crouched,
      inShadow: s.level.grid.isShadowWorld(s.player.x, s.player.y),
      prompt: t ? t.prompt : null,
      objectives: s.mission.snapshot().objectives.completed,
    };
  });

async function travel(to, ms = 60000, samples = null) {
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

const played = {};

// Walk into the arcade shade under real input.
await travel(T(11, 46), 90000);
let o = await obs();
played.reachedArcade = o.tile[0] <= 12 && o.tile[1] >= 40 && o.tile[1] <= 49;
played.arcadeInShadow = o.inShadow;
await shot(
  `04-${label}-played-walked-into-arcade-shade.png`,
  'PLAYED',
  `Walked into the arcade shade. tile=${o.tile} engine reports inShadow=${o.inShadow}`
);

// Crouch there, with a real C press.
await tap('KeyC');
o = await obs();
played.crouchedInShade = o.crouched;
played.crouchStillInShadow = o.inShadow;
await shot(
  `05-${label}-played-crouched-in-shade.png`,
  'PLAYED',
  `Crouched by a real C press: ${o.crouched}; inShadow=${o.inShadow}`
);
await tap('KeyC');

// Walk out of the shade into the lit square, sampling as we cross. The arcade
// is separated from the square by stone pillars, so a due-east push is blocked;
// the engine's own route is used instead, still driven by real key presses.
const crossSamples = [];
await travel(T(17, 45), 45000, crossSamples);
played.crossedIntoLight = crossSamples.some((s) => !s.inShadow) && crossSamples.some((s) => s.inShadow);
await shot(
  `06-${label}-played-crossed-into-light.png`,
  'PLAYED',
  `Walked east out of the shade under real input. shadow transitions seen: ${played.crossedIntoLight}`
);

// A mission beat, by real input: the V1 stall evidence.
//
// Started from a FRESH load rather than continuing from the shade walk above:
// by that point the player has been crouching and wandering the square for a
// couple of minutes, and a patrol interrupting the approach makes this capture
// flaky for reasons that have nothing to do with the ground artwork.
await page.reload({ waitUntil: 'networkidle' });
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

let prompt = null;
for (const approach of [T(30, 48), T(31, 48), T(30, 47)]) {
  await travel(approach, 60000);
  for (let i = 0; i < 12; i++) {
    const q = await obs();
    if (q.prompt) {
      prompt = q.prompt;
      break;
    }
    await keys(new Set(), ['KeyW']);
    await page.waitForTimeout(90);
    await keys(new Set(), []);
  }
  if (prompt) break;
}
const before = (await obs()).objectives.length;
if (prompt) await tap('KeyE');
await page.waitForTimeout(450);
const after = await obs();
played.v1Prompt = prompt;
played.v1Granted = after.objectives.length > before || after.objectives.includes('V1');
played.v1FinalState = after;
await page.keyboard.press('Space');
await page.waitForTimeout(260);
await page.keyboard.press('Space');
await shot(
  `07-${label}-played-mission-progress.png`,
  'PLAYED',
  `V1 granted by a real E press: ${played.v1Granted}; objectives ${after.objectives.join(',') || 'none'}`
);
if (!played.v1Granted) problems.push('V1 was NOT granted by a real E press');

// Camera motion over the boundary, to check for scrolling artifacts.
console.log(`\n--- ${label}: camera scroll over the boundary ---`);
await park();
const scrollFrames = [];
for (let i = 0; i <= 6; i++) {
  const cx = 9 * 16 + 8 + i * 11;
  await pin({ x: cx, y: 45 * 16 + 8 });
  await page.waitForTimeout(220);
  const f = `08-${label}-scroll-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: `${outDir}/${f}` });
  manifest.push({ file: f, kind: 'STAGED', note: `Camera scrolled across the arcade edge, step ${i} (cameraX=${cx}).` });
  scrollFrames.push({ step: i, cameraX: cx });
}
console.log(`  ${scrollFrames.length} frames at sub-tile camera offsets across the x12|x13 edge`);

if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);

writeFileSync(
  `${outDir}/telemetry-${label}.json`,
  JSON.stringify({ label, state, invariants, scrolls, played, scrollFrames, shots: manifest, errors, problems }, null, 1)
);

await page.close();
await browser.close();

console.log(`\n--- ${label} summary ---`);
for (const [k, v] of Object.entries(played)) console.log(`  ${k}: ${v}`);
console.log(problems.length ? `  PROBLEMS: ${problems.join(' | ')}` : '  no problems');
console.log(`\nwrote ${manifest.length} captures + telemetry-${label}.json to ${outDir}`);
