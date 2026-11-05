import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARDINAL_MASK_COUNT,
  COBBLE_VARIANT_COUNT,
  CORNER,
  CORNER_ORDER,
  NEIGHBOUR_BIT,
  cardinalAtlasIndex,
  cardinalMask,
  composeCell,
  composeRegion,
  diagonalAtlasIndex,
  diagonalCorners,
  summarise,
  type Corner,
  type GroundClass,
  type GroundReader,
} from '../src/art/GroundShade';

/**
 * Phase B.2-05C-2 - shaded-cobblestone boundary selection.
 *
 * These exercise the selection rules exhaustively, which is possible precisely
 * because the module is Phaser-free: all 16 cardinal masks, every corner under
 * every combination of its three conditions, map-edge behaviour, variant
 * preservation, and the refusal to touch unsupported materials.
 *
 * They do NOT claim the artwork renders - the approved B.2-05A-1 and B.2-05A-2
 * files are not in the repository, so no texture is registered and no engine
 * capture exists. See docs/art-integration/valcendre-b205c2.md.
 */

/** Builds a reader from an ASCII picture, so each case is readable. */
const KEY: Record<string, GroundClass> = {
  '.': 'cobbleDaylight',
  '#': 'cobbleShaded',
  ' ': 'other',
  g: 'other', // grass
  b: 'other', // brick
  w: 'other', // wall
};

function grid(rows: string[], variants?: number[][]): GroundReader & { w: number; h: number } {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return {
    w,
    h,
    classify(tx, ty) {
      if (ty < 0 || ty >= h || tx < 0 || tx >= w) return 'other';
      const ch = rows[ty][tx] ?? ' ';
      const k = KEY[ch];
      if (k === undefined) throw new Error(`unknown grid char "${ch}"`);
      return k;
    },
    variant(tx, ty) {
      return variants?.[ty]?.[tx] ?? 0;
    },
  };
}

// =====================================================================
// 1. atlas index arithmetic
// =====================================================================
describe('1. atlas indexing matches the approved contract', () => {
  it('uses sourceVariant * 16 + boundaryMask for the cardinal atlas', () => {
    expect(cardinalAtlasIndex(0, 0)).toBe(0);
    expect(cardinalAtlasIndex(0, 15)).toBe(15);
    expect(cardinalAtlasIndex(1, 0)).toBe(16);
    expect(cardinalAtlasIndex(3, 15)).toBe(63);
    // The 8x8 atlas holds exactly 4 variants x 16 masks.
    expect(COBBLE_VARIANT_COUNT * CARDINAL_MASK_COUNT).toBe(64);
  });

  it('uses sourceVariant * 4 + cornerIndex for the overlay atlas', () => {
    expect(diagonalAtlasIndex(0, 'northwest')).toBe(0);
    expect(diagonalAtlasIndex(0, 'northeast')).toBe(1);
    expect(diagonalAtlasIndex(0, 'southeast')).toBe(2);
    expect(diagonalAtlasIndex(0, 'southwest')).toBe(3);
    expect(diagonalAtlasIndex(3, 'southwest')).toBe(15);
    expect(COBBLE_VARIANT_COUNT * 4).toBe(16);
  });

  it('declares the contract bit assignment', () => {
    expect(NEIGHBOUR_BIT).toEqual({ north: 1, east: 2, south: 4, west: 8 });
    expect(CORNER).toEqual({ northwest: 0, northeast: 1, southeast: 2, southwest: 3 });
    expect(CORNER_ORDER).toEqual(['northwest', 'northeast', 'southeast', 'southwest']);
  });

  it('refuses an out-of-range variant or mask rather than wrapping', () => {
    expect(() => cardinalAtlasIndex(4, 0)).toThrow(RangeError);
    expect(() => cardinalAtlasIndex(-1, 0)).toThrow(RangeError);
    expect(() => cardinalAtlasIndex(0, 16)).toThrow(RangeError);
    expect(() => cardinalAtlasIndex(0, -1)).toThrow(RangeError);
    expect(() => cardinalAtlasIndex(1.5, 0)).toThrow(RangeError);
    expect(() => diagonalAtlasIndex(4, 'northwest')).toThrow(RangeError);
  });
});

// =====================================================================
// 2. all sixteen cardinal masks
// =====================================================================
describe('2. every cardinal mask is produced by the right neighbourhood', () => {
  /** Centre shaded at (1,1); each cardinal is daylight iff its bit is set. */
  const build = (mask: number) => {
    const n = mask & NEIGHBOUR_BIT.north ? '.' : '#';
    const e = mask & NEIGHBOUR_BIT.east ? '.' : '#';
    const s = mask & NEIGHBOUR_BIT.south ? '.' : '#';
    const w = mask & NEIGHBOUR_BIT.west ? '.' : '#';
    return grid([`#${n}#`, `${w}#${e}`, `#${s}#`]);
  };

  it('returns each of the 16 masks exactly', () => {
    for (let mask = 0; mask < CARDINAL_MASK_COUNT; mask++) {
      expect(cardinalMask(build(mask), 1, 1), `mask ${mask}`).toBe(mask);
    }
  });

  it("matches the contract's worked examples", () => {
    expect(cardinalMask(build(0), 1, 1), 'all shaded').toBe(0);
    expect(cardinalMask(build(1), 1, 1), 'north daylight').toBe(1);
    expect(cardinalMask(build(2), 1, 1), 'east daylight').toBe(2);
    expect(cardinalMask(build(3), 1, 1), 'north and east daylight').toBe(3);
    expect(cardinalMask(build(15), 1, 1), 'daylight on all four sides').toBe(15);
  });

  it('maps each single-bit mask to the direction the contract names', () => {
    // Literal values on purpose: asserting against NEIGHBOUR_BIT here would be
    // self-consistent under a swapped bit assignment and catch nothing.
    expect(cardinalMask(grid(['#.#', '###', '###']), 1, 1), 'north daylight -> 1').toBe(1);
    expect(cardinalMask(grid(['###', '##.', '###']), 1, 1), 'east daylight -> 2').toBe(2);
    expect(cardinalMask(grid(['###', '###', '#.#']), 1, 1), 'south daylight -> 4').toBe(4);
    expect(cardinalMask(grid(['###', '.##', '###']), 1, 1), 'west daylight -> 8').toBe(8);
    // And a two-bit combination, so a pair of swapped bits cannot cancel out.
    expect(cardinalMask(grid(['#.#', '##.', '###']), 1, 1), 'north+east -> 3').toBe(3);
    expect(cardinalMask(grid(['###', '.#.', '###']), 1, 1), 'east+west -> 10').toBe(10);
  });

  it('is 0 for a cell that is not shaded cobblestone', () => {
    // A daylight centre surrounded by daylight: the mask is meaningless.
    expect(cardinalMask(grid(['...', '...', '...']), 1, 1)).toBe(0);
    // And for an unsupported material.
    expect(cardinalMask(grid(['...', '.g.', '...']), 1, 1)).toBe(0);
  });
});

// =====================================================================
// 3. neighbour eligibility
// =====================================================================
describe('3. only real daylight cobblestone sets a bit', () => {
  it('ignores walls, grass, brick and void', () => {
    for (const ch of [' ', 'g', 'b', 'w']) {
      const g = grid([`#${ch}#`, `${ch}#${ch}`, `#${ch}#`]);
      expect(cardinalMask(g, 1, 1), `neighbour "${ch}"`).toBe(0);
    }
  });

  it('ignores shaded cobblestone neighbours', () => {
    expect(cardinalMask(grid(['###', '###', '###']), 1, 1)).toBe(0);
  });

  it('counts only the daylight sides when materials are mixed', () => {
    // north daylight, east grass, south daylight, west wall
    const g = grid(['#.#', 'w#g', '#.#']);
    expect(cardinalMask(g, 1, 1)).toBe(NEIGHBOUR_BIT.north | NEIGHBOUR_BIT.south);
  });
});

// =====================================================================
// 4. map edges
// =====================================================================
describe('4. map edges are treated as unsupported, not as daylight', () => {
  it('leaves bits clear for every out-of-bounds neighbour', () => {
    const g = grid(['#']);
    expect(g.classify(-1, 0)).toBe('other');
    expect(g.classify(0, -1)).toBe('other');
    expect(g.classify(1, 0)).toBe('other');
    expect(g.classify(0, 1)).toBe('other');
    expect(cardinalMask(g, 0, 0), 'single shaded tile alone on the map').toBe(0);
  });

  it('sets only the in-bounds daylight side at a corner of the map', () => {
    // Shaded at (0,0); daylight to the east, nothing north or west.
    const g = grid(['#.', '##']);
    expect(cardinalMask(g, 0, 0)).toBe(NEIGHBOUR_BIT.east);
  });

  it('never emits an overlay that depends on an off-map diagonal', () => {
    const g = grid(['##', '##']);
    expect(diagonalCorners(g, 0, 0)).toEqual([]);
  });
});

// =====================================================================
// 5. diagonal corner overlays
// =====================================================================
describe('5. diagonal overlays apply only under all three conditions', () => {
  /**
   * Centre (1,1) shaded. Each corner case is written out in full so the
   * condition under test is visible rather than computed.
   */
  it('applies a corner when both cardinals are shaded and the diagonal is daylight', () => {
    // NW diagonal daylight, N and W shaded.
    expect(diagonalCorners(grid(['.##', '###', '###']), 1, 1)).toEqual(['northwest']);
    expect(diagonalCorners(grid(['##.', '###', '###']), 1, 1)).toEqual(['northeast']);
    expect(diagonalCorners(grid(['###', '###', '##.']), 1, 1)).toEqual(['southeast']);
    expect(diagonalCorners(grid(['###', '###', '.##']), 1, 1)).toEqual(['southwest']);
  });

  it('does NOT apply a corner merely because a diagonal neighbour exists', () => {
    // NW diagonal is daylight but the north cardinal is ALSO daylight, so the
    // cardinal transition already describes that edge.
    expect(diagonalCorners(grid(['..#', '###', '###']), 1, 1)).toEqual([]);
    // ... and likewise when the west cardinal is daylight.
    expect(diagonalCorners(grid(['.##', '.##', '###']), 1, 1)).toEqual([]);
  });

  it('does not apply a corner when the diagonal is shaded or unsupported', () => {
    expect(diagonalCorners(grid(['###', '###', '###']), 1, 1)).toEqual([]);
    for (const ch of ['g', 'b', 'w', ' ']) {
      expect(diagonalCorners(grid([`${ch}##`, '###', '###']), 1, 1), `diagonal "${ch}"`).toEqual([]);
    }
  });

  it('requires BOTH adjoining cardinals, not either', () => {
    // NW daylight diagonal, north shaded, west grass -> not eligible.
    expect(diagonalCorners(grid(['.##', 'g##', '###']), 1, 1)).toEqual([]);
    // NW daylight diagonal, north grass, west shaded -> not eligible.
    expect(diagonalCorners(grid(['.g#', '###', '###']), 1, 1)).toEqual([]);
  });

  it('emits several independent overlays on one cell', () => {
    // All four diagonals daylight, all four cardinals shaded: a daylight
    // island touching the cell only at its corners.
    const g = grid(['.#.', '###', '.#.']);
    expect(diagonalCorners(g, 1, 1)).toEqual(['northwest', 'northeast', 'southeast', 'southwest']);
  });

  it('emits nothing for a cell that is not shaded cobblestone', () => {
    expect(diagonalCorners(grid(['...', '...', '...']), 1, 1)).toEqual([]);
    expect(diagonalCorners(grid(['.##', '#g#', '###']), 1, 1)).toEqual([]);
  });

  it('exercises every corner under every one of its eight condition patterns', () => {
    const geom: Record<Corner, { d: [number, number]; c: [[number, number], [number, number]] }> = {
      northwest: { d: [-1, -1], c: [[0, -1], [-1, 0]] },
      northeast: { d: [1, -1], c: [[0, -1], [1, 0]] },
      southeast: { d: [1, 1], c: [[0, 1], [1, 0]] },
      southwest: { d: [-1, 1], c: [[0, 1], [-1, 0]] },
    };
    for (const corner of CORNER_ORDER) {
      const g = geom[corner];
      for (let bits = 0; bits < 8; bits++) {
        const diagonalDaylight = Boolean(bits & 1);
        const firstShaded = Boolean(bits & 2);
        const secondShaded = Boolean(bits & 4);
        const rows = ['###', '###', '###'].map((r) => r.split(''));
        const put = (dx: number, dy: number, ch: string) => {
          rows[1 + dy][1 + dx] = ch;
        };
        put(g.d[0], g.d[1], diagonalDaylight ? '.' : 'g');
        put(g.c[0][0], g.c[0][1], firstShaded ? '#' : 'g');
        put(g.c[1][0], g.c[1][1], secondShaded ? '#' : 'g');
        const got = diagonalCorners(
          grid(rows.map((r) => r.join(''))),
          1,
          1
        );
        const expected = diagonalDaylight && firstShaded && secondShaded ? [corner] : [];
        expect(got, `${corner} bits=${bits}`).toEqual(expected);
      }
    }
  });
});

// =====================================================================
// 6. composition, variant preservation, mask-0 routing
// =====================================================================
describe('6. cell composition preserves the authored variant', () => {
  const variants = [
    [0, 1, 2],
    [3, 2, 1],
    [1, 0, 3],
  ];

  it('keeps each cell on its own source variant', () => {
    const g = grid(['###', '###', '###'], variants);
    for (let ty = 0; ty < 3; ty++)
      for (let tx = 0; tx < 3; tx++)
        expect(composeCell(g, tx, ty)?.variant, `${tx},${ty}`).toBe(variants[ty][tx]);
  });

  it('routes a shaded interior cell to the plain shaded strip, not the atlas', () => {
    const g = grid(['###', '###', '###'], variants);
    const cell = composeCell(g, 1, 1)!;
    expect(cell.base).toBe('shaded');
    expect(cell.mask).toBe(0);
    // Frame is the variant itself, so mask 0 cannot disagree with the approved
    // B.2-05A-1 tile: it IS that tile.
    expect(cell.frame).toBe(variants[1][1]);
  });

  it('routes a daylight cell to the daylight strip on its own variant', () => {
    const g = grid(['...', '...', '...'], variants);
    const cell = composeCell(g, 2, 0)!;
    expect(cell.base).toBe('daylight');
    expect(cell.frame).toBe(2);
    expect(cell.mask).toBe(0);
    expect(cell.overlays).toEqual([]);
  });

  it('routes a boundary cell to the cardinal atlas at variant * 16 + mask', () => {
    const g = grid(['#.#', '###', '###'], variants);
    const cell = composeCell(g, 1, 1)!;
    expect(cell.base).toBe('boundary');
    expect(cell.mask).toBe(NEIGHBOUR_BIT.north);
    expect(cell.frame).toBe(cardinalAtlasIndex(variants[1][1], NEIGHBOUR_BIT.north));
  });

  it('returns null for an unsupported material so it is never painted', () => {
    const g = grid(['ggg', 'gbg', 'ggg']);
    for (let ty = 0; ty < 3; ty++)
      for (let tx = 0; tx < 3; tx++) expect(composeCell(g, tx, ty), `${tx},${ty}`).toBeNull();
  });

  it('resolves overlay frames on the centre cell’s variant, not the diagonal’s', () => {
    const vs = [
      [9, 9, 9],
      [9, 2, 9],
      [9, 9, 9],
    ];
    const g = grid(['.##', '###', '###'], vs);
    const cell = composeCell(g, 1, 1)!;
    expect(cell.overlays).toEqual([
      { corner: 'northwest', frame: diagonalAtlasIndex(2, 'northwest') },
    ]);
  });

  it('rejects an out-of-range authored variant instead of drawing the wrong tile', () => {
    const g = grid(['###'], [[0, 4, 0]]);
    expect(() => composeCell(g, 1, 0)).toThrow(RangeError);
  });
});

// =====================================================================
// 7. regions, determinism, and the performance counters
// =====================================================================
describe('7. region composition is deterministic and omits foreign material', () => {
  /**
   * A 5x5 block of shade with a one-tile DAYLIGHT ISLAND at its centre, set
   * inside a daylight border, with one brick tile north and a grass row south.
   * This is the hardest authored case in section 10 and it exercises the
   * eligibility rule twice: the brick tile and the grass row both sit cardinal
   * to shaded cobble and must leave their bits clear.
   */
  const rows = [
    '..b....',
    '.#####.',
    '.#####.',
    '.##.##.',
    '.#####.',
    '.#####.',
    'ggggggg',
  ];
  const REGION = { x: 0, y: 0, w: 7, h: 7 };

  it('produces the same result every time it runs', () => {
    const a = composeRegion(grid(rows), REGION);
    const b = composeRegion(grid(rows), REGION);
    expect(a).toEqual(b);
  });

  it('omits every non-cobblestone cell', () => {
    const cells = composeRegion(grid(rows), REGION);
    // 49 cells, minus one brick and a seven-tile grass row.
    expect(cells.length).toBe(49 - 1 - 7);
    for (const c of cells) expect(rows[c.ty][c.tx]).not.toMatch(/[gb ]/);
  });

  it('counts the boundary and overlay work for the performance budget', () => {
    const s = summarise(composeRegion(grid(rows), REGION));
    expect(s.daylightCells + s.shadedInteriorCells + s.boundaryCells).toBe(s.cells.length);
    expect(s.daylightCells, 'daylight cells').toBe(17);
    expect(s.shadedInteriorCells, 'plain shaded cells (mask 0)').toBe(8);
    expect(s.boundaryCells, 'cells needing the cardinal atlas').toBe(16);
    // Exactly the four inner-ring corners take an overlay, one each.
    expect(s.overlayCells, 'cells needing an overlay').toBe(4);
    expect(s.overlayTotal, 'overlays drawn in total').toBe(4);
  });

  it('resolves the daylight island exactly', () => {
    const g = grid(rows);
    // The island's four cardinal ring neighbours carry a single-bit mask
    // pointing at the island.
    expect(cardinalMask(g, 3, 2), 'north of the island sees daylight south -> 4').toBe(4);
    expect(cardinalMask(g, 2, 3), 'west of the island sees daylight east -> 2').toBe(2);
    expect(cardinalMask(g, 4, 3), 'east of the island sees daylight west -> 8').toBe(8);
    expect(cardinalMask(g, 3, 4), 'south of the island sees daylight north -> 1').toBe(1);
    // The four ring corners take one overlay each, pointing inward, and carry
    // mask 0 because all four of their own cardinals are shaded.
    expect(diagonalCorners(g, 2, 2)).toEqual(['southeast']);
    expect(diagonalCorners(g, 4, 2)).toEqual(['southwest']);
    expect(diagonalCorners(g, 4, 4)).toEqual(['northwest']);
    expect(diagonalCorners(g, 2, 4)).toEqual(['northeast']);
    for (const [x, y] of [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ])
      expect(cardinalMask(g, x, y), `ring corner ${x},${y}`).toBe(0);
  });

  it('leaves bits clear where brick and grass abut shade', () => {
    const g = grid(rows);
    // (2,1) sits directly south of the brick tile; every other cardinal is
    // shaded, so it is a plain shaded cell, not a transition.
    expect(cardinalMask(g, 2, 1)).toBe(0);
    expect(composeCell(g, 2, 1)!.base).toBe('shaded');
    // The bottom shaded row sits on grass and is likewise plain.
    for (const tx of [2, 3, 4])
      expect(cardinalMask(g, tx, 5), `grass-adjacent ${tx},5`).toBe(0);
  });
});

// =====================================================================
// 8. authored boundary shapes from 10
// =====================================================================
describe('8. the authored shapes the brief calls out', () => {
  it('a long straight light-to-shade edge gives one repeated mask', () => {
    const g = grid(['......', '######', '######']);
    for (let tx = 0; tx < 6; tx++)
      expect(cardinalMask(g, tx, 1), `x=${tx}`).toBe(NEIGHBOUR_BIT.north);
    // and no overlays anywhere along it
    for (let tx = 0; tx < 6; tx++) expect(diagonalCorners(g, tx, 1)).toEqual([]);
  });

  it('an L-shaped boundary gives a two-bit mask at the knee', () => {
    const g = grid(['....', '.###', '.###']);
    expect(cardinalMask(g, 1, 1)).toBe(NEIGHBOUR_BIT.north | NEIGHBOUR_BIT.west);
    expect(cardinalMask(g, 2, 1)).toBe(NEIGHBOUR_BIT.north);
    expect(cardinalMask(g, 1, 2)).toBe(NEIGHBOUR_BIT.west);
  });

  it('a T-shaped boundary gives three bits where shade is pinched', () => {
    const g = grid(['.#.', '.#.', '...']);
    expect(cardinalMask(g, 1, 1)).toBe(
      NEIGHBOUR_BIT.east | NEIGHBOUR_BIT.south | NEIGHBOUR_BIT.west
    );
  });

  it('a narrow one-tile passage of shade gives opposing bits, no overlays', () => {
    const g = grid(['.#.', '.#.', '.#.']);
    for (let ty = 0; ty < 3; ty++)
      expect(cardinalMask(g, 1, ty), `y=${ty}`).toBe(NEIGHBOUR_BIT.east | NEIGHBOUR_BIT.west);
    expect(diagonalCorners(g, 1, 1)).toEqual([]);
  });

  it('a stair-stepped boundary never asks for an overlay on a stepped cell', () => {
    const g = grid(['..##', '...#', '....', '####']);
    // The stepped cells each have a daylight cardinal, so the cardinal atlas
    // describes them and no corner overlay is eligible.
    expect(diagonalCorners(g, 2, 0)).toEqual([]);
    expect(diagonalCorners(g, 3, 1)).toEqual([]);
  });

  it('a shaded tile with daylight on all four sides is mask 15 with no overlay', () => {
    const g = grid(['...', '.#.', '...']);
    expect(cardinalMask(g, 1, 1)).toBe(15);
    expect(diagonalCorners(g, 1, 1)).toEqual([]);
    expect(composeCell(g, 1, 1)!.base).toBe('boundary');
  });
});

// =====================================================================
// 9. the module cannot touch gameplay
// =====================================================================
describe('9. selection is independent of stealth and AI', () => {
  it('names no gameplay concept anywhere in the module', () => {
    // Guards the section 4 separation: visual material state and gameplay
    // concealment state are different data and must stay that way.
    const src = readFileSyncUtf8('src/art/GroundShade.ts');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of [
      'shadowZones',
      'suspicion',
      'concealment',
      'conceal',
      'detect',
      'vision',
      'player',
      'enemy',
      'crouch',
      'Phaser',
    ]) {
      expect(code.toLowerCase(), `module references ${forbidden}`).not.toContain(
        forbidden.toLowerCase()
      );
    }
  });

  it('imports nothing at all', () => {
    const src = readFileSyncUtf8('src/art/GroundShade.ts');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});

const ROOT = new URL('..', import.meta.url).pathname;
function readFileSyncUtf8(rel: string): string {
  return readFileSync(`${ROOT}${rel}`, 'utf8');
}
