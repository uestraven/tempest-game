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
