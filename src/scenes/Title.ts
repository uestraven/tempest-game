import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/constants';
import { PixelText } from '../ui/font';
import { clearSave, readSave } from '../systems/Save';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b0d12);
    const hasSave = readSave() !== null;

    new PixelText(this, VIRTUAL_WIDTH / 2, 70, 'TEMPEST', {
      align: 'center',
      color: 0xe8c07a,
    }).image.setScale(3);

    new PixelText(this, VIRTUAL_WIDTH / 2, 110, 'ONE LAST ASSIGNMENT', {
      align: 'center',
      color: 0x8d8778,
    });

    new PixelText(
      this,
      VIRTUAL_WIDTH / 2,
      150,
      hasSave ? 'ENTER - CONTINUE\nN - NEW GAME' : 'ENTER - BEGIN',
      { align: 'center' }
    );

    new PixelText(
      this,
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 28,
      'VERTICAL SLICE: VALCENDRE',
      { align: 'center', color: 0x5e6472 }
    );

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('Village'));
    this.input.keyboard?.on('keydown-N', () => {
      clearSave();
      this.scene.start('Village');
    });
  }
}
