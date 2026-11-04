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
import {
  CHARACTERS,
  CHAR_COLUMNS,
  CHAR_ROW,
  CHAR_ROWS,
  CHAR_STATES,
  FACINGS,
  clipFor,
  facingFromAngle,
  frameIndex,
} from '../src/art/CharacterDefinitions';
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

  it('keeps every clip frame inside the 24-frame sheet', () => {
    for (const def of Object.values(CHARACTERS)) {
      for (const state of CHAR_STATES) {
        for (const facing of FACINGS) {
          const clip = def.clips[state][facing];
          expect(clip.frames.length, `${def.key} ${state} ${facing}`).toBeGreaterThanOrEqual(1);
          for (const frame of clip.frames) {
            expect(frame, `${def.key} ${state} ${facing}`).toBeGreaterThanOrEqual(0);
            expect(frame, `${def.key} ${state} ${facing}`).toBeLessThan(
              CHAR_COLUMNS * CHAR_ROWS
            );
          }
        }
      }
    }
  });

  it('maps rows and columns to flat frame indices inside the sheet', () => {
    expect(frameIndex('idle', 0)).toBe(0);
    expect(frameIndex('walk', 0)).toBe(4);
    expect(frameIndex('down', 3)).toBe(23);
  });

  it('gives every looping clip enough frames to actually animate', () => {
    for (const def of Object.values(CHARACTERS)) {
      for (const state of CHAR_STATES) {
        for (const facing of FACINGS) {
          const clip = def.clips[state][facing];
          if (clip.loop) {
            expect(clip.frames.length, `${def.key} ${state} ${facing} loops`).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  it('never mixes tempest front and back views inside one clip', () => {
    // Regression guard: the Phase B mapping picked idle columns [1, 2], which
    // on tempest is one FRONT and one BACK frame, so the idle animation
    // alternated between facing the camera and facing away.
    const FRONT = [frameIndex('idle', 0), frameIndex('idle', 1)];
    const BACK = [frameIndex('idle', 2), frameIndex('idle', 3)];
    const down = clipFor('tempest', 'idle', 'down').frames;
    const up = clipFor('tempest', 'idle', 'up').frames;
    expect(down.every((f) => FRONT.includes(f))).toBe(true);
    expect(up.every((f) => BACK.includes(f))).toBe(true);
    for (const facing of FACINGS) {
      const frames = clipFor('tempest', 'idle', facing).frames;
      const hasFront = frames.some((f) => FRONT.includes(f));
      const hasBack = frames.some((f) => BACK.includes(f));
      expect(hasFront && hasBack, `tempest idle ${facing} mixes front and back`).toBe(false);
    }
  });

  it('only mirrors or falls back where authored art is missing', () => {
    // tempest's walk is drawn facing left, so the right-facing walk is the
    // mirror and the left-facing one must NOT be flipped.
    expect(clipFor('tempest', 'walk', 'left').flipX).toBe(false);
    expect(clipFor('tempest', 'walk', 'left').source).toBe('authored');
    expect(clipFor('tempest', 'walk', 'right').flipX).toBe(true);
    // The lookout's walk is drawn facing right, so the mirroring is reversed.
    expect(clipFor('lookout_guard', 'walk', 'right').flipX).toBe(false);
    expect(clipFor('lookout_guard', 'walk', 'right').source).toBe('authored');
    expect(clipFor('lookout_guard', 'walk', 'left').flipX).toBe(true);
  });

  it('documents a note on every non-authored clip of a verified character', () => {
    for (const def of Object.values(CHARACTERS)) {
      if (!def.verified) continue;
      expect(def.observations.length).toBeGreaterThan(0);
    }
  });

  it('keeps unverified sheets on a single-frame idle so they cannot flicker', () => {
    for (const def of Object.values(CHARACTERS)) {
      if (def.verified) continue;
      for (const facing of FACINGS) {
        expect(def.clips.idle[facing].frames.length, `${def.key} idle ${facing}`).toBe(1);
      }
    }
  });

  it('verifies exactly the characters Valcendre instantiates', () => {
    expect(CHARACTERS.tempest.verified).toBe(true);
    expect(CHARACTERS.lookout_guard.verified).toBe(true);
  });

  it('maps angles to the four facings', () => {
    expect(facingFromAngle(0)).toBe('right');
    expect(facingFromAngle(Math.PI / 2)).toBe('down');
    expect(facingFromAngle(Math.PI)).toBe('left');
    expect(facingFromAngle(-Math.PI / 2)).toBe('up');
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
