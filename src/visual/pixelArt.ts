import Phaser from 'phaser';
import { hex, lerpColor, shade } from './palette';

export interface SpriteOpts {
  /** Обводка 1px (тёмный оттенок соседнего цвета). */
  outline?: boolean;
  /** Авто-светотень: верхний край светлее, нижний/правый темнее. */
  shading?: boolean;
  outlineColor?: number;
}

/**
 * Рисует текстуру из строк-«пикселей». '.' или неизвестный символ — прозрачный.
 * С outline текстура увеличивается на 1px с каждой стороны.
 */
export function pixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  colors: Record<string, string>,
  opts: SpriteOpts = {},
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const w0 = Math.max(...rows.map((r) => r.length));
  const h0 = rows.length;
  const pad = opts.outline ? 1 : 0;
  const w = w0 + pad * 2;
  const h = h0 + pad * 2;
  // Сетка цветов (null = прозрачно)
  const grid: (number | null)[][] = [];
  for (let y = 0; y < h; y++) {
    grid.push([]);
    for (let x = 0; x < w; x++) {
      const ch = rows[y - pad]?.[x - pad];
      const c = ch ? colors[ch] : undefined;
      grid[y].push(c ? parseInt(c.slice(1), 16) : null);
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? null : grid[y][x]);
  const out: (number | null)[][] = grid.map((r) => [...r]);
  if (opts.shading) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c === null) continue;
      const up = at(x, y - 1), down = at(x, y + 1), right = at(x + 1, y), left = at(x - 1, y);
      if (up === null) out[y][x] = shade(c, 0.22);
      else if (down === null || right === null) out[y][x] = shade(c, -0.25);
      else if (left === null) out[y][x] = shade(c, 0.1);
    }
  }
  if (opts.outline) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (grid[y][x] !== null) continue;
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].find((v) => v !== null);
      if (n !== undefined && n !== null) out[y][x] = opts.outlineColor ?? lerpColor(n, 0x0a0410, 0.78);
    }
  }
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = out[y][x];
    if (c === null) continue;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, 1, 1);
  }
  tex.refresh();
}

/** Холст произвольного рисования (для фонов, рамок, карт). */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (p: Pix) => void,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const p = new Pix(ctx, w, h);
  draw(p);
  p.flush();
  tex.refresh();
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Пиксельные примитивы с буфером ImageData (быстро). Координаты — целые пиксели; альфа смешивается. */
export class Pix {
  private img: ImageData;
  private d: Uint8ClampedArray;

  constructor(public ctx: CanvasRenderingContext2D, public w: number, public h: number) {
    this.img = ctx.createImageData(w, h);
    this.d = this.img.data;
  }

  flush(): void {
    this.ctx.putImageData(this.img, 0, 0);
  }

  px(x: number, y: number, c: number, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const d = this.d;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
      d[i + 3] = a >= 1 ? 255 : Math.max(d[i + 3], Math.round(a * 255));
      return;
    }
    d[i] = d[i] + (r - d[i]) * a;
    d[i + 1] = d[i + 1] + (g - d[i + 1]) * a;
    d[i + 2] = d[i + 2] + (b - d[i + 2]) * a;
    d[i + 3] = Math.min(255, d[i + 3] + a * 255);
  }

  /** Есть ли уже непрозрачный пиксель. */
  filled(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.d[(y * this.w + x) * 4 + 3] > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: number, a = 1): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.px(xx, yy, c, a);
  }

  /** Пиксельный круг (заливка), с опциональной обёрткой по X для тайлящихся слоёв. */
  circle(cx: number, cy: number, r: number, c: number, wrap = false, a = 1): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + r * 0.6) continue;
      let px = Math.round(cx + x);
      if (wrap) px = ((px % this.w) + this.w) % this.w;
      this.px(px, cy + y, c, a);
    }
  }

  /** Дизеринг-переход между двумя цветами по вертикали (Bayer 4×4). */
  ditherV(x0: number, y0: number, w: number, h: number, top: number, bottom: number): void {
    for (let y = 0; y < h; y++) {
      const t = h <= 1 ? 0 : y / (h - 1);
      for (let x = 0; x < w; x++) {
        const thr = (BAYER4[(y0 + y) & 3][(x0 + x) & 3] + 0.5) / 16;
        // 4 уровня смешения + дизеринг между ними
        const levels = 4;
        const lv = t * levels;
        const base = Math.floor(lv);
        const frac = lv - base;
        const k = Math.min(levels, base + (frac > thr ? 1 : 0)) / levels;
        this.px(x0 + x, y0 + y, lerpColor(top, bottom, k));
      }
    }
  }

  /** Bayer-порог для произвольного дизеринга. */
  static bayer(x: number, y: number): number {
    return (BAYER4[y & 3][x & 3] + 0.5) / 16;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = Math.round(x0), y = Math.round(y0);
    for (let i = 0; i < 2000; i++) {
      this.px(x, y, c);
      if (x === Math.round(x1) && y === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
}

/** Детерминированный ГПСЧ (mulberry32) — фоны одинаковы при каждом входе в сцену. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
