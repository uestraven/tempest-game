import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();
const HOOK = () => { let r; Object.defineProperty(window,'Phaser',{configurable:true,get(){return r},set(v){r=v;const O=v.Game;function P(...a){const g=new O(...a);window.__g=g;return g}P.prototype=O.prototype;Object.setPrototypeOf(P,O);v.Game=P}}); try{localStorage.clear()}catch{} };
const b = await chromium.launch({ executablePath: process.argv[2], args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.addInitScript(HOOK);
await p.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await p.waitForFunction(()=>window.__g?.scene?.isActive('Title'),{timeout:30000});
await p.keyboard.press('Enter');
await p.waitForFunction(()=>{const s=window.__g?.scene?.getScene('Village');return s?.scene.isActive()&&s.player},{timeout:30000});
for(let i=0;i<6;i++){await p.keyboard.press('Space');await p.waitForTimeout(130);}
const r = await p.evaluate(async () => {
  const s = window.__g.scene.getScene('Village');
  const loop = window.__g.loop;
  // Scroll the camera across the arcade boundary for 5 seconds, sampling delta.
  s.cameras.main.stopFollow();
  const deltas = [];
  let x = 9*16;
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      deltas.push(loop.delta);
      x += 1.5; if (x > 40*16) x = 9*16;
      s.cameras.main.centerOn(x, 45*16+8);
      if (performance.now() - t0 > 5000) return res();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const sorted = [...deltas].sort((a,b)=>a-b);
  const pct = (q) => sorted[Math.floor(sorted.length*q)];
  const layers = s.level.map.layers.length;
  return {
    frames: deltas.length,
    avgMs: +(deltas.reduce((a,b)=>a+b,0)/deltas.length).toFixed(2),
    medianMs: +pct(0.5).toFixed(2),
    p95Ms: +pct(0.95).toFixed(2),
    maxMs: +Math.max(...deltas).toFixed(2),
    actualFps: +loop.actualFps.toFixed(1),
    textureCount: Object.keys(s.textures.list).length,
    displayListSize: s.children.list.length,
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
