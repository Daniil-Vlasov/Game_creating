import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { STR } from '../core/data';
import { game } from '../core/GameState';
import { buildLabel } from '../visual/pixelFont';
import { backdrop } from '../ui/views';
import { H, W, fadeTo, txt } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.fadeIn(300);
    const sc = backdrop(this, 0, 300, { foreground: true });
    let sx = 0;
    const scroll = (t: number, dt: number) => {
      sx += dt * 0.02;
      sc.update(sx, t);
    };
    this.events.on('update', scroll);
    this.events.once('shutdown', () => this.events.off('update', scroll));
    this.add.image(W / 2 - 120, 352, 'hero-0').setOrigin(0.5, 1).setScale(2);
    txt(this, W / 2, 110, STR.title, 40, '#fff4d0').setStroke('#3a2414', 6);
    txt(this, W / 2, 148, STR.subtitle, 14, '#3a2414');
    const tap = txt(this, W / 2, 220, STR.tapToStart, 14, '#fff4d0').setStroke('#3a2414', 4);
    this.tweens.add({ targets: tap, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    buildLabel(this, W, H);
    this.input.once('pointerup', () => {
      Sound.unlock();
      Sound.click();
      game.reset();
      // QA: ?node=N — начать забег с N-й точки маршрута (проверка тёмных этапов на планшете)
      const n = Number(new URLSearchParams(location.search).get('node'));
      if (Number.isInteger(n) && n > 0) { game.node = n; game.gold = 30; }
      Sound.startMusic(game.darkness);
      fadeTo(this, 'Walk');
    });
  }
}
