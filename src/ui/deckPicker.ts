import Phaser from 'phaser';
import { ELEMENTS, STR } from '../core/data';
import { game } from '../core/GameState';
import type { Card } from '../core/types';
import { cardView } from './views';
import { H, W, button, panel, txt } from './widgets';
import { uiPalette } from '../visual/palette';

/** Оверлей выбора руны из колоды (для улучшения/удаления). Сетка 10 колонок, мини-карты ×0.55. */
export function openDeckPicker(scene: Phaser.Scene, title: string, onPick: (card: Card) => void): void {
  const ui = uiPalette(game.darkness);
  const layer = scene.add.container(0, 0).setDepth(500);
  const close = () => layer.destroy();
  layer.add(scene.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0).setInteractive());
  layer.add(panel(scene, W / 2, H / 2 + 8, 600, 360));
  layer.add(txt(scene, W / 2, 44, title, 14, ui.text));

  const order = ELEMENTS.map((e) => e.id);
  const cards = [...game.deck].sort((a, b) => order.indexOf(a.element) - order.indexOf(b.element) || a.power - b.power);
  const cols = 10;
  const scale = cards.length > 40 ? 0.45 : 0.55;
  const dx = 56 * scale + 4;
  const dy = 72 * scale + 4;
  cards.forEach((c, i) => {
    const v = cardView(scene, W / 2 - ((cols - 1) * dx) / 2 + (i % cols) * dx, 90 + Math.floor(i / cols) * dy, c).setScale(scale);
    v.setInteractive();
    v.on('pointerup', () => {
      close();
      onPick(c);
    });
    layer.add(v);
  });
  layer.add(button(scene, W / 2, 360, 140, 26, STR.cancel, close));
}
