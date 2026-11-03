import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './core/constants';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Village } from './scenes/Village';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // 480x270 virtual pixels, nearest-neighbour upscale, letterboxed as needed.
  width: VIRTUAL_WIDTH,
  height: VIRTUAL_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  backgroundColor: '#0b0d12',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      // Bounded timestep: physics does not vary with monitor refresh rate.
      fixedStep: true,
      fps: 60,
      debug: false,
    },
  },
  scene: [Boot, Title, Village],
};

new Phaser.Game(config);
