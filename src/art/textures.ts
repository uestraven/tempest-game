/**
 * Generated placeholder art for the handful of gameplay objects the production
 * package does not cover.
 *
 * The 8-direction gun overlay was removed in Task 02: Tempest's directional
 * sheets carry the pistol inside the aim and fire frames, so an overlay would
 * draw a second weapon. See Player.updateAnimation for the weapon rule.
 *
 * Everything the package DOES provide - tiles, characters, props, FX, UI font,
 * panels, portraits - is loaded from disk via AssetRegistry/AssetLoader. What
 * remains here is drawn at true pixel size with no filtering, and is listed in
 * docs/art-integration.md as outstanding art work:
 *
 *   prop_van      Suzanne's transport. The mission's central clue; no van art
 *                 exists in the package.
 *   prop_medkit   Health pickup.
 *   prop_ammo     Pistol ammunition pickup.
 *   prop_radio    The market radio distraction.
 *   prop_doc      Transport log / torn hymn page.
 *   bullet        Enemy projectile.
 *   crosshair     Mouse crosshair.
 *   px            1x1 white pixel for bars and flat fills.
 */

import Phaser from 'phaser';

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

  addFrames(frameWidth: number, frameHeight: number): void {
    const cols = Math.floor(this.tex.width / frameWidth);
    const rows = Math.floor(this.tex.height / frameHeight);
    let i = 0;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        this.tex.add(i++, 0, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
  }

  commit(): void {
    this.tex.refresh();
    this.tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/**
 * Van placeholder, 64x32: four tiles wide by two tall, matching the `van` cover
 * tiles the map generator rasterises underneath it. Drawn in the estate-van
 * palette so it reads as a vehicle rather than a crate.
 */
function buildVan(scene: Phaser.Scene): void {
  const body = 0x414a52;
  const p = new PixelCanvas(scene, 'prop_van', 64, 32);
  p.rect(0, 2, 64, 29, body);
  p.rect(0, 2, 64, 3, shade(body, 34));
  p.rect(0, 28, 64, 3, shade(body, -30));
  p.rect(2, 7, 26, 11, shade(body, -40)); // cargo door seam
  p.rect(30, 7, 2, 24, shade(body, -46));
  p.rect(36, 6, 24, 10, 0x7f9099); // windscreen
  p.rect(36, 6, 24, 1, 0xa8bcc4);
  for (const x of [6, 18, 44, 56]) p.rect(x, 29, 6, 3, 0x1d2024); // wheels
  for (const x of [4, 24, 50]) p.set(x, 22, shade(body, 48)); // rivets
  p.commit();
}

function buildPickupsAndProps(scene: Phaser.Scene): void {
  {
    const p = new PixelCanvas(scene, 'prop_medkit', 12, 10);
    p.rect(0, 0, 12, 10, 0xd9d4c6);
    p.rect(0, 0, 12, 1, 0xf2eee2);
    p.rect(0, 9, 12, 1, 0x8e8a7c);
    p.rect(4, 2, 4, 6, 0xb03a30);
    p.rect(2, 4, 8, 2, 0xb03a30);
    p.commit();
  }
  {
    const p = new PixelCanvas(scene, 'prop_ammo', 12, 8);
    p.rect(0, 0, 12, 8, 0x6d5a3c);
    p.rect(0, 0, 12, 1, 0x8d774f);
    p.rect(0, 7, 12, 1, 0x3f3424);
    for (let i = 0; i < 4; i++) p.rect(1 + i * 3, 3, 2, 3, 0xc6a85c);
    p.commit();
  }
  {
    const p = new PixelCanvas(scene, 'prop_radio', 12, 12);
    p.rect(0, 2, 12, 10, 0x4a4036);
    p.rect(1, 4, 7, 5, 0x8ba2a8);
    p.rect(9, 0, 1, 5, 0xbdb5a4);
    p.rect(1, 10, 10, 1, 0x2b251f);
    p.commit();
  }
  {
    const p = new PixelCanvas(scene, 'prop_doc', 10, 12);
    p.rect(0, 0, 10, 12, 0xd8cfb6);
    p.rect(0, 0, 10, 1, 0xefe7cf);
    for (let y = 2; y < 11; y += 2) p.rect(2, y, 6, 1, 0x7a6f57);
    p.commit();
  }
}

function buildCombatBits(scene: Phaser.Scene): void {
  {
    const p = new PixelCanvas(scene, 'px', 1, 1);
    p.rect(0, 0, 1, 1, 0xffffff);
    p.commit();
  }
  {
    const p = new PixelCanvas(scene, 'bullet', 3, 3);
    p.rect(0, 1, 3, 1, 0xffe9a8);
    p.rect(1, 0, 1, 3, 0xffe9a8);
    p.set(1, 1, 0xfff6d8);
    p.commit();
  }
  {
    const p = new PixelCanvas(scene, 'crosshair', 9, 9);
    const c = 0xf2ece0;
    p.rect(4, 0, 1, 3, c);
    p.rect(4, 6, 1, 3, c);
    p.rect(0, 4, 3, 1, c);
    p.rect(6, 4, 3, 1, c);
    p.commit();
  }
}

/** Keys of every generated placeholder, for the asset audit in the docs. */
export const PLACEHOLDER_KEYS = [
  'prop_van',
  'prop_medkit',
  'prop_ammo',
  'prop_radio',
  'prop_doc',
  'bullet',
  'crosshair',
  'px',
] as const;

export function buildPlaceholderArt(scene: Phaser.Scene): void {
  buildVan(scene);
  buildPickupsAndProps(scene);
  buildCombatBits(scene);
}
