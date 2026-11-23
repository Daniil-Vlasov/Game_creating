import { COMBOS } from './data';
import type { Card, ComboDef, Requirement } from './types';

function countBy<T>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

export function matches(req: Requirement, cards: Card[]): boolean {
  if (cards.length === 0) return false;
  const els = countBy(cards.map((c) => c.element));
  switch (req.type) {
    case 'any':
      return true;
    case 'sameElement':
      return Math.max(...els.values()) >= req.count;
    case 'allElements':
      return els.size === 4;
    case 'elementPair':
      return (els.get(req.a) ?? 0) >= req.count && (els.get(req.b) ?? 0) >= req.count;
    case 'sequence': {
      if (cards.length < req.count) return false;
      const p = cards.map((c) => c.power).sort((a, b) => a - b);
      return p.every((v, i) => i === 0 || v === p[i - 1] + 1);
    }
  }
}

const baseValue = (c: ComboDef) => c.atkPower * c.atkMult + c.defPower * c.defMult;

/** Лучшая подходящая комбинация (по базовой ценности). */
export function detectCombo(cards: Card[]): ComboDef {
  const ok = COMBOS.filter((c) => matches(c.requirement, cards));
  if (ok.length === 0) return COMBOS.find((c) => c.requirement.type === 'any')!;
  return ok.reduce((best, c) => (baseValue(c) > baseValue(best) ? c : best));
}
