/**
 * Captures the Phase B.2-01 baseline reference package.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/visual-capture.mjs <chromium> [outDir]
 *
 * ===================== WHAT THESE FRAMES ARE =====================
 *
 * Real engine renders: the shipped build, the real tilemap, the real sprites,
 * the real layer order, at native 480x270. No post-processing, no colour
 * filter, no mockup, nothing redrawn.
 *
 * They are STAGED CAMERA CAPTURES, not playthrough footage. The camera is
 * centred on each authored area through a debug handle, and for the market
 * frame Tempest and one Lookout are positioned so both are in shot. That is
 * the only reason to prefer staging here: a playthrough cannot be relied on to
 * put the camera where a composition audit needs it. Actual playthrough frames
 * from real input live in docs/playtests/screenshots/ from Phase C.1B-04A.
 *
 * Debug overlays are OFF in every frame. The HUD is part of the game's
 * presentation and is left alone.
 *
 * The map overview resizes the Phaser canvas to the full 1664x1152 level and
 * takes one render, so area relationships are shown by the engine rather than
 * by a drawing. That resize is a harness action; nothing is written to the
 * game or to a save.
 *
 * READ-ONLY with respect to assets and gameplay: no file in src/ or
 * public/assets/ is modified.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/art-direction/baseline'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/visual-capture.mjs <chromium> [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
mkdirSync(outDir, { recursive: true });

const T = (tx, ty) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

/**
 * One frame per authored area. `at` is where the camera centres; `player` is
 * where Tempest stands so the frame is representative rather than empty.
 */
const SHOTS = [
  {
    file: '01-arrival-alley.png',
    area: 'Arrival alley',
    at: T(10, 63),
    player: T(10, 63),
    note: 'The level opening. Narrow cobbled alley, east and west walls.',
  },
  {
    file: '02-market-square.png',
    area: 'Market square',
    at: T(24, 45),
    player: T(22, 47),
    guard: { name: 'enemy_l2', at: T(27, 44), facing: Math.PI },
    note: 'Largest space. Tempest and a Lookout both in frame, with the fountain and market halls.',
  },
  {
    file: '03-bakery-garden.png',
    area: 'Bakery and garden route',
    at: T(13, 25),
    player: T(13, 26),
    guard: { name: 'enemy_l4', at: T(17, 23), facing: Math.PI / 2 },
    note: 'The long stealth branch. Almost entirely authored shadow.',
  },
  {
    // Not one of the seven required frames, but the composition report shows
    // `deep_shadow#29` is 79% of this branch's floor, and none of the seven
    // looks at it. "Excessively dark surfaces" cannot be judged without it.
    file: '03b-garden-walk-shadow-corridor.png',
    area: 'Garden wall walk (the shadowed corridor)',
    at: T(9, 12),
    player: T(9, 12),
    note: 'The authored stealth corridor. Floored with deep_shadow; this is the darkest space in the level.',
  },
  {
    file: '03c-upper-lane.png',
    area: 'Upper lane',
    at: T(20, 5),
    player: T(20, 5),
    note: 'The garden branch east leg, also deep_shadow floor, with serviceBrick elsewhere.',
  },
  {
    file: '04-main-street.png',
    area: 'Main street',
    at: T(60, 50),
    player: T(60, 50),
    note: 'The short route between market and depot. Dog-legged by two blocks.',
  },
  {
    file: '05-depot-courtyard.png',
    area: 'Depot courtyard',
    at: T(66, 33),
    player: T(66, 36),
    guard: { name: 'enemy_l6', at: T(70, 31), facing: Math.PI },
    note: 'Largest open space, wider than one screen. Office block centre-left.',
  },
  {
    file: '06-garage-exterior.png',
    area: 'Garage exterior',
    at: T(81, 22),
    player: T(81, 22),
    note: 'The courtyard apron and the garage door, seen from outside.',
  },
  {
    file: '07-garage-interior.png',
    area: 'Garage interior',
    at: T(72, 13),
    player: T(72, 14),
    guard: { name: 'enemy_l7', at: T(76, 11), facing: 0 },
    unlock: true,
    note: 'Final story space: transport bay, cultist, BELIAL wall.',
  },
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
// Clear the arrival dialogue so it does not cover every composition frame.
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(140);
}
await page.waitForTimeout(600);

// Confirm no debug overlay is active before capturing anything.
const debugOff = await page.evaluate(
  () => window.__g.scene.getScene('Village').debugHitboxes === false
);
console.log(`debug overlay off: ${debugOff}`);

const manifest = [];

for (const shot of SHOTS) {
  if (shot.unlock) {
    await page.evaluate(() => {
      const s = window.__g.scene.getScene('Village');
      for (const id of ['V1', 'V2', 'V3', 'V5']) s.mission.complete(id);
      s.refreshDoors();
    });
  }
  const placed = await page.evaluate((cfg) => {
    const s = window.__g.scene.getScene('Village');
    // Park guards that are not wanted in frame, so each area reads cleanly.
    let i = 0;
    for (const e of s.enemies) {
      if (cfg.guard && e.name === cfg.guard.name) continue;
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
    if (cfg.guard) {
      const g = s.enemies.find((e) => e.name === cfg.guard.name);
      g.sprite.setPosition(cfg.guard.at.x, cfg.guard.at.y);
      g.sprite.body.reset(cfg.guard.at.x, cfg.guard.at.y);
      g.facing = cfg.guard.facing;
      g.state = 'patrol';
      g.suspicion = 0;
    }
    s.player.sprite.setPosition(cfg.player.x, cfg.player.y);
    s.player.sprite.body.reset(cfg.player.x, cfg.player.y);
    s.cameras.main.centerOn(cfg.at.x, cfg.at.y);
    return {
      camera: { x: Math.round(s.cameras.main.scrollX), y: Math.round(s.cameras.main.scrollY) },
      player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
    };
  }, shot);
  // Let a couple of frames settle so depth sorting and animation are current.
  await page.waitForTimeout(900);
  await page.evaluate((cfg) => {
    const s = window.__g.scene.getScene('Village');
    s.cameras.main.centerOn(cfg.at.x, cfg.at.y);
  }, shot);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${shot.file}` });
  const tileRange = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const v = s.cameras.main.worldView;
    return {
      tiles: `${Math.floor(v.x / 16)},${Math.floor(v.y / 16)} to ${Math.floor(v.right / 16)},${Math.floor(v.bottom / 16)}`,
    };
  });
  manifest.push({
    file: shot.file,
    area: shot.area,
    kind: 'staged camera capture',
    cameraTopLeftPx: placed.camera,
    visibleTiles: tileRange.tiles,
    playerTile: `${Math.floor(placed.player.x / 16)},${Math.floor(placed.player.y / 16)}`,
    guard: shot.guard?.name ?? null,
    note: shot.note,
  });
  console.log(`  ${shot.file}  camera ${placed.camera.x},${placed.camera.y}  tiles ${tileRange.tiles}`);
}

// ------------------------------------------------- whole-level overview
// The game installs its own window-resize handler (main.ts applyScale) which
// picks the largest INTEGER zoom that fits the viewport. Resizing the viewport
// to the level size therefore lands on zoom 3, not 1 - so the zoom has to be
// forced back to 1 after the resize has settled, and again immediately before
// the shot, or applyScale wins.
await page.setViewportSize({ width: 1664, height: 1152 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  // Park every actor off the playfield: the overview is about the environment.
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
await page.waitForTimeout(400);
const overview = await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  window.__g.scale.scaleMode = 0; // Phaser.Scale.NONE
  window.__g.scale.resize(1664, 1152);
  window.__g.scale.setZoom(1);
  s.cameras.main.setSize(1664, 1152);
  s.cameras.main.setZoom(1);
  s.cameras.main.setScroll(0, 0);
  window.__g.scale.refresh();
  return { zoom: window.__g.scale.zoom, cam: s.cameras.main.zoom };
});
await page.waitForTimeout(900);
// Re-assert once more: applyScale may have fired on the refresh above.
const finalZoom = await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  window.__g.scale.setZoom(1);
  s.cameras.main.setZoom(1);
  s.cameras.main.setSize(1664, 1152);
  s.cameras.main.setScroll(0, 0);
  const v = s.cameras.main.worldView;
  return {
    scaleZoom: window.__g.scale.zoom,
    camZoom: s.cameras.main.zoom,
    view: `${Math.round(v.width)}x${Math.round(v.height)} at ${Math.round(v.x)},${Math.round(v.y)}`,
  };
});
await page.waitForTimeout(400);
console.log(
  `  overview zoom: scale=${finalZoom.scaleZoom} camera=${finalZoom.camZoom} view=${finalZoom.view}` +
    ` (first attempt reported ${overview.zoom}/${overview.cam})`
);
await page.screenshot({ path: `${outDir}/00-map-overview.png` });
manifest.push({
  file: '00-map-overview.png',
  area: 'Whole level',
  kind: 'staged camera capture, canvas resized to 1664x1152 at zoom 1',
  cameraTopLeftPx: { x: 0, y: 0 },
  visibleTiles: '0,0 to 103,71',
  note: 'The entire level in one engine render, actors removed. HUD is drawn at screen scale so it appears small.',
});
console.log('  00-map-overview.png  full level 1664x1152');

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
writeFileSync(`${outDir}/capture-manifest.json`, JSON.stringify({ debugOverlayOff: debugOff, shots: manifest }, null, 1));
console.log(`\nwrote ${outDir}/capture-manifest.json`);
