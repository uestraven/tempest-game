/**
 * Bitmap text drawn from the supplied 5x7 pixel font.
 *
 * `ui/font_5x7_in_8x8_cells.png` is 128x32: 16 columns x 4 rows of 8x8 cells,
 * with the 5x7 glyph inset at (1, 0) inside each cell (measured with
 * tools/inspect-assets.py; cell 0 is empty, matching ' ' at charset index 0).
 *
 * Glyphs are blitted at 1:1 with no scaling and recoloured with a `source-in`
 * composite, so text stays exactly as crisp as the world art. No browser font
 * rendering is used anywhere in game.
 */

import Phaser from 'phaser';
import { textureKey } from '../art/AssetRegistry';
import {
  FONT_ADVANCE,
  FONT_CELL,
  FONT_COLUMNS,
  GLYPH_HEIGHT,
  GLYPH_INSET_X,
  GLYPH_INSET_Y,
  GLYPH_WIDTH,
  FONT_LINE_HEIGHT,
  glyphIndex,
  measure,
  normalise,
} from './font-data';

export * from './font-data';

let counter = 0;

export interface PixelTextOptions {
  color?: number;
  depth?: number;
  align?: 'left' | 'center' | 'right';
  scrollFactor?: number;
}

/** A single- or multi-line run of bitmap text backed by one canvas texture. */
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
    this.image.setOrigin(this.originX(), 0);
    this.setText(text);
  }

  private originX(): number {
    return this.opts.align === 'center' ? 0.5 : this.opts.align === 'right' ? 1 : 0;
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

    const fontKey = textureKey.ui('font');
    if (!this.scene.textures.exists(fontKey)) return;
    const source = this.scene.textures.get(fontKey).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;

    const lines = normalise(text).split('\n');
    const size = measure(text);

    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    const tex = this.scene.textures.createCanvas(this.key, size.width, size.height);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size.width, size.height);

    lines.forEach((line, lineIndex) => {
      [...line].forEach((char, charIndex) => {
        const index = glyphIndex(char);
        if (index <= 0) return; // -1 unsupported, 0 is the blank space cell
        const sx = (index % FONT_COLUMNS) * FONT_CELL + GLYPH_INSET_X;
        const sy = Math.floor(index / FONT_COLUMNS) * FONT_CELL + GLYPH_INSET_Y;
        ctx.drawImage(
          source,
          sx,
          sy,
          GLYPH_WIDTH,
          GLYPH_HEIGHT,
          charIndex * FONT_ADVANCE,
          lineIndex * FONT_LINE_HEIGHT,
          GLYPH_WIDTH,
          GLYPH_HEIGHT
        );
      });
    });

    // Recolour: the sheet is a single colour with hard alpha, so source-in
    // repaints exactly the glyph pixels and leaves the edges untouched.
    const r = (this.color >> 16) & 0xff;
    const g = (this.color >> 8) & 0xff;
    const b = this.color & 0xff;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.globalCompositeOperation = 'source-over';

    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image.setTexture(this.key);
    this.image.setOrigin(this.originX(), 0);
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
