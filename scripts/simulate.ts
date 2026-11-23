/**
 * Симулятор баланса «Тропы Рун» (Монте-Карло, без Phaser).
 * Импортирует только src/core/* и JSON из src/data/. Повторяет порядок хода BattleScene.playSelected/enemyTurn,
 * Walk (монеты сегмента — route.walkCoins), Shop, Encounter (события/костёр; повторные события подменяет GameState.resolve, как в игре).
 *
 * Запуск:  npm run sim -- --runs 2000 --policy all --seed 1 [--report docs/balance-report.md]
 * Флаги:
 *   --runs N            забегов на политику (по умолчанию 2000)
 *   --policy P[,P2]     random | greedy | smart | smart-nospell | smart-avoid | smart-fight | all (= random,greedy,smart)
 *   --seed S            базовый сид (забег i использует сид S·1e6 + i — одинаковые сиды у всех политик)
 *   --set path=value    временная подмена числа в данных (можно несколько раз; src/data не меняется).
 *                       Путь: <файл>.<ключ|id|индекс>...; элементы массивов можно адресовать по id.
 *                       Примеры: enemies.lich.hp=3000  enemies.wolf.rage.step=12  route.campfire.healPercent=35
 *                                cards.rules.heroMaxHp=100  spells.dragonHeart.price=14  combinations.firestorm.atkPower=30
 *   --ban id1,id2       убрать заклинания из пула (абляция)
 *   --aggr C            вес Атаки в оценке розыгрыша (по умолчанию 0.35 HP героя за 1 урон)
 *   --report FILE       записать markdown-отчёт
 *   --brief             короткий вывод (одна строка на политику)
 */
import cardsJson from '../src/data/cards.json';
import combosJson from '../src/data/combinations.json';
import enemiesJson from '../src/data/enemies.json';
import eventsJson from '../src/data/events.json';
import routeJson from '../src/data/route.json';
import spellsJson from '../src/data/spells.json';
import { GameState } from '../src/core/GameState';
import { BattleDeck } from '../src/core/deck';
import { EnemyState, isDamaging, pickCurseTargets } from '../src/core/enemyAI';
import { scorePlay, type ScoreResult } from '../src/core/scoring';
import { COMBOS, ROUTE_CFG, ROUTE_LAYERS, RULES, SHOP, SPELLS, enemyById, eventById } from '../src/core/data';
import type { Card, EventDef, RouteNode, SpellDef } from '../src/core/types';

declare const process: { argv: string[]; exit(code: number): never };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: { writeFileSync(p: string, s: string): void; readFileSync(p: string, e: string): string } = await import('node:fs' as string);

// ---------------------------------------------------------------- CLI

const argv = process.argv.slice(2);
const sets: string[] = [];
const opt: Record<string, string> = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const next = argv[i + 1];
  const hasVal = next !== undefined && !next.startsWith('--');
  if (k === 'set') { if (hasVal) sets.push(next); i++; continue; }
  opt[k] = hasVal ? next : 'true';
  if (hasVal) i++;
}
const RUNS = Number(opt.runs ?? 2000);
const SEED = Number(opt.seed ?? 1);
const AGGR = Number(opt.aggr ?? 0.35);
const policyArg = opt.policy ?? 'all';
const POLICY_NAMES = policyArg === 'all' ? ['random', 'greedy', 'smart'] : policyArg.split(',');

// ---------------------------------------------------------------- подмена данных (только в памяти)

const DATA: Record<string, unknown> = {
  cards: cardsJson, combinations: combosJson, enemies: enemiesJson, events: eventsJson, route: routeJson, spells: spellsJson,
};

function stepInto(cur: unknown, seg: string): unknown {
  if (Array.isArray(cur)) {
    if (/^\d+$/.test(seg)) return cur[Number(seg)];
    return cur.find((x) => (x as { id?: string })?.id === seg);
  }
  if (cur && typeof cur === 'object') {
    const o = cur as Record<string, unknown>;
    if (seg in o) return o[seg];
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) {
        const f = v.find((x) => (x as { id?: string })?.id === seg);
        if (f) return f;
      }
    }
  }
  return undefined;
}

function applySet(expr: string): void {
  const eq = expr.indexOf('=');
  if (eq < 0) throw new Error(`--set без "=": ${expr}`);
  const path = expr.slice(0, eq).split('.');
  const raw = expr.slice(eq + 1);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = raw; }
  let cur: unknown = DATA[path[0]];
  if (cur === undefined) throw new Error(`Неизвестный файл данных: ${path[0]}`);
  for (let i = 1; i < path.length - 1; i++) {
    cur = stepInto(cur, path[i]);
    if (cur === undefined) throw new Error(`Путь не найден: ${expr} (на «${path[i]}»)`);
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur) && /^\d+$/.test(last)) cur[Number(last)] = value;
  else (cur as Record<string, unknown>)[last] = value;
}
sets.forEach(applySet);
// --ban id1,id2 — убрать заклинания из пула (абляция «насколько забег держится на этом заклинании»).
const BANNED = (opt.ban && opt.ban !== 'true' ? opt.ban : '').split(',').filter(Boolean);
for (const id of BANNED) {
  const arr = spellsJson.spells as { id: string }[];
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`--ban: нет заклинания ${id}`);
  arr.splice(i, 1);
}

// ---------------------------------------------------------------- ГПСЧ

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng: () => number = mulberry32(SEED);
// Вся логика core по умолчанию берёт Math.random — подменяем сидированным ГПСЧ.
Math.random = () => rng();
const rint = (n: number) => Math.floor(rng() * n);

// ---------------------------------------------------------------- статистика

interface BattleRec { enemy: string; layer: number; turns: number; heroDmg: number; won: boolean; hpBefore: number; spells: number; maxHit: number; oneShotKill: boolean }
interface ComboStat { n: number; atk: number; def: number }
interface Stats {
  name: string;
  runs: number;
  wins: number;
  deathLayer: Map<string, number>;
  battles: BattleRec[];
  combos: Map<string, ComboStat>;
  plays: number;
  spellRuns: Map<string, { had: number; wins: number }>;
  spellAtLich: Map<string, { had: number; wins: number }>;
  lichFights: number;
  lichWins: number;
  forks: Map<string, number>;
  nodeVisits: Map<string, number>;
  fightsPerRun: number[];
  winFights: number[];
  eventRepeats: number;
  runsWithRepeat: number;
  winsWithRepeat: number;
  goldAtEnd: number[];
  spellsAtEnd: number[];
  discardsUsed: number;
  battleDeaths: number;
  eventDeaths: number;
  hpAtLich: number[];
}
const newStats = (name: string): Stats => ({
  name, runs: 0, wins: 0, deathLayer: new Map(), battles: [], combos: new Map(), plays: 0, spellRuns: new Map(), spellAtLich: new Map(),
  lichFights: 0, lichWins: 0, forks: new Map(), nodeVisits: new Map(), fightsPerRun: [], winFights: [], eventRepeats: 0,
  runsWithRepeat: 0, winsWithRepeat: 0, goldAtEnd: [], spellsAtEnd: [], discardsUsed: 0, battleDeaths: 0, eventDeaths: 0, hpAtLich: [],
});
const inc = <K>(m: Map<K, number>, k: K, d = 1) => m.set(k, (m.get(k) ?? 0) + d);

// ---------------------------------------------------------------- политики

interface Policy {
  name: string;
  battle: 'random' | 'greedy';
  fork(st: GameState, opts: number[]): number;
  event(st: GameState, ev: EventDef): number;
  campfire(st: GameState): 'rest' | 'temper';
  shop(st: GameState, offers: SpellDef[]): void;
}

const nodeKey = (n: RouteNode) => (n.type === 'campfire' ? 'campfire' : `${n.type}:${n.id}`);

/** Наивный игрок: случайные развилки и варианты событий, у костра отдых, в лавке берёт первое, что по карману. */
const naiveRun = {
  fork: (_st: GameState, opts: number[]) => opts[rint(opts.length)],
  event: (st: GameState, ev: EventDef) => {
    const ok = ev.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.cost || st.gold >= o.cost);
    return ok[rint(ok.length)].i;
  },
  campfire: () => 'rest' as const,
  shop: (st: GameState, offers: SpellDef[]) => {
    for (const s of offers) {
      if (st.spells.length < RULES.maxSpellSlots && st.gold >= s.price) { st.gold -= s.price; st.spells.push(s); }
    }
  },
};

// Приоритет заклинаний для smart (простой и прозрачный; уточнён по вкладу «с/без» из первых прогонов).
const SPELL_PRIO: Record<string, number> = {
  dragonHeart: 10, worldTree: 9, battleHymn: 8, ember: 7, twinMoons: 7, hollowCrown: 6, patientSage: 6,
  bloodPact: 5, stoneSkin: 4, tideWard: 4, sparkle: 3, pilgrimPurse: 3,
};
const prio = (s: SpellDef, st: GameState) => (s.id === 'pilgrimPurse' && st.node < 4 ? 5 : SPELL_PRIO[s.id] ?? 2);

function attackRunes(st: GameState): Card[] {
  return st.deck.filter((c) => (c.element === 'fire' || c.element === 'air') && c.power < RULES.maxRunePower);
}

function smartShop(st: GameState, offers: SpellDef[], allowSpells: boolean): void {
  const pool: (SpellDef | null)[] = [...offers];
  const buyBest = (): boolean => {
    if (!allowSpells) return false;
    let best = -1;
    pool.forEach((s, i) => {
      if (!s || st.gold < s.price || prio(s, st) < 3) return;
      if (best < 0 || prio(s, st) > prio(pool[best]!, st)) best = i;
    });
    if (best < 0) return false;
    const s = pool[best]!;
    if (st.spells.length >= RULES.maxSpellSlots) {
      // Слоты полны — продать худшее, если предложение заметно лучше.
      let wi = 0;
      st.spells.forEach((x, i) => { if (prio(x, st) < prio(st.spells[wi], st)) wi = i; });
      const worst = st.spells[wi];
      if (prio(s, st) < prio(worst, st) + 2 || st.gold + st.sellPrice(worst) < s.price) return false;
      st.gold += st.sellPrice(worst);
      st.spells.splice(wi, 1);
    }
    st.gold -= s.price;
    st.spells.push(s);
    pool[best] = null;
    return true;
  };
  while (buyBest()) { /* покупаем, пока есть что */ }
  // Реролл, если слоты свободны и денег с запасом.
  let guard = 0;
  while (allowSpells && guard++ < 3 && st.spells.length < RULES.maxSpellSlots && st.gold >= st.rerollCost + 6) {
    st.gold -= st.rerollCost;
    st.rerolls++;
    pool.splice(0, pool.length, ...st.rollShop());
    while (buyBest()) { /* */ }
  }
  // Остаток: копим на заклинание, пока есть свободный слот; иначе — удаление слабых рун / улучшение атакующих.
  const reserve = allowSpells && st.spells.length < RULES.maxSpellSlots ? 8 : 0;
  while (st.gold - reserve >= SHOP.removeCost) {
    const weak = st.deck.filter((c) => c.power <= 2).sort((a, b) => a.power - b.power)[0];
    if (weak && st.deck.length > RULES.handSize + 24) { st.gold -= SHOP.removeCost; st.removeCard(weak.uid); continue; }
    const ar = attackRunes(st);
    if (ar.length === 0 || st.gold - reserve < SHOP.upgradeCost) break;
    st.gold -= SHOP.upgradeCost;
    st.upgradeCard(ar[rint(ar.length)].uid, SHOP.upgradeAmount);
  }
}

const DANGER: Record<string, number> = { slime: 12, goblin: 25, wolf: 40, wraith: 45, lich: 999 };
const rareLeft = (st: GameState, r: string) => SPELLS.some((s) => s.rarity === r && !st.spells.some((x) => x.id === s.id));

function smartEvent(st: GameState, ev: EventDef, allowSpells: boolean): number {
  const idx = (pred: (label: string, i: number) => boolean) => ev.options.findIndex((o, i) => pred(o.label, i));
  const can = (i: number) => i >= 0 && (!ev.options[i].cost || st.gold >= ev.options[i].cost!);
  const last = ev.options.length - 1;
  switch (ev.id) {
    case 'tavern': return st.hp <= st.maxHp - 15 && can(0) ? 0 : 1;
    case 'bard': return st.hp < st.maxHp * 0.7 || !can(1) ? 0 : 1;
    case 'altar': return allowSpells && st.hp > 40 && st.spells.length < RULES.maxSpellSlots && rareLeft(st, 'rare') ? 0 : last;
    case 'idol': return allowSpells ? 0 : st.hp > 8 ? 1 : 0;
    default: return idx((_l, i) => can(i));
  }
}

function smartFork(st: GameState, opts: number[], mode: 'smart' | 'avoid' | 'fight', allowSpells: boolean): number {
  const val = (n: RouteNode): number => {
    if (n.type === 'enemy') {
      if (mode === 'avoid') return -100;
      if (mode === 'fight') return 100;
      return st.hp - DANGER[n.id] * 1.3 < 20 ? -5 : 6;
    }
    if (n.type === 'campfire') {
      const v = st.hp < st.maxHp * 0.5 ? 12 : 3;
      return mode === 'fight' ? v - 50 : v;
    }
    let v = 2;
    if (n.id === 'altar') v = allowSpells && st.hp > 40 && st.spells.length < RULES.maxSpellSlots && rareLeft(st, 'rare') ? 8 : 0;
    if (n.id === 'idol') v = allowSpells && st.spells.length < RULES.maxSpellSlots ? 6 : 2;
    if (n.id === 'tavern') v = 3;
    if (n.id === 'bard') v = 3;
    return mode === 'fight' ? v - 50 : v;
  };
  let best = opts[0];
  for (const i of opts) if (val(st.optionNode(i)) > val(st.optionNode(best))) best = i;
  return best;
}

function makeSmart(name: string, mode: 'smart' | 'avoid' | 'fight', allowSpells: boolean): Policy {
  return {
    name, battle: 'greedy',
    fork: (st, opts) => smartFork(st, opts, mode, allowSpells),
    event: (st, ev) => smartEvent(st, ev, allowSpells),
    campfire: (st) => (st.hp < st.maxHp * 0.5 ? 'rest' : 'temper'),
    shop: (st, offers) => smartShop(st, offers, allowSpells),
  };
}

const POLICIES: Record<string, Policy> = {
  random: { name: 'random', battle: 'random', ...naiveRun },
  greedy: { name: 'greedy', battle: 'greedy', ...naiveRun },
  smart: makeSmart('smart', 'smart', true),
  'smart-nospell': makeSmart('smart-nospell', 'smart', false),
  'smart-avoid': makeSmart('smart-avoid', 'avoid', true),
  'smart-fight': makeSmart('smart-fight', 'fight', true),
};

// ---------------------------------------------------------------- бой

const subsetCache = new Map<number, number[][]>();
function subsets(n: number): number[][] {
  let s = subsetCache.get(n);
  if (s) return s;
  s = [];
  for (let m = 1; m < 1 << n; m++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i);
    if (idx.length <= RULES.maxPlay) s.push(idx);
  }
  subsetCache.set(n, s);
  return s;
}

interface Choice { idx: number[]; r: ScoreResult; val: number; lethal: boolean }

function bestPlay(hand: Card[], st: GameState, foe: EnemyState, cursed: Set<number>): Choice {
  const a = foe.intent;
  const per = foe.perHit(a);
  const hits = a.type === 'multi' ? Math.max(1, a.hits ?? 1) : isDamaging(a) ? 1 : 0;
  const incoming = per * hits;
  let best: Choice | null = null;
  for (const idx of subsets(hand.length)) {
    const cards = idx.map((i) => hand[i]);
    const r = scorePlay(cards, hand.length - cards.length, st.spells, cursed);
    const eff = Math.max(0, r.attack - foe.shield);
    const lethal = eff >= foe.hp && st.hp - r.hpLoss > 0;
    let val: number;
    if (lethal) val = 1e7 - r.hpLoss * 10;
    else {
      const taken = Math.max(0, incoming - r.shield) + r.hpLoss;
      val = AGGR * Math.min(eff, foe.hp) - taken;
      if (a.type === 'steal' && incoming > r.shield) val -= Math.min(st.gold, a.gold ?? 0) * 0.5;
      if (taken >= st.hp) val -= 1e6;
    }
    if (!best || val > best.val) best = { idx, r, val, lethal };
  }
  return best!;
}

interface BattleOut { won: boolean; turns: number; heroDmg: number; maxHit: number }

function battle(st: GameState, p: Policy, S: Stats): BattleOut {
  const foe = new EnemyState(st.enemy);
  const deck = new BattleDeck(st.deck);
  let hand: Card[] = deck.draw(st.handSize);
  const cursed = new Set<number>();
  let discards = RULES.discardsPerBattle;
  let heroDmg = 0;
  let maxHit = 0;
  const drawUp = () => { hand = hand.concat(deck.draw(st.handSize - hand.length)); };

  for (let guard = 0; guard < 200; guard++) {
    let play: number[];
    let r: ScoreResult;
    if (p.battle === 'random') {
      const k = 1 + rint(Math.min(RULES.maxPlay, hand.length));
      const pool = hand.map((_, i) => i);
      play = [];
      for (let i = 0; i < k; i++) play.push(pool.splice(rint(pool.length), 1)[0]);
      r = scorePlay(play.map((i) => hand[i]), hand.length - play.length, st.spells, cursed);
    } else {
      let c = bestPlay(hand, st, foe, cursed);
      // Сброс (не тратит ход): если лучший розыгрыш слабый (без созвучия/Резонанс) или в нём проклятые руны.
      while (discards > 0 && !c.lethal && (c.r.combo.id === 'lone' || c.r.combo.id === 'resonance' || c.idx.some((i) => cursed.has(hand[i].uid)))) {
        const keep = new Set(c.idx.filter((i) => !cursed.has(hand[i].uid)));
        const drop = hand.map((card, i) => ({ card, i })).filter(({ i }) => !keep.has(i))
          .sort((x, y) => Number(cursed.has(y.card.uid)) - Number(cursed.has(x.card.uid)) || x.card.power - y.card.power)
          .slice(0, RULES.maxPlay);
        if (drop.length === 0) break;
        discards--;
        S.discardsUsed++;
        const gone = new Set(drop.map((d) => d.card.uid));
        for (const u of gone) cursed.delete(u);
        deck.discard(drop.map((d) => d.card));
        hand = hand.filter((x) => !gone.has(x.uid));
        drawUp();
        c = bestPlay(hand, st, foe, cursed);
      }
      play = c.idx;
      r = c.r;
    }
    // --- playSelected: применение
    const played = play.map((i) => hand[i]);
    S.plays++;
    const cs = S.combos.get(r.combo.id) ?? { n: 0, atk: 0, def: 0 };
    cs.n++; cs.atk += r.attack; cs.def += r.shield;
    S.combos.set(r.combo.id, cs);
    if (r.hpLoss > 0) { heroDmg += -st.heal(-r.hpLoss); }
    const shield = r.shield;
    if (r.attack > 0) foe.takeAttack(r.attack);
    deck.discard(played);
    const playedUids = new Set(played.map((c) => c.uid));
    hand = hand.filter((c) => !playedUids.has(c.uid));
    cursed.clear();
    const turns = foe.turn + 1;
    if (foe.isDead) return { won: true, turns, heroDmg, maxHit };
    if (st.hp <= 0) return { won: false, turns, heroDmg, maxHit };
    // --- enemyTurn
    const res = foe.act(shield, st.gold);
    for (const ev of res.events) {
      if (ev.kind === 'hit' && ev.taken > 0) { heroDmg += ev.taken; st.heal(-ev.taken); }
      if (ev.kind === 'steal' && ev.gold > 0) st.gold = Math.max(0, st.gold - ev.gold);
      if (st.hp <= 0) break;
    }
    maxHit = Math.max(maxHit, res.heroDamage);
    if (st.hp <= 0) return { won: false, turns, heroDmg, maxHit };
    drawUp();
    if (res.curse > 0) for (const u of pickCurseTargets(hand.map((c) => c.uid), cursed, res.curse)) cursed.add(u);
    foe.endTurn();
  }
  st.hp = 0; // страховка от бесконечного боя
  return { won: false, turns: 200, heroDmg, maxHit };
}

// ---------------------------------------------------------------- забег

function runOnce(p: Policy, S: Stats): void {
  const st = new GameState();
  const everSpells = new Set<string>();
  let fights = 0;
  let repeated = false;
  let deathAt: string | null = null;
  const noteSpells = () => st.spells.forEach((s) => everSpells.add(s.id));

  for (let layer = 0; layer < st.routeLength; layer++) {
    // Walk: монеты сегмента (как в WalkScene)
    st.gold += ROUTE_CFG.walkCoins.count * ROUTE_CFG.walkCoins.value;
    if (st.needsChoice) {
      const opts = st.options;
      st.choose(p.fork(st, opts));
      inc(S.forks, `${layer}:${st.choice}`);
    } else st.choose(st.options[0]);
    const node = st.current; // уже с подменой повторного события (как в игре)
    const raw = ROUTE_LAYERS[layer][st.choice];
    if (raw.type === 'event' && (node.type !== 'event' || node.id !== raw.id)) { repeated = true; S.eventRepeats++; }
    inc(S.nodeVisits, `${layer}:${nodeKey(node)}`);

    if (node.type === 'enemy') {
      fights++;
      const def = enemyById(node.id);
      const hpBefore = st.hp;
      if (def.boss) {
        S.lichFights++;
        S.hpAtLich.push(st.hp);
        st.spells.forEach((s) => {
          const e = S.spellAtLich.get(s.id) ?? { had: 0, wins: 0 };
          e.had++;
          S.spellAtLich.set(s.id, e);
        });
      }
      const spellsNow = st.spells.map((s) => s.id);
      const out = battle(st, p, S);
      S.battles.push({ enemy: def.id, layer, turns: out.turns, heroDmg: out.heroDmg, won: out.won, hpBefore, spells: spellsNow.length, maxHit: out.maxHit, oneShotKill: out.won && out.turns === 1 });
      if (!out.won) { deathAt = `${layer}:${def.id}`; S.battleDeaths++; break; }
      if (def.boss) {
        S.lichWins++;
        spellsNow.forEach((id) => { S.spellAtLich.get(id)!.wins++; });
      }
      st.applyVictory();
      if (!st.isLastNode) { st.rerolls = 0; p.shop(st, st.rollShop()); noteSpells(); }
    } else if (node.type === 'event') {
      const ev = eventById(node.id);
      const o = ev.options[p.event(st, ev)];
      if (o.cost) st.gold -= o.cost;
      const success = o.chance === undefined || Math.random() < o.chance;
      st.applyOutcome(success ? o.result : o.fail ?? {});
      noteSpells();
      if (st.hp <= 0) { deathAt = `${layer}:event:${ev.id}`; S.eventDeaths++; break; }
    } else {
      if (p.campfire(st) === 'rest') st.heal(Math.round((st.maxHp * ROUTE_CFG.campfire.healPercent) / 100));
      else {
        const ar = attackRunes(st);
        const c = ar.length ? ar.reduce((a, b) => (b.power < a.power ? b : a)) : st.deck[0];
        st.upgradeCard(c.uid, ROUTE_CFG.campfire.upgradeAmount);
      }
    }
    if (!st.isLastNode) st.advance();
  }

  S.runs++;
  const won = deathAt === null;
  if (won) { S.wins++; S.winFights.push(fights); } else inc(S.deathLayer, deathAt!);
  S.fightsPerRun.push(fights);
  if (repeated) { S.runsWithRepeat++; if (won) S.winsWithRepeat++; }
  S.goldAtEnd.push(st.gold);
  S.spellsAtEnd.push(st.spells.length);
  for (const id of everSpells) {
    const e = S.spellRuns.get(id) ?? { had: 0, wins: 0 };
    e.had++;
    if (won) e.wins++;
    S.spellRuns.set(id, e);
  }
}

// ---------------------------------------------------------------- анализ маршрута

/**
 * Правило графа (см. route.json/_doc): на любом пути в любых двух подряд идущих слоях, начиная со слоя 1, есть бой
 * (≥ 1 боя на каждые 2 слоя, нет двух костров подряд), каждая точка достижима. Полный перебор путей.
 */
function routeRuleViolations(): string[] {
  const L = ROUTE_LAYERS;
  const bad: string[] = [];
  const nextOf = (li: number, ni: number): number[] => {
    const n = L[li][ni].next?.filter((i) => i >= 0 && i < (L[li + 1]?.length ?? 0)) ?? [];
    return n.length || li === L.length - 1 ? n : L[li + 1].map((_, i) => i);
  };
  const reached = L.map((l) => l.map(() => false));
  const walk = (li: number, ni: number, path: number[]): void => {
    reached[li][ni] = true;
    const p = [...path, ni];
    if (li === L.length - 1) {
      const nodes = p.map((n, i) => L[i][n]);
      const last = nodes[nodes.length - 1];
      if (last.type !== 'enemy' || !enemyById(last.id).boss) bad.push(`путь ${p.join('-')}: финал не босс`);
      for (let i = 1; i + 1 < nodes.length; i++) {
        if (nodes[i].type !== 'enemy' && nodes[i + 1].type !== 'enemy') bad.push(`путь ${p.join('-')}: слои ${i}–${i + 1} без боя`);
        if (nodes[i].type === 'campfire' && nodes[i + 1].type === 'campfire') bad.push(`путь ${p.join('-')}: два костра подряд (${i}–${i + 1})`);
      }
      return;
    }
    for (const j of nextOf(li, ni)) walk(li + 1, j, p);
  };
  L[0].forEach((_, ni) => walk(0, ni, []));
  reached.forEach((l, li) => l.forEach((r, ni) => { if (!r) bad.push(`точка ${li}:${ni} недостижима`); }));
  return bad;
}

function routeAnalysis(): { minFights: number; maxFights: number; paths: number; minPath: string } {
  // DP по слоям: для каждой точки — мин/макс боёв до финала.
  const L = ROUTE_LAYERS;
  const minF: number[][] = L.map((l) => l.map(() => Infinity));
  const maxF: number[][] = L.map((l) => l.map(() => -Infinity));
  const cnt: number[][] = L.map((l) => l.map(() => 0));
  const nextOf = (li: number, ni: number): number[] => {
    if (li === L.length - 1) return [];
    const n = L[li][ni].next?.filter((i) => i >= 0 && i < L[li + 1].length) ?? [];
    return n.length ? n : L[li + 1].map((_, i) => i);
  };
  for (let li = L.length - 1; li >= 0; li--) {
    L[li].forEach((node, ni) => {
      const own = node.type === 'enemy' ? 1 : 0;
      const nx = nextOf(li, ni);
      if (nx.length === 0) { minF[li][ni] = own; maxF[li][ni] = own; cnt[li][ni] = 1; return; }
      minF[li][ni] = own + Math.min(...nx.map((j) => minF[li + 1][j]));
      maxF[li][ni] = own + Math.max(...nx.map((j) => maxF[li + 1][j]));
      cnt[li][ni] = nx.reduce((s, j) => s + cnt[li + 1][j], 0);
    });
  }
  // Восстановить один путь с минимумом боёв
  let ni = minF[0].indexOf(Math.min(...minF[0]));
  const path: string[] = [];
  for (let li = 0; li < L.length; li++) {
    path.push(nodeKey(L[li][ni]).replace('enemy:', '⚔').replace('event:', '').replace('campfire', 'костёр'));
    const nx = nextOf(li, ni);
    if (!nx.length) break;
    ni = nx.reduce((b, j) => (minF[li + 1][j] < minF[li + 1][b] ? j : b), nx[0]);
  }
  return { minFights: Math.min(...minF[0]), maxFights: Math.max(...maxF[0]), paths: cnt[0].reduce((a, b) => a + b, 0), minPath: path.join(' → ') };
}

// ---------------------------------------------------------------- отчёт

const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : '—');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const ENEMY_ORDER = ['slime', 'goblin', 'wolf', 'wraith', 'lich'];

function enemyTable(S: Stats): string[] {
  const rows = ['| Враг | Боёв | Ходов ср. | Ходов мед. | p90 | Урон по герою ср. | HP героя до боя | Смертей (доля боёв) | Бои > 12 ходов | Ваншот врага (1 ход) | Макс. удар за действие | Закл. в слотах |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const id of ENEMY_ORDER) {
    const b = S.battles.filter((x) => x.enemy === id);
    if (!b.length) continue;
    const t = b.map((x) => x.turns).sort((a, c) => a - c);
    rows.push(`| ${enemyById(id).name} | ${b.length} | ${f1(mean(t))} | ${median(t)} | ${t[Math.floor(t.length * 0.9)]} | ${f1(mean(b.map((x) => x.heroDmg)))} | ${f1(mean(b.map((x) => x.hpBefore)))} | ${pct(b.filter((x) => !x.won).length, b.length)} | ${pct(b.filter((x) => x.turns > 12).length, b.length)} | ${pct(b.filter((x) => x.oneShotKill).length, b.length)} | ${Math.max(...b.map((x) => x.maxHit))} | ${f1(mean(b.map((x) => x.spells)))} |`);
  }
  return rows;
}

function deathHist(S: Stats): string[] {
  const rows = ['| Слой | Где | Смертей | Доля забегов | |', '|---|---|---|---|---|'];
  const keys = [...S.deathLayer.keys()].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  for (const k of keys) {
    const n = S.deathLayer.get(k)!;
    const [layer, ...rest] = k.split(':');
    rows.push(`| ${Number(layer) + 1} | ${rest.join(':')} | ${n} | ${pct(n, S.runs)} | ${'█'.repeat(Math.max(1, Math.round((40 * n) / S.runs)))} |`);
  }
  return rows;
}

function comboTable(S: Stats): string[] {
  const rows = ['| Комбинация | Доля розыгрышей | Атака ср. | Щит ср. |', '|---|---|---|---|'];
  for (const c of COMBOS) {
    const s = S.combos.get(c.id);
    rows.push(`| ${c.name} | ${s ? pct(s.n, S.plays) : '0%'} | ${s ? f1(s.atk / s.n) : '—'} | ${s ? f1(s.def / s.n) : '—'} |`);
  }
  return rows;
}

function spellTable(S: Stats): string[] {
  const rows = ['| Заклинание | Редкость | Забегов с ним | Винрейт с | Винрейт без | Δ | У Лича: боёв с ним | Победа над Личем с | без |', '|---|---|---|---|---|---|---|---|---|'];
  const base = S.wins;
  for (const s of SPELLS) {
    const e = S.spellRuns.get(s.id) ?? { had: 0, wins: 0 };
    const withR = e.had ? e.wins / e.had : NaN;
    const woR = S.runs - e.had ? (base - e.wins) / (S.runs - e.had) : NaN;
    const l = S.spellAtLich.get(s.id) ?? { had: 0, wins: 0 };
    const lw = l.had ? l.wins / l.had : NaN;
    const lwo = S.lichFights - l.had ? (S.lichWins - l.wins) / (S.lichFights - l.had) : NaN;
    const d = (withR - woR) * 100;
    rows.push(`| ${s.name} | ${s.rarity} | ${e.had} | ${Number.isFinite(withR) ? (100 * withR).toFixed(1) + '%' : '—'} | ${Number.isFinite(woR) ? (100 * woR).toFixed(1) + '%' : '—'} | ${Number.isFinite(d) ? (d >= 0 ? '+' : '') + d.toFixed(1) : '—'} | ${l.had} | ${Number.isFinite(lw) ? (100 * lw).toFixed(1) + '%' : '—'} | ${Number.isFinite(lwo) ? (100 * lwo).toFixed(1) + '%' : '—'} |`);
  }
  return rows;
}

function forkTable(S: Stats): string[] {
  const rows = ['| Слой | Варианты (доля выбора на развилке) |', '|---|---|'];
  ROUTE_LAYERS.forEach((layer, li) => {
    const tot = layer.reduce((s, _n, i) => s + (S.nodeVisits.get(`${li}:${nodeKey(layer[i])}`) ?? 0), 0);
    // nodeVisits объединяет одинаковые типы в слое — показываем по индексам через forks + без развилки
    const parts = layer.map((n, i) => {
      const v = (S.forks.get(`${li}:${i}`) ?? 0);
      return `${nodeKey(n).replace('enemy:', '⚔ ').replace('event:', '✦ ').replace('campfire', '🔥')}: ${v}`;
    });
    const forkTot = layer.reduce((s, _n, i) => s + (S.forks.get(`${li}:${i}`) ?? 0), 0);
    rows.push(`| ${li + 1} | ${forkTot ? parts.map((p, i) => `${p.split(': ')[0]} ${pct(S.forks.get(`${li}:${i}`) ?? 0, forkTot)}`).join(' · ') : `без развилки (${tot} визитов)`} |`);
  });
  return rows;
}

function summaryRow(S: Stats): string {
  const t = (id: string) => f1(mean(S.battles.filter((b) => b.enemy === id).map((b) => b.turns)));
  return `| ${S.name} | ${pct(S.wins, S.runs)} | ${f1(mean(S.fightsPerRun))} | ${t('slime')} | ${t('goblin')} | ${t('wolf')} | ${t('wraith')} | ${t('lich')} | ${pct(S.lichFights, S.runs)} | ${pct(S.lichWins, S.lichFights)} | ${f1(mean(S.spellsAtEnd))} |`;
}
const SUMMARY_HEAD = ['| Политика | Винрейт | Боёв за забег | Слизень ход. | Гоблин | Волк | Призрак | Лич | Дошли до Лича | Победа над Личем | Закл. в конце |', '|---|---|---|---|---|---|---|---|---|---|---|'];

// ---------------------------------------------------------------- main

const results: Stats[] = [];
const t0 = Date.now();
for (const pn of POLICY_NAMES) {
  const p = POLICIES[pn];
  if (!p) { console.error(`Неизвестная политика ${pn}. Есть: ${Object.keys(POLICIES).join(', ')}`); process.exit(1); }
  const S = newStats(pn);
  for (let i = 0; i < RUNS; i++) {
    rng = mulberry32(SEED * 1_000_003 + i * 7919);
    runOnce(p, S);
  }
  results.push(S);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const route = routeAnalysis();
const routeBad = routeRuleViolations();
if (routeBad.length) console.warn(`ВНИМАНИЕ: правило графа route.json нарушено (${routeBad.length}):\n  ${routeBad.slice(0, 10).join('\n  ')}`);

if (opt.brief === 'true') {
  for (const S of results) {
    const t = (id: string) => f1(mean(S.battles.filter((b) => b.enemy === id).map((b) => b.turns)));
    const d = (id: string) => { const b = S.battles.filter((x) => x.enemy === id); return pct(b.filter((x) => !x.won).length, b.length); };
    console.log(`${S.name.padEnd(14)} win ${pct(S.wins, S.runs).padStart(6)} | turns sl ${t('slime')} gob ${t('goblin')} wolf ${t('wolf')} wr ${t('wraith')} lich ${t('lich')} | death% sl ${d('slime')} gob ${d('goblin')} wolf ${d('wolf')} wr ${d('wraith')} lich ${d('lich')} | reachLich ${pct(S.lichFights, S.runs)} fights ${f1(mean(S.fightsPerRun))} spells@wolf ${f1(mean(S.battles.filter((b) => b.enemy === 'wolf').map((b) => b.spells)))} @lich ${f1(mean(S.battles.filter((b) => b.enemy === 'lich').map((b) => b.spells)))} dmg@lich ${f1(mean(S.battles.filter((b) => b.enemy === 'lich').map((b) => b.heroDmg)))}`);
  }
  if (sets.length || BANNED.length) console.log(`  --set ${sets.join(' ')} ${BANNED.length ? '--ban ' + BANNED.join(',') : ''}`);
} else {
  const lines: string[] = [];
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
  lines.push(`# Отчёт по балансу — «Тропа Рун» v${pkg.version}`, '');
  lines.push(`Дата: ${new Date().toISOString().slice(0, 10)} · забегов на политику: ${RUNS} · сид: ${SEED} · aggr: ${AGGR}${sets.length ? ` · подмены: \`${sets.join(' ')}\`` : ''}${BANNED.length ? ` · без заклинаний: ${BANNED.join(', ')}` : ''} · время: ${elapsed} с`, '');
  lines.push('Сгенерировано `npm run sim -- --runs ' + RUNS + ' --policy ' + policyArg + ' --seed ' + SEED + ' --report docs/balance-report.md`. Логика — `src/core/*`, данные — `src/data/*` (без Phaser).', '');
  lines.push('## 1. Сводка', '', ...SUMMARY_HEAD, ...results.map(summaryRow), '');
  lines.push(`Маршрут: ${route.paths} путей; боёв на пути — от **${route.minFights}** до ${route.maxFights} (включая Лича). Путь с минимумом боёв: ${route.minPath}. Правило графа (бой в любых 2 слоях подряд, без двух костров подряд): ${routeBad.length ? `**нарушено ${routeBad.length}×**` : 'соблюдено на всех путях'}.`, '');
  for (const S of results) {
    lines.push(`## Политика \`${S.name}\``, '');
    lines.push(`Винрейт **${pct(S.wins, S.runs)}** · боёв за забег ${f1(mean(S.fightsPerRun))} (у победителей ${f1(mean(S.winFights))}) · смертей в бою ${S.battleDeaths}, на событиях ${S.eventDeaths} · сбросов на бой ${f1(S.discardsUsed / Math.max(1, S.battles.length))} · HP перед Личем ${f1(mean(S.hpAtLich))} · подмены повторных событий: ${pct(S.runsWithRepeat, S.runs)} забегов (винрейт в них ${pct(S.winsWithRepeat, S.runsWithRepeat)}).`, '');
    lines.push('### Где умирают', '', ...deathHist(S), '');
    lines.push('### Враги', '', ...enemyTable(S), '');
    lines.push('### Комбинации', '', ...comboTable(S), '');
    lines.push('### Заклинания (вклад: винрейт с/без; «у Лича» — заклинание было в слотах на бою с Личем)', '', ...spellTable(S), '');
    lines.push('### Развилки', '', ...forkTable(S), '');
  }
  const md = lines.join('\n') + '\n';
  if (opt.report && opt.report !== 'true') { fs.writeFileSync(opt.report, md); console.log(`Отчёт: ${opt.report} (${elapsed} с)`); }
  else console.log(md);
}
