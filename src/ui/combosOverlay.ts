import Phaser from 'phaser';
import { Sound } from '../audio/SoundEngine';
import { COMBOS, STR } from '../core/data';
import { game } from '../core/GameState';
import { uiPalette } from '../visual/palette';
import { H, W, panel, txt } from './widgets';

const ATK_COLOR = '#ff7a5a';
const DEF_COLOR = '#7ab8ff';

/**
 * Справочник комбинаций (созвучий) поверх сцены. Закрывается касанием в любом месте
 * (pointerdown → pointerup на оверлее, чтобы не закрыться тем же касанием, что открыло).
 */
export function openCombosOverlay(scene: Phaser.Scene, onClose?: () => void): Phaser.GameObjects.Container {
  const ui = uiPalette(game.darkness);
  const layer = scene.add.container(0, 0).setDepth(300);
  const blocker = scene.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive();
  layer.add(blocker);
  const top = 38;
  const rowH = 38;
  const height = 70 + COMBOS.length * rowH;
  layer.add(panel(scene, W / 2, top + height / 2, 572, height));
  layer.add(txt(scene, W / 2, top + 18, STR.combosTitle, 15, ui.text));
  layer.add(txt(scene, 478, top + 36, `⚔ ${STR.attack} (${STR.combosBase})`, 8, ATK_COLOR, [0.5, 0.5]).setStroke('#000000', 2));
  layer.add(txt(scene, 562, top + 36, `⛨ ${STR.shield} (${STR.combosBase})`, 8, DEF_COLOR, [0.5, 0.5]).setStroke('#000000', 2));

  COMBOS.forEach((c, i) => {
    const y = top + 52 + i * rowH;
    if (i > 0) layer.add(scene.add.rectangle(W / 2, y - 3, 540, 1, 0x000000, 0.25).setOrigin(0.5, 0));
    layer.add(txt(scene, 46, y + 3, c.name, 12, ui.text, [0, 0]));
    layer.add(txt(scene, 46, y + 19, c.desc, 9, ui.textDim, [0, 0]));
    layer.add(txt(scene, 478, y + 16, `${c.atkPower} × ${c.atkMult}`, 12, ATK_COLOR).setStroke('#000000', 2));
    layer.add(txt(scene, 562, y + 16, `${c.defPower} × ${c.defMult}`, 12, DEF_COLOR).setStroke('#000000', 2));
  });
  layer.add(txt(scene, W / 2, top + height - 12, STR.combosClose, 9, ui.textDim));

  let armed = false;
  blocker.on('pointerdown', () => (armed = true));
  blocker.on('pointerup', () => {
    if (!armed) return;
    Sound.click();
    layer.destroy();
    onClose?.();
  });
  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 140 });
  return layer;
}
