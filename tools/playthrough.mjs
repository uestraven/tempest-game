/**
 * Valcendre end-to-end playthrough harness (Phase C.1B-04A).
 *
 *   npm run build
 *   npx vite preview --port 4173            # binds 127.0.0.1 only
 *   node tools/playthrough.mjs <chromium> <scenario> [outDir]
 *
 * scenario: main-stealth | garden-stealth | combat | sprint | checkpoint | all
 *
 * ============================ WHAT THIS IS ============================
 *
 * A CLOSED-LOOP BROWSER-INPUT driver. Every action the player takes is a real
 * keyboard or mouse event delivered to the page: WASD to walk, Shift to sprint,
 * C to crouch, E to interact, R to reload, left mouse to fire. The game decides
 * what happens; this script only presses keys and reads the result.
 *
 * It READS game state to steer (player position, enemy suspicion, objective
 * flags) and to record telemetry. It NEVER writes game state: no teleporting,
 * no granting mission flags, no opening doors, no touching enemy state, no
 * disabling detection. Steering is "look where I am, press the key that moves
 * me toward the next A* node" - the same information a player reads off the
 * screen, used the same way.
 *
 * The one read that a human would not have is `grid.findPath`, used for
 * route-finding. That substitutes for a player's spatial memory of the level,
 * not for any game capability. All of it is read-only.
 *
 * TELEMETRY IS HARNESS-SIDE. Game methods are wrapped to observe calls and
 * their results, always calling through unchanged. Nothing in src/ was
 * modified for this task, so there is no production footprint at all and no
 * possibility of the instrumentation altering enemy behaviour or player
 * movement. Nothing is written to localStorage beyond what the game itself
 * writes, and each run starts from a cleared save.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [executablePath, scenarioName = 'all', outDir = 'docs/playtests/data'] =
  process.argv.slice(2);
if (!executablePath) {
  console.error('usage: node tools/playthrough.mjs <chromium> <scenario> [outDir]');
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

const URL_BASE = 'http://127.0.0.1:4173/';
const TILE = 16;
const P = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

// ====================================================================
// page-side helpers, all read-only
// ====================================================================

/** Captures the Phaser game instance without modifying game code. */
const HOOK_GAME = () => {
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
        window.__g = instance;
        return instance;
      }
      Patched.prototype = Original.prototype;
      Object.setPrototypeOf(Patched, Original);
      value.Game = Patched;
    },
  });
  // Start every RUN from a clean save - but only once per tab. addInitScript
  // re-runs on every navigation, so clearing unconditionally would wipe the
  // save that the browser-refresh test exists to restore.
  try {
    if (!window.sessionStorage.getItem('__harnessCleared')) {
      window.localStorage.clear();
      window.sessionStorage.setItem('__harnessCleared', '1');
    }
  } catch {
    /* ignore */
  }
};

/**
 * Installs harness-side telemetry by wrapping game methods. Every wrapper calls
 * through to the original and returns its result unchanged, so behaviour is
 * identical with or without this.
 */
const INSTALL_TELEMETRY = () => {
  const s = window.__g.scene.getScene('Village');
  const log = [];
  window.__tel = {
    log,
    // Active-time accounting, sampled by the driver each tick.
    activeMs: 0,
    pausedMs: 0,
    dialogueMs: 0,
    deadMs: 0,
    lastSample: performance.now(),
  };
  const at = () => ({ t: +s.elapsed.toFixed(3), x: Math.round(s.player.x), y: Math.round(s.player.y) });
  const push = (kind, data) => log.push({ kind, ...at(), ...data });

  // --- objective beats -------------------------------------------------
  const grantBeat = s.grantBeat.bind(s);
  s.grantBeat = (id, lines) => {
    const before = s.mission.isComplete(id);
    const result = grantBeat(id, lines);
    if (!before && s.mission.isComplete(id)) {
      push('objective', { id, hasKey: s.mission.hasGarageKey });
      if (s.mission.hasGarageKey && !window.__tel.keyLogged) {
        window.__tel.keyLogged = true;
        push('garage_key', {});
        for (const d of s.doors) push('door_unlock', { door: d.name });
      }
    }
    return result;
  };

  // --- player gunfire --------------------------------------------------
  const playerFire = s.combat.playerFire.bind(s.combat);
  s.combat.playerFire = (player) => {
    const report = playerFire(player);
    if (report.fired)
      push('player_shot', {
        weapon: player.weapon,
        hits: report.hits.length,
        impacts: report.impacts.length,
      });
    return report;
  };

  // --- enemy gunfire ---------------------------------------------------
  const fireProjectile = s.combat.fireProjectile.bind(s.combat);
  s.combat.fireProjectile = (from, angle, damage, shooter) => {
    push('enemy_shot', { by: shooter?.name ?? '?', damage });
    return fireProjectile(from, angle, damage, shooter);
  };

  // --- player damage ---------------------------------------------------
  const playerDamage = s.player.takeDamage.bind(s.player);
  s.player.takeDamage = (amount) => {
    const hpBefore = s.player.hp;
    const applied = playerDamage(amount);
    if (applied) push('player_hurt', { amount, hpBefore, hpAfter: s.player.hp });
    return applied;
  };

  // --- per-enemy hooks -------------------------------------------------
  for (const e of s.enemies) {
    const takeDamage = e.takeDamage.bind(e);
    e.takeDamage = (amount, fromAngle) => {
      const hpBefore = e.hp;
      const r = takeDamage(amount, fromAngle);
      push('enemy_hurt', { enemy: e.name, amount, hpBefore, hpAfter: e.hp, dead: e.dead });
      return r;
    };
    const kill = e.kill.bind(e);
    e.kill = () => {
      const wasDead = e.dead;
      const r = kill();
      if (!wasDead) push('enemy_down', { enemy: e.name, cause: 'takedown_or_kill' });
      return r;
    };
    const rally = e.rally.bind(e);
    e.rally = (pos) => {
      if (!e.dead && e.state !== 'combat')
        push('rally', { enemy: e.name, to: { x: Math.round(pos.x), y: Math.round(pos.y) } });
      return rally(pos);
    };
  }

  // --- shouts (alert chaining) ----------------------------------------
  const shout = s.shout.bind(s);
  s.shout = (from, target) => {
    push('shout', { from: { x: Math.round(from.x), y: Math.round(from.y) } });
    return shout(from, target);
  };

  // --- pickups ---------------------------------------------------------
  const usePickup = s.usePickup.bind(s);
  s.usePickup = (item) => {
    const hpBefore = s.player.hp;
    const r = usePickup(item);
    if (item.taken) push('pickup', { kind: item.kind, name: item.name, hpBefore, hpAfter: s.player.hp });
    return r;
  };

  // --- checkpoints, death, reload --------------------------------------
  const capture = s.captureCheckpoint.bind(s);
  s.captureCheckpoint = (id) => {
    push('checkpoint', { id });
    return capture(id);
  };
  const reload = s.reloadCheckpoint.bind(s);
  s.reloadCheckpoint = () => {
    push('checkpoint_reload', {});
    return reload(s);
  };
  const showCard = s.showSliceCard.bind(s);
  s.showSliceCard = () => {
    push('mission_complete', { elapsed: +s.elapsed.toFixed(3) });
    window.__tel.complete = true;
    return showCard();
  };

  push('mission_start', {});
  return true;
};

/** One read-only snapshot of everything the driver and telemetry need. */
const SAMPLE = () => {
  const s = window.__g.scene.getScene('Village');
  const t = window.__tel;
  const now = performance.now();
  const dt = now - t.lastSample;
  t.lastSample = now;
  if (s.paused) t.pausedMs += dt;
  else if (s.player.dead) t.deadMs += dt;
  else if (s.dialogue.active) t.dialogueMs += dt;
  else t.activeMs += dt;

  return {
    elapsed: +s.elapsed.toFixed(3),
    x: s.player.x,
    y: s.player.y,
    hp: s.player.hp,
    dead: s.player.dead,
    stance: s.player.stance,
    crouched: s.player.crouched,
    sprinting: s.player.sprinting,
    weapon: s.player.weapon,
    ammo: s.player.ammo ? { ...s.player.ammo } : null,
    reloading: s.player.reloading,
    paused: s.paused,
    dialogue: s.dialogue.active,
    complete: !!s.sliceComplete,
    objectives: s.mission.snapshot().objectives.completed,
    hasKey: s.mission.hasGarageKey,
    doorsOpen: s.doors.map((d) => ({ name: d.name, open: s.mission.isDoorOpen(d.name) })),
    inShadow: s.level.grid.isShadowWorld(s.player.x, s.player.y),
    camera: { x: s.cameras.main.scrollX, y: s.cameras.main.scrollY },
    enemies: s.enemies.map((e) => ({
      name: e.name,
      x: Math.round(e.x),
      y: Math.round(e.y),
      state: e.state,
      suspicion: +e.suspicion.toFixed(1),
      hp: e.hp,
      dead: e.dead,
      dist: Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)),
    })),
    time: { ...t, lastSample: undefined, log: undefined },
  };
};

// ====================================================================
// driver
// ====================================================================

class Driver {
  constructor(page) {
    this.page = page;
    this.held = new Set();
    this.samples = [];
    this.notes = [];
  }

  async sample() {
    const s = await this.page.evaluate(SAMPLE);
    this.samples.push({ wall: Date.now(), ...s });
    return s;
  }

  note(text) {
    this.notes.push(text);
    console.log(`     . ${text}`);
  }

  async setKeys(keys) {
    const want = new Set(keys);
    for (const k of [...this.held]) {
      if (!want.has(k)) {
        await this.page.keyboard.up(k);
        this.held.delete(k);
      }
    }
    for (const k of want) {
      if (!this.held.has(k)) {
        await this.page.keyboard.down(k);
        this.held.add(k);
      }
    }
  }

  async release() {
    await this.setKeys([]);
  }

  /**
   * A tap that the game will actually see.
   *
   * `interactPressed`, `reloadPressed` and `crouchPressed` are read with
   * Phaser's frame-sampled JustDown, so a Playwright `press()` can begin and
   * end inside one frame and be missed. Holding for ~130 ms guarantees the
   * sample lands.
   */
  async tap(code, holdMs = 130) {
    await this.page.keyboard.down(code);
    await this.page.waitForTimeout(holdMs);
    await this.page.keyboard.up(code);
    await this.page.waitForTimeout(60);
  }

  /** Read-only: what the game would prompt right now, and why not. */
  async promptNow() {
    return this.page.evaluate(() => {
      const s = window.__g.scene.getScene('Village');
      const t = s.interaction.resolve(s.player, s.enemies, (id) => s.mission.isComplete(id));
      return t ? { type: t.type, prompt: t.prompt, name: t.prop?.name ?? t.item?.name } : null;
    });
  }

  /** Advances any open dialogue box the way a player would: press Space. */
  async clearDialogue(max = 8) {
    for (let i = 0; i < max; i++) {
      const s = await this.page.evaluate(() => {
        const sc = window.__g.scene.getScene('Village');
        return sc.dialogue.active;
      });
      if (!s) return;
      await this.page.keyboard.press('Space');
      await this.page.waitForTimeout(180);
    }
  }

  /**
   * Read-only: can any living guard see `point` right now?
   *
   * Reproduces the engine's sight contract from readable state - 176 px range,
   * 100 degree cone, and the grid's own line of sight - so the driver can wait
   * for a patrol opening instead of walking into a cone and then reacting. This
   * is the information a player reads off the facing tick and the level layout.
   */
  async isWatched(point, crouched) {
    return this.page.evaluate(
      ({ pt, crouch }) => {
        const s = window.__g.scene.getScene('Village');
        const HALF = (100 / 2) * (Math.PI / 180);
        const delta = (a, b) => {
          let d = (b - a) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          return d;
        };
        const watchers = [];
        for (const e of s.enemies) {
          if (e.dead) continue;
          const dx = pt.x - e.x;
          const dy = pt.y - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 176) continue;
          if (Math.abs(delta(e.facing, Math.atan2(dy, dx))) > HALF) continue;
          if (!s.level.grid.hasLineOfSight({ x: e.x, y: e.y }, pt, crouch)) continue;
          watchers.push(e.name);
        }
        return watchers;
      },
      { pt: point, crouch: !!crouched }
    );
  }

  /**
   * Read-only: the best nearby tile to retreat to while being hunted.
   *
   * Scans walkable tiles in a ring around the player and scores them by
   * distance from every hunter, heavily penalising anything a hunter can
   * currently see and preferring authored shadow. Returns a point to run to, so
   * the escape is A*-pathed around geometry instead of a blind vector into a
   * wall.
   */
  async escapeTarget() {
    return this.page.evaluate(() => {
      const s = window.__g.scene.getScene('Village');
      const TILE = 16;
      const HALF = 50 * (Math.PI / 180);
      const delta = (a, b) => {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return d;
      };
      const hunters = s.enemies.filter((e) => !e.dead && (e.state === 'combat' || e.suspicion > 40));
      if (hunters.length === 0) return null;
      const px = Math.floor(s.player.x / TILE);
      const py = Math.floor(s.player.y / TILE);
      let best = null;
      let bestScore = -Infinity;
      for (let ty = py - 14; ty <= py + 14; ty++) {
        for (let tx = px - 14; tx <= px + 14; tx++) {
          if (!s.level.grid.inBounds(tx, ty) || s.level.grid.solidAt(tx, ty)) continue;
          const pt = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
          const own = Math.hypot(pt.x - s.player.x, pt.y - s.player.y);
          if (own < 64 || own > 260) continue;
          let minHunter = Infinity;
          let seen = false;
          for (const h of hunters) {
            const dx = pt.x - h.x;
            const dy = pt.y - h.y;
            const d = Math.hypot(dx, dy);
            minHunter = Math.min(minHunter, d);
            if (
              d <= 176 &&
              Math.abs(delta(h.facing, Math.atan2(dy, dx))) <= HALF &&
              s.level.grid.hasLineOfSight({ x: h.x, y: h.y }, pt, false)
            )
              seen = true;
          }
          const shadow = s.level.grid.isShadowWorld(pt.x, pt.y) ? 60 : 0;
          const score = minHunter + shadow - (seen ? 900 : 0);
          if (score <= bestScore) continue;
          if (!s.level.grid.findPath({ x: s.player.x, y: s.player.y }, pt, 60000)) continue;
          bestScore = score;
          best = pt;
        }
      }
      return best;
    });
  }

  /** Read-only: is any guard currently hunting? */
  async hunted() {
    return this.page.evaluate(() =>
      window.__g.scene
        .getScene('Village')
        .enemies.some((e) => !e.dead && e.state === 'combat')
    );
  }

  /**
   * Stealth travel: walk toward `target`, and if detected en route, break off,
   * sprint to a scored escape point, wait for the guards to de-escalate, then
   * resume. Loops until it arrives, dies, or runs out of attempts.
   */
  async travel(target, opts = {}) {
    const totals = { waitMs: 0, fleeMs: 0, detections: 0, breakOffs: 0 };
    for (let attempt = 0; attempt < 6; attempt++) {
      const leg = await this.goTo(target, opts);
      totals.waitMs += leg.waitMs ?? 0;
      totals.fleeMs += leg.fleeMs ?? 0;
      totals.detections += leg.detections ?? 0;
      if (leg.ok) return { ok: true, ...totals };
      if (leg.reason === 'died') return { ok: false, reason: 'died', ...totals };
      if (!(await this.hunted())) return { ok: false, reason: leg.reason, ...totals };

      // Detected and still alive: run somewhere the hunters cannot see.
      totals.breakOffs++;
      const escape = await this.escapeTarget();
      if (!escape) return { ok: false, reason: 'detected, nowhere to retreat', ...totals };
      await this.setCrouch(false);
      const t0 = Date.now();
      await this.goTo(escape, { sprint: true, tolerance: 26, timeoutMs: 15000 });
      totals.fleeMs += Date.now() - t0;
      // Hold until suspicion bleeds off (18/s decay, 8 s investigate timeout).
      const wait0 = Date.now();
      while (Date.now() - wait0 < 14000) {
        const st = await this.sample();
        if (st.dead) return { ok: false, reason: 'died', ...totals };
        // Only wait for active combat to end. Waiting for every guard to return
        // to 'patrol' can never finish if one is stuck in combat out of reach,
        // and standing still is the worst thing a hunted player can do.
        if (!st.enemies.some((e) => !e.dead && e.state === 'combat')) break;
        await this.page.waitForTimeout(400);
      }
      totals.waitMs += Date.now() - wait0;
      await this.setCrouch(true);
    }
    return { ok: false, reason: 'gave up after repeated detection', ...totals };
  }

  /** A* route from the player's current position, read from the live grid. */
  async pathTo(target) {
    return this.page.evaluate((t) => {
      const s = window.__g.scene.getScene('Village');
      const path = s.level.grid.findPath({ x: s.player.x, y: s.player.y }, t, 60000);
      return path ? path.map((p) => ({ x: p.x, y: p.y })) : null;
    }, target);
  }

  /**
   * Walks to `target` with real key presses, re-pathing as it goes.
   *
   * `stealth` makes the driver behave like a cautious player: when a guard's
   * suspicion rises it stops, crouches and waits for the suspicion to bleed off
   * before continuing. Time spent doing that is recorded as observation time.
   */
  async goTo(target, opts = {}) {
    const {
      tolerance = 14,
      timeoutMs = 90000,
      sprint = false,
      crouch = false,
      stealth = false,
      fight = false,
      label = '',
    } = opts;
    const start = Date.now();
    let waitMs = 0;
    let fleeMs = 0;
    let detections = 0;
    let noPathTicks = 0;
    let lastPos = null;
    let stuckTicks = 0;
    let stance = crouch;

    if (crouch) await this.setCrouch(true);

    while (Date.now() - start < timeoutMs) {
      const s = await this.sample();
      if (s.complete) {
        await this.release();
        return { ok: true, completed: true, waitMs, fleeMs, detections, dist: 0 };
      }
      if (s.dead) {
        await this.release();
        return { ok: false, reason: 'died', waitMs, fleeMs, detections };
      }
      const dist = Math.hypot(s.x - target.x, s.y - target.y);
      if (dist <= tolerance) {
        await this.release();
        return { ok: true, waitMs, fleeMs, detections, dist };
      }

      let path = await this.pathTo(target);
      if (!path || path.length === 0) {
        // findPath returns null when the START tile reads solid, which happens
        // when the player's ground point is inside a cover or prop footprint
        // they are pressed against. Shuffle free and retry before giving up.
        noPathTicks++;
        const stuckInside = await this.page.evaluate(() => {
          const sc = window.__g.scene.getScene('Village');
          return sc.level.grid.isSolidWorld(sc.player.x, sc.player.y);
        });
        if (noPathTicks <= 8) {
          const escape = [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD']][
            noPathTicks % 6
          ];
          await this.setKeys(escape);
          await this.page.waitForTimeout(220);
          await this.release();
          continue;
        }
        await this.release();
        return {
          ok: false,
          reason: `no path (playerTileSolid=${stuckInside})`,
          waitMs,
          fleeMs,
          detections,
        };
      }
      noPathTicks = 0;
      // Aim at the first node that is far enough away to give a clean heading.
      let next = path[0];
      for (const node of path) {
        if (Math.hypot(node.x - s.x, node.y - s.y) > 10) {
          next = node;
          break;
        }
      }
      // --- aggressive behaviour: shoot back ------------------------------
      if (fight) {
        const threat = s.enemies
          .filter((e) => !e.dead && e.state === 'combat' && e.dist < 200)
          .sort((a, b) => a.dist - b.dist)[0];
        if (threat) {
          // Heal first if badly hurt and a kit is in reach.
          if (s.hp <= 52) {
            const p = await this.promptNow();
            if (p && p.type === 'pickup') await this.tap('KeyE');
          }
          await this.release();
          const r = await this.engage(threat.name, { maxMs: 16000 });
          if (!r.ok && r.reason === 'died')
            return { ok: false, reason: 'died', waitMs, fleeMs, detections };
          continue;
        }
      }

      // --- cautious stealth behaviour -----------------------------------
      if (stealth) {
        if (s.enemies.some((e) => !e.dead && e.state === 'combat')) {
          // Detected. Hand back to travel(), which runs a pathed escape -
          // crouching here would be fatal (crouch 66 px/s == Lookout
          // combatSpeed 66 px/s, so a crouched player cannot break away).
          await this.release();
          return { ok: false, reason: 'detected', waitMs, fleeMs, detections: detections + 1 };
        }
        // Not yet seen: do not step into a cone, and back out of one we are
        // already standing in rather than letting suspicion accumulate.
        const alarm = Math.max(0, ...s.enemies.filter((e) => !e.dead).map((e) => e.suspicion));
        const watchedHere = alarm > 8 ? await this.isWatched({ x: s.x, y: s.y }, true) : [];
        const watchers = watchedHere.length > 0 ? watchedHere : await this.isWatched(next, true);
        // A real player accepts measured risk rather than freezing whenever any
        // cone touches them. Crouched detection is 45/s, or 28/s in authored
        // shadow, against a 100 threshold - so a distant watcher leaves 2-3 s of
        // crossing time. Only hold for a watcher close enough to convert that
        // into a detection, and never hold a single leg for more than 20 s.
        const closest = watchers.length
          ? Math.min(
              ...s.enemies.filter((e) => watchers.includes(e.name)).map((e) => e.dist)
            )
          : Infinity;
        const dangerous = closest < (s.inShadow ? 90 : 130);
        if (watchers.length > 0 && dangerous && waitMs < 20000) {
          if (!stance) {
            await this.setCrouch(true);
            stance = true;
          }
          await this.release();
          await this.page.waitForTimeout(240);
          waitMs += 240;
          continue;
        }
      }

      const dx = next.x - s.x;
      const dy = next.y - s.y;
      const mag = Math.hypot(dx, dy) || 1;
      const ux = dx / mag;
      const uy = dy / mag;
      const keys = [];
      if (ux > 0.38) keys.push('KeyD');
      else if (ux < -0.38) keys.push('KeyA');
      if (uy > 0.38) keys.push('KeyS');
      else if (uy < -0.38) keys.push('KeyW');
      if (keys.length === 0) keys.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'KeyD' : 'KeyA') : dy > 0 ? 'KeyS' : 'KeyW');
      if (sprint) keys.push('ShiftLeft');
      await this.setKeys(keys);
      await this.page.waitForTimeout(90);

      // Stuck detection: nudge perpendicular rather than grinding a wall.
      if (lastPos && Math.hypot(s.x - lastPos.x, s.y - lastPos.y) < 1.2) {
        stuckTicks++;
        if (stuckTicks > 12) {
          const perp = keys.includes('KeyW') || keys.includes('KeyS') ? ['KeyD'] : ['KeyS'];
          await this.setKeys(perp);
          await this.page.waitForTimeout(260);
          stuckTicks = 0;
        }
      } else stuckTicks = 0;
      lastPos = { x: s.x, y: s.y };
    }
    await this.release();
    return { ok: false, reason: 'timeout', waitMs, fleeMs, detections };
  }

  async setCrouch(want) {
    const s = await this.page.evaluate(() => {
      const sc = window.__g.scene.getScene('Village');
      return sc.player.crouched;
    });
    if (s !== want) await this.tap('KeyC');
  }

  /**
   * Interacts with a named map object: walk into range, press E, confirm the
   * objective moved. Returns the beat it granted, if any.
   */
  async interact(objectName, opts = {}) {
    const target = await this.page.evaluate((name) => {
      const s = window.__g.scene.getScene('Village');
      const o = s.level.objects.find((x) => x.name === name);
      return o ? { x: o.x, y: o.y, props: o.props } : null;
    }, objectName);
    if (!target) return { ok: false, reason: `no object ${objectName}` };

    // A beat already satisfied by its ALTERNATE source is a success, not a
    // failure: the prop's prompt correctly disappears once its objective is
    // done, which is exactly what the two-source design is meant to do.
    const expect = target.props?.objective;
    if (expect) {
      const already = await this.page.evaluate(
        (id) => window.__g.scene.getScene('Village').mission.isComplete(id),
        expect
      );
      if (already) {
        this.note(`${objectName}: ${expect} already granted by its alternate source`);
        return { ok: true, skipped: true, viaAlternate: true, waitMs: 0, fleeMs: 0, detections: 0 };
      }
    }

    const walk = opts.stealth
      ? await this.travel(target, { tolerance: 16, ...opts, label: objectName })
      : await this.goTo(target, { tolerance: 16, ...opts, label: objectName });
    if (!walk.ok)
      return {
        ok: false,
        reason: `approach failed: ${walk.reason}`,
        waitMs: walk.waitMs,
        fleeMs: walk.fleeMs,
        detections: walk.detections,
        breakOffs: walk.breakOffs,
      };

    // Close the last few pixels using the game's own prompt as the signal:
    // interactRange is 28 px AND needs clear reach, so arriving at 31 px is a
    // miss. Step in until the prompt appears, then press E.
    for (let attempt = 0; attempt < 14; attempt++) {
      // The alternate source may have fired DURING the approach - the overheard
      // conversation is a region trigger the player walks through on the way to
      // the waybill. That is a success for the beat, not a failed interaction.
      if (expect) {
        const now = await this.page.evaluate(
          (id) => window.__g.scene.getScene('Village').mission.isComplete(id),
          expect
        );
        if (now) {
          this.note(`${objectName}: ${expect} granted en route by its alternate source`);
          return {
            ok: true,
            viaAlternate: true,
            waitMs: walk.waitMs,
            fleeMs: walk.fleeMs,
            detections: walk.detections,
          };
        }
      }
      const prompt = await this.promptNow();
      if (prompt) {
        const before = await this.page.evaluate(() => {
          const s = window.__g.scene.getScene('Village');
          return s.mission.snapshot().objectives.completed.length;
        });
        await this.tap('KeyE');
        await this.page.waitForTimeout(280);
        const after = await this.page.evaluate(() => {
          const s = window.__g.scene.getScene('Village');
          return s.mission.snapshot().objectives.completed.length;
        });
        if (after > before) {
          await this.clearDialogue();
          return {
            ok: true,
            waitMs: walk.waitMs,
            fleeMs: walk.fleeMs,
            detections: walk.detections,
            breakOffs: walk.breakOffs,
          };
        }
        // Prompt was for something else (a pickup in range). Take it and retry.
        if (prompt.type !== 'prop') continue;
      }
      // Walk the remaining distance directly rather than via A*, which snaps
      // to tile centres and can leave us a tile short.
      const st = await this.sample();
      if (st.dead) return { ok: false, reason: 'died', waitMs: walk.waitMs };
      const dx = target.x - st.x;
      const dy = target.y - st.y;
      const keys = [];
      if (dx > 3) keys.push('KeyD');
      else if (dx < -3) keys.push('KeyA');
      if (dy > 3) keys.push('KeyS');
      else if (dy < -3) keys.push('KeyW');
      if (keys.length === 0) break;
      await this.setKeys(keys);
      await this.page.waitForTimeout(110);
      await this.release();
    }

    const prompt = await this.promptNow();
    const reach = await this.page.evaluate((n) => {
      const s = window.__g.scene.getScene('Village');
      const o = s.level.objects.find((x) => x.name === n);
      if (!o) return null;
      return {
        dist: Math.round(Math.hypot(s.player.x - o.x, s.player.y - o.y)),
        clear: s.level.grid.hasClearReach(s.player.groundPoint, { x: o.x, y: o.y }),
      };
    }, objectName);
    await this.clearDialogue();
    return {
      ok: false,
      reason:
        `no objective granted (prompt=${prompt ? prompt.prompt : 'none'}` +
        `, dist=${reach?.dist}px/28, clearReach=${reach?.clear})`,
      waitMs: walk.waitMs,
      fleeMs: walk.fleeMs,
      detections: walk.detections,
    };
  }

  /** Fires at a live enemy using the real mouse, aiming via camera transform. */
  async engage(enemyName, opts = {}) {
    const { maxMs = 40000 } = opts;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const s = await this.sample();
      if (s.dead) return { ok: false, reason: 'died' };
      const target = s.enemies.find((e) => e.name === enemyName);
      if (!target || target.dead) return { ok: true };

      // Reload rather than dry-firing.
      if (s.ammo && s.ammo[s.weapon] !== undefined && s.ammo[s.weapon] <= 0) {
        await this.tap('KeyR');
        await this.page.waitForTimeout(1400);
        continue;
      }

      const screenX = target.x - s.camera.x;
      const screenY = target.y - 15 - s.camera.y;
      if (screenX < 2 || screenX > 478 || screenY < 2 || screenY > 268) {
        // Off screen: close the distance first.
        await this.goTo({ x: target.x, y: target.y }, { tolerance: 120, timeoutMs: 9000 });
        continue;
      }
      await this.page.mouse.move(screenX, screenY);
      await this.page.mouse.down();
      await this.page.waitForTimeout(140);
      await this.page.mouse.up();
      await this.page.waitForTimeout(260);
    }
    return { ok: false, reason: 'engage timeout' };
  }

  async shot(name, dir) {
    mkdirSync(dir, { recursive: true });
    await this.page.screenshot({ path: `${dir}/${name}` });
  }
}

// ====================================================================
// boot
// ====================================================================

async function boot(browser, { freshSave = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  if (freshSave) await page.addInitScript(HOOK_GAME);
  else
    await page.addInitScript(() => {
      let real;
      Object.defineProperty(window, 'Phaser', {
        configurable: true,
        get() {
          return real;
        },
        set(value) {
          real = value;
          const O = value.Game;
          function Pt(...a) {
            const g = new O(...a);
            window.__g = g;
            return g;
          }
          Pt.prototype = O.prototype;
          Object.setPrototypeOf(Pt, O);
          value.Game = Pt;
        },
      });
    });
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__g?.scene?.isActive('Title'), { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const s = window.__g?.scene?.getScene('Village');
      return s?.scene.isActive() && s.enemies?.length === 7 && s.player && s.doors?.length === 2;
    },
    { timeout: 30000 }
  );
  await page.waitForTimeout(400);
  await page.evaluate(INSTALL_TELEMETRY);
  const driver = new Driver(page);
  await driver.clearDialogue();
  return { page, driver, errors };
}

/** The mandatory beat sequence. Branch waypoints differ per route. */
const BEATS = (route) => [
  { kind: 'interact', name: 'interact_tracks', expect: 'V1' },
  { kind: 'interact', name: 'interact_waybill', expect: 'V2' },
  ...(route === 'garden'
    ? [
        { kind: 'walk', to: P(17, 31), label: 'garden branch mouth' },
        { kind: 'walk', to: P(12, 26), label: 'bakery yard' },
        { kind: 'walk', to: P(8, 12), label: 'garden wall walk' },
        { kind: 'walk', to: P(20, 4), label: 'upper lane' },
        { kind: 'walk', to: P(31, 18), label: 'upper lane east' },
        { kind: 'walk', to: P(49, 13), label: 'lane descent' },
        { kind: 'walk', to: P(51, 27), label: 'courtyard NW (grants V3)' },
      ]
    : [
        { kind: 'walk', to: P(39, 48), label: 'market east lane' },
        { kind: 'walk', to: P(60, 50), label: 'main street' },
        { kind: 'walk', to: P(77, 45), label: 'depot gate (grants V3)' },
      ]),
  { kind: 'interact', name: 'interact_ledger', expect: 'V5' },
  { kind: 'walk', to: P(82, 21), label: 'garage courtyard door' },
  { kind: 'interact', name: 'interact_van', expect: 'V4' },
  { kind: 'walk', to: P(80, 16), label: 'wounded cultist (grants V6)' },
  { kind: 'interact', name: 'interact_inscription', expect: 'V7' },
  { kind: 'exit', to: { x: 1000, y: 18 }, label: 'north road exit' },
];

async function runBeats(driver, route, opts) {
  const results = [];
  for (const beat of BEATS(route)) {
    const t0 = Date.now();
    let r;
    if (beat.kind === 'interact') {
      r = await driver.interact(beat.name, opts);
      if (r.ok) {
        const done = await driver.page.evaluate(
          (id) => window.__g.scene.getScene('Village').mission.isComplete(id),
          beat.expect
        );
        r.granted = done;
      }
    } else if (beat.kind === 'exit') {
      r = opts.stealth
        ? await driver.travel(beat.to, { ...opts, tolerance: 12, label: beat.label })
        : await driver.goTo(beat.to, { ...opts, tolerance: 12, label: beat.label });
      // The exit is a trigger rectangle checked against the player's feet, so
      // press on north until the scene reports the slice complete.
      for (let i = 0; i < 24 && r.ok; i++) {
        const st = await driver.sample();
        if (st.complete) break;
        await driver.setKeys(['KeyW']);
        await driver.page.waitForTimeout(180);
        await driver.release();
        await driver.clearDialogue();
      }
      await driver.page.waitForTimeout(600);
      await driver.clearDialogue();
      const done = await driver.sample();
      r = done.complete
        ? { ...r, ok: true, reason: undefined }
        : { ...r, ok: false, reason: 'reached exit zone but mission did not complete' };
    } else {
      r = opts.stealth
        ? await driver.travel(beat.to, { ...opts, tolerance: 20, label: beat.label })
        : await driver.goTo(beat.to, { ...opts, tolerance: 20, label: beat.label });
      // Region triggers and story actors fire by proximity; let them.
      await driver.page.waitForTimeout(900);
      await driver.clearDialogue();
    }
    const state = await driver.sample();
    if (opts.shots) {
      const slug = String(beat.name ?? beat.label).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await driver.shot(`${opts.shots}-${String(results.length).padStart(2, '0')}-${slug}.png`, SHOTS);
    }
    results.push({
      step: beat.name ?? beat.label,
      ok: r.ok,
      reason: r.reason,
      waitMs: r.waitMs ?? 0,
      fleeMs: r.fleeMs ?? 0,
      detections: r.detections ?? 0,
      breakOffs: r.breakOffs ?? 0,
      wallMs: Date.now() - t0,
      gameT: state.elapsed,
      objectives: [...state.objectives],
      hp: state.hp,
    });
    console.log(
      `   ${r.ok ? 'ok  ' : 'FAIL'} ${(beat.name ?? beat.label).padEnd(34)} ` +
        `t=${state.elapsed.toFixed(1)}s hp=${state.hp} obj=[${state.objectives.join(',')}]` +
        (r.reason ? `  <- ${r.reason}` : '')
    );
    if (!r.ok && beat.kind === 'interact') break;
  }
  return results;
}

// ====================================================================
// scenarios
// ====================================================================

const SHOTS = 'docs/playtests/screenshots';

async function scenarioStealth(browser, route) {
  const name = route === 'garden' ? 'garden-stealth' : 'main-stealth';
  console.log(`\n=== Scenario ${route === 'garden' ? 'B' : 'A'}: ${name} ===`);
  const { page, driver, errors } = await boot(browser);
  await driver.setCrouch(true);
  const beats = await runBeats(driver, route, { stealth: true, crouch: true, timeoutMs: 120000 });
  const final = await driver.sample();
  await driver.shot(`${name}-final.png`, SHOTS);
  const tel = await page.evaluate(() => window.__tel);
  await page.close();
  return { name, route, style: 'stealth', beats, final, tel, errors, samples: driver.samples };
}

async function scenarioCombat(browser) {
  console.log('\n=== Scenario C: direct combat ===');
  const { page, driver, errors } = await boot(browser);
  // Fight through each encounter as it is met, then continue the beats.
  const beats = [];
  const order = [
    { engage: ['enemy_l1', 'enemy_l2'], then: 'interact_tracks', expect: 'V1' },
    { engage: ['enemy_l3'], then: 'interact_waybill', expect: 'V2' },
  ];
  for (const stage of order) {
    for (const e of stage.engage) {
      const near = await driver.page.evaluate((n) => {
        const s = window.__g.scene.getScene('Village');
        const t = s.enemies.find((x) => x.name === n);
        return t && !t.dead ? { x: t.x, y: t.y } : null;
      }, e);
      if (!near) continue;
      await driver.goTo(near, { tolerance: 140, timeoutMs: 60000 });
      const r = await driver.engage(e);
      console.log(`   engage ${e}: ${r.ok ? 'down' : 'FAILED ' + r.reason}`);
      beats.push({ step: `engage ${e}`, ok: r.ok, reason: r.reason });
    }
    const r = await driver.interact(stage.then, { timeoutMs: 90000, fight: true });
    const st = await driver.sample();
    beats.push({ step: stage.then, ok: r.ok, reason: r.reason, gameT: st.elapsed, hp: st.hp });
    console.log(`   ${r.ok ? 'ok  ' : 'FAIL'} ${stage.then} t=${st.elapsed.toFixed(1)}s hp=${st.hp}`);
  }
  await driver.shot('combat-market.png', SHOTS);
  // Remaining beats, fighting anything that engages on the way.
  const rest = await runBeats(driver, 'main', { timeoutMs: 150000, fight: true });
  const final = await driver.sample();
  await driver.shot('combat-final.png', SHOTS);
  const tel = await page.evaluate(() => window.__tel);
  await page.close();
  return {
    name: 'combat',
    route: 'main',
    style: 'combat',
    beats: [...beats, ...rest],
    final,
    tel,
    errors,
    samples: driver.samples,
  };
}

async function scenarioSprint(browser, attempt) {
  console.log(`\n=== Scenario D: sprint-through (attempt ${attempt}) ===`);
  const { page, driver, errors } = await boot(browser);
  // Vary the patrol phase by idling a different amount before starting.
  const idle = attempt * 4200;
  if (idle > 0) {
    console.log(`   idling ${idle}ms to shift patrol phase`);
    await page.waitForTimeout(idle);
  }
  const beats = await runBeats(driver, 'main', {
    sprint: true,
    timeoutMs: 120000,
    // Capture a real frame at every beat of this run, not a staged position.
    shots: attempt === 0 ? 'playthrough' : null,
  });
  const final = await driver.sample();
  await driver.shot(`sprint-${attempt}-final.png`, SHOTS);
  const tel = await page.evaluate(() => window.__tel);
  await page.close();
  return {
    name: `sprint-${attempt}`,
    route: 'main',
    style: 'sprint',
    beats,
    final,
    tel,
    errors,
    samples: driver.samples,
  };
}

async function scenarioCheckpoint(browser) {
  console.log('\n=== Scenario E: checkpoint recovery ===');
  const { page, driver, errors } = await boot(browser);
  const steps = [];

  // Reach the office and take the key through normal play.
  for (const beat of [
    { kind: 'interact', name: 'interact_tracks' },
    { kind: 'interact', name: 'interact_waybill' },
    { kind: 'walk', to: P(39, 48) },
    { kind: 'walk', to: P(60, 50) },
    { kind: 'walk', to: P(77, 45) },
    { kind: 'interact', name: 'interact_ledger' },
  ]) {
    const r =
      beat.kind === 'interact'
        ? await driver.interact(beat.name, { timeoutMs: 120000 })
        : await driver.goTo(beat.to, { tolerance: 20, timeoutMs: 120000 });
    if (beat.kind === 'walk') await driver.page.waitForTimeout(800);
    await driver.clearDialogue();
    if (!r.ok) steps.push({ step: beat.name ?? 'walk', ok: false, reason: r.reason });
  }
  const afterKey = await driver.sample();
  steps.push({
    step: 'key acquired through normal play',
    ok: afterKey.hasKey,
    objectives: [...afterKey.objectives],
    doorsOpen: afterKey.doorsOpen,
  });
  console.log(`   key=${afterKey.hasKey} objectives=[${afterKey.objectives.join(',')}]`);
  await driver.shot('checkpoint-key-taken.png', SHOTS);

  // The save the game itself wrote at cp_office.
  const saved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tempest.save.v1') ?? window.localStorage.getItem('tempest.save');
    const keys = Object.keys(window.localStorage);
    return { keys, raw: raw ? JSON.parse(raw) : null };
  });
  steps.push({
    step: 'save written to localStorage',
    ok: !!saved.raw,
    keys: saved.keys,
    version: saved.raw?.version,
    checkpointId: saved.raw?.checkpointId,
    missionObjectives: saved.raw?.mission?.objectives?.completed,
    hasGarageKey: saved.raw?.mission?.hasGarageKey,
    openDoors: saved.raw?.mission?.openDoors,
    enemyCount: saved.raw?.enemies?.length,
  });
  console.log(
    `   save: version=${saved.raw?.version} cp=${saved.raw?.checkpointId} ` +
      `key=${saved.raw?.mission?.hasGarageKey} doors=${saved.raw?.mission?.openDoors?.length} ` +
      `enemies=${saved.raw?.enemies?.length}`
  );

  // --- death and checkpoint reload, caused by real enemy fire -----------
  // Stand in the open courtyard until the guards kill us. No state is set.
  console.log('   provoking death in the open courtyard...');
  await driver.goTo(P(70, 40), { tolerance: 24, timeoutMs: 60000 });
  const diedAt = Date.now();
  let died = false;
  while (Date.now() - diedAt < 70000) {
    const s = await driver.sample();
    if (s.dead) {
      died = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  steps.push({ step: 'killed by enemy fire', ok: died });
  console.log(`   died=${died}`);
  if (died) {
    await driver.shot('checkpoint-death.png', SHOTS);
    // The scene reloads the checkpoint itself after 1.2s.
    await page.waitForTimeout(4000);
    const after = await driver.sample();
    steps.push({
      step: 'after automatic checkpoint reload',
      ok: !after.dead && after.hasKey,
      hp: after.hp,
      hasKey: after.hasKey,
      doorsOpen: after.doorsOpen,
      objectives: [...after.objectives],
      enemiesAlive: after.enemies.filter((e) => !e.dead).length,
    });
    console.log(
      `   reloaded: hp=${after.hp} key=${after.hasKey} ` +
        `doors=[${after.doorsOpen.map((d) => d.open).join(',')}] obj=[${after.objectives.join(',')}]`
    );
  }

  // --- browser refresh and save restoration -----------------------------
  console.log('   reloading the browser to test save restoration...');
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
  await page.waitForTimeout(900);
  await page.evaluate(INSTALL_TELEMETRY);
  const driver2 = new Driver(page);
  await driver2.clearDialogue();
  const restored = await driver2.sample();
  steps.push({
    step: 'after browser refresh',
    ok: restored.hasKey && restored.objectives.includes('V5'),
    hasKey: restored.hasKey,
    doorsOpen: restored.doorsOpen,
    objectives: [...restored.objectives],
    position: { x: Math.round(restored.x), y: Math.round(restored.y) },
    enemies: restored.enemies.map((e) => ({ name: e.name, x: e.x, y: e.y, dead: e.dead })),
  });
  console.log(
    `   restored: key=${restored.hasKey} obj=[${restored.objectives.join(',')}] ` +
      `doors=[${restored.doorsOpen.map((d) => `${d.name}:${d.open}`).join(' ')}]`
  );
  await driver2.shot('checkpoint-after-refresh.png', SHOTS);

  // --- can the mission still be finished from the restored save? --------
  console.log('   finishing the mission from the restored checkpoint...');
  const finish = [];
  for (const beat of [
    { kind: 'walk', to: P(82, 21), label: 'garage door' },
    { kind: 'interact', name: 'interact_van' },
    { kind: 'walk', to: P(80, 16), label: 'cultist' },
    { kind: 'interact', name: 'interact_inscription' },
    { kind: 'exit', to: { x: 1000, y: 18 }, label: 'exit' },
  ]) {
    const r =
      beat.kind === 'interact'
        ? await driver2.interact(beat.name, { timeoutMs: 120000 })
        : await driver2.goTo(beat.to, { tolerance: 20, timeoutMs: 120000 });
    if (beat.kind === 'walk') await driver2.page.waitForTimeout(900);
    await driver2.clearDialogue();
    const st = await driver2.sample();
    finish.push({ step: beat.name ?? beat.label, ok: r.ok, reason: r.reason, objectives: [...st.objectives] });
    console.log(`   ${r.ok ? 'ok  ' : 'FAIL'} ${(beat.name ?? beat.label).padEnd(20)} obj=[${st.objectives.join(',')}]`);
  }
  const final = await driver2.sample();
  steps.push({ step: 'completion after restore', ok: final.complete, objectives: [...final.objectives] });
  await driver2.shot('checkpoint-completed.png', SHOTS);
  const tel = await page.evaluate(() => window.__tel);
  await page.close();
  return { name: 'checkpoint', style: 'checkpoint', beats: [...steps, ...finish], final, tel, errors };
}

// ====================================================================
// main
// ====================================================================

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const wanted =
  scenarioName === 'all'
    ? ['main-stealth', 'garden-stealth', 'combat', 'sprint', 'checkpoint']
    : [scenarioName];
const results = [];
for (const s of wanted) {
  try {
    if (s === 'main-stealth') results.push(await scenarioStealth(browser, 'main'));
    else if (s === 'garden-stealth') results.push(await scenarioStealth(browser, 'garden'));
    else if (s === 'combat') results.push(await scenarioCombat(browser));
    else if (s === 'sprint') {
      for (let a = 0; a < 3; a++) results.push(await scenarioSprint(browser, a));
    } else if (s === 'checkpoint') results.push(await scenarioCheckpoint(browser));
    else console.error(`unknown scenario ${s}`);
  } catch (err) {
    console.error(`scenario ${s} threw: ${err.message.split('\n')[0]}`);
    results.push({ name: s, error: err.message.split('\n')[0] });
  }
}
await browser.close();

mkdirSync(outDir, { recursive: true });
for (const r of results) {
  writeFileSync(`${outDir}/${r.name}.json`, JSON.stringify(r, null, 1));
}

console.log('\n================ SUMMARY ================');
for (const r of results) {
  if (r.error) {
    console.log(`${r.name.padEnd(16)} ERROR ${r.error}`);
    continue;
  }
  const t = r.tel ?? {};
  const log = t.log ?? [];
  const count = (k) => log.filter((e) => e.kind === k).length;
  console.log(
    `${r.name.padEnd(16)} complete=${String(r.final?.complete).padEnd(5)} ` +
      `obj=${r.final?.objectives?.length ?? 0}/8 ` +
      `gameT=${(r.final?.elapsed ?? 0).toFixed(1)}s ` +
      `active=${((t.activeMs ?? 0) / 1000).toFixed(1)}s ` +
      `hp=${r.final?.hp} ` +
      `shots=${count('player_shot')} kills=${count('enemy_down')} ` +
      `hurt=${count('player_hurt')} deaths=${count('checkpoint_reload')} ` +
      `shouts=${count('shout')} rallies=${count('rally')}`
  );
}
console.log(`\nwrote ${results.length} json file(s) to ${outDir}`);
