import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { game } from '../core/GameState';
import { uiPalette } from '../visual/palette';
import { buttonTexture, frameTexture } from '../visual/textures';
import { buildLabel } from '../visual/pixelFont';

export const W = 640;
export const H = 400;
export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 12,
  color = '#ffffff',
  origin: [number, number] = [0.5, 0.5],
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', resolution: 3, align: 'center' })
    .setOrigin(origin[0], origin[1]);
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): Button;
  setLabel(label: string): Button;
}

/** Кнопка для тача: большая зона нажатия, реакция на pointerdown→pointerup внутри. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  color?: number,
): Button {
  const ui = uiPalette(game.darkness);
  const fill = color ?? ui.accent;
  const c = scene.add.container(x, y) as Button;
  const bg = scene.add.image(0, 1, buttonTexture(scene, Math.round(w), Math.round(h), fill));
  const shadow = scene.add.rectangle(0, 0, 1, 1, 0, 0);
  const t = txt(scene, 0, 0, label, 12, ui.accentText).setStroke(ui.style === 'light' ? '#f6e8c8' : '#120a0e', 2);
  c.add([shadow, bg, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  let enabled = true;
  let pressed = false;
  c.on('pointerdown', () => {
    if (!enabled) return;
    pressed = true;
    bg.y = 3;
    t.y = 2;
  });
  const release = (fire: boolean) => {
    if (!pressed) return;
    pressed = false;
    bg.y = 1;
    t.y = 0;
    if (fire && enabled) {
      Sound.click();
      onClick();
    }
  };
  c.on('pointerup', () => release(true));
  c.on('pointerout', () => release(false));
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.45);
    return c;
  };
  c.setLabel = (l: string) => {
    t.setText(l);
    return c;
  };
  return c;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.97): Phaser.GameObjects.Image {
  const ui = uiPalette(game.darkness);
  return scene.add.image(x, y, frameTexture(scene, Math.round(w), Math.round(h), ui.style)).setAlpha(alpha);
}

/** Верхняя полоса: HP, золото, этап, версия билда, звук. Возвращает функцию обновления. */
export function topBar(scene: Phaser.Scene, title: string): () => void {
  const bar = scene.add.container(0, 0).setScrollFactor(0).setDepth(900);
  bar.add(scene.add.rectangle(W / 2, 11, W, 22, 0x0a0610, 0.85));
  bar.add(scene.add.image(12, 11, 'icon-heart').setScale(1.4));
  const hp = txt(scene, 24, 11, '', 11, '#ff8a8a', [0, 0.5]);
  bar.add(scene.add.image(104, 11, 'icon-coin').setScale(1.4));
  const gold = txt(scene, 116, 11, '', 11, '#ffd860', [0, 0.5]);
  const label = txt(scene, W / 2, 11, title, 11, '#e8dcc8');
  const mute = txt(scene, W - 14, 11, '♪', 13, '#e8dcc8').setAlpha(Sound.muted ? 0.4 : 1);
  mute.setInteractive({ useHandCursor: true }).on('pointerup', () => {
    Sound.setMuted(!Sound.muted);
    mute.setAlpha(Sound.muted ? 0.4 : 1);
  });
  bar.add([hp, gold, label, mute]);
  buildLabel(scene, W, H);
  const refresh = () => {
    hp.setText(`${game.hp}/${game.maxHp}`);
    gold.setText(`${game.gold}`);
  };
  refresh();
  return refresh;
}

/** Плавающий текст (урон, +золото и т.п.). */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 16): void {
  const t = txt(scene, x, y, text, size, color).setStroke('#000000', 3).setDepth(100);
  scene.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(300, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
