import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { STR } from '../core/data';
import { game } from '../core/GameState';
import { canPromptInstall, isStandalone, onInstallStateChange, promptInstall } from '../pwa';
import { buildLabel } from '../visual/pixelFont';
import { backdrop } from '../ui/views';
import { H, W, button, fadeTo, panel, txt } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Title');
  }

  create(): void {
    this.overlay = null;
    this.cameras.main.fadeIn(300);
    const sc = backdrop(this, 0, 300, { foreground: true });
    let sx = 0;
    const scroll = (t: number, dt: number) => {
      sx += dt * 0.02;
      sc.update(sx, t);
    };
    this.events.on('update', scroll);
    this.add.image(W / 2 - 120, 352, 'hero-0').setOrigin(0.5, 1).setScale(2);
    txt(this, W / 2, 110, STR.title, 40, '#fff4d0').setStroke('#3a2414', 6);
    txt(this, W / 2, 148, STR.subtitle, 14, '#3a2414');
    const tap = txt(this, W / 2, 200, STR.tapToStart, 14, '#fff4d0').setStroke('#3a2414', 4);
    this.tweens.add({ targets: tap, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    buildLabel(this, W, H);

    // Кнопка установки: системное окно Chrome, либо подсказка для других браузеров
    let installBtn: ReturnType<typeof button> | null = null;
    const refreshInstall = () => {
      installBtn?.destroy();
      installBtn = null;
      if (isStandalone()) return;
      const native = canPromptInstall();
      installBtn = button(this, W / 2, 244, 220, 28, native ? `⬇ ${STR.install}` : STR.installHow, () => {
        if (canPromptInstall()) void promptInstall();
        else this.showInstallHelp();
      });
    };
    refreshInstall();
    const off = onInstallStateChange(refreshInstall);

    const start = (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.overlay) return; // нажали кнопку или открыта подсказка
      this.input.off('pointerup', start);
      Sound.unlock();
      Sound.click();
      // В обычной вкладке браузера — сразу на весь экран и в альбомную ориентацию
      if (!isStandalone() && this.sys.game.device.fullscreen.available && !this.scale.isFullscreen) {
        this.scale.startFullscreen();
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        o.lock?.('landscape').catch(() => undefined);
      }
      game.reset();
      // QA: ?node=N — начать забег с N-й точки маршрута (проверка тёмных этапов на планшете)
      const n = Number(new URLSearchParams(location.search).get('node'));
      if (Number.isInteger(n) && n > 0) { game.node = n; game.gold = 30; }
      Sound.startMusic(game.darkness);
      fadeTo(this, 'Walk');
    };
    this.input.on('pointerup', start);
    this.events.once('shutdown', () => {
      this.events.off('update', scroll);
      this.input.off('pointerup', start);
      off();
    });
  }

  private showInstallHelp(): void {
    const c = this.add.container(0, 0).setDepth(950);
    this.overlay = c;
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive());
    c.add(panel(this, W / 2, H / 2, 440, 200));
    c.add(txt(this, W / 2, H / 2 - 72, STR.installTitle, 15, '#3a2414'));
    c.add(txt(this, W / 2, H / 2 - 10, STR.installText, 11, '#5a3a20').setLineSpacing(6).setWordWrapWidth(400));
    c.add(button(this, W / 2, H / 2 + 70, 150, 28, STR.close, () => {
      c.destroy();
      // даём отпустить палец, чтобы это касание не стартовало игру
      this.time.delayedCall(50, () => (this.overlay = null));
    }));
  }
}
