import Phaser from 'phaser';
import { canvasTexture, pixelTexture } from './pixelArt';
import { CARD_COLORS, envPalette, hex } from './palette';

/**
 * Процедурные пиксельные заглушки. Финальные спрайты заменят их с теми же ключами
 * и размерами (см. docs/ASSETS.md).
 */

export const CARD_W = 52;
export const CARD_H = 72;

// ---------- Герой (12x16, масштаб ×3 в сцене) ----------
const HERO_TOP = [
  '....hhhh....',
  '...hhhhhh...',
  '...hseses...',
  '...hssssh...',
  '....ssss....',
  '..cctttcc...',
  '.cctttttcc..',
  '.cctttttccw.',
  '.ccbbbbbccw.',
  '.cctttttccw.',
  '..ctttttc.w.',
];
const HERO_LEGS_A = ['...ll.ll....', '...ll.ll....', '...ll.ll....', '...oo.oo....', '..ooo.ooo...'];
const HERO_LEGS_B = ['...ll..ll...', '..ll...ll...', '..ll....ll..', '..oo....oo..', '.ooo....ooo.'];
const HERO_COLORS = {
  h: '#6a3a1a', s: '#f2c59a', e: '#2a1a10', c: '#2f5f9a', t: '#d8d0b8', b: '#7a4e2b', l: '#4a3a5a', o: '#3a2414', w: '#d0d8e8',
};

// ---------- Враги (16x16, масштаб ×4) ----------
const ENEMY_ART: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  slime: {
    rows: [
      '................', '................', '................', '................', '................',
      '......gggg......', '....gggggggg....', '...gwwggggggg...', '..ggwgggggggggg.', '..ggggeggggeggg.',
      '..ggggeggggeggg.', '.gggggggggggggg.', '.gggggggddggggg.', '.gggggggggggggg.', '..dddddddddddd..', '................',
    ],
    colors: { g: '#7ad06a', d: '#4a9a4a', w: '#e8ffe0', e: '#1a2a1a' },
  },
  goblin: {
    rows: [
      '................', '...kk......kk...', '...kkkkkkkkkk...', '.....kkkkkk.....', '....kekkkkek....',
      '....kkkkkkkk....', '.....kkmmkk.....', '......kkkk......', '....cccccccc....', '...kccccccccknd.',
      '...kcccbbccck.d.', '....cccccccc..d.', '....cc....cc....', '....kk....kk....', '...kkk....kkk...', '................',
    ],
    colors: { k: '#7aa04a', e: '#e03020', m: '#3a2010', c: '#8a5a2a', b: '#c9a227', d: '#c0c8d0', n: '#5a3a1a' },
  },
  wolf: {
    rows: [
      '................', '................', '..f.f...........', '..fff...........', '.fefff..........',
      'ffffffffffff....', '.nfffffffffff...', '..ffffffffffff..', '...fffffffffffff', '...fdffffffdff.f',
      '...fd.....fdf...', '...fd.....fd....', '..ff.....ff.....', '................', '................', '................',
    ],
    colors: { f: '#4a4a6a', d: '#2a2a40', e: '#f0d040', n: '#1a1a2a' },
  },
  wraith: {
    rows: [
      '......pppp......', '.....pppppp.....', '....pp.pp.pp....', '....pe.pp.ep....', '....pppppppp....',
      '.....pp..pp.....', '....pppppppp....', '...pppppppppp...', '..ppsppppppspp..', '..pps.pppp.spp..',
      '...s.pppppp.s...', '.....pppppp.....', '......pppp......', '.....pp..pp.....', '....p......p....', '................',
    ],
    colors: { p: '#b8c8d8', s: '#6a7a9a', e: '#60f0ff' },
  },
  lich: {
    rows: [
      '.....c.c.c......', '.....ccccc.....t', '.....bbbbb.....t', '.....beebb....tt', '.....bbbbb....t.',
      '......bbb.....t.', '....rrrrrrr...t.', '...rrrrrrrrr.bt.', '..rrrgrrrgrrrbt.', '..rr.rrrrr.rr.t.',
      '..r..rrrrr..r.t.', '.....rrrrr....t.', '....rrrrrrr...t.', '...rrrrrrrrr..t.', '...rrrrrrrrr....', '................',
    ],
    colors: { c: '#e0b030', b: '#e8e0d0', e: '#ff3050', r: '#4a1a5a', g: '#9a4ac0', t: '#7a5a3a' },
  },
};

// ---------- Иконки (9x9) мастей и заклинаний ----------
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
  crown: { rows: ['.........', 'a...a...a', 'aa.aaa.aa', 'abaaaaaba', 'aaaaaaaaa', 'acacacaca', 'aaaaaaaaa', '.........', '.........'], colors: { a: '#a08030', b: '#b03ad0', c: '#5a4010' } },
};

/** Иконка стихии по id стихии. */
export const ELEMENT_ICON: Record<string, string> = { fire: 'flame', air: 'wind', earth: 'rock', water: 'drop' };

// ---------- Точки интереса на тропе (16x16, масштаб ×3) ----------
const POI_ART: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  'poi-sign': {
    rows: ['................', '..aaaaaaaaaaaa..', '..abbbbbbbbbba..', '..ab.cc.cc.cba..', '..abbbbbbbbbba..', '..ab.ccc.cc.ba..', '..abbbbbbbbbba..', '..aaaaaaaaaaaa..',
      '.......dd.......', '.......dd.......', '.......dd.......', '.......dd.......', '.......dd.......', '......dddd......', '.....eeeeee.....', '................'],
    colors: { a: '#4a2a10', b: '#c09050', c: '#3a2010', d: '#6a4a2a', e: '#3a6a2a' },
  },
  'poi-fire': {
    rows: ['................', '.......a........', '......aa........', '......aba..a....', '.....abba.aa....', '....abbbbaba....', '....abbcbbba....', '...abbcccbba....', '...abcccccba....',
      '....abcccba.....', '..dddaaaaaddd...', '.ddeedddddeedd..', '..ddddeeedddd...', '................', '................', '................'],
    colors: { a: '#c0301a', b: '#f08030', c: '#ffe060', d: '#5a3a1a', e: '#8a5a2a' },
  },
  'poi-skull': {
    rows: ['................', '.....aaaaaa.....', '....aaaaaaaa....', '...aaaaaaaaaa...', '...ab..aa..ba...', '...a...aa...a...', '...aaaaaaaaaa...', '....aaa..aaa....', '.....aaaaaa.....',
      '.....a.a.a.a....', '.......cc.......', '.......cc.......', '.......cc.......', '.......cc.......', '......cccc......', '................'],
    colors: { a: '#e8e0d0', b: '#e03040', c: '#5a4a3a' },
  },
};

/** Генерирует все статичные текстуры (вызывается в BootScene). */
export function generateStaticTextures(scene: Phaser.Scene): void {
  pixelTexture(scene, 'hero-0', [...HERO_TOP, ...HERO_LEGS_A], HERO_COLORS);
  pixelTexture(scene, 'hero-1', [...HERO_TOP, ...HERO_LEGS_B], HERO_COLORS);
  for (const [id, a] of Object.entries(ENEMY_ART)) pixelTexture(scene, `enemy-${id}`, a.rows, a.colors);
  for (const [id, a] of Object.entries(ICONS)) pixelTexture(scene, `icon-${id}`, a.rows, a.colors);
  for (const [id, a] of Object.entries(POI_ART)) pixelTexture(scene, id, a.rows, a.colors);

  // Лицевая сторона карты
  canvasTexture(scene, 'card', CARD_W, CARD_H, (ctx) => {
    ctx.fillStyle = CARD_COLORS.border;
    ctx.fillRect(1, 0, CARD_W - 2, CARD_H);
    ctx.fillRect(0, 1, CARD_W, CARD_H - 2);
    ctx.fillStyle = CARD_COLORS.parchment;
    ctx.fillRect(2, 2, CARD_W - 4, CARD_H - 4);
    ctx.fillStyle = CARD_COLORS.parchmentShade;
    ctx.fillRect(2, CARD_H - 6, CARD_W - 4, 4);
    for (let i = 0; i < 40; i++) ctx.fillRect(3 + ((i * 37) % (CARD_W - 6)), 3 + ((i * 53) % (CARD_H - 10)), 1, 1);
    ctx.fillStyle = CARD_COLORS.gold;
    ctx.fillRect(4, 4, 3, 1); ctx.fillRect(4, 4, 1, 3);
    ctx.fillRect(CARD_W - 7, CARD_H - 5, 3, 1); ctx.fillRect(CARD_W - 5, CARD_H - 7, 1, 3);
  });

  // Рубашка карты
  canvasTexture(scene, 'card-back', CARD_W, CARD_H, (ctx) => {
    ctx.fillStyle = CARD_COLORS.border;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = CARD_COLORS.back;
    ctx.fillRect(2, 2, CARD_W - 4, CARD_H - 4);
    ctx.fillStyle = CARD_COLORS.backPattern;
    for (let y = 4; y < CARD_H - 4; y += 4) for (let x = 4 + ((y / 4) % 2) * 2; x < CARD_W - 4; x += 4) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = CARD_COLORS.gold;
    ctx.fillRect(CARD_W / 2 - 6, CARD_H / 2 - 6, 12, 12);
    ctx.fillStyle = CARD_COLORS.back;
    ctx.fillRect(CARD_W / 2 - 4, CARD_H / 2 - 4, 8, 8);
  });

  // Подсветка выбранной карты
  canvasTexture(scene, 'card-glow', CARD_W + 6, CARD_H + 6, (ctx) => {
    ctx.fillStyle = '#ffe070';
    ctx.fillRect(0, 2, CARD_W + 6, CARD_H + 2);
    ctx.fillRect(2, 0, CARD_W + 2, CARD_H + 6);
  });

  // Слот заклинания
  canvasTexture(scene, 'slot', 36, 36, (ctx) => {
    ctx.fillStyle = '#1a1018';
    ctx.fillRect(0, 0, 36, 36);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(1, 1, 34, 34);
    ctx.fillStyle = '#2a2026';
    ctx.fillRect(3, 3, 30, 30);
  });

  // Частица
  canvasTexture(scene, 'px', 2, 2, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
  });
}

/**
 * Текстуры окружения зависят от «тьмы» этапа — пересоздаются при каждом входе в сцену.
 * env-mountains: 320x90 (тайлится по X), env-trees: 256x80, env-ground: 64x48.
 */
export function generateEnvTextures(scene: Phaser.Scene, darkness: number): void {
  const p = envPalette(darkness);

  canvasTexture(scene, 'env-mountains', 320, 90, (ctx) => {
    const layer = (color: number, base: number, amp: number, phase: number) => {
      ctx.fillStyle = hex(color);
      for (let x = 0; x < 320; x += 2) {
        const a = (x / 320) * Math.PI * 2;
        const h = base + amp * (0.55 * Math.sin(a * 2 + phase) + 0.3 * Math.sin(a * 5 + phase * 2) + 0.15 * Math.sin(a * 11));
        const top = Math.round((90 - h) / 2) * 2;
        ctx.fillRect(x, top, 2, 90 - top);
      }
    };
    layer(p.mountainFar, 60, 22, 0.3);
    layer(p.mountainNear, 38, 16, 1.7);
    if (darkness < 0.4) {
      // снежные шапки на светлых этапах
      ctx.fillStyle = '#f4f8ff';
      for (let x = 0; x < 320; x += 2) {
        const a = (x / 320) * Math.PI * 2;
        const h = 60 + 22 * (0.55 * Math.sin(a * 2 + 0.3) + 0.3 * Math.sin(a * 5 + 0.6) + 0.15 * Math.sin(a * 11));
        if (h > 72) ctx.fillRect(x, Math.round((90 - h) / 2) * 2, 2, 4);
      }
    }
  });

  canvasTexture(scene, 'env-trees', 256, 80, (ctx) => {
    const dead = darkness > 0.6;
    const pine = darkness > 0.3;
    const xs = [10, 52, 90, 140, 176, 222];
    xs.forEach((x0, i) => {
      const hgt = 44 + ((i * 17) % 24);
      const base = 80;
      ctx.fillStyle = hex(p.trunk);
      ctx.fillRect(x0 - 2, base - hgt * 0.45, 4, hgt * 0.45);
      ctx.fillStyle = hex(i % 2 ? p.treeNear : p.treeFar);
      if (dead) {
        ctx.fillStyle = hex(p.trunk);
        ctx.fillRect(x0 - 1, base - hgt, 2, hgt);
        ctx.fillRect(x0 - 8, base - hgt * 0.75, 8, 2);
        ctx.fillRect(x0, base - hgt * 0.6, 9, 2);
        ctx.fillRect(x0 - 6, base - hgt * 0.9, 2, 6);
      } else if (pine) {
        for (let k = 0; k < hgt * 0.8; k += 2) {
          const w = Math.round((k / (hgt * 0.8)) * 14) * 2;
          ctx.fillRect(x0 - w / 2, base - hgt + k, w || 2, 2);
        }
      } else {
        const r = 12 + (i % 3) * 2;
        for (let y = -r; y <= r; y += 2) for (let x = -r; x <= r; x += 2) {
          if (x * x + y * y <= r * r) ctx.fillRect(x0 + x, base - hgt * 0.45 - r + y, 2, 2);
        }
      }
    });
  });

  canvasTexture(scene, 'env-ground', 64, 48, (ctx) => {
    ctx.fillStyle = hex(p.ground);
    ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = hex(p.grass);
    ctx.fillRect(0, 0, 64, 8);
    for (let x = 0; x < 64; x += 4) ctx.fillRect(x, 8, 2, (x * 7) % 3 === 0 ? 4 : 2);
    ctx.fillStyle = hex(p.path);
    ctx.fillRect(0, 16, 64, 18);
    ctx.fillStyle = hex(p.pathStone);
    [[6, 20], [22, 26], [40, 18], [54, 28], [30, 30]].forEach(([x, y]) => ctx.fillRect(x, y, 4, 2));
  });
}
