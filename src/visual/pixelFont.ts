import Phaser from 'phaser';
import { canvasTexture } from './pixelArt';

/** Крошечный пиксельный шрифт 3x5 (для номера билда). Неизвестные символы — пробел. */
const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  a: ['000', '011', '101', '101', '011'], b: ['100', '110', '101', '101', '110'],
  c: ['000', '011', '100', '100', '011'], d: ['001', '011', '101', '101', '011'],
  e: ['000', '010', '111', '100', '011'], f: ['011', '100', '110', '100', '100'],
  i: ['010', '000', '010', '010', '010'], l: ['010', '010', '010', '010', '001'],
  o: ['000', '010', '101', '101', '010'], u: ['000', '101', '101', '101', '011'],
  v: ['000', '101', '101', '101', '010'], '.': ['000', '000', '000', '000', '010'],
  '-': ['000', '000', '111', '000', '000'], ':': ['000', '010', '000', '010', '000'],
  '+': ['000', '010', '111', '010', '000'], ' ': ['000', '000', '000', '000', '000'],
};

export function pixelText(scene: Phaser.Scene, key: string, text: string, color = '#ffffff', shadow = '#000000'): void {
  const chars = text.toLowerCase().split('');
  const w = chars.length * 4 + 1;
  canvasTexture(scene, key, w, 7, (p) => {
    const draw = (dx: number, dy: number, fill: string) => {
      const c = parseInt(fill.slice(1), 16);
      chars.forEach((ch, i) => {
        const g = GLYPHS[ch] ?? GLYPHS[' '];
        g.forEach((row, y) => { for (let x = 0; x < 3; x++) if (row[x] === '1') p.px(i * 4 + x + dx, y + dy, c); });
      });
    };
    draw(1, 1, shadow);
    draw(0, 0, color);
  });
}

/** Метка билда в правом нижнем углу (мелким пиксельным шрифтом, ×1 к виртуальному разрешению). */
export function buildLabel(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Image {
  if (!scene.textures.exists('build-label')) pixelText(scene, 'build-label', __BUILD_LABEL__, '#d8d0c0');
  return scene.add.image(w - 2, h - 2, 'build-label').setOrigin(1, 1).setAlpha(0.75).setDepth(1000).setScrollFactor(0);
}
