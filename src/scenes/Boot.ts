import Phaser from 'phaser';
import { enforceNearestFiltering, queueAssets, validateAssets } from '../art/AssetLoader';
import { registerAnimations } from '../art/AnimationRegistry';
import { buildPlaceholderArt } from '../art/textures';
import { PixelText } from '../ui/font';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';

/**
 * Loads the production art package, validates it, registers animations, then
 * builds the small set of generated placeholders the package does not cover.
 *
 * If validation finds a problem the boot scene stops and shows it rather than
 * starting the game with wrong frame grids or missing textures.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    queueAssets(this);

    const bar = this.add.graphics().setDepth(10);
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bar.clear();
      bar.fillStyle(0x2a2f3a, 1);
      bar.fillRect(90, VIRTUAL_HEIGHT / 2 - 2, 300, 5);
      bar.fillStyle(0xe8c07a, 1);
      bar.fillRect(90, VIRTUAL_HEIGHT / 2 - 2, Math.round(300 * value), 5);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => bar.destroy());
  }

  create(): void {
    const problems = validateAssets(this);
    enforceNearestFiltering(this);

    if (problems.length > 0) {
      for (const p of problems) console.error(`[assets] ${p.key} (${p.path}): ${p.problem}`);
      this.showFailure(problems.map((p) => `${p.key}: ${p.problem}`));
      return;
    }

    buildPlaceholderArt(this);
    registerAnimations(this);
    this.scene.start('Title');
  }

  private showFailure(lines: string[]): void {
    this.cameras.main.setBackgroundColor(0x1a0f10);
    new PixelText(this, VIRTUAL_WIDTH / 2, 40, 'ASSET LOAD FAILED', {
      align: 'center',
      color: 0xd9472f,
    });
    new PixelText(this, 10, 64, lines.slice(0, 12).join('\n'), { color: 0xe8e2d4 });
    if (lines.length > 12) {
      new PixelText(this, 10, VIRTUAL_HEIGHT - 20, `...and ${lines.length - 12} more`, {
        color: 0x8d8778,
      });
    }
  }
}
