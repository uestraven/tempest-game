/**
 * Character sheet metadata and frame mappings.
 *
 * MEASURED, NOT ASSUMED. Every sheet is 96x192 = 4 columns x 6 rows of 24x32.
 * The package manifest and README are explicit that the four columns are POSE
 * VARIATIONS, not cardinal directions:
 *
 *   "Human sheet layout is 4 columns by 6 animation rows (idle, walk, aim,
 *    fire, hit, down); 4 columns are frames, NOT cardinal directions."
 *
 * This contradicts the 144x128 / six-frames-per-direction layout the
 * integration brief anticipated. There is no directional art in the package at
 * all. See `docs/art-integration.md` for the consequences and the fallback.
 *
 * Frame indices below are chosen from per-frame alpha bounding boxes measured
 * with `tools/inspect-assets.py sheet <file> 24 32`. Frames whose silhouette
 * height or width deviates from the row's norm are excluded, because cycling
 * through them makes the sprite visibly bob or stretch. Nothing here reassigns
 * a frame to a purpose it was not drawn for.
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
 * Transparent padding below the feet, in pixels, measured on every sheet: the
 * lowest opaque pixel is at frame row 30, leaving row 31 empty. The manifest's
 * origin of (12, 30) agrees. The sprite origin therefore uses 31/32 vertically
 * so the ground-contact line lands exactly on the actor's world y, with no
 * sub-pixel offset (31/32 * 32 = 31, an integer).
 */
export const CHAR_FEET_INSET = 1;
export const CHAR_ORIGIN_X = 0.5;
export const CHAR_ORIGIN_Y = (CHAR_FRAME_HEIGHT - CHAR_FEET_INSET) / CHAR_FRAME_HEIGHT;

export interface CharacterDef {
  key: CharacterKey;
  /** Columns used for the slow idle breathe loop. */
  idleFrames: number[];
  /** Columns used for the walk cycle. */
  walkFrames: number[];
  /** Single column used for the weapon-ready pose. */
  aimFrame: number;
  /** Single column used as a one-shot recoil flash. */
  fireFrame: number;
  /** Single column used for the damage reaction. */
  hitFrame: number;
  /** Single column used for the incapacitated body. */
  downFrame: number;
  /** Columns deliberately skipped, with the measurement that disqualified them. */
  excluded: string[];
}

/**
 * Per-character picks. `excluded` records why a frame was dropped so an artist
 * can see exactly which frames need re-registration.
 */
export const CHARACTERS: Record<CharacterKey, CharacterDef> = {
  tempest: {
    key: 'tempest',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 2, 3],
    aimFrame: 0,
    fireFrame: 3,
    hitFrame: 0,
    downFrame: 0,
    excluded: [
      'idle col 0: bbox 23x29 vs 17x30 for cols 1-2, a wider and 1px shorter pose',
      'idle col 3: bbox 20x30, width mismatch with the chosen pair',
    ],
  },
  lookout_guard: {
    key: 'lookout_guard',
    idleFrames: [1, 2],
    walkFrames: [1, 2, 3],
    aimFrame: 0,
    fireFrame: 3,
    hitFrame: 0,
    downFrame: 0,
    excluded: [
      'walk col 0: bbox 23x22 against 21x30 / 19x30 / 18x30 - an 8px height jump',
      'idle col 0: bbox 23x30 vs 17x30, silhouette width mismatch',
    ],
  },
  enforcer: {
    key: 'enforcer',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 2],
    aimFrame: 0,
    fireFrame: 0,
    hitFrame: 0,
    downFrame: 1,
    excluded: [
      'walk col 3: content bottom at row 29 instead of 30, so the figure bobs 1px',
      'down col 0: bbox height 11 vs 12 on the other three frames',
    ],
  },
  zealot_cultist: {
    key: 'zealot_cultist',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 3],
    aimFrame: 0,
    fireFrame: 2,
    hitFrame: 0,
    downFrame: 2,
    excluded: ['walk col 2: bbox width 12 against 15-18, a visible horizontal shrink'],
  },
  ascendant_cultist: {
    key: 'ascendant_cultist',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 2, 3],
    aimFrame: 0,
    fireFrame: 0,
    hitFrame: 0,
    downFrame: 1,
    excluded: [],
  },
  barnabe: {
    key: 'barnabe',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 2, 3],
    aimFrame: 0,
    fireFrame: 2,
    hitFrame: 1,
    downFrame: 2,
    excluded: [
      'idle col 0: bbox 23x27, 3px shorter than cols 1-3',
      'down cols 0-1: only 56 and 42 opaque pixels, effectively empty frames',
      'hit col 0: bbox y19 h12, a lying pose in the hit row',
    ],
  },
  suzanne: {
    key: 'suzanne',
    idleFrames: [1, 2],
    walkFrames: [0, 1, 2, 3],
    aimFrame: 0,
    fireFrame: 0,
    hitFrame: 2,
    downFrame: 3,
    excluded: [
      'idle col 0: bbox 23x29, 1px shorter and much wider than cols 1-3',
      'down cols 0-1: only 37 and 42 opaque pixels, effectively empty frames',
    ],
  },
};

/** Flat frame index into the 4x6 sheet. */
export function frameIndex(row: CharRow, column: number): number {
  return CHAR_ROW[row] * CHAR_COLUMNS + column;
}

export function frameIndices(row: CharRow, columns: number[]): number[] {
  return columns.map((c) => frameIndex(row, c));
}

/**
 * Animation state the actor layer asks for. Direction is handled separately,
 * by horizontal mirroring, because the art has no per-direction frames.
 */
export type CharState = 'idle' | 'walk' | 'aim' | 'fire' | 'hit' | 'down';

export const animKey = (character: CharacterKey, state: CharState): string =>
  `anim.${character}.${state}`;
