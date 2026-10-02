// Estadísticas reales de unidades y edificios según la facción del dueño y
// las tecnologías que ya investigó. Las usan el servidor (para simular) y el
// cliente (para mostrarlas), así ambos siempre coinciden.
//
// Las tecnologías de un jugador se guardan como una "máscara" de bits escrita
// en hexadecimal (un texto como "1a3f"): cada bit dice si una tecnología ya
// está investigada. Así no hay límite de tecnologías (un número normal solo
// guarda 53 bits) y viaja por la red como texto.

import {
  BUILDING_DEFS,
  BLADE_VS_CAVALRY,
  BLADE_VS_SPEAR,
  CAVALRY_VS_BLADE,
  CAVALRY_VS_SPEAR,
  CHARGE_BONUS,
  DAMAGE_BONUS,
  SPEAR_VS_CAVALRY,
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
  type Weapon,
  type UnitType,
} from './data.ts';

export const TECH_IDS = Object.keys(TECH_DEFS) as TechId[];
const TECH_INDEX = new Map(TECH_IDS.map((t, i) => [t, BigInt(i)]));

/** Tecnologías investigadas, en hexadecimal ("0" = ninguna). */
export type TechMask = string;
export const NO_TECHS: TechMask = '0';

const toBits = (mask: TechMask): bigint => BigInt('0x' + (mask || '0'));
const ONE = BigInt(1);

// Leer una máscara es frecuente: se recuerda la lista de cada máscara ya vista.
const decoded = new Map<TechMask, { list: TechId[]; set: Set<TechId> }>();
function decode(mask: TechMask) {
  let d = decoded.get(mask);
  if (!d) {
    const bits = toBits(mask);
    const list = TECH_IDS.filter((t) => ((bits >> TECH_INDEX.get(t)!) & ONE) === ONE);
    d = { list, set: new Set(list) };
    decoded.set(mask, d);
  }
  return d;
}

export function hasTech(mask: TechMask, t: TechId): boolean {
  return decode(mask).set.has(t);
}
/** Máscara con una tecnología más. */
export function addTech(mask: TechMask, t: TechId): TechMask {
  return (toBits(mask) | (ONE << TECH_INDEX.get(t)!)).toString(16);
}
/** Máscara con todas estas tecnologías. */
export function maskOf(techs: readonly TechId[]): TechMask {
  return techs.reduce((m, t) => addTech(m, t), NO_TECHS);
}
/** Tecnologías de una máscara, en orden. */
export function techsOf(mask: TechMask): TechId[] {
  return decode(mask).list;
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
  /** Arma de la infantería (lanza o espada). */
  weapon?: Weapon;
  flies: boolean;
  /** Vida que recupera por segundo (0 = no se cura sola). */
  regen: number;
}

/** Suma las mejoras de la facción, las tecnologías y las evoluciones para un tipo de unidad. */
function modsFor(faction: FactionId, type: UnitType, mask: TechMask): Required<StatMods> {
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
  for (const t of techsOf(mask)) {
      add(TECH_DEFS[t].units?.[cat]);
      add(TECH_DEFS[t].unitMods?.[type]);
    }
  return out;
}

const unitCache = new Map<string, UnitStats>();

/** Estadísticas de un tipo de unidad para una facción (con sus ventajas, desventajas y tecnologías). */
export function unitStats(faction: FactionId, type: UnitType, mask: TechMask = NO_TECHS): UnitStats {
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
      weapon: def.weapon,
      flies: def.flies === true,
      regen: (def.regen ?? 0) + m.regen,
    };
    unitCache.set(key, s);
  }
  return s;
}

/** Nombre de la unidad según sus evoluciones (Lancero → Piquero, élites…). */
export function unitLabel(type: UnitType, mask: TechMask = NO_TECHS): string {
  let label = UNIT_DEFS[type].label;
  for (const t of techsOf(mask)) label = TECH_DEFS[t].rename?.[type] ?? label;
  return label;
}

/** ¿Ya evolucionó esta unidad (alguna mejora propia investigada)? */
export function isUpgraded(type: UnitType, mask: TechMask = NO_TECHS): boolean {
  return techsOf(mask).some((t) => TECH_DEFS[t].unitMods?.[type] !== undefined);
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

export function buildingMaxHp(faction: FactionId, type: BuildingType, mask: TechMask = NO_TECHS): number {
  let f = FACTIONS[faction].buildingHp ?? 1;
  for (const t of techsOf(mask)) f *= TECH_DEFS[t].buildingHp ?? 1;
  return Math.round(BUILDING_DEFS[type].hp * f);
}

/**
 * Recurso por segundo que recolecta un trabajador de esta facción. `field`: true = granja;
 * un número = ritmo base de un campo de trabajo (granja, cantera, mina); false = recurso del mapa.
 */
export function gatherRate(faction: FactionId, resource: ResourceType, field: boolean | number = false, mask: TechMask = NO_TECHS): number {
  const base = typeof field === 'number' ? field : field ? FARM_GATHER_RATE : WORKER_GATHER_RATE[resource];
  const farm = field !== false && resource === 'food';
  let rate = base * (FACTIONS[faction].gather?.[resource] ?? 1);
  for (const t of techsOf(mask)) {
    rate *= TECH_DEFS[t].gather?.[resource] ?? 1;
    if (farm) rate *= TECH_DEFS[t].farm ?? 1;
  }
  return rate;
}

/** Cuánto carga un trabajador antes de volver al depósito. */
export function carryCapacity(mask: TechMask = NO_TECHS): number {
  let c = WORKER_CARRY_CAPACITY;
  for (const t of techsOf(mask)) c += TECH_DEFS[t].carry ?? 0;
  return c;
}

/**
 * Ventaja por el arma (Edad Media): lanza > caballería > espada > lanza.
 * Devuelve undefined si no aplica ninguna regla.
 */
export function weaponMult(attack: AttackDef, attacker: Category, aw: Weapon | undefined, target: Category, tw: Weapon | undefined): number | undefined {
  if (attack.type !== 'melee') return undefined;
  if (aw === 'spear' && target === 'cavalry') return SPEAR_VS_CAVALRY;
  if (aw === 'blade' && target === 'cavalry') return BLADE_VS_CAVALRY;
  if (aw === 'blade' && tw === 'spear') return BLADE_VS_SPEAR;
  if (attacker === 'cavalry' && tw === 'spear') return CAVALRY_VS_SPEAR;
  if (attacker === 'cavalry' && tw === 'blade') return CAVALRY_VS_BLADE;
  return undefined;
}

/**
 * Daño de un golpe: ataque × ventaja − armadura del objetivo (mínimo 1).
 * La ventaja propia de la unidad (p. ej. antitanque contra blindados)
 * reemplaza a la de su tipo. Ej.: guerrero (6) contra explorador: 6 × 1,5 − 0 = 9.
 * El arma (lanza o espada) agrega piedra, papel o tijera: una debilidad del arma
 * siempre manda; una fortaleza se suma a la ventaja propia (se queda la mayor).
 */
export function damage(
  attack: AttackDef,
  attacker: Category,
  target: Category,
  armor: Armor,
  bonus?: Partial<Record<Category, number>>,
  aw?: Weapon,
  tw?: Weapon,
): number {
  let mult = bonus?.[target] ?? DAMAGE_BONUS[attacker]?.[target] ?? 1;
  const w = weaponMult(attack, attacker, aw, target, tw);
  if (w !== undefined) mult = w < 1 ? Math.min(mult, w) : Math.max(mult, w);
  return Math.max(1, Math.round(attack.damage * mult - armor[attack.type]));
}

/** ¿Puede este ataque alcanzar a una unidad que vuela? Solo los ataques a distancia. */
export function canHitAir(attack: AttackDef): boolean {
  return attack.type === 'ranged';
}

/** Costo real de una unidad con las tecnologías de eficiencia (Armas estandarizadas…). */
export function unitCost(type: UnitType, mask: TechMask = NO_TECHS): Cost {
  const d = UNIT_DEFS[type];
  const out: Cost = { ...d.cost };
  for (const t of techsOf(mask)) {
    const m = TECH_DEFS[t].unitCost;
    if (!m || (m.cats && !m.cats.includes(d.category))) continue;
    for (const r of RESOURCE_TYPES) if (out[r] && m.res[r]) out[r] = out[r]! * m.res[r]!;
  }
  for (const r of RESOURCE_TYPES) if (out[r]) out[r] = Math.round(out[r]!);
  return out;
}

/** Costo real de un edificio con las tecnologías de eficiencia (Gremio de canteros…). */
export function buildingCost(type: BuildingType, mask: TechMask = NO_TECHS): Cost {
  const out: Cost = { ...BUILDING_DEFS[type].cost };
  for (const t of techsOf(mask)) {
    const m = TECH_DEFS[t].buildingCost;
    if (m) for (const r of RESOURCE_TYPES) if (out[r] && m[r]) out[r] = out[r]! * m[r]!;
  }
  for (const r of RESOURCE_TYPES) if (out[r]) out[r] = Math.max(1, Math.round(out[r]!));
  return out;
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return RESOURCE_TYPES.every((r) => res[r] >= (cost[r] ?? 0));
}

export function scaleCost(cost: Cost, f: number): Cost {
  const out: Cost = {};
  for (const r of RESOURCE_TYPES) if (cost[r]) out[r] = Math.floor((cost[r] ?? 0) * f);
  return out;
}
