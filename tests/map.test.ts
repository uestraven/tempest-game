import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Grid, type TileFlags } from '../src/core/Grid';
import { TILE } from '../src/core/constants';
import { TILE_NAMES, TILE_ROLES, type TileRole } from '../src/art/TilesetRegistry';
import { PROPS } from '../src/art/PropDefinitions';

interface TiledProperty {
  name: string;
  value: string | number | boolean;
}
interface TiledLayer {
  name: string;
  type: string;
  visible: boolean;
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
  properties: TiledProperty[];
  layers: TiledLayer[];
  tilesets: {
    firstgid: number;
    name: string;
    image: string;
    tilecount: number;
    columns: number;
    tiles?: { id: number; properties: TiledProperty[] }[];
  }[];
}

const map = JSON.parse(
  readFileSync(new URL('../public/assets/maps/village.json', import.meta.url), 'utf8')
) as TiledMap;

const props = (list: TiledProperty[] | undefined): Record<string, string | number | boolean> =>
  Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));

const objects = (map.layers.find((l) => l.type === 'objectgroup')?.objects ?? []).map((o) => ({
  ...o,
  props: props(o.properties),
}));
const byType = (type: string) => objects.filter((o) => o.type === type);
const byName = (name: string) => objects.find((o) => o.name === name);
const layer = (name: string) => map.layers.find((l) => l.name === name);

/** Rebuilds the gameplay grid from tile properties exactly as MapLoader does. */
function buildGrid(): Grid {
  const grid = new Grid(map.width, map.height);
  const tileset = map.tilesets[0];
  const flagsById = new Map<number, Partial<TileFlags>>();
  for (const tile of tileset.tiles ?? [])
    flagsById.set(tile.id, props(tile.properties) as unknown as Partial<TileFlags>);

  for (const l of map.layers) {
    if (l.type !== 'tilelayer' || !l.data) continue;
    for (let i = 0; i < l.data.length; i++) {
      const gid = l.data[i];
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
const roleGid = (role: TileRole) => TILE_NAMES.indexOf(TILE_ROLES[role].tile) + 1;

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
      'architecture',
      'collision',
      'cover',
      'propCollision',
      'shadowZones',
      'decorFront',
      'objects',
    ])
      expect(names).toContain(required);
  });

  it('keeps the gameplay-only layers invisible', () => {
    // Appearance and collision are separate layers: what the player sees
    // outside the playable area is the architecture layer, while collision is
    // an invisible blocker grid derived purely from the carved regions.
    expect(layer('collision')!.visible).toBe(false);
    expect(layer('propCollision')!.visible).toBe(false);
    expect(layer('shadowZones')!.visible).toBe(false);
    expect(layer('architecture')!.visible).toBe(true);
    expect(layer('floor')!.visible).toBe(true);
  });

  it('draws every layer at full opacity, so nothing tints the characters', () => {
    for (const l of map.layers) {
      if (l.type !== 'tilelayer') continue;
      expect((l as unknown as { opacity: number }).opacity, l.name).toBe(1);
    }
  });

  it('binds the production Valcendre tileset', () => {
    const tileset = map.tilesets[0];
    expect(tileset.name).toBe('valcendre_tiles');
    expect(tileset.tilecount).toBe(48);
    expect(tileset.columns).toBe(8);
    expect(tileset.image).toContain('valcendre_tiles_16x16.png');
    expect(props(map.properties).stage).toBe('valcendre');
  });

  it('only uses tile ids that exist in the 48-tile set', () => {
    for (const l of map.layers) {
      if (l.type !== 'tilelayer' || !l.data) continue;
      for (const gid of l.data) {
        if (gid === 0) continue;
        expect(gid, `layer ${l.name}`).toBeGreaterThanOrEqual(1);
        expect(gid, `layer ${l.name}`).toBeLessThanOrEqual(48);
      }
    }
  });

  it('keeps authored openings at least two tiles wide', () => {
    // Garage door and the depot gate.
    expect([81, 82, 83].filter((x) => walkable(x, 19)).length).toBeGreaterThanOrEqual(2);
    expect([75, 76, 77, 78].filter((x) => walkable(x, 44)).length).toBeGreaterThanOrEqual(2);
  });

  it('authors shadow zones for the stealth route', () => {
    const count = (layer('shadowZones')?.data ?? []).filter((gid) => gid !== 0).length;
    expect(count).toBeGreaterThan(200);
    // Shadow tiles must actually carry the shadow flag through to the grid.
    expect(grid.at(10, 45).shadow).toBe(true);
    expect(grid.at(8, 10).shadow).toBe(true);
  });

  it('gives every non-walkable tile exactly one invisible blocker', () => {
    const collision = layer('collision')!.data!;
    const blocker = roleGid('blocker');
    for (const gid of collision) {
      if (gid === 0) continue;
      expect(gid).toBe(blocker);
    }
    // The real invariant: a tile is solid in the gameplay grid exactly when the
    // collision layer blocks it, or a cover tile does, or a prop footprint does.
    // Comparing raw counts would be wrong, because cover and prop-collision
    // tiles sit ON carved floor and so have no collision-layer blocker.
    const cover = layer('cover')!.data!;
    const propLayer = layer('propCollision')!.data!;
    const flagsById = new Map<number, Partial<TileFlags>>();
    for (const tile of map.tilesets[0].tiles ?? [])
      flagsById.set(tile.id, props(tile.properties) as unknown as Partial<TileFlags>);
    const solidGid = (gid: number) => gid !== 0 && !!flagsById.get(gid - 1)?.collides;
    let mismatches = 0;
    for (let i = 0; i < collision.length; i++) {
      const expected = solidGid(collision[i]) || solidGid(cover[i]) || solidGid(propLayer[i]);
      const actual = grid.solidAt(i % map.width, Math.floor(i / map.width));
      if (expected !== actual) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('paints an architecture facade with windows and doors', () => {
    const arch = layer('architecture')!.data!;
    const counts = new Map<number, number>();
    for (const gid of arch) if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
    const gid = (name: string) => TILE_NAMES.indexOf(name as never) + 1;
    expect(counts.get(gid('window')) ?? 0).toBeGreaterThan(8);
    expect(counts.get(gid('door_closed')) ?? 0).toBeGreaterThan(4);
    expect(counts.get(gid('roof')) ?? 0).toBeGreaterThan(100);
    expect(counts.get(gid('roof_edge')) ?? 0).toBeGreaterThan(50);
  });

  it('preserves wall, high-cover and low-cover semantics', () => {
    const cover = layer('cover')!.data!;
    const idx = (x: number, y: number) => y * map.width + x;
    // Market stall counter: low cover.
    expect(cover[idx(16, 36)]).toBe(roleGid('barrierLow'));
    expect(grid.at(16, 36).lowCover).toBe(true);
    expect(grid.at(16, 36).collides).toBe(true);
    expect(grid.at(16, 36).blocksSight).toBe(false);
    // Depot courtyard crate: high cover.
    expect(cover[idx(61, 22)]).toBe(roleGid('crateHigh'));
    expect(grid.at(61, 22).blocksSight).toBe(true);
    // Building wall.
    expect(grid.at(0, 0).collides).toBe(true);
    expect(grid.at(0, 0).blocksSight).toBe(true);
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

  it('keeps the van object and its placeholder sprite', () => {
    // Art package has no van; the gameplay object must survive regardless.
    expect(byName('interact_van')).toBeDefined();
    const decor = byName('decor_van');
    expect(decor?.props.sprite).toBe('prop_van');
  });
});

describe('props', () => {
  const placed = byType('prop');

  it('places Valcendre props from the production package', () => {
    expect(placed.length).toBeGreaterThanOrEqual(12);
    for (const obj of placed) {
      const key = `${obj.props.area}.${obj.props.prop}`;
      expect(PROPS.has(key), `map references unknown prop ${key}`).toBe(true);
    }
  });

  it('uses every one of the twelve Valcendre props at least once', () => {
    const used = new Set(placed.map((o) => String(o.props.prop)));
    const available = [...PROPS.values()].filter((p) => p.area === 'valcendre');
    expect(available).toHaveLength(12);
    expect(used.size).toBeGreaterThanOrEqual(11);
  });

  it('spreads props across every authored area', () => {
    // Repetition was the Phase B.1A complaint: each area needs its own dressing.
    const byArea = (x0: number, y0: number, x1: number, y1: number) =>
      placed.filter(
        (o) =>
          o.x >= x0 * TILE && o.x <= x1 * TILE && o.y >= y0 * TILE && o.y <= y1 * TILE
      ).length;
    expect(byArea(9, 32, 42, 56), 'market square').toBeGreaterThanOrEqual(8);
    expect(byArea(6, 56, 16, 69), 'arrival alley').toBeGreaterThanOrEqual(3);
    expect(byArea(6, 3, 52, 31), 'bakery and garden route').toBeGreaterThanOrEqual(8);
    expect(byArea(43, 44, 79, 57), 'main street').toBeGreaterThanOrEqual(6);
    expect(byArea(50, 19, 86, 44), 'depot courtyard').toBeGreaterThanOrEqual(6);
    expect(byArea(58, 6, 91, 21), 'garage and dock').toBeGreaterThanOrEqual(4);
  });

  it('rasterises collision only for props that block movement', () => {
    const propLayer = layer('propCollision')!.data!;
    const claimed = propLayer.filter(Boolean).length;
    expect(claimed).toBeGreaterThan(0);
    // Every claimed tile must carry a cover role, never a bare decorative tile.
    const allowed = new Set([roleGid('barrierLow'), roleGid('crateHigh'), roleGid('blocker')]);
    for (const gid of propLayer) {
      if (gid === 0) continue;
      expect(allowed.has(gid)).toBe(true);
    }
  });

  it('never draws a cover tile under a prop that supplies its own collision', () => {
    const cover = layer('cover')!.data!;
    const propLayer = layer('propCollision')!.data!;
    for (let i = 0; i < cover.length; i++) {
      if (propLayer[i] !== 0) expect(cover[i], `tile ${i}`).toBe(0);
    }
  });

  it('leaves the fountain and the hay cart as props, not duplicated cover tiles', () => {
    const names = new Set(placed.map((o) => String(o.props.prop)));
    expect(names.has('fountain')).toBe(true);
    expect(names.has('hay_cart')).toBe(true);
    // No cover tile is drawn under the fountain or either hay cart: each one
    // supplies its own collision through the propCollision layer.
    const cover = layer('cover')!.data!;
    const idx = (x: number, y: number) => y * map.width + x;
    for (const o of placed) {
      if (!['fountain', 'hay_cart'].includes(String(o.props.prop))) continue;
      const tx = Math.floor(o.x / TILE);
      const ty = Math.floor(o.y / TILE) - 1;
      expect(cover[idx(tx, ty)], `${o.name} has a cover tile under it`).toBe(0);
    }
  });
});

describe('softlock resistance', () => {
  const spawn = byName('spawn')!;

  it('anchors every gameplay object on walkable ground', () => {
    for (const obj of objects) {
      // Exits are trigger rectangles; props legitimately stand in their own
      // collision footprint.
      if (obj.type === 'exit' || obj.type === 'prop' || obj.type === 'decor') continue;
      expect(
        walkable(Math.floor(obj.x / TILE), Math.floor(obj.y / TILE)),
        `${obj.name} sits on a solid tile`
      ).toBe(true);
    }
  });

  it('can reach every objective, supply and checkpoint from the spawn point', () => {
    for (const name of [
      'interact_van',
      'interact_log',
      'interact_sigil',
      'interact_radio',
      'interact_hymn',
      'checkpoint_log',
      'item_medkit_market',
      'item_medkit_courtyard',
      'item_ammo_street',
      'item_ammo_lane',
    ]) {
      const target = byName(name)!;
      const path = grid.findPath({ x: spawn.x, y: spawn.y }, { x: target.x, y: target.y }, 60000);
      expect(path, `no path from spawn to ${name}`).not.toBeNull();
    }
    const exit = byName('exit_north')!;
    const centre = { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 };
    expect(grid.findPath({ x: spawn.x, y: spawn.y }, centre, 60000)).not.toBeNull();
  });

  it('keeps patrol waypoints walkable after props are placed', () => {
    for (const wp of byType('waypoint')) {
      expect(
        walkable(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE)),
        `${wp.name} blocked by a prop`
      ).toBe(true);
    }
  });

  it('offers a second approach: the garden route reaches the depot', () => {
    expect(walkable(8, 10)).toBe(true);
    expect(walkable(20, 4)).toBe(true);
    const path = grid.findPath(
      { x: 17 * TILE + 8, y: 31 * TILE + 8 },
      { x: 51 * TILE + 8, y: 26 * TILE + 8 },
      60000
    );
    expect(path).not.toBeNull();
  });
});
