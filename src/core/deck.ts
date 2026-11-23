import { ELEMENTS, RUNES } from './data';
import type { Card } from './types';

let uidCounter = 1;

/** Стартовая колода: по одной руне каждой Силы для каждой стихии (40 рун). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const el of ELEMENTS) for (const r of RUNES) deck.push({ uid: uidCounter++, element: el.id, power: r.power });
  return deck;
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Колода боя: стопка добора + отбой; при пустой стопке отбой перемешивается. */
export class BattleDeck {
  private pile: Card[];
  private discardPile: Card[] = [];

  constructor(cards: Card[]) {
    this.pile = shuffle([...cards]);
  }

  draw(n: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (this.pile.length === 0) {
        if (this.discardPile.length === 0) break;
        this.pile = shuffle(this.discardPile);
        this.discardPile = [];
      }
      out.push(this.pile.pop()!);
    }
    return out;
  }

  discard(cards: Card[]): void {
    this.discardPile.push(...cards);
  }

  get remaining(): number {
    return this.pile.length;
  }
}
