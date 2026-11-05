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
    stallPieces: [],
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
    this.pavingLayer?.destroy();
    this.pavingLayer = null;
    this.pavingMap?.destroy();
    this.pavingMap = null;
  }
}
