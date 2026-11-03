import Phaser from 'phaser';
import { Grid, angleDelta, type Vec2 } from '../core/Grid';
import { hurtboxAt, type Rect } from '../core/hitbox';
import { COMBAT, PLAYER, SOUND_RADIUS, VISION } from '../core/constants';
import { CHAR_H, CHAR_W, FRAME_COLS } from '../art/textures';
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/enemies';
import { alertLevelFor, canSee, stepSuspicion, type AlertLevel } from '../systems/Vision';
import type { SoundEvent } from '../systems/Hearing';
import type { EnemySnapshot } from '../systems/Save';
import { directionRow } from './Player';

export type EnemyState = 'patrol' | 'investigate' | 'search' | 'combat' | 'dead';

/** What an enemy is allowed to ask of the world. Keeps AI free of scene internals. */
export interface EnemyWorld {
  grid: Grid;
  /** Eye/chest point used for sight tests. Not a hurtbox. */
  playerSight(): Vec2;
  /** Centre of the player's torso hurtbox: what a shot should be aimed at. */
  playerAimPoint(): Vec2;
  playerFeet(): Vec2;
  playerStance(): 'standing' | 'crouching' | 'sprinting';
  playerInShadow(): boolean;
  playerIsTargetable(): boolean;
  /** Spawn a visible enemy projectile toward a point. */
  fireProjectile(from: Vec2, angle: number, damage: number, shooter: Enemy): void;
  /** Rally nearby guards without revealing the player's live position. */
  shout(from: Vec2, at: Vec2): void;
  /** Bodies an enemy may stumble across. */
  bodies(): Vec2[];
}

export interface EnemySpawn {
  name: string;
  x: number;
  y: number;
  kind: EnemyKind;
  facing: number;
  route: Vec2[];
}

const TURN_RATE_PATROL = 3.0; // rad/s
const TURN_RATE_ALERT = 6.0;
const WAYPOINT_TOLERANCE = 5;
const REPATH_INTERVAL = 0.45;

export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly def: EnemyDef;
  readonly name: string;

  state: EnemyState = 'patrol';
  suspicion = 0;
  hp: number;
  facing: number;
  routeIndex = 0;

  private path: Vec2[] = [];
  private pathTarget: Vec2 | null = null;
  private repathTimer = 0;
  private waitTimer = 0;
  private investigateTimer = 0;
  private aimTimer = 0;
  private attackTimer = 0;
  private stumbleTimer = 0;
  private lastKnown: Vec2 | null = null;
  private scanAngle = 0;
  private seenBodies = new Set<string>();
  private readonly alertGfx: Phaser.GameObjects.Graphics;
  private readonly spawnPoint: Vec2;
  private readonly route: Vec2[];

  constructor(
    private readonly scene: Phaser.Scene,
    spawn: EnemySpawn,
    private readonly world: EnemyWorld
  ) {
    this.def = ENEMIES[spawn.kind];
    this.name = spawn.name;
    this.hp = this.def.hp;
    this.facing = spawn.facing;
    this.spawnPoint = { x: spawn.x, y: spawn.y };
    this.route = spawn.route.length > 0 ? spawn.route : [{ x: spawn.x, y: spawn.y }];

    this.sprite = scene.physics.add.sprite(spawn.x, spawn.y, `enemy_${spawn.kind}`, 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(9);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    body.setOffset((CHAR_W - PLAYER.bodyWidth) / 2, CHAR_H - PLAYER.bodyHeight);

    this.alertGfx = scene.add.graphics().setDepth(40);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get dead(): boolean {
    return this.state === 'dead';
  }
  /**
   * Eye/chest point for AI vision and as the muzzle position. Kept inside the
   * feet collision body so it can never sit in a wall tile the enemy is hugging,
   * which would blind it and block its own shots. Not a hurtbox.
   */
  get sightPoint(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y - 6 };
  }
  /** Torso rectangle that player bullets must cross. Not the movement body. */
  get hurtbox(): Rect {
    return hurtboxAt(this.sprite.x, this.sprite.y);
  }
  /** Movement collision body in world space, for the debug overlay. */
  get feetBox(): Rect {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.x, y: body.y, width: body.width, height: body.height };
  }
  get alertLevel(): AlertLevel {
    return this.state === 'combat' ? 'combat' : alertLevelFor(this.suspicion);
  }
  /** Takedowns only work on a target that has not entered combat. */
  get vulnerableToTakedown(): boolean {
    return !this.dead && this.state !== 'combat';
  }

  // ---------------------------------------------------------------- perception

  private perceive(dt: number): boolean {
    if (!this.world.playerIsTargetable()) {
      this.suspicion = stepSuspicion(this.suspicion, 0, dt, false);
      return false;
    }
    const sight = canSee(
      this.world.grid,
      { pos: this.sightPoint, facing: this.facing },
      {
        pos: this.world.playerSight(),
        stance: this.world.playerStance(),
        inShadow: this.world.playerInShadow(),
      }
    );
    this.suspicion = stepSuspicion(this.suspicion, sight.rate, dt, sight.visible);
    if (sight.visible) this.lastKnown = { ...this.world.playerFeet() };
    return sight.visible;
  }

  /** Called by the hearing bus. Produces an investigate target at the sound, not on the player. */
  hear(event: SoundEvent, audible: number): void {
    if (this.dead) return;
    const dist = Math.hypot(event.x - this.sprite.x, event.y - this.sprite.y);
    if (dist > audible) return;
    if (this.state === 'combat') return;

    const bump = event.kind === 'gunshot' ? 45 : event.kind === 'shout' ? 40 : 34;
    this.suspicion = Math.min(VISION.combatThreshold - 1, this.suspicion + bump);

    // A gunshot raises the alarm but does not hand over the player's exact
    // position: an unseen shot is investigated as an area, not a pinpoint.
    const target =
      event.kind === 'gunshot' && !this.lastKnown
        ? this.scatter(event.x, event.y, 36)
        : { x: event.x, y: event.y };
    this.beginInvestigate(target);
  }

  /** Deterministic offset so repeated reloads of a checkpoint behave identically. */
  private scatter(x: number, y: number, radius: number): Vec2 {
    let h = 2166136261;
    for (const ch of `${this.name}:${Math.round(x)}:${Math.round(y)}`)
      h = (h ^ ch.charCodeAt(0)) * 16777619;
    const angle = ((h >>> 0) / 4294967295) * Math.PI * 2;
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
  }

  private checkForBodies(): void {
    if (this.state === 'combat' || this.dead) return;
    for (const body of this.world.bodies()) {
      const key = `${Math.round(body.x)},${Math.round(body.y)}`;
      if (this.seenBodies.has(key)) continue;
      const dist = Math.hypot(body.x - this.sprite.x, body.y - this.sprite.y);
      if (dist > VISION.maxDistance) continue;
      const toBody = Math.atan2(body.y - this.sprite.y, body.x - this.sprite.x);
      if (Math.abs(angleDelta(this.facing, toBody)) > (VISION.coneDegrees / 2) * (Math.PI / 180))
        continue;
      if (!this.world.grid.hasLineOfSight(this.sightPoint, body, false)) continue;
      // A discovered body triggers a local search, never a permanent global alarm.
      this.seenBodies.add(key);
      this.suspicion = Math.max(this.suspicion, 70);
      this.beginInvestigate({ x: body.x, y: body.y });
      this.world.shout(this.sightPoint, body);
      return;
    }
  }

  // --------------------------------------------------------------------- state

  private beginInvestigate(target: Vec2): void {
    if (this.state === 'combat') return;
    this.state = 'investigate';
    this.investigateTimer = VISION.investigateTimeout;
    this.setDestination(target);
  }

  private enterCombat(): void {
    if (this.state === 'combat') return;
    this.state = 'combat';
    this.aimTimer = COMBAT.aimWindup;
    this.attackTimer = 0;
    this.world.shout(this.sightPoint, this.lastKnown ?? this.world.playerFeet());
  }

  /** Rallied by an ally's shout: investigate the reported spot, do not snap to the player. */
  rally(at: Vec2): void {
    if (this.dead || this.state === 'combat') return;
    this.suspicion = Math.max(this.suspicion, VISION.suspiciousThreshold + 20);
    this.beginInvestigate(at);
  }

  private setDestination(target: Vec2): void {
    this.pathTarget = { ...target };
    this.repathTimer = 0;
    this.path = this.world.grid.findPath({ x: this.sprite.x, y: this.sprite.y }, target) ?? [];
  }

  // -------------------------------------------------------------------- update

  update(dt: number): void {
    if (this.dead) {
      this.alertGfx.clear();
      return;
    }

    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.repathTimer = Math.max(0, this.repathTimer - dt);

    const visible = this.perceive(dt);
    this.checkForBodies();

    if (visible && this.suspicion >= VISION.combatThreshold) this.enterCombat();

    switch (this.state) {
      case 'patrol':
        this.updatePatrol(dt, visible);
        break;
      case 'investigate':
      case 'search':
        this.updateInvestigate(dt, visible);
        break;
      case 'combat':
        this.updateCombat(dt, visible);
        break;
    }

    this.updateAnimation();
    this.drawAlert();
  }

  private updatePatrol(dt: number, visible: boolean): void {
    if (visible && this.suspicion >= VISION.suspiciousThreshold) {
      this.beginInvestigate(this.world.playerFeet());
      return;
    }
    if (this.stumbleTimer > 0) {
      this.stop();
      return;
    }
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this.stop();
      return;
    }
    const target = this.route[this.routeIndex % this.route.length];
    if (!this.pathTarget || Phaser.Math.Distance.BetweenPoints(this.pathTarget, target) > 2)
      this.setDestination(target);

    if (this.followPath(dt, this.def.patrolSpeed, TURN_RATE_PATROL)) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.pathTarget = null;
      this.waitTimer = 1.1; // brief pause at each waypoint
    }
  }

  private updateInvestigate(dt: number, visible: boolean): void {
    if (visible && this.suspicion >= VISION.combatThreshold) {
      this.enterCombat();
      return;
    }
    if (visible) {
      // Keep closing on what it can see, and keep the clock topped up.
      this.investigateTimer = VISION.investigateTimeout;
      if (!this.pathTarget || this.repathTimer <= 0) {
        this.setDestination(this.world.playerFeet());
        this.repathTimer = REPATH_INTERVAL;
      }
    }

    this.investigateTimer -= dt;
    if (this.stumbleTimer > 0) {
      this.stop();
      return;
    }

    const arrived = this.followPath(dt, this.def.investigateSpeed, TURN_RATE_ALERT);
    if (arrived) {
      // Sweep the area rather than standing still.
      this.state = 'search';
      this.scanAngle += 1.4;
      this.turnToward(this.facing + Math.sin(this.scanAngle) * 1.2, dt, TURN_RATE_PATROL);
      this.stop();
    }

    if (this.investigateTimer <= 0 && this.suspicion < VISION.suspiciousThreshold) {
      // De-escalate: go back to the nearest point on the patrol route.
      this.state = 'patrol';
      this.lastKnown = null;
      this.pathTarget = null;
      this.routeIndex = this.nearestRouteIndex();
    }
  }

  private updateCombat(dt: number, visible: boolean): void {
    if (!visible) {
      if (this.lastKnown) {
        this.state = 'investigate';
        this.investigateTimer = VISION.investigateTimeout;
        this.setDestination(this.lastKnown);
      } else {
        this.state = 'patrol';
      }
      return;
    }

    const target = this.world.playerFeet();
    const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
    this.turnToward(Math.atan2(target.y - this.sprite.y, target.x - this.sprite.x), dt, TURN_RATE_ALERT);

    if (this.stumbleTimer > 0) {
      this.stop();
      return;
    }

    // Hold at the preferred engagement band; close in if too far, back off if crowded.
    const band = this.def.engageRange;
    if (dist > band) {
      if (!this.pathTarget || this.repathTimer <= 0) {
        this.setDestination(target);
        this.repathTimer = REPATH_INTERVAL;
      }
      this.followPath(dt, this.def.combatSpeed, TURN_RATE_ALERT);
    } else {
      this.stop();
      this.path = [];
      this.pathTarget = null;
    }

    if (this.def.attack === 'ranged') {
      if (this.aimTimer > 0) {
        this.aimTimer -= dt;
        return;
      }
      if (this.attackTimer <= 0 && dist <= this.def.engageRange + 40) {
        const from = this.sightPoint;
        // Aim at the centre of the torso hurtbox, not the sight origin: the sight
        // origin sits on the hurtbox's bottom edge, so aiming there would graze.
        const aimAt = this.world.playerAimPoint();
        const angle = Math.atan2(aimAt.y - from.y, aimAt.x - from.x);
        this.world.fireProjectile(from, angle, this.def.damage, this);
        this.attackTimer = this.def.attackInterval;
      }
    }
  }

  private nearestRouteIndex(): number {
    let best = 0;
    let bestDist = Infinity;
    this.route.forEach((wp, i) => {
      const d = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, wp.x, wp.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  /** Steers along the current A* path. Returns true when the destination is reached. */
  private followPath(dt: number, speed: number, turnRate: number): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    while (this.path.length > 0) {
      const next = this.path[0];
      if (Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, next.x, next.y) <= WAYPOINT_TOLERANCE)
        this.path.shift();
      else break;
    }
    if (this.path.length === 0) {
      body.setVelocity(0, 0);
      return true;
    }
    const next = this.path[0];
    const angle = Math.atan2(next.y - this.sprite.y, next.x - this.sprite.x);
    if (this.state !== 'combat') this.turnToward(angle, dt, turnRate);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    return false;
  }

  private stop(): void {
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  /** No instant turns: facing rotates at a bounded rate. */
  private turnToward(target: number, dt: number, rate: number): void {
    const delta = angleDelta(this.facing, target);
    const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    this.facing += step;
  }

  private updateAnimation(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const speed = body.velocity.length();
    const row = directionRow(this.facing);
    const base = row * FRAME_COLS;
    if (speed <= 1 || this.stumbleTimer > 0) {
      this.sprite.anims.stop();
      this.sprite.setFrame(base);
      return;
    }
    const key = `enemy_${this.def.kind}_walk_${row}`;
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying)
      this.sprite.anims.play(key, true);
  }

  // ------------------------------------------------------------------- damage

  /** `fromAngle` is the direction the round was travelling, used for the stumble. */
  takeDamage(amount: number, fromAngle?: number): void {
    if (this.dead) return;
    this.hp -= amount;
    this.stumbleTimer = COMBAT.stumbleDuration;

    // Two-stage flash: a bright fill, then a red cast as it fades. Reads clearly
    // at 480x270 without a long stun lock.
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(COMBAT.hitFlashDuration * 500, () => {
      if (!this.dead) this.sprite.setTint(0xff9a86);
    });
    this.scene.time.delayedCall(COMBAT.hitFlashDuration * 1000, () => {
      if (!this.dead) this.sprite.clearTint();
    });

    // Subtle knockback along the shot direction. Nudges the sprite rather than
    // applying velocity, so it cannot shove an enemy through geometry.
    if (fromAngle !== undefined) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      const nx = this.sprite.x + Math.cos(fromAngle) * COMBAT.hitKnockback;
      const ny = this.sprite.y + Math.sin(fromAngle) * COMBAT.hitKnockback;
      if (!this.world.grid.isSolidWorld(nx, ny)) {
        this.sprite.setPosition(nx, ny);
        body.reset(nx, ny);
      }
    }

    if (this.hp <= 0) {
      this.kill();
      return;
    }
    // Being shot at reveals that something is wrong, and roughly from where.
    this.suspicion = VISION.combatThreshold;
    this.lastKnown = { ...this.world.playerFeet() };
    this.enterCombat();
  }

  kill(): void {
    if (this.dead) return;
    this.state = 'dead';
    this.hp = 0;
    this.suspicion = 0;
    this.stop();
    (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    this.sprite.clearTint();
    // Bodies stay as narrative discovery but never block movement or doorways.
    this.sprite.setTexture('prop_body');
    this.sprite.setOrigin(0.5, 0.7);
    this.sprite.setDepth(4);
    this.alertGfx.clear();
  }

  // ---------------------------------------------------------------- alert arc

  private drawAlert(): void {
    const g = this.alertGfx;
    g.clear();
    if (this.dead) return;
    const level = this.alertLevel;
    if (level === 'unaware' && this.suspicion <= 0.5) return;

    const cx = Math.round(this.sprite.x);
    const cy = Math.round(this.sprite.y - CHAR_H - 4);
    const fill = this.suspicion / VISION.combatThreshold;
    const color = level === 'combat' ? 0xd9472f : 0xe0c04a;

    // Arc fill communicates buildup; shape communicates level without relying on hue.
    g.lineStyle(1, 0x1b1b22, 0.9);
    g.beginPath();
    g.arc(cx, cy, 7, Math.PI, Math.PI * 2);
    g.strokePath();
    g.lineStyle(2, color, 1);
    g.beginPath();
    g.arc(cx, cy, 7, Math.PI, Math.PI + Math.PI * Math.max(0.04, fill));
    g.strokePath();

    if (level === 'combat') {
      // Filled diamond + bar: "spotted".
      g.fillStyle(color, 1);
      g.fillTriangle(cx, cy - 10, cx - 3, cy - 5, cx + 3, cy - 5);
      g.fillRect(cx - 1, cy - 4, 2, 2);
    } else if (level === 'suspicious') {
      // Hollow diamond: "something is off".
      g.lineStyle(1, color, 1);
      g.strokeTriangle(cx, cy - 10, cx - 3, cy - 5, cx + 3, cy - 5);
    }
  }

  // ---------------------------------------------------------------- snapshots

  snapshot(): EnemySnapshot {
    return {
      name: this.name,
      x: this.sprite.x,
      y: this.sprite.y,
      facing: this.facing,
      hp: this.hp,
      dead: this.dead,
      suspicion: this.suspicion,
      routeIndex: this.routeIndex,
    };
  }

  restore(snap: EnemySnapshot): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.hp = snap.hp;
    this.facing = snap.facing;
    this.routeIndex = snap.routeIndex;
    this.suspicion = snap.suspicion;
    this.path = [];
    this.pathTarget = null;
    this.lastKnown = null;
    this.seenBodies.clear();
    this.investigateTimer = 0;
    this.waitTimer = 0;
    this.aimTimer = 0;
    this.attackTimer = 0;
    this.stumbleTimer = 0;
    this.alertGfx.clear();

    if (snap.dead) {
      this.state = 'dead';
      this.sprite.setTexture('prop_body');
      this.sprite.setOrigin(0.5, 0.7);
      this.sprite.setDepth(4);
      this.sprite.setPosition(snap.x, snap.y);
      body.reset(snap.x, snap.y);
      body.enable = false;
      return;
    }

    this.state = 'patrol';
    this.sprite.setTexture(`enemy_${this.def.kind}`);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(9);
    this.sprite.clearTint();
    this.sprite.setPosition(snap.x, snap.y);
    body.reset(snap.x, snap.y);
    body.enable = true;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    body.setOffset((CHAR_W - PLAYER.bodyWidth) / 2, CHAR_H - PLAYER.bodyHeight);
  }

  /** Fresh-level state, used when there is no checkpoint to restore. */
  resetToSpawn(spawnFacing: number): void {
    this.restore({
      name: this.name,
      x: this.spawnPoint.x,
      y: this.spawnPoint.y,
      facing: spawnFacing,
      hp: this.def.hp,
      dead: false,
      suspicion: 0,
      routeIndex: 0,
    });
  }

  destroy(): void {
    this.alertGfx.destroy();
    this.sprite.destroy();
  }
}

/** Shout radius helper so the scene and AI agree on acoustic reach. */
export const SHOUT_RADIUS = SOUND_RADIUS.shout;
