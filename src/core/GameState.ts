import { ENEMIES, RARITIES, ROUTE, RULES, SHOP, SPELLS, enemyById } from './data';
import { createDeck } from './deck';
import type { Card, EnemyDef, EventOutcome, Rarity, RouteNode, SpellDef } from './types';

/** Состояние забега (без Phaser-зависимостей). */
export class GameState {
  hp = RULES.heroMaxHp;
  maxHp = RULES.heroMaxHp;
  gold = RULES.startGold;
  /** Индекс текущей точки маршрута (к которой идём / на которой стоим). */
  node = 0;
  deck: Card[] = createDeck();
  spells: SpellDef[] = [];
  rerolls = 0;

  reset(): void {
    Object.assign(this, new GameState());
  }

  get current(): RouteNode {
    return ROUTE[Math.min(this.node, ROUTE.length - 1)];
  }

  get isLastNode(): boolean {
    return this.node >= ROUTE.length - 1;
  }

  /** 0 = лайт-фэнтези, 1 = дарк-фэнтези; плавно растёт с прогрессом (можно дробный индекс). */
  darknessAt(progress: number): number {
    return Math.max(0, Math.min(1, progress / (ROUTE.length - 1)));
  }

  get darkness(): number {
    return this.darknessAt(this.node);
  }

  get enemy(): EnemyDef {
    const n = this.current;
    return n.type === 'enemy' ? enemyById(n.id) : ENEMIES[0];
  }

  get handSize(): number {
    let size = RULES.handSize;
    for (const s of this.spells) if (s.penalty?.type === 'handSizeMinus') size -= s.penalty.value;
    return Math.max(3, size);
  }

  advance(): void {
    this.node++;
    this.rerolls = 0;
  }

  heal(n: number): number {
    const before = this.hp;
    this.hp = Math.max(0, Math.min(this.maxHp, this.hp + n));
    return this.hp - before;
  }

  /** Награды после победы, включая пассивные заклинания и «проценты» за накопленное золото. */
  applyVictory(): { gold: number; heal: number } {
    let gold = this.enemy.reward;
    let heal = 0;
    for (const s of this.spells) {
      if (s.effect.type === 'goldOnWin') gold += s.effect.value;
      if (s.effect.type === 'healOnWin') heal += s.effect.value;
      if (s.penalty?.type === 'goldLossOnWin') gold -= s.penalty.value;
    }
    gold += Math.min(RULES.interestMax, Math.floor(this.gold / RULES.interestPer));
    this.gold = Math.max(0, this.gold + gold);
    return { gold, heal: this.heal(heal) };
  }

  randomSpell(rarity?: Rarity, rnd: () => number = Math.random): SpellDef | null {
    const owned = new Set(this.spells.map((s) => s.id));
    const pool = SPELLS.filter((s) => !owned.has(s.id) && (!rarity || s.rarity === rarity));
    return this.weightedPick(pool, rnd);
  }

  rollShop(rnd: () => number = Math.random): SpellDef[] {
    const owned = new Set(this.spells.map((s) => s.id));
    const pool = SPELLS.filter((s) => !owned.has(s.id));
    const out: SpellDef[] = [];
    while (out.length < SHOP.offers && pool.length > 0) {
      const pick = this.weightedPick(pool, rnd)!;
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  get rerollCost(): number {
    return SHOP.rerollBase + this.rerolls * SHOP.rerollStep;
  }

  sellPrice(s: SpellDef): number {
    return Math.max(1, Math.floor(s.price * SHOP.sellRatio));
  }

  upgradeCard(uid: number, amount: number): void {
    const c = this.deck.find((x) => x.uid === uid);
    if (c) c.power = Math.min(RULES.maxRunePower, c.power + amount);
  }

  removeCard(uid: number): void {
    if (this.deck.length <= RULES.handSize) return; // не даём выродить колоду
    this.deck = this.deck.filter((c) => c.uid !== uid);
  }

  /** Применяет исход события, возвращает список изменений для показа. */
  applyOutcome(o: EventOutcome, rnd: () => number = Math.random): string[] {
    const log: string[] = [];
    if (o.gold) { this.gold = Math.max(0, this.gold + o.gold); log.push(`${o.gold > 0 ? '+' : ''}${o.gold} золота`); }
    if (o.hp) { const d = this.heal(o.hp); log.push(`${d >= 0 ? '+' : ''}${d} HP`); }
    if (o.upgradeRandom) {
      const c = this.deck[Math.floor(rnd() * this.deck.length)];
      this.upgradeCard(c.uid, o.upgradeRandom);
      log.push(`Руна усилена до ${c.power}`);
    }
    if (o.spell) {
      const s = this.randomSpell(o.spell, rnd);
      if (s && this.spells.length < RULES.maxSpellSlots) { this.spells.push(s); log.push(`Заклинание: ${s.name}`); }
      else if (s) { this.gold += s.price; log.push(`Слоты полны — получено ${s.price} золота`); }
    }
    return log;
  }

  private weightedPick(pool: SpellDef[], rnd: () => number): SpellDef | null {
    if (pool.length === 0) return null;
    const total = pool.reduce((a, s) => a + RARITIES[s.rarity].weight, 0);
    let r = rnd() * total;
    for (const s of pool) {
      r -= RARITIES[s.rarity].weight;
      if (r <= 0) return s;
    }
    return pool[pool.length - 1];
  }
}

export const game = new GameState();
