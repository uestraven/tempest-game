/**
 * Font geometry and the charset, kept free of Phaser so the glyph mapping can be
 * unit tested against the shipped `ui/font.json`.
 *
 * `ui/font_5x7_in_8x8_cells.png` is 128x32: 16 columns x 4 rows of 8x8 cells,
 * with the 5x7 glyph inset at (1, 0) inside each cell (measured with
 * tools/inspect-assets.py; cell 0 is empty, matching ' ' at charset index 0).
 */

export const FONT_CELL = 8;
export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
/** Glyph inset inside its 8x8 cell. */
export const GLYPH_INSET_X = 1;
export const GLYPH_INSET_Y = 0;
export const FONT_COLUMNS = 16;

/** 1px letter spacing. */
export const FONT_ADVANCE = GLYPH_WIDTH + 1;
export const FONT_HEIGHT = GLYPH_HEIGHT;
export const FONT_LINE_HEIGHT = GLYPH_HEIGHT + 2;

/**
 * Charset from `ui/font.json`, in cell order: index = position in this string.
 * There is no lowercase; `font.json` declares `lowercase_fallback: uppercase`.
 * tests/font.test.ts asserts this matches the shipped font.json exactly.
 */
export const CHARSET = ' !"#%\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]_';

/** Accented characters are folded so authored French-flavoured copy renders. */
const FOLD: Record<string, string> = {
  É: 'E',
  È: 'E',
  Ê: 'E',
  À: 'A',
  Â: 'A',
  Ç: 'C',
  Î: 'I',
  Ï: 'I',
  Ô: 'O',
  Û: 'U',
  Ù: 'U',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
};

const INDEX = new Map<string, number>();
for (let i = 0; i < CHARSET.length; i++) INDEX.set(CHARSET[i], i);

export function glyphIndex(char: string): number {
  return INDEX.get(char) ?? -1;
}

/** Uppercases, folds accents, and replaces anything unsupported with a space. */
export function normalise(text: string): string {
  return [...text.toUpperCase()]
    .map((c) => FOLD[c] ?? c)
    .map((c) => (c === '\n' || INDEX.has(c) ? c : ' '))
    .join('');
}

export function measure(text: string): { width: number; height: number } {
  const lines = normalise(text).split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return {
    width: Math.max(1, longest * FONT_ADVANCE - 1),
    height: lines.length * FONT_LINE_HEIGHT - (FONT_LINE_HEIGHT - FONT_HEIGHT),
  };
}

