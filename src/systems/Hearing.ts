/**
 * Sound propagation. A sound creates an investigate target near the event -
 * never a lock onto the player's exact live position (spec section 7).
 */

import type { Grid, Vec2 } from '../core/Grid';

export type SoundKind = 'footstep' | 'gunshot' | 'distraction' | 'shout';

export interface SoundEvent {
  x: number;
  y: number;
  radius: number;
  kind: SoundKind;
  /** Shouts only rally guards; they must not make the hearer target the player directly. */
  fromPlayer: boolean;
}

export type SoundListener = (event: SoundEvent) => void;

/**
 * How vaguely each kind of sound localises, in pixels of scatter around the
 * event position.
 *
 * A sound tells a listener roughly where, not exactly where, so the
 * investigate target is offset within this radius. Footsteps are the vaguest
 * cue and get the widest scatter. The radio is zero ON PURPOSE: it is a fixed
 * object making a noise in a known place, and walking straight to it is the
 * entire point of a distraction.
 *
 * Lives here rather than in Enemy so the contract is Phaser-free and testable.
 * Phase C.1B-04B-1 found footsteps localising exactly, which let a guard that
 * had never seen the player follow them through cover at about seven position
 * updates a second.
 */
export const SOUND_SCATTER: Record<SoundKind, number> = {
  footstep: 48,
  gunshot: 36,
  distraction: 0,
  shout: 0,
};

/**
 * Minimum seconds between two sound-driven suspicion bumps for one listener.
 *
 * Sprinting emits a footstep every 22 px, about seven a second. At 34 suspicion
 * each that is ~234/s, nearly double the 120/s for actually SEEING a sprinter,
 * which pinned suspicion above the de-escalation threshold indefinitely. Rate
 * limiting keeps hearing strictly less informative than sight.
 */
export const SOUND_REFRACTORY = 0.6;

export class Hearing {
  private readonly listeners = new Set<SoundListener>();

  constructor(private readonly grid: Grid) {}

  subscribe(listener: SoundListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Walls attenuate non-gunshot sounds; gunshots carry through rooms at full
   * radius, though a gunshot alone does not reveal where the player is standing.
   */
  audibleRadiusAt(event: SoundEvent, listenerPos: Vec2): number {
    if (event.radius <= 0) return 0;
    if (event.kind === 'gunshot') return event.radius;
    const clear = this.grid.hasClearReach({ x: event.x, y: event.y }, listenerPos);
    return clear ? event.radius : event.radius * 0.5;
  }

  emit(event: SoundEvent): void {
    if (event.radius <= 0) return;
    // Snapshot so a listener reacting by spawning/removing actors cannot mutate
    // the set mid-iteration.
    for (const listener of [...this.listeners]) listener(event);
  }
}
