export type ElementId = 'fire' | 'air' | 'earth' | 'water';
export type Affinity = 'attack' | 'defense';
export type Target = 'atk' | 'def' | 'both';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';

export interface Card {
  uid: number;
  element: ElementId;
  power: number;
}

export type Requirement =
  | { type: 'any' }
  | { type: 'sameElement'; count: number }
  | { type: 'sequence'; count: number }
  | { type: 'allElements' }
  | { type: 'elementPair'; a: ElementId; b: ElementId; count: number };

export interface ComboDef {
  id: string;
  name: string;
  desc: string;
  requirement: Requirement;
  atkPower: number;
  atkMult: number;
  defPower: number;
  defMult: number;
}

export type SpellEffect =
  | { type: 'addPower'; target: Target; value: number }
  | { type: 'addMult'; target: Target; value: number }
  | { type: 'mulMult'; target: Target; value: number }
  | { type: 'elementPower'; element: ElementId; target: Target; value: number }
  | { type: 'elementMult'; element: ElementId; target: Target; value: number }
  | { type: 'comboMult'; combos: string[]; target: Target; value: number }
  | { type: 'handLeftMult'; target: Target; value: number }
  | { type: 'lowCardMult'; maxCards: number; target: Target; value: number }
  | { type: 'goldOnWin'; value: number }
  | { type: 'healOnWin'; value: number };

export type SpellPenalty =
  | { type: 'hpLossPerPlay'; value: number }
  | { type: 'handSizeMinus'; value: number }
  | { type: 'goldLossOnWin'; value: number };

export interface SpellDef {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  icon: string;
  desc: string;
  effect: SpellEffect;
  penalty?: SpellPenalty;
}

export type EnemyActionType = 'attack' | 'heavy' | 'block' | 'curse' | 'buff' | 'heal' | 'steal' | 'multi';

/** Действие врага (схема — docs/balance.md). Поля зависят от type. */
export interface EnemyAction {
  type: EnemyActionType;
  /** Урон одного удара (attack/heavy/multi/curse/steal) или величина (block/buff/heal). */
  value?: number;
  /** curse — сколько рун проклясть. */
  count?: number;
  /** steal — сколько золота украсть. */
  gold?: number;
  /** multi — число ударов. */
  hits?: number;
  /** weighted — вес выбора. */
  weight?: number;
}

export interface EnemyActions {
  mode: 'cycle' | 'weighted';
  list: EnemyAction[];
}

export interface EnemyPhase {
  /** Доля HP, при которой (и ниже) фаза включается. */
  from: number;
  title: string;
  onEnter?: EnemyAction;
  actions: EnemyActions;
}

export interface RageDef {
  from: number;
  step: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  trait?: string;
  hp: number;
  /** Устарело: [min,max] урона, только для совместимости. */
  attack?: [number, number];
  reward: number;
  sprite: string;
  boss: boolean;
  rage?: RageDef;
  actions?: EnemyActions;
  phases?: EnemyPhase[];
}

export type RouteNodeBase =
  | { type: 'enemy'; id: string }
  | { type: 'event'; id: string }
  | { type: 'campfire' };

/** Точка маршрута-графа: next — индексы точек следующего слоя, куда можно пойти. */
export type RouteNode = RouteNodeBase & { next?: number[] };

export interface EventOutcome {
  gold?: number;
  hp?: number;
  spell?: Rarity;
  upgradeRandom?: number;
}

export interface EventOption {
  label: string;
  cost?: number;
  chance?: number;
  result: EventOutcome;
  outcome: string;
  fail?: EventOutcome;
  failOutcome?: string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  options: EventOption[];
}
