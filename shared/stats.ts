// Estadísticas reales de unidades y edificios según la facción del dueño y
// las tecnologías que ya investigó. Las usan el servidor (para simular) y el
// cliente (para mostrarlas), así ambos siempre coinciden.
//
// Las tecnologías de un jugador se guardan como una "máscara" de bits: un
// número donde cada bit dice si una tecnología ya está investigada. Se usan
// potencias de 2 con aritmética normal (no `|`/`&`, que solo llegan a 32 bits):
// así caben hasta 53 tecnologías.

import {
  BUILDING_DEFS,
  CHARGE_BONUS,
  DAMAGE_BONUS,
  FACTIONS,
  FARM_GATHER_RATE,
  RESOURCE_TYPES,
  TECH_DEFS,
  UNIT_DEFS,
  WORKER_CARRY_CAPACITY,
  WORKER_GATHER_RATE,
  type Armor,
  type AttackDef,
  type BuildingType,
  type Category,
  type Cost,
  type FactionId,
  type ResourceType,
  type Resources,
  type StatMods,
  type TechId,
  type UnitType,
} from './data.ts';

export const TECH_IDS = Object.keys(TECH_DEFS) as TechId[];
if (TECH_IDS.length > 53) throw new Error('Too many technologies for a numeric mask');
const TECH_BIT = new Map(TECH_IDS.map((t, i) => [t, 2 ** i]));

export function techBit(t: TechId): number {
  return TECH_BIT.get(t) ?? 0;
}
export function hasTech(mask: number, t: TechId): boolean {
  const bit = techBit(t);
  return bit > 0 && Math.floor(mask / bit) % 2 === 1;
}
/** Máscara con una tecnología más. */
export function addTech(mask: number, t: TechId): number {
  return hasTech(mask, t) ? mask : mask + techBit(t);
}
/** Máscara con todas estas tecnologías. */
export function maskOf(techs: readonly TechId[]): number {
  return techs.reduce((m, t) => addTech(m, t), 0);
}
/** Tecnologías de una máscara, en orden. */
export function techsOf(mask: number): TechId[] {
  return TECH_IDS.filter((t) => hasTech(mask, t));
}

export interface UnitStats {
  hp: number;
  speed: number;
  sight: number;
  attack: AttackDef;
  armor: Armor;
  category: Category;
  /** Ventaja propia de esta unidad (además de la de su tipo). */
  bonus?: Partial<Record<Category, number>>;
  flies: boolean;
  /** Vida que recupera por segundo (0 = no se cura sola). */
  regen: number;
}

/** Suma las mejoras de la facción, las tecnologías y las evoluciones para un tipo de unidad. */
function modsFor(faction: FactionId, type: UnitType, mask: number): Required<StatMods> {
  const cat = UNIT_DEFS[type].category;
  const out = { hp: 1, attack: 1, speed: 1, armor: 0, range: 0, regen: 0 };
  const add = (m: StatMods | undefined) => {
    if (!m) return;
    out.hp *= m.hp ?? 1;
    out.attack *= m.attack ?? 1;
    out.speed *= m.speed ?? 1;
    out.armor += m.armor ?? 0;
    out.range += m.range ?? 0;
    out.regen += m.regen ?? 0;
  };
  add(FACTIONS[faction].units[cat]);
  out.regen += FACTIONS[faction].traits?.regen?.[cat] ?? 0;
  if (mask)
    for (const t of techsOf(mask)) {
      add(TECH_DEFS[t].units?.[cat]);
      add(TECH_DEFS[t].unitMods?.[type]);
    }
  return out;
}

const unitCache = new Map<string, UnitStats>();

/** Estadísticas de un tipo de unidad para una facción (con sus ventajas, desventajas y tecnologías). */
export function unitStats(faction: FactionId, type: UnitType, mask = 0): UnitStats {
  const key = `${faction}:${type}:${mask}`;
  let s = unitCache.get(key);
  if (!s) {
    const def = UNIT_DEFS[type];
    const m = modsFor(faction, type, mask);
    s = {
      hp: Math.round(def.hp * m.hp),
      speed: def.speed * m.speed,
      sight: def.sight,
      attack: {
        ...def.attack,
        damage: Math.round(def.attack.damage * m.attack * 10) / 10,
        range: def.attack.type === 'ranged' ? def.attack.range + m.range : def.attack.range,
      },
      armor: { melee: def.armor.melee + m.armor, ranged: def.armor.ranged + m.armor },
      category: def.category,
      bonus: def.bonus,
      flies: def.flies === true,
      regen: (def.regen ?? 0) + m.regen,
    };
    unitCache.set(key, s);
  }
  return s;
}

/** Nombre de la unidad según sus evoluciones (Lancero → Piquero, élites…). */
export function unitLabel(type: UnitType, mask = 0): string {
  let label = UNIT_DEFS[type].label;
  if (mask) for (const t of techsOf(mask)) label = TECH_DEFS[t].rename?.[type] ?? label;
  return label;
}

/** ¿Ya evolucionó esta unidad (alguna mejora propia investigada)? */
export function isUpgraded(type: UnitType, mask = 0): boolean {
  return mask > 0 && techsOf(mask).some((t) => TECH_DEFS[t].unitMods?.[type] !== undefined);
}

/** Multiplicador de la carga de caballería de un pueblo. */
export function chargeOf(faction: FactionId): number {
  return FACTIONS[faction].traits?.charge ?? CHARGE_BONUS;
}

/** Velocidad de entrenamiento de un tipo de unidad para un pueblo (1 = normal). */
export function trainSpeed(faction: FactionId, type: UnitType): number {
  return FACTIONS[faction].traits?.trainSpeed?.[UNIT_DEFS[type].category] ?? 1;
}

/** Velocidad de construcción de los trabajadores de un pueblo (1 = normal). */
export function buildSpeed(faction: FactionId): number {
  return FACTIONS[faction].traits?.buildSpeed ?? 1;
}

export function buildingMaxHp(faction: FactionId, type: BuildingType, mask = 0): number {
  let f = FACTIONS[faction].buildingHp ?? 1;
  if (mask) for (const t of techsOf(mask)) f *= TECH_DEFS[t].buildingHp ?? 1;
  return Math.round(BUILDING_DEFS[type].hp * f);
}

/** Recurso por segundo que recolecta un trabajador de esta facción. */
export function gatherRate(faction: FactionId, resource: ResourceType, fromFarm = false, mask = 0): number {
  let rate = (fromFarm ? FARM_GATHER_RATE : WORKER_GATHER_RATE[resource]) * (FACTIONS[faction].gather?.[resource] ?? 1);
  if (mask)
    for (const t of techsOf(mask)) {
      rate *= TECH_DEFS[t].gather?.[resource] ?? 1;
      if (fromFarm) rate *= TECH_DEFS[t].farm ?? 1;
    }
  return rate;
}

/** Cuánto carga un trabajador antes de volver al depósito. */
export function carryCapacity(mask = 0): number {
  let c = WORKER_CARRY_CAPACITY;
  if (mask) for (const t of techsOf(mask)) c += TECH_DEFS[t].carry ?? 0;
  return c;
}

/**
 * Daño de un golpe: ataque × ventaja − armadura del objetivo (mínimo 1).
 * La ventaja propia de la unidad (p. ej. antitanque contra blindados)
 * reemplaza a la de su tipo. Ej.: guerrero (6) contra explorador: 6 × 1,5 − 0 = 9.
 */
export function damage(
  attack: AttackDef,
  attacker: Category,
  target: Category,
  armor: Armor,
  bonus?: Partial<Record<Category, number>>,
): number {
  const mult = bonus?.[target] ?? DAMAGE_BONUS[attacker]?.[target] ?? 1;
  return Math.max(1, Math.round(attack.damage * mult - armor[attack.type]));
}

/** ¿Puede este ataque alcanzar a una unidad que vuela? Solo los ataques a distancia. */
export function canHitAir(attack: AttackDef): boolean {
  return attack.type === 'ranged';
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return RESOURCE_TYPES.every((r) => res[r] >= (cost[r] ?? 0));
}

export function scaleCost(cost: Cost, f: number): Cost {
  const out: Cost = {};
  for (const r of RESOURCE_TYPES) if (cost[r]) out[r] = Math.floor((cost[r] ?? 0) * f);
  return out;
}
