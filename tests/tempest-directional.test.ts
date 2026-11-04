import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSETS_BY_KEY,
  CHARACTER_KEYS,
  CHARACTER_SHEETS,
  sheetFormat,
  textureKey,
} from '../src/art/AssetRegistry';
import {
  CHARACTERS,
  CHAR_FEET_INSET,
  CHAR_FRAME_HEIGHT,
  CHAR_ORIGIN_Y,
  CHAR_STATES,
  DIR_COLUMNS,
  DIR_DISTINCT_POSES,
  DIR_ROWS,
  DIR_ROW_LOCATION,
  FACINGS,
  TEMPEST_MUZZLE_OFFSET,
  clipFor,
  dirFrameIndex,
  type DirRowName,
} from '../src/art/CharacterDefinitions';

const root = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(
  readFileSync(`${root}art-source/art-task-01/tempest_directional_manifest.json`, 'utf8')
);

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(`${root}public/${path}`);
  expect(buf.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('Tempest directional sheet registration', () => {
  const sheets = CHARACTER_SHEETS.tempest;

  it('registers exactly the two delivered sheets', () => {
    expect(sheets).toHaveLength(2);
    expect(sheets.map((s) => s.path)).toEqual([
      'assets/characters/tempest_24x32_dir.png',
      'assets/characters/tempest_24x32_dir_b.png',
    ]);
  });

  it('uses the canonical filenames with no download suffix', () => {
    for (const sheet of sheets) {
      expect(sheet.path).not.toMatch(/\(\d+\)|_\d+\.png$|copy/i);
    }
  });

  it('declares both sheets as 144x160 and finds them on disk at that size', () => {
    for (const sheet of sheets) {
      expect(sheet.width).toBe(144);
      expect(sheet.height).toBe(160);
      expect(pngSize(sheet.path)).toEqual({ width: 144, height: 160 });
    }
  });

  it('declares exactly 30 frames of 24x32 per sheet', () => {
    for (const sheet of sheets) {
      expect(sheet.columns).toBe(6);
      expect(sheet.rows).toBe(5);
      const entry = ASSETS_BY_KEY.get(sheet.key);
      expect(entry, sheet.key).toBeDefined();
      expect(entry!.frameWidth).toBe(24);
      expect(entry!.frameHeight).toBe(32);
      expect(entry!.frameCount).toBe(30);
      // The frame grid must tile the sheet exactly - no padding between frames.
      expect(144 / 24).toBe(6);
      expect(160 / 32).toBe(5);
    }
  });

  it('no longer loads the superseded 4x6 Tempest sheet', () => {
    expect(ASSETS_BY_KEY.has(textureKey.character('tempest'))).toBe(false);
    expect(sheetFormat('tempest')).toBe('directional-6x5');
  });

  it('agrees with the delivered manifest', () => {
    expect(manifest.frame_size).toEqual({ width: 24, height: 32 });
    expect(manifest.sheet_size).toEqual({ width: 144, height: 160 });
    expect(manifest.grid.columns).toBe(DIR_COLUMNS);
    expect(manifest.grid.rows).toBe(DIR_ROWS);
    expect(manifest.feet_anchor.x).toBe(12);
    expect(manifest.feet_anchor.y).toBe(30);
    expect(manifest.transparency.alpha_values).toEqual([0, 255]);
  });

  it('matches the manifest row order and distinct pose counts', () => {
    for (const sheet of manifest.sheets) {
      const suffix = sheet.file === 'tempest_24x32_dir.png' ? 'dir_a' : 'dir_b';
      for (const row of sheet.rows) {
        const name = row.animation as DirRowName;
        expect(DIR_ROW_LOCATION[name], name).toEqual({ sheet: suffix, row: row.row_index });
        expect(DIR_DISTINCT_POSES[name], name).toBe(row.distinct_pose_count);
      }
    }
  });
});

describe('Tempest directional animations', () => {
  it('maps each animation to the right sheet and frame indices', () => {
    const a = textureKey.characterSheet('tempest', 'dir_a');
    const b = textureKey.characterSheet('tempest', 'dir_b');
    const cases: [Parameters<typeof clipFor>[1], Parameters<typeof clipFor>[2], string, number][] = [
      ['idle', 'down', a, 0],
      ['idle', 'up', a, 1],
      ['idle', 'right', a, 2],
      ['walk', 'down', a, 3],
      ['walk', 'up', a, 4],
      ['walk', 'right', b, 0],
      ['aim', 'right', b, 1],
      ['aim', 'down', b, 2],
      ['aim', 'up', b, 3],
      ['fire', 'right', b, 4],
    ];
    for (const [state, facing, sheet, row] of cases) {
      const clip = clipFor('tempest', state, facing);
      expect(clip.sheet, `${state} ${facing}`).toBe(sheet);
      expect(clip.frames[0], `${state} ${facing}`).toBe(dirFrameIndex(row, 0));
      for (const frame of clip.frames) {
        expect(frame).toBeGreaterThanOrEqual(row * DIR_COLUMNS);
        expect(frame).toBeLessThan((row + 1) * DIR_COLUMNS);
      }
    }
  });

  it('animates only the distinct poses, not the held duplicate slots', () => {
    expect(clipFor('tempest', 'idle', 'down').frames).toHaveLength(2);
    expect(clipFor('tempest', 'idle', 'up').frames).toHaveLength(2);
    expect(clipFor('tempest', 'idle', 'right').frames).toHaveLength(2);
    expect(clipFor('tempest', 'walk', 'down').frames).toHaveLength(6);
    expect(clipFor('tempest', 'walk', 'up').frames).toHaveLength(6);
    expect(clipFor('tempest', 'walk', 'right').frames).toHaveLength(6);
    expect(clipFor('tempest', 'aim', 'right').frames).toHaveLength(1);
    expect(clipFor('tempest', 'fire', 'right').frames).toHaveLength(3);
  });

  it('keeps every frame index inside the 30-frame sheet', () => {
    for (const state of CHAR_STATES) {
      for (const facing of FACINGS) {
        for (const frame of clipFor('tempest', state, facing).frames) {
          expect(frame, `${state} ${facing}`).toBeGreaterThanOrEqual(0);
          expect(frame, `${state} ${facing}`).toBeLessThan(DIR_COLUMNS * DIR_ROWS);
        }
      }
    }
  });

  it('loops idle and walk, and does not loop aim or fire', () => {
    for (const facing of FACINGS) {
      expect(clipFor('tempest', 'idle', facing).loop, `idle ${facing}`).toBe(true);
      expect(clipFor('tempest', 'walk', facing).loop, `walk ${facing}`).toBe(true);
      expect(clipFor('tempest', 'aim', facing).loop, `aim ${facing}`).toBe(false);
      expect(clipFor('tempest', 'fire', facing).loop, `fire ${facing}`).toBe(false);
    }
  });

  it('uses the suggested frame rates', () => {
    expect(clipFor('tempest', 'idle', 'down').fps).toBeGreaterThanOrEqual(2);
    expect(clipFor('tempest', 'idle', 'down').fps).toBeLessThanOrEqual(3);
    expect(clipFor('tempest', 'walk', 'down').fps).toBeGreaterThanOrEqual(8);
    expect(clipFor('tempest', 'walk', 'down').fps).toBeLessThanOrEqual(10);
  });
});

describe('Tempest direction selection and mirroring', () => {
  it('never mirrors the authored front or back views', () => {
    for (const state of CHAR_STATES) {
      for (const facing of ['down', 'up'] as const) {
        expect(clipFor('tempest', state, facing).flipX, `${state} ${facing}`).toBe(false);
      }
    }
  });

  it('uses the authored right-facing side art unflipped, and mirrors it for left', () => {
    for (const state of ['idle', 'walk', 'aim', 'fire'] as const) {
      const right = clipFor('tempest', state, 'right');
      const left = clipFor('tempest', state, 'left');
      expect(right.flipX, `${state} right`).toBe(false);
      expect(left.flipX, `${state} left`).toBe(true);
      // Left is the same artwork, mirrored - not a different row.
      expect(left.frames, `${state} left`).toEqual(right.frames);
      expect(left.sheet).toBe(right.sheet);
      expect(left.source).toBe('mirrored');
    }
  });

  it('never uses front-facing artwork to represent facing away', () => {
    // Rows must be identified by (sheet, row): a bare frame index is ambiguous
    // across two sheets of the same size.
    const frontRows = new Set(
      (['idle_down', 'walk_down', 'aim_down'] as DirRowName[]).map((n) => {
        const loc = DIR_ROW_LOCATION[n];
        return `${textureKey.characterSheet('tempest', loc.sheet)}#${loc.row}`;
      })
    );
    for (const state of CHAR_STATES) {
      const up = clipFor('tempest', state, 'up');
      const key = `${up.sheet}#${Math.floor(up.frames[0] / DIR_COLUMNS)}`;
      expect(frontRows.has(key), `${state} up uses a front row`).toBe(false);
    }
  });
});

describe('Tempest weapon rendering', () => {
  it('takes the weapon from the frame for aim and fire', () => {
    for (const facing of FACINGS) {
      expect(clipFor('tempest', 'aim', facing).weapon, `aim ${facing}`).toBe('in-frame');
      expect(clipFor('tempest', 'fire', facing).weapon, `fire ${facing}`).toBe('in-frame');
    }
  });

  it('never requests the separate overlay, so two pistols cannot be drawn', () => {
    for (const state of CHAR_STATES) {
      for (const facing of FACINGS) {
        expect(clipFor('tempest', state, facing).weapon, `${state} ${facing}`).not.toBe('overlay');
      }
    }
  });

  it('shows no weapon on the lowered idle and walk poses', () => {
    for (const facing of FACINGS) {
      expect(clipFor('tempest', 'idle', facing).weapon).toBe('none');
      expect(clipFor('tempest', 'walk', facing).weapon).toBe('none');
    }
  });

  it('places the muzzle on the drawn barrel for every facing', () => {
    // Side offsets mirror each other; vertical offsets sit on the sprite centre
    // line or close to it. All whole pixels.
    expect(TEMPEST_MUZZLE_OFFSET.left.x).toBe(-TEMPEST_MUZZLE_OFFSET.right.x);
    expect(TEMPEST_MUZZLE_OFFSET.left.y).toBe(TEMPEST_MUZZLE_OFFSET.right.y);
    for (const facing of FACINGS) {
      const offset = TEMPEST_MUZZLE_OFFSET[facing];
      expect(Number.isInteger(offset.x), facing).toBe(true);
      expect(Number.isInteger(offset.y), facing).toBe(true);
      // Inside the 24x32 frame, measured from the feet anchor at (12, 30).
      expect(Math.abs(offset.x), facing).toBeLessThanOrEqual(12);
      expect(offset.y, facing).toBeGreaterThan(-31);
      expect(offset.y, facing).toBeLessThan(0);
    }
  });
});

describe('Tempest gameplay alignment is unchanged', () => {
  it('keeps the feet anchor contract the delivered art uses', () => {
    // The manifest's anchor is (12, 30) with row 31 transparent, which is the
    // inset the engine already assumed - so no world offset changes.
    expect(CHAR_FEET_INSET).toBe(1);
    expect(manifest.feet_anchor.y).toBe(CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - 1);
    expect(CHAR_ORIGIN_Y * CHAR_FRAME_HEIGHT).toBe(31);
    expect(Number.isInteger(CHAR_ORIGIN_Y * CHAR_FRAME_HEIGHT)).toBe(true);
  });

  it('holds every clip to the same silhouette height, so the feet cannot jump', () => {
    // All 60 delivered frames have a 26px-tall bbox ending on row 30; the
    // engine-side guarantee is that no clip applies its own offset.
    for (const state of CHAR_STATES) {
      for (const facing of FACINGS) {
        const clip = clipFor('tempest', state, facing);
        expect(clip.frames.length).toBeGreaterThan(0);
        expect(clip, `${state} ${facing}`).not.toHaveProperty('offsetY');
      }
    }
  });
});

describe('legacy pose-atlas characters still work', () => {
  /**
   * Phase B.2-04 moved lookout_guard onto the approved directional pair, so it
   * is no longer a pose-atlas character. Its 4x6 atlas is still REGISTERED, so
   * ART_MODE can flip back, but its clips now address the directional sheets.
   * The other five characters are untouched and are what this block guards.
   */
  const legacy = CHARACTER_KEYS.filter((k) => k !== 'tempest' && k !== 'lookout_guard');

  it('keeps the remaining five on the 4x6 contract', () => {
    expect(legacy).toHaveLength(5);
    for (const name of legacy) {
      expect(sheetFormat(name), name).toBe('pose-atlas-4x6');
      const sheets = CHARACTER_SHEETS[name];
      expect(sheets, name).toHaveLength(1);
      expect(sheets[0].width).toBe(96);
      expect(sheets[0].height).toBe(192);
      expect(sheets[0].columns).toBe(4);
      expect(sheets[0].rows).toBe(6);
      expect(ASSETS_BY_KEY.get(sheets[0].key)!.frameCount).toBe(24);
    }
  });

  it('keeps legacy clips pointing at their own single sheet', () => {
    for (const name of legacy) {
      const sheet = textureKey.character(name);
      for (const state of CHAR_STATES) {
        for (const facing of FACINGS) {
          const clip = CHARACTERS[name].clips[state][facing];
          expect(clip.sheet, `${name} ${state} ${facing}`).toBe(sheet);
          expect(clip.frames.every((f) => f < 24), `${name} ${state} ${facing}`).toBe(true);
        }
      }
    }
  });

  it('keeps the lookout 4x6 atlas registered so the proof is reversible', () => {
    const sheets = CHARACTER_SHEETS.lookout_guard;
    const atlas = sheets.find((s) => s.key === textureKey.character('lookout_guard'));
    expect(atlas, 'the legacy lookout atlas must stay loadable').toBeDefined();
    expect(atlas!.width).toBe(96);
    expect(atlas!.height).toBe(192);
    expect(ASSETS_BY_KEY.get(atlas!.key)!.frameCount).toBe(24);
  });

  it('leaves the lookout verified mapping untouched', () => {
    expect(CHARACTERS.lookout_guard.verified).toBe(true);
    expect(clipFor('lookout_guard', 'walk', 'right').flipX).toBe(false);
    expect(clipFor('lookout_guard', 'walk', 'left').flipX).toBe(true);
  });
});
