import Phaser from 'phaser';
import { generateStaticTextures } from '../visual/textures';

/** Генерирует процедурные текстуры до загрузки финальных спрайтов. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateStaticTextures(this);
    this.scene.start('Title');
  }
}
