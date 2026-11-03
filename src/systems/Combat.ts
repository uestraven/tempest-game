import Phaser from 'phaser';
import { Grid, type Vec2 } from '../core/Grid';
import { COMBAT, PLAYER } from '../core/constants';
import type { Player } from '../actors/Player';
import { Enemy, ENEMY_HIT_RADIUS } from '../actors/Enemy';
import type { Hearing } from './Hearing';

interface Tracer {
  from: Vec2;
  to: Vec2;
  life: number;
}

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  shooter: Enemy;
}

export interface ShotReport {
  fired: boolean;
  hits: { enemy: Enemy; damage: number }[];
}

/**
 * Player hitscan, visible enemy projectiles and tracer rendering.
 *
 * Player rounds are deterministic: the crosshair is where they hit unless solid
 * cover intervenes. There are no random criticals and no headshots.
 */
export class Combat {
  private readonly tracerGfx: Phaser.GameObjects.Graphics;
  private readonly tracers: Tracer[] = [];
  private readonly projectiles: Projectile[] = [];
  private enemies: Enemy[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly grid: Grid,
    private readonly hearing: Hearing
  ) {
    this.tracerGfx = scene.add.graphics().setDepth(30);
  }

  setEnemies(enemies: Enemy[]): void {
    this.enemies = enemies;
  }

  /** Fires the player's current weapon. Returns what was hit, for feedback. */
  playerFire(player: Player): ShotReport {
    if (!player.consumeRound()) return { fired: false, hits: [] };
    const def = player.weaponDef;
    const origin = player.sightPoint;
    const hits = new Map<Enemy, number>();

    for (let i = 0; i < def.rays; i++) {
      const offset = def.rays === 1 ? 0 : (i / (def.rays - 1) - 0.5) * def.spread;
      const angle = player.aim + offset;
      const wall = this.grid.raycastShot(origin, angle, def.range);
      const victim = this.firstEnemyAlongRay(origin, angle, wall.distance);

      if (victim) {
        const falloff = Phaser.Math.Linear(
          1,
          def.falloffAtMaxRange,
          Phaser.Math.Clamp(victim.distance / def.range, 0, 1)
        );
        const damage = def.damagePerRay * falloff;
        hits.set(victim.enemy, (hits.get(victim.enemy) ?? 0) + damage);
        this.tracers.push({
          from: origin,
          to: { x: victim.point.x, y: victim.point.y },
          life: COMBAT.tracerLifetime,
        });
      } else {
        this.tracers.push({
          from: origin,
          to: { x: wall.x, y: wall.y },
          life: COMBAT.tracerLifetime,
        });
      }
    }

    for (const [enemy, damage] of hits) enemy.takeDamage(Math.round(damage));

    this.hearing.emit({
      x: player.x,
      y: player.y,
      radius: def.soundRadius,
      kind: 'gunshot',
      fromPlayer: true,
    });

    return {
      fired: true,
      hits: [...hits].map(([enemy, damage]) => ({ enemy, damage: Math.round(damage) })),
    };
  }

  /**
   * Nearest live enemy whose torso the ray crosses before the wall impact.
   * Capsule test against the ray, so cover geometry and hits agree.
   */
  private firstEnemyAlongRay(
    origin: Vec2,
    angle: number,
    maxDistance: number
  ): { enemy: Enemy; distance: number; point: Vec2 } | null {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best: { enemy: Enemy; distance: number; point: Vec2 } | null = null;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const target = enemy.sightPoint;
      const ox = target.x - origin.x;
      const oy = target.y - origin.y;
      const along = ox * dx + oy * dy;
      if (along <= 0 || along > maxDistance) continue;
      const perpendicular = Math.abs(-ox * dy + oy * dx);
      if (perpendicular > ENEMY_HIT_RADIUS) continue;
      if (best && along >= best.distance) continue;
      best = {
        enemy,
        distance: along,
        point: { x: origin.x + dx * along, y: origin.y + dy * along },
      };
    }
    return best;
  }

  /** Enemy rounds are visible moving projectiles, blocked by solid obstacles. */
  fireProjectile(from: Vec2, angle: number, damage: number, shooter: Enemy): void {
    const sprite = this.scene.add.image(Math.round(from.x), Math.round(from.y), 'bullet');
    sprite.setDepth(29);
    this.projectiles.push({
      sprite,
      vx: Math.cos(angle) * COMBAT.enemyBulletSpeed,
      vy: Math.sin(angle) * COMBAT.enemyBulletSpeed,
      damage,
      life: 2.2,
      shooter,
    });
    this.hearing.emit({ x: from.x, y: from.y, radius: 112, kind: 'gunshot', fromPlayer: false });
  }

  update(dt: number, player: Player): void {
    this.stepProjectiles(dt, player);
    this.drawTracers(dt);
  }

  private stepProjectiles(dt: number, player: Player): void {
    const playerBox = new Phaser.Geom.Rectangle(
      player.x - PLAYER.bodyWidth / 2,
      player.y - 26,
      PLAYER.bodyWidth,
      26
    );

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // Substep so a fast round cannot tunnel through a one-tile wall.
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 4));
      let consumed = false;
      for (let s = 0; s < steps && !consumed; s++) {
        p.sprite.x += (p.vx * dt) / steps;
        p.sprite.y += (p.vy * dt) / steps;
        if (this.grid.isSolidWorld(p.sprite.x, p.sprite.y)) consumed = true;
        else if (playerBox.contains(p.sprite.x, p.sprite.y)) {
          player.takeDamage(p.damage);
          consumed = true;
        }
      }
      p.life -= dt;
      if (consumed || p.life <= 0) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private drawTracers(dt: number): void {
    const g = this.tracerGfx;
    g.clear();
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const alpha = Phaser.Math.Clamp(t.life / COMBAT.tracerLifetime, 0, 1);
      g.lineStyle(1, 0xffe9a8, alpha);
      g.lineBetween(
        Math.round(t.from.x),
        Math.round(t.from.y),
        Math.round(t.to.x),
        Math.round(t.to.y)
      );
    }
  }

  /** Clears transient combat state on a checkpoint reload. */
  reset(): void {
    for (const p of this.projectiles) p.sprite.destroy();
    this.projectiles.length = 0;
    this.tracers.length = 0;
    this.tracerGfx.clear();
  }
}
