import Phaser from 'phaser';
import { PLAYER, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';
import { PixelText, measure } from './font';
import { textureKey } from '../art/AssetRegistry';
import type { Player } from '../actors/Player';

/**
 * Upper-left objective, lower-left HP, lower-right ammo, unobtrusive top-centre
 * clue notification, one context prompt. No permanent minimap (spec section 9).
 */
export class HUD {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly objective: PixelText;
  private readonly hpLabel: PixelText;
  private readonly ammoLabel: PixelText;
  private readonly prompt: PixelText;
  private readonly clue: PixelText;
  private readonly subtitle: PixelText;

  /**
   * Supplied awareness strip: frame 0 '?', 1 '!', 2 '!!', 3 detected-eye, read
   * from the artwork itself. Shows the highest alert level in the level, which
   * is what the player needs for stealth; the per-enemy icons say who.
   */
  private readonly awareness: Phaser.GameObjects.Image;
  private objectiveLine = '';
  private clueLine = '';
  private clueTimer = 0;
  private subtitleTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(98);

    this.objective = new PixelText(scene, 5, 5, '', { depth: 100 });
    this.hpLabel = new PixelText(scene, 5, VIRTUAL_HEIGHT - 21, '', { depth: 100 });
    this.ammoLabel = new PixelText(scene, VIRTUAL_WIDTH - 5, VIRTUAL_HEIGHT - 21, '', {
      depth: 100,
      align: 'right',
    });
    this.prompt = new PixelText(scene, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 43, '', {
      depth: 100,
      align: 'center',
      color: 0xf4e9c0,
    });
    this.clue = new PixelText(scene, VIRTUAL_WIDTH / 2, 15, '', {
      depth: 100,
      align: 'center',
      color: 0xf4e9c0,
    });
    this.subtitle = new PixelText(scene, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 57, '', {
      depth: 100,
      align: 'center',
      color: 0xbfc8d4,
    });

    this.awareness = scene.add
      .image(VIRTUAL_WIDTH - 12, 12, textureKey.ui('awareness'), 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
  }

  showClue(text: string, seconds = 4.5): void {
    this.clueLine = text;
    this.clue.setText(text);
    this.clueTimer = seconds;
  }

  /** Visual equivalent for a required audio cue (spec section 9, accessibility). */
  showSubtitle(text: string, seconds = 3): void {
    this.subtitle.setText(text);
    this.subtitleTimer = seconds;
  }

  /** `awarenessLevel` is -1 for "nothing is looking", else a 0-3 strip frame. */
  update(
    dt: number,
    player: Player,
    objectiveText: string,
    promptText: string | null,
    awarenessLevel = -1
  ): void {
    this.awareness.setVisible(awarenessLevel >= 0);
    if (awarenessLevel >= 0) this.awareness.setFrame(Math.min(3, awarenessLevel));

    this.objectiveLine = `OBJECTIVE: ${objectiveText}`;
    this.objective.setText(this.objectiveLine);

    const hpRatio = Phaser.Math.Clamp(player.hp / PLAYER.maxHp, 0, 1);
    this.hpLabel.setText(`HP ${Math.ceil(player.hp)}`);
    this.hpLabel.setColor(hpRatio <= 0.3 ? 0xe07a5f : 0xe8e2d4);

    const state = player.ammo[player.weapon];
    const reloadNote = player.reloading
      ? `  RELOADING ${Math.round(player.reloadProgress * 10) * 10}%`
      : '';
    this.ammoLabel.setText(
      `${player.weaponDef.label}  ${state.loaded} / ${state.reserve}${reloadNote}`
    );

    this.prompt.setText(promptText ?? '');
    this.prompt.setVisible(!!promptText);

    this.clueTimer = Math.max(0, this.clueTimer - dt);
    this.clue.setVisible(this.clueTimer > 0);
    this.subtitleTimer = Math.max(0, this.subtitleTimer - dt);
    this.subtitle.setVisible(this.subtitleTimer > 0);

    this.draw(hpRatio, player, promptText);
  }

  private draw(hpRatio: number, player: Player, promptText: string | null): void {
    const g = this.gfx;
    g.clear();

    g.fillStyle(0x12121a, 0.72);
    g.fillRect(2, 2, measure(this.objectiveLine).width + 6, 11);

    const barY = VIRTUAL_HEIGHT - 12;
    g.fillStyle(0x12121a, 0.8);
    g.fillRect(4, barY - 1, 66, 7);
    g.fillStyle(0x3a2420, 1);
    g.fillRect(5, barY, 52, 5);
    g.fillStyle(hpRatio <= 0.3 ? 0xd9472f : 0x9ab973, 1);
    g.fillRect(5, barY, Math.round(52 * hpRatio), 5);

    // Stance pip - shape, not colour alone: wide bar crouch, wedge sprint, tall bar stand.
    g.fillStyle(0xe8e2d4, 1);
    if (player.crouched) g.fillRect(61, barY + 2, 7, 3);
    else if (player.sprinting) g.fillTriangle(61, barY + 5, 68, barY + 5, 68, barY);
    else g.fillRect(63, barY, 3, 5);

    // Magazine pips, lower right.
    const def = player.weaponDef;
    const loaded = player.ammo[player.weapon].loaded;
    for (let i = 0; i < def.magazine; i++) {
      const x = VIRTUAL_WIDTH - 5 - (def.magazine - i) * 4;
      g.fillStyle(i < loaded ? 0xe8c07a : 0x4a4038, 1);
      g.fillRect(x, barY, 3, 5);
    }

    if (promptText) {
      const size = measure(promptText);
      g.fillStyle(0x12121a, 0.78);
      g.fillRect(
        Math.round(VIRTUAL_WIDTH / 2 - size.width / 2 - 4),
        VIRTUAL_HEIGHT - 46,
        size.width + 8,
        11
      );
    }

    if (this.clueTimer > 0) {
      const size = measure(this.clueLine);
      g.fillStyle(0x12121a, Math.min(0.8, this.clueTimer * 2));
      g.fillRect(Math.round(VIRTUAL_WIDTH / 2 - size.width / 2 - 5), 12, size.width + 10, 11);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.awareness.destroy();
    this.objective.destroy();
    this.hpLabel.destroy();
    this.ammoLabel.destroy();
    this.prompt.destroy();
    this.clue.destroy();
    this.subtitle.destroy();
  }
}
