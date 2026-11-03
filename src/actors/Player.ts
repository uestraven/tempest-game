import Phaser from 'phaser';
import { AMMO_CAP, AMMO_FLOOR, MEDKIT_HEAL, PLAYER, SOUND_RADIUS } from '../core/constants';
import { CHAR_H, CHAR_W, FRAME_COLS, GUN_KEY, PLAYER_KEY } from '../art/textures';
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

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly gun: Phaser.GameObjects.Image;

  hp = PLAYER.maxHp;
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
    this.sprite = scene.physics.add.sprite(x, y, PLAYER_KEY, 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(10);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight, false);
    body.setOffset((CHAR_W - PLAYER.bodyWidth) / 2, CHAR_H - PLAYER.bodyHeight);
    body.setCollideWorldBounds(true);

    this.gun = scene.add.image(x, y, GUN_KEY, 0).setDepth(11);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /**
   * Eye/muzzle point used for sight and hitscan. Kept inside the 10 px feet
   * collision body so it can never sit inside a wall tile the player is hugging,
   * which would otherwise block every outgoing shot.
   */
  get sightPoint(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y - 6 };
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
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.takedownTimer > 0) this.takedownTimer = Math.max(0, this.takedownTimer - dt);

    if (this.dead || this.takedownTimer > 0) {
      body.setVelocity(0, 0);
      this.syncGun();
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
    this.syncGun();
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

  private updateAnimation(speed: number): void {
    const dirRow = directionRow(this.aim);
    const base = (dirRow + (this.crouched ? 4 : 0)) * FRAME_COLS;
    if (speed <= 1) {
      this.sprite.anims.stop();
      this.sprite.setFrame(base);
      return;
    }
    const key = `player_walk_${dirRow}_${this.crouched ? 'c' : 's'}`;
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying)
      this.sprite.anims.play(key, true);
    this.sprite.anims.msPerFrame = this.sprinting ? 90 : this.crouched ? 190 : 140;
  }

  private syncGun(): void {
    const octant = Math.round((this.aim < 0 ? this.aim + Math.PI * 2 : this.aim) / (Math.PI / 4)) % 8;
    this.gun.setFrame(octant);
    // Pixel-aligned: the overlay sits on an integer offset from the torso.
    const reach = 7;
    this.gun.setPosition(
      Math.round(this.sprite.x + Math.cos(this.aim) * reach),
      Math.round(this.sprite.y - (this.crouched ? 12 : 16) + Math.sin(this.aim) * reach)
    );
    this.gun.setVisible(!this.dead && this.takedownTimer <= 0);
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
      this.gun.setVisible(false);
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
    this.gun.destroy();
    this.sprite.destroy();
  }
}

/** Maps an angle to one of the four art rows: 0 down, 1 left, 2 right, 3 up. */
export function directionRow(angle: number): number {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg >= 45 && deg < 135) return 0; // down
  if (deg >= 135 && deg < 225) return 1; // left
  if (deg >= 225 && deg < 315) return 3; // up
  return 2; // right
}
