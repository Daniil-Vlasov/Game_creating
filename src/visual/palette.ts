/**
 * Палитры визуального стиля: переход от светлого фэнтези (darkness=0) к тёмному (darkness=1).
 * Окружение интерполируется плавно, UI переключается порогом 0.5 ради контраста текста.
 */
export interface EnvPalette {
  skyTop: number; skyBottom: number; sun: number;
  mountainFar: number; mountainNear: number;
  treeFar: number; treeNear: number; trunk: number;
  grass: number; ground: number; path: number; pathStone: number;
  felt: number; feltDark: number; wood: number; woodDark: number;
}

export interface UiPalette {
  panel: number; panelBorder: number; text: string; textDim: string;
  accent: number; accentText: string; danger: number; good: number; bar: number;
}

const LIGHT: EnvPalette = {
  skyTop: 0x7cc8f2, skyBottom: 0xfdf0c2, sun: 0xfff3a0,
  mountainFar: 0xa3c9c8, mountainNear: 0x78a98f,
  treeFar: 0x5fa860, treeNear: 0x3e8a46, trunk: 0x7a4e2b,
  grass: 0x6cc25a, ground: 0xb98a52, path: 0xe6cf96, pathStone: 0xcbb07a,
  felt: 0x3f7a4a, feltDark: 0x2f6038, wood: 0x9a6a3a, woodDark: 0x6a4424,
};

const DARK: EnvPalette = {
  skyTop: 0x07050f, skyBottom: 0x3b1a35, sun: 0xd8d0e8,
  mountainFar: 0x2a2038, mountainNear: 0x1d1628,
  treeFar: 0x1b2620, treeNear: 0x0e1612, trunk: 0x2a1c1c,
  grass: 0x23362a, ground: 0x2e2026, path: 0x4a3a40, pathStone: 0x3a2c32,
  felt: 0x23302c, feltDark: 0x172220, wood: 0x3e2a2a, woodDark: 0x261818,
};

const UI_LIGHT: UiPalette = {
  panel: 0xf4e4c1, panelBorder: 0x8a5a2b, text: '#3a2414', textDim: '#7a5a3a',
  accent: 0xc9a227, accentText: '#3a2414', danger: 0xc0392b, good: 0x3f9a4a, bar: 0x2a1a10,
};

const UI_DARK: UiPalette = {
  panel: 0x2a2030, panelBorder: 0x7a4a9a, text: '#eadfc8', textDim: '#a898b0',
  accent: 0xb03a4a, accentText: '#f6eadc', danger: 0xe0485a, good: 0x5ab070, bar: 0x0a0610,
};

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function envPalette(darkness: number): EnvPalette {
  const t = Math.max(0, Math.min(1, darkness));
  const out = {} as EnvPalette;
  (Object.keys(LIGHT) as (keyof EnvPalette)[]).forEach((k) => (out[k] = lerpColor(LIGHT[k], DARK[k], t)));
  return out;
}

export function uiPalette(darkness: number): UiPalette {
  return darkness < 0.5 ? UI_LIGHT : UI_DARK;
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/** Цвета карт (пергамент, постоянные для читаемости). */
export const CARD_COLORS = {
  parchment: '#f7ecd2', parchmentShade: '#e3d2ac', border: '#3a2414', gold: '#c9a227',
  back: '#5a2e4a', backPattern: '#8a4a6a', ink: '#2a1a10',
};
