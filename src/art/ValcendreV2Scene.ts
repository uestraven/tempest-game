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
import {
  MARKET_REGION,
  PAVED_LEGACY_TILES,
  V2_ARCH,
  V2_BUILDINGS,
  V2_DEPTH,
  V2_FOUNTAIN,
  V2_STALL,
  V2_TEXTURES,
  pavingVariant,
  sortedDepth,
  type V2ArchTile,
} from './ValcendreV2';

export interface V2Report {
  pavingTiles: number;
  buildings: { name: string; tiles: number }[];
  fountainSwapped: boolean;
  stallDrawn: boolean;
  skippedSurfaces: Record<string, number>;
}

export class ValcendreV2Presentation {
  private readonly owned: { destroy(): void }[] = [];
  private pavingLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private pavingMap: Phaser.Tilemaps.Tilemap | null = null;
  readonly report: V2Report = {
    pavingTiles: 0,
    buildings: [],
    fountainSwapped: false,
    stallDrawn: false,
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
   * A second, programmatic tilemap layer carrying the four approved paving
   * variants over the market region.
   *
   * A separate blank layer is used rather than rewriting the shipped `floor`
   * layer, so the legacy ground stays intact underneath and removing the proof
   * is a single `destroy()`. The layer sits above `floor` (depth 0) and below
   * `decorBack` (depth 1), and never sorts with actors because it is ground.
   *
   * Only legacy cobbled/paved surfaces are replaced. Grass, garden path and
   * interior floors are skipped and counted, because the approved package has
   * no art for them and substituting something else would be fabrication.
   */
  private buildPaving(): void {
    const floor = this.map.getLayer('floor');
    if (!floor) return;

    const paved = new Set<string>(PAVED_LEGACY_TILES);
    const tm = this.scene.make.tilemap({
      tileWidth: TILE,
      tileHeight: TILE,
      width: this.map.width,
      height: this.map.height,
    });
    // firstgid 0 so the atlas's own frame indices are the tile indices.
    const ts = tm.addTilesetImage('valcendre_v2_cobble', V2_TEXTURES.cobble, TILE, TILE, 0, 0, 0);
    if (!ts) return;
    const layer = tm.createBlankLayer('valcendre_v2_paving', ts, 0, 0, this.map.width, this.map.height);
    if (!layer) return;
    layer.setDepth(V2_DEPTH.paving);

    const { x, y, w, h } = MARKET_REGION;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const tile = floor.data[ty]?.[tx];
        if (!tile || tile.index < 0) continue;
        // The layer stores global ids; the tile's own name comes from the
        // legacy tileset's local index.
        const localIndex = tile.index - (this.map.tilesets[0]?.firstgid ?? 1);
        const legacyName = TILE_NAMES[localIndex] ?? `#${localIndex}`;
        if (!paved.has(legacyName)) {
          this.report.skippedSurfaces[legacyName] =
            (this.report.skippedSurfaces[legacyName] ?? 0) + 1;
          continue;
        }
        layer.putTileAt(pavingVariant(tx, ty), tx, ty);
        this.report.pavingTiles++;
      }
    }
    this.pavingMap = tm;
    this.pavingLayer = layer;
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
   * Two images sharing one world origin, as the art manifest specifies.
   *
   * DEPTH IS THE WHOLE POINT OF THIS PIECE. The manifest asks for three
   * orderings depending on where the actor is, which a fixed depth per image
   * cannot give. Instead each layer is y-sorted by the world row it visually
   * occupies:
   *
   *   base   sorts at its counter row (the existing cover run at y49), so an
   *          actor south of the counter draws in front and an actor behind it
   *          is occluded, exactly like any other cover prop.
   *   canopy sorts at the SAME row as the base rather than at its own top edge.
   *          Sorting it by its own y would put it behind everything, because
   *          its art sits 30px higher than the structure holding it up.
   *
   * The result is the manifest's three cases falling out of one rule: in front
   * of the counter the actor is over both layers; behind it the actor is under
   * both; level with it the actor interleaves.
   *
   * NEITHER LAYER CREATES COLLISION, COVER OR CONCEALMENT. The 80x48 art
   * decorates the pre-existing 5x1 cover run and nothing else.
   */
  private buildStall(): void {
    const sortRow = (V2_STALL.coverTiles.y + 1) * TILE;
    const base = this.scene.add.image(V2_STALL.worldX, V2_STALL.worldY, V2_TEXTURES.stallBase);
    base.setOrigin(0, 0).setDepth(sortedDepth(sortRow));
    this.owned.push(base);

    const canopy = this.scene.add.image(V2_STALL.worldX, V2_STALL.worldY, V2_TEXTURES.stallCanopy);
    canopy.setOrigin(0, 0);
    // A hair above the base so the two never z-fight, but the same world row so
    // both resolve against an actor together.
    canopy.setDepth(sortedDepth(sortRow) + 0.00005);
    this.owned.push(canopy);
    this.report.stallDrawn = true;
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
    this.pavingLayer?.destroy();
    this.pavingLayer = null;
    this.pavingMap?.destroy();
    this.pavingMap = null;
  }
}
