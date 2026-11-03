import Phaser from 'phaser';
import { Grid, type TileFlags } from './Grid';
import { TILE_KEY } from '../art/textures';

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
  /** Layers that physically stop the player. */
  solidLayers: Phaser.Tilemaps.TilemapLayer[];
  objects: MapObject[];
  widthPx: number;
  heightPx: number;
}

const LAYER_ORDER = ['floor', 'decorBack', 'collision', 'cover', 'decorFront'] as const;
const SOLID_LAYERS = new Set(['collision', 'cover']);
const DEPTHS: Record<string, number> = {
  floor: 0,
  decorBack: 1,
  collision: 5,
  cover: 6,
  decorFront: 20,
};

/**
 * Creates the Tiled layers and derives the gameplay Grid from per-tile
 * properties, so occlusion always matches the visible geometry.
 */
export function loadLevel(scene: Phaser.Scene, mapKey: string): LoadedMap {
  const map = scene.make.tilemap({ key: mapKey });
  const tileset = map.addTilesetImage('tiles', TILE_KEY, map.tileWidth, map.tileHeight, 0, 0);
  if (!tileset) throw new Error(`map ${mapKey}: tileset "tiles" could not be bound`);

  const grid = new Grid(map.width, map.height);
  const solidLayers: Phaser.Tilemaps.TilemapLayer[] = [];

  for (const name of LAYER_ORDER) {
    if (!map.getLayer(name)) continue;
    const layer = map.createLayer(name, tileset, 0, 0);
    if (!layer) continue;
    layer.setDepth(DEPTHS[name] ?? 0);
    if (name === 'decorFront') layer.setAlpha(0.92);
    if (SOLID_LAYERS.has(name)) {
      layer.setCollisionByProperty({ collides: true });
      solidLayers.push(layer);
    }
  }

  // Merge tile flags from every tile layer, including the invisible shadowZones.
  for (const layerData of map.layers) {
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
