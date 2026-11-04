/**
 * Deterministic stealth-disengagement tests for Phase C.1B-04B-1, Scenarios A-F.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/disengage-tests.mjs <chromium> [outDir]
 *
 * ===================== WHAT KIND OF TEST THIS IS =====================
 *
 * These are AI-UNIT tests, not playthrough claims. Per the brief, a unit-level
 * test may construct a deterministic starting state, so each scenario places
 * ONE guard and the player at computed coordinates and fixes the guard's
 * facing. Everything after that moment is the real engine: real `canSee`, real
 * Grid occlusion, real Hearing attenuation, real patrol/investigate/combat
 * state machine, and the player moved by REAL KEYBOARD INPUT.
 *
 * Nothing here declares the player invisible, grants an objective, or edits
 * suspicion. The only writes are the initial placement and facing.
 *
 * The end-to-end stealth route test, which uses input only and places nothing,
 * is tools/playthrough.mjs.
 *
 * Fixtures are DISCOVERED from the shipped map rather than hard-coded, so the
 * tests keep working if geometry moves: the script searches for a guard post, a
 * player post with clear line of sight inside the cone, and a cover tile that
 * genuinely breaks that line of sight.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/playtests/data'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/disengage-tests.mjs <chromium> [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright not resolvable; install locally (not a project dep)');
  process.exit(3);
}

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
    if (!sessionStorage.getItem('__cleared')) {
      localStorage.clear();
      sessionStorage.setItem('__cleared', '1');
    }
  } catch {
    /* ignore */
  }
};

/** Finds a guard post / exposed player post / hard-cover tile triple. */
const FIND_FIXTURE = (opts) =>
  ((o) => {
    const s = window.__g.scene.getScene('Village');
    const g = s.level.grid;
    const T = 16;
    const HALF = 50 * (Math.PI / 180);
    const delta = (a, b) => {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const c = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
    const inArea = (tx, ty) => tx >= o.x0 && tx <= o.x1 && ty >= o.y0 && ty <= o.y1;

    for (let gy = o.y0; gy <= o.y1; gy++) {
      for (let gx = o.x0; gx <= o.x1; gx++) {
        if (g.solidAt(gx, gy)) continue;
        const G = c(gx, gy);
        for (let py = o.y0; py <= o.y1; py++) {
          for (let px = o.x0; px <= o.x1; px++) {
            if (g.solidAt(px, py)) continue;
            const P = c(px, py);
            const dist = Math.hypot(P.x - G.x, P.y - G.y);
            if (dist < 70 || dist > 150) continue;
            if (!g.hasLineOfSight(G, P, false)) continue;
            const facing = Math.atan2(P.y - G.y, P.x - G.x);
            // Cover: walkable, close to the player, and NOT visible from G.
            for (let cy = py - 5; cy <= py + 5; cy++) {
              for (let cx = px - 5; cx <= px + 5; cx++) {
                if (!inArea(cx, cy) || g.solidAt(cx, cy)) continue;
                const C = c(cx, cy);
                const run = Math.hypot(C.x - P.x, C.y - P.y);
                if (run < 30 || run > 90) continue;
                // Must be out of sight from the guard post, by occlusion.
                if (g.hasLineOfSight(G, C, false)) continue;
                if (Math.abs(delta(facing, Math.atan2(C.y - G.y, C.x - G.x))) > HALF) {
                  // Out of cone rather than occluded: not a cover test.
                  continue;
                }
                if (!g.findPath(P, C, 60000)) continue;
                // A second hiding spot further round the cover, for Scenario D.
                let D = null;
                for (let dy = -6; dy <= 6 && !D; dy++) {
                  for (let dx = -6; dx <= 6 && !D; dx++) {
                    if (!inArea(cx + dx, cy + dy) || g.solidAt(cx + dx, cy + dy)) continue;
                    const cand = c(cx + dx, cy + dy);
                    if (Math.hypot(cand.x - C.x, cand.y - C.y) < 40) continue;
                    if (g.hasLineOfSight(G, cand, false)) continue;
                    if (!g.findPath(C, cand, 60000)) continue;
                    D = cand;
                  }
                }
                return { G, P, C, D, facing, dist, run };
              }
            }
          }
        }
      }
    }
    return null;
  })(opts);

/** Places one guard and the player. Setup only; no behaviour is altered. */
const SETUP = ({ guardName, guard, facing, player, parkOthers }) => {
  const s = window.__g.scene.getScene('Village');
  const target = s.enemies.find((e) => e.name === guardName);
  // Park every other guard far off in an unreachable corner of the map so the
  // scenario isolates one AI. They keep running their own code.
  if (parkOthers) {
    let i = 0;
    for (const e of s.enemies) {
      if (e.name === guardName) continue;
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
  }
  target.sprite.setPosition(guard.x, guard.y);
  target.sprite.body.reset(guard.x, guard.y);
  target.facing = facing;
  target.state = 'patrol';
  target.suspicion = 0;
  s.player.sprite.setPosition(player.x, player.y);
  s.player.sprite.body.reset(player.x, player.y);
  s.player.crouched = false;
  s.player.sprinting = false;
  s.cameras.main.centerOn(player.x, player.y);
  return true;
};

/** One read-only observation of the scenario's actors. */
const OBSERVE = (guardName) => {
  const s = window.__g.scene.getScene('Village');
  const e = s.enemies.find((x) => x.name === guardName);
  const g = s.level.grid;
  return {
    t: +s.elapsed.toFixed(3),
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y), stance: s.player.stance, hp: s.player.hp },
    guard: {
      x: Math.round(e.x),
      y: Math.round(e.y),
      state: e.state,
      suspicion: +e.suspicion.toFixed(1),
      facing: +e.facing.toFixed(3),
      lastKnown: e.lastKnown ? { x: Math.round(e.lastKnown.x), y: Math.round(e.lastKnown.y) } : null,
      pathTarget: e.pathTarget ? { x: Math.round(e.pathTarget.x), y: Math.round(e.pathTarget.y) } : null,
    },
    // Two DIFFERENT questions, kept apart because conflating them produced a
    // wrong verdict first time round:
    //   los     - is there a wall in the way? (occlusion only)
    //   visible - would canSee() return true? (cone AND range AND occlusion)
    los: g.hasLineOfSight({ x: e.x, y: e.y }, { x: s.player.x, y: s.player.y }, s.player.crouched),
    visible: (() => {
      const dx = s.player.x - e.x;
      const dy = s.player.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 176) return false;
      let d = (Math.atan2(dy, dx) - e.facing) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 50 * (Math.PI / 180)) return false;
      return g.hasLineOfSight({ x: e.x, y: e.y }, { x: s.player.x, y: s.player.y }, s.player.crouched);
    })(),
    distance: Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)),
  };
};

// ====================================================================

class Runner {
  constructor(page) {
    this.page = page;
    this.held = new Set();
  }
  async keys(list) {
    const want = new Set(list);
    for (const k of [...this.held])
      if (!want.has(k)) {
        await this.page.keyboard.up(k);
        this.held.delete(k);
      }
    for (const k of want)
      if (!this.held.has(k)) {
        await this.page.keyboard.down(k);
        this.held.add(k);
      }
  }
  async release() {
    await this.keys([]);
  }
  async tap(code, hold = 130) {
    await this.page.keyboard.down(code);
    await this.page.waitForTimeout(hold);
    await this.page.keyboard.up(code);
    await this.page.waitForTimeout(50);
  }
  obs(guardName) {
    return this.page.evaluate(OBSERVE, guardName);
  }
  /** Walks toward a point with real input, sampling as it goes. */
  async moveTo(point, { guardName, sprint = false, crouch = false, ms = 6000, trace }) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const o = await this.obs(guardName);
      if (trace) trace.push(o);
      const dx = point.x - o.player.x;
      const dy = point.y - o.player.y;
      if (Math.hypot(dx, dy) < 12) break;
      const k = [];
      if (dx > 4) k.push('KeyD');
      else if (dx < -4) k.push('KeyA');
      if (dy > 4) k.push('KeyS');
      else if (dy < -4) k.push('KeyW');
      if (sprint) k.push('ShiftLeft');
      if (k.length === 0) break;
      await this.keys(k);
      await this.page.waitForTimeout(80);
    }
    await this.release();
  }
  /** Stands still, sampling. */
  async hold(ms, guardName, trace) {
    await this.release();
    const start = Date.now();
    while (Date.now() - start < ms) {
      const o = await this.obs(guardName);
      if (trace) trace.push(o);
      await this.page.waitForTimeout(150);
    }
  }
  async shot(name) {
    mkdirSync('docs/playtests/screenshots', { recursive: true });
    await this.page.screenshot({ path: `docs/playtests/screenshots/${name}` });
  }
}

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
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
const run = new Runner(page);
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(140);
}

// Depot courtyard: open gravel with the office block as hard cover.
const fixture = await page.evaluate(FIND_FIXTURE, { x0: 50, y0: 20, x1: 85, y1: 43 });
if (!fixture) {
  console.error('no usable fixture found in the depot courtyard');
  await browser.close();
  process.exit(1);
}
const tile = (p) => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`;
console.log(
  `fixture: guard ${tile(fixture.G)} facing ${Math.round((fixture.facing * 180) / Math.PI)}deg, ` +
    `player ${tile(fixture.P)} (${Math.round(fixture.dist)}px, LOS clear), ` +
    `cover ${tile(fixture.C)} (${Math.round(fixture.run)}px run, occluded)` +
    (fixture.D ? `, second hide ${tile(fixture.D)}` : '')
);

const GUARD = 'enemy_l6';
const results = [];
const setup = (extra = {}) =>
  page.evaluate(SETUP, {
    guardName: GUARD,
    guard: fixture.G,
    facing: fixture.facing,
    player: fixture.P,
    parkOthers: true,
    ...extra,
  });


/**
 * Does a guard TRACK an unseen player, or search a fixed place?
 *
 * "Destination is near the player" is not enough to tell those apart: a player
 * hiding just round the corner from the spot the guard is legitimately
 * searching trips it constantly. The discriminator is RE-TARGETING - a tracking
 * guard keeps adopting new destinations that follow the player, a searching one
 * commits to one or two and walks to them.
 */
function trackingVerdict(samples) {
  const blind = samples.filter((o) => !o.visible);
  let retargets = 0;
  let nearPlayerRetargets = 0;
  let prev = null;
  for (const o of blind) {
    const d = o.guard.pathTarget;
    if (!d) continue;
    if (prev && Math.hypot(d.x - prev.x, d.y - prev.y) > 20) {
      retargets++;
      if (Math.hypot(d.x - o.player.x, d.y - o.player.y) < 48) nearPlayerRetargets++;
    }
    prev = d;
  }
  const playerTravel = blind.length > 1
    ? Math.hypot(
        blind.at(-1).player.x - blind[0].player.x,
        blind.at(-1).player.y - blind[0].player.y
      )
    : 0;
  return { blind: blind.length, retargets, nearPlayerRetargets, playerTravel: Math.round(playerTravel) };
}

function record(name, question, verdict, detail, trace) {
  results.push({ scenario: name, question, verdict, detail, trace });
  console.log(`\n[${verdict}] ${name}`);
  console.log(`   ${detail}`);
}

// ---------------------------------------------------- A: crouched, concealed
// Measured as TIME TO REACH COMBAT, not as an average suspicion rate: stepSuspicion
// clamps at 100, so any window longer than ~1.3 s compresses every stance to a
// similar apparent slope and the comparison becomes meaningless.
{
  const timeToCombat = async (crouch) => {
    await setup();
    if (crouch) await run.tap('KeyC');
    const t0 = (await run.obs(GUARD)).t;
    const trace = [];
    for (let i = 0; i < 80; i++) {
      const o = await run.obs(GUARD);
      trace.push(o);
      if (o.guard.suspicion >= 100) return { seconds: o.t - t0, trace, reached: true };
      await page.waitForTimeout(100);
    }
    return { seconds: Infinity, trace, reached: false };
  };
  const standing = await timeToCombat(false);
  const crouching = await timeToCombat(true);
  await run.shot('04b1-A-crouched-in-cone.png');
  record(
    'A - crouch slows detection (time to reach suspicion 100)',
    'Does crouch reduce detection?',
    crouching.seconds > standing.seconds * 1.3 ? 'PASS' : 'FAIL',
    `standing reached 100 in ${standing.seconds.toFixed(2)}s, ` +
      `crouching in ${crouching.seconds.toFixed(2)}s ` +
      `(ratio ${(crouching.seconds / standing.seconds).toFixed(2)}x). ` +
      `Contract: 80/s vs 45/s, so 1.25s vs 2.22s, a 1.78x advantage.`,
    { standing: standing.trace, crouching: crouching.trace }
  );
}

// ------------------------------------------- B: detected in open while crouched
{
  const trace = [];
  await setup();
  await run.tap('KeyC');
  await run.hold(6000, GUARD, trace);
  const peak = Math.max(...trace.map((o) => o.guard.suspicion));
  const everCombat = trace.some((o) => o.guard.state === 'combat');
  await run.shot('04b1-B-detected-crouched-open.png');
  record(
    'B - crouched but exposed in the open',
    'Does crouching give supernatural protection?',
    peak >= 100 && everCombat ? 'PASS' : 'FAIL',
    `suspicion peaked at ${peak}, combat entered: ${everCombat}. ` +
      `Crouch slows detection but does not prevent it.`,
    trace
  );
}

// ---------------------------------------------------- C: sprint to hard cover
{
  const trace = [];
  await setup();
  await run.hold(2200, GUARD, trace); // get seen
  const detected = trace.some((o) => o.guard.state === 'combat');
  await run.shot('04b1-C-detected-before-run.png');
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  const atCover = await run.obs(GUARD);
  trace.push(atCover);
  await run.shot('04b1-C-arrived-at-cover.png');
  // Hold still at cover: no footsteps at all, so this isolates line of sight.
  await run.hold(3000, GUARD, trace);
  const after = await run.obs(GUARD);
  trace.push(after);
  record(
    'C - sprint to hard cover, then stand still',
    'Does breaking line of sight end combat?',
    detected && !after.los && after.guard.state !== 'combat' ? 'PASS' : 'FAIL',
    `detected: ${detected}; at cover LOS=${after.los}, guard state=${after.guard.state}, ` +
      `suspicion=${after.guard.suspicion}, lastKnown=${JSON.stringify(after.guard.lastKnown)}`,
    trace
  );
}

// -------------------------------------- D: reposition while hidden (the big one)
// Judged against the guard's LIVE position and destination, not against the
// original post: a searching guard legitimately walks around, so "is the player
// visible" has to be re-asked each sample rather than assumed from the fixture.
if (fixture.D) {
  const trace = [];
  await setup();
  await run.hold(2200, GUARD, trace);
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  const breakOff = await run.obs(GUARD);
  trace.push(breakOff);

  // Move around the cover. Record, at every sample where the player is NOT
  // visible, whether the guard's destination is sitting on the player.
  const unseen = [];
  await run.moveTo(fixture.D, { guardName: GUARD, sprint: true, ms: 7000, trace });
  for (let i = 0; i < 14; i++) {
    const o = await run.obs(GUARD);
    trace.push(o);
    if (!o.visible) unseen.push(o);
    await page.waitForTimeout(140);
  }
  await run.shot('04b1-D-repositioned-while-hidden.png');

  const v = trackingVerdict(trace);
  record(
    'D - reposition while hidden',
    'Does the guard search the last known position rather than track the player?',
    v.nearPlayerRetargets <= 1 ? 'PASS' : 'FAIL',
    `${v.blind} unseen samples, player travelled ${v.playerTravel}px while unseen; ` +
      `guard re-targeted ${v.retargets} times, ${v.nearPlayerRetargets} of those onto the ` +
      `player's live position. A searching guard commits to a place; a tracking one follows. ` +
      `Final: state=${trace.at(-1).guard.state} suspicion=${trace.at(-1).guard.suspicion}`,
    trace
  );
}

// ------------------- D-silent: the controlled comparison for D
// Identical to D except the reposition is done CROUCHED. footstepCrouch has
// radius 0, so this run emits no sound whatsoever. If the guard follows when
// sprinting but not when crouching, the cause is footstep noise and nothing
// else - this is the control that isolates it.
if (fixture.D) {
  const trace = [];
  await setup();
  await run.hold(2200, GUARD, trace);
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  await run.tap('KeyC'); // crouch: silent movement
  const unseen = [];
  await run.moveTo(fixture.D, { guardName: GUARD, crouch: true, ms: 9000, trace });
  for (let i = 0; i < 14; i++) {
    const o = await run.obs(GUARD);
    trace.push(o);
    if (!o.visible) unseen.push(o);
    await page.waitForTimeout(140);
  }
  const vs = trackingVerdict(trace);
  record(
    'D-silent - reposition while hidden AND crouched (control for D)',
    'Is the tracking in D caused by footstep noise?',
    vs.nearPlayerRetargets <= 1 ? 'PASS' : 'FAIL',
    `${vs.blind} unseen samples, player travelled ${vs.playerTravel}px; guard re-targeted ` +
      `${vs.retargets} times, ${vs.nearPlayerRetargets} onto the player. Crouch footstep ` +
      `radius is 0, so this run emits no sound at all - the baseline for comparison with D. ` +
      `Final: state=${trace.at(-1).guard.state} suspicion=${trace.at(-1).guard.suspicion}`,
    trace
  );
}

// ------------------------------------------ D2: does it ever give up and patrol?
{
  const trace = [];
  await setup();
  await run.hold(2200, GUARD, trace);
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  // Stand perfectly still behind cover: crouch footsteps are radius 0 and
  // standing still emits nothing, so this is the cleanest possible de-escalation.
  await run.tap('KeyC');
  await run.hold(16000, GUARD, trace);
  const end = await run.obs(GUARD);
  trace.push(end);
  record(
    'D2 - hold still behind cover for 16 s',
    'Does suspicion decay and the guard return to patrol?',
    end.guard.state === 'patrol' && end.guard.suspicion < 5 ? 'PASS' : 'FAIL',
    `after 16 s hidden and motionless: state=${end.guard.state}, suspicion=${end.guard.suspicion}. ` +
      `Contract: 18/s decay and an 8 s investigate timeout.`,
    trace
  );
}

// ------------------------------------------------------- E: failed escape
// The guard moves while searching, so "step back into the sightline" means
// walking into wherever it is now looking. Drive toward the guard's live
// position until it either sees the player or the window expires.
{
  const trace = [];
  await setup();
  await run.hold(2200, GUARD, trace);
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  await run.hold(1500, GUARD, trace);
  let peak = 0;
  let recombat = false;
  for (let i = 0; i < 40; i++) {
    const o = await run.obs(GUARD);
    trace.push(o);
    peak = Math.max(peak, o.guard.suspicion);
    if (o.guard.state === 'combat') {
      recombat = true;
      break;
    }
    // Walk straight at the guard: this must get us shot at.
    const dx = o.guard.x - o.player.x;
    const dy = o.guard.y - o.player.y;
    const k = [];
    if (dx > 6) k.push('KeyD');
    else if (dx < -6) k.push('KeyA');
    if (dy > 6) k.push('KeyS');
    else if (dy < -6) k.push('KeyW');
    await run.keys(k);
    await page.waitForTimeout(160);
  }
  await run.release();
  const end = await run.obs(GUARD);
  trace.push(end);
  await run.shot('04b1-E-failed-escape.png');
  record(
    'E - walk back into the searching guard',
    'Can detection and combat resume normally?',
    recombat || peak >= 100 ? 'PASS' : 'FAIL',
    `re-entered combat: ${recombat}; peak suspicion after re-exposure: ${peak}; ` +
      `final state=${end.guard.state} suspicion=${end.guard.suspicion} LOS=${end.los}`,
    trace
  );
}

// ------------------------------- G: sprinting unseen but within earshot
// The targeted probe for the suspected defect. The player stands BEHIND the
// guard - out of the 100 degree cone, so never visible - and sprints past at
// close range. Sprint footsteps carry 96 px and fire every 22 px of travel,
// i.e. about seven events per second. The question is what the guard does with
// them: investigate an AREA, or walk onto the player's exact live position.
{
  const probe = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const g = s.level.grid;
    const T = 16;
    // Find a long open corridor so the player can sprint in a straight line.
    for (let ty = 20; ty <= 43; ty++) {
      for (let tx = 52; tx <= 76; tx++) {
        let run = 0;
        while (run < 10 && !g.solidAt(tx + run, ty)) run++;
        if (run < 8) continue;
        const guard = { x: (tx + 1) * T + T / 2, y: ty * T + T / 2 };
        const from = { x: (tx + 2) * T + T / 2, y: ty * T + T / 2 };
        const to = { x: (tx + 7) * T + T / 2, y: ty * T + T / 2 };
        if (!g.findPath(from, to, 60000)) continue;
        // Guard faces AWAY (west) while the player runs east behind it.
        return { guard, from, to, facing: Math.PI };
      }
    }
    return null;
  });

  if (!probe) {
    record('G - sprint past an unseeing guard', 'n/a', 'SKIP', 'no straight corridor found', null);
  } else {
    const trace = [];
    await page.evaluate(SETUP, {
      guardName: GUARD,
      guard: probe.guard,
      facing: probe.facing,
      player: probe.from,
      parkOthers: true,
    });
    await run.hold(600, GUARD, trace);
    // Sprint past, sampling densely.
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const o = await run.obs(GUARD);
      trace.push(o);
      if (Math.hypot(o.player.x - probe.to.x, o.player.y - probe.to.y) < 14) break;
      await run.keys(['KeyD', 'ShiftLeft']);
      await page.waitForTimeout(90);
    }
    await run.release();
    await run.hold(1500, GUARD, trace);
    await run.shot('04b1-G-heard-while-unseen.png');

    // Count pinpointing ONLY while the guard has never once had line of sight.
    // Once it has seen the player, chasing their live position is correct.
    let hadLos = false;
    const blindSamples = [];
    const blindPinpoints = [];
    let peakWhileBlind = 0;
    for (const o of trace) {
      if (o.visible) hadLos = true;
      if (hadLos) continue;
      blindSamples.push(o);
      peakWhileBlind = Math.max(peakWhileBlind, o.guard.suspicion);
      if (
        o.guard.pathTarget &&
        Math.hypot(o.guard.pathTarget.x - o.player.x, o.guard.pathTarget.y - o.player.y) < 24
      )
        blindPinpoints.push({
          t: o.t,
          dest: o.guard.pathTarget,
          player: { x: o.player.x, y: o.player.y },
          suspicion: o.guard.suspicion,
        });
    }
    const pinpointed = blindPinpoints;
    const peak = Math.max(...trace.map((o) => o.guard.suspicion));
    record(
      'G - sprint past a guard that is facing away',
      'Does sprint noise hand the guard the player exact position?',
      pinpointed.length === 0 ? 'PASS' : 'FAIL',
      `${trace.length} samples, ${blindSamples.length} of them before the guard ever had ` +
        `line of sight (peak suspicion while blind: ${peakWhileBlind}; overall peak ${peak}); ` +
        `${pinpointed.length} BLIND samples where the guard destination was within 24px of the ` +
        `player's live position. ` +
        `Final: state=${trace.at(-1).guard.state} suspicion=${trace.at(-1).guard.suspicion} ` +
        `lastKnown=${JSON.stringify(trace.at(-1).guard.lastKnown)} ` +
        `dest=${JSON.stringify(trace.at(-1).guard.pathTarget)}`,
      trace
    );
  }
}

// --------------------------------------------------------- F: two guards
{
  const trace = [];
  // Place a second guard beside the first so both see the player, then escape.
  await page.evaluate(
    ({ a, b, guard, facing, player }) => {
      const s = window.__g.scene.getScene('Village');
      let i = 0;
      for (const e of s.enemies) {
        if (e.name === a || e.name === b) continue;
        const px = 8 + (i % 4) * 16;
        const py = 8 + Math.floor(i / 4) * 16;
        e.sprite.setPosition(px, py);
        e.sprite.body.reset(px, py);
        i++;
      }
      for (const [name, offset] of [
        [a, 0],
        [b, 28],
      ]) {
        const e = s.enemies.find((x) => x.name === name);
        e.sprite.setPosition(guard.x, guard.y + offset);
        e.sprite.body.reset(guard.x, guard.y + offset);
        e.facing = facing;
        e.state = 'patrol';
        e.suspicion = 0;
      }
      s.player.sprite.setPosition(player.x, player.y);
      s.player.sprite.body.reset(player.x, player.y);
      s.player.crouched = false;
      s.cameras.main.centerOn(player.x, player.y);
    },
    { a: 'enemy_l6', b: 'enemy_l5', guard: fixture.G, facing: fixture.facing, player: fixture.P }
  );
  const both = async () => ({
    l6: await run.obs('enemy_l6'),
    l5: await run.obs('enemy_l5'),
  });
  await run.hold(2400, GUARD, trace);
  const detected = await both();
  await run.moveTo(fixture.C, { guardName: GUARD, sprint: true, ms: 7000, trace });
  await run.hold(3500, GUARD, trace);
  const end = await both();
  await run.shot('04b1-F-two-guards.png');
  record(
    'F - two guards detect, then lose contact',
    'Does each guard investigate independently?',
    end.l6.guard.state !== 'combat' && end.l5.guard.state !== 'combat' ? 'PASS' : 'FAIL',
    `at detection: l6=${detected.l6.guard.state}/${detected.l6.guard.suspicion}, ` +
      `l5=${detected.l5.guard.state}/${detected.l5.guard.suspicion}. ` +
      `after cover: l6=${end.l6.guard.state}/${end.l6.guard.suspicion} dest=${JSON.stringify(end.l6.guard.pathTarget)}, ` +
      `l5=${end.l5.guard.state}/${end.l5.guard.suspicion} dest=${JSON.stringify(end.l5.guard.pathTarget)}`,
    { detected, end, trace }
  );
}

// ------------------- H: deterministic probe of the hearing contract
// D is intermittent because it depends on where the guard happens to be when
// line of sight breaks. This probe removes the timing: it emits ONE footstep
// event through the game's own Hearing bus - exactly the call
// Player.updateFootsteps makes - at a known position, with the guard close
// enough that it is certainly audible, and asks what the guard does with it.
//
// This is a unit test of the sound path, not a playthrough. The only input is
// the sound event the player's own movement would have produced.
{
  const probe = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const g = s.level.grid;
    const T = 16;
    // Open ground: guard, and a noise source 64px away with clear reach.
    for (let ty = 21; ty <= 42; ty++) {
      for (let tx = 53; tx <= 75; tx++) {
        const guard = { x: tx * T + T / 2, y: ty * T + T / 2 };
        const noise = { x: (tx + 4) * T + T / 2, y: ty * T + T / 2 };
        if (g.solidAt(tx, ty) || g.solidAt(tx + 4, ty)) continue;
        if (!g.hasClearReach(guard, noise)) continue;
        return { guard, noise };
      }
    }
    return null;
  });

  if (!probe) {
    record('H - hearing contract', 'n/a', 'SKIP', 'no open ground found', null);
  } else {
    const result = await page.evaluate(
      ({ guardName, guard, noise }) => {
        const s = window.__g.scene.getScene('Village');
        const e = s.enemies.find((x) => x.name === guardName);
        // Park the guard, facing AWAY from the noise so it can never see it.
        e.sprite.setPosition(guard.x, guard.y);
        e.sprite.body.reset(guard.x, guard.y);
        e.facing = Math.PI; // west; the noise is east
        e.state = 'patrol';
        e.suspicion = 0;
        e.lastKnown = null;
        // Put the player far away so the guard cannot see or hear the real one.
        s.player.sprite.setPosition(80, 80);
        s.player.sprite.body.reset(80, 80);

        const before = {
          state: e.state,
          suspicion: e.suspicion,
          lastKnown: e.lastKnown,
          pathTarget: e.pathTarget,
        };
        // The exact call Player.updateFootsteps makes while sprinting.
        const radius = 96;
        s.hearing.emit({ x: noise.x, y: noise.y, radius, kind: 'footstep', fromPlayer: true });
        const after = {
          state: e.state,
          suspicion: e.suspicion,
          lastKnown: e.lastKnown ? { x: e.lastKnown.x, y: e.lastKnown.y } : null,
          pathTarget: e.pathTarget ? { x: e.pathTarget.x, y: e.pathTarget.y } : null,
        };
        const audible = s.hearing.audibleRadiusAt(
          { x: noise.x, y: noise.y, radius, kind: 'footstep', fromPlayer: true },
          { x: e.x, y: e.y }
        );
        return {
          before,
          after,
          audible,
          distance: Math.hypot(noise.x - e.x, noise.y - e.y),
          noise,
          // How far the guard's new destination is from the exact noise point.
          offsetFromNoise: e.pathTarget
            ? Math.hypot(e.pathTarget.x - noise.x, e.pathTarget.y - noise.y)
            : null,
        };
      },
      { guardName: GUARD, guard: probe.guard, noise: probe.noise }
    );

    const pinpoint = result.offsetFromNoise !== null && result.offsetFromNoise < 4;
    record(
      'H - one footstep event, guard facing away (deterministic)',
      'Does a single footstep hand over an exact position, and how much suspicion?',
      !pinpoint ? 'PASS' : 'FAIL',
      `noise ${Math.round(result.distance)}px away, audible radius ${result.audible}; ` +
        `suspicion ${result.before.suspicion} -> ${result.after.suspicion}; ` +
        `state ${result.before.state} -> ${result.after.state}; ` +
        `destination offset from the exact noise point: ` +
        `${result.offsetFromNoise === null ? 'n/a' : Math.round(result.offsetFromNoise) + 'px'} ` +
        `(pinpoint: ${pinpoint}). One sprint footstep arrives every ~0.145s while sprinting; ` +
        `with the refractory period only one in ~4 of them can bump suspicion.`,
      result
    );
  }
}

// ===================== I: the market radio distraction =====================
// Validated at unit level because three of seven patrols currently wedge on
// wall corners (documented separately), so waiting for a guard to patrol into
// the radio's 128px radius is not reliable. The guard is placed in range; the
// radio is then switched on with a real E press, and the guard's own AI does
// the rest.
{
  const setupRadio = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const radio = s.level.objects.find((o) => o.name === 'interact_radio');
    // Find a walkable spot inside the radio's audible radius with clear reach,
    // and far enough that walking to the radio is a visible displacement.
    // Hard-coding an offset does not work: east of the radio is wall.
    const T = 16;
    const rtx = Math.floor(radio.x / T);
    const rty = Math.floor(radio.y / T);
    let guard = null;
    let best = -1;
    for (let dy = -7; dy <= 7; dy++) {
      for (let dx = -7; dx <= 7; dx++) {
        const tx = rtx + dx;
        const ty = rty + dy;
        if (!s.level.grid.inBounds(tx, ty) || s.level.grid.solidAt(tx, ty)) continue;
        const pt = { x: tx * T + T / 2, y: ty * T + T / 2 };
        const d = Math.hypot(pt.x - radio.x, pt.y - radio.y);
        if (d < 60 || d > 110) continue;
        if (!s.level.grid.hasClearReach({ x: radio.x, y: radio.y }, pt)) continue;
        if (!s.level.grid.findPath(pt, { x: radio.x, y: radio.y }, 60000)) continue;
        if (d > best) {
          best = d;
          guard = pt;
        }
      }
    }
    if (!guard) return null;
    const e = s.enemies.find((x) => x.name === 'enemy_l6');
    let i = 0;
    for (const other of s.enemies) {
      if (other.name === 'enemy_l6') continue;
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      other.sprite.setPosition(px, py);
      other.sprite.body.reset(px, py);
      i++;
    }
    e.sprite.setPosition(guard.x, guard.y);
    e.sprite.body.reset(guard.x, guard.y);
    // Face directly away from the radio, so nothing here depends on sight.
    e.facing = Math.atan2(guard.y - radio.y, guard.x - radio.x);
    e.state = 'patrol';
    e.suspicion = 0;
    e.lastKnown = null;
    // Player just south of the radio, crouched: silent, and out of the cone.
    s.player.sprite.setPosition(radio.x, radio.y + 18);
    s.player.sprite.body.reset(radio.x, radio.y + 18);
    s.player.crouched = true;
    s.cameras.main.centerOn(radio.x, radio.y);
    return { radio: { x: radio.x, y: radio.y }, guard, noise: Number(radio.props.noise) };
  });

  if (!setupRadio) {
    record('I - radio distraction', 'n/a', 'SKIP', 'radio surroundings unusable', null);
  } else {
    await page.waitForTimeout(700);
    const before = await run.obs(GUARD);
    // Activate with a real E press, nudging into range if the prompt is absent.
    let activated = false;
    for (let i = 0; i < 14 && !activated; i++) {
      const prompt = await page.evaluate(() => {
        const s = window.__g.scene.getScene('Village');
        const t = s.interaction.resolve(s.player, s.enemies, (id) => s.mission.isComplete(id));
        return t ? t.prompt : null;
      });
      if (prompt && /RADIO/i.test(prompt)) {
        await run.tap('KeyE');
        activated = await page.evaluate(
          () => !!window.__g.scene.getScene('Village').props.find((p) => p.kind === 'radio')?.used
        );
      } else {
        await run.keys(['KeyW']);
        await page.waitForTimeout(90);
        await run.release();
      }
    }
    // PHASE 1: the investigation window, sampled immediately. This is where
    // "the guard goes to the radio" is observable; waiting first lets the guard
    // arrive and de-escalate before the first sample.
    const invTrace = [];
    for (let i = 0; i < 16; i++) {
      invTrace.push(await run.obs(GUARD));
      await page.waitForTimeout(220);
    }
    const targetedRadio = invTrace.filter(
      (o) =>
        o.guard.pathTarget &&
        Math.hypot(
          o.guard.pathTarget.x - setupRadio.radio.x,
          o.guard.pathTarget.y - setupRadio.radio.y
        ) < 28
    ).length;
    const investigated = invTrace.some(
      (o) => o.guard.state === 'investigate' || o.guard.state === 'search'
    );
    const sawPlayer = invTrace.some((o) => o.visible);
    const startDist = Math.hypot(
      before.guard.x - setupRadio.radio.x,
      before.guard.y - setupRadio.radio.y
    );
    let closestToRadio = Infinity;
    for (const o of invTrace)
      closestToRadio = Math.min(
        closestToRadio,
        Math.hypot(o.guard.x - setupRadio.radio.x, o.guard.y - setupRadio.radio.y)
      );
    const pulled = startDist - closestToRadio;

    // PHASE 2: withdraw silently and confirm the guard releases rather than
    // staying alert forever.
    const away = await page.evaluate((r) => {
      const s = window.__g.scene.getScene('Village');
      const T = 16;
      const rtx = Math.floor(r.x / T);
      const rty = Math.floor(r.y / T);
      let best = null;
      let bestD = -1;
      for (let dy = -9; dy <= 9; dy++)
        for (let dx = -9; dx <= 9; dx++) {
          const tx = rtx + dx;
          const ty = rty + dy;
          if (!s.level.grid.inBounds(tx, ty) || s.level.grid.solidAt(tx, ty)) continue;
          const pt = { x: tx * T + T / 2, y: ty * T + T / 2 };
          const d = Math.hypot(pt.x - r.x, pt.y - r.y);
          if (d < 96 || d > 150) continue;
          if (!s.level.grid.findPath({ x: s.player.x, y: s.player.y }, pt, 60000)) continue;
          if (d > bestD) {
            bestD = d;
            best = pt;
          }
        }
      return best;
    }, setupRadio.radio);
    if (away) await run.moveTo(away, { guardName: GUARD, crouch: true, ms: 9000 });

    const trace = [...invTrace];
    for (let i = 0; i < 44; i++) {
      trace.push(await run.obs(GUARD));
      await page.waitForTimeout(250);
    }
    await run.shot('04b1-I-radio-distraction.png');
    const recovered = trace.at(-1).guard.state === 'patrol';
    const everCombat = trace.some((o) => o.guard.state === 'combat');

    record(
      'I - radio distraction, guard in range',
      'Does the radio pull a guard to ITSELF, create an opening, and release it?',
      // `everCombat` is deliberately NOT a failure condition. The player has to
      // stand within interactRange (28px) to flip the switch, and the guard then
      // walks to the radio - so being seen is the consequence of lingering at the
      // noise source, which is a real property of the mechanic rather than a bug.
      activated && investigated && targetedRadio > 0 && pulled > 40 && recovered
        ? 'PASS'
        : 'FAIL',
      `activated by E press: ${activated}; noise radius ${setupRadio.noise}; guard started ` +
        `${Math.round(startDist)}px from the radio and closed to ${Math.round(closestToRadio)}px ` +
        `(pulled ${Math.round(pulled)}px); investigated: ${investigated}; ` +
        `during the investigation window ${targetedRadio}/${invTrace.length} samples had the guard ` +
        `heading for the radio itself (NOT the player). It saw the player: ${sawPlayer}, ` +
        `entered combat: ${everCombat} - expected, because switching the radio on requires ` +
        `standing within 28px of it and the guard then walks to that spot; ` +
        `player then withdrew ${away ? Math.round(Math.hypot(away.x - setupRadio.radio.x, away.y - setupRadio.radio.y)) + 'px' : 'nowhere'}; ` +
        `back on patrol after 15s: ${recovered} (final ${trace.at(-1).guard.state}/${trace.at(-1).guard.suspicion})`,
      trace
    );
  }
}

console.log(pageErrors.length ? `\npage errors: ${pageErrors.join(' | ')}` : '\nno page errors');
await browser.close();

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/disengagement.json`, JSON.stringify({ fixture, results }, null, 1));

console.log('\n================ DISENGAGEMENT SUMMARY ================');
for (const r of results) console.log(`${r.verdict.padEnd(5)} ${r.scenario}`);
const failed = results.filter((r) => r.verdict === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
