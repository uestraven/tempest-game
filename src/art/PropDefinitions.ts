/**
 * Prop dimensions, ground anchors, rendering depth and collision metadata.
 *
 * The data lives in `data/prop-metadata.json` so the map generator
 * (`tools/build-map.mjs`) reads exactly the same numbers. A prop's gameplay
 * collision is rasterised into the map's invisible `propCollision` layer at
 * build time, which means:
 *
 *  - the authoritative collision/occlusion grid always matches this metadata;
 *  - the generator's reachability assertions run against real prop collision,
 *    so an oversized footprint fails the build instead of blocking a route;
 *  - no cover tile is drawn underneath a prop, so there are no duplicate visuals.
 */

import { textureKey, type PropArea } from './AssetRegistry';
import metadata from './data/prop-metadata.json';

export type PropDepth = 'ground' | 'sorted' | 'front';
export type PropCover = 'none' | 'low' | 'high';

export interface PropFootprint {
  width: number;
  height: number;
}

export interface PropDef {
  area: PropArea;
  name: string;
  /** Texture key in the asset registry. */
  texture: string;
  /** Canvas dimensions, measured. */
  width: number;
  height: number;
  /** Transparent rows below the art; the ground-contact row is height - inset. */
  feetInset: number;
  depth: PropDepth;
  /** Gameplay collision box, centred on the anchor x with its bottom at anchor y. */
  footprint: PropFootprint | null;
  blocksMove: boolean;
  blocksSight: boolean;
  cover: PropCover;
  decorative: boolean;
  /**
   * Pixels to raise a 'front' prop above its anchor so it hangs over a
   * character instead of across its body. A character sprite is 31px tall above
   * its ground position, so 32 clears the tallest one. 0 for every other depth.
   */
  overheadLift: number;
  note?: string;
}

/** Fixed render depths. 'sorted' props get `10 + y / 10000`, like characters. */
export const PROP_DEPTH = {
  ground: 3,
  front: 22,
} as const;

type RawProp = {
  name: string;
  width: number;
  height: number;
  feetInset: number;
  depth: string;
  footprint: PropFootprint | null;
  blocksMove: boolean;
  blocksSight: boolean;
  cover: string;
  decorative: boolean;
  overheadLift?: number;
  note?: string;
};

const AREAS: PropArea[] = ['valcendre', 'estate', 'abbey', 'ascension', 'shared'];

function build(): Map<string, PropDef> {
  const out = new Map<string, PropDef>();
  for (const area of AREAS) {
    const list = (metadata as unknown as Record<string, RawProp[]>)[area] ?? [];
    for (const raw of list) {
      const def: PropDef = {
        area,
        name: raw.name,
        texture: textureKey.prop(area, raw.name),
        width: raw.width,
        height: raw.height,
        feetInset: raw.feetInset,
        depth: raw.depth as PropDepth,
        footprint: raw.footprint,
        blocksMove: raw.blocksMove,
        blocksSight: raw.blocksSight,
        cover: raw.cover as PropCover,
        decorative: raw.decorative,
        overheadLift: raw.overheadLift ?? 0,
        note: raw.note,
      };
      out.set(`${area}.${raw.name}`, def);
    }
  }
  return out;
}

export const PROPS: Map<string, PropDef> = build();

export function propDef(area: PropArea, name: string): PropDef {
  const def = PROPS.get(`${area}.${name}`);
  if (!def) throw new Error(`unknown prop ${area}.${name}`);
  return def;
}

export function propsForArea(area: PropArea): PropDef[] {
  return [...PROPS.values()].filter((p) => p.area === area);
}

/**
 * Sprite origin for a prop. Horizontally centred; vertically placed so the
 * ground-contact row lands on the prop's world y. Both components resolve to
 * whole pixels for the measured sizes, so nothing renders at a half pixel.
 */
export function propOrigin(def: PropDef): { x: number; y: number } {
  return { x: 0.5, y: (def.height - def.feetInset) / def.height };
}

/**
 * World y a prop's sprite is placed at: its anchor, raised by `overheadLift` for
 * overhead props. Always a whole pixel.
 */
export function propDrawY(def: PropDef, anchorY: number): number {
  return Math.round(anchorY) - def.overheadLift;
}

/** Fixed depth, or null when the prop should be y-sorted with characters. */
export function propFixedDepth(def: PropDef): number | null {
  if (def.depth === 'ground') return PROP_DEPTH.ground;
  if (def.depth === 'front') return PROP_DEPTH.front;
  return null;
}
