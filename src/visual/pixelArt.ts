import Phaser from 'phaser';

/** Рисует текстуру из строк-«пикселей». '.' или неизвестный символ = прозрачный пиксель. */
export function pixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  colors: Record<string, string>,
  scale = 1,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w * scale, h * scale)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  tex.refresh();
}

/** Холст произвольного рисования (для фонов и рамок). */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  tex.refresh();
}
