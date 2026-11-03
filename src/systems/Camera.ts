import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';

/**
 * Follow camera with a small dead zone and hard pixel snapping. No mouse-look
 * offset during initial development (spec section 5).
 */
export function setupCamera(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  mapWidth: number,
  mapHeight: number
): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, mapWidth, mapHeight);
  cam.setRoundPixels(true);
  cam.startFollow(target as Phaser.GameObjects.Sprite, true, 0.18, 0.18);
  cam.setDeadzone(Math.round(VIRTUAL_WIDTH * 0.12), Math.round(VIRTUAL_HEIGHT * 0.12));
  return cam;
}
