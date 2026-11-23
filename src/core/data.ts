import cardsJson from '../data/cards.json';
import combosJson from '../data/combinations.json';
import spellsJson from '../data/spells.json';
import enemiesJson from '../data/enemies.json';
import routeJson from '../data/route.json';
import eventsJson from '../data/events.json';
import stringsJson from '../data/strings.json';
import type { Affinity, ComboDef, ElementId, EnemyDef, EventDef, RageDef, Rarity, RouteNode, SpellDef } from './types';

export const ELEMENTS = cardsJson.elements as { id: ElementId; name: string; affinity: Affinity; color: string; icon: string }[];
export const RUNES = cardsJson.runes;
export const RULES = cardsJson.rules;
export const COMBOS = combosJson.combinations as ComboDef[];
export const SPELLS = spellsJson.spells as SpellDef[];
export const RARITIES = spellsJson.rarities as Record<Rarity, { name: string; color: string; weight: number }>;
export const SHOP = spellsJson.shop;
// JSON-литералы типизируются как string, а не как union-литералы — поэтому каст через unknown.
export const ENEMIES = enemiesJson.enemies as unknown as EnemyDef[];
export const ENEMY_PACING = enemiesJson.pacing as { type: string; default: RageDef };
/** Маршрут-граф: слои по глубине; в каждой точке next — индексы точек следующего слоя. */
export const ROUTE_LAYERS = routeJson.layers as unknown as RouteNode[][];
export const ROUTE_CFG = { segmentLength: routeJson.segmentLength, poi: routeJson.poi, campfire: routeJson.campfire };
export const EVENTS = eventsJson.events as EventDef[];
export const STR = stringsJson;

export const elementById = (id: ElementId) => ELEMENTS.find((e) => e.id === id)!;
export const isAttackElement = (id: ElementId) => elementById(id).affinity === 'attack';
export const enemyById = (id: string) => {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown enemy ${id}`);
  return e;
};
export const eventById = (id: string) => {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event ${id}`);
  return e;
};
