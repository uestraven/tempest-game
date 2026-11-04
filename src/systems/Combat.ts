import Phaser from 'phaser';
import { Grid, type Vec2 } from '../core/Grid';
import { COMBAT } from '../core/constants';
import { TORSO_OFFSET_Y, rayRectEntry, rectContains } from '../core/hitbox';
import type { Player } from '../actors/Player';
import type { Enemy } from '../actors/Enemy';
import type { Hearing } from './Hearing';

interface Tracer {
  from: Vec2;
  to: Vec2;
  life: number;
}

interface Impact {
  x: number;
  y: number;
  life: number;
  flesh: boolean;
}

/** A player shot ray, retained longer than a tracer for the F3 overlay. */
export interface DebugRay {
  from: Vec2;
  to: Vec2;
  life: number;
  hit: boolean;
}

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  /** Logical GROUND position. The sprite is drawn TORSO_OFFSET_Y above it. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  shooter: Enemy;
}

export interface ShotReport {
  fired: boolean;
  hits: { enemy: Enemy; damage: number }[];
  /** Impact points, so the caller can drive feedback without re-deriving them. */
  impacts: { x: number; y: number; flesh: boolean }[];
}

const MAX_DEBUG_RAYS = 32;

/**
 * Player hitscan, visible enemy projectiles, tracers and impact feedback.
 *
 * Player rounds are deterministic: the crosshair is where they hit unless solid
 * cover intervenes. No random criticals, no headshots.
 *
 * Hits are resolved in the GROUND PLANE against each actor's body hitbox
 * (core/hitbox.ts), never against the small feet collision body and never
 * against a single point plus a radius. Effects are drawn at torso height by
 * applying TORSO_OFFSET_Y, which is a rendering offset only - see hitbox.ts for
 * why mixing the two spaces breaks cover.
 */
export class Combat {
  private readonly tracerGfx: Phaser.GameObjects.Graphics;
  private readonly tracers: Tracer[] = [];
  private readonly impacts: Impact[] = [];
  private readonly debugRaysList: DebugRay[] = [];
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

  get debugRays(): readonly DebugRay[] {
    return this.debugRaysList;
  }

  /** Fires the player's current weapon. Returns what was hit, for feedback. */
  playerFire(player: Player): ShotReport {
    if (!player.consumeRound()) return { fired: false, hits: [], impacts: [] };
    const def = player.weaponDef;
    // Ground-plane origin: the same space as the tile grid and the hitboxes.
    const origin = player.groundPoint;
    const hits = new Map<Enemy, number>();
    const impacts: { x: number; y: number; flesh: boolean }[] = [];

    for (let i = 0; i < def.rays; i++) {
      const offset = def.rays === 1 ? 0 : (i / (def.rays - 1) - 0.5) * def.spread;
      const angle = player.aim + offset;
      const wall = this.grid.raycastShot(origin, angle, def.range);
      const victim = this.firstEnemyAlongRay(origin, angle, wall.distance);

      const end = victim ? victim.point : { x: wall.x, y: wall.y };
      const flesh = victim !== null;

      if (victim) {
        const falloff = Phaser.Math.Linear(
          1,
          def.falloffAtMaxRange,
          Phaser.Math.Clamp(victim.distance / def.range, 0, 1)
        );
        hits.set(victim.enemy, (hits.get(victim.enemy) ?? 0) + def.damagePerRay * falloff);
      }

      // Drawn at torso height; the maths above stayed in the ground plane.
      this.tracers.push({
        from: { x: origin.x, y: origin.y - TORSO_OFFSET_Y },
        to: { x: end.x, y: end.y - TORSO_OFFSET_Y },
        life: COMBAT.tracerLifetime,
      });
      // Sparks only where something was actually struck, not at max range in air.
      if (flesh || wall.blocked) {
        const drawY = end.y - TORSO_OFFSET_Y;
        this.impacts.push({ x: end.x, y: drawY, life: COMBAT.impactLifetime, flesh });
        impacts.push({ x: end.x, y: drawY, flesh });
      }
      this.debugRaysList.push({
        from: { x: origin.x, y: origin.y },
        to: { x: end.x, y: end.y },
        life: COMBAT.debugRayLifetime,
        hit: flesh,
      });
    }
    while (this.debugRaysList.length > MAX_DEBUG_RAYS) this.debugRaysList.shift();

    for (const [enemy, damage] of hits) enemy.takeDamage(Math.round(damage), player.aim);

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
      impacts,
    };
  }

  /**
   * Nearest live enemy whose body hitbox the ray enters before the wall impact.
   * Exact ray/rectangle intersection in the ground plane, bounded by the wall
   * distance, so cover geometry and hits always agree.
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
      const entry = rayRectEntry(origin.x, origin.y, dx, dy, enemy.hitbox, maxDistance);
      if (entry === null) continue;
      if (best && entry >= best.distance) continue;
      best = {
        enemy,
        distance: entry,
        point: { x: origin.x + dx * entry, y: origin.y + dy * entry },
      };
    }
    return best;
  }

  /** Enemy rounds are visible moving projectiles, blocked by solid obstacles. */
  fireProjectile(from: Vec2, angle: number, damage: number, shooter: Enemy): void {
    const sprite = this.scene.add.image(
      Math.round(from.x),
      Math.round(from.y - TORSO_OFFSET_Y),
      'bullet'
    );
    sprite.setDepth(29);
    this.projectiles.push({
      sprite,
      x: from.x,
      y: from.y,
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
    // Same ground-plane hitbox the player's shots use against enemies, so
    // incoming and outgoing fire are judged by the same rule.
    const playerBox = player.hitbox;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // Substep so a fast round cannot tunnel through a one-tile wall.
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 4));
      let consumed = false;
      for (let s = 0; s < steps && !consumed; s++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        if (this.grid.isSolidWorld(p.x, p.y)) {
          this.impacts.push({
            x: p.x,
            y: p.y - TORSO_OFFSET_Y,
            life: COMBAT.impactLifetime,
            flesh: false,
          });
          consumed = true;
        } else if (rectContains(playerBox, p.x, p.y)) {
          if (player.takeDamage(p.damage))
            this.impacts.push({
              x: p.x,
              y: p.y - TORSO_OFFSET_Y,
              life: COMBAT.impactLifetime,
              flesh: true,
            });
          consumed = true;
        }
      }
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y - TORSO_OFFSET_Y));
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

    // Impact sparks: four fixed-direction pixels, so a landed shot is unmistakable.
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const s = this.impacts[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.impacts.splice(i, 1);
        continue;
      }
      const t = s.life / COMBAT.impactLifetime;
      const spread = Math.round((1 - t) * 4) + 1;
      g.fillStyle(s.flesh ? 0xb03a30 : 0xd8cdb4, Phaser.Math.Clamp(t, 0, 1));
      const cx = Math.round(s.x);
      const cy = Math.round(s.y);
      g.fillRect(cx, cy, 1, 1);
      g.fillRect(cx - spread, cy - spread, 1, 1);
      g.fillRect(cx + spread, cy - spread, 1, 1);
      g.fillRect(cx - spread, cy + spread, 1, 1);
      g.fillRect(cx + spread, cy + spread, 1, 1);
    }

    for (let i = this.debugRaysList.length - 1; i >= 0; i--) {
      this.debugRaysList[i].life -= dt;
      if (this.debugRaysList[i].life <= 0) this.debugRaysList.splice(i, 1);
    }
  }

  /** Clears transient combat state on a checkpoint reload. */
  reset(): void {
    for (const p of this.projectiles) p.sprite.destroy();
    this.projectiles.length = 0;
    this.tracers.length = 0;
    this.impacts.length = 0;
    this.debugRaysList.length = 0;
    this.tracerGfx.clear();
  }
}
