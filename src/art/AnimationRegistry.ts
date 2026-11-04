import Phaser from 'phaser';
import { CHARACTER_KEYS, textureKey, type CharacterKey } from './AssetRegistry';
import {
  CHARACTERS,
  animKey,
  frameIndex,
  frameIndices,
  type CharState,
} from './CharacterDefinitions';

/**
 * Registers every character and FX animation from explicit metadata.
 *
 * Frame rates are chosen so the walk cycle reads at the game's movement speeds
 * (walk 108 px/s over 16px tiles) without the frame-to-frame registration
 * wobble the package README warns about.
 */

export const FX_ANIM = {
  muzzle: 'anim.fx.muzzle',
  blood: 'anim.fx.blood',
} as const;

/** Looping states and their frame rates. One-shot states are played explicitly. */
const LOOPING: Record<string, number> = {
  idle: 3,
  walk: 9,
};

export function registerAnimations(scene: Phaser.Scene): void {
  for (const name of CHARACTER_KEYS) registerCharacter(scene, name);

  // Muzzle flash: 4 frames across the 0.36 s pistol fire interval, so the
  // flash is clearly over before the next shot can be fired.
  if (!scene.anims.exists(FX_ANIM.muzzle)) {
    scene.anims.create({
      key: FX_ANIM.muzzle,
      frames: scene.anims.generateFrameNumbers(textureKey.fx('muzzle'), { start: 0, end: 3 }),
      frameRate: 24,
      repeat: 0,
      hideOnComplete: true,
    });
  }

  if (!scene.anims.exists(FX_ANIM.blood)) {
    scene.anims.create({
      key: FX_ANIM.blood,
      frames: scene.anims.generateFrameNumbers(textureKey.fx('blood'), { start: 0, end: 3 }),
      frameRate: 18,
      repeat: 0,
      hideOnComplete: true,
    });
  }
}

function registerCharacter(scene: Phaser.Scene, name: CharacterKey): void {
  const def = CHARACTERS[name];
  const key = textureKey.character(name);

  const create = (state: CharState, frames: number[], frameRate: number, repeat: number) => {
    const animName = animKey(name, state);
    if (scene.anims.exists(animName)) return;
    scene.anims.create({
      key: animName,
      frames: frames.map((frame) => ({ key, frame })),
      frameRate,
      repeat,
    });
  };

  create('idle', frameIndices('idle', def.idleFrames), LOOPING.idle, -1);
  create('walk', frameIndices('walk', def.walkFrames), LOOPING.walk, -1);
  // Single-frame states: registered as animations so callers use one code path.
  create('aim', [frameIndex('aim', def.aimFrame)], 1, 0);
  create('fire', [frameIndex('fire', def.fireFrame)], 1, 0);
  create('hit', [frameIndex('hit', def.hitFrame)], 1, 0);
  create('down', [frameIndex('down', def.downFrame)], 1, 0);
}

/** Static frame for a state, for callers that set a frame instead of playing one. */
export function staticFrame(name: CharacterKey, state: CharState): number {
  const def = CHARACTERS[name];
  switch (state) {
    case 'idle':
      return frameIndex('idle', def.idleFrames[0]);
    case 'walk':
      return frameIndex('walk', def.walkFrames[0]);
    case 'aim':
      return frameIndex('aim', def.aimFrame);
    case 'fire':
      return frameIndex('fire', def.fireFrame);
    case 'hit':
      return frameIndex('hit', def.hitFrame);
    case 'down':
      return frameIndex('down', def.downFrame);
  }
}
