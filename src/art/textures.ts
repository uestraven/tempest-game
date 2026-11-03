/**
 * Placeholder pixel art, generated deterministically into canvas textures.
 *
 * Everything here is drawn at its true pixel size (16x16 tiles, 24x32 characters)
 * with no scaling or filtering, so it satisfies the pixel-art integrity contract
 * and can be swapped for hand-drawn sheets of the same dimensions without any
 * code change beyond the loader.
 */

import Phaser from 'phaser';
import { COLORS } from '../core/constants';

export const TILE_KEY = 'tiles';
export const PLAYER_KEY = 'player';
export const GUN_KEY = 'gun';

/** Direction row order used by every character sheet. */
export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
export const FRAME_COLS = 3; // idle, step A, step B
export const CHAR_W = 24;
export const CHAR_H = 32;

const css = (hex: number, alpha = 1): string => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
};

const shade = (hex: number, amount: number): number => {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (hex & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
};

/** Deterministic value noise so regenerated art is byte-identical. */
const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

class PixelCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, key: string, width: number, height: number) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.tex = scene.textures.createCanvas(key, width, height)!;
    this.ctx = this.tex.getContext();
    this.ctx.imageSmoothingEnabled = false;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    this.ctx.fillStyle = css(color, alpha);
    this.ctx.fillRect(x, y, w, h);
  }

  set(x: number, y: number, color: number, alpha = 1): void {
    this.rect(x, y, 1, 1, color, alpha);
  }

  /** Slices the canvas into numbered frames so it can drive sprites and animations. */
  addFrames(frameWidth: number, frameHeight: number): void {
    const cols = Math.floor(this.tex.width / frameWidth);
    const rows = Math.floor(this.tex.height / frameHeight);
    let i = 0;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        this.tex.add(i++, 0, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
  }

  commit(): Phaser.Textures.CanvasTexture {
    this.tex.refresh();
    return this.tex;
  }

  get texture(): Phaser.Textures.CanvasTexture {
    return this.tex;
  }
}

// ------------------------------------------------------------------ tile sheet

export function buildTileset(scene: Phaser.Scene): void {
  const n = 16;
  const p = new PixelCanvas(scene, TILE_KEY, n * 16, 16);

  const speckle = (ox: number, base: number, salt: number, strength = 14) => {
    p.rect(ox, 0, 16, 16, base);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = hash(x, y, salt);
        if (v > 0.82) p.set(ox + x, y, shade(base, strength));
        else if (v < 0.16) p.set(ox + x, y, shade(base, -strength));
      }
  };

  const cobbles = (ox: number, base: number, salt: number) => {
    speckle(ox, base, salt, 10);
    const mortar = shade(base, -28);
    for (let y = 0; y < 16; y++) {
      const row = Math.floor(y / 8);
      if (y % 8 === 0) p.rect(ox, y, 16, 1, mortar);
      const offset = row * 4;
      for (let x = 0; x < 16; x++) if ((x + offset) % 8 === 0) p.set(ox + x, y, mortar);
    }
  };

  // 0 void
  speckle(0 * 16, COLORS.void, 1, 6);
  // 1 cobble A, 2 cobble B
  cobbles(1 * 16, COLORS.cobble, 2);
  cobbles(2 * 16, COLORS.cobbleAlt, 3);
  // 3 market dirt
  speckle(3 * 16, COLORS.marketDirt, 4, 12);
  // 4 shadow
  cobbles(4 * 16, COLORS.shadow, 5);
  // 5 concrete: poured slab with one seam
  speckle(5 * 16, COLORS.concrete, 6, 8);
  p.rect(5 * 16, 8, 16, 1, shade(COLORS.concrete, -20));
  // 6 road: dirt with wheel ruts
  speckle(6 * 16, COLORS.road, 7, 10);
  p.rect(6 * 16 + 4, 0, 2, 16, shade(COLORS.road, -18));
  p.rect(6 * 16 + 11, 0, 2, 16, shade(COLORS.road, -18));
  // 7 limestone wall: coursed blocks
  {
    const ox = 7 * 16;
    speckle(ox, COLORS.wall, 8, 8);
    const mortar = shade(COLORS.wall, -42);
    for (const y of [0, 5, 10, 15]) p.rect(ox, y, 16, 1, mortar);
    p.rect(ox + 6, 1, 1, 4, mortar);
    p.rect(ox + 12, 6, 1, 4, mortar);
    p.rect(ox + 3, 11, 1, 4, mortar);
    p.rect(ox, 15, 16, 1, COLORS.wallShade);
  }
  // 8 high crate
  {
    const ox = 8 * 16;
    p.rect(ox, 0, 16, 16, COLORS.crate);
    p.rect(ox, 0, 16, 1, shade(COLORS.crate, 34));
    p.rect(ox, 15, 16, 1, shade(COLORS.crate, -28));
    p.rect(ox, 0, 1, 16, shade(COLORS.crate, 20));
    p.rect(ox + 15, 0, 1, 16, shade(COLORS.crate, -24));
    for (const y of [5, 10]) p.rect(ox + 1, y, 14, 1, shade(COLORS.crate, -18));
    p.rect(ox + 7, 1, 1, 14, shade(COLORS.crate, -14));
  }
  // 9 low barrier: waist-high slab, visibly shorter than a crate
  {
    const ox = 9 * 16;
    p.rect(ox, 6, 16, 10, COLORS.barrier);
    p.rect(ox, 6, 16, 2, shade(COLORS.barrier, 26));
    p.rect(ox, 14, 16, 2, shade(COLORS.barrier, -34));
    for (const x of [4, 9, 14]) p.rect(ox + x, 8, 1, 6, shade(COLORS.barrier, -22));
  }
  // 10 well
  {
    const ox = 10 * 16;
    p.rect(ox, 0, 16, 16, COLORS.well);
    p.rect(ox + 2, 2, 12, 12, shade(COLORS.well, -34));
    p.rect(ox + 4, 4, 8, 8, 0x14161c);
    p.rect(ox, 0, 16, 1, shade(COLORS.well, 28));
  }
  // 11 cart
  {
    const ox = 11 * 16;
    p.rect(ox, 2, 16, 12, COLORS.cart);
    for (const y of [4, 7, 10]) p.rect(ox, y, 16, 1, shade(COLORS.cart, -26));
    p.rect(ox + 2, 13, 4, 3, 0x2b1f14);
    p.rect(ox + 10, 13, 4, 3, 0x2b1f14);
  }
  // 12 sigil floor mark - the recurring symbol that ties the levels together
  {
    const ox = 12 * 16;
    speckle(ox, COLORS.cobbleAlt, 9, 8);
    const s = COLORS.sigil;
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2;
      p.set(ox + 8 + Math.round(Math.cos(t) * 5), 8 + Math.round(Math.sin(t) * 5), s);
    }
    p.rect(ox + 8, 2, 1, 12, s);
    p.rect(ox + 4, 6, 9, 1, s);
    p.set(ox + 5, 11, s);
    p.set(ox + 11, 11, s);
  }
  // 13 awning: striped cloth, drawn above characters
  {
    const ox = 13 * 16;
    for (let x = 0; x < 16; x++)
      p.rect(ox + x, 0, 1, 16, x % 6 < 3 ? COLORS.awning : shade(COLORS.limestone, 10));
    p.rect(ox, 14, 16, 2, shade(COLORS.awning, -40));
  }
  // 14 grass / vine
  {
    const ox = 14 * 16;
    speckle(ox, COLORS.grass, 10, 16);
    for (let x = 1; x < 16; x += 3) {
      const h = 3 + Math.floor(hash(x, 1, 11) * 4);
      p.rect(ox + x, 16 - h, 1, h, shade(COLORS.grass, 26));
    }
  }
  // 15 van body
  {
    const ox = 15 * 16;
    p.rect(ox, 0, 16, 16, COLORS.van);
    p.rect(ox, 0, 16, 2, shade(COLORS.van, 30));
    p.rect(ox, 14, 16, 2, shade(COLORS.van, -26));
    for (const x of [2, 8, 13]) p.set(ox + x, 8, shade(COLORS.van, 44));
    p.rect(ox + 4, 4, 8, 5, shade(COLORS.van, -36));
  }

  p.commit();
}

// ------------------------------------------------------------ character sheets

interface CharPalette {
  coat: number;
  trim: number;
  skin: number;
  boots: number;
}

/**
 * 24x32 figure anchored at the feet. 4 facing rows x 3 frames, then the same
 * four rows again crouched (rows 4-7), so a sheet is 3 columns by 8 rows.
 */
export function buildCharacter(scene: Phaser.Scene, key: string, pal: CharPalette): void {
  const p = new PixelCanvas(scene, key, FRAME_COLS * CHAR_W, 8 * CHAR_H);
  const dirs: (keyof typeof DIR_ROW)[] = ['down', 'left', 'right', 'up'];

  for (let d = 0; d < 4; d++) {
    for (let crouch = 0; crouch < 2; crouch++) {
      for (let f = 0; f < FRAME_COLS; f++) {
        drawHuman(
          p,
          f * CHAR_W,
          (d + crouch * 4) * CHAR_H,
          dirs[d],
          f,
          crouch === 1,
          pal
        );
      }
    }
  }
  p.addFrames(CHAR_W, CHAR_H);
  p.commit();
}

function drawHuman(
  p: PixelCanvas,
  ox: number,
  oy: number,
  dir: keyof typeof DIR_ROW,
  frame: number,
  crouch: boolean,
  pal: CharPalette
): void {
  // Feet sit on the last row of the 32px cell; crouching compresses the torso.
  const crouchDrop = crouch ? 5 : 0;
  const headTop = oy + 2 + crouchDrop;
  const cx = ox + 12;

  // leg swing: frame 0 idle, 1 left forward, 2 right forward
  const swing = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const legTop = oy + 22 + crouchDrop;
  const legBottom = oy + 31;

  // shadow under the feet so the anchor reads clearly
  p.rect(ox + 7, oy + 30, 10, 2, 0x000000, 0.28);

  // legs
  const legColor = shade(pal.coat, -26);
  p.rect(cx - 4, legTop, 3, legBottom - legTop + (swing > 0 ? 0 : -1), legColor);
  p.rect(cx + 1, legTop, 3, legBottom - legTop + (swing < 0 ? 0 : -1), legColor);
  p.rect(cx - 4, legBottom - 1, 3, 2, pal.boots);
  p.rect(cx + 1, legBottom - 1, 3, 2, pal.boots);

  // coat / torso
  const torsoTop = oy + 11 + crouchDrop;
  p.rect(cx - 5, torsoTop, 10, legTop - torsoTop + 1, pal.coat);
  p.rect(cx - 5, torsoTop, 10, 1, shade(pal.coat, 26));
  p.rect(cx - 1, torsoTop + 1, 1, legTop - torsoTop - 1, pal.trim);

  // arms, nudged by facing
  const armY = torsoTop + 2;
  if (dir === 'left') {
    p.rect(cx - 7, armY, 2, 8, shade(pal.coat, -14));
  } else if (dir === 'right') {
    p.rect(cx + 5, armY, 2, 8, shade(pal.coat, -14));
  } else {
    p.rect(cx - 7, armY, 2, 8, shade(pal.coat, -14));
    p.rect(cx + 5, armY, 2, 8, shade(pal.coat, -14));
  }

  // head
  p.rect(cx - 4, headTop, 8, 9, pal.skin);
  p.rect(cx - 4, headTop, 8, 2, shade(pal.skin, -58)); // greying hair line
  if (dir === 'down') {
    p.set(cx - 2, headTop + 4, 0x221c18);
    p.set(cx + 1, headTop + 4, 0x221c18);
    p.rect(cx - 2, headTop + 7, 4, 1, shade(pal.skin, -40));
  } else if (dir === 'up') {
    p.rect(cx - 4, headTop, 8, 5, shade(pal.skin, -58));
  } else {
    const inward = dir === 'left' ? -1 : 1;
    p.set(cx + inward * 2, headTop + 4, 0x221c18);
    p.rect(cx + inward * 3, headTop + 5, 1, 2, shade(pal.skin, 18)); // nose
  }
  // collar
  p.rect(cx - 4, headTop + 9, 8, 2, shade(pal.coat, 14));
}

/** 8-direction pixel-aligned gun overlay, one 12x12 frame per octant. */
export function buildGunOverlay(scene: Phaser.Scene): void {
  const size = 12;
  const p = new PixelCanvas(scene, GUN_KEY, size * 8, size);
  const steel = 0x2e323a;
  const highlight = 0x565c68;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = i * size + 6;
    const cy = 6;
    p.rect(cx - 1, cy - 1, 3, 3, steel);
    for (let d = 1; d <= 5; d++) {
      const x = cx + Math.round(Math.cos(a) * d);
      const y = cy + Math.round(Math.sin(a) * d);
      p.set(x, y, d >= 4 ? highlight : steel);
    }
  }
  p.addFrames(size, size);
  p.commit();
}

// ----------------------------------------------------------------- small props

export function buildProps(scene: Phaser.Scene): void {
  // medkit 12x10
  {
    const p = new PixelCanvas(scene, 'prop_medkit', 12, 10);
    p.rect(0, 0, 12, 10, 0xd9d4c6);
    p.rect(0, 0, 12, 1, 0xf2eee2);
    p.rect(0, 9, 12, 1, 0x8e8a7c);
    p.rect(4, 2, 4, 6, 0xb03a30);
    p.rect(2, 4, 8, 2, 0xb03a30);
    p.commit();
  }
  // pistol ammo box 12x8
  {
    const p = new PixelCanvas(scene, 'prop_ammo', 12, 8);
    p.rect(0, 0, 12, 8, 0x6d5a3c);
    p.rect(0, 0, 12, 1, 0x8d774f);
    p.rect(0, 7, 12, 1, 0x3f3424);
    for (let i = 0; i < 4; i++) p.rect(1 + i * 3, 3, 2, 3, 0xc6a85c);
    p.commit();
  }
  // radio 12x12
  {
    const p = new PixelCanvas(scene, 'prop_radio', 12, 12);
    p.rect(0, 2, 12, 10, 0x4a4036);
    p.rect(1, 4, 7, 5, 0x8ba2a8);
    p.rect(9, 0, 1, 5, 0xbdb5a4);
    p.rect(1, 10, 10, 1, 0x2b251f);
    p.commit();
  }
  // document / log 10x12
  {
    const p = new PixelCanvas(scene, 'prop_doc', 10, 12);
    p.rect(0, 0, 10, 12, 0xd8cfb6);
    p.rect(0, 0, 10, 1, 0xefe7cf);
    for (let y = 2; y < 11; y += 2) p.rect(2, y, 6, 1, 0x7a6f57);
    p.commit();
  }
  // 1x1 white pixel for tracers, bars and flat fills
  {
    const p = new PixelCanvas(scene, 'px', 1, 1);
    p.rect(0, 0, 1, 1, 0xffffff);
    p.commit();
  }
  // enemy bullet 3x3
  {
    const p = new PixelCanvas(scene, 'bullet', 3, 3);
    p.rect(0, 1, 3, 1, 0xffe9a8);
    p.rect(1, 0, 1, 3, 0xffe9a8);
    p.set(1, 1, 0xfff6d8);
    p.commit();
  }
  // crosshair 9x9
  {
    const p = new PixelCanvas(scene, 'crosshair', 9, 9);
    const c = 0xf2ece0;
    p.rect(4, 0, 1, 3, c);
    p.rect(4, 6, 1, 3, c);
    p.rect(0, 4, 3, 1, c);
    p.rect(6, 4, 3, 1, c);
    p.commit();
  }
  // body marker (incapacitated enemy) 20x10
  {
    const p = new PixelCanvas(scene, 'prop_body', 20, 10);
    p.rect(1, 3, 18, 5, 0x50302f);
    p.rect(1, 3, 18, 1, 0x6b4140);
    p.rect(14, 2, 5, 5, 0xa3805f);
    p.rect(0, 8, 20, 2, 0x2a1514, 0.5);
    p.commit();
  }
}

export function buildAllArt(scene: Phaser.Scene): void {
  buildTileset(scene);
  buildCharacter(scene, PLAYER_KEY, {
    coat: COLORS.tempest,
    trim: 0x5a6578,
    skin: COLORS.tempestSkin,
    boots: 0x24262c,
  });
  buildCharacter(scene, 'enemy_lookout', {
    coat: COLORS.lookout,
    trim: 0x8a4a46,
    skin: 0xb98b66,
    boots: 0x2a2320,
  });
  buildGunOverlay(scene);
  buildProps(scene);
}
