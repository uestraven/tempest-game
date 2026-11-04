/**
 * Valcendre mission state: the objective chain plus the physical and narrative
 * state that goes with it - the garage key, the garage doors, and one-shot story
 * events.
 *
 * Phaser-free on purpose. The whole progression contract is testable headless:
 * that either evidence source completes a beat, that using both grants nothing
 * twice, that no beat can be reached out of order, that neither garage entrance
 * opens without the key, and that a checkpoint restores the physical state and
 * not just the HUD line.
 *
 * The scene owns sprites, dialogue and audio; this owns the rules.
 */

import { Objectives, type ObjectiveSnapshot } from './Objectives';
import { OBJECTIVES, type ObjectiveDef } from '../data/objectives';

/** Story events that must happen at most once per playthrough. */
export type MissionEvent =
  | 'cultist_scene'
  | 'arrival_dialogue'
  | 'depot_dialogue'
  | 'belial_dialogue';

export interface MissionSnapshot {
  objectives: ObjectiveSnapshot;
  hasGarageKey: boolean;
  /** Names of doors that have been unlocked. */
  openDoors: string[];
  /** One-shot story events already played. */
  events: string[];
  /** Region triggers that have already fired. */
  firedTriggers: string[];
}

export interface EvidenceResult {
  /** True only on the transition from incomplete to complete. */
  granted: boolean;
  /** Set when the interaction was refused because a prerequisite is missing. */
  blockedBy?: string;
  def?: ObjectiveDef;
}

/**
 * Doors the garage key opens. Both entrances are listed, so neither can be the
 * one that quietly bypasses the lock.
 */
export const GARAGE_DOORS = ['door_garage_courtyard', 'door_garage_dock'] as const;
export type GarageDoor = (typeof GARAGE_DOORS)[number];

/** The beat that grants the garage key. */
export const KEY_OBJECTIVE = 'V5';

export class Mission {
  readonly objectives: Objectives;

  private garageKey = false;
  private readonly openDoors = new Set<string>();
  private readonly events = new Set<string>();
  private readonly firedTriggers = new Set<string>();

  constructor(defs: ObjectiveDef[] = OBJECTIVES) {
    this.objectives = new Objectives(defs);
  }

  // ------------------------------------------------------------- objectives

  isComplete(id: string): boolean {
    return this.objectives.isComplete(id);
  }

  activeText(): string {
    return this.objectives.activeText();
  }

  active(): ObjectiveDef | null {
    return this.objectives.active();
  }

  /**
   * Completes a beat from a piece of evidence, a region trigger or a scripted
   * scene. Idempotent and dependency-driven: a second source for the same beat
   * reports `granted: false`, so the caller cannot play the clue or the dialogue
   * twice, and an out-of-order attempt reports which prerequisite is missing.
   *
   * Completing V5 is also what grants the garage key and unlocks both garage
   * doors, so the key can never be separated from the beat that supplies it.
   */
  complete(id: string): EvidenceResult {
    if (this.objectives.isComplete(id)) return { granted: false };
    if (!this.objectives.isAvailable(id)) {
      const def = OBJECTIVES.find((o) => o.id === id);
      const missing = def?.requires.find((r) => !this.objectives.isComplete(r));
      return { granted: false, blockedBy: missing ?? 'unknown' };
    }
    const granted = this.objectives.complete(id);
    if (!granted) return { granted: false };

    if (id === KEY_OBJECTIVE) this.grantGarageKey();

    return { granted: true, def: OBJECTIVES.find((o) => o.id === id) };
  }

  // -------------------------------------------------------------- the key

  get hasGarageKey(): boolean {
    return this.garageKey;
  }

  /**
   * The key comes off the office desk, never off a guard, and unlocking is
   * immediate so the player is never sent back for a second interaction.
   */
  private grantGarageKey(): void {
    this.garageKey = true;
    for (const door of GARAGE_DOORS) this.openDoors.add(door);
  }

  // --------------------------------------------------------------- doors

  isDoorOpen(name: string): boolean {
    return this.openDoors.has(name);
  }

  /** A door is locked until the key is held; there is no other way through. */
  isDoorLocked(name: string): boolean {
    return !this.openDoors.has(name);
  }

  // -------------------------------------------------------- one-shot events

  /** True only the first time, so a scene cannot replay after a reload. */
  markEvent(event: MissionEvent | string): boolean {
    if (this.events.has(event)) return false;
    this.events.add(event);
    return true;
  }

  hasEvent(event: MissionEvent | string): boolean {
    return this.events.has(event);
  }

  /**
   * Region triggers. `true` only on the first entry, so a trigger the player
   * walks back across does nothing, and a trigger crossed before its
   * prerequisite was met is still available afterwards - the caller simply
   * re-attempts while the player stands in it.
   */
  fireTrigger(name: string): boolean {
    if (this.firedTriggers.has(name)) return false;
    this.firedTriggers.add(name);
    return true;
  }

  hasFired(name: string): boolean {
    return this.firedTriggers.has(name);
  }

  // ------------------------------------------------------------ snapshots

  snapshot(): MissionSnapshot {
    return {
      objectives: this.objectives.snapshot(),
      hasGarageKey: this.garageKey,
      openDoors: [...this.openDoors],
      events: [...this.events],
      firedTriggers: [...this.firedTriggers],
    };
  }

  /**
   * Restores a snapshot wholesale. The key and the doors are restored from the
   * snapshot rather than re-derived, so a checkpoint taken mid-mission brings
   * back the physical state of the level and not only the HUD line - but V5
   * implying the key is still enforced, so a hand-edited save cannot produce a
   * completed ledger with a locked garage.
   */
  restore(snapshot: MissionSnapshot | undefined): void {
    this.objectives.restore(snapshot?.objectives);
    this.garageKey = snapshot?.hasGarageKey ?? false;

    this.openDoors.clear();
    for (const door of snapshot?.openDoors ?? []) this.openDoors.add(door);

    this.events.clear();
    for (const event of snapshot?.events ?? []) this.events.add(event);

    this.firedTriggers.clear();
    for (const trigger of snapshot?.firedTriggers ?? []) this.firedTriggers.add(trigger);

    // Invariant: completing V5 grants the key and opens both doors. Repairing
    // it here means no restore path can leave the garage permanently shut.
    if (this.objectives.isComplete(KEY_OBJECTIVE)) this.grantGarageKey();
  }

  /** Fresh start, used when there is no checkpoint to restore. */
  reset(): void {
    this.restore(undefined);
  }
}
