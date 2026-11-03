import Phaser from 'phaser';
import { buildAllArt, FRAME_COLS, PLAYER_KEY } from '../art/textures';

/** Generates placeholder art, registers animations, loads the Tiled map. */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  override preload(): void {
    this.load.tilemapTiledJSON('village', 'maps/village.json');
  }

  override create(): void {
    buildAllArt(this);
    this.registerWalkAnims(PLAYER_KEY, 8);
    this.registerWalkAnims('enemy_lookout', 4);
    this.scene.start('Title');
  }

  /**
   * Rows are facing directions (stand rows 0-3, crouch rows 4-7); columns are
   * idle, step A, step B. The walk cycle alternates through the idle pose.
   */
  private registerWalkAnims(key: string, rows: number): void {
    for (let row = 0; row < rows; row++) {
      const base = row * FRAME_COLS;
      const crouch = row >= 4;
      const name =
        key === PLAYER_KEY
          ? `player_walk_${row % 4}_${crouch ? 'c' : 's'}`
          : `${key}_walk_${row % 4}`;
      if (this.anims.exists(name)) continue;
      this.anims.create({
        key: name,
        frames: [base + 1, base, base + 2, base].map((frame) => ({ key, frame })),
        frameRate: 7,
        repeat: -1,
      });
    }
  }
}
