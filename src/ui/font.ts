/**
 * A 3x5 bitmap font drawn into canvas textures at its true pixel size.
 *
 * The HUD must stay as crisp as the world art, so no browser font rendering is
 * used anywhere in game: every glyph below is literal pixels.
 */

import Phaser from 'phaser';

const GLYPH_W = 3;
const GLYPH_H = 5;
export const FONT_ADVANCE = GLYPH_W + 1;
export const FONT_HEIGHT = GLYPH_H;
export const FONT_LINE_HEIGHT = GLYPH_H + 3;

// Each glyph is five rows of three pixels, '#' on and '.' off.
const GLYPHS: Record<string, string> = {
  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.##',
  K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#',
  N: '##./#.#/#.#/#.#/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/###/..#',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/.##',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',
  '0': '.#./#.#/#.#/#.#/.#.',
  '1': '.#./##./.#./.#./###',
  '2': '##./..#/.#./#../###',
  '3': '##./..#/.#./..#/##.',
  '4': '#.#/#.#/###/..#/..#',
  '5': '###/#../##./..#/##.',
  '6': '.##/#../###/#.#/###',
  '7': '###/..#/.#./.#./.#.',
  '8': '###/#.#/###/#.#/###',
  '9': '###/#.#/###/..#/##.',
  ' ': '.../.../.../.../...',
  '.': '.../.../.../.../.#.',
  ',': '.../.../.../.#./#..',
  "'": '.#./.#./.../.../...',
  '"': '#.#/#.#/.../.../...',
  '!': '.#./.#./.#./.../.#.',
  '?': '##./..#/.#./.../.#.',
  '-': '.../.../###/.../...',
  ':': '.../.#./.../.#./...',
  '/': '..#/..#/.#./#../#..',
  '%': '#.#/..#/.#./#../#.#',
  '(': '.#./#../#../#../.#.',
  ')': '.#./..#/..#/..#/.#.',
  '+': '.../.#./###/.#./...',
  '=': '.../###/.../###/...',
  '<': '..#/.#./#../.#./..#',
  '>': '#../.#./..#/.#./#..',
};

/** Accented characters are folded so authored French-flavoured copy still renders. */
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

export function normalise(text: string): string {
  return [...text.toUpperCase()]
    .map((c) => FOLD[c] ?? c)
    .map((c) => (GLYPHS[c] ? c : ' '))
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

let counter = 0;

export interface PixelTextOptions {
  color?: number;
  depth?: number;
  /** 'left' | 'center' | 'right' - affects the image origin only. */
  align?: 'left' | 'center' | 'right';
  scrollFactor?: number;
}

/** A single-line or multi-line run of bitmap text backed by one canvas texture. */
export class PixelText {
  readonly image: Phaser.GameObjects.Image;
  private readonly key: string;
  private current = '\u0000';
  private color: number;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private readonly opts: PixelTextOptions = {}
  ) {
    this.key = `pixeltext_${counter++}`;
    this.color = opts.color ?? 0xe8e2d4;
    this.image = scene.add.image(Math.round(x), Math.round(y), '__DEFAULT');
    this.image.setDepth(opts.depth ?? 100);
    this.image.setScrollFactor(opts.scrollFactor ?? 0);
    const originX = opts.align === 'center' ? 0.5 : opts.align === 'right' ? 1 : 0;
    this.image.setOrigin(originX, 0);
    this.setText(text);
  }

  setColor(color: number): void {
    if (color === this.color) return;
    this.color = color;
    const text = this.current;
    this.current = '\u0000';
    this.setText(text);
  }

  setText(text: string): void {
    if (text === this.current) return;
    this.current = text;
    const normalised = normalise(text);
    const lines = normalised.split('\n');
    const size = measure(normalised);

    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    const tex = this.scene.textures.createCanvas(this.key, size.width, size.height);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    const r = (this.color >> 16) & 0xff;
    const g = (this.color >> 8) & 0xff;
    const b = this.color & 0xff;
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    lines.forEach((line, lineIndex) => {
      [...line].forEach((char, charIndex) => {
        const glyph = GLYPHS[char];
        if (!glyph) return;
        glyph.split('/').forEach((row, ry) => {
          [...row].forEach((pixel, rx) => {
            if (pixel !== '#') return;
            ctx.fillRect(
              charIndex * FONT_ADVANCE + rx,
              lineIndex * FONT_LINE_HEIGHT + ry,
              1,
              1
            );
          });
        });
      });
    });
    tex.refresh();
    this.image.setTexture(this.key);
    const originX = this.opts.align === 'center' ? 0.5 : this.opts.align === 'right' ? 1 : 0;
    this.image.setOrigin(originX, 0);
  }

  setPosition(x: number, y: number): void {
    this.image.setPosition(Math.round(x), Math.round(y));
  }

  setVisible(visible: boolean): void {
    this.image.setVisible(visible);
  }

  get width(): number {
    return this.image.width;
  }

  get height(): number {
    return this.image.height;
  }

  destroy(): void {
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
