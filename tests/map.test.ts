import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid, type TileFlags } from '../src/core/Grid';
import { TILE } from '../src/core/constants';

interface TiledProperty {
  name: string;
  value: string | number | boolean;
}
interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: {
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties?: TiledProperty[];
  }[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: { firstgid: number; tiles?: { id: number; properties: TiledProperty[] }[] }[];
}

const map = JSON.parse(
  readFileSync(new URL('../assets/maps/village.json', import.meta.url), 'utf8')
) as TiledMap;

const props = (list: TiledProperty[] | undefined): Record<string, string | number | boolean> =>
  Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));

const objects = (map.layers.find((l) => l.type === 'objectgroup')?.objects ?? []).map((o) => ({
  ...o,
  props: props(o.properties),
}));
const byType = (type: string) => objects.filter((o) => o.type === type);
const byName = (name: string) => objects.find((o) => o.name === name);

/** Rebuilds the gameplay grid from tile properties exactly as MapLoader does. */
function buildGrid(): Grid {
  const grid = new Grid(map.width, map.height);
  const tileset = map.tilesets[0];
  const flagsById = new Map<number, Partial<TileFlags>>();
  for (const tile of tileset.tiles ?? [])
    flagsById.set(tile.id, props(tile.properties) as Partial<TileFlags>);

  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || !layer.data) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (gid === 0) continue;
      const flags = flagsById.get(gid - tileset.firstgid);
      if (!flags) continue;
      grid.merge(i % map.width, Math.floor(i / map.width), flags);
    }
  }
  return grid;
}

const grid = buildGrid();
const walkable = (tx: number, ty: number) => !grid.solidAt(tx, ty);

describe('village slice geometry', () => {
  it('uses the 16 px environmental grid', () => {
    expect(map.tilewidth).toBe(TILE);
    expect(map.tileheight).toBe(TILE);
  });

  it('declares the layers the renderer and AI expect', () => {
    const names = map.layers.map((l) => l.name);
    for (const required of [
      'floor',
      'decorBack',
      'collision',
      'cover',
      'shadowZones',
      'decorFront',
      'objects',
    ])
      expect(names).toContain(required);
  });

  it('keeps authored openings at least two tiles wide', () => {
    // Garage door row and the north road mouth: both must admit the player freely.
    const doorRow = [45, 46, 47].filter((x) => walkable(x, 15));
    expect(doorRow.length).toBeGreaterThanOrEqual(2);
    const roadMouth = [46, 47, 48, 49].filter((x) => walkable(x, 4));
    expect(roadMouth.length).toBeGreaterThanOrEqual(2);
  });

  it('authors shadow zones for the stealth route', () => {
    const shadowLayer = map.layers.find((l) => l.name === 'shadowZones');
    const count = (shadowLayer?.data ?? []).filter((gid) => gid !== 0).length;
    expect(count).toBeGreaterThan(40);
  });
});

describe('village slice content', () => {
  it('places exactly the three Phase A lookouts, each with a patrol route', () => {
    const enemies = byType('enemy');
    expect(enemies).toHaveLength(3);
    for (const enemy of enemies) {
      expect(enemy.props.kind).toBe('lookout');
      const route = byType('waypoint').filter((w) => w.props.route === enemy.props.route);
      expect(route.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('provides fixed supplies, including one medical kit and a distraction', () => {
    const items = byType('item');
    expect(items.filter((i) => i.props.kind === 'medkit').length).toBeGreaterThanOrEqual(1);
    expect(items.filter((i) => i.props.kind === 'ammo_pistol').length).toBeGreaterThanOrEqual(2);
    expect(byType('interactable').filter((p) => p.props.noise)).toHaveLength(1);
  });

  it('chains the van clue, the log and the inscription in order', () => {
    expect(byName('interact_van')?.props.objective).toBe('V1');
    expect(byName('interact_log')?.props.requires).toBe('V1');
    expect(byName('interact_log')?.props.objective).toBe('V2');
    expect(byName('interact_sigil')?.props.requires).toBe('V2');
  });

  it('gates the exit behind the transport log', () => {
    expect(byName('exit_north')?.props.requires).toBe('V2');
  });

  it('places a checkpoint at the entrance and after the log', () => {
    const ids = byType('checkpoint').map((c) => c.props.id);
    expect(ids).toContain('cp_entry');
    expect(ids).toContain('cp_log');
  });
});

describe('softlock resistance', () => {
  const spawn = byName('spawn')!;

  it('anchors every object on walkable ground', () => {
    for (const obj of objects) {
      if (obj.type === 'exit') continue;
      expect(
        walkable(Math.floor(obj.x / TILE), Math.floor(obj.y / TILE)),
        `${obj.name} sits on a solid tile`
      ).toBe(true);
    }
  });

  it('can reach the van, the log and the exit from the spawn point', () => {
    for (const name of ['interact_van', 'interact_log', 'checkpoint_log']) {
      const target = byName(name)!;
      const path = grid.findPath({ x: spawn.x, y: spawn.y }, { x: target.x, y: target.y }, 6000);
      expect(path, `no path from spawn to ${name}`).not.toBeNull();
    }
    const exit = byName('exit_north')!;
    const exitCentre = { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 };
    expect(grid.findPath({ x: spawn.x, y: spawn.y }, exitCentre, 6000)).not.toBeNull();
  });

  it('offers a second approach: the rear service corridor reaches the garage', () => {
    // The corridor tiles exist and connect the market's north edge to the garage.
    expect(walkable(26, 9)).toBe(true);
    expect(walkable(33, 7)).toBe(true);
    const path = grid.findPath(
      { x: 26 * TILE + 8, y: 9 * TILE + 8 },
      { x: 39 * TILE + 8, y: 7 * TILE + 8 },
      6000
    );
    expect(path).not.toBeNull();
  });
});
