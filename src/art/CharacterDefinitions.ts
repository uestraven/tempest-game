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

import { textureKey, type CharacterKey } from './AssetRegistry';
import { ART_MODE } from './ValcendreV2';

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

/**
 * Where the character's weapon comes from while a clip plays. Exactly one
 * source is ever active, so two pistols can never be drawn at once.
 *
 *   in-frame - the artwork already contains the pistol; no overlay is drawn
 *   overlay  - the artwork has no weapon, so the separate overlay sprite is used
 *   none     - the weapon is lowered or holstered in this pose; nothing is drawn
 */
export type WeaponSource = 'in-frame' | 'overlay' | 'none';

export interface Clip {
  /** Texture key the frames belong to. A character may span several sheets. */
  sheet: string;
  /** Flat frame indices into that sheet, row-major. */
  frames: number[];
  flipX: boolean;
  source: FrameSource;
  fps: number;
  loop: boolean;
  weapon: WeaponSource;
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
  weapon?: WeaponSource;
  note?: string;
}

/** Clip from a pose-atlas (4x6) sheet, addressed by action row and column. */
const atlasClip =
  (name: CharacterKey) =>
  (row: CharRow, columns: number[], opts: ClipOpts = {}): Clip => ({
    sheet: textureKey.character(name),
    frames: frameIndices(row, columns),
    flipX: opts.flipX ?? false,
    source: opts.source ?? 'authored',
    fps: opts.fps ?? 1,
    loop: opts.loop ?? false,
    // The pose-atlas sheets' aim and fire rows already hold a weapon.
    weapon: opts.weapon ?? (row === 'aim' || row === 'fire' ? 'in-frame' : 'none'),
    note: opts.note,
  });

const IDLE_FPS = 3;
const WALK_FPS = 9;
const FIRE_FPS = 18;

// --------------------------------------------------------- directional sheets

/** Art Task 01 format: 6 animation slots by 5 rows, row-major. */
export const DIR_COLUMNS = 6;
export const DIR_ROWS = 5;

/** Sheet A rows, from tempest_directional_manifest.json. */
export const DIR_SHEET_A_ROWS = ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up'] as const;
/** Sheet B rows. */
export const DIR_SHEET_B_ROWS = ['walk_side', 'aim_side', 'aim_down', 'aim_up', 'fire_side'] as const;

export type DirRowName = (typeof DIR_SHEET_A_ROWS)[number] | (typeof DIR_SHEET_B_ROWS)[number];

/** Row index and sheet suffix for every directional row name. */
export const DIR_ROW_LOCATION: Record<DirRowName, { sheet: 'dir_a' | 'dir_b'; row: number }> = {
  idle_down: { sheet: 'dir_a', row: 0 },
  idle_up: { sheet: 'dir_a', row: 1 },
  idle_side: { sheet: 'dir_a', row: 2 },
  walk_down: { sheet: 'dir_a', row: 3 },
  walk_up: { sheet: 'dir_a', row: 4 },
  walk_side: { sheet: 'dir_b', row: 0 },
  aim_side: { sheet: 'dir_b', row: 1 },
  aim_down: { sheet: 'dir_b', row: 2 },
  aim_up: { sheet: 'dir_b', row: 3 },
  fire_side: { sheet: 'dir_b', row: 4 },
};

/**
 * Distinct pose counts, verified against the pixels rather than taken on trust:
 * every row's held slots are byte-identical to slot 0, so only the distinct
 * leading slots are animated. Animating all six slots of a 2-pose idle row
 * would hold the first pose for five frames out of six.
 */
export const DIR_DISTINCT_POSES: Record<DirRowName, number> = {
  idle_down: 2,
  idle_up: 2,
  idle_side: 2,
  walk_down: 6,
  walk_up: 6,
  walk_side: 6,
  aim_side: 1,
  aim_down: 1,
  aim_up: 1,
  fire_side: 3,
};

export function dirFrameIndex(row: number, column: number): number {
  return row * DIR_COLUMNS + column;
}

/** Clip from a directional sheet, addressed by row name. Uses distinct slots only. */
const dirClip =
  (name: CharacterKey) =>
  (rowName: DirRowName, opts: ClipOpts = {}): Clip => {
    const loc = DIR_ROW_LOCATION[rowName];
    const distinct = DIR_DISTINCT_POSES[rowName];
    return {
      sheet: textureKey.characterSheet(name, loc.sheet),
      frames: Array.from({ length: distinct }, (_, c) => dirFrameIndex(loc.row, c)),
      flipX: opts.flipX ?? false,
      source: opts.source ?? 'authored',
      fps: opts.fps ?? 1,
      loop: opts.loop ?? false,
      weapon: opts.weapon ?? 'none',
      note: opts.note,
    };
  };

/**
 * tempest - Art Task 01 directional sheets.
 *
 * Verified against the delivered PNGs with tools/inspect-assets.py and the 7x
 * contact sheet: both sheets are 144x160 with 30 frames, every frame's content
 * ends on row 30 with row 31 transparent, heights are a constant 26px and
 * widths constant per row, alpha is binary, and the held slots are
 * byte-identical to slot 0. Down is front, up is back, every side row faces +X.
 *
 * WEAPON RULE: the aim and fire rows already contain the pistol, so the
 * separate gun overlay is never drawn for Tempest. The idle and walk rows show
 * the weapon lowered, and nothing is drawn over them. Exactly one pistol is
 * therefore visible at any time, and never two.
 */
const TEMPEST: CharacterDef = (() => {
  const c = dirClip('tempest');
  return {
    key: 'tempest',
    verified: true,
    observations: [
      'Art Task 01 directional format: 144x160, 6 slots x 5 rows, 30 frames per sheet.',
      'Verified: content bottom row 30 on all 60 frames, row 31 transparent, 0 partial-alpha pixels, 22-23 colour palette.',
      'Distinct poses per row verified by byte comparison: idle 2, walk 6, aim 1, fire 3. Held slots are identical to slot 0 and are not animated.',
      'Side rows face +X and are mirrored for left. Down is front, up is back; neither is ever mirrored.',
      'Measured weapon barrel tip: side (+11, -13) from the feet anchor, down (0, -10), up (+3, -20).',
      'No hit row exists in this format; the hit state falls back to idle and is unused by the player.',
    ],
    clips: {
      idle: {
        down: c('idle_down', { fps: IDLE_FPS, loop: true }),
        up: c('idle_up', { fps: IDLE_FPS, loop: true }),
        right: c('idle_side', { fps: IDLE_FPS, loop: true }),
        left: c('idle_side', { fps: IDLE_FPS, loop: true, flipX: true, source: 'mirrored' }),
      },
      walk: {
        down: c('walk_down', { fps: WALK_FPS, loop: true }),
        up: c('walk_up', { fps: WALK_FPS, loop: true }),
        right: c('walk_side', { fps: WALK_FPS, loop: true }),
        left: c('walk_side', { fps: WALK_FPS, loop: true, flipX: true, source: 'mirrored' }),
      },
      aim: {
        down: c('aim_down', { weapon: 'in-frame' }),
        up: c('aim_up', { weapon: 'in-frame' }),
        right: c('aim_side', { weapon: 'in-frame' }),
        left: c('aim_side', { weapon: 'in-frame', flipX: true, source: 'mirrored' }),
      },
      fire: {
        // No front or back firing row; the cardinal aim pose holds instead, and
        // the shot direction is unaffected - see Player.updateAnimation.
        down: c('aim_down', { weapon: 'in-frame', source: 'fallback', note: 'no fire_down row' }),
        up: c('aim_up', { weapon: 'in-frame', source: 'fallback', note: 'no fire_up row' }),
        right: c('fire_side', { fps: FIRE_FPS, weapon: 'in-frame' }),
        left: c('fire_side', { fps: FIRE_FPS, weapon: 'in-frame', flipX: true, source: 'mirrored' }),
      },
      hit: {
        down: c('idle_down', { source: 'fallback', note: 'no hit row in the directional format' }),
        up: c('idle_up', { source: 'fallback' }),
        right: c('idle_side', { source: 'fallback' }),
        left: c('idle_side', { flipX: true, source: 'fallback' }),
      },
    },
  };
})();

/**
 * Measured barrel-tip offsets from Tempest's feet anchor, per facing, for
 * placing the muzzle flash on the pistol drawn inside the frame. Taken from the
 * rightmost weapon-metal pixel of aim_side/fire_side and the weapon pixels of
 * aim_down/aim_up.
 */
export const TEMPEST_MUZZLE_OFFSET: Record<Facing, { x: number; y: number }> = {
  right: { x: 11, y: -13 },
  left: { x: -11, y: -13 },
  down: { x: 0, y: -10 },
  up: { x: 3, y: -20 },
};

// ------------------------------------------------------- pose-atlas sheets

/**
 * lookout_guard - pixel-verified from
 * docs/diagnostics/transparency/lookout_guard_rows0-2_14x.png.
 * Its layout differs from tempest's: no back view, and the walk faces RIGHT.
 */
/**
 * lookout_guard — LEGACY pose atlas, kept so ART_MODE can flip back.
 *
 * Pixel-verified from docs/diagnostics/transparency/lookout_guard_rows0-2_14x.png.
 * Its layout differs from tempest's: no back view, and the walk faces RIGHT.
 */
const LOOKOUT_LEGACY: CharacterDef = (() => {
  const clip = atlasClip('lookout_guard');
  return {
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
  } satisfies CharacterDef;
})();

/**
 * lookout_guard — B.2-03C-2R approved directional pair (Phase B.2-04).
 *
 * Row layout is IDENTICAL to Tempest's Art Task 01 format, which is why this
 * reuses `dirClip` rather than introducing a second animation system:
 *   sheet A rows 0-4  idle_down, idle_up, idle_side, walk_down, walk_up
 *   sheet B rows 0-4  walk_side, aim_side, aim_down, aim_up, fire_side
 *
 * Distinct-pose counts come from lookout_guard_manifest.json's `animation`
 * block and match DIR_DISTINCT_POSES exactly: idle 2, walk 6, aim 1, fire 3.
 *
 * DIRECTION RULES, from the manifest: down is the front, up is the back, side
 * art faces +X and left is produced by horizontal mirroring. Up and down are
 * NEVER mirrored into another direction.
 *
 * WEAPON RULE: the manifest states the pistol is baked into every aim and fire
 * frame and says in as many words "DO NOT render any additional gun or handgun
 * overlay". Those clips are therefore tagged `weapon: 'in-frame'`. The engine
 * has no separate enemy weapon overlay to begin with, so exactly one pistol is
 * visible; `tests/art-integration.test.ts` pins that.
 *
 * Unlike the legacy atlas this sheet HAS a real back view, so idle_up and
 * walk_up are authored rather than falling back to the front pose.
 */
const LOOKOUT_V2: CharacterDef = (() => {
  const c = dirClip('lookout_guard');
  return {
    key: 'lookout_guard',
    verified: true,
    observations: [
      'Approved directional pair: two 144x160 sheets, 6 slots x 5 rows, 30 frames each.',
      'Real back view present, so up is authored instead of reusing the front idle.',
      'Side rows face +X and are mirrored for left; up and down are never mirrored.',
      'Pistol is baked into aim and fire rows; no separate weapon overlay is drawn.',
      'Feet anchor (12,30) with row 31 transparent, matching the existing actor contract.',
    ],
    clips: {
      idle: {
        down: c('idle_down', { fps: IDLE_FPS, loop: true }),
        up: c('idle_up', { fps: IDLE_FPS, loop: true }),
        right: c('idle_side', { fps: IDLE_FPS, loop: true }),
        left: c('idle_side', { fps: IDLE_FPS, loop: true, flipX: true, source: 'mirrored' }),
      },
      walk: {
        down: c('walk_down', { fps: WALK_FPS, loop: true }),
        up: c('walk_up', { fps: WALK_FPS, loop: true }),
        right: c('walk_side', { fps: WALK_FPS, loop: true }),
        left: c('walk_side', { fps: WALK_FPS, loop: true, flipX: true, source: 'mirrored' }),
      },
      aim: {
        down: c('aim_down', { weapon: 'in-frame' }),
        up: c('aim_up', { weapon: 'in-frame' }),
        right: c('aim_side', { weapon: 'in-frame' }),
        left: c('aim_side', { weapon: 'in-frame', flipX: true, source: 'mirrored' }),
      },
      fire: {
        // The sheet has no front or back firing row, exactly as Tempest's does
        // not; the cardinal aim pose holds and the shot direction is unaffected.
        down: c('aim_down', { weapon: 'in-frame', source: 'fallback', note: 'no fire_down row' }),
        up: c('aim_up', { weapon: 'in-frame', source: 'fallback', note: 'no fire_up row' }),
        right: c('fire_side', { fps: FIRE_FPS, weapon: 'in-frame' }),
        left: c('fire_side', { fps: FIRE_FPS, weapon: 'in-frame', flipX: true, source: 'mirrored' }),
      },
      hit: {
        down: c('idle_down', { source: 'fallback', note: 'no hit row in the directional format' }),
        up: c('idle_up', { source: 'fallback' }),
        right: c('idle_side', { source: 'fallback' }),
        left: c('idle_side', { flipX: true, source: 'fallback' }),
      },
    },
  } satisfies CharacterDef;
})();

/**
 * Which Lookout appearance is active.
 *
 * SCOPE NOTE, reported rather than buried: the engine registers one definition
 * per character key, so this switch changes ALL SEVEN Lookouts, not only the
 * market guards. The brief prefers market-only, but per-instance sheet
 * selection would mean threading a variant through CharacterDef, the animation
 * registry and Enemy construction - a far larger change than this proof
 * warrants. Flipping ART_MODE reverts every guard together.
 */
const LOOKOUT: CharacterDef = ART_MODE === 'valcendre_v2_proof' ? LOOKOUT_V2 : LOOKOUT_LEGACY;

/**
 * Muzzle origins for the Lookout's in-frame pistol, converted from
 * lookout_guard_manifest.json `muzzle_origin_local_px` into offsets from the
 * feet anchor (12,30) so they can be added to a world position directly.
 *
 * The manifest gives frame-local pixels; subtracting the anchor is the whole
 * conversion. Mirrored x in the manifest is `23 - source x`, which lands at
 * local 0 for the side pose, i.e. -12 from the anchor.
 */
export const LOOKOUT_MUZZLE_OFFSET: Record<Facing, { x: number; y: number }> = {
  right: { x: 23 - 12, y: 18 - 30 },
  left: { x: 0 - 12, y: 18 - 30 },
  down: { x: 12 - 12, y: 24 - 30 },
  up: { x: 19 - 12, y: 10 - 30 },
};

/**
 * Conservative definition for a sheet whose frame facings have NOT been
 * verified: a single-frame idle, so it cannot flicker between a front and a
 * back view whatever the layout turns out to be, and one authored column per
 * other state. None of these characters is instantiated in Valcendre.
 */
function unverified(key: CharacterKey): CharacterDef {
  const clip = atlasClip(key);
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
