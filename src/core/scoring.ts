import { detectCombo } from './combos';
import { isAttackElement } from './data';
import type { Card, ComboDef, SpellDef, Target } from './types';

export interface Track { power: number; mult: number }

/** Шаг подсчёта — для анимации (карта/слот подсвечивается, звук с растущим питчем). */
export type ScoreStep =
  | { kind: 'base'; atk: Track; def: Track }
  | { kind: 'card'; card: Card; toAtk: boolean; cursed: boolean; power: number; atk: Track; def: Track }
  | { kind: 'spell'; slot: number; spell: SpellDef; text: string; atk: Track; def: Track };

export interface ScoreResult {
  combo: ComboDef;
  steps: ScoreStep[];
  atk: Track;
  def: Track;
  attack: number;
  shield: number;
  hpLoss: number;
}

const snap = (t: Track): Track => ({ ...t });

/**
 * Атака = (Сила атаки) × (Множ. атаки), Щит = (Сила щита) × (Множ. щита).
 * 1) база комбинации; 2) Сила каждой руны идёт в атаку (Огонь/Воздух) или щит (Земля/Вода);
 * 3) заклинания слева направо; 4) штрафы проклятых.
 * Проклятые руны (cursedUids) дают Силу 0 в подсчёте, но комбинация определяется по настоящей Силе.
 */
export function scorePlay(played: Card[], handLeft: number, spells: SpellDef[], cursedUids?: ReadonlySet<number>): ScoreResult {
  const combo = detectCombo(played);
  const atk: Track = { power: combo.atkPower, mult: combo.atkMult };
  const def: Track = { power: combo.defPower, mult: combo.defMult };
  const steps: ScoreStep[] = [{ kind: 'base', atk: snap(atk), def: snap(def) }];

  for (const c of played) {
    const toAtk = isAttackElement(c.element);
    const cursed = cursedUids?.has(c.uid) ?? false;
    const power = cursed ? 0 : c.power;
    (toAtk ? atk : def).power += power;
    steps.push({ kind: 'card', card: c, toAtk, cursed, power, atk: snap(atk), def: snap(def) });
  }

  const tracks = (t: Target): Track[] => (t === 'atk' ? [atk] : t === 'def' ? [def] : [atk, def]);
  const label = (t: Target) => (t === 'atk' ? 'Атк' : t === 'def' ? 'Щит' : 'Атк/Щит');
  let hpLoss = 0;

  spells.forEach((spell, slot) => {
    const e = spell.effect;
    let text: string | null = null;
    const addPower = (t: Target, v: number) => { tracks(t).forEach((x) => (x.power += v)); text = `+${v} Сила ${label(t)}`; };
    const addMult = (t: Target, v: number) => { tracks(t).forEach((x) => (x.mult += v)); text = `+${v} Множ. ${label(t)}`; };
    switch (e.type) {
      case 'addPower': addPower(e.target, e.value); break;
      case 'addMult': addMult(e.target, e.value); break;
      case 'mulMult':
        tracks(e.target).forEach((x) => (x.mult = Math.round(x.mult * e.value * 10) / 10));
        text = `×${e.value} Множ. ${label(e.target)}`;
        break;
      case 'elementPower': {
        const n = played.filter((c) => c.element === e.element).length;
        if (n > 0) addPower(e.target, n * e.value);
        break;
      }
      case 'elementMult': {
        const n = played.filter((c) => c.element === e.element).length;
        if (n > 0) addMult(e.target, n * e.value);
        break;
      }
      case 'comboMult':
        if (e.combos.includes(combo.id)) addMult(e.target, e.value);
        break;
      case 'handLeftMult':
        if (handLeft > 0) addMult(e.target, handLeft * e.value);
        break;
      case 'lowCardMult':
        if (played.length <= e.maxCards) addMult(e.target, e.value);
        break;
      case 'goldOnWin':
      case 'healOnWin':
        break; // пассивные — после боя
    }
    if (spell.penalty?.type === 'hpLossPerPlay') {
      hpLoss += spell.penalty.value;
      text = (text ? text + ' · ' : '') + `−${spell.penalty.value} HP`;
    }
    if (text) steps.push({ kind: 'spell', slot, spell, text, atk: snap(atk), def: snap(def) });
  });

  return {
    combo, steps, atk, def, hpLoss,
    attack: Math.round(atk.power * atk.mult),
    shield: Math.round(def.power * def.mult),
  };
}
