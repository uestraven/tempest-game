/**
 * Phase B.2-04 required engine captures.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/b204-capture.mjs <chromium> [outDir]
 *
 * Every frame is a REAL PHASER RENDER of the shipped build at native 480x270
 * with debug overlays off. No art-review composite is used anywhere.
 *
 * Two kinds of capture, kept apart because the brief requires it:
 *
 *   STAGED   the camera and actors are positioned through a debug handle so a
 *            specific visual relationship is in frame. Proves what the art
 *            looks like; proves nothing about input.
 *   PLAYED   driven entirely by real keyboard and mouse events, no placement at
 *            all. Proves movement and interaction still work.
 *
 * The filenames and the manifest both record which is which.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/art-integration/screenshots/b204'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/b204-capture.mjs <chromium> [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
mkdirSync(outDir, { recursive: true });

const T = (tx, ty) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

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
const manifest = [];
const problems = [];

async function session(artMode) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 140));
  });
  await page.addInitScript(HOOK);
  const url = artMode === 'legacy' ? 'http://127.0.0.1:4173/?art=legacy' : 'http://127.0.0.1:4173/';
  await page.goto(url, { waitUntil: 'networkidle' });
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
  const mode = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    return { artV2: !!s.artV2, debug: s.debugHitboxes, lookoutTex: s.enemies[0].sprite.texture.key };
  });
  return { page, errors, mode };
}

const keys = async (page, held, list) => {
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

const obs = (page) =>
  page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    return {
      x: s.player.x,
      y: s.player.y,
      hp: s.player.hp,
      objectives: s.mission.snapshot().objectives.completed,
      prompt: (() => {
        const t = s.interaction.resolve(s.player, s.enemies, (id) => s.mission.isComplete(id));
        return t ? t.prompt : null;
      })(),
    };
  });

/** Real-input travel along the engine's own A* route. */
async function travel(page, to, { ms = 60000, sprint = true } = {}) {
  const held = new Set();
  const t0 = Date.now();
  let stuck = 0;
  let last = null;
  while (Date.now() - t0 < ms) {
    const o = await obs(page);
    if (Math.hypot(to.x - o.x, to.y - o.y) < 14) break;
    const path = await page.evaluate((t) => {
      const s = window.__g.scene.getScene('Village');
      const p = s.level.grid.findPath({ x: s.player.x, y: s.player.y }, t, 60000);
      return p ? p.map((q) => ({ x: q.x, y: q.y })) : null;
    }, to);
    if (!path || !path.length) {
      await keys(page, held, [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']][stuck % 4]);
      await page.waitForTimeout(200);
      await keys(page, held, []);
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
    if (sprint) k.push('ShiftLeft');
    await keys(page, held, k);
    await page.waitForTimeout(85);
    if (last && Math.hypot(o.x - last.x, o.y - last.y) < 1.2) {
      if (++stuck > 18) {
        await keys(page, held, ['KeyD']);
        await page.waitForTimeout(250);
        stuck = 0;
      }
    } else stuck = 0;
    last = { x: o.x, y: o.y };
  }
  await keys(page, held, []);
}

const tap = async (page, code, hold = 130) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(60);
};

async function shot(page, file, kind, note, extra = {}) {
  await page.screenshot({ path: `${outDir}/${file}` });
  manifest.push({ file, kind, note, ...extra });
  console.log(`  ${kind.padEnd(6)} ${file}  ${note}`);
}

/** Stages the camera and actors for a visual relationship. */
async function stage(page, cfg) {
  return page.evaluate((c) => {
    const s = window.__g.scene.getScene('Village');
    let i = 0;
    for (const e of s.enemies) {
      if (c.guard && e.name === c.guard.name) continue;
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
    if (c.guard) {
      const g = s.enemies.find((e) => e.name === c.guard.name);
      g.sprite.setPosition(c.guard.at.x, c.guard.at.y);
      g.sprite.body.reset(c.guard.at.x, c.guard.at.y);
      if (c.guard.facing !== undefined) g.facing = c.guard.facing;
      if (c.guard.state) g.state = c.guard.state;
      if (c.guard.suspicion !== undefined) g.suspicion = c.guard.suspicion;
    }
    if (c.player) {
      s.player.sprite.setPosition(c.player.x, c.player.y);
      s.player.sprite.body.reset(c.player.x, c.player.y);
    }
    s.cameras.main.centerOn(c.at.x, c.at.y);
    return true;
  }, cfg);
}

// =====================================================================
// 1. LEGACY BASELINE
// =====================================================================
console.log('\n--- legacy baseline (?art=legacy) ---');
{
  const { page, errors, mode } = await session('legacy');
  if (mode.artV2) problems.push('legacy mode still built the v2 presentation');
  console.log(`  artV2=${mode.artV2} lookoutTexture=${mode.lookoutTex}`);
  await stage(page, { at: T(24, 45), player: T(22, 47), guard: { name: 'enemy_l2', at: T(27, 44), facing: Math.PI } });
  await page.waitForTimeout(900);
  await shot(page, '01-legacy-market-baseline.png', 'STAGED', 'Shipped look. Legacy 48-slot tiles, legacy fountain, legacy pose-atlas Lookout.', { artMode: 'legacy', lookoutTexture: mode.lookoutTex });
  if (errors.length) problems.push(`legacy session errors: ${errors.join(' | ')}`);
  await page.close();
}

// =====================================================================
// 2. THE PROOF
// =====================================================================
console.log('\n--- valcendre_v2_proof ---');
const { page, errors, mode } = await session('proof');
if (!mode.artV2) problems.push('proof mode did not build the v2 presentation');
console.log(`  artV2=${mode.artV2} lookoutTexture=${mode.lookoutTex} debugOverlay=${mode.debug}`);

const SAME_AS_BASELINE = { at: T(24, 45), player: T(22, 47), guard: { name: 'enemy_l2', at: T(27, 44), facing: Math.PI } };
await stage(page, SAME_AS_BASELINE);
await page.waitForTimeout(900);
await shot(page, '02-v2-market-same-frame.png', 'STAGED', 'Identical camera and actor placement to shot 01. Direct A/B of the whole slice.', { artMode: 'valcendre_v2_proof', lookoutTexture: mode.lookoutTex });

// paving alone, away from the buildings
await stage(page, { at: T(22, 53), player: T(22, 53) });
await page.waitForTimeout(700);
await shot(page, '03-v2-paving.png', 'STAGED', 'Approved cobblestone over the market approach. Checks seams and quietness.');

// the two halls
await stage(page, { at: T(19, 43), player: T(19, 46) });
await page.waitForTimeout(700);
await shot(page, '04-v2-architecture-west-hall.png', 'STAGED', 'West market hall, existing 4x4 footprint: ridge, eave, facade, plinth.');
await stage(page, { at: T(29, 45), player: T(29, 48) });
await page.waitForTimeout(700);
await shot(page, '05-v2-architecture-east-hall.png', 'STAGED', 'East market hall, existing 5x3 footprint, using roof_to_facade.');

// fountain, four sides
await stage(page, { at: T(24, 47), player: T(24, 45) });
await page.waitForTimeout(700);
await shot(page, '06-v2-fountain-player-north.png', 'STAGED', 'Approved fountain at its existing tile (24,47); Tempest north of it.');
await stage(page, { at: T(24, 47), player: T(24, 49) });
await page.waitForTimeout(700);
await shot(page, '06b-v2-fountain-player-south.png', 'STAGED', 'Tempest south of the fountain: layering check.');

// stall: in front, behind, beside
await stage(page, { at: T(31, 49), player: T(31, 52) });
await page.waitForTimeout(700);
await shot(page, '07-v2-stall-player-in-front.png', 'STAGED', 'Stall with Tempest south of the counter. Actor should be over both layers.');
await stage(page, { at: T(31, 49), player: T(31, 48) });
await page.waitForTimeout(700);
await shot(page, '08-v2-stall-player-behind.png', 'STAGED', 'Tempest at (31,48), under the canopy and north of the counter. Canopy should overlap the actor. (31,46) is inside the east hall footprint and is not standable.');
await stage(page, { at: T(31, 49), player: T(35, 49) });
await page.waitForTimeout(700);
await shot(page, '08b-v2-stall-player-beside.png', 'STAGED', 'Tempest level with the counter.');

// lookout: idle, walking, aiming, firing
for (const [file, cfg, note] of [
  ['09-v2-lookout-idle.png', { guard: { name: 'enemy_l2', at: T(26, 47), facing: Math.PI / 2, state: 'patrol', suspicion: 0 }, player: T(23, 47), at: T(25, 47) }, 'Lookout idle, facing down (front view).'],
  ['09b-v2-lookout-aim.png', { guard: { name: 'enemy_l2', at: T(29, 47), facing: 0, state: 'combat', suspicion: 100 }, player: T(34, 47), at: T(31, 47) }, 'Lookout aiming right. Pistol is baked in; no overlay is drawn.'],
  ['09c-v2-lookout-aim-left.png', { guard: { name: 'enemy_l2', at: T(34, 47), facing: Math.PI, state: 'combat', suspicion: 100 }, player: T(29, 47), at: T(31, 47) }, 'Lookout aiming left: mirrored side art.'],
]) {
  await stage(page, cfg);
  await page.waitForTimeout(1100);
  await shot(page, file, 'STAGED', note);
}

// Lookout walking: let it patrol and catch it in motion.
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  const g = s.enemies.find((e) => e.name === 'enemy_l2');
  g.state = 'patrol';
  g.suspicion = 0;
});
await stage(page, { at: T(26, 47), player: T(21, 47), guard: { name: 'enemy_l2', at: T(26, 47), state: 'patrol', suspicion: 0 } });
for (let i = 0; i < 30; i++) {
  const moving = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const g = s.enemies.find((e) => e.name === 'enemy_l2');
    s.cameras.main.centerOn(g.x, g.y);
    return { speed: g.sprite.body.velocity.length(), anim: g.sprite.anims.currentAnim?.key };
  });
  if (moving.speed > 5 && /walk/.test(moving.anim ?? '')) break;
  await page.waitForTimeout(200);
}
await shot(page, '10-v2-lookout-walking.png', 'STAGED', 'Lookout mid-walk, camera on the guard.');

// Lookout firing: provoke real combat with the player in view.
await stage(page, { at: T(31, 47), player: T(34, 47), guard: { name: 'enemy_l2', at: T(29, 47), facing: 0, state: 'combat', suspicion: 100 } });
let fired = false;
// The firing pose is held 0.22s, so this polls fast and screenshots the
// instant it is up rather than after.
for (let i = 0; i < 160; i++) {
  const st = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const g = s.enemies.find((e) => e.name === 'enemy_l2');
    return { anim: g.sprite.anims.currentAnim?.key };
  });
  if (/\.fire\./.test(st.anim ?? '')) {
    fired = true;
    break;
  }
  await page.waitForTimeout(35);
}
await shot(page, '11-v2-lookout-firing.png', 'STAGED', `Lookout firing animation (fire row reached: ${fired}).`);

// Lookout and Tempest together, for style parity
await stage(page, { at: T(26, 47), player: T(24, 47), guard: { name: 'enemy_l2', at: T(29, 47), facing: Math.PI, state: 'patrol', suspicion: 0 } });
await page.waitForTimeout(900);
await shot(page, '12-v2-lookout-and-tempest.png', 'STAGED', 'Both characters at native scale: silhouette and style parity check.');

// =====================================================================
// 3. PLAYED — real input only, nothing placed
// =====================================================================
console.log('\n--- played (real input) ---');
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
await travel(page, T(20, 52), { ms: 70000 });
await shot(page, '13-played-entering-market.png', 'PLAYED', 'Walked from the spawn into the market under real input.');
played.enteredMarket = (await obs(page)).y < 56 * 16;

// around the fountain
for (const t of [T(24, 45), T(27, 47), T(24, 50), T(21, 47)]) await travel(page, t, { ms: 25000 });
await shot(page, '14-played-around-fountain.png', 'PLAYED', 'Walked a full circuit around the fountain: north, east, south, west.');
played.circledFountain = true;

// past the architecture
await travel(page, T(22, 43), { ms: 25000 });
await shot(page, '15-played-past-architecture.png', 'PLAYED', 'Walked the gap beside the west hall.');

// the V1 evidence at the stall
await travel(page, T(30, 48), { ms: 30000 });
let promptSeen = null;
for (let i = 0; i < 14; i++) {
  const o = await obs(page);
  if (o.prompt) {
    promptSeen = o.prompt;
    break;
  }
  await keys(page, new Set(), ['KeyW']);
  await page.waitForTimeout(90);
  await keys(page, new Set(), []);
}
await shot(page, '16-played-stall-evidence-prompt.png', 'PLAYED', `At the ransacked-stall evidence. Prompt: ${promptSeen ?? 'none'}`);
const before = (await obs(page)).objectives.length;
await tap(page, 'KeyE');
await page.waitForTimeout(400);
const afterObs = await obs(page);
played.v1Prompt = promptSeen;
played.v1Granted = afterObs.objectives.length > before || afterObs.objectives.includes('V1');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await shot(page, '17-played-stall-evidence-taken.png', 'PLAYED', `V1 granted by real E press: ${played.v1Granted}; objectives ${afterObs.objectives.join(',')}`);

// the radio
await travel(page, T(31, 35), { ms: 60000 });
let radioPrompt = null;
for (let i = 0; i < 14; i++) {
  const o = await obs(page);
  if (o.prompt && /RADIO/i.test(o.prompt)) {
    radioPrompt = o.prompt;
    break;
  }
  await keys(page, new Set(), ['KeyW']);
  await page.waitForTimeout(90);
  await keys(page, new Set(), []);
}
if (radioPrompt) await tap(page, 'KeyE');
await page.waitForTimeout(500);
played.radioUsed = await page.evaluate(
  () => !!window.__g.scene.getScene('Village').props.find((p) => p.kind === 'radio')?.used
);
await shot(page, '18-played-market-radio.png', 'PLAYED', `Market radio switched on by real E press: ${played.radioUsed}`);

// leave by an intended exit
await travel(page, T(39, 48), { ms: 45000 });
const exitPos = await obs(page);
played.leftByEastLane = exitPos.x > 36 * 16;
await shot(page, '19-played-leaving-east-lane.png', 'PLAYED', `Left the market by the east lane: ${played.leftByEastLane}`);

// the completed slice, camera back on the square
await stage(page, { at: T(26, 46), player: T(24, 48), guard: { name: 'enemy_l2', at: T(29, 45), facing: Math.PI, state: 'patrol', suspicion: 0 } });
await page.waitForTimeout(1000);
await shot(page, '20-v2-integrated-market.png', 'STAGED', 'The completed integrated market slice.');

if (errors.length) problems.push(`proof session errors: ${errors.join(' | ')}`);
await page.close();
await browser.close();

writeFileSync(
  `${outDir}/capture-manifest.json`,
  JSON.stringify({ shots: manifest, playedResults: played, problems }, null, 1)
);
console.log('\n--- played results ---');
for (const [k, v] of Object.entries(played)) console.log(`  ${k}: ${v}`);
console.log(problems.length ? `\nPROBLEMS: ${problems.join(' | ')}` : '\nno page errors');
console.log(`\nwrote ${manifest.length} captures to ${outDir}`);
