/**
 * Captures the Phase C.1B-04B-1 screenshot set, and validates the market radio
 * distraction (brief section 6) with real interaction input.
 *
 *   node tools/stealth-shots.mjs <chromium> [outDir]
 *
 * Shots 1-5 are staged AI-unit setups: the player and one guard are placed, and
 * everything after that is the real engine with the player driven by real
 * keyboard input. Shot 6 is the F3 overlay. Shot 7 is the radio, reached and
 * switched on by walking to it and pressing E - no placement at all.
 *
 * These are diagnostic frames of specific mechanics. They are NOT evidence of a
 * completed playthrough; tools/playthrough.mjs owns that claim.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/playtests/data'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/stealth-shots.mjs <chromium> [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SHOTS = 'docs/playtests/screenshots';
mkdirSync(SHOTS, { recursive: true });

const HOOK = () => {
  let real;
  Object.defineProperty(window, 'Phaser', {
    configurable: true,
    get() {
      return real;
    },
    set(v) {
      real = v;
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
    if (!sessionStorage.getItem('__c')) {
      localStorage.clear();
      sessionStorage.setItem('__c', '1');
    }
  } catch {
    /* ignore */
  }
};

const OBSERVE = () => {
  const s = window.__g.scene.getScene('Village');
  return {
    t: +s.elapsed.toFixed(2),
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y), stance: s.player.stance, hp: s.player.hp },
    inShadow: s.level.grid.isShadowWorld(s.player.x, s.player.y),
    guards: s.enemies
      .filter((e) => !e.dead)
      .map((e) => ({
        n: e.name.replace('enemy_', ''),
        x: Math.round(e.x),
        y: Math.round(e.y),
        state: e.state,
        susp: +e.suspicion.toFixed(1),
        lastKnown: e.debugLastKnown ? { x: Math.round(e.debugLastKnown.x), y: Math.round(e.debugLastKnown.y) } : null,
        dest: e.debugDestination ? { x: Math.round(e.debugDestination.x), y: Math.round(e.debugDestination.y) } : null,
        dist: Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)),
      })),
  };
};

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
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
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(140);
}

const held = new Set();
const keys = async (list) => {
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
const release = () => keys([]);
const tap = async (code, hold = 130) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  await page.waitForTimeout(60);
};
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}` });
const obs = () => page.evaluate(OBSERVE);
const walk = async (to, { sprint = false, ms = 9000 } = {}) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const o = await obs();
    const dx = to.x - o.player.x;
    const dy = to.y - o.player.y;
    if (Math.hypot(dx, dy) < 12) break;
    const k = [];
    if (dx > 4) k.push('KeyD');
    else if (dx < -4) k.push('KeyA');
    if (dy > 4) k.push('KeyS');
    else if (dy < -4) k.push('KeyW');
    if (sprint) k.push('ShiftLeft');
    if (!k.length) break;
    await keys(k);
    await page.waitForTimeout(80);
  }
  await release();
};

const T = (tx, ty) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

/** Walks a long route with real input, following the engine's own A* path. */
const travel = async (to, { ms = 90000, crouch = false } = {}) => {
  const t0 = Date.now();
  let stuck = 0;
  let last = null;
  while (Date.now() - t0 < ms) {
    const o = await obs();
    if (Math.hypot(to.x - o.player.x, to.y - o.player.y) < 14) break;
    const path = await page.evaluate((t) => {
      const s = window.__g.scene.getScene('Village');
      const p = s.level.grid.findPath({ x: s.player.x, y: s.player.y }, t, 60000);
      return p ? p.map((q) => ({ x: q.x, y: q.y })) : null;
    }, to);
    if (!path || !path.length) {
      // Shuffle off a tile findPath reads as solid, then retry.
      await keys([['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']][stuck % 4]);
      await page.waitForTimeout(200);
      await release();
      if (++stuck > 8) break;
      continue;
    }
    let next = path[0];
    for (const n of path) {
      if (Math.hypot(n.x - o.player.x, n.y - o.player.y) > 10) {
        next = n;
        break;
      }
    }
    const dx = next.x - o.player.x;
    const dy = next.y - o.player.y;
    const mag = Math.hypot(dx, dy) || 1;
    const k = [];
    if (dx / mag > 0.38) k.push('KeyD');
    else if (dx / mag < -0.38) k.push('KeyA');
    if (dy / mag > 0.38) k.push('KeyS');
    else if (dy / mag < -0.38) k.push('KeyW');
    if (!k.length) k.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'KeyD' : 'KeyA') : dy > 0 ? 'KeyS' : 'KeyW');
    if (crouch === false) k.push('ShiftLeft');
    await keys(k);
    await page.waitForTimeout(85);
    if (last && Math.hypot(o.player.x - last.x, o.player.y - last.y) < 1.2) {
      if (++stuck > 18) {
        await keys(['KeyD']);
        await page.waitForTimeout(260);
        stuck = 0;
      }
    } else stuck = 0;
    last = { x: o.player.x, y: o.player.y };
  }
  await release();
};
const telemetry = {};

// Stage the courtyard sequence with one guard, as in the disengagement suite.
const place = (guard, facing, player) =>
  page.evaluate(
    (a) => {
      const s = window.__g.scene.getScene('Village');
      let i = 0;
      for (const e of s.enemies) {
        if (e.name === 'enemy_l6') continue;
        const px = 8 + (i % 4) * 16;
        const py = 8 + Math.floor(i / 4) * 16;
        e.sprite.setPosition(px, py);
        e.sprite.body.reset(px, py);
        i++;
      }
      const g = s.enemies.find((e) => e.name === 'enemy_l6');
      g.sprite.setPosition(a.guard.x, a.guard.y);
      g.sprite.body.reset(a.guard.x, a.guard.y);
      g.facing = a.facing;
      g.state = 'patrol';
      g.suspicion = 0;
      g.lastKnown = null;
      s.player.sprite.setPosition(a.player.x, a.player.y);
      s.player.sprite.body.reset(a.player.x, a.player.y);
      s.player.crouched = false;
      s.cameras.main.centerOn(a.player.x, a.player.y);
    },
    { guard, facing, player }
  );

// --- 1. undetected, crouched behind cover -----------------------------
// Guard looks along the open lane; the player crouches behind the office block.
await place(T(63, 34), Math.PI, T(60, 34));
await walk(T(60, 31));
await tap('KeyC');
await page.waitForTimeout(1200);
telemetry.shot1 = await obs();
await shot('04b1-shot1-undetected-crouched-cover.png');

// --- 2. a Lookout beginning detection ---------------------------------
await place(T(63, 34), Math.PI, T(60, 34));
await page.waitForTimeout(700);
for (let i = 0; i < 24; i++) {
  const o = await obs();
  const l6 = o.guards.find((g) => g.n === 'l6');
  if (l6 && l6.susp > 25 && l6.susp < 85) {
    telemetry.shot2 = o;
    break;
  }
  await page.waitForTimeout(90);
}
telemetry.shot2 = telemetry.shot2 ?? (await obs());
await shot('04b1-shot2-detection-beginning.png');

// --- 3. detected, sprinting toward cover ------------------------------
// Overlay on from here: these frames are about the guard's reasoning, and
// lastKnown / destination markers are the readable part of that.
await page.keyboard.press('F3');
await page.waitForTimeout(400);
await place(T(63, 34), Math.PI, T(60, 34));
await page.waitForTimeout(2000); // get seen
telemetry.shot3before = await obs();
await keys(['KeyW', 'ShiftLeft']);
await page.waitForTimeout(700);
telemetry.shot3 = await obs();
await shot('04b1-shot3-sprinting-to-cover.png');
await release();

// --- 4. guard investigating the last known position -------------------
await walk(T(60, 29), { sprint: true });
await page.waitForTimeout(2200);
telemetry.shot4 = await obs();
await shot('04b1-shot4-investigating-last-known.png');

// --- 5. repositioning while concealed ---------------------------------
await tap('KeyC');
await walk(T(56, 28));
telemetry.shot5 = await obs();
await shot('04b1-shot5-repositioning-concealed.png');

// --- 6. the F3 vision overlay -----------------------------------------
await place(T(63, 34), Math.PI, T(60, 34));
await page.waitForTimeout(900);
telemetry.shot6 = await obs();
await shot('04b1-shot6-f3-vision-overlay.png');
// Also capture the overlay mid-investigation, which is where it earns its keep.
await keys(['KeyW', 'ShiftLeft']);
await page.waitForTimeout(1400);
await release();
await page.waitForTimeout(2000);
telemetry.shot6b = await obs();
await shot('04b1-shot6b-f3-overlay-investigating.png');
await page.keyboard.press('F3');
await page.waitForTimeout(300);

// ======================================================================
// 7. THE MARKET RADIO - brief section 6. No placement: the player is
// restored to the real spawn and walks to the radio under input control.
// ======================================================================
await page.reload({ waitUntil: 'networkidle' });
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
  await page.waitForTimeout(140);
}

// Watch every guard reaction for the whole radio experiment.
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  window.__radio = [];
  const shout = s.shout.bind(s);
  s.shout = (f, a) => {
    window.__radio.push({ kind: 'shout', t: +s.elapsed.toFixed(2) });
    return shout(f, a);
  };
  for (const e of s.enemies) {
    const rally = e.rally.bind(e);
    e.rally = (p) => {
      window.__radio.push({ kind: 'rally', who: e.name, t: +s.elapsed.toFixed(2) });
      return rally(p);
    };
    const hear = e.hear.bind(e);
    e.hear = (ev, aud) => {
      const before = e.state;
      const r = hear(ev, aud);
      if (e.state !== before || ev.kind === 'distraction')
        window.__radio.push({
          kind: 'heard',
          who: e.name,
          sound: ev.kind,
          audible: Math.round(aud),
          dist: Math.round(Math.hypot(ev.x - e.x, ev.y - e.y)),
          from: before,
          to: e.state,
          susp: +e.suspicion.toFixed(1),
          t: +s.elapsed.toFixed(2),
        });
      return r;
    };
  }
});

const radio = await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  const o = s.level.objects.find((x) => x.name === 'interact_radio');
  return { x: o.x, y: o.y, props: o.props };
});
console.log(`radio at tile ${Math.floor(radio.x / 16)},${Math.floor(radio.y / 16)} noise=${radio.props.noise}`);

// Walk there with real input, crouched so we do not alert anything ourselves.
// Approach CROUCHED. This matters: crouch footstep radius is 0, so the trip is
// silent and nothing is alerted on the way. A first attempt that sprinted here
// alerted the market before arriving, and `hear()` ignores a guard already in
// combat - so the distraction had nothing left to distract.
await tap('KeyC');
await travel({ x: radio.x, y: radio.y }, { ms: 220000, crouch: true });
await walk({ x: radio.x, y: radio.y }, { ms: 10000 });

// Wait for a guard to actually be inside the radio's 128px radius before
// pressing the switch. That is how the mechanic is meant to be used: you do not
// set off a distraction when there is nobody near enough to hear it.
let waitedForGuard = 0;
let nearestAtUse = null;
for (let i = 0; i < 90; i++) {
  const o = await obs();
  const near = o.guards
    .map((gd) => ({ n: gd.n, d: Math.hypot(gd.x - radio.x, gd.y - radio.y), state: gd.state }))
    .sort((a, b) => a.d - b.d)[0];
  nearestAtUse = near;
  if (near && near.d <= 120 && near.state !== 'combat') break;
  waitedForGuard += 400;
  await page.waitForTimeout(400);
}
console.log(
  `waited ${(waitedForGuard / 1000).toFixed(1)}s for a guard in range; ` +
    `nearest ${nearestAtUse?.n} at ${Math.round(nearestAtUse?.d ?? -1)}px (${nearestAtUse?.state})`
);
const beforeRadio = await obs();
let used = false;
for (let i = 0; i < 10 && !used; i++) {
  const prompt = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const t = s.interaction.resolve(s.player, s.enemies, (id) => s.mission.isComplete(id));
    return t ? t.prompt : null;
  });
  if (prompt && /RADIO/i.test(prompt)) {
    await tap('KeyE');
    used = await page.evaluate(
      () => !!window.__g.scene.getScene('Village').props.find((p) => p.kind === 'radio')?.used
    );
  } else {
    await keys(['KeyW']);
    await page.waitForTimeout(90);
    await release();
  }
}
await shot('04b1-shot7-radio-activated.png');
const radioSeries = [];
for (let i = 0; i < 40; i++) {
  radioSeries.push(await obs());
  await page.waitForTimeout(400);
}
await shot('04b1-shot7b-radio-aftermath.png');
const radioEvents = await page.evaluate(() => window.__radio);

telemetry.radio = {
  radio,
  activatedByInput: used,
  waitedForGuardMs: waitedForGuard,
  nearestAtUse,
  before: beforeRadio,
  events: radioEvents,
  series: radioSeries,
};

// A logged event is an ATTEMPT to hear; hear() returns early when the distance
// exceeds the attenuated radius, so actual hearing needs dist <= audible.
const distractionEvents = radioEvents.filter((e) => e.sound === 'distraction');
const investigators = [
  ...new Set(distractionEvents.filter((e) => e.dist <= e.audible).map((e) => e.who)),
];
// Did any guard actually walk toward the radio?
const approached = {};
for (const g of ['enemy_l1', 'enemy_l2', 'enemy_l3', 'enemy_l4']) {
  const d = radioSeries
    .map((s) => s.guards.find((x) => `enemy_${x.n}` === g))
    .filter(Boolean)
    .map((x) => Math.hypot(x.x - radio.x, x.y - radio.y));
  if (d.length) approached[g] = { start: Math.round(d[0]), min: Math.round(Math.min(...d)) };
}
const recovered = radioSeries.at(-1).guards.filter((g) => g.state === 'patrol').length;

console.log(`\nradio activated by real input: ${used}`);
console.log('distraction reach, per guard:');
for (const e of distractionEvents)
  console.log(
    `  ${e.who}: ${e.dist}px vs audible ${e.audible} -> ${e.dist <= e.audible ? 'HEARD' : 'out of range'}` +
      ` (${e.from} susp ${e.susp})`
  );
console.log(`guards that actually heard it: ${investigators.join(', ') || 'none'}`);
for (const [g, v] of Object.entries(approached))
  console.log(`  ${g}: distance to radio ${v.start}px -> closest ${v.min}px`);
console.log(`guards back on patrol after ~16s: ${recovered}/${radioSeries.at(-1).guards.length}`);
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');

await browser.close();
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/stealth-shots.json`, JSON.stringify(telemetry, null, 1));
console.log(`\nwrote ${outDir}/stealth-shots.json`);
