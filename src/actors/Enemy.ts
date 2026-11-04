import Phaser from 'phaser';
import { Grid, angleDelta, type Vec2 } from '../core/Grid';
import { bulletHitbox, drawnTorso, type Rect } from '../core/hitbox';
import { COMBAT, PLAYER, SOUND_RADIUS, VISION } from '../core/constants';
import { textureKey } from '../art/AssetRegistry';
import { propDef, propOrigin } from '../art/PropDefinitions';
import {
  CHAR_FEET_INSET,
  CHAR_FRAME_HEIGHT,
  CHAR_FRAME_WIDTH,
  CHAR_ORIGIN_X,
  CHAR_ORIGIN_Y,
  animKey,
  clipFor,
  facingFromAngle,
  type CharState,
} from '../art/CharacterDefinitions';
import { staticFrame } from '../art/AnimationRegistry';
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/enemies';
import { alertLevelFor, canSee, stepSuspicion, type AlertLevel } from '../systems/Vision';
import { SOUND_REFRACTORY, SOUND_SCATTER, type SoundEvent } from '../systems/Hearing';
import { nextReachableWaypoint } from '../systems/Patrol';
import type { EnemySnapshot } from '../systems/Save';


export type EnemyState = 'patrol' | 'investigate' | 'search' | 'combat' | 'dead';

/** What an enemy is allowed to ask of the world. Keeps AI free of scene internals. */
export interface EnemyWorld {
  grid: Grid;
  /** The player's ground position: used for vision, occlusion and aiming. */
  playerGround(): Vec2;
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


/** Pause before retrying a patrol route that is entirely cut off by a closed door. */
const SEALED_ROUTE_RETRY = 0.75;

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
  private soundCooldown = 0;
  private lastKnown: Vec2 | null = null;
  private scanAngle = 0;
  private seenBodies = new Set<string>();
  private readonly alertGfx: Phaser.GameObjects.Graphics;
  private readonly alertIcon: Phaser.GameObjects.Image;
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

    // The clip metadata owns the texture: `staticFrame` returns the sheet its
    // frame belongs to, so a character may span several sheets.
    const idle = staticFrame(this.def.sheet, 'idle', 'down');
    this.sprite = scene.physics.add.sprite(spawn.x, spawn.y, idle.sheet, idle.frame);
    this.sprite.setOrigin(CHAR_ORIGIN_X, CHAR_ORIGIN_Y);
    this.sprite.setDepth(9);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    body.setOffset(
      (CHAR_FRAME_WIDTH - PLAYER.bodyWidth) / 2,
      CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - PLAYER.bodyHeight
    );

    this.alertGfx = scene.add.graphics().setDepth(40);
    // Awareness icon from the supplied FX set. Shape carries the state, so the
    // cue does not depend on telling red from yellow.
    this.alertIcon = scene.add
      .image(spawn.x, spawn.y, textureKey.fx('alert_question'))
      .setDepth(41)
      .setVisible(false);
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
   * Ground position: the origin for vision and for this guard's own shots, and
   * the same space as the tile grid. Not a hitbox.
   */
  get groundPoint(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }
  /** Ground-plane body box that player bullets must cross. Not the movement body. */
  get hitbox(): Rect {
    return bulletHitbox(this.sprite.x, this.sprite.y);
  }
  /** Screen-space torso rectangle, for the F3 overlay. */
  get drawnTorso(): Rect {
    return drawnTorso(this.sprite.x, this.sprite.y);
  }
  /** Movement collision body in world space, for the debug overlay. */
  get feetBox(): Rect {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.x, y: body.y, width: body.width, height: body.height };
  }
  /**
   * Read-only accessors for the F3 diagnostic overlay. They expose what the AI
   * is thinking so the overlay can show WHY a guard is doing something; nothing
   * reads them during simulation.
   */
  get debugLastKnown(): Vec2 | null {
    return this.lastKnown ? { ...this.lastKnown } : null;
  }
  get debugDestination(): Vec2 | null {
    return this.pathTarget ? { ...this.pathTarget } : null;
  }
  get debugSoundCooldown(): number {
    return this.soundCooldown;
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
      { pos: this.groundPoint, facing: this.facing },
      {
        pos: this.world.playerFeet(),
        stance: this.world.playerStance(),
        inShadow: this.world.playerInShadow(),
      }
    );
    this.suspicion = stepSuspicion(this.suspicion, sight.rate, dt, sight.visible);
    if (sight.visible) this.lastKnown = { ...this.world.playerFeet() };
    return sight.visible;
  }

  /**
   * Called by the hearing bus. Produces an investigate target at the sound, not
   * on the player.
   *
   * TWO RULES, both of which exist because a sound is a vaguer cue than a sight.
   *
   * 1. LOCALISATION IS APPROXIMATE. A sound is investigated as an area, by
   *    scattering the target within `SOUND_SCATTER` for its kind. Footsteps get
   *    the widest scatter: you hear a direction, not a position. The radio is
   *    the deliberate exception - it is a real object sitting in a known place,
   *    and walking to it is exactly what a distraction is for.
   *
   *    Without this, a sprinting player emitted one footstep every 22 px - about
   *    seven a second - each handing the guard their exact live coordinates, so
   *    a guard that had never seen the player followed them perfectly through
   *    cover. Measured in Phase C.1B-04B-1: one footstep 64 px away moved the
   *    guard's destination to within 0 px of the noise.
   *
   * 2. REPEATED SOUND DOES NOT STACK FREELY. One bump per `SOUND_REFRACTORY`
   *    seconds. Seven footsteps a second at 34 each is ~234 suspicion/s, nearly
   *    double the 120/s rate for actually SEEING a sprinter, which pinned
   *    suspicion above the de-escalation threshold indefinitely and re-armed the
   *    8 s investigate timer on every step. Rate-limiting keeps hearing strictly
   *    less informative than sight, which is the intended ordering.
   *
   * Neither rule touches vision, movement speed, damage or health, and being
   * seen in the open is exactly as dangerous as before.
   */
  hear(event: SoundEvent, audible: number): void {
    if (this.dead) return;
    const dist = Math.hypot(event.x - this.sprite.x, event.y - this.sprite.y);
    if (dist > audible) return;
    if (this.state === 'combat') return;
    if (this.soundCooldown > 0) return;
    this.soundCooldown = SOUND_REFRACTORY;

    const bump = event.kind === 'gunshot' ? 45 : event.kind === 'shout' ? 40 : 34;
    this.suspicion = Math.min(VISION.combatThreshold - 1, this.suspicion + bump);

    const spread = SOUND_SCATTER[event.kind];
    const target =
      spread > 0 ? this.scatter(event.x, event.y, spread) : { x: event.x, y: event.y };
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
      if (!this.world.grid.hasLineOfSight(this.groundPoint, body, false)) continue;
      // A discovered body triggers a local search, never a permanent global alarm.
      this.seenBodies.add(key);
      this.suspicion = Math.max(this.suspicion, 70);
      this.beginInvestigate({ x: body.x, y: body.y });
      this.world.shout(this.groundPoint, body);
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
    this.world.shout(this.groundPoint, this.lastKnown ?? this.world.playerFeet());
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
    this.soundCooldown = Math.max(0, this.soundCooldown - dt);

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
    if (!this.pathTarget || Phaser.Math.Distance.BetweenPoints(this.pathTarget, target) > 2) {
      // Re-planning only happens here, when the waypoint actually changes, so
      // the skip scan costs no more A* calls per frame than before.
      if (!this.selectReachableWaypoint()) {
        // Every waypoint is cut off. Hold position rather than jittering; the
        // next attempt resumes the patrol the moment a door opens.
        this.pathTarget = null;
        this.path = [];
        this.stop();
        this.waitTimer = SEALED_ROUTE_RETRY;
        return;
      }
      this.setDestination(this.route[this.routeIndex % this.route.length]);
    }

    if (this.followPath(dt, this.def.patrolSpeed, TURN_RATE_PATROL)) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.pathTarget = null;
      this.waitTimer = 1.1; // brief pause at each waypoint
    }
  }

  /**
   * Picks the next waypoint this guard can actually walk to, skipping any that
   * are currently cut off - a waypoint behind a closed door has no path, and
   * treating that as "arrived" would stall the patrol. See systems/Patrol.ts for
   * the rule and its regression tests.
   *
   * Sets `routeIndex` to the chosen waypoint and returns true; returns false
   * when none of them can be reached from where the guard stands. Called only
   * when the waypoint changes, so it adds no per-frame pathfinding.
   */
  private selectReachableWaypoint(): boolean {
    const index = nextReachableWaypoint(
      this.world.grid,
      { x: this.sprite.x, y: this.sprite.y },
      this.route,
      this.routeIndex,
      WAYPOINT_TOLERANCE
    );
    if (index === null) return false;
    this.routeIndex = index;
    return true;
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
        // Ground-plane shot: origin and target are both ground positions, so the
        // round travels the line the player can see between the two actors.
        const from = this.groundPoint;
        const aimAt = this.world.playerGround();
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

  /**
   * Directional playback from the clip metadata, exactly as the player does it.
   * Mirroring comes from the clip, not from the facing angle, because each
   * sheet's rows have their own intrinsic facing.
   *
   * The facing tick drawn in `drawAlert` remains the precise cue: four facings
   * cannot express a 100-degree vision cone, and stealth depends on reading
   * where a guard is actually looking.
   */
  private updateAnimation(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const speed = body.velocity.length();
    const facing = facingFromAngle(this.facing);
    const state: CharState =
      this.stumbleTimer > 0
        ? 'hit'
        : this.state === 'combat' && speed <= 1
          ? 'aim'
          : speed > 1
            ? 'walk'
            : 'idle';
    const clip = clipFor(this.def.sheet, state, facing);
    const key = animKey(this.def.sheet, state, facing);

    this.sprite.setFlipX(clip.flipX);
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.anims.play(key, true);
    else if (clip.loop && !this.sprite.anims.isPlaying) this.sprite.anims.play(key, true);
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

  /**
   * Swaps to the shared corpse prop. Anchored at its own ground-contact row so
   * the body lies where the guard fell.
   */
  private applyCorpseSprite(): void {
    const body = propDef('shared', this.def.bodyProp);
    const origin = propOrigin(body);
    this.sprite.anims.stop();
    this.sprite.setFlipX(false);
    this.sprite.setTexture(body.texture);
    this.sprite.setOrigin(origin.x, origin.y);
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
    this.applyCorpseSprite();
    this.sprite.setDepth(4);
    this.alertGfx.clear();
    this.alertIcon.setVisible(false);
  }

  // ---------------------------------------------------------------- alert arc

  private drawAlert(): void {
    const g = this.alertGfx;
    g.clear();
    if (this.dead) {
      this.alertIcon.setVisible(false);
      return;
    }

    const level = this.alertLevel;
    const cx = Math.round(this.sprite.x);
    const cy = Math.round(this.sprite.y - CHAR_FRAME_HEIGHT - 4);

    // Facing tick: a 3px stub pointing where the guard is actually looking.
    // The character art has no directional frames, so without this a patrol's
    // facing would be unreadable whenever it is walking up or down the screen,
    // and stealth depends on reading it.
    const tx = Math.round(cx + Math.cos(this.facing) * 7);
    const ty = Math.round(Math.round(this.sprite.y - 16) + Math.sin(this.facing) * 7);
    g.fillStyle(0xf2ece0, 0.85);
    g.fillRect(tx - 1, ty - 1, 2, 2);

    if (level === 'unaware' && this.suspicion <= 0.5) {
      this.alertIcon.setVisible(false);
      return;
    }

    const fill = this.suspicion / VISION.combatThreshold;
    const color = level === 'combat' ? 0xd9472f : 0xe0c04a;

    // Arc fill communicates buildup; the icon communicates the state by shape,
    // so the cue never depends on telling two colours apart.
    g.lineStyle(1, 0x1b1b22, 0.9);
    g.beginPath();
    g.arc(cx, cy, 7, Math.PI, Math.PI * 2);
    g.strokePath();
    g.lineStyle(2, color, 1);
    g.beginPath();
    g.arc(cx, cy, 7, Math.PI, Math.PI + Math.PI * Math.max(0.04, fill));
    g.strokePath();

    const icon =
      level === 'combat'
        ? 'alert_detected'
        : this.suspicion >= VISION.suspiciousThreshold
          ? 'alert_suspicious'
          : 'alert_question';
    this.alertIcon.setTexture(textureKey.fx(icon));
    this.alertIcon.setPosition(cx, cy - 11);
    this.alertIcon.setVisible(true);
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
    this.soundCooldown = 0;
    this.alertGfx.clear();
    this.alertIcon.setVisible(false);

    if (snap.dead) {
      this.state = 'dead';
      this.applyCorpseSprite();
      this.sprite.setDepth(4);
      this.sprite.setPosition(snap.x, snap.y);
      body.reset(snap.x, snap.y);
      body.enable = false;
      return;
    }

    this.state = 'patrol';
    this.sprite.anims.stop();
    this.sprite.setFlipX(false);
    const idle = staticFrame(this.def.sheet, 'idle', 'down');
    this.sprite.setTexture(idle.sheet, idle.frame);
    this.sprite.setOrigin(CHAR_ORIGIN_X, CHAR_ORIGIN_Y);
    this.sprite.setDepth(9);
    this.sprite.clearTint();
    this.sprite.setPosition(snap.x, snap.y);
    body.reset(snap.x, snap.y);
    body.enable = true;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    body.setOffset(
      (CHAR_FRAME_WIDTH - PLAYER.bodyWidth) / 2,
      CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - PLAYER.bodyHeight
    );
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
    this.alertIcon.destroy();
    this.sprite.destroy();
  }
}

/** Shout radius helper so the scene and AI agree on acoustic reach. */
export const SHOUT_RADIUS = SOUND_RADIUS.shout;
