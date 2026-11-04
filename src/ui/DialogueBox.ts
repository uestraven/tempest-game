import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';
import { PixelText } from './font';
import { textureKey, type CharacterKey } from '../art/AssetRegistry';
import type { DialogueLine } from '../data/dialogue';

/**
 * Two-to-three short lines before input, fast reveal, one advance/skip control.
 * Dialogue never blocks movement, so it can never leave the game stuck.
 *
 * Framed with the supplied nine-slice panel. Its borders are 16px (48x48 image,
 * 3x3 cells), so the panel is 56px tall - comfortably above the 32px minimum a
 * 16px nine-slice needs, and tall enough to hold a portrait without scaling it.
 * Corners are therefore drawn 1:1 and only the middle strips stretch.
 *
 * Portraits appear ONLY here, never as a permanent HUD element, because they are
 * 61-65px wide and would eat a seventh of a 480x270 screen.
 */

const PANEL_HEIGHT = 56;
const PANEL_TOP = VIRTUAL_HEIGHT - PANEL_HEIGHT;
const BORDER = 16;
/** Fixed portrait slot. Portrait sizes are irregular, so they are centred in it. */
const PORTRAIT_SLOT = { x: 6, y: PANEL_TOP + 1, width: 65, height: 54 };
const TEXT_LEFT = PORTRAIT_SLOT.x + PORTRAIT_SLOT.width + 6;

/** Which portrait a speaker uses. Unlisted speakers show no portrait. */
const SPEAKER_PORTRAITS: Record<string, CharacterKey> = {
  TEMPEST: 'tempest',
  SUZANNE: 'suzanne',
  BARNABE: 'barnabe',
  LOOKOUT: 'lookout_guard',
};

export class DialogueBox {
  private readonly panel: Phaser.GameObjects.NineSlice;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly speaker: PixelText;
  private readonly body: PixelText;
  private readonly hint: PixelText;

  private queue: DialogueLine[] = [];
  private current: DialogueLine | null = null;
  private revealed = 0;
  private onFinish: (() => void) | null = null;
  private hasPortrait = false;

  /** Characters per second. Fast by design; advance skips the rest instantly. */
  private readonly speed = 90;

  constructor(scene: Phaser.Scene) {
    this.panel = scene.add
      .nineslice(
        0,
        PANEL_TOP,
        textureKey.ui('panel'),
        undefined,
        VIRTUAL_WIDTH,
        PANEL_HEIGHT,
        BORDER,
        BORDER,
        BORDER,
        BORDER
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(104);

    this.portrait = scene.add
      .image(PORTRAIT_SLOT.x + PORTRAIT_SLOT.width / 2, PORTRAIT_SLOT.y + PORTRAIT_SLOT.height / 2, '__DEFAULT')
      .setScrollFactor(0)
      .setDepth(105);

    this.speaker = new PixelText(scene, TEXT_LEFT, PANEL_TOP + 8, '', {
      depth: 105,
      color: 0xe8c07a,
    });
    this.body = new PixelText(scene, TEXT_LEFT, PANEL_TOP + 22, '', { depth: 105 });
    this.hint = new PixelText(scene, VIRTUAL_WIDTH - 12, PANEL_TOP + 8, 'SPACE', {
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
      this.body.setText(this.wrap(this.current.text));
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
    this.applyPortrait(line.speaker);
    this.setVisible(true);
  }

  private applyPortrait(speaker: string): void {
    const key = SPEAKER_PORTRAITS[speaker.toUpperCase()];
    const texture = key ? textureKey.portrait(key) : null;
    this.hasPortrait = !!texture && this.portrait.scene.textures.exists(texture);
    if (!this.hasPortrait || !texture) {
      this.portrait.setVisible(false);
      return;
    }
    this.portrait.setTexture(texture);
    // Drawn 1:1 and centred in the fixed slot. Portraits are 61-65 x 52-55 px,
    // so centring is what absorbs the per-file size differences; nothing scales.
    this.portrait.setDisplaySize(this.portrait.width, this.portrait.height);
    this.portrait.setVisible(true);
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
      this.body.setText(this.wrap(this.current.text.slice(0, Math.floor(this.revealed))));
    }
  }

  /** Hard-wraps on word boundaries to the width left beside the portrait. */
  private wrap(text: string): string {
    const columns = Math.floor((VIRTUAL_WIDTH - TEXT_LEFT - 14) / 6);
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line.length === 0) line = word;
      else if (line.length + 1 + word.length <= columns) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.slice(0, 3).join('\n');
  }

  private setVisible(visible: boolean): void {
    this.panel.setVisible(visible);
    this.portrait.setVisible(visible && this.hasPortrait);
    this.speaker.setVisible(visible);
    this.body.setVisible(visible);
    this.hint.setVisible(visible);
  }

  destroy(): void {
    this.panel.destroy();
    this.portrait.destroy();
    this.speaker.destroy();
    this.body.destroy();
    this.hint.destroy();
  }
}
