/**
 * Builds the Valcendre v2 proof presentation inside the live scene.
 *
 * ADDITIVE AND SELF-CONTAINED. Every display object this creates is recorded
 * and released by `destroy()`, so the proof can be built, torn down, or never
 * built at all without the rest of the scene knowing. `Village.ts` gains one
 * construction call and one shutdown call; nothing else in the scene changes.
 *
 * IT CHANGES NO GAMEPLAY STATE. It never writes a tile flag, a collision body,
 * a cover tile, a shadow zone, an object property or a mission value. It reads
 * the shipped tilemap to decide where paving may go, and draws.
 *
 * Source art: TEMPEST_VALCENDRE_ART_PACKAGE_v1 (B.2-03D), copied byte-for-byte.
 */

import Phaser from 'phaser';
import { TILE } from '../core/constants';
import { TILE_NAMES } from './TilesetRegistry';
import { CORNER_ORDER, composeRegion, summarise, type GroundReader } from './GroundShade';
import {
  COBBLE_MATERIAL_KIND,
  MATERIAL_KINDS_PROPERTY,
  SHADED_FLOOR_TILE,
  V2_ARCH,
  V2_BUILDINGS,
  V2_DEPTH,
  V2_FOUNTAIN,
  V2_STALL,
  V2_STALL_REGIONS,
  V2_STALL_SORT,
  V2_TEXTURES,
  pavingVariant,
  sortedDepth,
  type V2ArchTile,
} from './ValcendreV2';

/**
 * Phaser's name for the frame covering a whole single-image texture. It must be
 * passed explicitly once any cropped frame has been registered on the same
 * texture - see the note in `buildStall`.
 */
export const WHOLE_IMAGE_FRAME = '__BASE';

export interface V2Report {
  pavingTiles: number;
  buildings: { name: string; tiles: number }[];
  fountainSwapped: boolean;
  stallDrawn: boolean;
  /** One entry per stall draw layer, in creation order. Read by the captures. */
  stallPieces: { texture: string; frame: string | null; worldY: number; depth: number }[];
  /** Ground composition counts, for the performance budget. */
  ground: {
    daylightTiles: number;
    shadedInteriorTiles: number;
    boundaryTiles: number;
    overlayTiles: number;
    overlaysDrawn: number;
    layers: number;
    /** Authored material kinds found on the map, with their tile counts. */
    materials: Record<string, number>;
  } | null;
  skippedSurfaces: Record<string, number>;
}

/**
 * Disjoint tileset bases for the one ground tilemap, so a single layer can mix
 * the daylight strip, the shaded strip and the cardinal transition atlas. Each
 * value is the first global id of that tileset; a tile's gid is the base plus
 * its frame index.
 */
export const GID = {
  daylight: 0,
  shaded: 4,
  boundary: 8,
  corner: 72,
} as const;

export class ValcendreV2Presentation {
  private readonly owned: { destroy(): void }[] = [];
  private pavingLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private pavingMap: Phaser.Tilemaps.Tilemap | null = null;
  private overlayLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  readonly report: V2Report = {
    pavingTiles: 0,
    buildings: [],
    fountainSwapped: false,
    stallDrawn: false,
    stallPieces: [],
    ground: null,
    skippedSurfaces: {},
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: Phaser.Tilemaps.Tilemap
  ) {}

  build(): V2Report {
    this.buildPaving();
    this.buildBuildings();
    this.buildStall();
    return this.report;
  }

  // ------------------------------------------------------------- paving
  /**
   * The approved ground, composed ONCE and written into static tilemap layers.
   *
   * Phase B.2-04 painted the four daylight paving variants over the market
   * region and skipped everything else, which left every shaded cobblestone
   * tile on the flat legacy `deep_shadow` fill. With the B.2-05A packages
   * approved there is now a shaded strip, 64 cardinal transitions and 16
   * diagonal corner overlays, so the ground is composed properly:
   *
   *   daylight cobblestone  -> the B.2-03A strip, frame = variant
   *   shaded, no lit edge   -> the B.2-05A-1 strip, frame = variant
   *   shaded with a lit edge-> the B.2-05A-2 cardinal atlas, variant*16 + mask
   *   inside corners        -> the B.2-05A-2 overlay atlas, variant*4 + corner
   *
   * All of it is decided by `GroundShade`, which is Phaser-free and exhaustively
   * unit tested; this method only turns its output into tiles. One pass at
   * build time, no neighbour relationship re-derived per frame, and no sprite
   * per tile: five static layers on one programmatic tilemap.
   *
   * THE TWO STATES COME FROM TWO DIFFERENT LAYERS ON PURPOSE. Material is read
   * from `groundMaterial`, which records the authored surface tile before the
   * shadow pass overwrote the floor; visual shade is read from `floor` being
   * `deep_shadow`. `shadowZones` is never consulted, so gameplay concealment
   * and the artwork cannot drift into one another - concealment remains that
   * layer's sole property, and nothing here reads or writes it.
   *
   * Still additive: the legacy `floor` stays intact underneath, every object
   * created here is released by `destroy()`, and `?art=legacy` builds none of
   * it.
   */
  private buildPaving(): void {
    const floor = this.map.getLayer('floor');
    const material = this.map.getLayer('groundMaterial');
    if (!floor) return;
    if (!material) {
      // An older map without the material layer: fall back to nothing rather
      // than guessing cobblestone from the shade flag, which is exactly the
      // inference the contract forbids.
      this.report.skippedSurfaces['(no groundMaterial layer)'] = 1;
      return;
    }

    const legacyFirstGid = this.map.tilesets[0]?.firstgid ?? 1;
    const floorName = (tx: number, ty: number): string | null => {
      const tile = floor.data[ty]?.[tx];
      if (!tile || tile.index < 0) return null;
      return TILE_NAMES[tile.index - legacyFirstGid] ?? null;
    };

    // The material layer stores `1 + index into the published kind list`, so
    // the kind is resolved by NAME from the map's own properties. If the list
    // is missing the presentation builds nothing rather than guessing an order.
    const kinds = this.materialKinds();
    if (!kinds.length) {
      this.report.skippedSurfaces['(no groundMaterialKinds map property)'] = 1;
      return;
    }
    const materialKind = (tx: number, ty: number): string | null => {
      const tile = material.data[ty]?.[tx];
      if (!tile || tile.index <= 0) return null;
      return kinds[tile.index - 1] ?? null;
    };

    const reader: GroundReader = {
      classify: (tx, ty) => {
        if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return 'other';
        if (materialKind(tx, ty) !== COBBLE_MATERIAL_KIND) return 'other';
        return floorName(tx, ty) === SHADED_FLOOR_TILE ? 'cobbleShaded' : 'cobbleDaylight';
      },
      variant: (tx, ty) => pavingVariant(tx, ty),
    };

    // Count what is being left alone, by its authored material rather than by
    // the `deep_shadow` the shadow pass painted over it.
    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        const kind = materialKind(tx, ty);
        if (!kind || kind === COBBLE_MATERIAL_KIND) continue;
        this.report.skippedSurfaces[kind] = (this.report.skippedSurfaces[kind] ?? 0) + 1;
      }
    }

    const tm = this.scene.make.tilemap({
      tileWidth: TILE,
      tileHeight: TILE,
      width: this.map.width,
      height: this.map.height,
    });
    // One tilemap, four tilesets at disjoint firstgids, so a single ground
    // layer can hold daylight, shaded and transition tiles without a second
    // pass. The gids are the frame index plus the tileset's own base.
    const daylight = tm.addTilesetImage('v2_cobble', V2_TEXTURES.cobble, TILE, TILE, 0, 0, GID.daylight);
    const shaded = tm.addTilesetImage('v2_cobble_shaded', V2_TEXTURES.cobbleShaded, TILE, TILE, 0, 0, GID.shaded);
    const boundaries = tm.addTilesetImage('v2_shade_boundaries', V2_TEXTURES.shadeBoundaries, TILE, TILE, 0, 0, GID.boundary);
    const corners = tm.addTilesetImage('v2_shade_corners', V2_TEXTURES.shadeCorners, TILE, TILE, 0, 0, GID.corner);
    if (!daylight || !shaded || !boundaries || !corners) return;

    const ground = tm.createBlankLayer(
      'valcendre_v2_paving',
      [daylight, shaded, boundaries],
      0,
      0,
      this.map.width,
      this.map.height
    );
    if (!ground) return;
    ground.setDepth(V2_DEPTH.paving);

    const overlayLayers: Phaser.Tilemaps.TilemapLayer[] = [];
    for (let i = 0; i < CORNER_ORDER.length; i++) {
      const l = tm.createBlankLayer(
        `valcendre_v2_shade_corner_${CORNER_ORDER[i]}`,
        corners,
        0,
        0,
        this.map.width,
        this.map.height
      );
      if (!l) return;
      l.setDepth(V2_DEPTH.shadeCorners[i]);
      overlayLayers.push(l);
    }

    const cells = composeRegion(reader, { x: 0, y: 0, w: this.map.width, h: this.map.height });
    for (const cell of cells) {
      const gid =
        cell.base === 'daylight'
          ? GID.daylight + cell.frame
          : cell.base === 'shaded'
            ? GID.shaded + cell.frame
            : GID.boundary + cell.frame;
      ground.putTileAt(gid, cell.tx, cell.ty);
      for (const overlay of cell.overlays) {
        const slot = CORNER_ORDER.indexOf(overlay.corner);
        overlayLayers[slot].putTileAt(GID.corner + overlay.frame, cell.tx, cell.ty);
      }
    }

    const summary = summarise(cells);
    this.report.pavingTiles = cells.length;
    this.report.ground = {
      daylightTiles: summary.daylightCells,
      shadedInteriorTiles: summary.shadedInteriorCells,
      boundaryTiles: summary.boundaryCells,
      overlayTiles: summary.overlayCells,
      overlaysDrawn: summary.overlayTotal,
      layers: 1 + overlayLayers.length,
      materials: this.materialCensus(),
    };

    this.pavingMap = tm;
    this.pavingLayer = ground;
    this.overlayLayers = overlayLayers;
  }

  // -------------------------------------------------------- architecture
  /**
   * Paints the approved modules over two EXISTING solid footprints.
   *
   * Each module is its own Image, y-sorted with the same `10 + y/10000`
   * formula the scene's sorted props already use. That is what makes an actor
   * standing south of a hall draw in front of it while an actor north of one is
   * occluded by the roof, with no roof-specific special case and no change to
   * movement or collision.
   *
   * The three structural-shadow tiles are binary-alpha overlays and are drawn
   * on the ground band instead, under anything vertical.
   */
  private buildBuildings(): void {
    for (const b of V2_BUILDINGS) {
      let count = 0;
      for (let r = 0; r < b.rows.length; r++) {
        const row = b.rows[r];
        for (let c = 0; c < row.length; c++) {
          const tileName: V2ArchTile = row[c];
          const wx = (b.x + c) * TILE;
          const wy = (b.y + r) * TILE;
          const img = this.scene.add.image(wx, wy, V2_TEXTURES.architecture, V2_ARCH[tileName]);
          img.setOrigin(0, 0);
          // Sort by the module's own BOTTOM edge, so a roof row high on the
          // building sorts behind an actor who is level with the facade.
          img.setDepth(sortedDepth(wy + TILE));
          this.owned.push(img);
          count++;
        }
      }
      // Hard-edged cast shade on the paving along the building's south edge and
      // east side, offset for the northwest light. Ground band, so it can never
      // cover an actor.
      for (let c = 0; c < b.w; c++) {
        const s = this.scene.add.image(
          (b.x + c) * TILE + 4,
          (b.y + b.h) * TILE,
          V2_TEXTURES.architecture,
          V2_ARCH.shade_footing
        );
        s.setOrigin(0, 0).setDepth(V2_DEPTH.groundShade);
        this.owned.push(s);
      }
      for (let r = 2; r < b.h; r++) {
        const s = this.scene.add.image(
          (b.x + b.w) * TILE,
          (b.y + r) * TILE + 4,
          V2_TEXTURES.architecture,
          V2_ARCH.shade_corner
        );
        s.setOrigin(0, 0).setDepth(V2_DEPTH.groundShade);
        this.owned.push(s);
      }
      this.report.buildings.push({ name: b.name, tiles: count });
    }
  }

  // ---------------------------------------------------------- the stall
  /**
   * The stall, drawn as four layers off two approved PNGs.
   *
   * Phase B.2-04 drew the base and canopy as single images sharing one depth
   * just above the counter row. That is correct for an actor south of the stall
   * and wrong for the one position the mission requires: standing at the
   * ransacked-stall clue, the player was behind both layers and all but
   * invisible, because the canopy's art projects over the two walkable rows the
   * clue is reachable from.
   *
   * The correction is to stop treating each FILE as one draw layer. The awning's
   * rear slope and the counter's front face describe different depths in the
   * world even though they ship in the same images, so they are drawn as
   * separate source regions at separate depths, with the actor's own y-sorted
   * depth falling between them:
   *
   *   base (whole)   behind   - the structure, under the actor
   *   canopy rear    behind   - the awning's far slope, under the actor
   *   ~ actors sort here by their feet, exactly as they always have ~
   *   canopy valance front    - front beam and hanging fabric, over the actor
   *   base counter   front    - the counter's front face, over the actor's legs
   *
   * Every depth is a CONSTANT. Nothing here reads the player, an enemy, or any
   * actor position, so a Lookout and Tempest standing on opposite sides of the
   * stall resolve correctly in the same frame, and there is no scene-wide mode
   * to switch. The two front thresholds sit inside the solid counter row where
   * no actor can stand, so no character can straddle them and none can pop.
   *
   * NO ARTWORK IS MODIFIED, no alpha is applied and no pixel is discarded: the
   * regions tile the canopy exactly, and the counter is an extra copy of base
   * pixels drawn at their own destination, which is idempotent because the files
   * are binary-alpha.
   *
   * STILL NO COLLISION, COVER OR CONCEALMENT. The art decorates the pre-existing
   * 5x1 cover run and nothing else.
   */
  private buildStall(): void {
    if (!this.registerStallRegions()) return;

    const piece = (
      textureKey: string,
      frame: string,
      localY: number,
      sortRow: number,
      epsilon = 0
    ): void => {
      // The frame is ALWAYS named explicitly, including the whole-image
      // `__BASE`. Phaser promotes the first frame added to a single-image
      // texture to be that texture's default, so once a crop is registered an
      // unqualified `add.image(key)` silently resolves to the crop instead of
      // the full picture - which drew the counter band alone, 26px too high,
      // with the rest of the structure missing.
      const img = this.scene.add.image(
        V2_STALL.worldX,
        V2_STALL.worldY + localY,
        textureKey,
        frame
      );
      // Destination offset applied exactly ONCE, here: a cropped frame carries
      // no implicit offset of its own, so the region's source y is added to the
      // envelope origin and nowhere else.
      img.setOrigin(0, 0).setDepth(sortedDepth(sortRow) + epsilon);
      this.owned.push(img);
      this.report.stallPieces.push({
        texture: textureKey,
        frame,
        worldY: V2_STALL.worldY + localY,
        depth: img.depth,
      });
    };

    const R = V2_STALL_REGIONS;
    // Behind the actor. The full base keeps the structure intact; the epsilon
    // only stops it z-fighting with the rear roof above it.
    piece(V2_TEXTURES.stallBase, WHOLE_IMAGE_FRAME, 0, V2_STALL_SORT.behind);
    piece(V2_TEXTURES.stallCanopy, R.canopyRear.frame, R.canopyRear.rect[1], V2_STALL_SORT.behind, 0.00005);
    // In front of the actor.
    piece(V2_TEXTURES.stallCanopy, R.canopyValance.frame, R.canopyValance.rect[1], V2_STALL_SORT.valance);
    piece(V2_TEXTURES.stallBase, R.baseCounter.frame, R.baseCounter.rect[1], V2_STALL_SORT.counter);

    this.report.stallDrawn = true;
  }

  /**
   * The published material kind list, in the order the `groundMaterial` layer's
   * values index into. Read from the map's own properties so the renderer never
   * hard-codes an ordering that the map generator could change.
   */
  /** Tile count per authored material, for the integration report. */
  private materialCensus(): Record<string, number> {
    const material = this.map.getLayer('groundMaterial');
    const kinds = this.materialKinds();
    const out: Record<string, number> = {};
    if (!material) return out;
    for (let ty = 0; ty < this.map.height; ty++)
      for (let tx = 0; tx < this.map.width; tx++) {
        const tile = material.data[ty]?.[tx];
        if (!tile || tile.index <= 0) continue;
        const kind = kinds[tile.index - 1];
        if (kind) out[kind] = (out[kind] ?? 0) + 1;
      }
    return out;
  }

  private materialKinds(): string[] {
    const props = this.map.properties as { name: string; value: unknown }[] | undefined;
    const raw = Array.isArray(props)
      ? props.find((p) => p.name === MATERIAL_KINDS_PROPERTY)?.value
      : undefined;
    return typeof raw === 'string' && raw.length ? raw.split(',') : [];
  }

  /**
   * Adds the three cropped frames to the already-loaded approved textures.
   *
   * In-memory only: `Texture.add` records a rectangle into the existing image,
   * so no file is read, written or altered. Guarded against a second scene
   * start re-adding the same frame names.
   */
  private registerStallRegions(): boolean {
    for (const region of Object.values(V2_STALL_REGIONS)) {
      const texture = this.scene.textures.get(V2_TEXTURES[region.texture]);
      if (!texture || texture.key === '__MISSING') return false;
      if (!texture.has(region.frame)) {
        const [x, y, w, h] = region.rect;
        texture.add(region.frame, 0, x, y, w, h);
      }
    }
    return true;
  }

  /**
   * Swaps the fountain's TEXTURE in place.
   *
   * Called from the prop spawner, which keeps the map object, its authored
   * position, its prop footprint and its cover exactly as they are. The art
   * manifest's (16,29) bottom-centre anchor becomes a Phaser origin; it is
   * explicitly not a new coordinate.
   */
  applyFountain(image: Phaser.GameObjects.Image): void {
    image.setTexture(V2_TEXTURES.fountain);
    image.setOrigin(V2_FOUNTAIN.originX, V2_FOUNTAIN.originY);
    this.report.fountainSwapped = true;
  }

  destroy(): void {
    for (const o of this.owned) o.destroy();
    this.owned.length = 0;
    for (const l of this.overlayLayers) l.destroy();
    this.overlayLayers = [];
    this.pavingLayer?.destroy();
    this.pavingLayer = null;
    this.pavingMap?.destroy();
    this.pavingMap = null;
  }
}
