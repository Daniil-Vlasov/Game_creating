import { ENEMY_PACING, STR } from './data';
import { fmt } from './format';
import type { EnemyAction, EnemyActions, EnemyActionType, EnemyDef, RageDef } from './types';

/**
 * ИИ врага: намерения, Щит, ярость, фазы босса. Чистая логика без Phaser.
 * Семантика — docs/balance.md (раздел 1 «Порядок хода» и 2 «Схема действий»).
 *
 * Порядок использования в бою:
 *   1. `intent` / `describeIntent()` — показать намерение до хода игрока;
 *   2. `takeAttack(attack)` — Атака игрока (сначала Щит врага, потом HP);
 *   3. если враг жив — `act(heroShield, heroGold)` → события для анимации;
 *   4. добор руки; если `act` вернул `curse > 0` — `pickCurseTargets(...)`;
 *   5. `endTurn()` — проверка фазы (+ onEnter) и выбор следующего намерения.
 */

/** Событие действия врага — в порядке, в котором его надо анимировать. */
export type EnemyEvent =
  | { kind: 'shieldExpired'; amount: number }
  | { kind: 'rage'; added: number; total: number }
  | { kind: 'hit'; index: number; damage: number; blocked: number; taken: number }
  | { kind: 'block'; shield: number }
  | { kind: 'buff'; value: number; total: number }
  | { kind: 'heal'; amount: number; hp: number }
  | { kind: 'steal'; gold: number }
  | { kind: 'stealFailed' }
  | { kind: 'curse'; count: number };

export interface ActResult {
  action: EnemyAction;
  events: EnemyEvent[];
  /** Суммарный урон по HP героя (после Щита). */
  heroDamage: number;
  /** Щит героя, оставшийся после ударов (затем он всё равно сгорает). */
  shieldLeft: number;
  /** Сколько золота украдено (уже ограничено золотом героя). */
  goldStolen: number;
  /** Сколько рун проклясть после добора (0 — нет проклятия). */
  curse: number;
}

export interface AttackResult {
  /** Сколько Атаки поглотил Щит врага. */
  absorbed: number;
  /** Урон по HP врага. */
  damage: number;
  /** Атака пробила Щит врага (Щит был и обнулился, остаток прошёл в HP). */
  broke: boolean;
}

export interface PhaseEvent {
  index: number;
  title: string;
  onEnter?: EnemyAction;
  /** События onEnter (buff/heal/block), применённые мгновенно. */
  events: EnemyEvent[];
}

export interface IntentView {
  type: EnemyActionType;
  /** Короткая метка рядом с иконкой: «45», «3×38», «2 · 40», «30 · 3». */
  label: string;
  /** Подсказка из strings.json → intents.<type>.hint. */
  hint: string;
  name: string;
  /** Урон одного удара с учётом buff и ярости на момент удара (0 — не атакующее). */
  perHit: number;
  hits: number;
}

const DAMAGING: ReadonlySet<EnemyActionType> = new Set(['attack', 'heavy', 'multi', 'curse', 'steal']);

export const isDamaging = (a: EnemyAction): boolean => DAMAGING.has(a.type) && (a.value ?? 0) > 0;

export class EnemyState {
  readonly def: EnemyDef;
  readonly maxHp: number;
  hp: number;
  /** Щит врага (поглощает Атаку игрока на следующем розыгрыше). */
  shield = 0;
  /** Постоянная прибавка к каждому удару (buff, onEnter). */
  buff = 0;
  /** Накопленная ярость (прибавляется к каждому удару). */
  rage = 0;
  /** Число выполненных действий = номер последнего розыгрыша игрока. */
  turn = 0;
  /** Индекс активной фазы (только у боссов с phases). */
  phase = 0;
  intent!: EnemyAction;
  intentIndex = -1;
  private cursor = 0;
  private readonly rageDef: RageDef;
  private readonly rnd: () => number;

  constructor(def: EnemyDef, rnd: () => number = Math.random) {
    this.def = def;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.rnd = rnd;
    this.rageDef = def.rage ?? ENEMY_PACING.default;
    this.pickNext();
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get phaseTitle(): string | null {
    return this.def.phases?.[this.phase]?.title ?? null;
  }

  /** Текущий список действий (фаза босса или actions; запасной вариант — старое поле attack). */
  get actions(): EnemyActions {
    if (this.def.phases && this.def.phases.length > 0) return this.def.phases[this.phase].actions;
    if (this.def.actions && this.def.actions.list.length > 0) return this.def.actions;
    const [lo, hi] = this.def.attack ?? [10, 10];
    return { mode: 'cycle', list: [{ type: 'attack', value: Math.round((lo + hi) / 2) }] };
  }

  get rageFrom(): number {
    return this.rageDef.from;
  }

  get rageStep(): number {
    return this.rageDef.step;
  }

  /** Ярость, которая будет в момент следующего действия (для показа намерения). */
  get projectedRage(): number {
    return this.rage + (this.turn + 1 >= this.rageDef.from ? this.rageDef.step : 0);
  }

  /** Урон одного удара действия a в момент следующего действия врага. */
  perHit(a: EnemyAction = this.intent): number {
    if (!isDamaging(a)) return 0;
    return (a.value ?? 0) + this.buff + this.projectedRage;
  }

  describeIntent(): IntentView {
    const a = this.intent;
    const s = (STR.intents as Record<string, { name: string; hint: string }>)[a.type] ?? { name: a.type, hint: '' };
    const per = this.perHit(a);
    const hits = a.type === 'multi' ? Math.max(1, a.hits ?? 1) : isDamaging(a) ? 1 : 0;
    let label: string;
    let v: number = per;
    switch (a.type) {
      case 'attack':
      case 'heavy':
        label = String(per);
        break;
      case 'multi':
        label = `${hits}×${per}`;
        break;
      case 'curse':
        label = per > 0 ? `${a.count ?? 1} · ${per}` : String(a.count ?? 1);
        break;
      case 'steal':
        label = `${per} · ${a.gold ?? 0}`;
        break;
      default:
        v = a.value ?? 0;
        label = String(v);
    }
    const hint = fmt(s.hint, { v, n: a.type === 'multi' ? hits : a.count ?? 0, g: a.gold ?? 0 });
    return { type: a.type, label, hint, name: s.name, perHit: per, hits };
  }

  /** Атака игрока: сначала Щит врага, остаток — по HP. */
  takeAttack(attack: number): AttackResult {
    const had = this.shield;
    const absorbed = Math.min(this.shield, Math.max(0, attack));
    this.shield -= absorbed;
    const damage = Math.max(0, attack - absorbed);
    this.hp = Math.max(0, this.hp - damage);
    return { absorbed, damage, broke: had > 0 && this.shield === 0 && damage > 0 };
  }

  /**
   * Действие врага после розыгрыша игрока. Щит героя поглощает удары по очереди.
   * Не меняет состояние героя — только описывает, что с ним случилось.
   */
  act(heroShield: number, heroGold: number): ActResult {
    const events: EnemyEvent[] = [];
    this.turn++;
    if (this.shield > 0) {
      events.push({ kind: 'shieldExpired', amount: this.shield });
      this.shield = 0;
    }
    if (this.turn >= this.rageDef.from && this.rageDef.step > 0) {
      this.rage += this.rageDef.step;
      events.push({ kind: 'rage', added: this.rageDef.step, total: this.rage });
    }
    const a = this.intent;
    let shield = Math.max(0, heroShield);
    let heroDamage = 0;
    let goldStolen = 0;
    let curse = 0;
    const strike = (index: number): number => {
      const damage = (a.value ?? 0) + this.buff + this.rage;
      const blocked = Math.min(shield, damage);
      shield -= blocked;
      const taken = damage - blocked;
      heroDamage += taken;
      events.push({ kind: 'hit', index, damage, blocked, taken });
      return taken;
    };

    switch (a.type) {
      case 'attack':
      case 'heavy':
        strike(0);
        break;
      case 'multi':
        for (let i = 0; i < Math.max(1, a.hits ?? 1); i++) strike(i);
        break;
      case 'curse':
        if ((a.value ?? 0) > 0) strike(0);
        curse = Math.max(0, a.count ?? 0);
        if (curse > 0) events.push({ kind: 'curse', count: curse });
        break;
      case 'steal': {
        const taken = strike(0);
        if (taken > 0) {
          goldStolen = Math.min(Math.max(0, heroGold), a.gold ?? 0);
          events.push({ kind: 'steal', gold: goldStolen });
        } else events.push({ kind: 'stealFailed' });
        break;
      }
      default:
        events.push(...this.applyInstant(a));
    }
    return { action: a, events, heroDamage, shieldLeft: shield, goldStolen, curse };
  }

  /** Мгновенные действия без урона: block / buff / heal (также onEnter фазы). */
  private applyInstant(a: EnemyAction): EnemyEvent[] {
    const v = Math.max(0, a.value ?? 0);
    switch (a.type) {
      case 'block':
        this.shield = v;
        return [{ kind: 'block', shield: v }];
      case 'buff':
        this.buff += v;
        return [{ kind: 'buff', value: v, total: this.buff }];
      case 'heal': {
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + v);
        return [{ kind: 'heal', amount: this.hp - before, hp: this.hp }];
      }
      default:
        return [];
    }
  }

  /** Шаг 6: проверка фазы (только вперёд, с onEnter) и выбор следующего намерения. */
  endTurn(): PhaseEvent | null {
    const ev = this.checkPhase();
    this.pickNext();
    return ev;
  }

  private checkPhase(): PhaseEvent | null {
    const phases = this.def.phases;
    if (!phases || phases.length < 2) return null;
    const ratio = this.hp / this.maxHp;
    // Активна фаза с наименьшим from, для которого ratio ≤ from.
    let target = this.phase;
    let best = Infinity;
    phases.forEach((p, i) => {
      if (ratio <= p.from && p.from < best) { best = p.from; target = i; }
    });
    if (target <= this.phase) return null;
    const events: EnemyEvent[] = [];
    // Пропущенные фазы тоже «входят» — их onEnter применяется по порядку.
    for (let i = this.phase + 1; i <= target; i++) {
      const on = phases[i].onEnter;
      if (on) events.push(...this.applyInstant(on));
    }
    this.phase = target;
    this.cursor = 0;
    this.intentIndex = -1;
    const p = phases[target];
    return { index: target, title: p.title, onEnter: p.onEnter, events };
  }

  private pickNext(): void {
    const { mode, list } = this.actions;
    let idx: number;
    if (mode === 'weighted' && list.length > 1) {
      const pool = list.map((a, i) => ({ i, w: Math.max(0, a.weight ?? 1) })).filter((x) => x.i !== this.intentIndex && x.w > 0);
      const total = pool.reduce((s, x) => s + x.w, 0);
      let r = this.rnd() * total;
      idx = pool[pool.length - 1]?.i ?? 0;
      for (const x of pool) {
        r -= x.w;
        if (r < 0) { idx = x.i; break; }
      }
    } else {
      idx = this.cursor % list.length;
      this.cursor = (this.cursor + 1) % list.length;
    }
    this.intentIndex = idx;
    this.intent = list[idx];
  }
}

/** Выбирает count случайных непроклятых рун руки (uid). */
export function pickCurseTargets(
  handUids: number[],
  cursed: ReadonlySet<number>,
  count: number,
  rnd: () => number = Math.random,
): number[] {
  const pool = handUids.filter((u) => !cursed.has(u));
  const out: number[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return out;
}
