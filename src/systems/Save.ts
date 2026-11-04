/**
 * localStorage persistence with versioning. A snapshot that fails to parse or
 * carries the wrong version is discarded rather than half-applied, so corrupted
 * progress can never resume into a broken state (spec acceptance 6).
 */

import { SAVE_KEY, SAVE_VERSION } from '../core/constants';
import type { MissionSnapshot } from './Mission';
import type { WeaponId } from '../data/weapons';

export interface AmmoSnapshot {
  loaded: number;
  reserve: number;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  hp: number;
  crouched: boolean;
  weapon: WeaponId;
  unlockedShotgun: boolean;
  ammo: Record<WeaponId, AmmoSnapshot>;
}

export interface EnemySnapshot {
  name: string;
  x: number;
  y: number;
  facing: number;
  hp: number;
  dead: boolean;
  suspicion: number;
  routeIndex: number;
}

export interface Checkpoint {
  version: number;
  level: string;
  checkpointId: string;
  player: PlayerSnapshot;
  enemies: EnemySnapshot[];
  /**
   * Objectives, the garage key, which doors are open, one-shot story events and
   * fired region triggers. Restoring this brings back the PHYSICAL state of the
   * level - a locked door stays locked, an opened one stays open - not just the
   * HUD objective line.
   */
  mission: MissionSnapshot;
  /** Object names already consumed, so reloading cannot duplicate a pickup. */
  consumed: string[];
  /** One-shot interactables already used. */
  used: string[];
  clues: string[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // privacy mode / blocked storage: run without persistence
  }
}

export function writeSave(checkpoint: Checkpoint): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, JSON.stringify({ ...checkpoint, version: SAVE_VERSION }));
  } catch {
    // Quota or serialisation failure: the in-memory checkpoint still works.
  }
}

export function readSave(): Checkpoint | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Checkpoint;
    // A save from an older schema carries objective IDs whose meanings have
    // changed, so it is discarded rather than reinterpreted.
    if (parsed?.version !== SAVE_VERSION) return null;
    if (!parsed.player || !Array.isArray(parsed.enemies)) return null;
    if (!parsed.mission || !parsed.mission.objectives) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Whether a checkpoint's enemy roster still describes the level's current one.
 *
 * CONTENT-REVISION POLICY. Enemy snapshots are keyed by name, but a name alone
 * does not make a position valid: Phase C.1B-03 moved every guard and rewrote
 * every patrol route, so a save written against the old three-Lookout layout
 * describes `enemy_l1` standing somewhere `enemy_l1` no longer patrols, with a
 * `routeIndex` that indexes a route that no longer exists.
 *
 * When this returns false the caller must reset every guard to its authored
 * spawn rather than restore any of them. The mission snapshot - objectives, the
 * garage key, the doors, story events - is still restored, so the player keeps
 * their story progress and loses only stale guard positions. That is cheaper
 * for the player than rejecting the save outright, and it is explicit rather
 * than silently reinterpreting obsolete coordinates.
 */
export function enemyRosterMatches(saved: EnemySnapshot[], current: string[]): boolean {
  if (saved.length !== current.length) return false;
  const a = saved.map((e) => e.name).sort();
  const b = [...current].sort();
  return a.every((name, i) => name === b[i]);
}
