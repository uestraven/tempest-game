import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSETS,
  ASSETS_BY_KEY,
  CHARACTER_KEYS,
  MAP_FILES,
  PROP_AREAS,
  STAGE_KEYS,
  propNames,
  textureKey,
} from '../src/art/AssetRegistry';
import { CHARACTERS, CHAR_COLUMNS, CHAR_ROW, CHAR_ROWS, frameIndex } from '../src/art/CharacterDefinitions';
import { PROPS, propOrigin } from '../src/art/PropDefinitions';
import { CHARSET, FONT_COLUMNS, GLYPH_HEIGHT, GLYPH_WIDTH } from '../src/ui/font-data';
import {
  FLOOR_VARIANTS,
  TILE_NAMES,
  TILESET_TILE_COUNT,
  TILE_ROLES,
  tileIndex,
} from '../src/art/TilesetRegistry';

const root = new URL('..', import.meta.url).pathname;
const publicPath = (p: string) => `${root}public/${p}`;
const artSource = (p: string) => `${root}art-source/TEMPEST_pixel_art_v1/${p}`;

/** Reads a PNG's IHDR. Enough to verify dimensions without an image library. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('asset registry', () => {
  it('references a file that exists for every entry', () => {
    for (const asset of ASSETS) {
      expect(existsSync(publicPath(asset.path)), `${asset.key} -> ${asset.path}`).toBe(true);
    }
  });

  it('declares the real on-disk dimensions', () => {
    for (const asset of ASSETS) {
      const size = pngSize(publicPath(asset.path));
      expect(size, `${asset.key} (${asset.path})`).toEqual({
        width: asset.width,
        height: asset.height,
      });
    }
  });

  it('has no duplicate texture keys', () => {
    expect(ASSETS_BY_KEY.size).toBe(ASSETS.length);
  });

  it('tiles every spritesheet exactly, with no leftover padding', () => {
    for (const asset of ASSETS) {
      if (asset.kind !== 'spritesheet') continue;
      expect(asset.width % asset.frameWidth!, `${asset.key} width`).toBe(0);
      expect(asset.height % asset.frameHeight!, `${asset.key} height`).toBe(0);
      const cols = asset.width / asset.frameWidth!;
      const rows = asset.height / asset.frameHeight!;
      expect(cols * rows, `${asset.key} frame count`).toBe(asset.frameCount);
    }
  });

  it('registers all seven characters and their portraits', () => {
    expect(CHARACTER_KEYS).toHaveLength(7);
    for (const name of CHARACTER_KEYS) {
      expect(ASSETS_BY_KEY.has(textureKey.character(name))).toBe(true);
      expect(ASSETS_BY_KEY.has(textureKey.portrait(name))).toBe(true);
    }
  });

  it('registers all four stage tilesets', () => {
    expect(STAGE_KEYS).toHaveLength(4);
    for (const stage of STAGE_KEYS) {
      expect(ASSETS_BY_KEY.has(textureKey.tileset(stage))).toBe(true);
    }
  });

  it('registers every prop in every area', () => {
    for (const area of PROP_AREAS) {
      for (const name of propNames(area)) {
        expect(ASSETS_BY_KEY.has(textureKey.prop(area, name)), `${area}.${name}`).toBe(true);
      }
    }
  });

  it('loads the generated map through the tilemap loader', () => {
    expect(existsSync(publicPath(MAP_FILES.village))).toBe(true);
    expect(statSync(publicPath(MAP_FILES.village)).size).toBeGreaterThan(1000);
  });
});

describe('character definitions against the package manifest', () => {
  const manifest = JSON.parse(readFileSync(artSource('manifest.json'), 'utf8'));

  it('matches the manifest layout: 4 columns x 6 rows of 24x32', () => {
    for (const name of CHARACTER_KEYS) {
      const entry = manifest.characters[name];
      expect(entry, name).toBeDefined();
      expect(entry.columns).toBe(CHAR_COLUMNS);
      expect(entry.rows).toBe(CHAR_ROWS);
      expect(entry.frame_width).toBe(24);
      expect(entry.frame_height).toBe(32);
    }
  });

  it('uses the manifest row order', () => {
    const rows = manifest.characters.tempest.row_names;
    expect(rows).toEqual(Object.keys(CHAR_ROW));
  });

  it('only picks frame columns that exist', () => {
    for (const def of Object.values(CHARACTERS)) {
      const columns = [
        ...def.idleFrames,
        ...def.walkFrames,
        def.aimFrame,
        def.fireFrame,
        def.hitFrame,
        def.downFrame,
      ];
      for (const column of columns) {
        expect(column, `${def.key}`).toBeGreaterThanOrEqual(0);
        expect(column, `${def.key}`).toBeLessThan(CHAR_COLUMNS);
      }
    }
  });

  it('maps rows and columns to flat frame indices inside the sheet', () => {
    expect(frameIndex('idle', 0)).toBe(0);
    expect(frameIndex('walk', 0)).toBe(4);
    expect(frameIndex('down', 3)).toBe(23);
    for (const def of Object.values(CHARACTERS)) {
      for (const column of def.walkFrames) {
        expect(frameIndex('walk', column)).toBeLessThan(CHAR_COLUMNS * CHAR_ROWS);
      }
    }
  });

  it('gives every character a usable idle and walk cycle', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrames.length, `${def.key} idle`).toBeGreaterThanOrEqual(1);
      expect(def.walkFrames.length, `${def.key} walk`).toBeGreaterThanOrEqual(2);
    }
  });

  it('documents a reason for every excluded frame', () => {
    for (const def of Object.values(CHARACTERS)) {
      for (const reason of def.excluded) {
        expect(reason.length, `${def.key}`).toBeGreaterThan(20);
      }
    }
  });
});

describe('tileset registry against the supplied tileset metadata', () => {
  const stageJson = (stage: string) =>
    JSON.parse(readFileSync(artSource(`environments/${stage}_tiles.json`), 'utf8'));

  it('matches the supplied tile names in index order', () => {
    const tiles = stageJson('valcendre').tiles;
    expect(tiles).toHaveLength(TILESET_TILE_COUNT);
    expect(tiles.map((t: { name: string }) => t.name)).toEqual([...TILE_NAMES]);
  });

  it('confirms all four stages share one schema, so the mapping is reusable', () => {
    const reference = stageJson('valcendre').tiles.map((t: { name: string }) => t.name);
    for (const stage of STAGE_KEYS) {
      expect(stageJson(stage).tiles.map((t: { name: string }) => t.name), stage).toEqual(reference);
    }
  });

  it('maps every gameplay role onto a tile the tileset defines', () => {
    for (const def of Object.values(TILE_ROLES)) {
      expect(TILE_NAMES, def.role).toContain(def.tile);
      expect(tileIndex(def.tile), def.role).toBeGreaterThanOrEqual(0);
    }
  });

  it('never marks a tile the artwork calls solid as walkable', () => {
    const art = new Map(
      stageJson('valcendre').tiles.map((t: { name: string; solid: boolean }) => [t.name, t.solid])
    );
    for (const def of Object.values(TILE_ROLES)) {
      if (art.get(def.tile)) {
        expect(def.flags.collides, `${def.role} -> ${def.tile}`).toBe(true);
      }
    }
  });

  it('only uses non-solid tiles for floor variation', () => {
    const art = new Map(
      stageJson('valcendre').tiles.map((t: { name: string; solid: boolean }) => [t.name, t.solid])
    );
    for (const [surface, names] of Object.entries(FLOOR_VARIANTS)) {
      for (const name of names) {
        expect(art.get(name), `${surface} variant ${name}`).toBe(false);
      }
    }
  });
});

describe('prop metadata', () => {
  it('declares the real on-disk dimensions for every prop', () => {
    for (const def of PROPS.values()) {
      const size = pngSize(publicPath(`assets/props/${def.area}/${def.name}_${def.width}x${def.height}.png`));
      expect(size, `${def.area}.${def.name}`).toEqual({ width: def.width, height: def.height });
    }
  });

  it('never makes a footprint as large as the whole sprite rectangle', () => {
    for (const def of PROPS.values()) {
      if (!def.footprint) continue;
      expect(def.footprint.height, `${def.name} height`).toBeLessThan(def.height);
      expect(def.footprint.width, `${def.name} width`).toBeLessThanOrEqual(def.width);
    }
  });

  it('only gives cover to props that actually block something', () => {
    for (const def of PROPS.values()) {
      if (def.cover !== 'none') {
        expect(def.blocksMove, `${def.name}`).toBe(true);
        expect(def.footprint, `${def.name}`).not.toBeNull();
      }
      if (def.cover === 'high') expect(def.blocksSight, `${def.name}`).toBe(true);
    }
  });

  it('gives decorative props no collision at all', () => {
    for (const def of PROPS.values()) {
      if (!def.decorative) continue;
      expect(def.blocksMove, `${def.name}`).toBe(false);
      expect(def.footprint, `${def.name}`).toBeNull();
    }
  });

  it('anchors every prop on a whole pixel', () => {
    for (const def of PROPS.values()) {
      const origin = propOrigin(def);
      expect(origin.y * def.height, `${def.name}`).toBe(def.height - def.feetInset);
      expect(Number.isInteger(origin.x * def.width), `${def.name}`).toBe(true);
    }
  });
});

describe('bitmap font', () => {
  const fontJson = JSON.parse(readFileSync(artSource('ui/font.json'), 'utf8'));

  it('uses the charset from the supplied font.json, in cell order', () => {
    expect(CHARSET).toBe(fontJson.charset);
    for (const [char, index] of Object.entries(fontJson.character_to_index)) {
      expect(CHARSET.indexOf(char), `glyph ${JSON.stringify(char)}`).toBe(index);
    }
  });

  it('matches the supplied cell and glyph geometry', () => {
    expect(fontJson.cell_width).toBe(8);
    expect(fontJson.cell_height).toBe(8);
    expect(fontJson.glyph_width).toBe(GLYPH_WIDTH);
    expect(fontJson.glyph_height).toBe(GLYPH_HEIGHT);
    expect(fontJson.columns).toBe(FONT_COLUMNS);
  });

  it('fits every charset glyph inside the sheet', () => {
    const size = pngSize(publicPath('assets/ui/font_5x7_in_8x8_cells.png'));
    const cells = (size.width / 8) * (size.height / 8);
    expect(CHARSET.length).toBeLessThanOrEqual(cells);
  });

  it('covers every character the game actually renders', () => {
    const used = new Set(
      [
        'OBJECTIVE: ',
        'HP ',
        'SUPPRESSED PISTOL  8 / 24  RELOADING 100%',
        'E - TAKEDOWN',
        'E - READ TRANSPORT LOG',
        'ESC RESUME     K RESTART CHECKPOINT     Q QUIT TO TITLE',
        "TELL THE PRESIDENT TO SEND A BOTTLE.",
        'VALCENDRE CLEARED',
        'TIME 0:00',
        '[A GUARD SHOUTS]',
      ]
        .join('')
        .toUpperCase()
    );
    for (const char of used) {
      expect(CHARSET.includes(char), `missing glyph ${JSON.stringify(char)}`).toBe(true);
    }
  });
});
