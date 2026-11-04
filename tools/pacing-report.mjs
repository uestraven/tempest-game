/**
 * Derives the Phase C.1B-04A pacing breakdown from recorded playthrough traces.
 *
 *   node tools/pacing-report.mjs docs/playtests/data [moreDirs...]
 *
 * Reads the JSON that tools/playthrough.mjs writes and classifies every sampled
 * interval into one activity, so the categories sum to the run's wall time
 * rather than overlapping. Classification is by priority, because a sample can
 * satisfy several conditions at once:
 *
 *   recovery   > the player is dead, waiting for the checkpoint reload
 *   dialogue   > a dialogue box is open
 *   combat     > some guard is in the combat state
 *   observing  > alive, not in combat, and not moving (waiting for a patrol)
 *   traversal  > alive, not in combat, and moving
 *
 * "Interactions" are counted as events rather than duration: pressing E is
 * instantaneous, and the time around it is already traversal or observation.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node tools/pacing-report.mjs <dir> [dir...]');
  process.exit(2);
}

const runs = [];
for (const dir of dirs) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    continue;
  }
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (data && data.name) runs.push({ file: join(dir, f), ...data });
    } catch {
      /* skip unreadable */
    }
  }
}
if (runs.length === 0) {
  console.error('no run data found');
  process.exit(1);
}

const MOVE_EPS = 1.5; // px between samples that still counts as standing still

function classify(run) {
  const s = run.samples ?? [];
  const buckets = { recovery: 0, dialogue: 0, combat: 0, observing: 0, traversal: 0 };
  let distance = 0;
  let crouchMs = 0;
  let shadowMs = 0;
  let sprintMs = 0;
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1];
    const cur = s[i];
    const dt = cur.wall - prev.wall;
    if (dt <= 0 || dt > 4000) continue; // skip gaps from page-level waits
    const moved = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    distance += moved;
    if (cur.crouched) crouchMs += dt;
    if (cur.inShadow) shadowMs += dt;
    if (cur.sprinting) sprintMs += dt;

    if (cur.dead) buckets.recovery += dt;
    else if (cur.dialogue) buckets.dialogue += dt;
    else if (cur.enemies.some((e) => !e.dead && e.state === 'combat')) buckets.combat += dt;
    else if (moved < MOVE_EPS) buckets.observing += dt;
    else buckets.traversal += dt;
  }
  return { buckets, distance, crouchMs, shadowMs, sprintMs, samples: s.length };
}

function beatTimes(run) {
  const out = {};
  for (const e of run.tel?.log ?? []) if (e.kind === 'objective') out[e.id] = e.t;
  return out;
}

const ORDER = ['V1', 'V2', 'V3', 'V5', 'V4', 'V6', 'V7', 'V8'];
const rows = [];

console.log('================ PLAYTHROUGH PACING ================\n');
for (const run of runs.sort((a, b) => a.name.localeCompare(b.name))) {
  const m = classify(run);
  const log = run.tel?.log ?? [];
  const count = (k) => log.filter((e) => e.kind === k).length;
  const sum = Object.values(m.buckets).reduce((a, b) => a + b, 0) || 1;
  const beats = beatTimes(run);
  const pct = (v) => `${((v / sum) * 100).toFixed(0)}%`;
  const sec = (v) => (v / 1000).toFixed(1);

  const playerShots = log.filter((e) => e.kind === 'player_shot');
  const hits = playerShots.reduce((a, e) => a + (e.hits ?? 0), 0);
  const damageTaken = log
    .filter((e) => e.kind === 'player_hurt')
    .reduce((a, e) => a + (e.amount ?? 0), 0);

  rows.push({
    name: run.name,
    style: run.style,
    complete: !!run.final?.complete,
    objectives: run.final?.objectives?.length ?? 0,
    gameSeconds: run.final?.elapsed ?? 0,
    activeSeconds: (run.tel?.activeMs ?? 0) / 1000,
    hp: run.final?.hp,
    distance: Math.round(m.distance),
    buckets: m.buckets,
    crouchSeconds: m.crouchMs / 1000,
    shadowSeconds: m.shadowMs / 1000,
    beats,
    shotsFired: playerShots.length,
    shotsHit: hits,
    accuracy: playerShots.length ? hits / playerShots.length : null,
    kills: count('enemy_down'),
    damageTaken,
    hitsTaken: count('player_hurt'),
    enemyShots: count('enemy_shot'),
    deaths: count('checkpoint_reload'),
    pickups: count('pickup'),
    shouts: count('shout'),
    rallies: count('rally'),
    checkpoints: count('checkpoint'),
  });

  console.log(
    `${run.name}  [${run.style}]  complete=${!!run.final?.complete}  ` +
      `${run.final?.objectives?.length ?? 0}/8 beats  game ${(run.final?.elapsed ?? 0).toFixed(1)}s  hp ${run.final?.hp}`
  );
  console.log(
    `  time   traversal ${sec(m.buckets.traversal)}s ${pct(m.buckets.traversal)}` +
      ` | observing ${sec(m.buckets.observing)}s ${pct(m.buckets.observing)}` +
      ` | combat ${sec(m.buckets.combat)}s ${pct(m.buckets.combat)}` +
      ` | dialogue ${sec(m.buckets.dialogue)}s ${pct(m.buckets.dialogue)}` +
      ` | recovery ${sec(m.buckets.recovery)}s ${pct(m.buckets.recovery)}`
  );
  console.log(
    `  moved ${Math.round(m.distance)}px  crouched ${sec(m.crouchMs)}s  in shadow ${sec(m.shadowMs)}s`
  );
  console.log(
    `  combat shots ${playerShots.length} hits ${hits}` +
      `${playerShots.length ? ` (${((hits / playerShots.length) * 100).toFixed(0)}%)` : ''}` +
      `  kills ${count('enemy_down')}  took ${damageTaken} dmg over ${count('player_hurt')} hits` +
      `  enemy shots ${count('enemy_shot')}  deaths ${count('checkpoint_reload')}`
  );
  console.log(
    `  alerts shouts ${count('shout')} rallies ${count('rally')}  checkpoints ${count('checkpoint')}  pickups ${count('pickup')}`
  );
  const beatLine = ORDER.map((b) => (beats[b] !== undefined ? `${b}@${beats[b].toFixed(1)}s` : `${b}:-`)).join(
    '  '
  );
  console.log(`  beats  ${beatLine}\n`);
}

// Longest stretch with no meaningful decision: alive, not in combat, standing.
console.log('--- longest stretches with no meaningful decision ---');
for (const run of runs) {
  const s = run.samples ?? [];
  let best = 0;
  let bestAt = 0;
  let cur = 0;
  let curStart = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].wall - s[i - 1].wall;
    if (dt <= 0 || dt > 4000) continue;
    const moved = Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    const idle =
      !s[i].dead && !s[i].dialogue && moved < MOVE_EPS && !s[i].enemies.some((e) => !e.dead && e.state === 'combat');
    if (idle) {
      if (cur === 0) curStart = s[i].elapsed;
      cur += dt;
      if (cur > best) {
        best = cur;
        bestAt = curStart;
      }
    } else cur = 0;
  }
  if (best > 0)
    console.log(`  ${run.name.padEnd(16)} ${(best / 1000).toFixed(1)}s idle, starting at t=${bestAt.toFixed(1)}s`);
}

writeFileSync('docs/playtests/data/pacing-summary.json', JSON.stringify(rows, null, 1));
console.log('\nwrote docs/playtests/data/pacing-summary.json');
