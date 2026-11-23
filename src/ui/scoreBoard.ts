import Phaser from 'phaser';
import type { Track } from '../core/scoring';
import { txt } from './widgets';

/** Число без мусора: целое как есть, дробное — с одним знаком. */
export function fmtNum(v: number, decimals = 0): string {
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}
const decimalsOf = (v: number): number => (Number.isInteger(v) ? 0 : 1);

/** Ярус итога: 0 — скромно (<300), 1 — мощно (300..999), 2 — эпично (1000+). */
export function scoreTier(total: number): 0 | 1 | 2 {
  return total >= 1000 ? 2 : total >= 300 ? 1 : 0;
}

/** Плашка-счётчик: тёмная табличка с цветной рамкой, число «тикает» при изменении. */
export class Plaque {
  readonly box: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly baseY: number;
  private value = 0;
  private bumps = 0;
  private counter = { v: 0 };
  private tickTween?: Phaser.Tweens.Tween;

  constructor(private scene: Phaser.Scene, x: number, y: number, w: number, private color: string) {
    const col = Phaser.Display.Color.HexStringToColor(color).color;
    this.baseY = y;
    this.box = scene.add.container(x, y);
    this.bg = scene.add.rectangle(0, 0, w, 16, 0x140c10, 0.92).setStrokeStyle(1, col);
    this.flash = scene.add.rectangle(0, 0, w, 16, col, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.label = txt(scene, 0, 1, '', 11, '#fff4d0').setStroke('#000000', 2);
    this.box.add([this.bg, this.flash, this.label]);
  }

  /** Мгновенно (превью при выборе рун). */
  set(v: number): void {
    this.tickTween?.stop();
    this.value = v;
    this.counter.v = v;
    this.bumps = 0;
    this.box.setScale(1).setY(this.baseY);
    this.label.setText(fmtNum(v, decimalsOf(v))).setColor('#fff4d0');
  }

  /** Анимированно: число тикает к новому значению, плашка подпрыгивает и чуть растёт. */
  tickTo(v: number, ms: number, flashColor?: number): void {
    const from = this.value;
    this.value = v;
    const dec = Math.max(decimalsOf(v), decimalsOf(from));
    this.tickTween?.stop();
    this.counter.v = from;
    this.tickTween = this.scene.tweens.add({
      targets: this.counter, v, duration: Math.max(60, ms), ease: 'Cubic.easeOut',
      onUpdate: () => this.label.setText(fmtNum(this.counter.v, dec)),
      onComplete: () => this.label.setText(fmtNum(v, dec)),
    });
    this.bump(flashColor);
  }

  /** Подпрыгнуть без изменения числа (проклятая руна: «гашение»). */
  bump(flashColor?: number, grow = true): void {
    if (grow) this.bumps++;
    const base = 1 + Math.min(0.15, this.bumps * 0.03);
    this.scene.tweens.killTweensOf(this.box);
    this.box.setScale(base * 1.22).setY(this.baseY - 4);
    this.scene.tweens.add({ targets: this.box, scale: base, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this.box, y: this.baseY, duration: 220, ease: 'Bounce.easeOut' });
    this.flash.setFillStyle(flashColor ?? Phaser.Display.Color.HexStringToColor(this.color).color, 0.9);
    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(1);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 260 });
  }

  /** Точка, куда летят искры (мировые координаты). */
  get anchor(): { x: number; y: number } {
    return { x: this.box.x, y: this.baseY };
  }
}

/** Ряд «⚔ [Сила] × [Множ.] = ИТОГ». */
export class ScoreRow {
  readonly power: Plaque;
  readonly mult: Plaque;
  readonly total: Phaser.GameObjects.Text;
  private readonly parts: Phaser.GameObjects.GameObject[];
  private readonly baseY: number;

  constructor(private scene: Phaser.Scene, cx: number, y: number, icon: string, readonly color: string) {
    this.baseY = y;
    const ic = txt(scene, cx - 96, y, icon, 12, color).setStroke('#000000', 2);
    this.power = new Plaque(scene, cx - 56, y, 44, color);
    const x1 = txt(scene, cx - 26, y, '×', 12, '#fff4d0').setStroke('#000000', 2);
    this.mult = new Plaque(scene, cx + 4, y, 40, color);
    const eq = txt(scene, cx + 32, y, '=', 12, '#fff4d0').setStroke('#000000', 2);
    this.total = txt(scene, cx + 66, y, '', 14, color).setStroke('#000000', 3);
    this.parts = [ic, this.power.box, x1, this.mult.box, eq, this.total];
  }

  setVisible(on: boolean): void {
    this.parts.forEach((p) => (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
  }

  set(t: Track): void {
    this.power.set(t.power);
    this.mult.set(t.mult);
    this.setTotal(t);
  }

  setTotal(t: Track): void {
    this.scene.tweens.killTweensOf(this.total);
    this.total.setScale(1).setY(this.baseY).setAlpha(1).setText(String(Math.round(t.power * t.mult)));
  }

  /** Финальный «удар» итога: число влетает крупным и оседает. */
  slam(t: Track, tier: 0 | 1 | 2, delay = 0): void {
    const v = Math.round(t.power * t.mult);
    this.total.setText('').setScale(1);
    this.scene.time.delayedCall(delay, () => {
      this.total.setText(String(v)).setAlpha(1).setScale(1.5 + tier).setY(this.baseY);
      this.scene.tweens.add({ targets: this.total, scale: 1 + tier * 0.15, duration: 200 + tier * 60, ease: 'Back.easeOut' });
    });
  }
}
