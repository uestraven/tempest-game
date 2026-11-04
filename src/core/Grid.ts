/**
 * Tile-grid occlusion, line of sight, hitscan and bounded pathfinding.
 *
 * Deliberately free of Phaser so detection and cover rules can be unit tested
 * (spec acceptance criteria 3 and 4: walls block sight, a player is never shot
 * through a wall, crouch slows rather than negates detection).
 */

import { TILE } from './constants';

export interface TileFlags {
  collides: boolean;
  blocksSight: boolean;
  lowCover: boolean;
  shadow: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface RayHit {
  /** Impact point in world pixels. */
  x: number;
  y: number;
  /** Distance travelled from the origin, in pixels. */
  distance: number;
  /** True when a tile stopped the ray before it reached the requested range. */
  blocked: boolean;
  tileX: number;
  tileY: number;
}

const EMPTY: TileFlags = { collides: false, blocksSight: false, lowCover: false, shadow: false };

export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly flags: TileFlags[];
  /** Tile index -> closed. Absent means the tile is not a door. */
  private readonly doors = new Map<number, boolean>();

  constructor(width: number, height: number, flags?: TileFlags[]) {
    this.width = width;
    this.height = height;
    this.flags =
      flags ??
      Array.from({ length: width * height }, () => ({
        collides: false,
        blocksSight: false,
        lowCover: false,
        shadow: false,
      }));
  }

  index(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /**
   * Effective flags for a tile, including door state.
   *
   * A closed door is solid and blocks sight; an open one blocks neither. Doing
   * it here means every consumer agrees without knowing doors exist: line of
   * sight, hitscan, enemy vision and A* pathing all read the same answer, so a
   * visibly closed door cannot be walked through, seen through or shot through.
   */
  at(tx: number, ty: number): TileFlags {
    if (!this.inBounds(tx, ty)) return EMPTY;
    const i = this.index(tx, ty);
    const base = this.flags[i];
    const closed = this.doors.get(i);
    if (closed === undefined) return base;
    return closed ? { ...base, collides: true, blocksSight: true } : { ...base, collides: false, blocksSight: false, lowCover: false };
  }

  /**
   * Registers a tile as a door and sets its state. Door tiles are carved as
   * walkable floor in the map so pathing works once they are open; while closed
   * this override makes them behave exactly like wall.
   */
  setDoor(tx: number, ty: number, closed: boolean): void {
    if (!this.inBounds(tx, ty)) return;
    this.doors.set(this.index(tx, ty), closed);
  }

  isDoorTile(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.doors.has(this.index(tx, ty));
  }

  /** Out-of-bounds counts as solid so actors can never leave the authored map. */
  solidAt(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    // Through at(), so a closed door is solid for pathing too.
    return this.at(tx, ty).collides;
  }

  merge(tx: number, ty: number, patch: Partial<TileFlags>): void {
    if (!this.inBounds(tx, ty)) return;
    const f = this.flags[this.index(tx, ty)];
    if (patch.collides) f.collides = true;
    if (patch.blocksSight) f.blocksSight = true;
    if (patch.lowCover) f.lowCover = true;
    if (patch.shadow) f.shadow = true;
  }

  isShadowWorld(x: number, y: number): boolean {
    return this.at(Math.floor(x / TILE), Math.floor(y / TILE)).shadow;
  }

  isSolidWorld(x: number, y: number): boolean {
    return this.solidAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /**
   * Amanatides & Woo voxel traversal. Walks tiles the segment actually passes
   * through - no diagonal "seeing through corners" and no skipped tiles.
   */
  private cast(
    from: Vec2,
    dirX: number,
    dirY: number,
    maxDistance: number,
    blocks: (f: TileFlags) => boolean
  ): RayHit {
    let tx = Math.floor(from.x / TILE);
    let ty = Math.floor(from.y / TILE);
    // Outside the authored map counts as solid, so nothing can see or shoot off-map.
    const stops = (x: number, y: number): boolean =>
      !this.inBounds(x, y) || blocks(this.at(x, y));

    if (stops(tx, ty)) {
      // Origin already inside a blocker (e.g. muzzle clipped into a crate).
      return { x: from.x, y: from.y, distance: 0, blocked: true, tileX: tx, tileY: ty };
    }

    const stepX = dirX > 0 ? 1 : dirX < 0 ? -1 : 0;
    const stepY = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;

    const invX = dirX !== 0 ? 1 / Math.abs(dirX) : Infinity;
    const invY = dirY !== 0 ? 1 / Math.abs(dirY) : Infinity;
    const tDeltaX = TILE * invX;
    const tDeltaY = TILE * invY;

    const offsetX = from.x - tx * TILE;
    const offsetY = from.y - ty * TILE;
    let tMaxX = stepX > 0 ? (TILE - offsetX) * invX : stepX < 0 ? offsetX * invX : Infinity;
    let tMaxY = stepY > 0 ? (TILE - offsetY) * invY : stepY < 0 ? offsetY * invY : Infinity;

    let travelled = 0;
    // One extra iteration guard per axis crossing; bounded by map size.
    const limit = 2 * (this.width + this.height) + 4;
    for (let i = 0; i < limit; i++) {
      const next = Math.min(tMaxX, tMaxY);
      if (next > maxDistance) break;
      travelled = next;
      if (tMaxX < tMaxY) {
        tx += stepX;
        tMaxX += tDeltaX;
      } else {
        ty += stepY;
        tMaxY += tDeltaY;
      }
      if (stops(tx, ty)) {
        return {
          x: from.x + dirX * travelled,
          y: from.y + dirY * travelled,
          distance: travelled,
          blocked: true,
          tileX: tx,
          tileY: ty,
        };
      }
    }

    return {
      x: from.x + dirX * maxDistance,
      y: from.y + dirY * maxDistance,
      distance: maxDistance,
      blocked: false,
      tileX: Math.floor((from.x + dirX * maxDistance) / TILE),
      tileY: Math.floor((from.y + dirY * maxDistance) / TILE),
    };
  }

  /** Hitscan for player weapons. Any solid tile stops the round, regardless of stance. */
  raycastShot(from: Vec2, angle: number, range: number): RayHit {
    return this.cast(from, Math.cos(angle), Math.sin(angle), range, (f) => f.collides);
  }

  /**
   * Where a SIGHT ray stops, using the same occlusion predicate as
   * `hasLineOfSight`: `blocksSight`, plus low cover when the target is
   * crouched.
   *
   * Exists so the F3 vision overlay can draw the cone the engine actually
   * uses rather than an approximation of it. `raycastShot` is the wrong tool
   * here - it stops on `collides`, and low cover collides with bullets while
   * leaving a standing target perfectly visible.
   */
  raycastSight(from: Vec2, angle: number, range: number, targetCrouched = false): RayHit {
    return this.cast(
      from,
      Math.cos(angle),
      Math.sin(angle),
      range,
      (f) => f.blocksSight || (targetCrouched && f.lowCover)
    );
  }

  /** True when `from` can physically see `to`. Low cover only hides a crouched target. */
  hasLineOfSight(from: Vec2, to: Vec2, targetCrouched: boolean): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return true;
    const hit = this.cast(
      from,
      dx / dist,
      dy / dist,
      dist,
      (f) => f.blocksSight || (targetCrouched && f.lowCover)
    );
    return !hit.blocked;
  }

  /** Unobstructed reach check for interactions (spec section 5). */
  hasClearReach(from: Vec2, to: Vec2): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return true;
    return !this.cast(from, dx / dist, dy / dist, dist, (f) => f.blocksSight).blocked;
  }

  /**
   * Bounded A* over walkable tiles with 8-way movement and no corner cutting.
   * Used for patrol legs and investigation approaches; returns world-space
   * waypoint centres, or null if no path is found inside the node budget.
   */
  findPath(from: Vec2, to: Vec2, maxNodes = 2400): Vec2[] | null {
    const sx = Math.floor(from.x / TILE);
    const sy = Math.floor(from.y / TILE);
    let gx = Math.floor(to.x / TILE);
    let gy = Math.floor(to.y / TILE);

    if (this.solidAt(sx, sy)) return null;
    if (this.solidAt(gx, gy)) {
      const near = this.nearestOpen(gx, gy);
      if (!near) return null;
      gx = near.x;
      gy = near.y;
    }
    if (sx === gx && sy === gy) return [{ x: to.x, y: to.y }];

    const start = this.index(sx, sy);
    const goal = this.index(gx, gy);
    const gScore = new Map<number, number>([[start, 0]]);
    const cameFrom = new Map<number, number>();
    // Small maps: a sorted-insert open list beats a heap in clarity and is fast enough.
    const open: { i: number; f: number }[] = [{ i: start, f: this.heuristic(sx, sy, gx, gy) }];
    const closed = new Set<number>();
    let expanded = 0;

    while (open.length > 0 && expanded < maxNodes) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;
      if (current.i === goal) return this.reconstruct(cameFrom, goal, to);
      if (closed.has(current.i)) continue;
      closed.add(current.i);
      expanded++;

      const cx = current.i % this.width;
      const cy = Math.floor(current.i / this.width);
      const baseG = gScore.get(current.i) ?? Infinity;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.solidAt(nx, ny)) continue;
          // No squeezing through diagonal gaps between two solids.
          if (dx !== 0 && dy !== 0 && (this.solidAt(cx + dx, cy) || this.solidAt(cx, cy + dy)))
            continue;
          const ni = this.index(nx, ny);
          if (closed.has(ni)) continue;
          const stepCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
          const tentative = baseG + stepCost;
          if (tentative >= (gScore.get(ni) ?? Infinity)) continue;
          gScore.set(ni, tentative);
          cameFrom.set(ni, current.i);
          open.push({ i: ni, f: tentative + this.heuristic(nx, ny, gx, gy) });
        }
      }
    }
    return null;
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  private reconstruct(cameFrom: Map<number, number>, goal: number, exact: Vec2): Vec2[] {
    const tiles: number[] = [goal];
    let cursor = goal;
    while (cameFrom.has(cursor)) {
      cursor = cameFrom.get(cursor)!;
      tiles.push(cursor);
    }
    tiles.pop(); // drop the tile the actor already stands on
    tiles.reverse();
    const path = tiles.map((i) => ({
      x: (i % this.width) * TILE + TILE / 2,
      y: Math.floor(i / this.width) * TILE + TILE / 2,
    }));
    if (path.length > 0) path[path.length - 1] = { x: exact.x, y: exact.y };
    return path;
  }

  private nearestOpen(tx: number, ty: number): { x: number; y: number } | null {
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.solidAt(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }
}

/** Shortest signed difference between two angles, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
