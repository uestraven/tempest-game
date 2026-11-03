/**
 * localStorage persistence with versioning. A snapshot that fails to parse or
 * carries the wrong version is discarded rather than half-applied, so corrupted
 * progress can never resume into a broken state (spec acceptance 6).
 */

import { SAVE_KEY, SAVE_VERSION } from '../core/constants';
import type { ObjectiveSnapshot } from './Objectives';
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
  objectives: ObjectiveSnapshot;
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
    if (parsed?.version !== SAVE_VERSION) return null;
    if (!parsed.player || !Array.isArray(parsed.enemies)) return null;
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
