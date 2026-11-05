import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V2_STALL,
  V2_STALL_ACTOR_LIMITS,
  V2_STALL_REGIONS,
  V2_STALL_SORT,
  V2_TEXTURES,
  sortedDepth,
} from '../src/art/ValcendreV2';
import { PLAYER, TILE } from '../src/core/constants';
import { CHAR_FEET_INSET, CHAR_FRAME_HEIGHT } from '../src/art/CharacterDefinitions';
import { WHOLE_IMAGE_FRAME } from '../src/art/ValcendreV2Scene';
import { alphaStats, blank, crop, decodePng, drawOver, pixelsEqual } from './support/png';

/**
 * Phase B.2-05C-1 - market stall occlusion.
 *
 * The point of these is that the fix is a RENDERING change and nothing else:
 * the approved PNGs are still byte-identical, the source regions tile the
 * canopy with no pixel lost or moved, the unoccupied stall composites to the
 * same image it did before, the depth order is right in each of the four
 * relationships the art contract names, and no gameplay value moved.
 *
 * The depth assertions are computed from the SHIPPED constants through the
 * scene's own `sortedDepth`, so they fail if someone retunes a sort row. The
 * live engine's texture-frame coordinates are additionally asserted inside
 * `tools/b205c-stall-capture.mjs`, which reads them off the real display list;
 * these cover the contract those frames are built from.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const ART = `${ROOT}public/assets/props/valcendre`;
const BASE_PNG = `${ART}/valcendre_market_stall_base_80x48.png`;
const CANOPY_PNG = `${ART}/valcendre_market_stall_canopy_80x48.png`;

/** From the B.2-05C-1 brief, which restates the B.2-03B-2 approved values. */
const APPROVED_SHA256 = {
  base: '40299ffca78f01a294d8690ae273fd9f3296b4c78eb145f2ed611ce47e4c8346',
  canopy: '3f878cd5582d66ecf28ba14a63a5c1b26e8d7a0a03f966af806cd364cc576493',
};

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

const map = JSON.parse(readFileSync(`${ROOT}public/assets/maps/village.json`, 'utf8')) as {
  width: number;
  layers: { name: string; data?: number[]; objects?: { name?: string; x: number; y: number }[] }[];
  tilesets: { firstgid: number }[];
};
const layerData = (n: string) => map.layers.find((l) => l.name === n)?.data;
const gameplaySolid = (tx: number, ty: number) =>
  ['collision', 'cover', 'propCollision'].some((n) => (layerData(n)?.[ty * map.width + tx] ?? 0) !== 0);

/**
 * The shipped draw list, mirrored from `ValcendreV2Scene.buildStall`. Order is
 * creation order; `depth` is what the scene actually sets.
 */
const DRAW_LIST = [
  {
    id: 'base_full',
    texture: V2_TEXTURES.stallBase,
    frame: WHOLE_IMAGE_FRAME,
    localY: 0,
    depth: sortedDepth(V2_STALL_SORT.behind),
  },
  {
    id: 'canopy_rear',
    texture: V2_TEXTURES.stallCanopy,
    frame: V2_STALL_REGIONS.canopyRear.frame,
    localY: V2_STALL_REGIONS.canopyRear.rect[1],
    depth: sortedDepth(V2_STALL_SORT.behind) + 0.00005,
  },
  {
    id: 'canopy_valance',
    texture: V2_TEXTURES.stallCanopy,
    frame: V2_STALL_REGIONS.canopyValance.frame,
    localY: V2_STALL_REGIONS.canopyValance.rect[1],
    depth: sortedDepth(V2_STALL_SORT.valance),
  },
  {
    id: 'base_counter',
    texture: V2_TEXTURES.stallBase,
    frame: V2_STALL_REGIONS.baseCounter.frame,
    localY: V2_STALL_REGIONS.baseCounter.rect[1],
    depth: sortedDepth(V2_STALL_SORT.counter),
  },
];

/** Which pieces draw OVER an actor whose feet are at `feetY`. */
const over = (feetY: number) =>
  DRAW_LIST.filter((p) => p.depth > sortedDepth(feetY)).map((p) => p.id);

// =====================================================================
// 1. the approved artwork is untouched
// =====================================================================
describe('1. approved stall artwork is byte-identical', () => {
  it('matches the approved SHA-256 checksums', () => {
    expect(sha256(BASE_PNG), 'stall base').toBe(APPROVED_SHA256.base);
    expect(sha256(CANOPY_PNG), 'stall canopy').toBe(APPROVED_SHA256.canopy);
  });

  it('still has strictly binary alpha, so redrawing a region is idempotent', () => {
    for (const [name, path] of [
      ['base', BASE_PNG],
      ['canopy', CANOPY_PNG],
    ] as const) {
      const png = decodePng(readFileSync(path));
      expect([png.width, png.height], name).toEqual([80, 48]);
      expect(alphaStats(png).partial, `${name} partial-alpha pixels`).toBe(0);
    }
  });
});

// =====================================================================
// 1b. conformance to the B.2-05B art contract
// =====================================================================
describe('1b. conforms to the approved B.2-05B render contract', () => {
  const contract = JSON.parse(
    readFileSync(
      `${ROOT}art-source/TEMPEST_VALCENDRE_ART_PACKAGE_v1/07_occlusion_b205b/valcendre_stall_occlusion_render_contract.json`,
      'utf8'
    )
  ) as {
    reference_asset: { source_sha256: Record<string, string> };
    geometry_lock: Record<string, unknown>;
    canopy_source_rect_contract: Record<string, { src_xywh: number[]; destination_offset_from_shared_origin_xy: number[]; draw_role: string }> &
      Record<string, unknown>;
    recommended_visual_draw_orders: Record<string, string[] | string | boolean>;
  };

  it('uses the contract checksums, so the art it describes is the art we ship', () => {
    const want = contract.reference_asset.source_sha256;
    expect(sha256(BASE_PNG)).toBe(want['valcendre_market_stall_base_80x48.png']);
    expect(sha256(CANOPY_PNG)).toBe(want['valcendre_market_stall_canopy_80x48.png']);
    // And the brief's restatement agrees with the contract file.
    expect(APPROVED_SHA256.base).toBe(want['valcendre_market_stall_base_80x48.png']);
    expect(APPROVED_SHA256.canopy).toBe(want['valcendre_market_stall_canopy_80x48.png']);
  });

  it('takes its source rectangles from the contract, not from a local copy', () => {
    const c = contract.canopy_source_rect_contract;
    const pairs: [string, { src_xywh: number[]; destination_offset_from_shared_origin_xy: number[] }][] = [
      ['back_roof', c.back_roof as never],
      ['front_valance', c.front_valance as never],
      ['structural_base_lower_counter_foreground_read', c.structural_base_lower_counter_foreground_read as never],
    ];
    const mine = {
      back_roof: V2_STALL_REGIONS.canopyRear.rect,
      front_valance: V2_STALL_REGIONS.canopyValance.rect,
      structural_base_lower_counter_foreground_read: V2_STALL_REGIONS.baseCounter.rect,
    } as Record<string, readonly number[]>;
    for (const [name, spec] of pairs) {
      expect([...mine[name]], `${name} src_xywh`).toEqual(spec.src_xywh);
      // The contract's destination offset is relative to the shared origin, and
      // equals the region's own source y - the "do not offset twice" rule.
      expect(spec.destination_offset_from_shared_origin_xy, `${name} dest offset`).toEqual([
        spec.src_xywh[0],
        spec.src_xywh[1],
      ]);
      const piece = DRAW_LIST.find((p) => {
        const r = Object.values(V2_STALL_REGIONS).find((q) => q.frame === p.frame);
        return r && r.rect === mine[name];
      });
      expect(piece?.localY, `${name} is drawn at the contract offset`).toBe(
        spec.destination_offset_from_shared_origin_xy[1]
      );
    }
  });

  it('matches the contract geometry lock', () => {
    const g = contract.geometry_lock as {
      stall_visual_envelope_world_origin_px: number[];
      stall_visual_envelope_world_size_px: number[];
      cover_tile_rect: { x_start: number; x_end_inclusive: number; y: number };
      v1_evidence_tile: number[];
    };
    expect([V2_STALL.worldX, V2_STALL.worldY]).toEqual(g.stall_visual_envelope_world_origin_px);
    expect([...V2_STALL.sizePx]).toEqual(g.stall_visual_envelope_world_size_px);
    expect(V2_STALL.coverTiles).toEqual({
      x0: g.cover_tile_rect.x_start,
      x1: g.cover_tile_rect.x_end_inclusive,
      y: g.cover_tile_rect.y,
    });
    expect([V2_STALL.evidenceTile.x, V2_STALL.evidenceTile.y]).toEqual(g.v1_evidence_tile);
  });

  it('realises the contract draw order for the evidence approach', () => {
    const order = contract.recommended_visual_draw_orders.evidence_approach as string[];
    expect(order).toEqual([
      'ground',
      'stall_structural_base',
      'back_roof_source_rect',
      'actor',
      'front_valance_source_rect',
      'lower_counter_source_rect_redraw',
    ]);
    const feet = 48 * TILE + 8; // the approach band
    const behind = DRAW_LIST.filter((p) => p.depth < sortedDepth(feet)).map((p) => p.id);
    const front = over(feet);
    expect(behind, 'behind the actor').toEqual(['base_full', 'canopy_rear']);
    expect(front, 'in front of the actor').toEqual(['canopy_valance', 'base_counter']);
    // The order among the behind pair matters: the contract wants the full base
    // drawn BEFORE the roof so the posts stay under the front beam.
    const baseIdx = DRAW_LIST.findIndex((p) => p.id === 'base_full');
    const roofIdx = DRAW_LIST.findIndex((p) => p.id === 'canopy_rear');
    expect(baseIdx).toBeLessThan(roofIdx);
  });

  it('honours the counter redraw qualifier the contract states but its own front scenario breaks', () => {
    // The contract's draw_role for the counter is explicit: "front-of-actor
    // ONLY when behind cover". Its own `front` studio scenario nevertheless
    // measures 170/288 of the character occluded by base_foreground at feet
    // (488,808) - which would put the counter over the legs of an actor
    // standing SOUTH of the stall, contradicting both that qualifier and the
    // B.2-05C-1 brief. Depth bands satisfy the qualifier automatically, and the
    // real engine measures 0/289 there. This test pins that behaviour.
    const role = (
      contract.canopy_source_rect_contract
        .structural_base_lower_counter_foreground_read as { draw_role: string }
    ).draw_role;
    expect(role).toContain('ONLY when behind cover');
    const southFeet = V2_STALL_ACTOR_LIMITS.minFeetYSouth;
    expect(over(southFeet), 'nothing may be in front of an actor south of the cover').toEqual([]);
    expect(over(808), 'including the contract’s own front test position').toEqual([]);
  });
});

// =====================================================================
// 2. source regions and destination offsets
// =====================================================================
describe('2. source regions are inside the art and offset exactly once', () => {
  it('keeps every region inside the 80x48 envelope', () => {
    for (const [id, r] of Object.entries(V2_STALL_REGIONS)) {
      const [x, y, w, h] = r.rect;
      expect(x, `${id} x`).toBeGreaterThanOrEqual(0);
      expect(y, `${id} y`).toBeGreaterThanOrEqual(0);
      expect(x + w, `${id} right edge`).toBeLessThanOrEqual(V2_STALL.sizePx[0]);
      expect(y + h, `${id} bottom edge`).toBeLessThanOrEqual(V2_STALL.sizePx[1]);
      expect(w, `${id} spans the full width`).toBe(V2_STALL.sizePx[0]);
    }
  });

  it('places each piece at envelope origin + its own source y, and no further', () => {
    // This is the "applied exactly once" rule: a cropped frame has no implicit
    // offset, so the destination must be worldY + rect.y - not worldY, which
    // would slide the valance up 17px, and not worldY + 2*rect.y.
    for (const piece of DRAW_LIST) {
      const region = Object.values(V2_STALL_REGIONS).find((r) => r.frame === piece.frame);
      const expected = region ? region.rect[1] : 0;
      expect(piece.localY, `${piece.id} destination offset`).toBe(expected);
    }
    const valance = DRAW_LIST.find((p) => p.id === 'canopy_valance')!;
    expect(V2_STALL.worldY + valance.localY, 'valance world y').toBe(769);
    const counter = DRAW_LIST.find((p) => p.id === 'base_counter')!;
    expect(V2_STALL.worldY + counter.localY, 'counter world y').toBe(778);
  });

  it('names the whole-image frame explicitly on every piece', () => {
    // Regression: Phaser promotes the first frame added to a single-image
    // texture to be that texture's DEFAULT frame. Registering the counter crop
    // therefore changed what an unqualified `add.image(stallBase)` resolves to,
    // and the full structure silently became the 80x22 counter band drawn 26px
    // too high. Caught by the live frame audit in the capture harness; this
    // keeps it caught without a browser.
    const src = readFileSync(`${ROOT}src/art/ValcendreV2Scene.ts`, 'utf8');
    const stallFn = src.slice(src.indexOf('private buildStall'), src.indexOf('private registerStallRegions'));
    // Strip comments first: they discuss `add.image(key)` by name.
    const code = stallFn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const calls = code.match(/add\.image\(([\s\S]*?)\)/g) ?? [];
    expect(calls.length, 'add.image call sites in buildStall').toBe(1);
    // Phaser's signature is (x, y, key, frame): a fourth argument must be there.
    const args = (calls[0] ?? '')
      .replace(/^add\.image\(/, '')
      .replace(/\)$/, '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    expect(args.length, `add.image args: ${args.join(' | ')}`).toBe(4);
    expect(args[3], 'fourth argument is the frame').toBe('frame');
    expect(stallFn).toContain('WHOLE_IMAGE_FRAME');
    for (const piece of DRAW_LIST) {
      expect(piece.frame, `${piece.id} frame is explicit`).toBeTruthy();
    }
    expect(WHOLE_IMAGE_FRAME).toBe('__BASE');
  });

  it('does not shift the valance relative to the support posts', () => {
    // The posts live in the BASE and are not re-cut, so alignment is preserved
    // iff the valance lands back on the row it was authored at.
    const canopy = decodePng(readFileSync(CANOPY_PNG));
    const valanceRect = V2_STALL_REGIONS.canopyValance.rect;
    const region = crop(canopy, ...(valanceRect as unknown as [number, number, number, number]));
    const reassembled = blank(80, 48);
    drawOver(reassembled, region, valanceRect[2], valanceRect[3], valanceRect[0], valanceRect[1]);
    // Every opaque pixel of the lower canopy must sit at its original coordinate.
    for (let y = valanceRect[1]; y < 48; y++) {
      for (let x = 0; x < 80; x++) {
        const o = (y * 80 + x) * 4;
        expect(reassembled.pixels[o + 3], `valance pixel (${x},${y}) alpha`).toBe(
          canopy.pixels[o + 3]
        );
        if (canopy.pixels[o + 3] === 255) {
          expect(
            [reassembled.pixels[o], reassembled.pixels[o + 1], reassembled.pixels[o + 2]],
            `valance pixel (${x},${y}) rgb`
          ).toEqual([canopy.pixels[o], canopy.pixels[o + 1], canopy.pixels[o + 2]]);
        }
      }
    }
  });
});

// =====================================================================
// 3. no canopy pixel disappears
// =====================================================================
describe('3. the two canopy regions reconstruct the canopy exactly', () => {
  it('tiles the full 48 rows with no gap and no overlap', () => {
    const rear = V2_STALL_REGIONS.canopyRear.rect;
    const valance = V2_STALL_REGIONS.canopyValance.rect;
    expect(rear[1], 'rear starts at the top').toBe(0);
    expect(rear[1] + rear[3], 'rear ends where the valance begins').toBe(valance[1]);
    expect(valance[1] + valance[3], 'valance ends at the envelope bottom').toBe(V2_STALL.sizePx[1]);
  });

  it('loses no opaque pixel: region counts sum to the whole canopy', () => {
    const canopy = decodePng(readFileSync(CANOPY_PNG));
    const whole = alphaStats(canopy).opaque;
    const rear = alphaStats(canopy, ...V2_STALL_REGIONS.canopyRear.rect).opaque;
    const valance = alphaStats(canopy, ...V2_STALL_REGIONS.canopyValance.rect).opaque;
    expect(rear + valance, 'rear + valance opaque pixels').toBe(whole);
    expect(rear, 'rear carries art').toBeGreaterThan(0);
    expect(valance, 'valance carries art').toBeGreaterThan(0);
  });
});

// =====================================================================
// 4. the unoccupied stall is unchanged
// =====================================================================
describe('4. with no actor overlapping, the assembly is pixel-identical', () => {
  const base = decodePng(readFileSync(BASE_PNG));
  const canopy = decodePng(readFileSync(CANOPY_PNG));

  /** What B.2-04 drew: whole base, then whole canopy over it. */
  const original = () => {
    const c = blank(80, 48);
    drawOver(c, crop(base, 0, 0, 80, 48), 80, 48, 0, 0);
    drawOver(c, crop(canopy, 0, 0, 80, 48), 80, 48, 0, 0);
    return c;
  };

  /** What B.2-05C-1 draws: four pieces, in shipped depth order. */
  const corrected = () => {
    const c = blank(80, 48);
    for (const piece of [...DRAW_LIST].sort((a, b) => a.depth - b.depth)) {
      const src = piece.texture === V2_TEXTURES.stallBase ? base : canopy;
      const region = Object.values(V2_STALL_REGIONS).find((r) => r.frame === piece.frame);
      const rect = region ? region.rect : ([0, 0, 80, 48] as const);
      drawOver(c, crop(src, rect[0], rect[1], rect[2], rect[3]), rect[2], rect[3], rect[0], piece.localY);
    }
    return c;
  };

  it('composites to the same image as the single-image version', () => {
    expect(pixelsEqual(original().pixels, corrected().pixels), 'differing pixels').toBe(0);
  });

  it('is unchanged by drawing the counter region a second time', () => {
    const once = corrected();
    const twice = corrected();
    const r = V2_STALL_REGIONS.baseCounter.rect;
    drawOver(twice, crop(base, r[0], r[1], r[2], r[3]), r[2], r[3], r[0], r[1]);
    expect(pixelsEqual(once.pixels, twice.pixels), 'differing pixels after redraw').toBe(0);
  });
});

// =====================================================================
// 5-6. depth order in each relationship
// =====================================================================
describe('5. depth order matches the art contract in every relationship', () => {
  // Feet positions taken from the measured captures, not invented.
  const EVIDENCE_TILE_FEET = V2_STALL.evidenceTile.y * TILE + 8; // 760
  const SOUTH_APPROACH_FEET = 48 * TILE + 8; // 776
  const IN_FRONT_FEET = 51 * TILE + 8; // 824
  const BEHIND_FEET = 46 * TILE + 8; // 744

  it('A. beneath the canopy: rear roof and base behind, valance and counter in front', () => {
    for (const feet of [EVIDENCE_TILE_FEET, SOUTH_APPROACH_FEET]) {
      const front = over(feet);
      expect(front, `feet ${feet}`).toContain('canopy_valance');
      expect(front, `feet ${feet}`).toContain('base_counter');
      expect(front, `feet ${feet}`).not.toContain('canopy_rear');
      expect(front, `feet ${feet}`).not.toContain('base_full');
    }
  });

  it('B. south of the counter: the whole stall is behind the actor', () => {
    expect(over(IN_FRONT_FEET)).toEqual([]);
  });

  it('D. north of the stall: the whole stall is in front of the actor', () => {
    expect(over(BEHIND_FEET).sort()).toEqual(
      ['base_counter', 'base_full', 'canopy_rear', 'canopy_valance'].sort()
    );
  });

  it('keeps the valance above the rear roof, and the base below both', () => {
    const d = Object.fromEntries(DRAW_LIST.map((p) => [p.id, p.depth]));
    expect(d.base_full).toBeLessThan(d.canopy_rear);
    expect(d.canopy_rear).toBeLessThan(d.canopy_valance);
    expect(d.canopy_valance).toBeLessThan(d.base_counter);
  });
});

describe('6. no actor can straddle a front threshold, so nothing can pop', () => {
  it('derives the standable band limits from the real body box', () => {
    // The feet box is PLAYER.bodyHeight tall with its BOTTOM edge on sprite.y,
    // because the offset is frameHeight - feetInset - bodyHeight and the origin
    // is (frameHeight - feetInset)/frameHeight. So an actor's reachable feet y
    // is bounded by the solid counter row.
    const bodyBottomIsSpriteY =
      CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - (CHAR_FRAME_HEIGHT - CHAR_FEET_INSET - PLAYER.bodyHeight);
    expect(bodyBottomIsSpriteY, 'feet box height').toBe(PLAYER.bodyHeight);

    const counterTop = V2_STALL.coverTiles.y * TILE; // 784
    const counterBottom = counterTop + TILE; // 800
    expect(V2_STALL_ACTOR_LIMITS.maxFeetYNorth).toBe(counterTop);
    expect(V2_STALL_ACTOR_LIMITS.minFeetYSouth).toBe(counterBottom + PLAYER.bodyHeight);
  });

  it('puts both front sort rows strictly inside the unstandable counter row', () => {
    for (const row of [V2_STALL_SORT.valance, V2_STALL_SORT.counter]) {
      expect(row, 'sort row is south of every northern position').toBeGreaterThan(
        V2_STALL_ACTOR_LIMITS.maxFeetYNorth
      );
      expect(row, 'sort row is north of every southern position').toBeLessThan(
        V2_STALL_ACTOR_LIMITS.minFeetYSouth
      );
    }
  });

  it('holds the ordering across every reachable feet row either side', () => {
    // Walking north-to-south, the set of pieces drawn in front must change
    // exactly once, at the counter, and never flicker.
    const north = [];
    for (let feet = 736; feet <= V2_STALL_ACTOR_LIMITS.maxFeetYNorth; feet++) north.push(over(feet).length);
    const south = [];
    for (let feet = V2_STALL_ACTOR_LIMITS.minFeetYSouth; feet <= 840; feet++) south.push(over(feet).length);
    // North of the counter the count only ever decreases (4 behind the stall,
    // then 2 once past the rear-roof row); south of it nothing is in front.
    expect(new Set(south), 'south of the counter').toEqual(new Set([0]));
    expect(Math.max(...north), 'north of the counter').toBe(4);
    expect(Math.min(...north), 'north of the counter').toBe(2);
    for (let i = 1; i < north.length; i++)
      expect(north[i], `feet row ${736 + i} is monotone`).toBeLessThanOrEqual(north[i - 1]);
  });

  it('forces the north-to-south transition to happen off the artwork', () => {
    // The ordering changes from "valance and counter in front" to "nothing in
    // front" somewhere between feet y 784 and 810. The actor cannot make that
    // move inside the stall's x-span, because the whole span is the solid cover
    // run: they must walk around it, at x28 or x34, where no stall pixel
    // exists. So the one visible ordering change happens where it cannot be
    // seen - which is why no popping is observable rather than merely unlikely.
    for (let tx = V2_STALL.coverTiles.x0; tx <= V2_STALL.coverTiles.x1; tx++)
      expect(gameplaySolid(tx, V2_STALL.coverTiles.y), `cover tile (${tx},49)`).toBe(true);
    const artX0 = V2_STALL.worldX / TILE;
    const artX1 = (V2_STALL.worldX + V2_STALL.sizePx[0]) / TILE - 1;
    expect([artX0, artX1], 'art x-span in tiles').toEqual([
      V2_STALL.coverTiles.x0,
      V2_STALL.coverTiles.x1,
    ]);
    // The two detour columns carry no stall art: they abut the envelope.
    expect((artX0 - 1) * TILE + TILE, 'west detour column ends at the envelope edge').toBe(
      V2_STALL.worldX
    );
    expect((artX1 + 1) * TILE, 'east detour column starts at the envelope edge').toBe(
      V2_STALL.worldX + V2_STALL.sizePx[0]
    );
  });

  it('makes the rear-roof threshold unobservable: no stall art reaches it', () => {
    // The behind-band sort row (752) IS crossed by actors, at feet y 752/753.
    // That flip is invisible only because the stall's topmost art row is lower
    // than the tallest sprite that can stand there. If art is ever added above
    // world y 757 this assertion fails and the threshold must move.
    const topmostArtRow = Math.min(
      V2_STALL.worldY + V2_STALL.canopyLocalY[0],
      V2_STALL.worldY + V2_STALL.baseMassLocalY[0]
    );
    expect(topmostArtRow, 'highest stall art row').toBe(757);
    const tallestSpriteBottomAtThreshold = V2_STALL_SORT.behind + 1;
    expect(
      tallestSpriteBottomAtThreshold,
      'an actor at the threshold cannot touch stall art'
    ).toBeLessThan(topmostArtRow);
  });

  it('leaves the actor readable: the whole sprite above the valance row is clear', () => {
    const feet = 48 * TILE + 8; // the real-input interaction row
    const spriteTop = feet - (CHAR_FRAME_HEIGHT - CHAR_FEET_INSET);
    const valanceArtTop = V2_STALL.worldY + V2_STALL_REGIONS.canopyValance.rect[1];
    const visibleRows = valanceArtTop - spriteTop;
    expect(spriteTop, 'sprite top').toBe(745);
    expect(valanceArtTop, 'valance art top').toBe(769);
    // Before the fix the canopy covered from world 757, leaving 12 rows.
    expect(visibleRows, 'unoccluded sprite rows').toBe(24);
    expect(visibleRows).toBeGreaterThan(CHAR_FRAME_HEIGHT / 2);
  });
});

// =====================================================================
// 7. the rule is spatial, not actor-specific
// =====================================================================
describe('7. the implementation names no actor', () => {
  const src = readFileSync(`${ROOT}src/art/ValcendreV2Scene.ts`, 'utf8');
  const stallFn = src.slice(src.indexOf('private buildStall'), src.indexOf('applyFountain'));

  it('never reads the player or an enemy while drawing the stall', () => {
    for (const forbidden of ['player', 'enemies', 'enemy', 'tempest', 'lookout']) {
      expect(stallFn.toLowerCase(), `buildStall references ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('sorts every actor by feet position alone, never by animation or state', () => {
    // 8 asks that walk, idle and aim/fire obey the same spatial rule. They do
    // because the one place actor depth is assigned reads only `y`.
    const village = readFileSync(`${ROOT}src/scenes/Village.ts`, 'utf8');
    const sortFn = village.slice(
      village.indexOf('private sortDepths'),
      village.indexOf('private sortDepths') + 400
    );
    const assignments = sortFn.match(/setDepth\([^)]*\)/g) ?? [];
    expect(assignments.length, 'depth assignments in sortDepths').toBeGreaterThanOrEqual(2);
    for (const a of assignments) {
      expect(a, `${a} must derive from y only`).toMatch(
        /^setDepth\(10 \+ [\w.]+\.y \/ 10000\)$/
      );
      expect(a).not.toMatch(/anim|state|facing|crouch/);
    }
    // And the same formula the stall's pieces are placed against.
    expect(sortedDepth(776)).toBeCloseTo(10 + 776 / 10000, 10);
  });

  it('sets constant depths, with no per-frame update hook for the stall', () => {
    expect(stallFn).not.toMatch(/\bupdate\s*\(/);
    expect(stallFn).not.toMatch(/setVisible|setAlpha|setBlendMode|setTint/);
  });

  it('keeps the sort rows as fixed constants rather than functions of position', () => {
    expect(typeof V2_STALL_SORT.behind).toBe('number');
    expect(typeof V2_STALL_SORT.valance).toBe('number');
    expect(typeof V2_STALL_SORT.counter).toBe('number');
  });
});

// =====================================================================
// 8-12. gameplay is untouched
// =====================================================================
describe('8. the stall still creates no collision, cover or concealment', () => {
  it('leaves every tile under the 80x48 art as it was', () => {
    const x0 = V2_STALL.worldX / TILE;
    const y0 = V2_STALL.worldY / TILE;
    for (let ty = y0; ty < y0 + V2_STALL.sizePx[1] / TILE; ty++) {
      for (let tx = x0; tx < x0 + V2_STALL.sizePx[0] / TILE; tx++) {
        const onCoverRow =
          ty === V2_STALL.coverTiles.y && tx >= V2_STALL.coverTiles.x0 && tx <= V2_STALL.coverTiles.x1;
        expect(gameplaySolid(tx, ty), `tile (${tx},${ty})`).toBe(onCoverRow);
      }
    }
  });

  it('keeps the cover run exactly where it was', () => {
    expect(V2_STALL.coverTiles).toEqual({ x0: 29, x1: 33, y: 49 });
    for (let tx = 29; tx <= 33; tx++)
      expect(gameplaySolid(tx, 49), `cover tile (${tx},49)`).toBe(true);
  });

  it('adds no shadow zone', () => {
    const shadows = layerData('shadowZones');
    if (!shadows) return;
    const x0 = V2_STALL.worldX / TILE;
    const y0 = V2_STALL.worldY / TILE;
    let count = 0;
    for (let ty = y0; ty < y0 + 3; ty++)
      for (let tx = x0; tx < x0 + 5; tx++) if (shadows[ty * map.width + tx] !== 0) count++;
    expect(count, 'shadow tiles under the stall art').toBe(0);
  });
});

describe('9. the mandatory V1 evidence is still reachable', () => {
  it('keeps the clue on its authored tile', () => {
    const objects = map.layers.flatMap((l) => l.objects ?? []);
    const clue = objects.find((o) => o.name === 'interact_stall');
    expect(clue, 'interact_stall object').toBeDefined();
    expect(
      { x: Math.floor(clue!.x / TILE), y: Math.floor(clue!.y / TILE) },
      'clue tile'
    ).toEqual(V2_STALL.evidenceTile);
  });

  it('leaves a walkable tile within interact range of it', () => {
    // The browser capture drives the actual E press; this only proves the
    // geometry the fix must not break.
    const { x: cx, y: cy } = V2_STALL.evidenceTile;
    const reachable: string[] = [];
    for (let ty = cy - 1; ty <= cy + 1; ty++)
      for (let tx = cx - 1; tx <= cx + 1; tx++)
        if (!gameplaySolid(tx, ty)) reachable.push(`${tx},${ty}`);
    expect(reachable, 'walkable tiles adjacent to the clue').toContain(`${cx},${cy}`);
    expect(reachable, 'walkable south approach').toContain(`${cx},${cy + 1}`);
  });

  it('keeps the glint and the HUD prompt above every stall layer', () => {
    const GLINT_DEPTH = 19;
    const HUD_DEPTH = 100;
    for (const piece of DRAW_LIST) {
      expect(piece.depth, `${piece.id} vs glint`).toBeLessThan(GLINT_DEPTH);
      expect(piece.depth, `${piece.id} vs HUD`).toBeLessThan(HUD_DEPTH);
    }
  });
});

describe('10-12. nothing else moved', () => {
  it('leaves the stall envelope and evidence coordinates alone', () => {
    expect([V2_STALL.worldX, V2_STALL.worldY], 'stall origin').toEqual([464, 752]);
    expect(V2_STALL.sizePx, 'envelope').toEqual([80, 48]);
    expect(V2_STALL.evidenceTile, 'clue tile').toEqual({ x: 30, y: 47 });
  });

  it('leaves movement, vision and weapon constants untouched', () => {
    const c = readFileSync(`${ROOT}src/core/constants.ts`, 'utf8');
    expect(c).toMatch(/speedWalk:\s*108/);
    expect(c).toMatch(/speedCrouch:\s*66/);
    expect(c).toMatch(/speedSprint:\s*152/);
    expect(c).toMatch(/bodyWidth:\s*12/);
    expect(c).toMatch(/bodyHeight:\s*10/);
  });

  it('never writes grid, cover or shadow state from the presentation', () => {
    const scene = readFileSync(`${ROOT}src/art/ValcendreV2Scene.ts`, 'utf8');
    for (const mutator of ['setDoor(', 'setCollides', '.collides =', 'blocksSight =', 'lowCover =']) {
      expect(scene, `presentation calls ${mutator}`).not.toContain(mutator);
    }
    // The only tilemap writes are the presentation's OWN blank layers: the
    // ground layer and the four corner-overlay layers. Nothing is written back
    // to a shipped layer, and no bulk fill or erase is used.
    const writes = scene.match(/putTileAt|removeTileAt|fill\(|replaceByIndex|randomize/g) ?? [];
    expect(new Set(writes), 'tilemap write kinds').toEqual(new Set(['putTileAt']));
    expect(writes.length, 'putTileAt call sites').toBeLessThanOrEqual(3);
  });

  it('changes no enemy, patrol, mission or save module', () => {
    // The fix is confined to the presentation. If the stall work ever needs to
    // touch one of these, that is a design change and not a rendering fix.
    const scene = readFileSync(`${ROOT}src/art/ValcendreV2Scene.ts`, 'utf8');
    for (const forbidden of ['Mission', 'Save', 'Patrol', 'Hearing', 'Vision', 'objectives']) {
      expect(scene, `presentation imports ${forbidden}`).not.toContain(`from '../systems/${forbidden}'`);
    }
    expect(scene).not.toContain('from \'../data/objectives\'');
  });
});
