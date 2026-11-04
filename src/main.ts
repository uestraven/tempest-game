import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './core/constants';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Village } from './scenes/Village';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // 480x270 virtual pixels.
  width: VIRTUAL_WIDTH,
  height: VIRTUAL_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  backgroundColor: '#0b0d12',
  scale: {
    // NONE plus an explicit integer zoom below. FIT would scale by a fractional
    // factor, which smears a 16px grid no matter how good the filtering is.
    mode: Phaser.Scale.NONE,
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

const game = new Phaser.Game(config);

/**
 * Integer scaling, with a documented fallback.
 *
 * Preferred: the largest whole-number multiple of 480x270 that fits the
 * viewport, letterboxed by the centring. Every game pixel is then exactly
 * NxN screen pixels, so nothing blurs and nothing lands on a half pixel.
 *
 * Fallback: when the viewport is smaller than one full 480x270 (a short browser
 * window, a phone in portrait), integer scaling would crop the playfield, so we
 * switch to FIT. That is the one case where a fractional factor is accepted,
 * because showing the whole level matters more than per-pixel crispness.
 */
function applyScale(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const fits = width >= VIRTUAL_WIDTH && height >= VIRTUAL_HEIGHT;

  if (fits) {
    const zoom = Math.max(1, Math.floor(Math.min(width / VIRTUAL_WIDTH, height / VIRTUAL_HEIGHT)));
    game.scale.scaleMode = Phaser.Scale.NONE;
    game.scale.setZoom(zoom);
  } else {
    game.scale.scaleMode = Phaser.Scale.FIT;
  }
  game.scale.refresh();
}

window.addEventListener('resize', applyScale);
game.events.once(Phaser.Core.Events.READY, applyScale);
