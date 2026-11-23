import Phaser from 'phaser';
import { RARITIES, RUNES, elementById } from '../core/data';
import type { Card, SpellDef } from '../core/types';
import { envPalette } from '../visual/palette';
import { CARD_H, CARD_W, ELEMENT_ICON, generateEnvTextures } from '../visual/textures';
import { W, txt } from './widgets';

export interface CardView extends Phaser.GameObjects.Container {
  card: Card;
  glow: Phaser.GameObjects.Image;
  powerText: Phaser.GameObjects.Text;
}

/** Визуал руны-карты: Сила в углу (цвет стихии), крупная иконка стихии, имя руны. */
export function cardView(scene: Phaser.Scene, x: number, y: number, card: Card): CardView {
  const el = elementById(card.element);
  const c = scene.add.container(x, y) as CardView;
  const glow = scene.add.image(0, 0, 'card-glow').setVisible(false);
  const bg = scene.add.image(0, 0, 'card');
  const band = scene.add.rectangle(0, -CARD_H / 2 + 5, CARD_W - 6, 3, Phaser.Display.Color.HexStringToColor(el.color).color);
  const icon = scene.add.image(0, 2, `icon-${ELEMENT_ICON[card.element]}`).setScale(3);
  const powerText = txt(scene, -CARD_W / 2 + 5, -CARD_H / 2 + 8, String(card.power), 13, el.color, [0, 0]).setStroke('#2a1a10', 3);
  const runeName = RUNES.find((r) => r.power === card.power)?.name ?? 'Руна+';
  const name = txt(scene, 0, CARD_H / 2 - 10, runeName, 8, '#5a3a20');
  c.add([glow, bg, band, icon, powerText, name]);
  c.card = card;
  c.glow = glow;
  c.powerText = powerText;
  c.setSize(CARD_W, CARD_H);
  return c;
}

export interface SpellView extends Phaser.GameObjects.Container {
  spell: SpellDef | null;
}

/** Слот заклинания 36x36 с рамкой цвета редкости. */
export function spellView(scene: Phaser.Scene, x: number, y: number, spell: SpellDef | null): SpellView {
  const c = scene.add.container(x, y) as SpellView;
  const slot = scene.add.image(0, 0, 'slot');
  c.add(slot);
  if (spell) {
    const color = Phaser.Display.Color.HexStringToColor(RARITIES[spell.rarity].color).color;
    c.add(scene.add.rectangle(0, 0, 34, 34).setStrokeStyle(2, color));
    c.add(scene.add.image(0, 0, `icon-${spell.icon}`).setScale(3));
    if (spell.penalty) c.add(scene.add.image(12, -12, 'icon-skull').setScale(1));
  }
  c.spell = spell;
  c.setSize(36, 36);
  return c;
}

/**
 * Фон: градиентное небо (пиксельные полосы), солнце/луна, звёзды во тьме,
 * горы и деревья (tileSprite для параллакса), земля с тропой.
 */
export function backdrop(
  scene: Phaser.Scene,
  darkness: number,
  groundY: number,
  opts: { fixed?: boolean; height?: number } = {},
): { mountains: Phaser.GameObjects.TileSprite; trees: Phaser.GameObjects.TileSprite; ground: Phaser.GameObjects.TileSprite } {
  generateEnvTextures(scene, darkness);
  const p = envPalette(darkness);
  const g = scene.add.graphics().setScrollFactor(0);
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    g.fillStyle(colorInterp(p.skyTop, p.skyBottom, t), 1);
    g.fillRect(0, (groundY * i) / bands, W, groundY / bands + 1);
  }
  // Звёзды во тьме
  if (darkness > 0.35) {
    g.fillStyle(0xffffff, Math.min(1, (darkness - 0.35) * 2));
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 53) % Math.floor(groundY * 0.5), 1, 1);
  }
  // Солнце → луна
  g.fillStyle(p.sun, 1);
  const sx = 520 - darkness * 380;
  const sy = 50 + darkness * 10;
  g.fillRect(sx - 10, sy - 14, 20, 28);
  g.fillRect(sx - 14, sy - 10, 28, 20);
  if (darkness > 0.5) {
    g.fillStyle(p.skyTop, 1);
    g.fillRect(sx - 4, sy - 12, 16, 22);
  }
  const mountains = scene.add.tileSprite(0, groundY - 20, W, 90, 'env-mountains').setOrigin(0, 1).setScrollFactor(0).setScale(1);
  const trees = scene.add.tileSprite(0, groundY + 6, W, 80, 'env-trees').setOrigin(0, 1).setScrollFactor(0);
  const ground = scene.add.tileSprite(0, groundY, W / 2, (opts.height ?? 48), 'env-ground').setOrigin(0, 0).setScale(2).setScrollFactor(0);
  if (opts.fixed) {
    mountains.tilePositionX = 40;
  }
  return { mountains, trees, ground };
}

function colorInterp(a: number, b: number, t: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  const r = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(r.r, r.g, r.b);
}

/** Карточный стол: деревянная рама и сукно. */
export function cardTable(scene: Phaser.Scene, darkness: number, top: number, bottom = 400): void {
  const p = envPalette(darkness);
  const g = scene.add.graphics();
  g.fillStyle(p.woodDark, 1).fillRect(0, top, W, bottom - top);
  g.fillStyle(p.wood, 1).fillRect(0, top + 2, W, 6);
  g.fillStyle(p.felt, 1).fillRect(6, top + 10, W - 12, bottom - top - 14);
  g.fillStyle(p.feltDark, 1);
  for (let y = top + 12; y < bottom - 6; y += 6) for (let x = 8 + ((y / 6) % 2) * 3; x < W - 8; x += 6) g.fillRect(x, y, 1, 1);
}
