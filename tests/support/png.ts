/**
 * Minimal PNG reader for pixel-level assertions in tests.
 *
 * Dependency-free: node's own `zlib` plus the spec. The project ships no image
 * library and should not gain one just to assert that a source rectangle lines
 * up, and a test that decodes the real file is worth more than one that trusts
 * a manifest.
 *
 * Only what the approved art actually uses is supported: 8-bit, non-interlaced,
 * RGBA or RGB. Anything else throws rather than guessing.
 */

import { inflateSync } from 'node:zlib';

export interface Png {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(bytes: Buffer): Png {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];

  for (let pos = 8; pos + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('ascii', pos + 4, pos + 8);
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    switch (filter) {
      case 0:
        break;
      case 1:
        for (let i = channels; i < stride; i++) line[i] = (line[i] + line[i - channels]) & 0xff;
        break;
      case 2:
        for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 0xff;
        break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const a = i >= channels ? line[i - channels] : 0;
          line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= channels ? line[i - channels] : 0;
          const b = prev[i];
          const c = i >= channels ? prev[i - channels] : 0;
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          line[i] = (line[i] + pred) & 0xff;
        }
        break;
      default:
        throw new Error(`bad row filter ${filter}`);
    }
    lines.set(line, y * stride);
    prev = line;
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 4) {
      pixels.set(lines.subarray(i * 4, i * 4 + 4), i * 4);
    } else {
      pixels.set(lines.subarray(i * 3, i * 3 + 3), i * 4);
      pixels[i * 4 + 3] = 255;
    }
  }
  return { width, height, pixels };
}

/** Copies a source rectangle out as its own RGBA buffer. */
export function crop(png: Png, x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const sy = y + j;
    if (sy < 0 || sy >= png.height) continue;
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      if (sx < 0 || sx >= png.width) continue;
      const s = (sy * png.width + sx) * 4;
      out.set(png.pixels.subarray(s, s + 4), (j * w + i) * 4);
    }
  }
  return out;
}

export interface AlphaStats {
  opaque: number;
  transparent: number;
  partial: number;
  uniqueRgb: number;
}

export function alphaStats(png: Png, x = 0, y = 0, w = png.width, h = png.height): AlphaStats {
  let opaque = 0;
  let transparent = 0;
  let partial = 0;
  const seen = new Set<number>();
  for (let j = y; j < Math.min(y + h, png.height); j++) {
    for (let i = x; i < Math.min(x + w, png.width); i++) {
      const o = (j * png.width + i) * 4;
      const a = png.pixels[o + 3];
      if (a === 255) {
        opaque++;
        seen.add((png.pixels[o] << 16) | (png.pixels[o + 1] << 8) | png.pixels[o + 2]);
      } else if (a === 0) transparent++;
      else partial++;
    }
  }
  return { opaque, transparent, partial, uniqueRgb: seen.size };
}

/**
 * Composites `src` over `dst` at (dx, dy) with the engine's own rule for these
 * assets: binary alpha, no blending. Mutates and returns `dst`.
 */
export function drawOver(
  dst: Png,
  src: Uint8Array,
  sw: number,
  sh: number,
  dx: number,
  dy: number
): Png {
  for (let j = 0; j < sh; j++) {
    const ty = dy + j;
    if (ty < 0 || ty >= dst.height) continue;
    for (let i = 0; i < sw; i++) {
      const tx = dx + i;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (j * sw + i) * 4;
      if (src[s + 3] === 0) continue;
      dst.pixels.set(src.subarray(s, s + 4), (ty * dst.width + tx) * 4);
    }
  }
  return dst;
}

export function blank(width: number, height: number): Png {
  return { width, height, pixels: new Uint8Array(width * height * 4) };
}

export function pixelsEqual(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return -1;
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    const aTransparent = a[i + 3] === 0;
    const bTransparent = b[i + 3] === 0;
    if (aTransparent && bTransparent) continue;
    if (
      aTransparent !== bTransparent ||
      a[i] !== b[i] ||
      a[i + 1] !== b[i + 1] ||
      a[i + 2] !== b[i + 2] ||
      a[i + 3] !== b[i + 3]
    )
      differing++;
  }
  return differing;
}
