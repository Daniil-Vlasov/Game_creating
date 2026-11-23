import Phaser from 'phaser';
import { Pix, canvasTexture, pixelTexture } from './pixelArt';
import { CARD_COLORS, lerpColor, shade } from './palette';

/**
 * Процедурные пиксельные заглушки (обводка + авто-светотень).
 * Финальные спрайты заменят их с теми же ключами и размерами (см. docs/ASSETS.md).
 */

export const CARD_W = 52;
export const CARD_H = 72;

const SPRITE = { outline: true, shading: true };

// ---------- Герой: странник с фонарём и красным шарфом (16x23 + обводка) ----------
const HERO_TOP = [
  '......CCCC......',
  '.....CCCCCC.....',
  '....CCCCCCCC....',
  '....CCrrrrrrC...',
  '....CrrsssssC...',
  '....Crrssesss...',
  '....CCrsssss....',
  '.....CSSSSSs....',
  '....CCSSSSSSC...',
  '...CCCttttttCC..',
  '...CCtttttttCC..',
  '..CCCttttttttCC.',
  '..CCCbbbgbbbbsh.',
  '..CCCttttttttCw.',
  '..CC.tttttttt.w.',
  '..C..tttttttt..w',
];
const HERO_LEGS = [
  [
    '.....pppppppL..w',
    '.....ppp.pppLyL.',
    '.....ppp.pppLyL.',
    '.....ppp.ppp.L..',
    '.....ppp.ppp....',
    '.....ooo.ooo....',
    '....oooo.oooo...',
  ],
  [
    '.....pppppppL..w',
    '....ppp..pppLyL.',
    '...ppp....ppLyL.',
    '...pp.....ppp...',
    '..ppp......pp...',
    '..ooo......ooo..',
    '.oooo......oooo.',
  ],
];
const HERO_COLORS = {
  C: '#2e4a5e', r: '#6a3a1a', s: '#f0c090', e: '#1a1010', S: '#b0383a', t: '#c8b088', b: '#5a3a1a',
  g: '#e0b030', h: '#a07a2a', w: '#d8e0ec', p: '#4a3a4a', o: '#3a2418', L: '#4a3a30', y: '#ffe070',
};

// ---------- Враги ----------
const ENEMY_ART: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  slime: {
    rows: [
      '...........ll...........',
      '..........gggg..........',
      '.......gggggggggg.......',
      '.....gggggggggggggg.....',
      '....gggWWgggggggggggg...',
      '...ggWWWgggggggggggggg..',
      '...ggWWggggggggggggggg..',
      '..gggggggggggggggggggggg',
      '..ggggggEEggggggEEgggggg',
      '..ggggggEwggggggEwgggggg',
      '.gggggggEEggggggEEggggggg',
      '.ggggggggggggggggggggggg',
      '.gggggggggggMMMgggggggggg',
      '.ggggggggggggggggggggggg',
      '..gggggggggggggggggggggg',
      '..dddgggggggggggggggddd.',
      '....dddddddddddddddd....',
    ],
    colors: { g: '#6ac86a', d: '#3a8a4a', W: '#e8ffe0', E: '#1a2a1a', w: '#ffffff', M: '#2a4a2a', l: '#a0e060' },
  },
  goblin: {
    rows: [
      '.......kkkkk........',
      '..k...kkkkkkk...k...',
      '..kk.kkkkkkkkk.kk...',
      '...kkkkkkkkkkkkk....',
      '....kkEkkkkEkkk.....',
      '....kkkkknkkkkk.....',
      '.....kkMTMTMkk......',
      '......kkkkkkk.......',
      '.....HHHHHHHHH......',
      '....HHHHHHHHHHHk....',
      '...kHHHHbbHHHHHkd...',
      '...kHHHHHHHHHHH.d...',
      '...kkHHHHHHHHHH.d...',
      '.....HHHHHHHHH..h...',
      '.....pppp.pppp......',
      '.....pp....pp.......',
      '.....pp....pp.......',
      '....kkk....kkk......',
    ],
    colors: { k: '#7aa04a', E: '#ffd030', n: '#4a6a2a', M: '#3a1010', T: '#f0f0e0', H: '#7a4a2a', b: '#c9a227', d: '#c8d0d8', h: '#5a3a1a', p: '#4a3a2a' },
  },
  wolf: {
    rows: [
      '..ff..........................',
      '.fFff.........................',
      '.fffff........................',
      'fEffffff......................',
      'ffffffffffffffffffff..........',
      'nfffffffffffffffffffff........',
      '.TTfffffffffffffffffffff......',
      '..ffffffffffffffffffffffff.ff.',
      '...fffffffffffffffffffffffff..',
      '....ffff..ffffffffff.ffff.....',
      '....ff....ff......ff..ff......',
      '....ff....ff......ff..ff......',
      '...fff...fff.....fff.fff......',
    ],
    colors: { f: '#5a5a7a', F: '#9a6a7a', E: '#ffe040', n: '#1a1a2a', T: '#f0f0f0' },
  },
  wraith: {
    rows: [
      '.......pppppp.........',
      '......pppppppp........',
      '.....pppppppppp.......',
      '.....ppEEppEEpp.......',
      '.....ppEEppEEpp.......',
      '.....pppppppppp.......',
      '......ppp..ppp........',
      '......pppppppp........',
      '....HHHpppppppHHH.....',
      '...HHHHHppppppHHHH....',
      '..HHH.HHHHHHHHH.HHH...',
      '..HH..HHHHHHHHH..HH...',
      '.ccc..HHHHHHHHH..ccc..',
      '.c.c..HHHHHHHHH..c.c..',
      '......HHHHHHHHH.......',
      '......HHHHHHHHH.......',
      '.......HHHHHHH........',
      '.......HH.HHHH........',
      '........H.HH.H........',
      '..........H...........',
    ],
    colors: { p: '#c8d8e8', E: '#60f0ff', H: '#5a6a8a', c: '#c8d8e8' },
  },
  lich: {
    rows: [
      '.....t...c..c..c..........',
      '....ttt..cccccccc.........',
      '.....t...cGccccGc.........',
      '.....S....bbbbbb..........',
      '.....S...bbbbbbbb.........',
      '.....S...bEEbbEEb.........',
      '.....S...bbbbbbbb.........',
      '.....S....bbnnbb..........',
      '.....S.....bbbb...........',
      '.....S..rrrrrrrrrr........',
      '.....S.rrrrrgrrrrrr.......',
      '.....Sbrrrrrggrrrrrrr.....',
      '.....bbrrr.rgrrrrr.rrr....',
      '.....S....rrgrrrrr..rr....',
      '.....S....rrgrrrrr..bb....',
      '.....S....rrgrrrrr...b....',
      '.....S....rrgrrrrr........',
      '.....S...rrrgrrrrrr.......',
      '.....S...rrrgrrrrrr.......',
      '.....S..rrrrgrrrrrrr......',
      '.....S..rrrrrrrrrrrr......',
      '.....S.rrrrrrrrrrrrrr.....',
      '.......rrrrrrrrrrrrrr.....',
    ],
    colors: { c: '#e0b030', G: '#ff3060', b: '#e8e0d0', E: '#ff3050', n: '#3a3030', r: '#4a1a5a', g: '#c9a227', S: '#6a4a2a', t: '#b060ff' },
  },
};

// ---------- Иконки (9x9) стихий и заклинаний ----------
const ICONS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  flame: { rows: ['....a....', '...aa....', '...aba...', '..abba.a.', '.abbbbaa.', '.abbcbba.', 'abbcccbba', '.abcccba.', '..aaaaa..'], colors: { a: '#c0301a', b: '#f08030', c: '#ffe060' } },
  wind: { rows: ['.........', '..aaaa...', '.....a...', 'aaaaaa.b.', '.........', 'bbbbbbbb.', '........b', '..aaaaab.', '.........'], colors: { a: '#e0f4ff', b: '#7ec4e0' } },
  rock: { rows: ['.........', '...aaa...', '..abbba..', '.abbcbba.', '.abccbba.', 'abbbbbbba', 'abbbbbcba', '.aaaaaaa.', '.........'], colors: { a: '#4a3418', b: '#a07a3a', c: '#c8a868' } },
  drop: { rows: ['....a....', '...aba...', '...aba...', '..abbba..', '.abbbbba.', '.abcbbba.', '.abccbba.', '..abbba..', '...aaa...'], colors: { a: '#1a3a7a', b: '#3a7ad0', c: '#c0e0ff' } },
  spark: { rows: ['....a....', '....a....', '..a.b.a..', '...bbb...', 'aabbcbbaa', '...bbb...', '..a.b.a..', '....a....', '....a....'], colors: { a: '#ffd040', b: '#ffe880', c: '#ffffff' } },
  coin: { rows: ['..aaaaa..', '.abbbbba.', 'abbcccbba', 'abbcbbbba', 'abbcccbba', 'abbbbcbba', 'abbcccbba', '.abbbbba.', '..aaaaa..'], colors: { a: '#8a6a1a', b: '#e0b030', c: '#fff0a0' } },
  note: { rows: ['....aaaaa', '....a...a', '....a...a', '....a...a', '....a...a', '.aaaa.aaa', 'aaaaaaaaa', '.aa..aaa.', '.........'], colors: { a: '#e8d8b0' } },
  moon: { rows: ['...aaa...', '..aab....', '.aab.....', '.aab.....', '.aab.....', '.aab.....', '..aab..c.', '...aaa...', '.........'], colors: { a: '#e8e0b0', b: '#b8b090', c: '#ffffff' } },
  eye: { rows: ['.........', '..aaaaa..', '.a.....a.', 'a..bbb..a', 'a..bcb..a', 'a..bbb..a', '.a.....a.', '..aaaaa..', '.........'], colors: { a: '#e8d8b0', b: '#4a9ad0', c: '#000000' } },
  heart: { rows: ['.........', '.aa...aa.', 'abba.abba', 'abbbabbba', 'abbbbbbba', '.abbbbba.', '..abbba..', '...aba...', '....a....'], colors: { a: '#5a0a1a', b: '#e03040' } },
  tree: { rows: ['..aaaaa..', '.aabaaba.', 'aabaaaaba', 'aaaabaaaa', '.aaaaaaa.', '...ccc...', '....c....', '...ccc...', '..c.c.c..'], colors: { a: '#3a9a4a', b: '#8ae070', c: '#7a4e2b' } },
  skull: { rows: ['..aaaaa..', '.aaaaaaa.', 'aaaaaaaaa', 'ab..a..ba', 'aa..a..aa', '.aaa.aaa.', '..aaaaa..', '..a.a.a..', '.........'], colors: { a: '#e8e0d0', b: '#b03ad0' } },
  crown: { rows: ['.........', 'a...a...a', 'aa.aaa.aa', 'abaaaaaba', 'aaaaaaaaa', 'acacacaca', 'aaaaaaaaa', '.........', '.........'], colors: { a: '#e0b030', b: '#b03ad0', c: '#8a6010' } },
};

// ---------- Иконки намерений врага (9x9) → ключи icon-intent-* ----------
const INTENT_ICONS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  'intent-attack': { rows: ['........a', '.......ab', '......ab.', '.....ab..', 'c...ab...', '.cbab....', '..cb.....', '.c.c.....', 'c........'], colors: { a: '#e8e8f0', b: '#8a8aa0', c: '#a06a2a' } },
  'intent-heavy': { rows: ['.aaaaaaa.', 'abbbbbbba', 'abbcbbbba', 'abbbbbbba', '.aaaaaaa.', '....c....', '....c....', '....c....', '...ccc...'], colors: { a: '#6a0a0a', b: '#e03030', c: '#8a5a2a' } },
  'intent-block': { rows: ['aaaaaaaaa', 'abbbcbbba', 'abbbcbbba', 'abcccccba', 'abbbcbbba', '.abbcbba.', '.abbcbba.', '..abcba..', '...aaa...'], colors: { a: '#2a3a6a', b: '#5a8ad0', c: '#c0e0ff' } },
  'intent-curse': { rows: ['...aaa...', '..a...a..', '.a.bbb.a.', 'a.b...b.a', 'a.b.c.b.a', 'a.b..b..a', '.a.bb..a.', '..a...a..', '...aaa...'], colors: { a: '#7a3aaa', b: '#d080ff', c: '#ffffff' } },
  'intent-buff': { rows: ['....a....', '...aba...', '..abbba..', '.abbbbba.', 'aaabbbaaa', '..abbba..', '..abbba..', '..abbba..', '..aaaaa..'], colors: { a: '#7a4a10', b: '#ffb030' } },
  'intent-heal': { rows: ['...aaa...', '...aba...', '...aba...', 'aaaabaaaa', 'abbbbbbba', 'aaaabaaaa', '...aba...', '...aba...', '...aaa...'], colors: { a: '#1a5a2a', b: '#60e070' } },
  'intent-steal': { rows: ['...a.a...', '....a....', '...aaa...', '..abbba..', '.abbcbba.', 'abbcccbba', 'abbbcbbba', 'abbbbbbba', '.aaaaaaa.'], colors: { a: '#4a2a10', b: '#a07040', c: '#ffd040' } },
  'intent-multi': { rows: ['a..a..a..', 'a..a..a..', '.a..a..a.', '.a..a..a.', '.a..a..a.', '..a..a..a', '..a..a..a', '..b..b..b', '.........'], colors: { a: '#ffe0e0', b: '#e03030' } },
};

export const ELEMENT_ICON: Record<string, string> ={ fire: 'flame', air: 'wind', earth: 'rock', water: 'drop' };
export const ELEMENT_COLOR: Record<string, number> = { fire: 0xe0603a, air: 0x7ec4e0, earth: 0xa07a3a, water: 0x3a7ad0 };

// ---------- Точки интереса ----------
const POI_ART: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  'poi-sign': {
    rows: ['................', '..aaaaaaaaaaaa..', '..abbbbbbbbbba..', '..ab.cc.cc.cba..', '..abbbbbbbbbba..', '..ab.ccc.cc.ba..', '..abbbbbbbbbba..', '..aaaaaaaaaaaa..',
      '.......dd.......', '.......dd.......', '.......dd.......', '.......dd.......', '.......dd.......', '......dddd......', '.....eeeeee.....'],
    colors: { a: '#4a2a10', b: '#c09050', c: '#3a2010', d: '#6a4a2a', e: '#3a6a2a' },
  },
  'poi-fire': {
    rows: ['.......a........', '......aa........', '......aba..a....', '.....abba.aa....', '....abbbbaba....', '....abbcbbba....', '...abbcccbba....', '...abcccccba....',
      '....abcccba.....', '..dddaaaaaddd...', '.ddeedddddeedd..', '..ddddeeedddd...'],
    colors: { a: '#c0301a', b: '#f08030', c: '#ffe060', d: '#5a3a1a', e: '#8a5a2a' },
  },
  'poi-skull': {
    rows: ['.....aaaaaa.....', '....aaaaaaaa....', '...aaaaaaaaaa...', '...ab..aa..ba...', '...a...aa...a...', '...aaaaaaaaaa...', '....aaa..aaa....', '.....aaaaaa.....',
      '.....a.a.a.a....', '.......cc.......', '.......cc.......', '.......cc.......', '.......cc.......', '......cccc......'],
    colors: { a: '#e8e0d0', b: '#e03040', c: '#5a4a3a' },
  },
  'poi-tavern': {
    rows: [
      '..........cc..........', '..........cc..........', '......RRRRRRRRRR......', '.....RRRRRRRRRRRR.....', '....RRRRRRRRRRRRRR....',
      '...RRRRRRRRRRRRRRRR...', '..RRRRRRRRRRRRRRRRRR..', '...wwwwwwwwwwwwwwww...', '...wbbwwwwwwwwwbbww...', '...wyywwwwddwwwyyww.s.',
      '...wyywwwwddwwwyywwsS.', '...wwwwwwwddwwwwwww.s.', '...wwwwwwwddwwwwwww...', '...wwwwwwwddwwwwwww...', '..ggggggggggggggggggg.',
    ],
    colors: { R: '#a04a3a', w: '#d8c8a8', b: '#6a4a2a', y: '#ffd860', d: '#6a4a2a', c: '#6a5a5a', s: '#4a3a30', S: '#c9a227', g: '#4a8a3a' },
  },
};

/** Генерирует все статичные текстуры (BootScene). */
export function generateStaticTextures(scene: Phaser.Scene): void {
  HERO_LEGS.forEach((legs, i) => pixelTexture(scene, `hero-${i}`, [...HERO_TOP, ...legs], HERO_COLORS, SPRITE));
  for (const [id, a] of Object.entries(ENEMY_ART)) pixelTexture(scene, `enemy-${id}`, a.rows, a.colors, SPRITE);
  for (const [id, a] of Object.entries(ICONS)) pixelTexture(scene, `icon-${id}`, a.rows, a.colors, { outline: true });
  for (const [id, a] of Object.entries(INTENT_ICONS)) pixelTexture(scene, `icon-${id}`, a.rows, a.colors, { outline: true });
  for (const [id, a] of Object.entries(POI_ART)) pixelTexture(scene, id, a.rows, a.colors, SPRITE);
  pixelTexture(scene, 'crow-0', ['a.....a', '.a...a.', '..aaa..', '...a...'], { a: '#1a1018' });
  pixelTexture(scene, 'crow-1', ['..aaa..', '.a.a.a.', 'a.....a'], { a: '#1a1018' });

  for (const el of Object.keys(ELEMENT_COLOR)) cardFace(scene, `card-${el}`, ELEMENT_COLOR[el]);
  cardBack(scene);

  canvasTexture(scene, 'card-glow', CARD_W + 8, CARD_H + 8, (p) => {
    for (let y = 0; y < CARD_H + 8; y++) for (let x = 0; x < CARD_W + 8; x++) {
      const dx = Math.min(x, CARD_W + 7 - x), dy = Math.min(y, CARD_H + 7 - y);
      const dd = Math.min(dx, dy);
      if (dd < 4) p.px(x, y, 0xffe070, dd < 1 ? 0.35 : dd < 2 ? 0.6 : dd < 3 ? 0.85 : 1);
    }
  });

  // Слот заклинания: резное каменное гнездо
  canvasTexture(scene, 'slot', 36, 36, (p) => {
    p.rect(1, 0, 34, 36, 0x140c12); p.rect(0, 1, 36, 34, 0x140c12);
    p.rect(1, 1, 34, 34, 0x5a4a44);
    p.rect(1, 1, 34, 1, 0x8a7a6a); p.rect(1, 1, 1, 34, 0x7a6a5a);
    p.rect(3, 3, 30, 30, 0x241a20);
    p.ditherV(4, 4, 28, 28, 0x2e2228, 0x1a1218);
    for (const [x, y] of [[3, 3], [32, 3], [3, 32], [32, 32]]) p.px(x, y, 0xc9a227);
  });

  canvasTexture(scene, 'px', 2, 2, (p) => p.rect(0, 0, 2, 2, 0xffffff));

  // Мягкое пиксельное свечение (ступенчатые кольца) — для фонарей, костра, огней
  canvasTexture(scene, 'glow', 48, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const r = Math.hypot(x - 23.5, y - 23.5) / 24;
      if (r > 1) continue;
      const lv = Math.ceil((1 - r) * 5) / 5;
      p.px(x, y, 0xffffff, lv * lv * 0.55);
    }
  });

  // Виньетка (ступенчатая, с дизерингом)
  canvasTexture(scene, 'vignette', 640, 400, (p) => {
    for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) {
      const nx = (x - 320) / 360, ny = (y - 200) / 250;
      const r = Math.sqrt(nx * nx + ny * ny);
      const a = Math.max(0, (r - 0.62) / 0.5);
      if (a <= 0) continue;
      const q = Math.min(1, Math.floor(a * 6 + Pix.bayer(x, y)) / 6);
      if (q > 0) p.px(x, y, 0x06030a, q * 0.85);
    }
  });
}

/** Лицевая сторона руны: металлическая рамка цвета стихии, золотые уголки, пергамент, гнездо руны, лента имени. */
function cardFace(scene: Phaser.Scene, key: string, elColor: number): void {
  canvasTexture(scene, key, CARD_W, CARD_H, (p) => {
    const W = CARD_W, H = CARD_H;
    const metal = lerpColor(elColor, 0x2a1a14, 0.5);
    // контур со скруглёнными углами
    p.rect(2, 0, W - 4, H, CARD_COLORS.border); p.rect(0, 2, W, H - 4, CARD_COLORS.border); p.rect(1, 1, W - 2, H - 2, CARD_COLORS.border);
    // металлическая рамка
    p.rect(2, 2, W - 4, H - 4, metal);
    p.rect(2, 2, W - 4, 1, shade(metal, 0.35)); p.rect(2, 2, 1, H - 4, shade(metal, 0.2));
    p.rect(2, H - 3, W - 4, 1, shade(metal, -0.35)); p.rect(W - 3, 2, 1, H - 4, shade(metal, -0.25));
    // пергамент
    p.rect(4, 4, W - 8, H - 8, CARD_COLORS.border);
    p.ditherV(5, 5, W - 10, H - 10, CARD_COLORS.parchment, CARD_COLORS.parchmentShade);
    for (let i = 0; i < 70; i++) {
      const x = 5 + ((i * 37) % (W - 10)), y = 5 + ((i * 53 + i * i) % (H - 10));
      p.px(x, y, shade(CARD_COLORS.parchmentShade, -0.08), 0.7);
    }
    // гнездо руны со свечением стихии
    const cx = 26, cy = 33;
    for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) {
      const r = Math.hypot(x, y);
      if (r < 15 && Pix.bayer(cx + x, cy + y) < (1 - r / 15) * 0.7) p.px(cx + x, cy + y, elColor, 0.35);
    }
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      p.px(cx + Math.cos(rad) * 13, cy + Math.sin(rad) * 13, shade(metal, -0.1));
      if (a % 45 === 0) p.px(cx + Math.cos(rad) * 15, cy + Math.sin(rad) * 15, CARD_COLORS.gold);
    }
    // золотые уголки
    for (const [x, y, sx, sy] of [[5, 5, 1, 1], [W - 6, 5, -1, 1], [5, H - 6, 1, -1], [W - 6, H - 6, -1, -1]]) {
      for (let k = 0; k < 5; k++) { p.px(x + k * sx, y, CARD_COLORS.gold); p.px(x, y + k * sy, CARD_COLORS.gold); }
      p.px(x + sx, y + sy, CARD_COLORS.goldDark);
    }
    // значок Силы (тёмный кругляш под цифру)
    p.circle(11, 11, 7, CARD_COLORS.border);
    p.circle(11, 11, 6, shade(metal, -0.25));
    p.circle(10, 10, 3, shade(metal, -0.1));
    // лента имени
    const rib = shade(metal, -0.15);
    p.rect(6, H - 15, W - 12, 9, CARD_COLORS.border);
    p.rect(7, H - 14, W - 14, 7, rib);
    p.rect(7, H - 14, W - 14, 1, shade(rib, 0.25));
    p.px(6, H - 11, 0, 0); p.px(4, H - 12, rib); p.px(W - 5, H - 12, rib);
  });
}

function cardBack(scene: Phaser.Scene): void {
  canvasTexture(scene, 'card-back', CARD_W, CARD_H, (p) => {
    const W = CARD_W, H = CARD_H;
    p.rect(2, 0, W - 4, H, CARD_COLORS.border); p.rect(0, 2, W, H - 4, CARD_COLORS.border);
    p.ditherV(2, 2, W - 4, H - 4, CARD_COLORS.backPattern, CARD_COLORS.back);
    for (let y = 6; y < H - 6; y += 4) for (let x = 6 + ((y / 4) % 2) * 2; x < W - 6; x += 4) p.px(x, y, shade(CARD_COLORS.back, -0.3));
    p.rect(4, 4, W - 8, 1, CARD_COLORS.gold); p.rect(4, H - 5, W - 8, 1, CARD_COLORS.gold);
    p.rect(4, 4, 1, H - 8, CARD_COLORS.gold); p.rect(W - 5, 4, 1, H - 8, CARD_COLORS.gold);
    // полумесяц и глаз — герб тропы
    p.circle(26, 36, 10, CARD_COLORS.gold);
    p.circle(29, 34, 9, CARD_COLORS.back);
    p.circle(22, 38, 2, 0xffe8a0);
  });
}

/** Рамка панели нужного размера (кэш по ключу). light: пергамент + дерево; dark: сланец + фиолетовое железо. */
export function frameTexture(scene: Phaser.Scene, w: number, h: number, style: 'light' | 'dark'): string {
  const key = `frame-${style}-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const light = style === 'light';
  const border = light ? 0x5a3418 : 0x3a2450;
  const borderHi = light ? 0x9a6a3a : 0x7a4a9a;
  const fillTop = light ? 0xf6e8c8 : 0x302438;
  const fillBot = light ? 0xe4cc9c : 0x1e1626;
  const corner = light ? 0xd8a830 : 0xb060ff;
  canvasTexture(scene, key, w, h, (p) => {
    p.rect(2, 0, w - 4, h, 0x120a0e); p.rect(0, 2, w, h - 4, 0x120a0e); p.rect(1, 1, w - 2, h - 2, 0x120a0e);
    p.rect(2, 2, w - 4, h - 4, border);
    p.rect(2, 2, w - 4, 1, borderHi); p.rect(2, 2, 1, h - 4, borderHi);
    p.rect(4, 4, w - 8, h - 8, 0x120a0e);
    p.ditherV(5, 5, w - 10, h - 10, fillTop, fillBot);
    if (light) for (let i = 0; i < (w * h) / 60; i++) p.px(5 + ((i * 37) % (w - 10)), 5 + ((i * 53 + i * i) % (h - 10)), shade(fillBot, -0.06), 0.6);
    for (const [x, y] of [[2, 2], [w - 6, 2], [2, h - 6], [w - 6, h - 6]]) {
      p.rect(x, y, 4, 4, 0x120a0e); p.rect(x + 1, y + 1, 2, 2, corner); p.px(x + 1, y + 1, shade(corner, 0.5));
    }
  });
  return key;
}

/** Текстура кнопки (выпуклая плашка с фаской). */
export function buttonTexture(scene: Phaser.Scene, w: number, h: number, color: number): string {
  const key = `btn-${color.toString(16)}-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  canvasTexture(scene, key, w, h + 3, (p) => {
    p.rect(2, 3, w - 4, h, 0x000000, 0.45); p.rect(0, 5, w, h - 4, 0x000000, 0.45);
    p.rect(2, 0, w - 4, h, 0x120a0e); p.rect(0, 2, w, h - 4, 0x120a0e); p.rect(1, 1, w - 2, h - 2, 0x120a0e);
    p.ditherV(2, 2, w - 4, h - 4, shade(color, 0.18), shade(color, -0.18));
    p.rect(2, 2, w - 4, 1, shade(color, 0.45));
    p.rect(2, h - 3, w - 4, 1, shade(color, -0.4));
    p.px(3, 3, shade(color, 0.6)); p.px(w - 4, 3, shade(color, 0.3));
  });
  return key;
}
