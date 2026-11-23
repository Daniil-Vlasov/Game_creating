import Phaser from 'phaser';
import { RARITIES, RUNES } from '../core/data';
import type { Card, SpellDef } from '../core/types';
import { canvasTexture, Pix } from '../visual/pixelArt';
import { envPalette, shade } from '../visual/palette';
import { addVignette, buildScenery, type Scenery } from '../visual/scenery';
import { CARD_H, CARD_W, ELEMENT_ICON } from '../visual/textures';
import { W, txt } from './widgets';

export interface CardView extends Phaser.GameObjects.Container {
  card: Card;
  glow: Phaser.GameObjects.Image;
  powerText: Phaser.GameObjects.Text;
}

/** Руна-карта: рамка цвета стихии, Сила в значке, иконка стихии в гнезде, имя на ленте. */
export function cardView(scene: Phaser.Scene, x: number, y: number, card: Card): CardView {
  const c = scene.add.container(x, y) as CardView;
  const glow = scene.add.image(0, 0, 'card-glow').setVisible(false);
  const bg = scene.add.image(0, 0, `card-${card.element}`);
  const icon = scene.add.image(0, -3, `icon-${ELEMENT_ICON[card.element]}`).setScale(2);
  const powerText = txt(scene, -CARD_W / 2 + 11, -CARD_H / 2 + 11, String(card.power), card.power >= 10 ? 9 : 11, '#fff4d0').setStroke('#1a1010', 2);
  const runeName = RUNES.find((r) => r.power === card.power)?.name ?? 'Руна+';
  const name = txt(scene, 0, CARD_H / 2 - 10.5, runeName, 7, '#f6eadc');
  c.add([glow, bg, icon, powerText, name]);
  c.card = card;
  c.glow = glow;
  c.powerText = powerText;
  c.setSize(CARD_W, CARD_H);
  return c;
}

export interface SpellView extends Phaser.GameObjects.Container {
  spell: SpellDef | null;
}

/** Слот заклинания 36x36: каменное гнездо, рамка цвета редкости, иконка, череп у проклятых. */
export function spellView(scene: Phaser.Scene, x: number, y: number, spell: SpellDef | null): SpellView {
  const c = scene.add.container(x, y) as SpellView;
  c.add(scene.add.image(0, 0, 'slot'));
  if (spell) {
    const color = Phaser.Display.Color.HexStringToColor(RARITIES[spell.rarity].color).color;
    c.add(scene.add.image(0, 0, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.7));
    c.add(scene.add.rectangle(0, 0, 32, 32).setStrokeStyle(1, color));
    c.add(scene.add.image(0, 0, `icon-${spell.icon}`).setScale(3));
    if (spell.penalty) c.add(scene.add.image(12, -12, 'icon-skull'));
  }
  c.spell = spell;
  c.setSize(36, 36);
  return c;
}

/** Фон сцены «уют с тенью» (вид сбоку): параллакс-слои + виньетка. */
export function backdrop(
  scene: Phaser.Scene,
  darkness: number,
  groundY: number,
  opts: { bottom?: number; foreground?: boolean; seed?: number; vignette?: boolean } = {},
): Scenery {
  const s = buildScenery(scene, { darkness, groundY, bottom: opts.bottom, foreground: opts.foreground, seed: opts.seed });
  if (opts.vignette !== false) addVignette(scene, darkness);
  return s;
}

/** Карточный стол: доски с текстурой дерева, латунные гвозди, сукно с затенением, свеча. */
export function cardTable(scene: Phaser.Scene, darkness: number, top: number, bottom = 400): void {
  const p = envPalette(darkness);
  const key = `table-${Math.round(darkness * 20)}-${top}-${bottom}`;
  const h = bottom - top;
  if (!scene.textures.exists(key)) {
    canvasTexture(scene, key, W, h, (px) => {
      // доски
      for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
        const plank = Math.floor(x / 80);
        const grain = Math.sin(x * 0.05 + y * 0.9 + plank * 3) + Math.sin(y * 0.31 + plank);
        let c = grain > 1.2 ? p.woodLight : grain < -1.1 ? p.woodDark : p.wood;
        if (x % 80 === 0) c = shade(p.woodDark, -0.3);
        px.px(x, y, c);
      }
      px.rect(0, 0, W, 2, shade(p.woodLight, 0.15));
      px.rect(0, 2, W, 1, p.woodDark);
      // сукно
      const fx = 8, fy = 10, fw = W - 16, fh = h - 16;
      px.rect(fx - 2, fy - 2, fw + 4, fh + 4, shade(p.woodDark, -0.4));
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const nx = (x - fw / 2) / (fw / 2), ny = (y - fh / 2) / (fh / 2);
        const r = Math.min(1, Math.sqrt(nx * nx * 0.6 + ny * ny));
        let c = Pix.bayer(x, y) < r * 0.8 ? p.feltDark : p.felt;
        if ((x + y * 3) % 7 === 0) c = shade(c, -0.06);
        px.px(fx + x, fy + y, c);
      }
      // латунные гвозди
      for (let x = 20; x < W; x += 80) for (const y of [5, h - 4]) { px.px(x, y, 0xe0b040); px.px(x + 1, y, 0x8a6418); }
    });
  }
  scene.add.image(0, top, key).setOrigin(0);
  // Свеча — тёплый огонёк на столе
  const cx = W - 22, cy = top + 30;
  scene.add.rectangle(cx, cy + 8, 6, 14, 0xe8dcc0).setStrokeStyle(1, 0x2a1a14);
  scene.add.rectangle(cx, cy + 16, 12, 3, 0x8a6418);
  const flame = scene.add.image(cx, cy - 1, 'icon-flame').setScale(0.8);
  const glow = scene.add.image(cx, cy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb050).setScale(2.2).setAlpha(0.5);
  scene.tweens.add({ targets: [glow], scale: 2.5, alpha: 0.38, duration: 140, yoyo: true, repeat: -1, repeatDelay: 60, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: flame, scaleY: 0.95, scaleX: 0.75, duration: 110, yoyo: true, repeat: -1 });
}
