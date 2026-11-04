import Phaser from 'phaser';
import { AMMO_CAP, AMMO_FLOOR, MEDKIT_HEAL, PLAYER, SOUND_RADIUS } from '../core/constants';
import { aimOrigin, bulletHitbox, drawnTorso, type Rect } from '../core/hitbox';
import { textureKey } from '../art/AssetRegistry';
import {
  CHAR_FEET_INSET,
  CHAR_FRAME_HEIGHT,
  CHAR_FRAME_WIDTH,
  CHAR_ORIGIN_X,
  CHAR_ORIGIN_Y,
  TEMPEST_MUZZLE_OFFSET,
  animKey,
  clipFor,
  facingFromAngle,
  type CharState,
  type Facing,
} from '../art/CharacterDefinitions';
import { staticFrame } from '../art/AnimationRegistry';
import { WEAPONS, type WeaponId } from '../data/weapons';
import type { Stance } from '../systems/Vision';
import type { AmmoSnapshot, PlayerSnapshot } from '../systems/Save';
import type { Hearing } from '../systems/Hearing';

export interface InputState {
  moveX: number;
  moveY: number;
  aim: number;
  firing: boolean;
  reloadPressed: boolean;
  crouchPressed: boolean;
  sprintHeld: boolean;
  selectWeapon: WeaponId | null;
  interactPressed: boolean;
}

export const NEUTRAL_INPUT: InputState = {
  moveX: 0,
  moveY: 0,
  aim: 0,
  firing: false,
  reloadPressed: false,
  crouchPressed: false,
  sprintHeld: false,
  selectWeapon: null,
  interactPressed: false,
};

/**
 * Tempest's clips span two directional sheets, so the texture is taken from the
 * clip rather than fixed here. This is the sheet the sprite is constructed with.
 */
const PLAYER_SHEET = textureKey.characterSheet('tempest', 'dir_a');

/**
 * How long the weapon stays raised after firing or holding the fire button.
 * Without it the aim pose would drop between shots, flicking the drawn pistol
 * in and out during a 0.36 s pistol cadence.
 */
const WEAPON_READY_TIME = 1.2;

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  // Explicit annotation: PLAYER is `as const`, so inference would pin this to 100.
  hp: number = PLAYER.maxHp;
  crouched = false;
  sprinting = false;
  aim = 0;
  weapon: WeaponId = 'pistol';
  unlockedShotgun = false;
  dead = false;

  readonly ammo: Record<WeaponId, AmmoSnapshot> = {
    pistol: { loaded: WEAPONS.pistol.magazine, reserve: WEAPONS.pistol.startingReserve },
    shotgun: { loaded: 0, reserve: 0 },
  };

  private fireCooldown = 0;
  /** Seconds left on the recoil pose. Shorter than the pistol fire interval. */
  private fireFlash = 0;
  /** Seconds the weapon stays raised; drives the aim pose. */
  private weaponReady = 0;
  /** Facing the animation resolved to this frame, for muzzle placement. */
  private facing: Facing = 'down';
  private reloadTimer = 0;
  reloading = false;
  private invulnTimer = 0;
  private footstepAccumulator = 0;
  /** Set while a takedown animation is playing; movement and firing are locked. */
  takedownTimer = 0;
  /** True when an in-progress takedown was broken by incoming fire. */
  takedownInterrupted = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly hearing: Hearing
  ) {
    this.sprite = scene.physics.add.sprite(
      x,
      y,
      PLAYER_SHEET,
      staticFrame('tempest', 'idle', 'down').frame
    );
    this.sprite.setOrigin(CHAR_ORIGIN_X, CHAR_ORIGIN_Y);
    this.sprite.setDepth(10);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    // Feet box sits on the art's ground-contact row, which is `feetInset`
    // pixels above the bottom of the 24x32 frame.
    body.setOffset(
      (CHAR_FRAME_WIDTH - PLAYER.bodyWidth) / 2,
      CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - PLAYER.bodyHeight
    );
    body.setCollideWorldBounds(true);

  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /**
   * Ground position used for vision, occlusion and hitscan. Same space as the
   * tile grid, so cover blocks exactly what it visually blocks.
   */
  get groundPoint(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /**
   * Point the aim angle is measured from: the centre of the drawn torso. Screen
   * space, used for input and effects only - never for collision.
   */
  get aimOrigin(): { x: number; y: number } {
    return aimOrigin(this.sprite.x, this.sprite.y);
  }

  /** Ground-plane body box that enemy rounds must cross. Not the movement body. */
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
   * Where the muzzle flash is drawn: the barrel tip of the pistol drawn inside
   * the current frame, measured from the delivered sheets rather than projected
   * along the aim angle. Mirrored with the sprite for left-facing clips.
   */
  get muzzlePoint(): { x: number; y: number } {
    const offset = TEMPEST_MUZZLE_OFFSET[this.facing];
    return {
      x: Math.round(this.sprite.x + offset.x),
      y: Math.round(this.sprite.y + offset.y),
    };
  }

  get stance(): Stance {
    if (this.sprinting) return 'sprinting';
    if (this.crouched) return 'crouching';
    return 'standing';
  }

  get speed(): number {
    if (this.crouched) return PLAYER.speedCrouch;
    return this.sprinting ? PLAYER.speedSprint : PLAYER.speedWalk;
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  get busy(): boolean {
    return this.takedownTimer > 0 || this.dead;
  }

  update(dt: number, input: InputState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    this.weaponReady = Math.max(0, this.weaponReady - dt);
    if (input.firing) this.weaponReady = WEAPON_READY_TIME;
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.takedownTimer > 0) this.takedownTimer = Math.max(0, this.takedownTimer - dt);

    if (this.dead || this.takedownTimer > 0) {
      body.setVelocity(0, 0);
      return;
    }

    this.aim = input.aim;

    if (input.selectWeapon && input.selectWeapon !== this.weapon) {
      if (input.selectWeapon === 'pistol' || this.unlockedShotgun) {
        this.weapon = input.selectWeapon;
        this.cancelReload(); // weapon swap cancels a reload
      }
    }

    if (input.crouchPressed) this.crouched = !this.crouched;
    // Sprinting automatically exits crouch.
    this.sprinting = input.sprintHeld && (input.moveX !== 0 || input.moveY !== 0);
    if (this.sprinting) this.crouched = false;

    if (input.reloadPressed) this.startReload();
    this.tickReload(dt);

    // Normalised diagonal speed; firing and reloading never freeze movement.
    const move = new Phaser.Math.Vector2(input.moveX, input.moveY);
    if (move.lengthSq() > 0) move.normalize().scale(this.speed);
    body.setVelocity(move.x, move.y);

    this.updateFootsteps(dt, move.length());
    this.updateAnimation(move.length());
  }

  private updateFootsteps(dt: number, speed: number): void {
    const radius = this.crouched
      ? SOUND_RADIUS.footstepCrouch
      : this.sprinting
        ? SOUND_RADIUS.footstepSprint
        : SOUND_RADIUS.footstepWalk;
    if (speed <= 1 || radius <= 0) {
      this.footstepAccumulator = 0;
      return;
    }
    // One step roughly every 22 px travelled.
    this.footstepAccumulator += speed * dt;
    if (this.footstepAccumulator >= 22) {
      this.footstepAccumulator = 0;
      this.hearing.emit({
        x: this.sprite.x,
        y: this.sprite.y,
        radius,
        kind: 'footstep',
        fromPlayer: true,
      });
    }
  }

  /**
   * Animation state machine over Tempest's directional sheets.
   *
   * Four body facings are chosen from the aim angle; `down` is the authored
   * front view, `up` the authored back view, and the side rows are authored
   * facing +X and mirrored for left. Front and back frames are NEVER mirrored,
   * and front-facing art is never used to represent facing away.
   *
   * WEAPON RULE - exactly one pistol, ever:
   *   aim and fire clips contain the pistol in the artwork, so no overlay is
   *   drawn. Idle and walk clips show the weapon lowered, and nothing is drawn
   *   over them. The separate gun-overlay sprite has been removed entirely, so
   *   two pistols cannot be drawn simultaneously by construction.
   *
   * Eight-direction aiming is untouched: `this.aim` stays the exact mouse angle
   * and drives hitscan. Only the body pose quantises to four facings, which is
   * the closest the authored art can represent. The crosshair carries the
   * precise direction. An eight-direction aim row is a future art request.
   *
   * Crouch has no artwork yet (Art Task 03). The mechanic is untouched - speed,
   * collision and suspicion rates all still change - and the sprite is NOT
   * squashed or scaled. The cues remain the HUD stance pip and the concealment
   * eye icon.
   */
  private updateAnimation(speed: number): void {
    const facing = facingFromAngle(this.aim);
    this.facing = facing;

    const state: CharState =
      this.fireFlash > 0
        ? 'fire'
        : speed > 1
          ? 'walk'
          : this.weaponReady > 0
            ? 'aim'
            : 'idle';

    const clip = clipFor('tempest', state, facing);
    const key = animKey('tempest', state, facing);

    this.sprite.setFlipX(clip.flipX);
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.anims.play(key, true);
    else if (clip.loop && !this.sprite.anims.isPlaying) this.sprite.anims.play(key, true);

    if (state === 'walk' && clip.loop) {
      // Frame rate tracks movement speed so the six-phase cycle does not skate.
      this.sprite.anims.msPerFrame = this.sprinting ? 80 : this.crouched ? 150 : 110;
    }
  }

  // ------------------------------------------------------------------ weapons

  get weaponDef() {
    return WEAPONS[this.weapon];
  }

  canFire(): boolean {
    return (
      !this.busy && this.fireCooldown <= 0 && this.ammo[this.weapon].loaded > 0 && !this.dead
    );
  }

  /** Spends one round and starts the fire-rate cooldown. */
  consumeRound(): boolean {
    if (!this.canFire()) return false;
    this.ammo[this.weapon].loaded -= 1;
    this.fireCooldown = this.weaponDef.fireInterval;
    this.fireFlash = 0.12;
    this.weaponReady = WEAPON_READY_TIME;
    // Firing interrupts a reload in progress.
    this.cancelReload();
    return true;
  }

  startReload(): void {
    const def = this.weaponDef;
    const state = this.ammo[this.weapon];
    if (this.reloading || this.busy) return;
    if (state.loaded >= def.magazine || state.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = def.reloadTime;
  }

  cancelReload(): void {
    this.reloading = false;
    this.reloadTimer = 0;
  }

  private tickReload(dt: number): void {
    if (!this.reloading) return;
    const def = this.weaponDef;
    const state = this.ammo[this.weapon];
    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return;

    if (def.reloadPerShell) {
      // Shell-by-shell: each completed shell is kept even if the reload is interrupted.
      state.loaded += 1;
      state.reserve -= 1;
      if (state.loaded >= def.magazine || state.reserve <= 0) this.cancelReload();
      else this.reloadTimer = def.reloadTime;
    } else {
      const needed = Math.min(def.magazine - state.loaded, state.reserve);
      state.loaded += needed;
      state.reserve -= needed;
      this.cancelReload();
    }
  }

  get reloadProgress(): number {
    if (!this.reloading) return 0;
    return 1 - Math.max(0, this.reloadTimer) / this.weaponDef.reloadTime;
  }

  addAmmo(weapon: WeaponId, rounds: number): boolean {
    const state = this.ammo[weapon];
    const cap = weapon === 'pistol' ? AMMO_CAP.pistolReserve : AMMO_CAP.shotgunReserve;
    if (state.reserve >= cap) return false;
    state.reserve = Math.min(cap, state.reserve + rounds);
    return true;
  }

  unlockShotgun(): void {
    if (this.unlockedShotgun) return;
    this.unlockedShotgun = true;
    this.ammo.shotgun.loaded = WEAPONS.shotgun.magazine;
    this.ammo.shotgun.reserve = WEAPONS.shotgun.startingReserve;
  }

  /** Level-start resupply floor. Never reduces what the player already carries. */
  applyAmmoFloor(): void {
    const pistol = this.ammo.pistol;
    if (pistol.loaded + pistol.reserve < AMMO_FLOOR.pistolLoaded + AMMO_FLOOR.pistolReserve) {
      pistol.loaded = Math.max(pistol.loaded, AMMO_FLOOR.pistolLoaded);
      pistol.reserve = Math.max(pistol.reserve, AMMO_FLOOR.pistolReserve);
    }
  }

  // ------------------------------------------------------------------- health

  takeDamage(amount: number): boolean {
    if (this.invulnerable || this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = PLAYER.postHitInvuln;
    this.cancelReload();
    // A hit interrupts a takedown in progress.
    if (this.takedownTimer > 0) this.takedownInterrupted = true;
    this.takedownTimer = 0;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => this.sprite.clearTint());
    if (this.hp <= 0) {
      this.dead = true;
      // Stop dead immediately: the scene stops stepping the player this frame.
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.sprite.anims.stop();
    }
    return true;
  }

  heal(amount = MEDKIT_HEAL): boolean {
    if (this.hp >= PLAYER.maxHp) return false;
    this.hp = Math.min(PLAYER.maxHp, this.hp + amount);
    return true;
  }

  beginTakedown(): void {
    this.takedownTimer = PLAYER.takedownDuration;
    this.takedownInterrupted = false;
    this.cancelReload();
  }

  // ---------------------------------------------------------------- snapshots

  snapshot(): PlayerSnapshot {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
      hp: this.hp,
      crouched: this.crouched,
      weapon: this.weapon,
      unlockedShotgun: this.unlockedShotgun,
      ammo: {
        pistol: { ...this.ammo.pistol },
        shotgun: { ...this.ammo.shotgun },
      },
    };
  }

  restore(snap: PlayerSnapshot): void {
    this.sprite.setPosition(snap.x, snap.y);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.reset(snap.x, snap.y);
    this.hp = snap.hp;
    this.crouched = snap.crouched;
    this.weapon = snap.weapon;
    this.unlockedShotgun = snap.unlockedShotgun;
    this.ammo.pistol = { ...snap.ammo.pistol };
    this.ammo.shotgun = { ...snap.ammo.shotgun };
    this.dead = false;
    this.sprinting = false;
    this.cancelReload();
    this.takedownTimer = 0;
    this.invulnTimer = 0;
    this.fireCooldown = 0;
    this.sprite.clearTint();
    this.sprite.setVisible(true);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
