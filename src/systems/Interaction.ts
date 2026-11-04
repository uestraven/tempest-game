import Phaser from 'phaser';
import { Grid, angleDelta } from '../core/Grid';
import { PLAYER } from '../core/constants';
import type { Enemy } from '../actors/Enemy';
import type { Player } from '../actors/Player';

export interface Interactable {
  name: string;
  kind: string;
  x: number;
  y: number;
  prompt: string;
  /** Objective ID granted on use, if any. */
  objective?: string;
  /** Objective ID that must already be complete before this can be used. */
  requires?: string;
  /** Sound radius emitted on use (authored distractions). */
  noise?: number;
  oneShot: boolean;
  used: boolean;
  glint: boolean;
  sprite?: Phaser.GameObjects.Image;
}

export interface PickupItem {
  name: string;
  kind: 'medkit' | 'ammo_pistol' | 'ammo_shotgun';
  x: number;
  y: number;
  taken: boolean;
  sprite?: Phaser.GameObjects.Image;
}

export type InteractTarget =
  | { type: 'takedown'; enemy: Enemy; prompt: string }
  | { type: 'prop'; prop: Interactable; prompt: string }
  | { type: 'pickup'; item: PickupItem; prompt: string }
  | null;

const PICKUP_PROMPT: Record<PickupItem['kind'], string> = {
  medkit: 'E - USE MEDICAL KIT',
  ammo_pistol: 'E - TAKE PISTOL ROUNDS',
  ammo_shotgun: 'E - TAKE SHELLS',
};

/**
 * Resolves the single context prompt for the nearest eligible interaction.
 * Takedown wins over generic props, but only when a vulnerable enemy is in range.
 */
export class Interaction {
  constructor(
    private readonly grid: Grid,
    private readonly props: Interactable[],
    private readonly items: PickupItem[]
  ) {}

  resolve(player: Player, enemies: Enemy[], objectiveDone: (id: string) => boolean): InteractTarget {
    if (player.busy) return null;
    const feet = { x: player.x, y: player.y };

    const enemy = this.nearestTakedownTarget(player, enemies);
    if (enemy) return { type: 'takedown', enemy, prompt: 'E - TAKEDOWN' };

    let best: InteractTarget = null;
    let bestDist = Infinity;

    for (const prop of this.props) {
      if (prop.used && prop.oneShot) continue;
      if (prop.requires && !objectiveDone(prop.requires)) continue;
      if (prop.objective && objectiveDone(prop.objective) && prop.oneShot) continue;
      const d = Phaser.Math.Distance.Between(feet.x, feet.y, prop.x, prop.y);
      if (d > PLAYER.interactRange || d >= bestDist) continue;
      if (!this.grid.hasClearReach(player.groundPoint, { x: prop.x, y: prop.y })) continue;
      bestDist = d;
      best = { type: 'prop', prop, prompt: prop.prompt };
    }

    for (const item of this.items) {
      if (item.taken) continue;
      const d = Phaser.Math.Distance.Between(feet.x, feet.y, item.x, item.y);
      if (d > PLAYER.interactRange || d >= bestDist) continue;
      if (!this.grid.hasClearReach(player.groundPoint, { x: item.x, y: item.y })) continue;
      // A full-health player gets no medkit prompt, so the kit is never wasted.
      if (item.kind === 'medkit' && player.hp >= 100) continue;
      bestDist = d;
      best = { type: 'pickup', item, prompt: PICKUP_PROMPT[item.kind] };
    }

    return best;
  }

  private nearestTakedownTarget(player: Player, enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.vulnerableToTakedown) continue;
      const d = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
      if (d > PLAYER.takedownRange || d >= bestDist) continue;
      if (!isBehind(enemy.facing, enemy, player)) continue;
      if (!this.grid.hasClearReach(player.groundPoint, enemy.groundPoint)) continue;
      bestDist = d;
      best = enemy;
    }
    return best;
  }
}

/** True when the player stands inside the target's rear arc. */
export function isBehind(
  facing: number,
  target: { x: number; y: number },
  player: { x: number; y: number }
): boolean {
  const toPlayer = Math.atan2(player.y - target.y, player.x - target.x);
  const rear = facing + Math.PI;
  const halfArc = (PLAYER.takedownBehindArc / 2) * (Math.PI / 180);
  return Math.abs(angleDelta(rear, toPlayer)) <= halfArc;
}
