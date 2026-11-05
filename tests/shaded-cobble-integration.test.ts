import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSETS_BY_KEY } from '../src/art/AssetRegistry';
import {
  COBBLE_MATERIAL_TILES,
  SHADED_FLOOR_TILE,
  SHADE_EXCLUDED_REGIONS,
  SHADE_GARDEN_PATH,
  V2_DEPTH,
  V2_TEXTURES,
  pavingVariant,
} from '../src/art/ValcendreV2';
import { GID } from '../src/art/ValcendreV2Scene';
import {
  CORNER_ORDER,
  cardinalAtlasIndex,
  composeRegion,
  diagonalAtlasIndex,
  summarise,
  type GroundClass,
  type GroundReader,
} from '../src/art/GroundShade';
import { TILE } from '../src/core/constants';
import { TILE_NAMES } from '../src/art/TilesetRegistry';
import { alphaStats, crop, decodePng, pixelsEqual } from './support/png';

/**
 * Phase B.2-05C-2 - shaded cobblestone integration.
 *
 * `tests/ground-shade.test.ts` covers the selection RULES exhaustively against
 * synthetic neighbourhoods. These cover the INTEGRATION: that the approved
 * files are the ones registered, at their declared sizes; that the atlases are
 * indexed the way the approved manifest says; that mask 0 really is the plain
 * shaded tile; that the authored map is classified by material rather than by
 * the shade flag; and that no gameplay data moved.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const ENV = `${ROOT}public/assets/environments`;
const PKG = `${ROOT}art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/08_shade_b205a`;

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

const cobbleManifest = JSON.parse(
  readFileSync(`${PKG}/valcendre_shaded_cobble_manifest.json`, 'utf8')
) as {
  sha256: string;
  dimensions_px: [number, number];
  atlas: { columns: number; rows: number; tile_count: number };
  source: { sha256: string };
  tile_index: { index: number; source_index: number }[];
  opacity: { alpha_values: number[]; fully_opaque: boolean };
};

const transitionManifest = JSON.parse(
  readFileSync(`${PKG}/valcendre_shade_transition_manifest.json`, 'utf8')
) as {
  authoritative_sources: { file: string; sha256: string }[];
  assets: {
    file: string;
    sha256: string;
    dimensions_px: [number, number];
    columns: number;
    rows: number;
    tile_count: number;
    tile_index_formula: string;
    alpha: number[];
    fully_opaque: boolean;
  }[];
  cardinal: {
    neighbor_bits: Record<string, number>;
    masks: Record<string, string[]>;
    mask_0_is_byte_identical_to_approved_shade: boolean;
  };
  diagonals: { corner_order: string[] };
  palette: { used_color_ids: string[]; new_colors: number };
};

const palette = JSON.parse(
  readFileSync(`${ROOT}art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/01_palette/valcendre_palette.json`, 'utf8')
) as { colors: { id: string; hex: string }[] };

const map = JSON.parse(readFileSync(`${ROOT}public/assets/maps/village.json`, 'utf8')) as {
  width: number;
  height: number;
  layers: { name: string; type: string; data?: number[] }[];
  tilesets: { firstgid: number }[];
};
const W = map.width;
const firstgid = map.tilesets[0].firstgid;
const layerData = (n: string) => map.layers.find((l) => l.name === n)?.data ?? null;
const floorLayer = layerData('floor')!;
const materialLayer = layerData('groundMaterial')!;
const tileName = (data: number[], tx: number, ty: number) => {
  const g = data[ty * W + tx];
  return g === 0 ? null : (TILE_NAMES[g - firstgid] ?? null);
};

// =====================================================================
// 1. the approved files, and only those, are what is registered
// =====================================================================
describe('1. approved shaded artwork is registered unchanged', () => {
  const EXPECTED: [string, string, number, number, number, string][] = [
    [
      V2_TEXTURES.cobbleShaded,
      'assets/environments/valcendre_shaded_cobble_16x16.png',
      64,
      16,
      4,
      '1747da6acbecaf9ca38f3dd9f438362c5b030681ec2457311b028afb248d15b8',
    ],
    [
      V2_TEXTURES.shadeBoundaries,
      'assets/environments/valcendre_shade_boundaries_16x16.png',
      128,
      128,
      64,
      'c88d2432d974e65441944e659452e941dec2a2e1d7a8aab0909bdd95a7296bb0',
    ],
    [
      V2_TEXTURES.shadeCorners,
      'assets/environments/valcendre_shade_diagonal_corners_16x16.png',
      128,
      32,
      16,
      '653d75427703ee0efb4b9c8d0a2ad3f1d5c90369992eee73ad03242cec2f96be',
    ],
  ];

  it('registers each file at its declared size and frame count', () => {
    for (const [key, path, w, h, frames] of EXPECTED) {
      const a = ASSETS_BY_KEY.get(key);
      expect(a, `${key} is not registered`).toBeDefined();
      expect(a!.path, key).toBe(path);
      expect(a!.width, `${key} width`).toBe(w);
      expect(a!.height, `${key} height`).toBe(h);
      expect(a!.frameWidth, `${key} frameWidth`).toBe(TILE);
      expect(a!.frameHeight, `${key} frameHeight`).toBe(TILE);
      expect(a!.frameCount, `${key} frameCount`).toBe(frames);
    }
  });

  it('matches the dimensions in the PNG headers on disk', () => {
    for (const [, path, w, h] of EXPECTED) {
      const bytes = readFileSync(`${ROOT}public/${path}`);
      expect(bytes.readUInt32BE(16), `${path} width`).toBe(w);
      expect(bytes.readUInt32BE(20), `${path} height`).toBe(h);
    }
  });

  it('is byte-identical to the approved package and its own manifests', () => {
    expect(sha256(`${ENV}/valcendre_shaded_cobble_16x16.png`)).toBe(cobbleManifest.sha256);
    for (const asset of transitionManifest.assets) {
      expect(sha256(`${ENV}/${asset.file}`), asset.file).toBe(asset.sha256);
    }
    // And each repo copy matches the archived package copy.
    for (const [, path, , , , want] of EXPECTED) {
      const file = path.split('/').pop()!;
      expect(sha256(`${ROOT}public/${path}`), file).toBe(want);
      expect(sha256(`${PKG}/${file}`), `${file} in the archived package`).toBe(want);
    }
  });

  it('derives from the daylight strip we actually ship', () => {
    const daylight = sha256(`${ENV}/valcendre_proof_cobble_16x16.png`);
    expect(daylight, 'B.2-03A source').toBe(cobbleManifest.source.sha256);
    const declared = transitionManifest.authoritative_sources.find((s) =>
      s.file.endsWith('valcendre_proof_cobble_16x16.png')
    );
    expect(declared?.sha256).toBe(daylight);
  });

  it('keeps the daylight strip registered alongside, so nothing was replaced', () => {
    const a = ASSETS_BY_KEY.get(V2_TEXTURES.cobble);
    expect(a?.path).toBe('assets/environments/valcendre_proof_cobble_16x16.png');
    expect(a?.frameCount).toBe(4);
  });
});

// =====================================================================
// 2. alpha, palette, and mask-0 parity
// =====================================================================
describe('2. the pixels are what the manifests claim', () => {
  const shaded = decodePng(readFileSync(`${ENV}/valcendre_shaded_cobble_16x16.png`));
  const boundaries = decodePng(readFileSync(`${ENV}/valcendre_shade_boundaries_16x16.png`));
  const corners = decodePng(readFileSync(`${ENV}/valcendre_shade_diagonal_corners_16x16.png`));

  it('has fully opaque ground tiles and binary-alpha overlays', () => {
    const s = alphaStats(shaded);
    expect(s.partial, 'shaded strip partial alpha').toBe(0);
    expect(s.opaque, 'shaded strip is fully opaque').toBe(64 * 16);

    const b = alphaStats(boundaries);
    expect(b.partial, 'cardinal atlas partial alpha').toBe(0);
    expect(b.opaque, 'cardinal atlas is fully opaque').toBe(128 * 128);

    const c = alphaStats(corners);
    expect(c.partial, 'corner overlays partial alpha').toBe(0);
    expect(c.opaque, 'corner overlays carry art').toBeGreaterThan(0);
    expect(c.transparent, 'corner overlays are mostly transparent').toBeGreaterThan(c.opaque);
    // The manifest declares binary alpha; this is what that means in pixels.
    expect(transitionManifest.assets[1].alpha).toEqual([0, 255]);
  });

  it('introduces no colour outside the approved 53-colour palette', () => {
    const approved = new Set(palette.colors.map((c) => c.hex.toLowerCase()));
    expect(approved.size).toBeGreaterThanOrEqual(53);
    for (const [name, png] of [
      ['shaded strip', shaded],
      ['cardinal atlas', boundaries],
      ['corner overlays', corners],
    ] as const) {
      const seen = new Set<string>();
      for (let i = 0; i < png.pixels.length; i += 4) {
        if (png.pixels[i + 3] !== 255) continue;
        seen.add(
          `#${[png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`
        );
      }
      for (const hex of seen) expect(approved.has(hex), `${name} uses unapproved ${hex}`).toBe(true);
    }
    expect(transitionManifest.palette.new_colors).toBe(0);
  });

  it('has mask 0 byte-identical to the plain shaded tile, for all four variants', () => {
    // The manifest asserts this; here it is checked against the pixels, because
    // the renderer relies on it to route shaded interiors to the plain strip.
    expect(transitionManifest.cardinal.mask_0_is_byte_identical_to_approved_shade).toBe(true);
    for (let variant = 0; variant < 4; variant++) {
      const index = cardinalAtlasIndex(variant, 0);
      const col = index % 8;
      const row = Math.floor(index / 8);
      const fromAtlas = crop(boundaries, col * TILE, row * TILE, TILE, TILE);
      const fromStrip = crop(shaded, variant * TILE, 0, TILE, TILE);
      expect(pixelsEqual(fromAtlas, fromStrip), `variant ${variant} mask 0`).toBe(0);
    }
  });

  it('keeps each shaded variant paired with its own daylight variant', () => {
    for (const entry of cobbleManifest.tile_index) {
      expect(entry.source_index, `shaded ${entry.index}`).toBe(entry.index);
    }
  });
});

// =====================================================================
// 3. atlas indexing agrees with the approved manifest
// =====================================================================
describe('3. atlas indexing matches the approved transition manifest', () => {
  it("uses the manifest's own bit assignment", () => {
    expect(transitionManifest.cardinal.neighbor_bits).toEqual({ N: 1, E: 2, S: 4, W: 8 });
  });

  it("uses the manifest's own index formulas", () => {
    expect(transitionManifest.assets[0].tile_index_formula).toBe('variant * 16 + boundary_mask');
    expect(transitionManifest.assets[1].tile_index_formula).toBe('variant * 4 + corner_index');
    expect(cardinalAtlasIndex(2, 5)).toBe(2 * 16 + 5);
    expect(diagonalAtlasIndex(2, 'southeast')).toBe(2 * 4 + 2);
  });

  it("uses the manifest's own corner order", () => {
    expect(transitionManifest.diagonals.corner_order).toEqual(['NW', 'NE', 'SE', 'SW']);
    expect(CORNER_ORDER).toEqual(['northwest', 'northeast', 'southeast', 'southwest']);
  });

  it("reproduces every mask's direction set from the manifest", () => {
    const BIT: Record<string, number> = { N: 1, E: 2, S: 4, W: 8 };
    for (const [maskStr, dirs] of Object.entries(transitionManifest.cardinal.masks)) {
      const expected = dirs.reduce((acc, d) => acc | BIT[d], 0);
      expect(expected, `mask ${maskStr}`).toBe(Number(maskStr));
    }
    expect(Object.keys(transitionManifest.cardinal.masks).length).toBe(16);
  });

  it('gives every atlas frame a distinct global id in the ground layer', () => {
    // The ground layer mixes three tilesets, so the bases must not overlap.
    expect(GID.daylight + 4).toBeLessThanOrEqual(GID.shaded);
    expect(GID.shaded + 4).toBeLessThanOrEqual(GID.boundary);
    expect(GID.boundary + 64).toBeLessThanOrEqual(GID.corner);
  });
});

// =====================================================================
// 4. the authored map is classified by material, not by the shade flag
// =====================================================================
describe('4. material classification over the real map', () => {
  /** The same reader the scene builds, over the shipped map data. */
  const cobble = new Set<string>(COBBLE_MATERIAL_TILES);
  const inExcluded = (tx: number, ty: number) =>
    !SHADE_GARDEN_PATH &&
    tx >= SHADE_EXCLUDED_REGIONS.x &&
    tx < SHADE_EXCLUDED_REGIONS.x + SHADE_EXCLUDED_REGIONS.w &&
    ty >= SHADE_EXCLUDED_REGIONS.y &&
    ty < SHADE_EXCLUDED_REGIONS.y + SHADE_EXCLUDED_REGIONS.h;
  const reader: GroundReader = {
    classify(tx, ty): GroundClass {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'other';
      if (inExcluded(tx, ty)) return 'other';
      const mat = tileName(materialLayer, tx, ty);
      if (!mat || !cobble.has(mat)) return 'other';
      return tileName(floorLayer, tx, ty) === SHADED_FLOOR_TILE ? 'cobbleShaded' : 'cobbleDaylight';
    },
    variant: (tx, ty) => pavingVariant(tx, ty),
  };
  const cells = composeRegion(reader, { x: 0, y: 0, w: map.width, h: map.height });
  const summary = summarise(cells);

  it('has the groundMaterial layer, recording a surface base per walkable tile', () => {
    expect(materialLayer, 'groundMaterial layer').toBeDefined();
    const nonZero = materialLayer.filter((v) => v !== 0).length;
    expect(nonZero, 'walkable tiles with a recorded material').toBe(2719);
    // Base tiles only: a variant-rolled decorative tile must never appear, or a
    // cracked cobble tile could not be told from a cracked brick tile.
    const names = new Set(materialLayer.filter((v) => v !== 0).map((v) => TILE_NAMES[v - firstgid]));
    expect(names, 'recorded material tiles').toEqual(
      new Set(['cobble', 'brick', 'metal', 'ground_debris', 'grass', 'floor_04'])
    );
    expect(names.has('floor_crack'), 'decorative variant leaked into the material layer').toBe(false);
  });

  it('classifies exactly the audited cobblestone population', () => {
    expect(summary.daylightCells, 'daylight cobblestone').toBe(929);
    expect(summary.shadedInteriorCells + summary.boundaryCells, 'shaded cobblestone').toBe(79);
    expect(cells.length, 'ground cells painted in total').toBe(1008);
  });

  it('paints no grass, brick, gravel or garage tile', () => {
    const painted = new Set(cells.map((c) => `${c.tx},${c.ty}`));
    let checked = 0;
    for (let ty = 0; ty < map.height; ty++)
      for (let tx = 0; tx < map.width; tx++) {
        const mat = tileName(materialLayer, tx, ty);
        if (!mat || cobble.has(mat)) continue;
        checked++;
        expect(painted.has(`${tx},${ty}`), `${mat} at ${tx},${ty} was painted`).toBe(false);
      }
    expect(checked, 'non-cobblestone tiles checked').toBeGreaterThan(1500);
  });

  it('honours the garden-walk exclusion while it is switched off', () => {
    expect(SHADE_GARDEN_PATH, 'garden walk is excluded by default').toBe(false);
    const painted = new Set(cells.map((c) => `${c.tx},${c.ty}`));
    let excluded = 0;
    for (let ty = SHADE_EXCLUDED_REGIONS.y; ty < SHADE_EXCLUDED_REGIONS.y + SHADE_EXCLUDED_REGIONS.h; ty++)
      for (let tx = SHADE_EXCLUDED_REGIONS.x; tx < SHADE_EXCLUDED_REGIONS.x + SHADE_EXCLUDED_REGIONS.w; tx++) {
        if (!tileName(materialLayer, tx, ty)) continue;
        excluded++;
        expect(painted.has(`${tx},${ty}`), `garden walk ${tx},${ty}`).toBe(false);
      }
    expect(excluded, 'garden walk tiles left alone').toBeGreaterThan(100);
  });

  it('exercises the masks the authored shade shapes actually produce', () => {
    const histogram = new Map<number, number>();
    for (const c of cells)
      if (c.base !== 'daylight') histogram.set(c.mask, (histogram.get(c.mask) ?? 0) + 1);
    // Valcendre's shade is authored as axis-aligned rectangles, so eight of the
    // sixteen masks appear and the rest do not. Recorded rather than asserted
    // as ideal: the unexercised masks are covered synthetically in
    // tests/ground-shade.test.ts.
    expect([...histogram.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 6, 9, 12]);
    expect(histogram.get(0), 'plain shaded interiors').toBe(38);
  });

  it('produces no diagonal overlay, because no authored shape needs one', () => {
    // An overlay needs a concave corner: both cardinals shaded with a lit
    // diagonal. Axis-aligned rectangles never make one. This is a fact about
    // the map, not a limit of the implementation - if a future layout adds an
    // L or T union of shade stamps, this count rises and the art is ready.
    expect(summary.overlayCells).toBe(0);
    expect(summary.overlayTotal).toBe(0);
  });

  it('is deterministic across reloads', () => {
    const again = composeRegion(reader, { x: 0, y: 0, w: map.width, h: map.height });
    expect(again).toEqual(cells);
    // Variant choice is a pure function of tile coordinates, so a reload, a
    // save restore and a browser refresh all reproduce it.
    expect(pavingVariant(11, 45)).toBe(pavingVariant(11, 45));
    expect(cells.every((c) => c.variant === pavingVariant(c.tx, c.ty))).toBe(true);
  });
});

// =====================================================================
// 5. nothing gameplay-bearing moved
// =====================================================================
describe('5. gameplay data is untouched', () => {
  it('leaves shadowZones exactly as authored', () => {
    const sz = layerData('shadowZones')!;
    expect(sz.filter((v) => v !== 0).length, 'shadow tiles').toBe(652);
  });

  it('leaves collision, cover and prop collision as they were', () => {
    expect(layerData('collision')!.filter((v) => v !== 0).length).toBe(4769);
    expect(layerData('cover')!.filter((v) => v !== 0).length).toBe(92);
    expect(layerData('propCollision')!.filter((v) => v !== 0).length).toBe(83);
  });

  it('adds the material layer as an APPEARANCE layer only', () => {
    // MapLoader merges tile flags from a closed set; `groundMaterial` is not in
    // it, so the layer cannot affect movement, vision, cover or concealment.
    const loader = readFileSync(`${ROOT}src/core/MapLoader.ts`, 'utf8');
    const match = loader.match(/const GAMEPLAY_LAYERS = new Set\(\[(.*?)\]\)/s);
    expect(match, 'GAMEPLAY_LAYERS declaration').toBeTruthy();
    expect(match![1]).not.toContain('groundMaterial');
    expect(match![1]).toContain('shadowZones');
  });

  it('keeps the map dimensions and the evidence tile', () => {
    expect([map.width, map.height]).toEqual([104, 72]);
    const objects = map.layers.flatMap(
      (l) => (l as { objects?: { name?: string; x: number; y: number }[] }).objects ?? []
    );
    const clue = objects.find((o) => o.name === 'interact_stall');
    expect(clue, 'interact_stall').toBeDefined();
    expect([Math.floor(clue!.x / TILE), Math.floor(clue!.y / TILE)]).toEqual([30, 47]);
  });

  it('never consults shadowZones for the artwork', () => {
    // The two states are read from two different layers on purpose: material
    // from `groundMaterial`, visual shade from `floor`. If the presentation
    // ever read `shadowZones`, concealment and appearance would be one datum.
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const scene = strip(readFileSync(`${ROOT}src/art/ValcendreV2Scene.ts`, 'utf8'));
    expect(scene, 'presentation code reads shadowZones').not.toContain('shadowZones');
    const shade = strip(readFileSync(`${ROOT}src/art/GroundShade.ts`, 'utf8'));
    expect(shade, 'selection code reads shadowZones').not.toContain('shadowZones');
    // The map layer it DOES read is the material layer.
    expect(scene).toContain("getLayer('groundMaterial')");
  });

  it('keeps the ground below every legacy layer that must stay on top', () => {
    expect(V2_DEPTH.paving).toBeLessThan(1); // under legacy decorBack
    for (const d of V2_DEPTH.shadeCorners) {
      expect(d).toBeGreaterThan(V2_DEPTH.paving);
      expect(d).toBeLessThan(V2_DEPTH.groundShade);
    }
    expect(V2_DEPTH.shadeCorners.length).toBe(CORNER_ORDER.length);
    expect(new Set(V2_DEPTH.shadeCorners).size, 'corner depths are distinct').toBe(4);
  });
});
