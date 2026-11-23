import Phaser from 'phaser';
import { Pix, canvasTexture, rng } from './pixelArt';
import { type EnvPalette, envPalette, lerpColor, shade } from './palette';

/**
 * Многослойный параллакс-фон «уют с тенью», вид сбоку.
 * Слои (сзади вперёд): небо → облака → дальние горы с руиной → холмы с деревней и лесом →
 * ближние деревья/фонари/надгробия → земля с тропой → туман → частицы → передний план → виньетка.
 * Все слои шириной 640 и тайлятся по X. Ключи текстур стабильны (env-*), финальные арты можно подменить.
 */

const TW = 640;

export interface SceneryOpts {
  darkness: number;
  groundY: number;
  /** Нижняя граница отрисовки (для боя — край стола). */
  bottom?: number;
  seed?: number;
  foreground?: boolean;
  particles?: boolean;
}

export interface Scenery {
  update(scrollX: number, time: number): void;
  lamps: Phaser.GameObjects.Image[];
}

// ---------------------------------------------------------------- небо

function drawSky(p: Pix, pal: EnvPalette, d: number, G: number, r: () => number): void {
  const mid = Math.round(G * 0.5);
  p.ditherV(0, 0, TW, mid, pal.skyTop, pal.skyMid);
  p.ditherV(0, mid, TW, G - mid + 20, pal.skyMid, pal.skyBottom);
  // Свечение горизонта (закат с первых шагов — уют, переходящий в тревогу)
  const gh = 46;
  for (let y = 0; y < gh; y++) {
    const a = (y / gh) * (0.55 + d * 0.25);
    for (let x = 0; x < TW; x++) if (Pix.bayer(x, y) < a) p.px(x, G - gh + y, pal.horizonGlow, 0.6);
  }
  // Звёзды
  if (d > 0.2) {
    const k = Math.min(1, (d - 0.2) * 1.6);
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(r() * TW), y = Math.floor(r() * G * 0.6);
      const big = r() < 0.08;
      p.px(x, y, pal.star, k * (0.4 + r() * 0.6));
      if (big) { p.px(x - 1, y, pal.star, k * 0.5); p.px(x + 1, y, pal.star, k * 0.5); p.px(x, y - 1, pal.star, k * 0.5); p.px(x, y + 1, pal.star, k * 0.5); }
    }
  }
  // Солнце → кровавая луна
  const sx = Math.round(500 - d * 330);
  const sy = Math.round(G * (0.42 - d * 0.22));
  const disc = d < 0.5 ? pal.sun : lerpColor(pal.sun, 0xd04040, Math.max(0, (d - 0.7) * 2.5));
  for (const [rad, a] of [[30, 0.12], [22, 0.2], [16, 0.35]] as const) {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= rad * rad && Pix.bayer(sx + x, sy + y) < a * 2) p.px(sx + x, sy + y, disc, 0.5);
    }
  }
  p.circle(sx, sy, 11, disc);
  if (d >= 0.5) {
    // кратеры
    p.circle(sx - 4, sy - 3, 2, shade(disc, -0.15));
    p.circle(sx + 3, sy + 4, 3, shade(disc, -0.12));
    p.circle(sx + 5, sy - 5, 1, shade(disc, -0.18));
  } else {
    p.circle(sx - 3, sy - 3, 5, shade(disc, 0.4));
  }
}

function drawClouds(p: Pix, pal: EnvPalette, d: number, r: () => number): void {
  const count = 6;
  for (let i = 0; i < count; i++) {
    const cx = (i / count) * TW + r() * 60;
    const cy = 14 + r() * (p.h - 40);
    const len = 30 + r() * 50;
    const puffs = 5 + Math.floor(r() * 4);
    const pts: [number, number, number][] = [];
    for (let k = 0; k < puffs; k++) {
      const t = k / (puffs - 1);
      pts.push([cx + t * len, cy - Math.sin(t * Math.PI) * (6 + r() * 6), 5 + Math.round(Math.sin(t * Math.PI) * 7 + r() * 3)]);
    }
    const a = 0.95 - d * 0.25;
    for (const [x, y, rad] of pts) p.circle(x + 1, y + 3, rad, pal.cloudShadow, true, a);
    for (const [x, y, rad] of pts) p.circle(x, y, rad - 1, pal.cloudLight, true, a);
    for (const [x, y, rad] of pts) p.circle(x - 2, y - 2, Math.max(1, rad - 4), shade(pal.cloudLight, 0.25), true, a * 0.8);
    // плоское дно
    for (let x = Math.floor(cx - 6); x < cx + len + 6; x++) p.px(((x % TW) + TW) % TW, Math.round(cy + 6), pal.cloudShadow, a * 0.8);
  }
}

// ---------------------------------------------------------------- горы и холмы

function ridge(x: number, waves: [number, number, number][]): number {
  let h = 0;
  for (const [k, amp, ph] of waves) h += amp * Math.sin((x / TW) * Math.PI * 2 * k + ph);
  return h;
}

function drawMountains(p: Pix, pal: EnvPalette, d: number): void {
  const H = p.h;
  const waves: [number, number, number][] = [[1, 18, 0.4], [3, 14, 1.2], [7, 6, 2.1], [13, 2.5, 0.3]];
  let peakX = 0, peakH = -1e9;
  const tops: number[] = [];
  for (let x = 0; x < TW; x++) {
    const top = Math.round(H * 0.42 - ridge(x, waves));
    tops.push(top);
    if (-top > peakH) { peakH = -top; peakX = x; }
  }
  const mid = lerpColor(pal.mountainLit, pal.mountainShadow, 0.5);
  for (let x = 0; x < TW; x++) {
    const top = tops[x];
    for (let y = top; y < H; y++) {
      const dy = y - top;
      const depth = dy / (H - top);
      // Освещённость по нормали: сравниваем высоту хребта слева/справа на расстоянии, растущем с глубиной
      const k = 3 + Math.floor(dy * 0.7);
      const slope = tops[(x + k) % TW] - tops[(x - k + TW) % TW];
      let c = slope > 0 ? pal.mountainLit : pal.mountainShadow;
      c = lerpColor(c, mid, Math.min(1, depth * 1.4));
      if (dy < 4 && top < H * 0.32 && d < 0.75) c = lerpColor(pal.snow, c, dy / 4);
      if (dy === 0) c = shade(c, 0.12);
      const hz = Math.min(1, depth * 1.2);
      if (Pix.bayer(x, y) < hz * 0.7) c = lerpColor(c, pal.haze, 0.4);
      p.px(x, y, c);
    }
  }
  // Руина башни на самой высокой вершине — тень с первых шагов
  const bx = peakX, by = tops[peakX];
  const tower = shade(pal.mountainShadow, -0.35);
  p.rect(bx - 4, by - 22, 9, 24, tower);
  p.rect(bx - 6, by - 4, 13, 6, tower);
  for (let i = 0; i < 9; i += 2) p.rect(bx - 4 + i, by - 25 + ((i * 3) % 4), 1, 3, tower); // обломанный край
  p.rect(bx - 1, by - 16, 2, 3, d > 0.4 ? pal.lampGlow : shade(tower, -0.3)); // окно (во тьме — кто-то зажёг свечу)
}

function drawHills(p: Pix, pal: EnvPalette, d: number, r: () => number): number[] {
  const H = p.h;
  const waves: [number, number, number][] = [[2, 9, 1.0], [5, 5, 0.2], [9, 2, 1.7]];
  const tops: number[] = [];
  for (let x = 0; x < TW; x++) tops.push(Math.round(H * 0.45 - ridge(x, waves)));
  for (let x = 0; x < TW; x++) {
    for (let y = tops[x]; y < H; y++) {
      let c = pal.hill;
      if (Pix.bayer(x, y) < ((y - tops[x]) / (H - tops[x])) * 0.6) c = shade(c, -0.12);
      p.px(x, y, c);
    }
  }
  // Лесные кроны вдоль гребня
  for (let x = 0; x < TW; x += 4 + Math.floor(r() * 5)) {
    const rad = 3 + Math.floor(r() * 4);
    const y = tops[x] + 2;
    const pine = r() < 0.3 + d * 0.4;
    if (pine) {
      for (let k = 0; k < rad * 3; k++) {
        const w = Math.round((k / (rad * 3)) * rad);
        for (let i = -w; i <= w; i++) p.px(((x + i) % TW + TW) % TW, y - rad * 3 + k, i < 0 ? pal.forestMid : pal.forestDark);
      }
    } else {
      p.circle(x + 1, y - rad + 1, rad, pal.forestDark, true);
      p.circle(x, y - rad, rad - 1, pal.forestMid, true);
      p.circle(x - 1, y - rad - 1, Math.max(1, rad - 3), pal.forestLight, true);
    }
  }
  // Деревня: домики с тёплыми окнами (огни не гаснут даже во тьме)
  const vx = 140;
  for (let i = 0; i < 3; i++) {
    const hx = vx + i * 16, hy = tops[hx] + 4;
    const wall = d < 0.5 ? 0xd8c8a8 : 0x3a2a30;
    const roof = d < 0.5 ? 0xa04a3a : 0x2a1418;
    p.rect(hx, hy - 8, 11, 8, shade(wall, -0.1 * d));
    for (let k = 0; k < 5; k++) p.rect(hx - 1 + k, hy - 9 - k, 13 - k * 2, 1, roof);
    p.rect(hx + 3, hy - 6, 2, 2, pal.lampGlow);
    p.rect(hx + 7, hy - 6, 2, 2, d > 0.8 && i === 1 ? shade(wall, -0.3) : pal.lampGlow);
    if (i === 1) { p.rect(hx + 8, hy - 16, 2, 4, shade(roof, -0.2)); }
  }
  // Мельница (светлые этапы) → сломанная сторожевая башня (тёмные)
  const mx = 430, my = tops[mx] + 3;
  if (d < 0.5) {
    const c = 0xc8b898;
    for (let k = 0; k < 16; k++) p.rect(mx - 3 - Math.floor(k / 6), my - 16 + k, 7 + Math.floor(k / 3), 1, shade(c, -0.05));
    p.rect(mx - 1, my - 8, 2, 3, pal.lampGlow);
    const bc = 0x6a5040;
    p.line(mx - 10, my - 26, mx + 10, my - 6, bc);
    p.line(mx + 10, my - 26, mx - 10, my - 6, bc);
    p.circle(mx, my - 16, 1, 0x3a2a20);
  } else {
    const c = shade(pal.hill, -0.4);
    p.rect(mx - 3, my - 20, 7, 21, c);
    p.rect(mx - 4, my - 22, 2, 3, c); p.rect(mx + 1, my - 21, 2, 2, c);
    p.rect(mx, my - 14, 1, 2, pal.lampGlow);
  }
  return tops;
}

// ---------------------------------------------------------------- ближний план

function drawRoundTree(p: Pix, pal: EnvPalette, x: number, base: number, size: number, r: () => number): void {
  const th = Math.round(size * 1.3);
  // ствол с корой и корнями
  for (let y = 0; y < th; y++) {
    const w = 3 + Math.round((1 - y / th) * 2);
    for (let i = -w; i <= w; i++) p.px(x + i, base - y, i < -w + 2 ? shade(pal.bark, 0.15) : i > w - 2 ? pal.barkDark : (y * 5 + i * 3) % 11 === 0 ? pal.barkDark : pal.bark);
  }
  p.rect(x - 6, base - 1, 3, 2, pal.barkDark); p.rect(x + 4, base - 1, 3, 2, pal.barkDark);
  // крона: кластеры кругов в 3 тона + контур
  const cy = base - th - size * 0.5;
  const blobs: [number, number, number][] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    blobs.push([x + Math.cos(a) * size * 0.75, cy + Math.sin(a) * size * 0.45, Math.round(size * (0.45 + r() * 0.2))]);
  }
  blobs.push([x, cy - size * 0.2, Math.round(size * 0.7)]);
  for (const [bx, by, br] of blobs) p.circle(bx, by, br + 1, pal.silhouette, true);
  for (const [bx, by, br] of blobs) p.circle(bx, by, br, pal.leafDark, true);
  for (const [bx, by, br] of blobs) p.circle(bx - 1, by - 2, br - 2, pal.leafMid, true);
  for (const [bx, by, br] of blobs) {
    if (by > cy + 2) continue;
    p.circle(bx - 3, by - 4, Math.max(1, br - 5), pal.leafLight, true);
  }
  // листовая фактура
  for (let i = 0; i < size * 6; i++) {
    const lx = Math.round(x + (r() - 0.5) * size * 2.2), ly = Math.round(cy + (r() - 0.5) * size * 1.4);
    if (p.filled(((lx % TW) + TW) % TW, ly)) p.px(((lx % TW) + TW) % TW, ly, r() < 0.5 ? pal.leafLight : pal.leafDark);
  }
}

function drawPine(p: Pix, pal: EnvPalette, x: number, base: number, size: number): void {
  p.rect(x - 2, base - 8, 4, 8, pal.barkDark);
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const tb = base - 6 - t * size * 0.45;
    const tw = Math.round(size * (1 - t / (tiers + 1)));
    const th = Math.round(size * 0.7);
    for (let k = 0; k < th; k++) {
      const w = Math.round((k / th) * tw);
      for (let i = -w - 1; i <= w + 1; i++) {
        const edge = i === -w - 1 || i === w + 1;
        const c = edge ? pal.silhouette : i < -w / 3 ? shade(pal.leafMid, 0.05) : i < w / 3 ? pal.leafDark : shade(pal.leafDark, -0.25);
        p.px(((x + i) % TW + TW) % TW, tb - th + k, c);
      }
    }
  }
}

function drawDeadTree(p: Pix, pal: EnvPalette, x: number, base: number, size: number, r: () => number): void {
  const col = shade(pal.barkDark, -0.2);
  const branch = (x0: number, y0: number, ang: number, len: number, w: number, depth: number) => {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    for (let i = -Math.floor(w / 2); i <= Math.floor(w / 2); i++) p.line(x0 + i, y0, x1 + i, y1, col);
    if (depth <= 0) return;
    branch(x1, y1, ang - 0.5 - r() * 0.3, len * 0.7, Math.max(1, w - 1), depth - 1);
    branch(x1, y1, ang + 0.4 + r() * 0.3, len * 0.65, Math.max(1, w - 1), depth - 1);
  };
  branch(x, base, -Math.PI / 2 + (r() - 0.5) * 0.2, size * 1.1, 5, 4);
  p.rect(x - 5, base - 1, 11, 2, col);
}

function drawLamp(p: Pix, pal: EnvPalette, x: number, base: number): void {
  const pole = pal.barkDark;
  p.rect(x, base - 30, 2, 30, pole);
  p.rect(x - 4, base - 30, 6, 2, pole);
  p.rect(x - 6, base - 28, 5, 7, 0x2a1a14);
  p.rect(x - 5, base - 27, 3, 5, pal.lampGlow);
  p.px(x - 4, base - 26, 0xffffff);
  p.rect(x - 2, base - 1, 6, 1, pole);
}

function drawGrave(p: Pix, pal: EnvPalette, x: number, base: number, cross: boolean): void {
  if (cross) {
    p.rect(x - 1, base - 14, 3, 14, pal.stoneDark);
    p.rect(x - 5, base - 11, 11, 3, pal.stoneDark);
    p.rect(x - 1, base - 14, 1, 14, pal.stone);
  } else {
    for (let y = 0; y < 12; y++) {
      const w = y < 3 ? 3 + y : 6;
      for (let i = -w; i <= w; i++) p.px(x + i, base - 12 + y, i < -w + 2 ? pal.stone : pal.stoneDark);
    }
    p.rect(x - 2, base - 8, 4, 1, shade(pal.stoneDark, -0.3));
    p.rect(x, base - 10, 1, 5, shade(pal.stoneDark, -0.3));
  }
  // мох
  p.rect(x - 4, base - 2, 3, 2, pal.grassDark);
}

function drawRuneStone(p: Pix, pal: EnvPalette, x: number, base: number, d: number): void {
  for (let y = 0; y < 22; y++) {
    const w = Math.round(4 + Math.sin((y / 22) * Math.PI) * 2);
    for (let i = -w; i <= w; i++) p.px(x + i, base - 22 + y, i < -w + 2 ? pal.stone : i > w - 2 ? shade(pal.stoneDark, -0.2) : pal.stoneDark);
  }
  const glow = d < 0.5 ? 0x7ad0e0 : 0xd04a8a;
  p.rect(x - 1, base - 17, 2, 8, glow, 0.8);
  p.rect(x - 3, base - 14, 6, 1, glow, 0.8);
}

function drawBush(p: Pix, pal: EnvPalette, x: number, base: number, size: number, r: () => number): void {
  for (let k = 0; k < 4; k++) {
    const bx = x + (k - 1.5) * size * 0.6, rad = Math.round(size * 0.5 + r() * 2);
    p.circle(bx, base - rad + 1, rad + 1, pal.silhouette, true);
    p.circle(bx, base - rad + 1, rad, pal.leafDark, true);
    p.circle(bx - 1, base - rad, Math.max(1, rad - 2), pal.leafMid, true);
  }
  for (let k = 0; k < 3; k++) p.px(x + (r() - 0.5) * size * 2, base - size * 0.6, pal.flower, 1);
}

function drawNear(p: Pix, pal: EnvPalette, d: number, r: () => number): { lamps: number[] } {
  const base = p.h - 1;
  const lamps: number[] = [];
  const slots = [40, 130, 205, 300, 380, 470, 560];
  slots.forEach((x, i) => {
    const kind = r();
    const s = 18 + Math.floor(r() * 10);
    if (i === 2 || i === 5) {
      drawLamp(p, pal, x, base);
      lamps.push(x - 3);
      return;
    }
    if (i === 3) {
      drawGrave(p, pal, x - 10, base, false);
      drawGrave(p, pal, x + 8, base, true);
      return;
    }
    if (i === 6) {
      drawRuneStone(p, pal, x, base, d);
      drawBush(p, pal, x + 22, base, 9, r);
      return;
    }
    if (d > 0.68 || (d > 0.45 && kind < 0.35)) drawDeadTree(p, pal, x, base, s * 2.2, r);
    else if (d > 0.3 && kind < 0.6) drawPine(p, pal, x, base, s);
    else drawRoundTree(p, pal, x, base, s, r);
    if (r() < 0.6) drawBush(p, pal, x + 18, base, 8, r);
  });
  // Изгородь
  for (let x = 230; x < 290; x += 8) {
    p.rect(x, base - 12, 2, 12, pal.bark);
    if (!(d > 0.6 && x === 262)) p.rect(x - 3, base - 9, 9, 2, shade(pal.bark, 0.1));
  }
  return { lamps };
}

// ---------------------------------------------------------------- земля

function drawGround(p: Pix, pal: EnvPalette, d: number, r: () => number, pathTop: number, pathH: number): void {
  const H = p.h;
  p.ditherV(0, 6, TW, H - 6, pal.dirt, pal.dirtDark);
  // трава
  for (let x = 0; x < TW; x++) {
    const blade = 2 + Math.floor(r() * 5);
    for (let y = 0; y < 8; y++) p.px(x, y + 2, y < 2 ? pal.grassLight : y < 5 ? pal.grassMid : pal.grassDark);
    for (let y = 0; y < blade; y++) p.px(x, 2 - y + 1, y === blade - 1 ? pal.grassLight : pal.grassMid);
  }
  // свисающая трава над землёй
  for (let x = 0; x < TW; x += 2 + Math.floor(r() * 3)) p.rect(x, 10, 1, 1 + Math.floor(r() * 3), pal.grassDark);
  // тропа из булыжников
  if (pathH > 0) {
    p.rect(0, pathTop, TW, pathH, pal.pathDark);
    for (let row = 0; row < pathH; row += 5) {
      let x = (row * 7) % 9 - 6;
      while (x < TW) {
        const w = 5 + Math.floor(r() * 6), h = 4;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          if ((xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1)) continue;
          const c = yy === 0 ? pal.pathLight : yy === h - 1 ? shade(pal.path, -0.18) : pal.path;
          p.px((x + xx + TW) % TW, pathTop + row + yy, c);
        }
        x += w + 1;
      }
    }
    // края тропы
    for (let x = 0; x < TW; x++) { p.px(x, pathTop, pal.grassDark); if (r() < 0.4) p.px(x, pathTop - 1, pal.grassMid); }
  }
  // цветы (светлые) → грибы, кости, свечи (тёмные)
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * TW), y = 3 + Math.floor(r() * 5);
    if (r() > d) {
      p.px(x, y - 1, r() < 0.5 ? pal.flower : pal.flower2);
      p.px(x, y, pal.grassDark);
    } else if (r() < 0.5) {
      p.rect(x - 1, y - 2, 3, 1, 0xa02a2a); p.px(x, y - 3, 0xa02a2a); p.px(x, y - 1, 0xe8d8c8); p.px(x - 1, y - 2, 0xffffff);
    } else {
      p.rect(x - 1, y, 3, 1, 0xd8d0c0); p.px(x - 2, y - 1, 0xd8d0c0); p.px(x + 2, y + 1, 0xd8d0c0);
    }
  }
  // камни в земле
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(r() * TW), y = pathTop + pathH + 3 + Math.floor(r() * Math.max(1, H - pathTop - pathH - 6));
    if (y >= H - 1) continue;
    p.rect(x, y, 3, 2, pal.stoneDark); p.px(x, y, pal.stone);
  }
}

function drawForeground(p: Pix, pal: EnvPalette, r: () => number): void {
  const H = p.h;
  for (let x = 0; x < TW; x += 30 + Math.floor(r() * 70)) {
    const h = 12 + Math.floor(r() * 30);
    for (let k = 0; k < 9; k++) {
      const lean = (k - 4) * (0.25 + r() * 0.2);
      const bh = h * (0.5 + r() * 0.5);
      for (let y = 0; y < bh; y++) p.px(((Math.round(x + lean * y) % TW) + TW) % TW, H - 1 - y, pal.silhouette);
    }
  }
}

function drawFog(p: Pix, pal: EnvPalette, r: () => number): void {
  for (let i = 0; i < 9; i++) {
    const cx = r() * TW, cy = p.h * (0.3 + r() * 0.4), rx = 40 + r() * 60, ry = 6 + r() * 8;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const t = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (t > 1) continue;
      const px = ((Math.round(cx + x) % TW) + TW) % TW, py = Math.round(cy + y);
      if (Pix.bayer(px, py) < (1 - t) * 0.9) p.px(px, py, pal.fog, 0.35);
    }
  }
}

// ---------------------------------------------------------------- сборка

export function generateSceneryTextures(scene: Phaser.Scene, o: SceneryOpts): { lamps: number[] } {
  const pal = envPalette(o.darkness);
  const d = o.darkness;
  const G = o.groundY;
  const bottom = o.bottom ?? 400;
  const seed = o.seed ?? 7;
  canvasTexture(scene, 'env-sky', TW, G + 20, (p) => drawSky(p, pal, d, G, rng(seed)));
  canvasTexture(scene, 'env-clouds', TW, Math.round(G * 0.55), (p) => drawClouds(p, pal, d, rng(seed + 1)));
  canvasTexture(scene, 'env-mountains', TW, 130, (p) => drawMountains(p, pal, d));
  canvasTexture(scene, 'env-hills', TW, 90, (p) => void drawHills(p, pal, d, rng(seed + 2)));
  let lamps: number[] = [];
  canvasTexture(scene, 'env-near', TW, 150, (p) => (lamps = drawNear(p, pal, d, rng(seed + 3)).lamps));
  const gh = bottom - G;
  const pathTop = Math.min(gh - 4, gh > 60 ? 30 : 14);
  const pathH = gh > 60 ? 34 : Math.max(0, gh - pathTop - 2);
  canvasTexture(scene, 'env-ground', TW, gh, (p) => drawGround(p, pal, d, rng(seed + 4), pathTop, pathH));
  canvasTexture(scene, 'env-fog', TW, 60, (p) => drawFog(p, pal, rng(seed + 5)));
  if (o.foreground) canvasTexture(scene, 'env-fg', TW, 50, (p) => drawForeground(p, pal, rng(seed + 6)));
  return { lamps };
}

/** Создаёт слои сцены. Возвращает update(scrollX, time) для параллакса и анимации. */
export function buildScenery(scene: Phaser.Scene, o: SceneryOpts): Scenery {
  const { lamps } = generateSceneryTextures(scene, o);
  const pal = envPalette(o.darkness);
  const d = o.darkness;
  const G = o.groundY;
  const bottom = o.bottom ?? 400;
  const fix = <T extends Phaser.GameObjects.Components.ScrollFactor>(g: T) => g.setScrollFactor(0);

  fix(scene.add.image(0, 0, 'env-sky').setOrigin(0));
  const clouds = fix(scene.add.tileSprite(0, 4, TW, Math.round(G * 0.55), 'env-clouds').setOrigin(0));
  const mountains = fix(scene.add.tileSprite(0, G - 20, TW, 130, 'env-mountains').setOrigin(0, 1));
  const fogFar = fix(scene.add.tileSprite(0, G - 70, TW, 60, 'env-fog').setOrigin(0).setAlpha(0.5 + d * 0.3));
  const hills = fix(scene.add.tileSprite(0, G + 2, TW, 90, 'env-hills').setOrigin(0, 1));
  const near = fix(scene.add.tileSprite(0, G + 4, TW, 150, 'env-near').setOrigin(0, 1));
  const lampGlows = lamps.map(() =>
    fix(scene.add.image(0, G + 4 - 24, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(pal.lampGlow).setAlpha(0.55 + d * 0.3).setScale(1.2)),
  );
  const ground = fix(scene.add.tileSprite(0, G, TW, bottom - G, 'env-ground').setOrigin(0));
  const fogNear = fix(scene.add.tileSprite(0, G - 40, TW, 60, 'env-fog').setOrigin(0).setAlpha(0.25 + d * 0.45));
  fogNear.tilePositionX = 200;

  // Частицы: светлячки (уют) → угли и пепел (мрак)
  if (o.particles !== false) {
    const fireflies = Math.round(14 * (1 - d));
    if (fireflies > 0) {
      scene.add.particles(0, 0, 'px', {
        x: { min: 0, max: TW }, y: { min: G - 90, max: G + 10 },
        lifespan: 4000, speedX: { min: -8, max: 8 }, speedY: { min: -6, max: 4 },
        scale: { min: 0.5, max: 1 }, alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) * 2 },
        tint: 0xe8ff80, blendMode: 'ADD', frequency: 4000 / fireflies, quantity: 1,
      }).setScrollFactor(0);
    }
    if (d > 0.35) {
      scene.add.particles(0, 0, 'px', {
        x: { min: 0, max: TW }, y: G + 20, lifespan: 5000,
        speedY: { min: -30, max: -12 }, speedX: { min: -6, max: 10 },
        scale: { start: 1, end: 0.3 }, alpha: { start: 0.9, end: 0 },
        tint: [0xff7030, 0xffb040, 0xd04020], blendMode: 'ADD', frequency: 600 - d * 400,
      }).setScrollFactor(0);
    }
    if (d > 0.65) {
      scene.add.particles(0, 0, 'px', {
        x: { min: 0, max: TW + 100 }, y: -4, lifespan: 9000,
        speedY: { min: 10, max: 22 }, speedX: { min: -18, max: -6 },
        scale: 0.5, alpha: { start: 0.6, end: 0 }, tint: 0x9a8a90, frequency: 260,
      }).setScrollFactor(0);
    }
  }

  // Вороны — тень, пролетающая над уютом
  const crows: Phaser.GameObjects.Image[] = [];
  const crowCount = 2 + Math.round(d * 4);
  for (let i = 0; i < crowCount; i++) {
    crows.push(fix(scene.add.image(-20, 30 + i * 13, 'crow-0').setScale(1).setAlpha(0.85)));
  }

  let fg: Phaser.GameObjects.TileSprite | null = null;
  if (o.foreground) fg = fix(scene.add.tileSprite(0, bottom, TW, 50, 'env-fg').setOrigin(0, 1).setDepth(50));

  return {
    lamps: lampGlows,
    update(scrollX: number, time: number) {
      clouds.tilePositionX = scrollX * 0.04 + time * 0.004;
      mountains.tilePositionX = scrollX * 0.1;
      fogFar.tilePositionX = scrollX * 0.15 + time * 0.006;
      hills.tilePositionX = scrollX * 0.25;
      near.tilePositionX = scrollX * 0.55;
      ground.tilePositionX = scrollX;
      fogNear.tilePositionX = 200 + scrollX * 0.8 + time * 0.012;
      if (fg) fg.tilePositionX = scrollX * 1.35;
      lampGlows.forEach((g, i) => {
        const lx = lamps[i] - scrollX * 0.55;
        g.x = ((lx % TW) + TW) % TW;
        g.setScale(1.15 + Math.sin(time * 0.007 + i * 2) * 0.06 + Math.sin(time * 0.019 + i) * 0.04);
      });
      crows.forEach((c, i) => {
        const period = 14000 + i * 3100;
        const t = ((time + i * 4700) % period) / period;
        c.x = -20 + t * (TW + 60);
        c.y = 26 + i * 11 + Math.sin(t * 20 + i) * 4;
        c.setTexture(Math.floor(time / 180 + i) % 2 ? 'crow-1' : 'crow-0');
      });
    },
  };
}

/** Виньетка поверх всего — сильнее во тьме. */
export function addVignette(scene: Phaser.Scene, darkness: number, depth = 800): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(depth).setAlpha(0.45 + darkness * 0.45);
}

/** Тёплое освещение персонажей во тьме (умножающий тинт). */
export function ambientTint(darkness: number): number {
  return lerpColor(0xffffff, 0x9a88b0, darkness * 0.8);
}
