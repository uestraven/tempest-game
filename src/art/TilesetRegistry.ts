/**
 * Tileset metadata and semantic tile mapping.
 *
 * All four supplied stage tilesets share one 48-tile schema (verified by
 * comparing the four `*_tiles.json` files: the `name` / `solid` / `cover` /
 * `occludes_vision` lists are byte-identical across stages). That means a
 * single semantic mapping works for Valcendre now and for the Estate, Abbey and
 * Ascension later, with only the texture key changing.
 *
 * The old prototype used 16 hand-rolled procedural tile indices. Those indices
 * have NO relationship to the new ones, so the mapping below is explicit:
 * gameplay role -> semantic tile name -> tile index. Walkability and occlusion
 * come from the gameplay role, never from the artwork, so re-skinning a role
 * cannot silently change collision.
 */

import { STAGE_KEYS, textureKey, type StageKey } from './AssetRegistry';
import roleData from './data/tile-roles.json';

export const TILE_SIZE = 16;
export const TILESET_COLUMNS = 8;
export const TILESET_ROWS = 6;
export const TILESET_TILE_COUNT = TILESET_COLUMNS * TILESET_ROWS;

/**
 * The 48 tile names in index order, from `<stage>_tiles.json`. Index is the
 * position in this array, which is also the Tiled local tile id.
 */
export const TILE_NAMES = [
  'floor_01',
  'floor_02',
  'floor_03',
  'floor_04',
  'floor_05',
  'floor_06',
  'floor_07',
  'floor_08',
  'wall_solid',
  'wall_variant',
  'wall_top',
  'wall_bottom',
  'wall_left',
  'wall_right',
  'wall_corner_tl',
  'wall_corner_tr',
  'wall_corner_bl',
  'wall_corner_br',
  'door_closed',
  'door_open',
  'threshold',
  'window',
  'stairs_up',
  'stairs_down',
  'trim',
  'floor_inlay',
  'floor_crack',
  'ground_debris',
  'floor_stain',
  'deep_shadow',
  'cover_low',
  'cover_high',
  'grass',
  'hedge',
  'flowerbed',
  'roof',
  'roof_edge',
  'rubble',
  'cobble',
  'brick',
  'checker',
  'carpet',
  'carpet_edge',
  'metal',
  'pillar',
  'grate',
  'accent',
  'ritual_mark',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const tileIndex = (name: TileName): number => TILE_NAMES.indexOf(name);

/**
 * Gameplay roles the map generator and the collision grid speak in. These are
 * the authoritative gameplay concepts; the artwork is a presentation detail.
 */
export type TileRole =
  | 'void' // outside the playable area: solid, blocks sight
  | 'cobble' // street surface
  | 'cobbleAlt' // street variation
  | 'marketDirt' // open market square
  | 'shadow' // authored concealment zone
  | 'concrete' // garage / yard slab
  | 'road' // the north exit road
  | 'wall' // building face: solid, blocks sight
  | 'crateHigh' // high cover: solid, blocks sight
  | 'barrierLow' // low cover: solid, blocks sight of a crouched player only
  | 'well' // high cover
  | 'sigil' // floor marking, decorative
  | 'grass' // decorative ground
  | 'van'; // Suzanne's transport: high cover (placeholder art, see docs)

export interface RoleFlags {
  collides: boolean;
  blocksSight: boolean;
  lowCover: boolean;
  shadow: boolean;
}

export interface RoleDef {
  role: TileRole;
  /** Tile the role draws as, in any stage tileset. */
  tile: TileName;
  /** Gameplay truth. Independent of the artwork. */
  flags: Partial<RoleFlags>;
  /** Which Tiled layer the role belongs on. */
  layer: 'floor' | 'decorBack' | 'collision' | 'cover' | 'decorFront';
}

interface RawRole {
  tile: string;
  layer: string;
  collides?: boolean;
  blocksSight?: boolean;
  lowCover?: boolean;
  shadow?: boolean;
  why?: string;
}

/** Role -> artwork + gameplay flags, loaded from `data/tile-roles.json`. */
export const TILE_ROLES: Record<TileRole, RoleDef> = Object.fromEntries(
  Object.entries(roleData.roles as Record<string, RawRole>).map(([role, raw]) => [
    role,
    {
      role: role as TileRole,
      tile: raw.tile as TileName,
      layer: raw.layer as RoleDef['layer'],
      flags: {
        ...(raw.collides ? { collides: true } : {}),
        ...(raw.blocksSight ? { blocksSight: true } : {}),
        ...(raw.lowCover ? { lowCover: true } : {}),
        ...(raw.shadow ? { shadow: true } : {}),
      },
    } satisfies RoleDef,
  ])
) as Record<TileRole, RoleDef>;

/**
 * Floor variation tiles, used to break up large surfaces without changing
 * walkability. Every entry must be a non-solid tile in the supplied metadata;
 * `tools/build-map.mjs` asserts that.
 */
export const FLOOR_VARIANTS: Record<string, TileName[]> = roleData.floorVariants as Record<
  string,
  TileName[]
>;

/** Tiles that are solid in the supplied metadata, for validation. */
export const SOLID_TILE_NAMES: TileName[] = [
  'wall_solid',
  'wall_variant',
  'wall_top',
  'wall_bottom',
  'wall_left',
  'wall_right',
  'wall_corner_tl',
  'wall_corner_tr',
  'wall_corner_bl',
  'wall_corner_br',
  'door_closed',
  'window',
  'cover_high',
  'hedge',
  'roof',
  'pillar',
];

export interface StageTileset {
  stage: StageKey;
  /** Phaser texture key. */
  texture: string;
  /** Name Tiled uses for the embedded tileset, and the key MapLoader binds. */
  tilesetName: string;
}

export const STAGE_TILESETS: Record<StageKey, StageTileset> = Object.fromEntries(
  STAGE_KEYS.map((stage) => [
    stage,
    { stage, texture: textureKey.tileset(stage), tilesetName: `${stage}_tiles` },
  ])
) as Record<StageKey, StageTileset>;

/** Gameplay flags for a tile index, derived from the role table. */
export function flagsForTileIndex(index: number): RoleFlags | null {
  for (const def of Object.values(TILE_ROLES)) {
    if (tileIndex(def.tile) !== index) continue;
    return {
      collides: def.flags.collides ?? false,
      blocksSight: def.flags.blocksSight ?? false,
      lowCover: def.flags.lowCover ?? false,
      shadow: def.flags.shadow ?? false,
    };
  }
  return null;
}
