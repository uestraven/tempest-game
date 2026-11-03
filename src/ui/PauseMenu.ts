import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';
import { PixelText } from './font';

const CONTROLS = [
  'WASD   MOVE',
  'MOUSE  AIM',
  'LMB    FIRE',
  'R      RELOAD',
  'C      CROUCH',
  'SHIFT  SPRINT',
  'E      INTERACT / TAKEDOWN',
  '1 / 2  PISTOL / SHOTGUN',
];

export interface PauseActions {
  resume: () => void;
  restartCheckpoint: () => void;
  quitToTitle: () => void;
}

/** Pause overlay carrying the objective recap and the controls (spec section 9). */
export class PauseMenu {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly title: PixelText;
  private readonly objective: PixelText;
  private readonly controls: PixelText;
  private readonly options: PixelText;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly actions: PauseActions
  ) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(118);
    this.title = new PixelText(scene, VIRTUAL_WIDTH / 2, 30, 'PAUSED', {
      depth: 120,
      align: 'center',
      color: 0xe8c07a,
    });
    this.objective = new PixelText(scene, VIRTUAL_WIDTH / 2, 46, '', {
      depth: 120,
      align: 'center',
    });
    this.controls = new PixelText(scene, VIRTUAL_WIDTH / 2, 76, CONTROLS.join('\n'), {
      depth: 120,
      align: 'center',
      color: 0xbfc8d4,
    });
    this.options = new PixelText(
      scene,
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 48,
      'ESC RESUME     K RESTART CHECKPOINT     Q QUIT TO TITLE',
      { depth: 120, align: 'center', color: 0xe8e2d4 }
    );
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  open(objectiveText: string): void {
    this.objective.setText(objectiveText);
    this.setVisible(true);
    this.draw();
  }

  close(): void {
    this.setVisible(false);
  }

  /** Returns true when the key was consumed by the menu. */
  handleKey(key: string): boolean {
    if (!this.visible) return false;
    switch (key) {
      case 'Escape':
        this.actions.resume();
        return true;
      case 'KeyK':
        this.actions.restartCheckpoint();
        return true;
      case 'KeyQ':
        this.actions.quitToTitle();
        return true;
      default:
        return false;
    }
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.gfx.setVisible(visible);
    this.title.setVisible(visible);
    this.objective.setVisible(visible);
    this.controls.setVisible(visible);
    this.options.setVisible(visible);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x07080c, 0.86);
    g.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    g.lineStyle(1, 0x3b4150, 1);
    g.strokeRect(24, 20, VIRTUAL_WIDTH - 48, VIRTUAL_HEIGHT - 40);
  }

  destroy(): void {
    this.gfx.destroy();
    this.title.destroy();
    this.objective.destroy();
    this.controls.destroy();
    this.options.destroy();
  }
}
