/**
 * Phase B.2-05C-1 stall occlusion captures and telemetry.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/b205c-stall-capture.mjs <chromium> before|after [outDir]
 *
 * The SAME staged positions are used in both passes, so the before/after pairs
 * are directly comparable frames of the same world state. Every frame is a real
 * Phaser render of the shipped build at native 480x270 with debug overlays off.
 *
 *   STAGED   actors placed through the debug handle to put one visual
 *            relationship in frame. Proves what the renderer does; proves
 *            nothing about input.
 *   PLAYED   driven entirely by real keyboard events. Proves the evidence is
 *            still reachable and interactable.
 *
 * Nothing here reads engine internals that the game does not already expose:
 * the stall's true world origin is discovered by scanning the live display
 * list for the approved textures, not by trusting the art manifest's proposal.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, label = 'before', outDir = 'docs/art-integration/screenshots/b205c1'] =
  process.argv.slice(2);
if (!executablePath || !['before', 'after'].includes(label)) {
  console.error('usage: node tools/b205c-stall-capture.mjs <chromium> before|after [outDir]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
// `playwright-core` drives an already-installed browser and pulls no binaries;
// either package works, so accept whichever the machine has.
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
 * The staged relationships, fixed for both passes.
 *
 * `south` is the tile the brief names explicitly. `evidence` is the clue tile
 * itself. Walkability of every one of these is asserted by the harness before
 * it stages anything, so a shot can never silently be taken from inside a wall
 * (which is exactly the mistake that made two B.2-04 captures useless).
 */
const POSITIONS = [
  { id: 'evidence-tile', tile: [30, 47], note: 'On the V1 evidence tile, beneath the canopy.' },
  { id: 'south-approach', tile: [30, 48], note: 'South approach tile (30,48), beneath the canopy.' },
  { id: 'under-canopy-east', tile: [33, 48], note: 'Beneath the canopy at its east end.' },
  { id: 'in-front', tile: [31, 51], note: 'South of the counter: the whole stall is behind the actor.' },
  { id: 'beside', tile: [35, 49], note: 'Level with the counter but outside the 80px visual span.' },
  // (31,45) is inside the east market hall footprint and is NOT standable; the
  // only walkable tiles north of the stall inside its x-span are x32-33 at
  // y44-46, so the north relationship is shot from (32,46).
  { id: 'behind', tile: [32, 46], note: 'North of the stall: the structure should occlude the actor.' },
];

/** The column used for the ordered boundary-crossing frames. */
const CROSSING_X = 32;
const CROSSING_ROWS = [44, 45, 46, 47, 48, 49, 50, 51];

/** What the engine must actually have registered, asserted not assumed. */
const EXPECTED_PIECES = [
  { texture: 'prop.valcendre.market_stall_base', frame: '__BASE', src: [0, 0, 80, 48], worldY: 752 },
  { texture: 'prop.valcendre.market_stall_canopy', frame: 'valcendre_stall_canopy_rear', src: [0, 0, 80, 17], worldY: 752 },
  { texture: 'prop.valcendre.market_stall_canopy', frame: 'valcendre_stall_canopy_valance', src: [0, 17, 80, 31], worldY: 769 },
  { texture: 'prop.valcendre.market_stall_base', frame: 'valcendre_stall_base_counter', src: [0, 26, 80, 22], worldY: 778 },
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
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
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

/** Discovers the stall's ACTUAL runtime geometry from the live display list. */
const stallGeometry = () =>
  page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const want = ['prop.valcendre.market_stall_base', 'prop.valcendre.market_stall_canopy'];
    const pieces = s.children.list
      .filter((o) => want.includes(o.texture?.key))
      .map((o) => {
        const f = o.frame;
        return {
          texture: o.texture.key,
          frame: f?.name ?? null,
          sourceRect: f ? { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight } : null,
          worldX: o.x,
          worldY: o.y,
          originX: o.originX,
          originY: o.originY,
          displayW: o.displayWidth,
          displayH: o.displayHeight,
          depth: o.depth,
          visible: o.visible,
          alpha: o.alpha,
          tint: o.isTinted ? o.tintTopLeft : null,
          blendMode: o.blendMode,
        };
      })
      .sort((a, b) => a.depth - b.depth);
    return { pieces, count: pieces.length };
  });

/** Everything 3 asks to be recorded, read at the current world state. */
const telemetry = (tag) =>
  page.evaluate((t) => {
    const s = window.__g.scene.getScene('Village');
    const p = s.player;
    const cam = s.cameras.main;
    const want = ['prop.valcendre.market_stall_base', 'prop.valcendre.market_stall_canopy'];
    const stall = s.children.list
      .filter((o) => want.includes(o.texture?.key))
      .map((o) => ({
        texture: o.texture.key,
        frame: o.frame?.name ?? null,
        worldX: o.x,
        worldY: o.y,
        depth: o.depth,
        artTopWorldY: o.y + (o.frame?.cutY ?? 0),
      }))
      .sort((a, b) => a.depth - b.depth);
    const target = s.interaction.resolve(p, s.enemies, (id) => s.mission.isComplete(id));
    const clue = s.props.find((q) => q.kind === 'evidence' && q.id === 'interact_stall');
    return {
      tag: t,
      player: {
        feetX: p.x,
        feetY: p.y,
        tile: { x: Math.floor(p.x / 16), y: Math.floor(p.y / 16) },
        depth: p.sprite.depth,
        anim: p.sprite.anims.currentAnim?.key ?? null,
        frame: p.sprite.frame?.name ?? null,
        flipX: p.sprite.flipX,
        drawnTorso: p.drawnTorso,
        aimOrigin: p.aimOrigin,
        spriteTopWorldY: p.sprite.y - p.sprite.originY * p.sprite.height,
        hp: p.hp,
      },
      camera: { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom },
      stall,
      interaction: { prompt: target ? target.prompt : null, id: target ? target.id : null },
      evidence: clue ? { tile: { x: Math.floor(clue.x / 16), y: Math.floor(clue.y / 16) }, glint: clue.glint, used: clue.used } : null,
      objectives: s.mission.snapshot().objectives.completed,
      debugHitboxes: s.debugHitboxes,
      artV2: !!s.artV2,
    };
  }, tag);

const walkable = (tiles) =>
  page.evaluate((list) => {
    const s = window.__g.scene.getScene('Village');
    return list.map(([x, y]) => ({ tile: [x, y], walkable: !s.level.grid.at(x, y).collides }));
  }, tiles);

async function shot(file, kind, note, extra = {}) {
  await page.screenshot({ path: `${outDir}/${file}` });
  manifest.push({ file, kind, note, ...extra });
  console.log(`  ${kind.padEnd(6)} ${file}  ${note}`);
}

const stage = (tile) =>
  page.evaluate((c) => {
    const s = window.__g.scene.getScene('Village');
    // Park the other guards far away so they cannot wander into the frame and
    // change what the comparison shows.
    let i = 0;
    for (const e of s.enemies) {
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
    s.player.sprite.setPosition(c.x, c.y);
    s.player.sprite.body.reset(c.x, c.y);
    // The camera normally follows the player, which would reframe every shot
    // and make the before/after pairs incomparable. Detach it and pin it, so
    // the stall lands on the same screen pixels in every single capture.
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(c.camX, c.camY);
    return true;
  }, tile);

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
    return { x: s.player.x, y: s.player.y, prompt: t ? t.prompt : null, id: t ? t.id : null };
  });

/** Real-input travel along the engine's own A* route. */
async function travel(to, ms = 60000) {
  const held = new Set();
  const t0 = Date.now();
  let stuck = 0;
  let last = null;
  while (Date.now() - t0 < ms) {
    const o = await obs();
    if (Math.hypot(to.x - o.x, to.y - o.y) < 12) break;
    const path = await page.evaluate((t) => {
      const s = window.__g.scene.getScene('Village');
      const p = s.level.grid.findPath({ x: s.player.x, y: s.player.y }, t, 60000);
      return p ? p.map((q) => ({ x: q.x, y: q.y })) : null;
    }, to);
    if (!path || !path.length) {
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
  await page.waitForTimeout(60);
};

// =====================================================================
// 1. RUNTIME GEOMETRY - verify, do not assume (3)
// =====================================================================
console.log(`\n--- ${label}: actual runtime stall geometry ---`);
const geom = await stallGeometry();
for (const p of geom.pieces)
  console.log(
    `  ${p.texture.replace('prop.valcendre.market_stall_', '')}` +
      ` frame=${p.frame} src=${p.sourceRect ? `${p.sourceRect.x},${p.sourceRect.y},${p.sourceRect.w},${p.sourceRect.h}` : '-'}` +
      ` world=(${p.worldX},${p.worldY}) origin=(${p.originX},${p.originY}) depth=${p.depth} alpha=${p.alpha} tint=${p.tint}`
  );

// 7 requires the ENGINE's frame coordinates to be checked, not a parallel
// reimplementation of them. This compares the live display list against the
// contract and fails the run on any mismatch.
const frameAudit = EXPECTED_PIECES.map((want) => {
  const got = geom.pieces.find((p) => p.texture === want.texture && p.frame === want.frame);
  const ok =
    !!got &&
    got.worldX === 464 &&
    got.worldY === want.worldY &&
    got.originX === 0 &&
    got.originY === 0 &&
    got.alpha === 1 &&
    got.tint === null &&
    got.blendMode === 0 &&
    got.sourceRect.x === want.src[0] &&
    got.sourceRect.y === want.src[1] &&
    got.sourceRect.w === want.src[2] &&
    got.sourceRect.h === want.src[3];
  if (!ok) problems.push(`frame mismatch for ${want.frame}: ${JSON.stringify(got ?? null)}`);
  return { expected: want, actual: got ?? null, ok };
});
if (label === 'after') {
  console.log('--- engine frame audit ---');
  for (const a of frameAudit)
    console.log(`  ${a.ok ? 'OK  ' : 'FAIL'} ${a.expected.frame} @ worldY=${a.expected.worldY}`);
  if (geom.pieces.length !== EXPECTED_PIECES.length)
    problems.push(`expected ${EXPECTED_PIECES.length} stall pieces, found ${geom.pieces.length}`);
}

const reach = await walkable(POSITIONS.map((p) => p.tile));
console.log('--- staged position walkability ---');
for (const r of reach) {
  console.log(`  (${r.tile[0]},${r.tile[1]}) walkable=${r.walkable}`);
  if (!r.walkable) problems.push(`staged tile (${r.tile[0]},${r.tile[1]}) is NOT walkable`);
}

// =====================================================================
// 2. PLAYED - real input to the evidence, before anything is staged
// =====================================================================
console.log(`\n--- ${label}: played approach to the V1 evidence ---`);
await travel(T(30, 48), 90000);
// Nudge north while the prompt is absent: the clue sits one row up.
let promptSeen = null;
for (let i = 0; i < 14; i++) {
  const o = await obs();
  if (o.prompt) {
    promptSeen = o.prompt;
    break;
  }
  await keys(new Set(), ['KeyW']);
  await page.waitForTimeout(90);
  await keys(new Set(), []);
}
const atInteract = await telemetry('played-interaction-position');
await shot(
  `01-${label}-played-v1-interaction-position.png`,
  'PLAYED',
  `Real-input stop at the V1 interaction position. Prompt: ${promptSeen ?? 'none'}`,
  { prompt: promptSeen, feet: { x: atInteract.player.feetX, y: atInteract.player.feetY } }
);

const beforeObjectives = atInteract.objectives.length;
await tap('KeyE');
await page.waitForTimeout(450);
const afterE = await telemetry('played-after-E');
const v1Granted =
  afterE.objectives.length > beforeObjectives || afterE.objectives.includes('V1');
await page.keyboard.press('Space');
await page.waitForTimeout(260);
await page.keyboard.press('Space');
await page.waitForTimeout(200);
await shot(
  `02-${label}-played-v1-granted.png`,
  'PLAYED',
  `V1 granted by a real E press: ${v1Granted}; objectives ${afterE.objectives.join(',') || 'none'}`
);
if (!v1Granted) problems.push('V1 was NOT granted by a real E press');

// =====================================================================
// 3. STAGED - the six relationships, identical in both passes
// =====================================================================
console.log(`\n--- ${label}: staged relationships ---`);
const staged = [];
for (const pos of POSITIONS) {
  const [tx, ty] = pos.tile;
  const at = T(tx, ty);
  // Camera on the stall itself, not the actor, so every frame in the set is
  // framed identically regardless of where the actor stands.
  await stage({ ...at, camX: 464 + 40, camY: 752 + 40 });
  await page.waitForTimeout(500);
  const tm = await telemetry(`staged-${pos.id}`);
  staged.push(tm);
  await shot(`03-${label}-staged-${pos.id}.png`, 'STAGED', `${pos.note} feet=(${tm.player.feetX},${tm.player.feetY}) depth=${tm.player.depth}`);
}

// =====================================================================
// 4. STAGED - a Lookout and Tempest together at the stall
// =====================================================================
// The decisive case for 6's critical rule: two actors on OPPOSITE sides of the
// same stall in one frame. A position-triggered global flip cannot get this
// right; a spatial rule gets it right without knowing either actor exists.
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  let i = 0;
  for (const e of s.enemies) {
    const px = 8 + (i % 4) * 16;
    const py = 8 + Math.floor(i / 4) * 16;
    e.sprite.setPosition(px, py);
    e.sprite.body.reset(px, py);
    i++;
  }
  const g = s.enemies[1];
  const south = { x: 32 * 16 + 8, y: 51 * 16 + 8 };
  g.sprite.setPosition(south.x, south.y);
  g.sprite.body.reset(south.x, south.y);
  g.state = 'patrol';
  g.suspicion = 0;
  const under = { x: 30 * 16 + 8, y: 48 * 16 + 8 };
  s.player.sprite.setPosition(under.x, under.y);
  s.player.sprite.body.reset(under.x, under.y);
  s.cameras.main.stopFollow();
  s.cameras.main.centerOn(464 + 40, 752 + 40);
});
await page.waitForTimeout(700);
const pair = await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  return {
    player: { x: s.player.x, y: s.player.y, depth: s.player.sprite.depth },
    guard: { x: s.enemies[1].x, y: s.enemies[1].y, depth: s.enemies[1].sprite.depth },
  };
});
await shot(
  `04-${label}-staged-tempest-and-lookout.png`,
  'STAGED',
  `Tempest beneath the canopy, a Lookout south of the counter, same frame. player depth=${pair.player.depth} guard depth=${pair.guard.depth}`
);

// =====================================================================
// 5. STAGED - the empty stall, for the pixel-preservation comparison
// =====================================================================
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  let i = 0;
  for (const e of s.enemies) {
    const px = 8 + (i % 4) * 16;
    const py = 8 + Math.floor(i / 4) * 16;
    e.sprite.setPosition(px, py);
    e.sprite.body.reset(px, py);
    i++;
  }
  // Far enough away that no part of Tempest can overlap the 80x48 envelope.
  s.player.sprite.setPosition(20 * 16 + 8, 51 * 16 + 8);
  s.player.sprite.body.reset(20 * 16 + 8, 51 * 16 + 8);
  s.cameras.main.stopFollow();
  s.cameras.main.centerOn(464 + 40, 752 + 40);
});
await page.waitForTimeout(700);
await shot(
  `05-${label}-staged-empty-stall.png`,
  'STAGED',
  'No actor overlaps the stall. Must be pixel-identical between passes.'
);

// =====================================================================
// 6. STAGED - the depth-boundary crossing, ordered frames
// =====================================================================
console.log(`\n--- ${label}: boundary crossing frames ---`);
const crossing = [];
for (const ty of CROSSING_ROWS) {
  const at = T(CROSSING_X, ty);
  const ok = (await walkable([[CROSSING_X, ty]]))[0].walkable;
  if (!ok) {
    crossing.push({ tile: [CROSSING_X, ty], walkable: false });
    console.log(`  (skip) row ${ty} is not standable`);
    continue;
  }
  await stage({ ...at, camX: 464 + 40, camY: 752 + 40 });
  await page.waitForTimeout(340);
  const tm = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    return { feetY: s.player.y, depth: s.player.sprite.depth };
  });
  crossing.push({ tile: [CROSSING_X, ty], walkable: true, ...tm });
  await shot(
    `06-${label}-crossing-row${String(ty).padStart(2, '0')}.png`,
    'STAGED',
    `Depth boundary crossing, column ${CROSSING_X}, row ${ty}. feetY=${tm.feetY} depth=${tm.depth}`
  );
}

// =====================================================================
// 7. PLAYED - walk the boundary under real input and watch for popping
// =====================================================================
console.log(`\n--- ${label}: played walk across the boundary ---`);
await page.evaluate(() => {
  const s = window.__g.scene.getScene('Village');
  s.cameras.main.startFollow(s.player.sprite, true);
});
// Start north of the counter, under the canopy, and walk south around the
// cover run; sample depth every frame-ish to catch a discontinuity.
await travel(T(32, 47), 40000);
const walkSamples = [];
{
  const held = new Set();
  await keys(held, ['KeyS']);
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) {
    walkSamples.push(
      await page.evaluate(() => {
        const s = window.__g.scene.getScene('Village');
        return {
          t: Math.round(performance.now()),
          feetY: Math.round(s.player.y * 100) / 100,
          depth: s.player.sprite.depth,
          anim: s.player.sprite.anims.currentAnim?.key ?? null,
          displayH: s.player.sprite.displayHeight,
        };
      })
    );
    await page.waitForTimeout(60);
  }
  await keys(held, []);
}
const sizes = new Set(walkSamples.map((s) => s.displayH));
if (sizes.size !== 1) problems.push(`player display height changed while walking: ${[...sizes]}`);
await shot(
  `07-${label}-played-after-boundary-walk.png`,
  'PLAYED',
  `Real-input walk south across the stall boundary; ${walkSamples.length} samples, display height ${[...sizes].join('/')}`
);

// =====================================================================
// 8. A LOOKOUT in motion across the same ground
// =====================================================================
console.log(`\n--- ${label}: lookout walking past the stall ---`);
const lookoutSamples = [];
{
  await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const g = s.enemies[1];
    g.state = 'patrol';
    g.suspicion = 0;
    g.sprite.setPosition(29 * 16 + 8, 48 * 16 + 8);
    g.sprite.body.reset(29 * 16 + 8, 48 * 16 + 8);
    s.player.sprite.setPosition(20 * 16 + 8, 51 * 16 + 8);
    s.player.sprite.body.reset(20 * 16 + 8, 51 * 16 + 8);
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(464 + 40, 752 + 40);
  });
  // Drive the guard east along row 48, under the canopy, with the engine's own
  // physics rather than teleporting it frame by frame.
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const st = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Village');
      const g = s.enemies[1];
      g.sprite.body.setVelocity(44, 0);
      return {
        x: Math.round(g.x * 100) / 100,
        y: Math.round(g.y * 100) / 100,
        depth: g.sprite.depth,
        anim: g.sprite.anims.currentAnim?.key ?? null,
        displayH: g.sprite.displayHeight,
      };
    });
    lookoutSamples.push(st);
    await page.waitForTimeout(90);
  }
  await page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    s.enemies[1].sprite.body.setVelocity(0, 0);
  });
}
const lookoutSizes = new Set(lookoutSamples.map((s) => s.displayH));
if (lookoutSizes.size !== 1)
  problems.push(`lookout display height changed while walking: ${[...lookoutSizes]}`);
await shot(
  `09-${label}-staged-lookout-walking-under-canopy.png`,
  'STAGED',
  `Lookout mid-walk beneath the canopy; ${lookoutSamples.length} samples, display height ${[...lookoutSizes].join('/')}`
);

writeFileSync(
  `${outDir}/telemetry-${label}.json`,
  JSON.stringify(
    {
      label,
      geometry: geom,
      walkability: reach,
      played: {
        interactionPosition: atInteract,
        afterE,
        prompt: promptSeen,
        v1Granted,
      },
      frameAudit,
      staged,
      pair,
      crossing,
      walkSamples,
      lookoutSamples,
      shots: manifest,
      pageErrors: errors,
      problems,
    },
    null,
    1
  )
);

await page.close();
await browser.close();

console.log(`\n--- ${label} summary ---`);
console.log(`  stall pieces: ${geom.count}`);
console.log(`  played prompt: ${promptSeen ?? 'none'}`);
console.log(`  V1 granted by real input: ${v1Granted}`);
console.log(problems.length ? `  PROBLEMS: ${problems.join(' | ')}` : '  no problems');
console.log(`  page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`\nwrote ${manifest.length} captures + telemetry-${label}.json to ${outDir}`);
