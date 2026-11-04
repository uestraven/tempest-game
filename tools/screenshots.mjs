/**
 * Captures native-resolution (480x270) gameplay screenshots of the Valcendre
 * encounters, for the Phase C.1B-03 visual verification deliverable.
 *
 * Requires a served build and Playwright with a Chromium available:
 *
 *   npm run build
 *   npx vite preview --port 4173          # binds 127.0.0.1 only, see vite.config.ts
 *   node tools/screenshots.mjs <chromium-executable> [outDir]
 *
 * Playwright is NOT a project dependency - it is a local capture tool only, so
 * it is resolved from wherever it happens to be installed via NODE_PATH or a
 * sibling install. Nothing in the game depends on this file.
 *
 * HOW THE GAME IS DRIVEN, STATED PLAINLY. These are real frames from the real
 * engine: real renderer at 480x270, real guards running the real vision and
 * patrol code, real tilemap. What is NOT real is the journey - the player is
 * placed at each vantage point through a debug handle on the live Phaser game
 * rather than walked there with 2,500 px of simulated keypresses, and the
 * garage shots set the mission's V5 flag to unlock the doors the same way
 * reading the ledger would. So: genuine gameplay frames, staged positions.
 * They are evidence of what the encounter looks like, not evidence of a
 * completed playthrough.
 *
 * The game instance is reached without modifying any game code, by defining a
 * setter for `window.Phaser` before the bundle runs and wrapping `Phaser.Game`
 * as it is assigned.
 */

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/diagnostics/encounters'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/screenshots.mjs <chromium-executable> [outDir]');
  process.exit(2);
}

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright not resolvable; install it locally and retry (not a project dep)');
  process.exit(3);
}

const TILE = 16;
const P = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/**
 * Each shot: where to stand, what mission state to establish first, whether to
 * turn on the F3 overlay, and whether to fire a shout to show alert chaining.
 */
const SHOTS = [
  {
    file: '01-market-patrol-coverage.png',
    at: P(24, 45),
    why: 'Market square: L1, L2 and L3 coverage over the V1 evidence sites.',
    debug: false,
  },
  {
    file: '02-market-patrol-coverage-debug.png',
    at: P(24, 45),
    why: 'Same frame with the F3 overlay, showing cover and shadow tiles.',
    debug: true,
  },
  {
    file: '03-garden-stealth-approach.png',
    at: P(12, 26),
    why: 'Bakery yard: L4 patrolling the one lit space on the garden branch, '
      + 'with the shadowed west strip open as the bypass.',
    debug: false,
  },
  {
    file: '04-courtyard-from-main-street.png',
    at: P(77, 45),
    why: 'Depot courtyard from the main-street gate: L5 post and the open yard.',
    debug: false,
  },
  {
    file: '05-courtyard-from-garden.png',
    at: P(51, 27),
    why: 'Depot courtyard from the garden descent: the sheltered west approach '
      + 'to the office.',
    debug: false,
  },
  {
    file: '06-garage-dock-security.png',
    at: P(80, 15),
    why: 'Garage interior with L7 on patrol, doors unlocked.',
    unlock: true,
    debug: false,
  },
  {
    file: '07-loading-dock.png',
    at: P(87, 15),
    why: 'Loading dock, the garage second entrance, after unlocking.',
    unlock: true,
    debug: false,
  },
  {
    file: '08-courtyard-combat.png',
    at: P(70, 40),
    why: 'Depot courtyard, player standing in the open: L6 sees them and enters '
      + 'combat on its own. Real detection, not a scripted alert.',
    debug: false,
  },
  {
    // The player hides inside the depot office, where L6 has no line of sight,
    // so what the frame shows is a guard reacting to a REPORTED position rather
    // than to the player. That is the distinction section 8 asks for.
    file: '09-alert-chain-investigate.png',
    at: P(55, 34),
    why: 'Alert chain, isolated: a shout near the gate rallies L6 to the '
      + 'reported position while the player is out of sight. L6 must be '
      + 'investigating, not in combat.',
    shout: { from: P(60, 40), at: P(62, 38) },
    expect: { guard: 'enemy_l6', state: 'investigate' },
    debug: false,
  },
];

/** Installed before any page script, so it is in place when the bundle assigns Phaser. */
const CAPTURE_GAME = () => {
  let real;
  Object.defineProperty(window, 'Phaser', {
    configurable: true,
    get() {
      return real;
    },
    set(value) {
      real = value;
      const Original = value.Game;
      function Patched(...args) {
        const instance = new Original(...args);
        window.__tempestGame = instance;
        return instance;
      }
      Patched.prototype = Original.prototype;
      Object.setPrototypeOf(Patched, Original);
      value.Game = Patched;
    },
  });
};

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
await page.addInitScript(CAPTURE_GAME);
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

// Boot -> Title. Start the level with real input.
await page.waitForFunction(() => window.__tempestGame?.scene?.isActive('Title'), { timeout: 30000 });
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => {
    const s = window.__tempestGame?.scene?.getScene('Village');
    return s?.scene.isActive() && s.enemies?.length === 7 && s.player;
  },
  { timeout: 30000 }
);
// Clear the arrival dialogue so it does not cover every frame.
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1200);

const roster = await page.evaluate(() => {
  const s = window.__tempestGame.scene.getScene('Village');
  return s.enemies.map((e) => `${e.name}@${Math.round(e.x / 16)},${Math.round(e.y / 16)}`);
});
console.log(`live roster (${roster.length}): ${roster.join(' ')}`);

const failures = [];
let debugOn = false;
for (const shot of SHOTS) {
  if (shot.unlock) {
    await page.evaluate(() => {
      const s = window.__tempestGame.scene.getScene('Village');
      for (const id of ['V1', 'V2', 'V3', 'V5']) s.mission.complete(id);
      s.refreshDoors();
    });
  }
  await page.evaluate((at) => {
    const s = window.__tempestGame.scene.getScene('Village');
    s.player.sprite.setPosition(at.x, at.y);
    s.player.sprite.body.reset(at.x, at.y);
    s.cameras.main.centerOn(at.x, at.y);
  }, shot.at);

  // Let the guards run their own code for a few seconds from here, so what the
  // frame shows is the AI reacting rather than a freeze-frame of spawn state.
  await page.waitForTimeout(2500);

  if (shot.shout) {
    await page.evaluate((s0) => {
      const s = window.__tempestGame.scene.getScene('Village');
      s.shout(s0.from, s0.at);
    }, shot.shout);
    await page.waitForTimeout(1500);
  }

  if (shot.debug !== debugOn) {
    await page.keyboard.press('F3');
    debugOn = shot.debug;
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: `${outDir}/${shot.file}` });
  const state = await page.evaluate(() => {
    const s = window.__tempestGame.scene.getScene('Village');
    return Object.fromEntries(
      s.enemies
        .filter((e) => !e.dead)
        .map((e) => [e.name, `${e.state}/${Math.round(e.suspicion)}`])
    );
  });
  const summary = Object.entries(state)
    .map(([n, v]) => `${n.replace('enemy_', '')}:${v}`)
    .join(' ');
  console.log(`  ${shot.file}  [${summary}]`);
  if (shot.expect) {
    const actual = state[shot.expect.guard] ?? 'absent';
    const ok = actual.startsWith(shot.expect.state);
    console.log(
      `     expect ${shot.expect.guard} ${shot.expect.state}: ${actual} ${ok ? 'OK' : 'MISMATCH'}`
    );
    if (!ok) failures.push(`${shot.file}: ${shot.expect.guard} was ${actual}`);
  }
}

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
if (failures.length > 0) {
  console.error(`runtime expectations failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
