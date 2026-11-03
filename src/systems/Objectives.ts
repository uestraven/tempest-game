/**
 * Event-driven, idempotent objective state machine. Completing the same ID
 * twice grants nothing twice (spec acceptance 5).
 */

import { OBJECTIVES, type ObjectiveDef } from '../data/objectives';

export interface ObjectiveSnapshot {
  completed: string[];
}

type Handler = (def: ObjectiveDef) => void;

export class Objectives {
  private readonly completed = new Set<string>();
  private readonly byId = new Map<string, ObjectiveDef>();
  private readonly onCompleteHandlers: Handler[] = [];
  private readonly defs: ObjectiveDef[];

  constructor(defs: ObjectiveDef[] = OBJECTIVES) {
    this.defs = defs;
    for (const def of defs) this.byId.set(def.id, def);
  }

  onComplete(handler: Handler): void {
    this.onCompleteHandlers.push(handler);
  }

  isComplete(id: string): boolean {
    return this.completed.has(id);
  }

  /** True when every prerequisite of `id` is already complete. */
  isAvailable(id: string): boolean {
    const def = this.byId.get(id);
    if (!def) return false;
    return def.requires.every((req) => this.completed.has(req));
  }

  /**
   * Returns true only on the transition from incomplete to complete, so callers
   * can safely fire dialogue, clues and checkpoints from the return value.
   */
  complete(id: string): boolean {
    const def = this.byId.get(id);
    if (!def) return false;
    if (this.completed.has(id)) return false;
    if (!this.isAvailable(id)) return false;
    this.completed.add(id);
    for (const handler of this.onCompleteHandlers) handler(def);
    return true;
  }

  /** The first incomplete, available, non-optional objective. */
  active(): ObjectiveDef | null {
    for (const def of this.defs) {
      if (def.optional) continue;
      if (!this.completed.has(def.id) && this.isAvailable(def.id)) return def;
    }
    // Fall back to the first incomplete mandatory objective even if gated, so
    // the HUD never goes blank mid-level.
    return this.defs.find((d) => !d.optional && !this.completed.has(d.id)) ?? null;
  }

  activeText(): string {
    return this.active()?.text ?? 'Objective complete.';
  }

  snapshot(): ObjectiveSnapshot {
    return { completed: [...this.completed] };
  }

  restore(snapshot: ObjectiveSnapshot | undefined): void {
    this.completed.clear();
    for (const id of snapshot?.completed ?? []) if (this.byId.has(id)) this.completed.add(id);
  }
}
