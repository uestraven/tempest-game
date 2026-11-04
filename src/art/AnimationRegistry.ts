import Phaser from 'phaser';
import { CHARACTER_KEYS, textureKey, type CharacterKey } from './AssetRegistry';
import {
  CHARACTERS,
  CHAR_STATES,
  FACINGS,
  animKey,
  clipFor,
  type CharState,
  type Facing,
} from './CharacterDefinitions';

/**
 * Registers every character and FX animation from explicit metadata.
 *
 * One animation per (character, state, facing). Mirroring is NOT baked into the
 * animation: the clip records whether its art needs flipping, and the actor
 * applies `setFlipX` when it plays. That keeps the flip relative to each clip's
 * intrinsic facing, which differs per character and per row - see
 * CharacterDefinitions.ts.
 */

export const FX_ANIM = {
  muzzle: 'anim.fx.muzzle',
  blood: 'anim.fx.blood',
} as const;

export function registerAnimations(scene: Phaser.Scene): void {
  for (const name of CHARACTER_KEYS) registerCharacter(scene, name);

  // Muzzle flash: 4 frames across the 0.36 s pistol interval, so the flash is
  // clearly over before the next shot can be fired.
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
  const key = textureKey.character(name);
  for (const state of CHAR_STATES) {
    for (const facing of FACINGS) {
      const animName = animKey(name, state, facing);
      if (scene.anims.exists(animName)) continue;
      const clip = CHARACTERS[name].clips[state][facing];
      scene.anims.create({
        key: animName,
        frames: clip.frames.map((frame) => ({ key, frame })),
        frameRate: clip.fps,
        repeat: clip.loop ? -1 : 0,
      });
    }
  }
}

/** First frame of a clip, for callers that set a frame instead of playing one. */
export function staticFrame(name: CharacterKey, state: CharState, facing: Facing = 'down'): number {
  return clipFor(name, state, facing).frames[0];
}
