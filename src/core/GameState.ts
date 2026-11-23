import { ENEMIES, EVENTS, RARITIES, ROUTE_LAYERS, RULES, SHOP, SPELLS, enemyById } from './data';
import { createDeck } from './deck';
import type { Card, EnemyDef, EventOutcome, Rarity, RouteNode, SpellDef } from './types';

/** Состояние забега (без Phaser-зависимостей). */
export class GameState {
  hp = RULES.heroMaxHp;
  maxHp = RULES.heroMaxHp;
  gold = RULES.startGold;
  /** Слой маршрута-графа (глубина), к которому идём / на котором стоим. */
  node = 0;
  /** Индекс выбранной точки в слое node (−1 — ещё не выбрана на развилке). */
  choice = -1;
  /** Индекс точки, пройденной в предыдущем слое (−1 — нет, доступен весь слой). */
  prevChoice = -1;
  deck: Card[] = createDeck();
  spells: SpellDef[] = [];
  rerolls = 0;
  /** id событий, уже пройденных в этом забеге (каждое событие — не чаще раза за забег). */
  visitedEvents: string[] = [];
  /** Сид забега для детерминированной подмены повторных событий (новый при reset()). */
  runSeed = Math.floor(Math.random() * 0x7fffffff);

  reset(): void {
    Object.assign(this, new GameState());
  }

  /** Число слоёв маршрута. */
  get routeLength(): number {
    return ROUTE_LAYERS.length;
  }

  private get layer(): RouteNode[] {
    return ROUTE_LAYERS[Math.min(this.node, ROUTE_LAYERS.length - 1)];
  }

  /** Индексы точек текущего слоя, доступные с пройденной точки. */
  get options(): number[] {
    const layer = this.layer;
    const prev = this.node > 0 && this.prevChoice >= 0 ? ROUTE_LAYERS[this.node - 1]?.[this.prevChoice] : undefined;
    const idx = prev?.next?.filter((i) => i >= 0 && i < layer.length) ?? [];
    return idx.length > 0 ? idx : layer.map((_, i) => i);
  }

  /** Точка i текущего слоя — уже с подменой повторного события (её и показывать на развилке). */
  optionNode(i: number): RouteNode {
    return this.resolve(this.layer[i] ?? this.layer[0], i);
  }

  /**
   * Событие не чаще одного раза за забег: уже посещённое событие подменяется ещё не посещённым из events.json
   * (выбор детерминирован от сида забега, слоя, индекса точки и списка посещённых), а если все посещены — костром.
   */
  resolve(n: RouteNode, slot: number): RouteNode {
    if (n.type !== 'event' || !this.visitedEvents.includes(n.id)) return n;
    const fresh = EVENTS.filter((e) => !this.visitedEvents.includes(e.id));
    if (fresh.length === 0) return { type: 'campfire', next: n.next };
    const h = hashStr(`${this.runSeed}:${this.node}:${slot}:${this.visitedEvents.join(',')}`);
    return { type: 'event', id: fresh[h % fresh.length].id, next: n.next };
  }

  /** Нужно ли выбирать путь на развилке перед текущим слоем. */
  get needsChoice(): boolean {
    return this.choice < 0 && this.options.length > 1;
  }

  choose(i: number): void {
    this.choice = i;
  }

  get current(): RouteNode {
    const i = this.choice >= 0 ? this.choice : this.options[0];
    return this.optionNode(i);
  }

  get isLastNode(): boolean {
    return this.node >= ROUTE_LAYERS.length - 1;
  }

  /** 0 = лайт-фэнтези, 1 = дарк-фэнтези; плавно растёт с глубиной маршрута (можно дробный индекс слоя). */
  darknessAt(progress: number): number {
    return Math.max(0, Math.min(1, progress / (ROUTE_LAYERS.length - 1)));
  }

  get darkness(): number {
    return this.darknessAt(this.node);
  }

  enemyOf(n: RouteNode): EnemyDef {
    return n.type === 'enemy' ? enemyById(n.id) : ENEMIES[0];
  }

  get enemy(): EnemyDef {
    return this.enemyOf(this.current);
  }

  get handSize(): number {
    let size = RULES.handSize;
    for (const s of this.spells) if (s.penalty?.type === 'handSizeMinus') size -= s.penalty.value;
    return Math.max(3, size);
  }

  advance(): void {
    const cur = this.current;
    if (cur.type === 'event' && !this.visitedEvents.includes(cur.id)) this.visitedEvents.push(cur.id);
    this.prevChoice = this.choice >= 0 ? this.choice : this.options[0];
    this.choice = -1;
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

/** FNV-1a: стабильный хэш строки (детерминированный выбор без побочного расхода ГПСЧ). */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const game = new GameState();
