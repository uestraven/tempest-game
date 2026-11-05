/**
 * Valcendre v2 proof art configuration — Phase B.2-04.
 *
 * ADDITIVE AND REVERSIBLE. Nothing here replaces a legacy asset path or a
 * legacy tile index. The 48-slot `valcendre_tiles_16x16.png` is untouched and
 * still drives every tile layer in `village.json`; this module adds a second,
 * independently indexed tile family plus a handful of placed sprites, drawn on
 * top of the legacy floor inside one authored market region. Setting
 * `ART_MODE` back to `'legacy'` removes every one of them and the game renders
 * exactly as it did before.
 *
 * WHAT THIS MODULE IS NOT: it contains no artwork. Every pixel comes from the
 * approved PNGs copied byte-for-byte out of
 * `TEMPEST_VALCENDRE_ART_PACKAGE_v1`. The tables below are placement data -
 * which approved tile goes at which existing map coordinate - and nothing else.
 *
 * Source package: TEMPEST_VALCENDRE_ART_PACKAGE_v1 (B.2-03D).
 * Tile semantics: 02_architecture/valcendre_proof_manifest.json.
 */

import { textureKey } from './AssetRegistry';

/**
 * Presentation switch. `legacy` is the shipped look; `valcendre_v2_proof` adds
 * the approved market slice. Everything the proof draws is created only in the
 * second mode and destroyed on scene shutdown.
 */
export type ArtMode = 'legacy' | 'valcendre_v2_proof';

export const DEFAULT_ART_MODE: ArtMode = 'valcendre_v2_proof';

/**
 * Resolves the presentation mode once, at module load.
 *
 * `?art=legacy` in the URL selects the shipped look, which is what makes a
 * like-for-like A/B capture possible from a single build - and is the switch
 * the integration brief asks for. Anything else, including no query string at
 * all and any non-browser context such as the test runner, gets the proof.
 */
function resolveArtMode(): ArtMode {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const wanted = new URLSearchParams(location.search).get('art');
      if (wanted === 'legacy') return 'legacy';
      if (wanted === 'valcendre_v2_proof') return 'valcendre_v2_proof';
    }
  } catch {
    /* non-browser context: fall through to the default */
  }
  return DEFAULT_ART_MODE;
}

export const ART_MODE: ArtMode = resolveArtMode();

// --------------------------------------------------------------- texture keys
export const V2_TEXTURES = {
  cobble: 'tiles.valcendre.v2.cobble',
  cobbleShaded: 'tiles.valcendre.v2.cobbleShaded',
  shadeBoundaries: 'tiles.valcendre.v2.shadeBoundaries',
  shadeCorners: 'tiles.valcendre.v2.shadeCorners',
  architecture: 'tiles.valcendre.v2.architecture',
  window: 'tiles.valcendre.v2.window',
  door: 'tiles.valcendre.v2.door',
  fountain: textureKey.prop('valcendre', 'fountain_v2'),
  stallBase: textureKey.prop('valcendre', 'market_stall_base'),
  stallCanopy: textureKey.prop('valcendre', 'market_stall_canopy'),
} as const;

/**
 * The reference side-walk strip ships in the package but is deliberately NOT
 * registered: the art manifest states it is identical to row 0 of the secondary
 * sheet, so loading it would create a second source for one animation.
 * `tests/art-integration.test.ts` asserts it stays unregistered.
 */
export const V2_REFERENCE_ONLY_FILES = ['lookout_guard_walk_side_24x32.png'] as const;

// ------------------------------------------------------------ paving indices
/** `valcendre_proof_cobble_16x16.png` is 64x16: four interchangeable variants. */
export const COBBLE_VARIANTS = 4;

// --------------------------------------------------- architecture tile indices
/**
 * Semantic indices straight from `valcendre_proof_manifest.json`, 8 columns x
 * 4 rows. These are the PROOF atlas's own indices and have no relationship to
 * the legacy 48-slot sheet's indices - index 8 here is `wall_corner_tl`, while
 * index 8 in the legacy sheet is `wall_solid`. Keeping them in one table is
 * what stops the two numbering schemes being confused.
 */
export const V2_ARCH = {
  wall_limestone_a: 0,
  wall_limestone_b: 1,
  wall_plaster: 2,
  wall_plaster_course: 3,
  wall_edge_top: 4,
  wall_edge_bottom: 5,
  wall_edge_left: 6,
  wall_edge_right: 7,
  wall_corner_tl: 8,
  wall_corner_tr: 9,
  wall_corner_bl: 10,
  wall_corner_br: 11,
  wall_plinth: 12,
  shade_footing: 13,
  shade_under_eave: 14,
  shade_corner: 15,
  roof_slate_a: 16,
  roof_slate_b: 17,
  roof_ridge: 18,
  roof_eave: 19,
  roof_edge_left: 20,
  roof_edge_right: 21,
  roof_corner_tl: 22,
  roof_corner_tr: 23,
  roof_corner_bl: 24,
  roof_corner_br: 25,
  roof_to_facade: 26,
  roof_eave_corner_l: 27,
  roof_eave_corner_r: 28,
  roof_ridge_end_l: 29,
  roof_ridge_end_r: 30,
  threshold: 31,
} as const;

export type V2ArchTile = keyof typeof V2_ARCH;

/** The three structural-shadow tiles are binary-alpha overlays, not fills. */
export const V2_ARCH_OVERLAYS: V2ArchTile[] = ['shade_footing', 'shade_under_eave', 'shade_corner'];

// ------------------------------------------------------------ the test region
/**
 * The authorised market slice. Chosen to cover the market square's walkable
 * paving plus the two market halls, the fountain and the stall, and nothing
 * else - the alley, the garden branch and the depot keep the legacy look so the
 * two can be compared in one build.
 */
export const MARKET_REGION = { x: 9, y: 30, w: 34, h: 28 } as const;

/**
 * Surfaces inside the region that the approved paving may replace.
 *
 * Only `marketPaving` and `alleyCobble` are listed: those are the two authored
 * cobbled surfaces. Grass, garden path and the interior floors are left alone
 * because the approved package has no art for them, and inventing a substitute
 * would be exactly the fabrication this task forbids.
 */
export const PAVED_LEGACY_TILES = ['floor_01', 'floor_02', 'floor_03', 'floor_04', 'floor_05', 'floor_06', 'floor_07', 'floor_08', 'cobble', 'brick'] as const;

// ----------------------------------------------- shaded cobble (B.2-05C-2)
/**
 * The authored material the approved cobblestone artwork may be used on.
 *
 * Read from the map's `groundMaterial` layer, which records a SEMANTIC material
 * label per walkable tile rather than the tile its original appearance was
 * drawn with. That distinction is load-bearing: `alleyCobble` and `roadDirt`
 * are both drawn from the `cobble` tile, so keying off the picture classified
 * the north dirt road as cobblestone and gave it paving it should never have
 * had. Keying off the label cannot make that mistake.
 *
 * `brick`, `gravel`, `industrial`, `grass` and `dirt` are all absent on
 * purpose: the B.2-05A packages are cobblestone only, and every other material
 * keeps its existing treatment until matching artwork exists.
 */
export const COBBLE_MATERIAL_KIND = 'cobblestone';

/**
 * The map property that resolves the `groundMaterial` layer's values. A tile
 * holding `n` names the `n - 1`th entry of this comma-separated list, so the
 * runtime looks a material up by NAME and never by assuming an order.
 */
export const MATERIAL_KINDS_PROPERTY = 'groundMaterialKinds';

/**
 * The surface tile the shadow pass paints over shaded walkable ground. A tile
 * whose `floor` is this and whose material is cobblestone is shaded
 * cobblestone; the same material with any other floor tile is daylight.
 *
 * Note the two states are read from two different layers on purpose, and
 * `shadowZones` is never consulted here. Concealment stays the sole property of
 * that layer and the visual state is the floor/material pair, so neither can
 * drift into the other.
 */
export const SHADED_FLOOR_TILE = 'deep_shadow';

/**
 * Deterministic paving variant for a world tile.
 *
 * Authored, not random: the same tile always receives the same variant, in this
 * build and the next, so a screenshot is reproducible and a seam is a real
 * defect rather than luck. The two coefficients are coprime with 4 so the
 * pattern does not fall into rows or columns of one variant, and it does not
 * reduce to a checkerboard.
 */
export function pavingVariant(tx: number, ty: number): number {
  return (tx * 3 + ty * 5) % COBBLE_VARIANTS;
}

// -------------------------------------------------------- building assemblies
/**
 * A building treatment: which approved module goes on which existing map tile.
 *
 * Both footprints are EXISTING solid geometry, confirmed against
 * `village.json`. No tile is added, removed, or changed in the collision,
 * cover or propCollision layers - this is paint on top of walls that are
 * already there.
 *
 * The B.2-03A reference building is 8x6 and fits neither footprint. Rather
 * than resize approved art or widen collision, each footprint gets the best
 * coherent assembly its own height allows, using the manifest's smaller
 * modules.
 */
export interface BuildingAssembly {
  name: string;
  /** Existing solid footprint in map tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** One row of module names per footprint row, left to right. */
  rows: V2ArchTile[][];
  note: string;
}

export const V2_BUILDINGS: BuildingAssembly[] = [
  {
    name: 'market_hall_west',
    x: 17,
    y: 41,
    w: 4,
    h: 4,
    // 4 rows: two roof rows, one facade row, one plinth row. This is the
    // deepest assembly either footprint allows and the only one that gets a
    // full roof (ridge + eave) over a visible facade.
    rows: [
      ['roof_corner_tl', 'roof_ridge', 'roof_ridge', 'roof_corner_tr'],
      ['roof_corner_bl', 'roof_eave', 'roof_eave', 'roof_corner_br'],
      ['wall_edge_left', 'wall_plaster_course', 'wall_plaster_course', 'wall_edge_right'],
      ['wall_corner_bl', 'wall_plinth', 'wall_plinth', 'wall_corner_br'],
    ],
    note:
      'Ridge + eave + facade + plinth in a 4x4 existing footprint. No window: the approved window ' +
      'component is 32x32 and the facade here is a single 16px row, so it cannot be placed without ' +
      'overhanging the roof or the plinth. Logged as an art request.',
  },
  {
    name: 'market_hall_east',
    x: 27,
    y: 44,
    w: 5,
    h: 3,
    // 3 rows. Uses `roof_to_facade`, which the manifest provides precisely for
    // a building only one roof row tall: it carries the eave underside and the
    // top of the plaster facade in one tile.
    rows: [
      ['roof_corner_tl', 'roof_ridge', 'roof_ridge', 'roof_ridge', 'roof_corner_tr'],
      ['roof_eave_corner_l', 'roof_to_facade', 'roof_to_facade', 'roof_to_facade', 'roof_eave_corner_r'],
      ['wall_corner_bl', 'wall_plinth', 'wall_plinth', 'wall_plinth', 'wall_corner_br'],
    ],
    note:
      'Only 3 rows deep, so the roof is one course and the eave/facade transition is carried by ' +
      'roof_to_facade. Shallower than the west hall but coherent, and it exercises the ' +
      'single-row-roof module the manifest supplies for exactly this case.',
  },
];

// ------------------------------------------------------------------ the props
/**
 * Fountain. The approved sprite replaces the legacy fountain TEXTURE at the
 * object's existing authored position; the map object, its tile, its prop
 * footprint and its cover are all untouched.
 *
 * The art manifest records an authoring anchor of (16,29) in a bottom-centre
 * convention. The game anchors props by a per-prop origin, so that anchor
 * becomes an origin of (16/32, 29/32) rather than a new coordinate - the
 * manifest says in as many words that the anchor "is an authoring reference,
 * not an instruction to replace coded origin coordinates".
 */
export const V2_FOUNTAIN = {
  mapObject: 'prop_fountain_5',
  originX: 16 / 32,
  originY: 29 / 32,
  sizePx: [32, 32] as const,
} as const;

/**
 * Market stall. Two 80x48 PNGs sharing local origin (0,0), registered against
 * the EXISTING low-cover run at x29-33, y49.
 *
 * The art manifest proposes world origin (464,752). That is tile (29,47), and
 * it places the 80x48 envelope so its bottom band lands on the cover row at
 * y49 - which matches the existing geometry, so the proposal is adopted
 * unchanged. Verified against `village.json` rather than taken on trust.
 *
 * NO COLLISION IS CREATED. The base's art is 80x48 but the cover it decorates
 * is the pre-existing 5x1 run; the canopy contributes nothing at all.
 */
export const V2_STALL = {
  worldX: 464,
  worldY: 752,
  sizePx: [80, 48] as const,
  coverTiles: { x0: 29, x1: 33, y: 49 },
  /** Base mass sits in local y32..47, i.e. the bottom 16px band. */
  baseMassLocalY: [32, 47] as const,
  /** Canopy sits in local y5..25 and must never occlude the clue below it. */
  canopyLocalY: [5, 25] as const,
  /** The mandatory V1 evidence the canopy must not hide. */
  evidenceTile: { x: 30, y: 47 },
} as const;

// ------------------------------------------- stall occlusion (Phase B.2-05C-1)
/**
 * Source regions of the two approved stall PNGs, as separate draw layers.
 *
 * NO ARTWORK IS MODIFIED. These are windows onto the approved files, registered
 * as extra Phaser texture frames in memory at scene build time. The PNGs stay
 * byte-identical, nothing is repainted, no pixel is deleted, no hole is punched
 * and no opacity is applied. `tests/stall-occlusion.test.ts` asserts the files'
 * checksums and that the two canopy windows reconstruct the canopy exactly.
 *
 * The canopy splits at local y=17. Above it is the awning's rear slope, which
 * an actor beneath the stall should appear IN FRONT of; below it is the front
 * beam and hanging valance, which should stay in front of that actor so the
 * overlap still reads as standing under an awning rather than on top of it.
 *
 * `baseCounter` is the counter's front face, redrawn from the ORIGINAL base in
 * front of an actor standing north of it. The full base is still drawn behind,
 * so this is a second copy of the same pixels at the same destination, not a
 * replacement. Both files have strictly binary alpha (verified in the test), so
 * drawing those pixels twice is idempotent and the unoccupied stall is
 * unchanged.
 */
export const V2_STALL_REGIONS = {
  canopyRear: {
    texture: 'stallCanopy',
    frame: 'valcendre_stall_canopy_rear',
    /** [x, y, w, h] in the source PNG. */
    rect: [0, 0, 80, 17],
  },
  canopyValance: {
    texture: 'stallCanopy',
    frame: 'valcendre_stall_canopy_valance',
    rect: [0, 17, 80, 31],
  },
  baseCounter: {
    texture: 'stallBase',
    frame: 'valcendre_stall_base_counter',
    rect: [0, 26, 80, 22],
  },
} as const satisfies Record<
  string,
  { texture: 'stallBase' | 'stallCanopy'; frame: string; rect: readonly [number, number, number, number] }
>;

export type V2StallRegion = keyof typeof V2_STALL_REGIONS;

/**
 * World rows the stall's layers sort at. Fixed values, not functions of any
 * actor's position: the pieces have constant depth and the ACTORS move through
 * them, which is what makes the result identical for Tempest, for a Lookout,
 * and for several of them on different sides of the stall at once.
 *
 * Why these three numbers and not others - the player's feet box is 10px tall
 * with its bottom edge exactly on `sprite.y`, so against the solid counter row
 * (world y 784..799):
 *
 *   an actor NORTH of the counter can reach at most feet y 784
 *   an actor SOUTH of the counter can reach at best feet y 810
 *
 * Both front thresholds therefore sit inside the 784..799 band, where no actor
 * can ever stand. An actor cannot straddle them, so the ordering can never flip
 * underneath a moving character and there is nothing to pop. The test asserts
 * this containment rather than trusting the comment.
 */
export const V2_STALL_SORT = {
  /** The envelope's north edge: everything that must fall behind an actor. */
  behind: 752,
  /** Centre of the solid counter row. */
  valance: 792,
  /** Last row of the solid counter row. */
  counter: 799,
} as const;

/**
 * The standable band limits either side of the counter, derived from the body
 * box rather than guessed. Used by the regression test that proves the sort
 * rows are unreachable.
 */
export const V2_STALL_ACTOR_LIMITS = {
  /** Greatest feet y an actor north of the counter can reach. */
  maxFeetYNorth: 784,
  /** Least feet y an actor south of the counter can reach. */
  minFeetYSouth: 810,
} as const;

// -------------------------------------------------------------- depth bands
/**
 * Depth rules for the proof, chosen to sit inside the existing scheme rather
 * than replace it. The legacy layers are floor 0, decorBack 1, architecture 5,
 * cover 6, decorFront 20; props are 3 (ground) or 22 (front); y-sorted props
 * use `10 + y/10000`; enemies 9, the player about 10.
 *
 * Paving is a flat ground layer and never sorts with actors, so it gets a fixed
 * depth just above the legacy floor.
 *
 * Everything vertical - building modules, the stall base and the stall canopy -
 * is Y-SORTED with the same `10 + y/10000` formula the existing props use, so
 * an actor south of a structure draws in front of it and an actor north of one
 * is occluded by it, with no special cases.
 */
export const V2_DEPTH = {
  /** Above legacy `floor` (0), below legacy `decorBack` (1). */
  paving: 0.5,
  /**
   * Diagonal corner overlays, one depth per corner so the four never contend.
   * All sit above the ground tiles and below the architecture's cast shade, so
   * a corner relief is part of the ground and can never cover a building.
   */
  shadeCorners: [0.55, 0.56, 0.57, 0.58] as const,
  /** Shadow overlays sit on the paving, under anything vertical. */
  groundShade: 0.75,
  /** Shared y-sort base, matching the existing sorted props. */
  sortBase: 10,
  sortScale: 10000,
} as const;

export function sortedDepth(worldY: number): number {
  return V2_DEPTH.sortBase + worldY / V2_DEPTH.sortScale;
}
