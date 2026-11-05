/**
 * Single source of truth for every runtime texture key and path.
 *
 * Data-driven on purpose: adding a character, prop or tileset means adding an
 * entry here (plus metadata in CharacterDefinitions / PropDefinitions /
 * TilesetRegistry), never editing scene logic.
 *
 * Paths are relative to Vite's publicDir (`public/`), so they resolve
 * identically in `npm run dev`, `npm run build` and `npm run preview`.
 *
 * Every dimension below was measured from the actual PNGs with
 * `tools/inspect-assets.py`, not taken from filenames or the package manifest.
 * Where the manifest and the files disagree, the measured value wins and the
 * discrepancy is noted in `docs/art-integration.md`.
 */

export type AssetKind = 'image' | 'spritesheet';

export interface AssetEntry {
  key: string;
  path: string;
  kind: AssetKind;
  /** Full image dimensions, measured. Validated after load. */
  width: number;
  height: number;
  /** Frame size for spritesheets. */
  frameWidth?: number;
  frameHeight?: number;
  /** Expected frame count, measured. Validated after load. */
  frameCount?: number;
}

/**
 * Character sheet formats.
 *
 * `pose-atlas-4x6` is the original delivery: 96x192, 4 columns of pose
 * variations by 6 action rows. Six characters still use it.
 *
 * `directional-6x5` is the Art Task 01 format: 144x160, 6 animation slots by 5
 * rows, where each row is one action in one facing. Tempest uses two of these.
 * Both formats coexist deliberately - the remaining six sheets are not migrated.
 */
export type SheetFormat = 'pose-atlas-4x6' | 'directional-6x5';

export interface CharacterSheetSpec {
  /** Texture key. */
  key: string;
  path: string;
  format: SheetFormat;
  columns: number;
  rows: number;
  width: number;
  height: number;
}

const POSE_ATLAS: Omit<CharacterSheetSpec, 'key' | 'path'> = {
  format: 'pose-atlas-4x6',
  columns: 4,
  rows: 6,
  width: 96,
  height: 192,
};

const DIRECTIONAL: Omit<CharacterSheetSpec, 'key' | 'path'> = {
  format: 'directional-6x5',
  columns: 6,
  rows: 5,
  width: 144,
  height: 160,
};

export const CHARACTER_KEYS = [
  'tempest',
  'lookout_guard',
  'enforcer',
  'zealot_cultist',
  'ascendant_cultist',
  'barnabe',
  'suzanne',
] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];

export const STAGE_KEYS = ['valcendre', 'estate', 'abbey', 'ascension'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

/** Prop areas, matching the package's props/ subdirectories. */
export const PROP_AREAS = ['valcendre', 'estate', 'abbey', 'ascension', 'shared'] as const;
export type PropArea = (typeof PROP_AREAS)[number];

export const textureKey = {
  /** Pose-atlas sheet for a character still on the original format. */
  character: (name: CharacterKey) => `char.${name}`,
  /** One of a character's directional sheets. */
  characterSheet: (name: CharacterKey, suffix: string) => `char.${name}.${suffix}`,
  portrait: (name: CharacterKey) => `portrait.${name}`,
  tileset: (stage: StageKey) => `tiles.${stage}`,
  prop: (area: PropArea, name: string) => `prop.${area}.${name}`,
  fx: (name: string) => `fx.${name}`,
  ui: (name: string) => `ui.${name}`,
};

function poseAtlas(name: CharacterKey): CharacterSheetSpec {
  return {
    key: textureKey.character(name),
    path: `assets/characters/${name}_24x32_4x6.png`,
    ...POSE_ATLAS,
  };
}

/**
 * Which sheets each character loads.
 *
 * Tempest's original `tempest_24x32_4x6.png` is deliberately NOT registered: it
 * is superseded by the Art Task 01 directional pair. The file is left on disk
 * untouched - the engine agent never deletes production artwork - it is simply
 * no longer loaded. The other six characters keep the 4x6 contract unchanged.
 */
export const CHARACTER_SHEETS: Record<CharacterKey, CharacterSheetSpec[]> = {
  tempest: [
    {
      key: textureKey.characterSheet('tempest', 'dir_a'),
      path: 'assets/characters/tempest_24x32_dir.png',
      ...DIRECTIONAL,
    },
    {
      key: textureKey.characterSheet('tempest', 'dir_b'),
      path: 'assets/characters/tempest_24x32_dir_b.png',
      ...DIRECTIONAL,
    },
  ],
  // B.2-04: the approved B.2-03C-2R directional pair is registered IN ADDITION
  // to the pose atlas, not instead of it. Keeping the atlas loaded is what lets
  // ART_MODE flip back to 'legacy' and lets the regression tests assert that
  // the legacy asset is still available.
  lookout_guard: [
    poseAtlas('lookout_guard'),
    {
      key: textureKey.characterSheet('lookout_guard', 'dir_a'),
      path: 'assets/characters/lookout_guard_24x32_dir.png',
      ...DIRECTIONAL,
    },
    {
      key: textureKey.characterSheet('lookout_guard', 'dir_b'),
      path: 'assets/characters/lookout_guard_24x32_dir_b.png',
      ...DIRECTIONAL,
    },
  ],
  enforcer: [poseAtlas('enforcer')],
  zealot_cultist: [poseAtlas('zealot_cultist')],
  ascendant_cultist: [poseAtlas('ascendant_cultist')],
  barnabe: [poseAtlas('barnabe')],
  suzanne: [poseAtlas('suzanne')],
};

export function sheetsFor(name: CharacterKey): CharacterSheetSpec[] {
  return CHARACTER_SHEETS[name];
}

export function sheetFormat(name: CharacterKey): SheetFormat {
  return CHARACTER_SHEETS[name][0].format;
}

const CHARACTERS: AssetEntry[] = CHARACTER_KEYS.flatMap((name) =>
  CHARACTER_SHEETS[name].map((sheet) => ({
    key: sheet.key,
    path: sheet.path,
    kind: 'spritesheet' as const,
    width: sheet.width,
    height: sheet.height,
    frameWidth: 24,
    frameHeight: 32,
    frameCount: sheet.columns * sheet.rows,
  }))
);

/**
 * Portraits. Dimensions are irregular per file (61x54 to 65x53) and fully
 * opaque; see docs/art-integration.md. They are drawn inside a fixed panel slot
 * rather than composited directly, so the irregularity is contained.
 */
const PORTRAIT_SIZES: Record<CharacterKey, [number, number]> = {
  tempest: [64, 54],
  lookout_guard: [64, 52],
  enforcer: [65, 53],
  zealot_cultist: [61, 54],
  ascendant_cultist: [62, 54],
  barnabe: [63, 55],
  suzanne: [65, 54],
};

const PORTRAITS: AssetEntry[] = CHARACTER_KEYS.map((name) => ({
  key: textureKey.portrait(name),
  path: `assets/characters/portraits/${name}_portrait.png`,
  kind: 'image' as const,
  width: PORTRAIT_SIZES[name][0],
  height: PORTRAIT_SIZES[name][1],
}));

/** Tilesets: 128x96, 8 columns x 6 rows of 16x16 = 48 tiles, no alpha. */
const TILESETS: AssetEntry[] = STAGE_KEYS.map((stage) => ({
  key: textureKey.tileset(stage),
  path: `assets/environments/${stage}_tiles_16x16.png`,
  kind: 'spritesheet' as const,
  width: 128,
  height: 96,
  frameWidth: 16,
  frameHeight: 16,
  frameCount: 48,
}));

/** Props. `[name, width, height]`, dimensions measured from the files. */
const PROP_FILES: Record<PropArea, [string, number, number][]> = {
  valcendre: [
    ['barrels', 32, 24],
    ['bench', 32, 16],
    ['clothesline', 32, 16],
    ['flower_box', 32, 16],
    ['flower_pot', 16, 16],
    ['fountain', 32, 32],
    ['french_flag', 16, 32],
    ['hay_cart', 32, 24],
    ['lamppost', 16, 32],
    ['stone_cover', 32, 16],
    ['tree', 32, 32],
    ['village_cross', 16, 32],
  ],
  estate: [
    ['banner', 16, 32],
    ['candelabra', 16, 24],
    ['covered_table', 32, 24],
    ['hedge', 32, 16],
    ['iron_gate', 32, 32],
    ['lantern', 16, 32],
    ['statue', 32, 32],
    ['topiary', 32, 32],
    ['wardrobe_cover', 32, 32],
    ['wooden_crates', 32, 24],
  ],
  abbey: [
    ['banner', 16, 32],
    ['broken_column', 16, 32],
    ['broken_wall', 32, 32],
    ['candles', 16, 16],
    ['chandelier', 16, 24],
    ['church_pew', 32, 16],
    ['collapsed_pillar', 32, 24],
    ['lectern', 16, 24],
    ['rubble', 32, 16],
    ['skulls', 32, 16],
    ['stone_sarcophagus', 32, 16],
  ],
  ascension: [
    ['altar_candles', 16, 16],
    ['black_column', 16, 32],
    ['black_pillar', 16, 32],
    ['flame_brazier', 16, 24],
    ['hanging_cage', 16, 32],
    ['infernal_altar', 32, 24],
    ['ritual_banner', 16, 32],
    ['skull_heap', 32, 16],
    ['stone_steps', 32, 16],
  ],
  shared: [
    ['body_civilian', 32, 16],
    ['body_cultist', 32, 16],
    ['body_guard', 32, 16],
  ],
};

const PROPS: AssetEntry[] = PROP_AREAS.flatMap((area) =>
  PROP_FILES[area].map(([name, width, height]) => ({
    key: textureKey.prop(area, name),
    path: `assets/props/${area}/${name}_${width}x${height}.png`,
    kind: 'image' as const,
    width,
    height,
  }))
);

/** FX: 16x16 frames; `_4f` files are 64x16 four-frame strips. */
const FX_FILES: [string, number][] = [
  ['muzzle', 4],
  ['blood', 4],
  ['alert_question', 1],
  ['alert_suspicious', 1],
  ['alert_detected', 1],
  ['eye', 1],
  ['eye_hidden', 1],
  ['interaction', 1],
  ['silenced', 1],
];

const FX: AssetEntry[] = FX_FILES.map(([name, frames]) => ({
  key: textureKey.fx(name),
  path: `assets/fx/${name}_16x16_${frames}f.png`,
  kind: 'spritesheet' as const,
  width: 16 * frames,
  height: 16,
  frameWidth: 16,
  frameHeight: 16,
  frameCount: frames,
}));

const UI: AssetEntry[] = [
  {
    // 16 columns x 4 rows of 8x8 cells; 5x7 glyph inset at (1, 0) in each cell.
    key: textureKey.ui('font'),
    path: 'assets/ui/font_5x7_in_8x8_cells.png',
    kind: 'spritesheet',
    width: 128,
    height: 32,
    frameWidth: 8,
    frameHeight: 8,
    frameCount: 64,
  },
  {
    // 3x3 grid of 16px cells -> 16px nine-slice borders.
    key: textureKey.ui('panel'),
    path: 'assets/ui/panel_48x48_nineslice.png',
    kind: 'image',
    width: 48,
    height: 48,
  },
  {
    key: textureKey.ui('awareness'),
    path: 'assets/ui/awareness_strip_16x16x4.png',
    kind: 'spritesheet',
    width: 64,
    height: 16,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 4,
  },
];

/**
 * Belial. Registered and validated so later milestones can use it, but never
 * instantiated in Valcendre. The companion `belial_full_concept_crop.png` is
 * concept art (opaque, non-tile-aligned) and is deliberately NOT a runtime
 * asset; it stays in art-source/.
 */
const BOSS: AssetEntry[] = [
  {
    key: 'boss.belial',
    path: 'assets/boss/belial_64x64_4x4.png',
    kind: 'spritesheet',
    width: 256,
    height: 256,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 16,
  },
];

/**
 * Valcendre v2 proof art (Phase B.2-04), from TEMPEST_VALCENDRE_ART_PACKAGE_v1.
 *
 * ADDITIVE. Every legacy entry above keeps its key and path; these are new keys
 * pointing at newly copied files, so the 48-slot tilesheet and all 45 legacy
 * props continue to load exactly as before.
 *
 * `lookout_guard_walk_side_24x32.png` is intentionally absent: the art manifest
 * states it is byte-identical to row 0 of the secondary sheet, so registering it
 * would give one animation two sources. The file is copied for provenance and
 * tests assert it never becomes a texture.
 */
const VALCENDRE_V2: AssetEntry[] = [
  {
    key: 'tiles.valcendre.v2.cobble',
    path: 'assets/environments/valcendre_proof_cobble_16x16.png',
    kind: 'spritesheet',
    width: 64,
    height: 16,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 4,
  },
  // Phase B.2-05A-1: the shaded counterparts of the four daylight variants.
  // Registered ALONGSIDE the daylight strip, never replacing it.
  {
    key: 'tiles.valcendre.v2.cobbleShaded',
    path: 'assets/environments/valcendre_shaded_cobble_16x16.png',
    kind: 'spritesheet',
    width: 64,
    height: 16,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 4,
  },
  // Phase B.2-05A-2: cardinal light-to-shade transitions, 4 variants x 16
  // masks, row-major, addressed as `variant * 16 + mask`.
  {
    key: 'tiles.valcendre.v2.shadeBoundaries',
    path: 'assets/environments/valcendre_shade_boundaries_16x16.png',
    kind: 'spritesheet',
    width: 128,
    height: 128,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 64,
  },
  // Phase B.2-05A-2: diagonal corner overlays, 4 variants x 4 corners,
  // addressed as `variant * 4 + corner`. Binary alpha; drawn over the ground.
  {
    key: 'tiles.valcendre.v2.shadeCorners',
    path: 'assets/environments/valcendre_shade_diagonal_corners_16x16.png',
    kind: 'spritesheet',
    width: 128,
    height: 32,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 16,
  },
  {
    key: 'tiles.valcendre.v2.architecture',
    path: 'assets/environments/valcendre_proof_architecture_16x16.png',
    kind: 'spritesheet',
    width: 128,
    height: 64,
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 32,
  },
  {
    key: 'tiles.valcendre.v2.window',
    path: 'assets/environments/valcendre_proof_window_32x32.png',
    kind: 'image',
    width: 32,
    height: 32,
  },
  {
    key: 'tiles.valcendre.v2.door',
    path: 'assets/environments/valcendre_proof_door_16x32.png',
    kind: 'image',
    width: 16,
    height: 32,
  },
  {
    key: textureKey.prop('valcendre', 'fountain_v2'),
    path: 'assets/props/valcendre/valcendre_fountain_32x32.png',
    kind: 'image',
    width: 32,
    height: 32,
  },
  {
    key: textureKey.prop('valcendre', 'market_stall_base'),
    path: 'assets/props/valcendre/valcendre_market_stall_base_80x48.png',
    kind: 'image',
    width: 80,
    height: 48,
  },
  {
    key: textureKey.prop('valcendre', 'market_stall_canopy'),
    path: 'assets/props/valcendre/valcendre_market_stall_canopy_80x48.png',
    kind: 'image',
    width: 80,
    height: 48,
  },
];

export const ASSETS: AssetEntry[] = [
  ...CHARACTERS,
  ...PORTRAITS,
  ...TILESETS,
  ...PROPS,
  ...FX,
  ...UI,
  ...BOSS,
  ...VALCENDRE_V2,
];

export const ASSETS_BY_KEY: Map<string, AssetEntry> = new Map(ASSETS.map((a) => [a.key, a]));

export function propNames(area: PropArea): string[] {
  return PROP_FILES[area].map(([name]) => name);
}

/** Map JSON is loaded through Phaser's tilemap loader, not the image loader. */
export const MAP_FILES = {
  village: 'assets/maps/village.json',
} as const;
