// Estadísticas reales de unidades y edificios según la facción del dueño.
// Las usan el servidor (para simular) y el cliente (para mostrarlas), así
// ambos siempre coinciden.

import {
  BUILDING_DEFS,
  DAMAGE_BONUS,
  FACTIONS,
  FARM_GATHER_RATE,
  RESOURCE_TYPES,
  UNIT_DEFS,
  WORKER_GATHER_RATE,
  type Armor,
  type AttackDef,
  type BuildingType,
  type Category,
  type Cost,
  type FactionId,
  type ResourceType,
  type Resources,
  type UnitType,
} from './data.ts';

export interface UnitStats {
  hp: number;
  speed: number;
  sight: number;
  attack: AttackDef;
  armor: Armor;
  category: Category;
}

const unitCache = new Map<string, UnitStats>();

/** Estadísticas de un tipo de unidad para una facción (con sus ventajas y desventajas). */
export function unitStats(faction: FactionId, type: UnitType): UnitStats {
  const key = `${faction}:${type}`;
  let s = unitCache.get(key);
  if (!s) {
    const def = UNIT_DEFS[type];
    const mods = FACTIONS[faction].units[def.category] ?? {};
    s = {
      hp: Math.round(def.hp * (mods.hp ?? 1)),
      speed: def.speed * (mods.speed ?? 1),
      sight: def.sight,
      attack: {
        ...def.attack,
        damage: Math.round(def.attack.damage * (mods.attack ?? 1) * 10) / 10,
        range: def.attack.type === 'ranged' ? def.attack.range + (mods.range ?? 0) : def.attack.range,
      },
      armor: { melee: def.armor.melee + (mods.armor ?? 0), ranged: def.armor.ranged + (mods.armor ?? 0) },
      category: def.category,
    };
    unitCache.set(key, s);
  }
  return s;
}

export function buildingMaxHp(faction: FactionId, type: BuildingType): number {
  return Math.round(BUILDING_DEFS[type].hp * (FACTIONS[faction].buildingHp ?? 1));
}

/** Recurso por segundo que recolecta un trabajador de esta facción. */
export function gatherRate(faction: FactionId, resource: ResourceType, fromFarm = false): number {
  const base = fromFarm ? FARM_GATHER_RATE : WORKER_GATHER_RATE[resource];
  return base * (FACTIONS[faction].gather?.[resource] ?? 1);
}

/**
 * Daño de un golpe: ataque × ventaja de tipo − armadura del objetivo (mínimo 1).
 * Ej.: guerrero (6) contra explorador: 6 × 1,5 − 0 = 9.
 */
export function damage(attack: AttackDef, attacker: Category, target: Category, armor: Armor): number {
  const bonus = DAMAGE_BONUS[attacker]?.[target] ?? 1;
  return Math.max(1, Math.round(attack.damage * bonus - armor[attack.type]));
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return RESOURCE_TYPES.every((r) => res[r] >= (cost[r] ?? 0));
}

export function scaleCost(cost: Cost, f: number): Cost {
  const out: Cost = {};
  for (const r of RESOURCE_TYPES) if (cost[r]) out[r] = Math.floor((cost[r] ?? 0) * f);
  return out;
}
