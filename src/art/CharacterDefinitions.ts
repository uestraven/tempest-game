/**
 * Character sheet metadata and frame mappings.
 *
 * MEASURED, NOT ASSUMED. Every sheet is 96x192 = 4 columns x 6 rows of 24x32.
 * The package manifest says the four columns are POSE VARIATIONS, not
 * directions:
 *
 *   "Human sheet layout is 4 columns by 6 animation rows (idle, walk, aim,
 *    fire, hit, down); 4 columns are frames, NOT cardinal directions."
 *
 * That is only half true, and the half that is wrong matters.
 *
 * Phase B.1A inspected the pixels at 14-16x (docs/diagnostics/transparency/)
 * and found the sheets DO carry directional art - inconsistently, and
 * differently per character:
 *
 *   tempest       idle row = 2 FRONT + 2 BACK views; walk row faces LEFT;
 *                 aim and fire rows face RIGHT.
 *   lookout_guard idle row = 4 FRONT views, no back view at all; walk row
 *                 faces RIGHT; aim row faces RIGHT.
 *
 * So there is no single frame contract across the seven sheets. Two
 * consequences:
 *
 *  1. The Phase B mapping picked idle columns [1, 2] for every character. On
 *     tempest that is one front and one back frame, so the idle animation
 *     alternated between facing the camera and facing away, twice a second.
 *     That is fixed here.
 *  2. Mirroring has to be computed relative to each clip's INTRINSIC facing. A
 *     blanket "flip when aiming left" turns a left-facing walk cycle the wrong
 *     way round.
 *
 * Only tempest and lookout_guard have been pixel-verified, because they are the
 * only characters Valcendre instantiates. The other five use a deliberately
 * conservative single-frame idle so they cannot flicker whatever their layout
 * turns out to be, and are marked `verified: false`.
 *
 * docs/art-requests/phase-b1.md asks for one canonical directional sheet
 * format so none of this guesswork is needed.
 */

import type { CharacterKey } from './AssetRegistry';

export const CHAR_COLUMNS = 4;
export const CHAR_ROWS = 6;
export const CHAR_FRAME_WIDTH = 24;
export const CHAR_FRAME_HEIGHT = 32;

/** Row order, from the package manifest's `row_names`. */
export const CHAR_ROW = {
  idle: 0,
  walk: 1,
  aim: 2,
  fire: 3,
  hit: 4,
  down: 5,
} as const;
export type CharRow = keyof typeof CHAR_ROW;

/**
 * Transparent padding below the feet, measured on every sheet: the lowest
 * opaque pixel is at frame row 30, leaving row 31 empty. The manifest's origin
 * of (12, 30) agrees. The sprite origin uses 31/32 vertically so the
 * ground-contact line lands on the actor's world y with no sub-pixel offset
 * (31/32 * 32 = 31, an integer).
 */
export const CHAR_FEET_INSET = 1;
export const CHAR_ORIGIN_X = 0.5;
export const CHAR_ORIGIN_Y = (CHAR_FRAME_HEIGHT - CHAR_FEET_INSET) / CHAR_FRAME_HEIGHT;

export type Facing = 'down' | 'up' | 'left' | 'right';
export const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];

/** Animation states the actor layer asks for. `down` is not a runtime state. */
export type CharState = 'idle' | 'walk' | 'aim' | 'fire' | 'hit';
export const CHAR_STATES: CharState[] = ['idle', 'walk', 'aim', 'fire', 'hit'];

/**
 * Where a clip's frames come from:
 *   authored - drawn for this direction
 *   mirrored - the opposite direction's art, horizontally flipped
 *   fallback - art drawn for a different state, because this one does not exist
 */
export type FrameSource = 'authored' | 'mirrored' | 'fallback';

export interface Clip {
  /** Flat frame indices into the 4x6 sheet. */
  frames: number[];
  flipX: boolean;
  source: FrameSource;
  fps: number;
  loop: boolean;
  /** Why this clip looks the way it does. Surfaced in the art request. */
  note?: string;
}

export interface CharacterDef {
  key: CharacterKey;
  /** True only when the frame facings were confirmed from the pixels. */
  verified: boolean;
  clips: Record<CharState, Record<Facing, Clip>>;
  /** Observations recorded during the pixel audit. */
  observations: string[];
}

/** Flat frame index into the 4x6 sheet. */
export function frameIndex(row: CharRow, column: number): number {
  return CHAR_ROW[row] * CHAR_COLUMNS + column;
}

export function frameIndices(row: CharRow, columns: number[]): number[] {
  return columns.map((c) => frameIndex(row, c));
}

interface ClipOpts {
  flipX?: boolean;
  source?: FrameSource;
  fps?: number;
  loop?: boolean;
  note?: string;
}

const clip = (row: CharRow, columns: number[], opts: ClipOpts = {}): Clip => ({
  frames: frameIndices(row, columns),
  flipX: opts.flipX ?? false,
  source: opts.source ?? 'authored',
  fps: opts.fps ?? 1,
  loop: opts.loop ?? false,
  note: opts.note,
});

const IDLE_FPS = 3;
const WALK_FPS = 9;

/**
 * tempest - pixel-verified from docs/diagnostics/transparency/tempest_zoom8x.png
 * and tempest_rows0-2_16x.png.
 */
const TEMPEST: CharacterDef = {
  key: 'tempest',
  verified: true,
  observations: [
    'idle row: columns 0-1 are FRONT views, columns 2-3 are BACK views.',
    'walk row: all four columns face LEFT.',
    'aim row: all four columns face RIGHT.',
    'fire row: all four columns face RIGHT.',
    'hit row: facing not conclusively readable; only column 0 is used.',
    'down row: contains an opaque dark region that is not the body, so corpses use the shared body props instead.',
  ],
  clips: {
    idle: {
      down: clip('idle', [0, 1], { fps: IDLE_FPS, loop: true }),
      up: clip('idle', [2, 3], { fps: IDLE_FPS, loop: true }),
      right: clip('aim', [0], { note: 'standing weapon-ready pose, the only right-facing stand' }),
      left: clip('aim', [0], { flipX: true, source: 'mirrored' }),
    },
    walk: {
      left: clip('walk', [0, 1, 2, 3], { fps: WALK_FPS, loop: true }),
      right: clip('walk', [0, 1, 2, 3], { fps: WALK_FPS, loop: true, flipX: true, source: 'mirrored' }),
      down: clip('idle', [0, 1], {
        fps: IDLE_FPS,
        loop: true,
        source: 'fallback',
        note: 'no front-facing walk cycle exists; the front idle plays instead of mis-using the left-facing legs',
      }),
      up: clip('idle', [2, 3], {
        fps: IDLE_FPS,
        loop: true,
        source: 'fallback',
        note: 'no back-facing walk cycle exists; the back idle plays instead',
      }),
    },
    aim: {
      right: clip('aim', [0]),
      left: clip('aim', [0], { flipX: true, source: 'mirrored' }),
      down: clip('aim', [0], { source: 'fallback', note: 'no front-facing aim pose' }),
      up: clip('aim', [0], { source: 'fallback', note: 'no back-facing aim pose' }),
    },
    fire: {
      right: clip('fire', [3]),
      left: clip('fire', [3], { flipX: true, source: 'mirrored' }),
      down: clip('fire', [3], { source: 'fallback', note: 'no front-facing fire pose' }),
      up: clip('fire', [3], { source: 'fallback', note: 'no back-facing fire pose' }),
    },
    hit: {
      down: clip('hit', [0], { source: 'fallback' }),
      up: clip('hit', [0], { source: 'fallback' }),
      left: clip('hit', [0], { source: 'fallback' }),
      right: clip('hit', [0], { source: 'fallback' }),
    },
  },
};

/**
 * lookout_guard - pixel-verified from
 * docs/diagnostics/transparency/lookout_guard_rows0-2_14x.png.
 * Its layout differs from tempest's: no back view, and the walk faces RIGHT.
 */
const LOOKOUT: CharacterDef = {
  key: 'lookout_guard',
  verified: true,
  observations: [
    'idle row: all four columns are FRONT views. There is no back view on this sheet.',
    'walk row: all four columns face RIGHT. Column 0 is clipped at the frame edge (bbox 23x22 against 30-tall siblings) and is excluded.',
    'aim row: all four columns face RIGHT.',
    'down row: same opaque dark region as tempest; corpses use the shared body props.',
  ],
  clips: {
    idle: {
      down: clip('idle', [0, 1], { fps: IDLE_FPS, loop: true }),
      up: clip('idle', [0, 1], {
        fps: IDLE_FPS,
        loop: true,
        source: 'fallback',
        note: 'no back view on this sheet; the front idle plays instead of a rotated or mirrored fake',
      }),
      right: clip('aim', [0]),
      left: clip('aim', [0], { flipX: true, source: 'mirrored' }),
    },
    walk: {
      right: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true }),
      left: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true, flipX: true, source: 'mirrored' }),
      down: clip('idle', [0, 1], { fps: IDLE_FPS, loop: true, source: 'fallback' }),
      up: clip('idle', [0, 1], { fps: IDLE_FPS, loop: true, source: 'fallback' }),
    },
    aim: {
      right: clip('aim', [0]),
      left: clip('aim', [0], { flipX: true, source: 'mirrored' }),
      down: clip('aim', [0], { source: 'fallback' }),
      up: clip('aim', [0], { source: 'fallback' }),
    },
    fire: {
      right: clip('fire', [3]),
      left: clip('fire', [3], { flipX: true, source: 'mirrored' }),
      down: clip('fire', [3], { source: 'fallback' }),
      up: clip('fire', [3], { source: 'fallback' }),
    },
    hit: {
      down: clip('hit', [0], { source: 'fallback' }),
      up: clip('hit', [0], { source: 'fallback' }),
      left: clip('hit', [0], { source: 'fallback' }),
      right: clip('hit', [0], { source: 'fallback' }),
    },
  },
};

/**
 * Conservative definition for a sheet whose frame facings have NOT been
 * verified: a single-frame idle, so it cannot flicker between a front and a
 * back view whatever the layout turns out to be, and one authored column per
 * other state. None of these characters is instantiated in Valcendre.
 */
function unverified(key: CharacterKey): CharacterDef {
  const still = (row: CharRow, column: number, note?: string): Record<Facing, Clip> => ({
    down: clip(row, [column], { source: 'fallback', note }),
    up: clip(row, [column], { source: 'fallback', note }),
    left: clip(row, [column], { source: 'fallback', note }),
    right: clip(row, [column], { source: 'fallback', note }),
  });
  return {
    key,
    verified: false,
    observations: [
      'Frame facings not yet verified against the pixels; this character is not instantiated in Valcendre.',
      'Single-frame idle chosen so the animation cannot alternate between front and back views.',
    ],
    clips: {
      idle: still('idle', 0, 'unverified sheet: single idle frame only'),
      walk: {
        down: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true, source: 'fallback' }),
        up: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true, source: 'fallback' }),
        left: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true, source: 'fallback' }),
        right: clip('walk', [1, 2, 3], { fps: WALK_FPS, loop: true, source: 'fallback' }),
      },
      aim: still('aim', 0),
      fire: still('fire', 0),
      hit: still('hit', 0),
    },
  };
}

export const CHARACTERS: Record<CharacterKey, CharacterDef> = {
  tempest: TEMPEST,
  lookout_guard: LOOKOUT,
  enforcer: unverified('enforcer'),
  zealot_cultist: unverified('zealot_cultist'),
  ascendant_cultist: unverified('ascendant_cultist'),
  barnabe: unverified('barnabe'),
  suzanne: unverified('suzanne'),
};

export const animKey = (character: CharacterKey, state: CharState, facing: Facing): string =>
  `anim.${character}.${state}.${facing}`;

export function clipFor(character: CharacterKey, state: CharState, facing: Facing): Clip {
  return CHARACTERS[character].clips[state][facing];
}

/** Maps an angle to one of the four facings. */
export function facingFromAngle(angle: number): Facing {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg >= 45 && deg < 135) return 'down';
  if (deg >= 135 && deg < 225) return 'left';
  if (deg >= 225 && deg < 315) return 'up';
  return 'right';
}
