import Phaser from 'phaser';
import { ASSETS, MAP_FILES, type AssetEntry } from './AssetRegistry';

/**
 * Queues every registered asset and validates what actually loaded.
 *
 * Validation is deliberately loud: a wrong sheet dimension or a missing file
 * silently produces either a green "missing texture" box or, worse, animations
 * built from the wrong frame grid. `validateAssets` returns the problems so the
 * boot scene can surface them instead of shipping a broken build.
 */

export interface AssetProblem {
  key: string;
  path: string;
  problem: string;
}

export function queueAssets(scene: Phaser.Scene): void {
  for (const asset of ASSETS) {
    if (asset.kind === 'spritesheet') {
      scene.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameWidth!,
        frameHeight: asset.frameHeight!,
        // No margin or spacing: every sheet is a tight grid. Getting this wrong
        // is what produces "accidental padding between frames".
        margin: 0,
        spacing: 0,
      });
    } else {
      scene.load.image(asset.key, asset.path);
    }
  }
  for (const [key, path] of Object.entries(MAP_FILES)) {
    scene.load.tilemapTiledJSON(key, path);
  }
}

/** Checks each loaded texture against the dimensions measured from the files. */
export function validateAssets(scene: Phaser.Scene): AssetProblem[] {
  const problems: AssetProblem[] = [];

  for (const asset of ASSETS) {
    if (!scene.textures.exists(asset.key)) {
      problems.push({ key: asset.key, path: asset.path, problem: 'texture failed to load' });
      continue;
    }
    const texture = scene.textures.get(asset.key);
    const source = texture.source[0];
    if (source.width !== asset.width || source.height !== asset.height) {
      problems.push({
        key: asset.key,
        path: asset.path,
        problem: `expected ${asset.width}x${asset.height}, got ${source.width}x${source.height}`,
      });
    }
    const problem = frameProblem(texture, asset);
    if (problem) problems.push({ key: asset.key, path: asset.path, problem });
  }

  for (const [key, path] of Object.entries(MAP_FILES)) {
    if (!scene.cache.tilemap.has(key)) {
      problems.push({ key, path, problem: 'tilemap JSON failed to load' });
    }
  }

  return problems;
}

function frameProblem(texture: Phaser.Textures.Texture, asset: AssetEntry): string | null {
  if (asset.kind !== 'spritesheet' || asset.frameCount === undefined) return null;
  // Phaser's frame list includes the implicit '__BASE' frame.
  const count = texture.getFrameNames().length;
  if (count !== asset.frameCount) {
    return `expected ${asset.frameCount} frames, got ${count}`;
  }
  const expectedCols = asset.width / asset.frameWidth!;
  const expectedRows = asset.height / asset.frameHeight!;
  if (!Number.isInteger(expectedCols) || !Number.isInteger(expectedRows)) {
    return `frame size ${asset.frameWidth}x${asset.frameHeight} does not tile ${asset.width}x${asset.height} exactly`;
  }
  return null;
}

/**
 * Forces nearest-neighbour filtering on every loaded texture.
 *
 * `pixelArt: true` in the game config already does this for textures created
 * through the normal path, but setting it explicitly means a texture added by
 * any other route cannot reintroduce bilinear smoothing.
 */
export function enforceNearestFiltering(scene: Phaser.Scene): void {
  for (const asset of ASSETS) {
    if (!scene.textures.exists(asset.key)) continue;
    scene.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
