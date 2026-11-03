import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';
import { PixelText } from './font';
import type { DialogueLine } from '../data/dialogue';

/**
 * Two-to-three short lines before input, fast reveal, one advance/skip control.
 * Dialogue never blocks movement, so it can never leave the game stuck.
 */
export class DialogueBox {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly speaker: PixelText;
  private readonly body: PixelText;
  private readonly hint: PixelText;

  private queue: DialogueLine[] = [];
  private current: DialogueLine | null = null;
  private revealed = 0;
  private onFinish: (() => void) | null = null;

  /** Characters per second. Fast by design; advance skips the rest instantly. */
  private readonly speed = 90;

  constructor(scene: Phaser.Scene) {
    const top = VIRTUAL_HEIGHT - 36;
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(104);
    this.speaker = new PixelText(scene, 10, top + 4, '', { depth: 105, color: 0xe8c07a });
    this.body = new PixelText(scene, 10, top + 13, '', { depth: 105 });
    this.hint = new PixelText(scene, VIRTUAL_WIDTH - 10, top + 4, 'SPACE', {
      depth: 105,
      align: 'right',
      color: 0x8d8778,
    });
    this.setVisible(false);
  }

  get active(): boolean {
    return this.current !== null;
  }

  play(lines: DialogueLine[], onFinish?: () => void): void {
    if (lines.length === 0) {
      onFinish?.();
      return;
    }
    this.queue = [...lines];
    this.onFinish = onFinish ?? null;
    this.next();
  }

  /** Advance: completes the reveal first, then moves to the next line. */
  advance(): void {
    if (!this.current) return;
    if (this.revealed < this.current.text.length) {
      this.revealed = this.current.text.length;
      this.body.setText(this.current.text);
      return;
    }
    this.next();
  }

  /** Skip the whole exchange. Always leaves a consistent state. */
  skip(): void {
    this.queue = [];
    this.finish();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.finish();
      return;
    }
    this.current = line;
    this.revealed = 0;
    this.speaker.setText(line.speaker);
    this.body.setText('');
    this.setVisible(true);
    this.draw();
  }

  private finish(): void {
    this.current = null;
    this.setVisible(false);
    const cb = this.onFinish;
    this.onFinish = null;
    cb?.();
  }

  update(dt: number): void {
    if (!this.current) return;
    if (this.revealed < this.current.text.length) {
      this.revealed = Math.min(this.current.text.length, this.revealed + this.speed * dt);
      this.body.setText(this.current.text.slice(0, Math.floor(this.revealed)));
    }
  }

  private setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
    this.speaker.setVisible(visible);
    this.body.setVisible(visible);
    this.hint.setVisible(visible);
  }

  private draw(): void {
    const top = VIRTUAL_HEIGHT - 36;
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x0d0f14, 0.9);
    g.fillRect(6, top, VIRTUAL_WIDTH - 12, 30);
    g.lineStyle(1, 0x3b4150, 1);
    g.strokeRect(6, top, VIRTUAL_WIDTH - 12, 30);
  }

  destroy(): void {
    this.gfx.destroy();
    this.speaker.destroy();
    this.body.destroy();
    this.hint.destroy();
  }
}
