/**
 * Phase B.2-05C-1 - measure real-engine stall occlusion of the character.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/b205c-occlusion-measure.mjs <chromium> [outDir]
 *
 * Answers the B.2-05B contract's unresolved item 1 ("coding agent must provide
 * real 480x270 frame ... player feet world coords, image origin and Phaser
 * depth values") in the same units the art side used: how many of Tempest's
 * opaque sprite pixels fall under a later-drawn opaque stall pixel.
 *
 * Measured, not modelled. For each position FOUR real frames are captured, and
 * all four are needed: comparing a stall-hidden frame against a stall-visible
 * one differs across the whole 80x48 envelope, not just where the actor is, so
 * the actor must be isolated inside a matched pair.
 *
 *   A   stall hidden,  actor present   -> actor over plain ground
 *   A0  stall hidden,  actor parked    -> the same plain ground, no actor
 *   B   stall visible, actor present   -> what the player actually sees
 *   B0  stall visible, actor parked    -> the stall with no actor
 *
 * actorPixels = { p : A(p) != A0(p) }                 the actor's own pixels
 * occluded    = { p in actorPixels : B(p) == B0(p) }  the stall won at p
 *
 * No art-review compositing is involved and nothing is inferred from the PNGs:
 * these are three screenshots of the shipped build.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, outDir = 'docs/art-integration/screenshots/b205c1'] = process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/b205c-occlusion-measure.mjs <chromium> [outDir]');
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

/**
 * The art side's own test cases, at their own stated feet coordinates, plus the
 * position the player actually reaches under real input.
 */
const CASES = [
  { id: 'evidence_center', feet: [488, 760], artWhole: 36, artSplit: 0 },
  { id: 'south_approach', feet: [488, 776], artWhole: 234, artSplit: 76 },
  { id: 'near_cover', feet: [488, 780], artWhole: 235, artSplit: 127 },
  { id: 'front', feet: [488, 808], artWhole: 0, artSplit: 170 },
  { id: 'beside', feet: [450, 776], artWhole: 0, artSplit: 0 },
  // Recorded by tools/b205c-stall-capture.mjs under real keyboard input.
  { id: 'real_interaction_position', feet: [492.7333333333337, 773.7333333333336], artWhole: null, artSplit: null },
];

/** Where the actor is parked for frame C. Far from the stall, still walkable. */
const PARK = [20 * 16 + 8, 51 * 16 + 8];
const CAM = [504, 792];

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
    return s?.scene.isActive() && s.enemies?.length === 7 && s.player;
  },
  { timeout: 30000 }
);
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(130);
}

/** Parks every guard off-camera and pins the view on the stall. */
await page.evaluate(
  (cam) => {
    const s = window.__g.scene.getScene('Village');
    let i = 0;
    for (const e of s.enemies) {
      const px = 8 + (i % 4) * 16;
      const py = 8 + Math.floor(i / 4) * 16;
      e.sprite.setPosition(px, py);
      e.sprite.body.reset(px, py);
      i++;
    }
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(cam[0], cam[1]);
  },
  CAM
);

const STALL_KEYS = ['prop.valcendre.market_stall_base', 'prop.valcendre.market_stall_canopy'];

/** Sets stall-layer visibility by frame name; null means every layer. */
const setStallVisible = (visible, frames) =>
  page.evaluate(
    ({ visible, frames, keys }) => {
      const s = window.__g.scene.getScene('Village');
      const hit = [];
      for (const o of s.children.list) {
        if (!keys.includes(o.texture?.key)) continue;
        if (frames && !frames.includes(o.frame?.name)) continue;
        o.setVisible(visible);
        hit.push(o.frame?.name ?? null);
      }
      return hit;
    },
    { visible, frames, keys: STALL_KEYS }
  );

const place = (feet) =>
  page.evaluate(
    ({ feet, cam }) => {
      const s = window.__g.scene.getScene('Village');
      s.player.sprite.setPosition(feet[0], feet[1]);
      s.player.sprite.body.reset(feet[0], feet[1]);
      s.cameras.main.stopFollow();
      s.cameras.main.centerOn(cam[0], cam[1]);
      return { x: s.player.x, y: s.player.y, depth: s.player.sprite.depth };
    },
    { feet, cam: CAM }
  );

/** The actor's own 24x32 frame, in screen pixels, read from the engine. */
const spriteScreenRect = () =>
  page.evaluate(() => {
    const s = window.__g.scene.getScene('Village');
    const sp = s.player.sprite;
    const cam = s.cameras.main;
    return {
      x: Math.floor(sp.x - sp.originX * sp.width - cam.scrollX),
      y: Math.floor(sp.y - sp.originY * sp.height - cam.scrollY),
      w: sp.width,
      h: sp.height,
    };
  });

const grab = async () => {
  await page.waitForTimeout(260);
  return page.screenshot({ type: 'png' });
};

/** Decodes a PNG screenshot to raw RGBA in the page, where a canvas exists. */
const toPixels = (buf) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  }, buf.toString('base64'));

const differs = (a, b, i) =>
  a.data[i] !== b.data[i] ||
  a.data[i + 1] !== b.data[i + 1] ||
  a.data[i + 2] !== b.data[i + 2] ||
  a.data[i + 3] !== b.data[i + 3];

const results = [];
const FRONT_FRAMES = ['valcendre_stall_canopy_valance', 'valcendre_stall_base_counter'];

console.log('\n=== real-engine occlusion of Tempest by the stall ===');
console.log('  position                    feet            engine   art(whole)  art(split)');

for (const c of CASES) {
  // B0: stall visible, actor parked.
  await setStallVisible(true, null);
  await place(PARK);
  const bgWithStall = await toPixels(await grab());

  // A0: stall hidden, actor parked.
  await setStallVisible(false, null);
  const bgNoStall = await toPixels(await grab());

  // A: stall hidden, actor in place.
  const placed = await place(c.feet);
  const actorOnly = await toPixels(await grab());

  // B: stall visible, actor in place - what the player sees.
  await setStallVisible(true, null);
  const asSeen = await toPixels(await grab());

  // Restrict to the sprite's own 24x32 screen rect. Without this the diff also
  // picks up the HUD prompt, the HP readout and the evidence glint, all of
  // which change when the actor moves and none of which the stall can ever
  // occlude - they would inflate the denominator and make the ratio
  // incomparable with the art side's 288-pixel sprite counts.
  const rect = await spriteScreenRect();
  let actorPixels = 0;
  let occluded = 0;
  const occludedPoints = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    if (y < 0 || y >= bgNoStall.h) continue;
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x < 0 || x >= bgNoStall.w) continue;
      const i = (y * bgNoStall.w + x) * 4;
      if (!differs(actorOnly, bgNoStall, i)) continue;
      actorPixels++;
      if (!differs(asSeen, bgWithStall, i)) {
        occluded++;
        occludedPoints.push([x, y]);
      }
    }
  }

  const pct = actorPixels ? (occluded / actorPixels) * 100 : 0;
  results.push({
    id: c.id,
    feet: { x: placed.x, y: placed.y },
    playerDepth: placed.depth,
    actorOpaquePixels: actorPixels,
    occludedPixels: occluded,
    occludedPercent: Math.round(pct * 10) / 10,
    artStudioWholeCanopy: c.artWhole,
    artStudioSplit: c.artSplit,
    occludedBbox: occludedPoints.length
      ? {
          x0: Math.min(...occludedPoints.map((p) => p[0])),
          x1: Math.max(...occludedPoints.map((p) => p[0])),
          y0: Math.min(...occludedPoints.map((p) => p[1])),
          y1: Math.max(...occludedPoints.map((p) => p[1])),
        }
      : null,
  });
  console.log(
    `  ${c.id.padEnd(26)} (${placed.x},${placed.y})`.padEnd(48) +
      `${String(occluded).padStart(4)}/${actorPixels}` +
      `  ${String(c.artWhole ?? '-').padStart(8)}` +
      `  ${String(c.artSplit ?? '-').padStart(9)}`
  );

  if (c.id === 'south_approach' || c.id === 'real_interaction_position') {
    await page.screenshot({ path: `${outDir}/10-measure-${c.id}-as-seen.png` });
    await setStallVisible(false, null);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/10-measure-${c.id}-stall-hidden.png` });
    await setStallVisible(true, null);
  }
}

// Cross-check: with ONLY the two front layers hidden, nothing of the actor
// should be occluded at the approach positions - that isolates the split.
console.log('\n=== with the two front layers hidden (isolates the split) ===');
const frontOnly = [];
for (const c of CASES.filter((q) => ['south_approach', 'real_interaction_position'].includes(q.id))) {
  // Same four-frame method, but with the two FRONT layers hidden in both
  // stall-visible frames: whatever is still occluded is the behind layers'
  // doing, which should be nothing.
  await setStallVisible(true, null);
  await setStallVisible(false, FRONT_FRAMES);
  await place(PARK);
  const bgRear = await toPixels(await grab());
  const placed = await place(c.feet);
  const actorOverRear = await toPixels(await grab());
  await setStallVisible(false, null);
  const actorNoStall = await toPixels(await grab());
  await place(PARK);
  const bgNone = await toPixels(await grab());
  await place(c.feet);
  await setStallVisible(true, null);

  const rect = await spriteScreenRect();
  let actorPixels = 0;
  let occluded = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    if (y < 0 || y >= bgNone.h) continue;
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x < 0 || x >= bgNone.w) continue;
      const i = (y * bgNone.w + x) * 4;
      if (!differs(actorNoStall, bgNone, i)) continue;
      actorPixels++;
      if (!differs(actorOverRear, bgRear, i)) occluded++;
    }
  }
  frontOnly.push({ id: c.id, feet: { x: placed.x, y: placed.y }, actorPixels, occludedByRearLayersOnly: occluded });
  console.log(`  ${c.id.padEnd(26)} occluded by the BEHIND layers alone: ${occluded}/${actorPixels}`);
}

writeFileSync(
  `${outDir}/occlusion-measurements.json`,
  JSON.stringify({ camera: CAM, park: PARK, results, rearLayersOnly: frontOnly }, null, 1)
);

await page.close();
await browser.close();
console.log(`\nwrote ${outDir}/occlusion-measurements.json`);
