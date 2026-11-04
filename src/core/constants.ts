/** Presentation and gameplay contracts from the locked design spec (sections 4-7). */

export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;
export const TILE = 16;

/** Gameplay runs on a bounded timestep so behaviour does not vary with refresh rate. */
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 1 / 20;

export const PLAYER = {
  maxHp: 100,
  speedCrouch: 66,
  speedWalk: 108,
  speedSprint: 152,
  /** Collision body at the feet, not the full 24x32 sprite rect. */
  bodyWidth: 12,
  bodyHeight: 10,
  spriteWidth: 24,
  spriteHeight: 32,
  interactRange: 28,
  takedownRange: 24,
  /** Target must be facing away: |angle to player - target facing| > 180 - 120/2. */
  takedownBehindArc: 120,
  takedownDuration: 0.45,
  postHitInvuln: 0.25,
} as const;

export const SOUND_RADIUS = {
  footstepCrouch: 0,
  footstepWalk: 32,
  footstepSprint: 96,
  pistol: 112,
  shotgun: 320,
  distraction: 128,
  shout: 160,
} as const;

export const VISION = {
  coneDegrees: 100,
  maxDistance: 176,
  /** Suspicion points per second, by player state. */
  ratesStanding: 80,
  ratesCrouching: 45,
  ratesCrouchingShadow: 28,
  ratesSprinting: 120,
  proximityDistance: 48,
  proximityMultiplier: 1.5,
  suspiciousThreshold: 30,
  combatThreshold: 100,
  /** Suspicion bleeds off this fast once the player is out of sight. */
  decayPerSecond: 18,
  /** Seconds an enemy investigates a last-known position before giving up. */
  investigateTimeout: 8,
} as const;

/**
 * Body box used for bullets, for both the player and enemies. NOT the movement
 * collision body (12x10 at the feet).
 *
 * Two readings of the same 12x18 box, see core/hitbox.ts:
 *  - GROUND PLANE (`bulletHitbox`): centred on the actor's position. All
 *    collision and hit tests use this, in the tile grid's own space.
 *  - SCREEN SPACE (`drawnTorso`): spans y - topOffset to y - (topOffset -
 *    height), i.e. y - 24 to y - 6. What the player sees and aims at.
 */
export const HURTBOX = {
  width: 12,
  height: 18,
  topOffset: 24,
} as const;

export const COMBAT = {
  /** Visible windup before a guard's first shot. */
  aimWindup: 0.45,
  enemyBulletSpeed: 400,
  tracerLifetime: 0.06,
  hitFlashDuration: 0.16,
  stumbleDuration: 0.22,
  /** Small positional nudge away from the shooter, in pixels. Readable, not a launch. */
  hitKnockback: 3,
  /** Lifetime of impact sparks and of the on-crosshair hit marker. */
  impactLifetime: 0.22,
  hitMarkerLifetime: 0.18,
  /** How long debug rays linger when the F3 overlay is on. */
  debugRayLifetime: 1.5,
} as const;

export const MEDKIT_HEAL = 40;

/** Level-start resupply floors (spec section 6) - these prevent long-term softlocks. */
export const AMMO_FLOOR = {
  pistolLoaded: 8,
  pistolReserve: 16,
} as const;

export const AMMO_CAP = {
  pistolReserve: 40,
  shotgunReserve: 16,
} as const;

export const PICKUP_AMOUNT = {
  ammo_pistol: 8,
  ammo_shotgun: 4,
} as const;

export const SAVE_KEY = 'tempest.save.v1';
/**
 * Save schema version. Bumped to 2 by Phase C.1B-2: the objective IDs changed
 * meaning (V3 was an optional BELIAL inscription and is now depot traversal;
 * VX is gone and V7 is the mandatory BELIAL beat), and the snapshot gained the
 * garage key, door and story-event state. A version-1 save therefore describes
 * progress that cannot be reinterpreted in this chain and is rejected outright
 * rather than half-applied.
 */
export const SAVE_VERSION = 2;

/** Palette: pale limestone, dusty blue, russet (spec section 12, Valcendre row). */
export const COLORS = {
  limestone: 0xd8cdb4,
  limestoneDark: 0xa89a7e,
  cobble: 0x8f8775,
  cobbleAlt: 0x7d7566,
  shadow: 0x4a4a52,
  marketDirt: 0x9c8e74,
  concrete: 0x76736d,
  road: 0x6b6253,
  wall: 0xbfb49a,
  wallShade: 0x8a8068,
  void: 0x14141a,
  crate: 0x7a5c3c,
  barrier: 0xb2a58a,
  well: 0x6f6a5f,
  cart: 0x6b4f33,
  sigil: 0x7a2733,
  awning: 0x3f6d82,
  grass: 0x5b6b45,
  van: 0x414a52,
  tempest: 0x3a4454,
  tempestSkin: 0xc49a76,
  lookout: 0x6e3a3a,
  hudText: 0xe8e2d4,
  alertSuspicious: 0xe0c04a,
  alertCombat: 0xd9472f,
} as const;
