/**
 * Shaded-cobblestone boundary selection — Phase B.2-05C-2.
 *
 * DELIBERATELY PHASER-FREE. This module decides which approved atlas tile
 * belongs on which ground cell and nothing else: no texture, no display object,
 * no scene, no actor. That is what makes every rule below directly unit
 * testable, and it is why the selection can be computed once during map
 * construction rather than re-derived per frame.
 *
 * IT IS PURELY VISUAL. Nothing here reads or writes `shadowZones`, concealment,
 * suspicion, vision or collision. The engine's `shadowZones` layer remains the
 * sole authority for whether the player is concealed; this module only decides
 * whether a cobblestone tile is *drawn* with the daylight or the sheltered
 * artwork, and which approved transition tile sits on the boundary between
 * them. A tile can be drawn shaded and confer no concealment, or confer
 * concealment and be drawn in daylight, without contradiction - they are two
 * different authored datasets and must not be derived from one another.
 *
 * Atlas layouts come from the approved B.2-05A-2 package:
 *
 *   cardinal transitions   128x128, 8x8 of 16px tiles = 64
 *                          index = sourceVariant * 16 + boundaryMask
 *   diagonal corner overlays  128x32, 8x2 of 16px tiles = 16
 *                          index = sourceVariant * 4 + cornerIndex
 */

/** Approved paving variants, shared by the daylight and shaded strips. */
export const COBBLE_VARIANT_COUNT = 4;

/** Cardinal neighbour bits, as specified by the approved contract. */
export const NEIGHBOUR_BIT = {
  north: 1,
  east: 2,
  south: 4,
  west: 8,
} as const;

export const CARDINAL_MASK_COUNT = 16;

/** Corner order within each variant's overlay block. */
export const CORNER = {
  northwest: 0,
  northeast: 1,
  southeast: 2,
  southwest: 3,
} as const;

export type Corner = keyof typeof CORNER;
export const CORNER_COUNT = 4;

/**
 * How a ground cell reads VISUALLY. `other` covers everything the approved
 * package has no art for - grass, brick, gravel, garage plate, void fill, a
 * wall, and anything off the edge of the map.
 *
 * Only `cobbleDaylight` may set a neighbour bit. A wall, a grass tile, a void
 * or an industrial floor adjacent to shaded cobble leaves its bit CLEAR, so the
 * boundary art is drawn only where daylight cobble genuinely abuts shade. That
 * is the "neighbour eligibility" rule, and it is why an unsupported material
 * next to a shaded tile produces a plain shaded tile rather than a transition
 * that implies paving which is not there.
 */
export type GroundClass = 'cobbleDaylight' | 'cobbleShaded' | 'other';

/**
 * Read-only view of the authored ground. Supplied by whatever owns the map, so
 * this module never needs to know how the data is stored.
 *
 * `classify` must return `'other'` for out-of-bounds coordinates; the helpers
 * below rely on that rather than carrying their own bounds logic.
 */
export interface GroundReader {
  classify(tx: number, ty: number): GroundClass;
  /** Authored paving variant, 0..COBBLE_VARIANT_COUNT-1. */
  variant(tx: number, ty: number): number;
}

const CARDINALS: { bit: number; dx: number; dy: number }[] = [
  { bit: NEIGHBOUR_BIT.north, dx: 0, dy: -1 },
  { bit: NEIGHBOUR_BIT.east, dx: 1, dy: 0 },
  { bit: NEIGHBOUR_BIT.south, dx: 0, dy: 1 },
  { bit: NEIGHBOUR_BIT.west, dx: -1, dy: 0 },
];

/**
 * The two cardinal neighbours that bound each corner, plus the diagonal itself.
 * A corner overlay is only correct when the two cardinals are shaded and the
 * diagonal is daylight - otherwise the corner is already described by the
 * cardinal transition tile and adding the overlay would double-draw it.
 */
const CORNER_GEOMETRY: Record<
  Corner,
  { diagonal: [number, number]; cardinals: [[number, number], [number, number]] }
> = {
  northwest: { diagonal: [-1, -1], cardinals: [[0, -1], [-1, 0]] },
  northeast: { diagonal: [1, -1], cardinals: [[0, -1], [1, 0]] },
  southeast: { diagonal: [1, 1], cardinals: [[0, 1], [1, 0]] },
  southwest: { diagonal: [-1, 1], cardinals: [[0, 1], [-1, 0]] },
};

export const CORNER_ORDER: Corner[] = ['northwest', 'northeast', 'southeast', 'southwest'];

/**
 * Cardinal boundary mask for a shaded cobblestone cell.
 *
 * A bit is set when, and only when, the neighbour in that direction is
 * DAYLIGHT COBBLESTONE. Returns 0 for a cell that is not itself shaded
 * cobblestone, because the mask is meaningless there.
 */
export function cardinalMask(read: GroundReader, tx: number, ty: number): number {
  if (read.classify(tx, ty) !== 'cobbleShaded') return 0;
  let mask = 0;
  for (const c of CARDINALS) {
    if (read.classify(tx + c.dx, ty + c.dy) === 'cobbleDaylight') mask |= c.bit;
  }
  return mask;
}

/**
 * The corner overlays that apply to a shaded cobblestone cell.
 *
 * All three conditions from the approved contract must hold, per corner:
 *   1. the centre is shaded cobblestone
 *   2. BOTH cardinal neighbours adjoining that corner are shaded cobblestone
 *   3. the diagonal neighbour is daylight cobblestone
 *
 * Several corners may qualify on one cell, and each is an independent overlay.
 * Mere existence of a diagonal neighbour is never sufficient.
 */
export function diagonalCorners(read: GroundReader, tx: number, ty: number): Corner[] {
  if (read.classify(tx, ty) !== 'cobbleShaded') return [];
  const out: Corner[] = [];
  for (const corner of CORNER_ORDER) {
    const g = CORNER_GEOMETRY[corner];
    const [dx, dy] = g.diagonal;
    if (read.classify(tx + dx, ty + dy) !== 'cobbleDaylight') continue;
    const bothCardinalsShaded = g.cardinals.every(
      ([cx, cy]) => read.classify(tx + cx, ty + cy) === 'cobbleShaded'
    );
    if (!bothCardinalsShaded) continue;
    out.push(corner);
  }
  return out;
}

/** `sourceVariant * 16 + boundaryMask`, bounds-checked. */
export function cardinalAtlasIndex(variant: number, mask: number): number {
  if (!Number.isInteger(variant) || variant < 0 || variant >= COBBLE_VARIANT_COUNT)
    throw new RangeError(`paving variant out of range: ${variant}`);
  if (!Number.isInteger(mask) || mask < 0 || mask >= CARDINAL_MASK_COUNT)
    throw new RangeError(`boundary mask out of range: ${mask}`);
  return variant * CARDINAL_MASK_COUNT + mask;
}

/** `sourceVariant * 4 + cornerIndex`, bounds-checked. */
export function diagonalAtlasIndex(variant: number, corner: Corner): number {
  if (!Number.isInteger(variant) || variant < 0 || variant >= COBBLE_VARIANT_COUNT)
    throw new RangeError(`paving variant out of range: ${variant}`);
  return variant * CORNER_COUNT + CORNER[corner];
}

/**
 * Everything to draw on one ground cell, or `null` for a cell this system does
 * not own.
 *
 * `base` names which registered texture the cell's main tile comes from, so the
 * caller never has to re-derive it:
 *
 *   'daylight'  the approved B.2-03A strip, frame = variant
 *   'shaded'    the approved B.2-05A-1 strip, frame = variant. Used when the
 *               cell is shaded and no cardinal neighbour is daylight cobble,
 *               i.e. mask 0, which the contract requires to be pixel-identical
 *               to this tile anyway - drawing the plain strip there keeps the
 *               interior of a shaded region off the transition atlas entirely.
 *   'boundary'  the approved B.2-05A-2 cardinal atlas, frame = cardinalIndex
 */
export interface GroundCell {
  tx: number;
  ty: number;
  variant: number;
  base: 'daylight' | 'shaded' | 'boundary';
  /** Frame index within whichever atlas `base` names. */
  frame: number;
  /** Cardinal mask; 0 for daylight cells. */
  mask: number;
  /** Independent corner overlays, each already resolved to an atlas frame. */
  overlays: { corner: Corner; frame: number }[];
}

export function composeCell(read: GroundReader, tx: number, ty: number): GroundCell | null {
  const klass = read.classify(tx, ty);
  if (klass === 'other') return null;
  const variant = read.variant(tx, ty);
  if (!Number.isInteger(variant) || variant < 0 || variant >= COBBLE_VARIANT_COUNT)
    throw new RangeError(`paving variant out of range at ${tx},${ty}: ${variant}`);

  if (klass === 'cobbleDaylight') {
    return { tx, ty, variant, base: 'daylight', frame: variant, mask: 0, overlays: [] };
  }

  const mask = cardinalMask(read, tx, ty);
  const overlays = diagonalCorners(read, tx, ty).map((corner) => ({
    corner,
    frame: diagonalAtlasIndex(variant, corner),
  }));
  if (mask === 0) {
    return { tx, ty, variant, base: 'shaded', frame: variant, mask: 0, overlays };
  }
  return {
    tx,
    ty,
    variant,
    base: 'boundary',
    frame: cardinalAtlasIndex(variant, mask),
    mask,
    overlays,
  };
}

/**
 * Composes a rectangular region once, in authored order.
 *
 * Returned in row-major order so a caller can write it straight into a tilemap
 * layer. Cells this system does not own are omitted rather than returned as
 * nulls, so the caller cannot accidentally paint over grass.
 */
export function composeRegion(
  read: GroundReader,
  region: { x: number; y: number; w: number; h: number }
): GroundCell[] {
  const out: GroundCell[] = [];
  for (let ty = region.y; ty < region.y + region.h; ty++) {
    for (let tx = region.x; tx < region.x + region.w; tx++) {
      const cell = composeCell(read, tx, ty);
      if (cell) out.push(cell);
    }
  }
  return out;
}

/** Counts, for the performance budget in the integration report. */
export interface GroundComposition {
  cells: GroundCell[];
  daylightCells: number;
  shadedInteriorCells: number;
  boundaryCells: number;
  overlayCells: number;
  overlayTotal: number;
}

export function summarise(cells: GroundCell[]): GroundComposition {
  let daylightCells = 0;
  let shadedInteriorCells = 0;
  let boundaryCells = 0;
  let overlayCells = 0;
  let overlayTotal = 0;
  for (const c of cells) {
    if (c.base === 'daylight') daylightCells++;
    else if (c.base === 'shaded') shadedInteriorCells++;
    else boundaryCells++;
    if (c.overlays.length) {
      overlayCells++;
      overlayTotal += c.overlays.length;
    }
  }
  return { cells, daylightCells, shadedInteriorCells, boundaryCells, overlayCells, overlayTotal };
}
