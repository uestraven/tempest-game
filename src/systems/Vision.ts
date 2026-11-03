/**
 * Suspicion accumulation. Pure functions over a small snapshot of state so the
 * detection contract can be unit tested without Phaser (spec acceptance 3).
 */

import { Grid, angleDelta, type Vec2 } from '../core/Grid';
import { VISION } from '../core/constants';

export type Stance = 'standing' | 'crouching' | 'sprinting';

export interface ObserverState {
  pos: Vec2;
  /** Facing angle in radians; the centre of the vision cone. */
  facing: number;
}

export interface TargetState {
  pos: Vec2;
  stance: Stance;
  /** True when the target stands inside an authored dark zone. */
  inShadow: boolean;
}

export interface SightResult {
  visible: boolean;
  distance: number;
  /** Suspicion points per second this frame; 0 when not visible. */
  rate: number;
}

/** Is `target` inside the observer's cone, in range, and not occluded? */
export function canSee(grid: Grid, observer: ObserverState, target: TargetState): SightResult {
  const dx = target.pos.x - observer.pos.x;
  const dy = target.pos.y - observer.pos.y;
  const distance = Math.hypot(dx, dy);

  if (distance > VISION.maxDistance) return { visible: false, distance, rate: 0 };

  const toTarget = Math.atan2(dy, dx);
  const halfCone = (VISION.coneDegrees / 2) * (Math.PI / 180);
  if (Math.abs(angleDelta(observer.facing, toTarget)) > halfCone)
    return { visible: false, distance, rate: 0 };

  const crouched = target.stance === 'crouching';
  if (!grid.hasLineOfSight(observer.pos, target.pos, crouched))
    return { visible: false, distance, rate: 0 };

  return { visible: true, distance, rate: suspicionRate(target, distance) };
}

/** Points per second for a visible target. Crouch slows detection; it never negates it. */
export function suspicionRate(target: TargetState, distance: number): number {
  let rate: number;
  switch (target.stance) {
    case 'sprinting':
      rate = VISION.ratesSprinting;
      break;
    case 'crouching':
      rate = target.inShadow ? VISION.ratesCrouchingShadow : VISION.ratesCrouching;
      break;
    default:
      rate = VISION.ratesStanding;
  }
  if (distance <= VISION.proximityDistance) rate *= VISION.proximityMultiplier;
  return rate;
}

export type AlertLevel = 'unaware' | 'suspicious' | 'combat';

export function alertLevelFor(suspicion: number): AlertLevel {
  if (suspicion >= VISION.combatThreshold) return 'combat';
  if (suspicion >= VISION.suspiciousThreshold) return 'suspicious';
  return 'unaware';
}

/** Integrates one frame of suspicion. Returns the clamped new value. */
export function stepSuspicion(current: number, rate: number, dt: number, visible: boolean): number {
  const delta = visible ? rate * dt : -VISION.decayPerSecond * dt;
  return Math.max(0, Math.min(VISION.combatThreshold, current + delta));
}
