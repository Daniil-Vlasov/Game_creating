import Phaser from 'phaser';
import { FONT } from './widgets';

/**
 * Пул Text-объектов для всплывающих чисел (подсчёт, урон, события врага).
 * Text в Phaser — это свой canvas + GPU-текстура; создавать/удалять ~15 штук на розыгрыш дорого
 * (микрофризы на планшете). Пул переиспользует объекты: меняется только стиль и текст.
 * Создавать заново в каждом create() сцены (объекты уничтожаются вместе со сценой).
 */
export class TextPool {
  private readonly free: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene, prewarm = 10) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  private make(): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold', resolution: 3, align: 'center' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setVisible(false)
      .setActive(false);
  }

  /** Взять текст из пула: стиль меняется без лишних перерисовок canvas. */
  get(x: number, y: number, text: string, size: number, color: string, stroke = 3, depth = 100): Phaser.GameObjects.Text {
    const t = this.free.pop() ?? this.make();
    this.scene.tweens.killTweensOf(t);
    const st = t.style;
    const fontSize = `${size}px`;
    const restyle = st.fontSize !== fontSize || st.color !== color || st.strokeThickness !== stroke;
    st.color = color;
    st.stroke = '#000000';
    st.strokeThickness = stroke;
    if (st.fontSize !== fontSize) {
      st.fontSize = fontSize;
      st.update(true); // пересчёт метрик шрифта + одна перерисовка
    } else if (restyle && t.text === text) t.updateText();
    t.setText(text); // перерисует, только если текст другой
    return t
      .setPosition(x, y)
      .setScale(1)
      .setAngle(0)
      .setAlpha(1)
      .clearTint()
      .setDepth(depth)
      .setVisible(true)
      .setActive(true);
  }

  /** Вернуть текст в пул. */
  release(t: Phaser.GameObjects.Text): void {
    if (!t.active || !t.scene) return;
    this.scene.tweens.killTweensOf(t);
    t.setVisible(false).setActive(false);
    this.free.push(t);
  }

  /** Плавающий текст (как widgets.floatText, но из пула). */
  float(x: number, y: number, text: string, color: string, size = 16): void {
    const t = this.get(x, y, text, size, color);
    this.scene.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => this.release(t) });
  }
}
