import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSETS,
  ASSETS_BY_KEY,
  CHARACTER_SHEETS,
  textureKey,
} from '../src/art/AssetRegistry';
import {
  CHARACTERS,
  CHAR_STATES,
  DIR_DISTINCT_POSES,
  DIR_ROW_LOCATION,
  FACINGS,
  LOOKOUT_MUZZLE_OFFSET,
  clipFor,
  dirFrameIndex,
} from '../src/art/CharacterDefinitions';
import {
  COBBLE_VARIANTS,
  MARKET_REGION,
  V2_ARCH,
  V2_ARCH_OVERLAYS,
  V2_BUILDINGS,
  V2_DEPTH,
  V2_FOUNTAIN,
  V2_REFERENCE_ONLY_FILES,
  V2_STALL,
  V2_TEXTURES,
  pavingVariant,
  sortedDepth,
} from '../src/art/ValcendreV2';
import { TILE } from '../src/core/constants';
import { TILE_NAMES } from '../src/art/TilesetRegistry';

/**
 * Phase B.2-04 art integration.
 *
 * These assert the INTEGRATION CONTRACT, not that textures merely exist: the
 * approved files are registered at their declared sizes, the proof's tile
 * indices are the manifest's own and are never confused with the legacy
 * sheet's, the legacy assets stay loadable so the proof is reversible, no
 * preview or contact sheet is registered as a gameplay texture, and the
 * gameplay geometry the artwork decorates is byte-for-byte unchanged.
 */

const ROOT = new URL('..', import.meta.url).pathname;
// The approved package lives under `art-source/`, NOT under `public/`: anything
// in `public/` is copied verbatim into `dist/` by Vite and served, and the
// source package - previews, contact sheets, validation reports, 1.1MB in all -
// is not game content and must not ship in the web bundle. Only the ten
// production PNGs are copied into `public/assets/`.
const PKG = `${ROOT}art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1`;

const map = JSON.parse(readFileSync(`${ROOT}public/assets/maps/village.json`, 'utf8')) as {
  width: number;
  height: number;
  layers: { name: string; type: string; data?: number[]; objects?: unknown[] }[];
  tilesets: { firstgid: number }[];
};
const layer = (n: string) => map.layers.find((l) => l.name === n);
const firstgid = map.tilesets[0].firstgid;
const at = (n: string, tx: number, ty: number) => {
  const d = layer(n)?.data;
  if (!d) return -1;
  const g = d[ty * map.width + tx];
  return g === 0 ? -1 : g - firstgid;
};
const solid = (tx: number, ty: number) =>
  ['collision', 'cover', 'propCollision'].some((n) => at(n, tx, ty) >= 0);

// =====================================================================
// 1. asset loading
// =====================================================================
describe('1. approved assets are registered correctly', () => {
  const EXPECTED: [string, string, number, number, number | undefined][] = [
    [V2_TEXTURES.cobble, 'assets/environments/valcendre_proof_cobble_16x16.png', 64, 16, 4],
    [V2_TEXTURES.architecture, 'assets/environments/valcendre_proof_architecture_16x16.png', 128, 64, 32],
    [V2_TEXTURES.window, 'assets/environments/valcendre_proof_window_32x32.png', 32, 32, undefined],
    [V2_TEXTURES.door, 'assets/environments/valcendre_proof_door_16x32.png', 16, 32, undefined],
    [V2_TEXTURES.fountain, 'assets/props/valcendre/valcendre_fountain_32x32.png', 32, 32, undefined],
    [V2_TEXTURES.stallBase, 'assets/props/valcendre/valcendre_market_stall_base_80x48.png', 80, 48, undefined],
    [V2_TEXTURES.stallCanopy, 'assets/props/valcendre/valcendre_market_stall_canopy_80x48.png', 80, 48, undefined],
  ];

  it('registers every approved file at its exact declared size', () => {
    for (const [key, path, w, h, frames] of EXPECTED) {
      const a = ASSETS_BY_KEY.get(key);
      expect(a, `${key} is not registered`).toBeDefined();
      expect(a!.path, key).toBe(path);
      expect(a!.width, `${key} width`).toBe(w);
      expect(a!.height, `${key} height`).toBe(h);
      if (frames !== undefined) {
        expect(a!.frameWidth, `${key} frameWidth`).toBe(TILE);
        expect(a!.frameHeight, `${key} frameHeight`).toBe(TILE);
        expect(a!.frameCount, `${key} frameCount`).toBe(frames);
      }
    }
  });

  it('matches the bytes actually on disk', () => {
    // Guards against a manifest that drifts from the files: the dimensions in
    // the registry are re-read from the PNG headers.
    for (const [key, path, w, h] of EXPECTED) {
      const bytes = readFileSync(`${ROOT}public/${path}`);
      expect(bytes.subarray(1, 4).toString(), key).toBe('PNG');
      // IHDR width/height are big-endian at byte 16 and 20.
      expect(bytes.readUInt32BE(16), `${key} on-disk width`).toBe(w);
      expect(bytes.readUInt32BE(20), `${key} on-disk height`).toBe(h);
    }
  });

  it('is byte-identical to the approved source package', () => {
    const pairs: [string, string][] = [
      ['environments/valcendre_proof_cobble_16x16.png', '02_architecture/valcendre_proof_cobble_16x16.png'],
      ['environments/valcendre_proof_architecture_16x16.png', '02_architecture/valcendre_proof_architecture_16x16.png'],
      ['environments/valcendre_proof_window_32x32.png', '02_architecture/valcendre_proof_window_32x32.png'],
      ['environments/valcendre_proof_door_16x32.png', '02_architecture/valcendre_proof_door_16x32.png'],
      ['props/valcendre/valcendre_fountain_32x32.png', '03_props/fountain/valcendre_fountain_32x32.png'],
      ['props/valcendre/valcendre_market_stall_base_80x48.png', '03_props/market_stall/valcendre_market_stall_base_80x48.png'],
      ['props/valcendre/valcendre_market_stall_canopy_80x48.png', '03_props/market_stall/valcendre_market_stall_canopy_80x48.png'],
      ['characters/lookout_guard_24x32_dir.png', '04_characters/lookout_guard/lookout_guard_24x32_dir.png'],
      ['characters/lookout_guard_24x32_dir_b.png', '04_characters/lookout_guard/lookout_guard_24x32_dir_b.png'],
      ['characters/lookout_guard_walk_side_24x32.png', '04_characters/lookout_guard/lookout_guard_walk_side_24x32.png'],
    ];
    for (const [dest, src] of pairs) {
      const a = readFileSync(`${ROOT}public/assets/${dest}`);
      const b = readFileSync(`${PKG}/${src}`);
      expect(a.equals(b), `${dest} differs from the approved source`).toBe(true);
    }
  });

  it('never registers a preview, contact sheet or reference strip as a texture', () => {
    const banned = /_contact|_context_|_comparison|_overview|compatibility|_mock|_occlusion|material_comparison|walk_side/i;
    for (const a of ASSETS) {
      expect(banned.test(a.path), `${a.key} -> ${a.path} looks like a review image`).toBe(false);
    }
    // The side-walk strip ships in the package and is deliberately unregistered:
    // the art manifest says it duplicates row 0 of the secondary sheet.
    for (const f of V2_REFERENCE_ONLY_FILES) {
      expect(ASSETS.some((a) => a.path.endsWith(f)), `${f} must stay unregistered`).toBe(false);
    }
  });

  it('collides with no existing texture key', () => {
    const keys = ASSETS.map((a) => a.key);
    expect(new Set(keys).size, 'duplicate texture keys').toBe(keys.length);
  });

  it('keeps every legacy asset available so the proof is reversible', () => {
    for (const key of [
      textureKey.tileset('valcendre'),
      textureKey.character('lookout_guard'),
      textureKey.prop('valcendre', 'fountain'),
      textureKey.prop('valcendre', 'stone_cover'),
    ]) {
      expect(ASSETS_BY_KEY.has(key), `${key} must remain registered`).toBe(true);
    }
    // The legacy tilesheet keeps all 48 slots.
    expect(ASSETS_BY_KEY.get(textureKey.tileset('valcendre'))!.frameCount).toBe(48);
    expect(TILE_NAMES).toHaveLength(48);
  });
});

// =====================================================================
// 2. architecture
// =====================================================================
describe('2. architecture atlas mapping', () => {
  it('uses the manifest semantic indices, 8 columns x 4 rows', () => {
    const manifest = JSON.parse(
      readFileSync(`${PKG}/02_architecture/valcendre_proof_manifest.json`, 'utf8')
    ) as { files: { filename: string; atlas?: { columns: number; rows: number }; tiles?: { index: number; name: string }[] }[] };
    const atlas = manifest.files.find((f) => f.filename.includes('architecture'))!;
    expect(atlas.atlas!.columns).toBe(8);
    expect(atlas.atlas!.rows).toBe(4);
    for (const t of atlas.tiles!) {
      expect(V2_ARCH[t.name as keyof typeof V2_ARCH], `index for ${t.name}`).toBe(t.index);
    }
    expect(Object.keys(V2_ARCH)).toHaveLength(32);
  });

  it('does not reuse the legacy tilesheet numbering', () => {
    // Same number, different meaning: the proof's 8 is a corner, the legacy
    // sheet's 8 is a flat wall. Confusing them is the main integration hazard.
    expect(V2_ARCH.wall_corner_tl).toBe(8);
    expect(TILE_NAMES[8]).toBe('wall_solid');
    expect(V2_ARCH.roof_slate_a).toBe(16);
    expect(TILE_NAMES[16]).toBe('wall_corner_bl');
  });

  it('declares the three structural shadows as overlays', () => {
    expect(V2_ARCH_OVERLAYS).toEqual(['shade_footing', 'shade_under_eave', 'shade_corner']);
    for (const n of V2_ARCH_OVERLAYS) expect(V2_ARCH[n]).toBeGreaterThanOrEqual(13);
  });

  it('places every building module on an EXISTING solid tile', () => {
    for (const b of V2_BUILDINGS) {
      expect(b.rows, `${b.name} row count`).toHaveLength(b.h);
      for (let r = 0; r < b.h; r++) {
        expect(b.rows[r], `${b.name} row ${r} width`).toHaveLength(b.w);
        for (let c = 0; c < b.w; c++) {
          expect(
            solid(b.x + c, b.y + r),
            `${b.name} paints ${b.x + c},${b.y + r} which is NOT already solid`
          ).toBe(true);
          expect(V2_ARCH[b.rows[r][c]], `${b.name} unknown module`).toBeDefined();
        }
      }
    }
  });

  it('keeps every building inside the authorised market region', () => {
    for (const b of V2_BUILDINGS) {
      expect(b.x).toBeGreaterThanOrEqual(MARKET_REGION.x);
      expect(b.y).toBeGreaterThanOrEqual(MARKET_REGION.y);
      expect(b.x + b.w).toBeLessThanOrEqual(MARKET_REGION.x + MARKET_REGION.w);
      expect(b.y + b.h).toBeLessThanOrEqual(MARKET_REGION.y + MARKET_REGION.h);
    }
  });

  it('confirms the two footprints are the ones the art direction named', () => {
    const west = V2_BUILDINGS.find((b) => b.name === 'market_hall_west')!;
    const east = V2_BUILDINGS.find((b) => b.name === 'market_hall_east')!;
    expect([west.x, west.y, west.w, west.h]).toEqual([17, 41, 4, 4]);
    expect([east.x, east.y, east.w, east.h]).toEqual([27, 44, 5, 3]);
  });

  it('does not use the plaster-backed window or door on any wall', () => {
    // Both components carry an opaque plaster backdrop, so placing one over
    // ashlar limestone would stamp a rectangular patch. Neither is placed by
    // this proof; see the follow-up request for a limestone-backed variant.
    const used = V2_BUILDINGS.flatMap((b) => b.rows.flat());
    expect(used).not.toContain('threshold');
    const names = new Set(used);
    expect(names.has('wall_limestone_a') || names.has('wall_limestone_b')).toBe(false);
  });
});

// =====================================================================
// 3. paving
// =====================================================================
describe('3. paving', () => {
  it('is deterministic: the same tile always gets the same variant', () => {
    for (let i = 0; i < 200; i++) {
      const tx = 9 + (i % 34);
      const ty = 30 + (i % 28);
      expect(pavingVariant(tx, ty)).toBe(pavingVariant(tx, ty));
      expect(pavingVariant(tx, ty)).toBeGreaterThanOrEqual(0);
      expect(pavingVariant(tx, ty)).toBeLessThan(COBBLE_VARIANTS);
    }
  });

  it('uses all four variants and is not a checkerboard', () => {
    const counts = [0, 0, 0, 0];
    for (let ty = MARKET_REGION.y; ty < MARKET_REGION.y + MARKET_REGION.h; ty++)
      for (let tx = MARKET_REGION.x; tx < MARKET_REGION.x + MARKET_REGION.w; tx++)
        counts[pavingVariant(tx, ty)]++;
    for (const c of counts) expect(c, 'every variant must appear').toBeGreaterThan(0);
    // A checkerboard would make the variant a function of (x+y) parity only.
    const parityOnly = new Set<string>();
    for (let ty = 30; ty < 40; ty++)
      for (let tx = 9; tx < 20; tx++) parityOnly.add(`${(tx + ty) % 2}:${pavingVariant(tx, ty)}`);
    expect(parityOnly.size, 'variant is not determined by parity alone').toBeGreaterThan(2);
  });

  it('draws below the legacy decor and never sorts with actors', () => {
    // floor 0 < paving < decorBack 1, and far below the actor band at 10.
    expect(V2_DEPTH.paving).toBeGreaterThan(0);
    expect(V2_DEPTH.paving).toBeLessThan(1);
    expect(V2_DEPTH.groundShade).toBeLessThan(1);
    expect(V2_DEPTH.paving).toBeLessThan(V2_DEPTH.groundShade);
    expect(V2_DEPTH.sortBase).toBe(10);
  });
});

// =====================================================================
// 4. props
// =====================================================================
describe('4. fountain and stall contracts', () => {
  it('leaves the fountain at its existing authored tile', () => {
    const objects = (map.layers.find((l) => l.type === 'objectgroup')!.objects ?? []) as {
      name: string;
      x: number;
      y: number;
    }[];
    const f = objects.find((o) => o.name === V2_FOUNTAIN.mapObject)!;
    expect(f, 'the fountain map object must still exist').toBeDefined();
    expect([Math.floor(f.x / TILE), Math.floor(f.y / TILE)]).toEqual([24, 47]);
  });

  it('turns the authoring anchor into an origin, not a new coordinate', () => {
    // The art manifest's (16,29) is a bottom-centre anchor inside a 32x32
    // frame; as an origin that is (0.5, 0.90625).
    expect(V2_FOUNTAIN.originX).toBeCloseTo(0.5, 5);
    expect(V2_FOUNTAIN.originY).toBeCloseTo(29 / 32, 5);
    const manifest = JSON.parse(
      readFileSync(`${PKG}/03_props/fountain/valcendre_fountain_manifest.json`, 'utf8')
    ) as { anchor: { local_pixel: number[] } };
    expect(manifest.anchor.local_pixel).toEqual([16, 29]);
  });

  it('registers the stall against the EXISTING cover run', () => {
    expect(V2_STALL.coverTiles).toEqual({ x0: 29, x1: 33, y: 49 });
    for (let tx = V2_STALL.coverTiles.x0; tx <= V2_STALL.coverTiles.x1; tx++) {
      expect(at('cover', tx, V2_STALL.coverTiles.y) >= 0, `cover at ${tx},49`).toBe(true);
    }
    // The art's world origin lands the 80x48 envelope on that run.
    expect(V2_STALL.worldX).toBe(V2_STALL.coverTiles.x0 * TILE);
    expect(V2_STALL.worldY + V2_STALL.sizePx[1]).toBe((V2_STALL.coverTiles.y + 1) * TILE);
    expect(V2_STALL.sizePx).toEqual([80, 48]);
  });

  it('adds no collision, cover or concealment anywhere under the stall art', () => {
    // The art is 80x48 = 5x3 tiles. Only the bottom row may be solid, and it
    // was solid before this task. Everything else stays walkable.
    const x0 = V2_STALL.worldX / TILE;
    const y0 = V2_STALL.worldY / TILE;
    for (let ty = y0; ty < y0 + 3; ty++) {
      for (let tx = x0; tx < x0 + 5; tx++) {
        if (ty === V2_STALL.coverTiles.y) continue; // pre-existing cover row
        expect(solid(tx, ty), `${tx},${ty} under the stall must stay walkable`).toBe(false);
        expect(at('shadowZones', tx, ty) >= 0, `${tx},${ty} concealment changed`).toBe(false);
      }
    }
  });

  it('keeps the V1 evidence tile walkable and reachable under the canopy', () => {
    const e = V2_STALL.evidenceTile;
    expect([e.x, e.y]).toEqual([30, 47]);
    expect(solid(e.x, e.y), 'the evidence tile must stay standable').toBe(false);
    const objects = (map.layers.find((l) => l.type === 'objectgroup')!.objects ?? []) as {
      name: string;
      x: number;
      y: number;
    }[];
    const clue = objects.find((o) => o.name === 'interact_stall')!;
    expect([Math.floor(clue.x / TILE), Math.floor(clue.y / TILE)]).toEqual([30, 47]);
  });

  it('draws the evidence glint and the HUD prompt above the canopy', () => {
    // This is what keeps the mandatory clue discoverable even when the canopy
    // overlaps the actor standing on it: the glint layer is depth 19 and the HUD
    // is 100+, both far above the y-sorted prop band.
    const canopyDepth = sortedDepth((V2_STALL.coverTiles.y + 1) * TILE);
    expect(canopyDepth).toBeLessThan(19);
    expect(canopyDepth).toBeLessThan(100);
    expect(canopyDepth).toBeGreaterThan(V2_DEPTH.sortBase);
  });

  it('sorts both stall layers against actors by the same world row', () => {
    const row = (V2_STALL.coverTiles.y + 1) * TILE;
    // An actor south of the counter outranks the stall; one north of it does not.
    const actorInFront = sortedDepth((V2_STALL.coverTiles.y + 1) * TILE + TILE);
    const actorBehind = sortedDepth(V2_STALL.coverTiles.y * TILE - TILE);
    expect(actorInFront).toBeGreaterThan(sortedDepth(row));
    expect(actorBehind).toBeLessThan(sortedDepth(row));
  });
});

// =====================================================================
// 5. Lookout
// =====================================================================
describe('5. Lookout directional integration', () => {
  it('registers both directional sheets at 144x160 with 30 frames', () => {
    for (const suffix of ['dir_a', 'dir_b']) {
      const key = textureKey.characterSheet('lookout_guard', suffix);
      const a = ASSETS_BY_KEY.get(key);
      expect(a, `${key} missing`).toBeDefined();
      expect([a!.width, a!.height]).toEqual([144, 160]);
      expect(a!.frameWidth).toBe(24);
      expect(a!.frameHeight).toBe(32);
      expect(a!.frameCount).toBe(30);
    }
    expect(CHARACTER_SHEETS.lookout_guard.length).toBe(3); // atlas + both dir sheets
  });

  it('maps every clip to the manifest row and frame indices', () => {
    const manifest = JSON.parse(
      readFileSync(`${PKG}/04_characters/lookout_guard/lookout_guard_manifest.json`, 'utf8')
    ) as { animation: Record<string, { sheet: string; row: number; distinct_poses: number }> };

    for (const [rowName, spec] of Object.entries(manifest.animation)) {
      const loc = DIR_ROW_LOCATION[rowName as keyof typeof DIR_ROW_LOCATION];
      expect(loc, `${rowName} has no engine location`).toBeDefined();
      expect(loc.row, `${rowName} row`).toBe(spec.row);
      const wantSheet = spec.sheet.includes('_b') ? 'dir_b' : 'dir_a';
      expect(loc.sheet, `${rowName} sheet`).toBe(wantSheet);
      expect(DIR_DISTINCT_POSES[rowName as keyof typeof DIR_DISTINCT_POSES], `${rowName} poses`).toBe(
        spec.distinct_poses
      );
    }
  });

  it('points every clip at a lookout directional sheet with in-range frames', () => {
    const a = textureKey.characterSheet('lookout_guard', 'dir_a');
    const b = textureKey.characterSheet('lookout_guard', 'dir_b');
    for (const state of CHAR_STATES) {
      for (const facing of FACINGS) {
        const clip = clipFor('lookout_guard', state, facing);
        expect([a, b], `${state}/${facing} sheet`).toContain(clip.sheet);
        for (const f of clip.frames) {
          expect(f, `${state}/${facing} frame`).toBeGreaterThanOrEqual(0);
          expect(f, `${state}/${facing} frame`).toBeLessThan(30);
        }
      }
    }
  });

  it('mirrors only the side rows, never up or down', () => {
    for (const state of CHAR_STATES) {
      expect(clipFor('lookout_guard', state, 'down').flipX, `${state} down`).toBe(false);
      expect(clipFor('lookout_guard', state, 'up').flipX, `${state} up`).toBe(false);
      expect(clipFor('lookout_guard', state, 'right').flipX, `${state} right`).toBe(false);
    }
    for (const state of ['idle', 'walk', 'aim', 'fire'] as const) {
      expect(clipFor('lookout_guard', state, 'left').flipX, `${state} left`).toBe(true);
      // Left must be the same source row as right, just mirrored.
      expect(clipFor('lookout_guard', state, 'left').frames).toEqual(
        clipFor('lookout_guard', state, 'right').frames
      );
    }
  });

  it('uses the real back view instead of falling back to the front', () => {
    // The legacy atlas had no back view and reused the front idle. The approved
    // sheet has one, so up must be its own row.
    const idleUp = clipFor('lookout_guard', 'idle', 'up');
    const idleDown = clipFor('lookout_guard', 'idle', 'down');
    expect(idleUp.frames).not.toEqual(idleDown.frames);
    expect(idleUp.source).toBe('authored');
    expect(clipFor('lookout_guard', 'walk', 'up').source).toBe('authored');
    expect(dirFrameIndex(DIR_ROW_LOCATION.idle_up.row, 0)).toBe(6);
  });

  it('tags aim and fire as in-frame weapons so no overlay is ever added', () => {
    for (const facing of FACINGS) {
      expect(clipFor('lookout_guard', 'aim', facing).weapon, `aim ${facing}`).toBe('in-frame');
      expect(clipFor('lookout_guard', 'fire', facing).weapon, `fire ${facing}`).toBe('in-frame');
    }
    // And nothing in the engine draws a separate enemy gun, so exactly one
    // pistol is visible. This pins that there is no such code path.
    const enemySrc = readFileSync(`${ROOT}src/actors/Enemy.ts`, 'utf8');
    expect(enemySrc).not.toMatch(/weaponSprite|gunOverlay|add\.image\([^)]*pistol/i);
  });

  it('plays the approved fire row when a guard actually shoots', () => {
    // Found in B.2-04: updateAnimation had no fire branch at all, so a sheet's
    // fire row could never appear. Rendering only - rate of fire, damage and
    // hitscan are untouched.
    const src = readFileSync(`${ROOT}src/actors/Enemy.ts`, 'utf8');
    expect(src).toMatch(/fireAnimTimer/);
    expect(src).toMatch(/this\.fireAnimTimer > 0\s*\?\s*'fire'/);
    expect(src, 'the firing pose must not change the rate of fire').toMatch(
      /this\.attackTimer = this\.def\.attackInterval;\s*\n[\s\S]{0,200}?fireAnimTimer = Math\.min\(/
    );
    expect(clipFor('lookout_guard', 'fire', 'right').frames.length).toBe(3);
  });

  it('keeps a stable feet anchor and the muzzle origins from the manifest', () => {
    const manifest = JSON.parse(
      readFileSync(`${PKG}/04_characters/lookout_guard/lookout_guard_manifest.json`, 'utf8')
    ) as {
      technical: { feet_anchor_local_px: number[]; frame_size_px: number[] };
      muzzle_origin_local_px: Record<string, number[]>;
    };
    expect(manifest.technical.feet_anchor_local_px).toEqual([12, 30]);
    expect(manifest.technical.frame_size_px).toEqual([24, 32]);
    const m = manifest.muzzle_origin_local_px;
    // Offsets are the manifest's local pixels minus the (12,30) anchor.
    expect(LOOKOUT_MUZZLE_OFFSET.right).toEqual({ x: m.aim_side_right[0] - 12, y: m.aim_side_right[1] - 30 });
    expect(LOOKOUT_MUZZLE_OFFSET.left).toEqual({ x: m.aim_side_left_mirrored[0] - 12, y: m.aim_side_left_mirrored[1] - 30 });
    expect(LOOKOUT_MUZZLE_OFFSET.down).toEqual({ x: m.aim_down[0] - 12, y: m.aim_down[1] - 30 });
    expect(LOOKOUT_MUZZLE_OFFSET.up).toEqual({ x: m.aim_up[0] - 12, y: m.aim_up[1] - 30 });
    // Mirrored x must be 23 - source x, as the manifest defines.
    expect(m.aim_side_left_mirrored[0]).toBe(23 - m.aim_side_right[0]);
  });

  it('leaves the other characters and Tempest untouched', () => {
    for (const k of ['enforcer', 'zealot_cultist', 'ascendant_cultist', 'barnabe', 'suzanne'] as const) {
      for (const state of CHAR_STATES)
        for (const facing of FACINGS)
          expect(clipFor(k, state, facing).sheet, `${k} must stay on its atlas`).toBe(
            textureKey.character(k)
          );
    }
    for (const state of CHAR_STATES)
      for (const facing of FACINGS)
        expect(
          [textureKey.characterSheet('tempest', 'dir_a'), textureKey.characterSheet('tempest', 'dir_b')],
          `tempest ${state}/${facing}`
        ).toContain(CHARACTERS.tempest.clips[state][facing].sheet);
  });
});

// =====================================================================
// 6. regression: the artwork changed nothing about the level
// =====================================================================
describe('6. gameplay geometry is untouched by the integration', () => {
  it('keeps the two market hall footprints solid and unchanged in size', () => {
    for (let ty = 41; ty <= 44; ty++)
      for (let tx = 17; tx <= 20; tx++) expect(solid(tx, ty), `west ${tx},${ty}`).toBe(true);
    for (let ty = 44; ty <= 46; ty++)
      for (let tx = 27; tx <= 31; tx++) expect(solid(tx, ty), `east ${tx},${ty}`).toBe(true);
    // And the tile immediately outside each stays walkable, so no footprint grew.
    expect(solid(16, 42)).toBe(false);
    expect(solid(21, 42)).toBe(false);
    expect(solid(26, 45)).toBe(false);
    expect(solid(32, 45)).toBe(false);
  });

  it('keeps every market interactable and both exits in place', () => {
    const objects = (map.layers.find((l) => l.type === 'objectgroup')!.objects ?? []) as {
      name: string;
      x: number;
      y: number;
      properties?: { name: string; value: unknown }[];
    }[];
    const tile = (n: string) => {
      const o = objects.find((x) => x.name === n)!;
      return [Math.floor(o.x / TILE), Math.floor(o.y / TILE)];
    };
    expect(tile('interact_tracks')).toEqual([24, 48]);
    expect(tile('interact_stall')).toEqual([30, 47]);
    expect(tile('interact_waybill')).toEqual([30, 34]);
    expect(tile('interact_radio')).toEqual([31, 34]);
    // Both market exits: the north-west garden passage and the east lane.
    for (let tx = 16; tx <= 19; tx++) expect(solid(tx, 31), `garden mouth ${tx},31`).toBe(false);
    for (let tx = 35; tx <= 42; tx++) expect(solid(tx, 48), `east lane ${tx},48`).toBe(false);
  });

  it('keeps all seven guards and their waypoints walkable', () => {
    const objects = (map.layers.find((l) => l.type === 'objectgroup')!.objects ?? []) as {
      name: string;
      type?: string;
      class?: string;
      x: number;
      y: number;
    }[];
    const enemies = objects.filter((o) => (o.type ?? o.class) === 'enemy');
    expect(enemies).toHaveLength(7);
    const waypoints = objects.filter((o) => (o.type ?? o.class) === 'waypoint');
    for (const w of [...enemies, ...waypoints]) {
      expect(
        solid(Math.floor(w.x / TILE), Math.floor(w.y / TILE)),
        `${w.name} stands on a solid tile`
      ).toBe(false);
    }
  });

  it('does not touch gameplay constants', () => {
    const c = readFileSync(`${ROOT}src/core/constants.ts`, 'utf8');
    expect(c).toMatch(/speedWalk:\s*108/);
    expect(c).toMatch(/speedCrouch:\s*66/);
    expect(c).toMatch(/speedSprint:\s*152/);
    expect(c).toMatch(/coneDegrees:\s*100/);
    expect(c).toMatch(/maxDistance:\s*176/);
    expect(c).toMatch(/SAVE_VERSION = 2/);
  });
});
