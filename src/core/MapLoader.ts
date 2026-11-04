import Phaser from 'phaser';
import { Grid, type TileFlags } from './Grid';
import { STAGE_TILESETS, type StageKey } from '../art/TilesetRegistry';

export interface MapObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, string | number | boolean>;
}

export interface LoadedMap {
  map: Phaser.Tilemaps.Tilemap;
  grid: Grid;
  /** Layers that physically stop the player, including the invisible prop layer. */
  solidLayers: Phaser.Tilemaps.TilemapLayer[];
  objects: MapObject[];
  widthPx: number;
  heightPx: number;
  stage: StageKey;
}

/**
 * Layer render order and depth.
 *
 * APPEARANCE AND COLLISION ARE SEPARATE LAYERS.
 *
 * Visible, never collide:
 *   floor         per-area ground surfaces and the dark fill beyond buildings
 *   decorBack     authored accents under characters
 *   architecture  wall faces, windows, doors and the roof band
 *   decorFront    reserved for overhead tile art (empty in this slice)
 *
 * Invisible, gameplay only:
 *   collision     one blocker tile per non-walkable tile
 *   propCollision rasterised prop footprints, so a prop gives cover without a
 *                 duplicate cover tile drawn under its sprite
 *   shadowZones   concealment flags
 *
 * `cover` is the one layer that is both: the tileset's cover_low / cover_high
 * art is purpose-made, so it is drawn as well as collided with.
 */
const LAYERS: { name: string; depth: number; visible: boolean; solid: boolean; alpha?: number }[] = [
  { name: 'floor', depth: 0, visible: true, solid: false },
  { name: 'decorBack', depth: 1, visible: true, solid: false },
  { name: 'architecture', depth: 5, visible: true, solid: false },
  { name: 'collision', depth: 5, visible: false, solid: true },
  { name: 'cover', depth: 6, visible: true, solid: true },
  { name: 'propCollision', depth: 6, visible: false, solid: true },
  { name: 'shadowZones', depth: 0, visible: false, solid: false },
  // Full opacity: translucency here would tint every character underneath.
  // Characters passing in front of foreground art are handled by depth sorting.
  { name: 'decorFront', depth: 20, visible: true, solid: false },
];

/**
 * Only these layers contribute tile flags to the gameplay grid.
 *
 * Without this allowlist, a decorative tile that happens to share an image with
 * a gameplay role would leak that role's flags - painting a dark `deep_shadow`
 * tile outside the map would make authored shadow zones solid, for instance.
 * Appearance layers therefore cannot affect walkability at all.
 */
const GAMEPLAY_LAYERS = new Set(['collision', 'cover', 'propCollision', 'shadowZones']);

/**
 * Creates the Tiled layers against the production tileset and derives the
 * gameplay Grid from per-tile properties, so occlusion always matches the
 * visible geometry.
 */
export function loadLevel(scene: Phaser.Scene, mapKey: string): LoadedMap {
  const map = scene.make.tilemap({ key: mapKey });

  const stage = (map.properties as { name: string; value: string }[] | undefined)?.find(
    (p) => p.name === 'stage'
  )?.value as StageKey | undefined;
  if (!stage || !STAGE_TILESETS[stage]) {
    throw new Error(`map ${mapKey}: missing or unknown "stage" property`);
  }
  const stageTileset = STAGE_TILESETS[stage];

  // Bind the Tiled tileset name to the production texture key.
  const tileset = map.addTilesetImage(
    stageTileset.tilesetName,
    stageTileset.texture,
    map.tileWidth,
    map.tileHeight,
    0,
    0
  );
  if (!tileset) {
    throw new Error(
      `map ${mapKey}: tileset "${stageTileset.tilesetName}" could not bind to texture "${stageTileset.texture}"`
    );
  }

  const grid = new Grid(map.width, map.height);
  const solidLayers: Phaser.Tilemaps.TilemapLayer[] = [];

  for (const spec of LAYERS) {
    if (!map.getLayer(spec.name)) continue;
    const layer = map.createLayer(spec.name, tileset, 0, 0);
    if (!layer) continue;
    layer.setDepth(spec.depth);
    layer.setVisible(spec.visible);
    if (spec.alpha !== undefined) layer.setAlpha(spec.alpha);
    if (spec.solid) {
      layer.setCollisionByProperty({ collides: true });
      solidLayers.push(layer);
    }
  }

  // Merge tile flags from the gameplay layers only.
  for (const layerData of map.layers) {
    if (!GAMEPLAY_LAYERS.has(layerData.name)) continue;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = layerData.data[y]?.[x];
        if (!tile || tile.index < 0) continue;
        const props = tile.properties as Partial<TileFlags> | undefined;
        if (!props) continue;
        grid.merge(x, y, props);
      }
    }
  }

  const objects: MapObject[] = [];
  for (const objectLayer of map.objects) {
    for (const obj of objectLayer.objects) {
      objects.push({
        name: obj.name ?? '',
        // Tiled 1.9+ renames "type" to "class"; accept either.
        type: obj.type || (obj as unknown as { class?: string }).class || '',
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
        props: Object.fromEntries(
          (obj.properties ?? []).map((p: { name: string; value: string | number | boolean }) => [
            p.name,
            p.value,
          ])
        ),
      });
    }
  }

  return {
    map,
    grid,
    solidLayers,
    objects,
    widthPx: map.widthInPixels,
    heightPx: map.heightInPixels,
    stage,
  };
}

export function objectsOfType(objects: MapObject[], type: string): MapObject[] {
  return objects.filter((o) => o.type === type);
}

export function requireObject(objects: MapObject[], type: string): MapObject {
  const found = objects.find((o) => o.type === type);
  if (!found) throw new Error(`map is missing a required "${type}" object`);
  return found;
}
