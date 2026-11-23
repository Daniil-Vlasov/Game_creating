/**
 * Палитры «уют с тенью»: darkness=0 — тёплый золотой час с намёками на мрак,
 * darkness=1 — дарк-фэнтези (багровое небо, мёртвый лес), но тёплые огни остаются.
 * Окружение интерполируется плавно, UI переключается порогом 0.5 ради контраста.
 */
export interface EnvPalette {
  skyTop: number; skyMid: number; skyBottom: number; horizonGlow: number;
  sun: number; cloudLight: number; cloudShadow: number; star: number;
  mountainLit: number; mountainShadow: number; snow: number; haze: number;
  hill: number; forestDark: number; forestMid: number; forestLight: number;
  leafDark: number; leafMid: number; leafLight: number; bark: number; barkDark: number;
  grassDark: number; grassMid: number; grassLight: number;
  dirt: number; dirtDark: number; path: number; pathDark: number; pathLight: number;
  stone: number; stoneDark: number; flower: number; flower2: number;
  fog: number; lampGlow: number; silhouette: number;
  felt: number; feltDark: number; wood: number; woodDark: number; woodLight: number;
}

const LIGHT: EnvPalette = {
  skyTop: 0x5a8ccf, skyMid: 0x9cc4e4, skyBottom: 0xf6d6a0, horizonGlow: 0xffb37a,
  sun: 0xfff2b0, cloudLight: 0xfff6e8, cloudShadow: 0xd8b8b8, star: 0xffffff,
  mountainLit: 0x8aa6c0, mountainShadow: 0x6a7fa0, snow: 0xf4f4ff, haze: 0xd8d4d8,
  hill: 0x6e9a78, forestDark: 0x3c6650, forestMid: 0x4f7e5a, forestLight: 0x76a468,
  leafDark: 0x2f5e3a, leafMid: 0x4b8a46, leafLight: 0x86c05a, bark: 0x7a5232, barkDark: 0x4a2e1c,
  grassDark: 0x3e7a3a, grassMid: 0x5ea444, grassLight: 0x9ad060,
  dirt: 0x8a6040, dirtDark: 0x5a3a28, path: 0xd8b880, pathDark: 0xa88858, pathLight: 0xf0d8a0,
  stone: 0x9a9a9a, stoneDark: 0x6a6a72, flower: 0xf06a7a, flower2: 0xf0e070,
  fog: 0xf0e8f0, lampGlow: 0xffc860, silhouette: 0x2a3a30,
  felt: 0x2f6a44, feltDark: 0x225236, wood: 0x8a5a32, woodDark: 0x5a3820, woodLight: 0xb07a46,
};

const DARK: EnvPalette = {
  skyTop: 0x0a0614, skyMid: 0x2a1030, skyBottom: 0x6a1e2a, horizonGlow: 0xc0402a,
  sun: 0xe8d0d8, cloudLight: 0x5a3048, cloudShadow: 0x24121e, star: 0xffe8f0,
  mountainLit: 0x3a2440, mountainShadow: 0x22142a, snow: 0x6a5a70, haze: 0x4a2030,
  hill: 0x2a1a26, forestDark: 0x120c14, forestMid: 0x1c1420, forestLight: 0x2e2030,
  leafDark: 0x1a1a1a, leafMid: 0x2a2626, leafLight: 0x3a3430, bark: 0x2e2224, barkDark: 0x160e12,
  grassDark: 0x1a221e, grassMid: 0x26302a, grassLight: 0x3a4238,
  dirt: 0x2a1c20, dirtDark: 0x140c10, path: 0x4a3a40, pathDark: 0x2e2228, pathLight: 0x625058,
  stone: 0x4a4450, stoneDark: 0x2a2630, flower: 0x8a2a4a, flower2: 0xc08030,
  fog: 0x6a4a6a, lampGlow: 0xff9a40, silhouette: 0x08040a,
  felt: 0x1e2a2a, feltDark: 0x121c1c, wood: 0x3e2626, woodDark: 0x221414, woodLight: 0x5a3a36,
};

export interface UiPalette {
  panel: number; panelBorder: number; text: string; textDim: string;
  accent: number; accentText: string; danger: number; good: number; bar: number; style: 'light' | 'dark';
}

const UI_LIGHT: UiPalette = {
  panel: 0xf4e4c1, panelBorder: 0x8a5a2b, text: '#3a2414', textDim: '#7a5a3a',
  accent: 0xc9a227, accentText: '#3a2414', danger: 0xc0392b, good: 0x3f9a4a, bar: 0x2a1a10, style: 'light',
};

const UI_DARK: UiPalette = {
  panel: 0x2a2030, panelBorder: 0x7a4a9a, text: '#eadfc8', textDim: '#b0a0b8',
  accent: 0xb03a4a, accentText: '#f6eadc', danger: 0xe0485a, good: 0x4a9a60, bar: 0x0a0610, style: 'dark',
};

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Осветлить (>0) или затемнить (<0) цвет. */
export function shade(c: number, amt: number): number {
  return amt >= 0 ? lerpColor(c, 0xffffff, amt) : lerpColor(c, 0x000000, -amt);
}

export function envPalette(darkness: number): EnvPalette {
  // Нелинейно: тень приходит быстрее в середине забега
  const t = Math.max(0, Math.min(1, darkness));
  const e = t * t * (3 - 2 * t);
  const out = {} as EnvPalette;
  (Object.keys(LIGHT) as (keyof EnvPalette)[]).forEach((k) => (out[k] = lerpColor(LIGHT[k], DARK[k], e)));
  // Тёплые огни не гаснут
  out.lampGlow = lerpColor(LIGHT.lampGlow, DARK.lampGlow, t * 0.5);
  return out;
}

export function uiPalette(darkness: number): UiPalette {
  return darkness < 0.5 ? UI_LIGHT : UI_DARK;
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const CARD_COLORS = {
  parchment: 0xf3e6c4, parchmentShade: 0xd9c398, border: 0x2a1a14, gold: 0xd8a830, goldDark: 0x8a6418,
  back: 0x4a2440, backPattern: 0x7a3a64, ink: 0x2a1a10,
};
