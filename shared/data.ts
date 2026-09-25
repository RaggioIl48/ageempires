// Datos del juego: todo lo que se balancea vive aquí, en tablas.
// Cambiar un número aquí cambia el juego en servidor y cliente a la vez.

export const TICK_RATE = 10; // pasos de simulación por segundo
export const TICK_MS = 1000 / TICK_RATE;

// ---------- Terreno ----------
export const TILE_GRASS = 0;
export const TILE_WATER = 1;
export const TILE_MOUNTAIN = 2;
export type TileKind = typeof TILE_GRASS | typeof TILE_WATER | typeof TILE_MOUNTAIN;

// ---------- Recursos ----------
export type ResourceType = 'food' | 'wood' | 'stone' | 'metal';
export const RESOURCE_TYPES: readonly ResourceType[] = ['food', 'wood', 'stone', 'metal'];
export const RESOURCE_LABELS: Record<ResourceType, string> = {
  food: 'Comida',
  wood: 'Madera',
  stone: 'Piedra',
  metal: 'Metal',
};
export type Resources = Record<ResourceType, number>;
export type Cost = Partial<Resources>;
export const STARTING_RESOURCES: Resources = { food: 200, wood: 200, stone: 100, metal: 50 };

// ---------- Fuentes de recursos (nodos del mapa) ----------
export type NodeType = 'tree' | 'berries' | 'stone' | 'metal';
export interface NodeDef {
  label: string;
  resource: ResourceType;
  amount: number;
}
export const NODE_DEFS: Record<NodeType, NodeDef> = {
  tree: { label: 'Árbol', resource: 'wood', amount: 100 },
  berries: { label: 'Arbusto de bayas', resource: 'food', amount: 150 },
  stone: { label: 'Cantera de piedra', resource: 'stone', amount: 350 },
  metal: { label: 'Veta de metal', resource: 'metal', amount: 350 },
};

// ---------- Eras ----------
/** Cuatro eras: de lo tribal a la Segunda Guerra Mundial (nada futurista). */
export const ERAS = [
  { label: 'Era Tribal', short: 'Tribal' },
  { label: 'Era Medieval', short: 'Medieval' },
  { label: 'Era Industrial', short: 'Industrial' },
  { label: 'Era Moderna', short: 'Moderna' },
] as const;
export const MAX_ERA = ERAS.length;
export function eraLabel(era: number): string {
  return ERAS[Math.max(0, Math.min(MAX_ERA, era) - 1)].label;
}

// ---------- Combate ----------
/** Tipo de unidad para las ventajas: quién le gana a quién. */
export type Category = 'worker' | 'infantry' | 'ranged' | 'cavalry' | 'siege' | 'armor' | 'air' | 'building';
export const CATEGORY_LABELS: Record<Category, string> = {
  worker: 'Trabajadores',
  infantry: 'Infantería',
  ranged: 'A distancia',
  cavalry: 'Caballería y vehículos',
  siege: 'Asedio y artillería',
  armor: 'Blindados',
  air: 'Aviación',
  building: 'Edificios',
};

export type AttackType = 'melee' | 'ranged';
export interface AttackDef {
  damage: number;
  /** Alcance en casillas, de borde a borde. 0 = cuerpo a cuerpo. */
  range: number;
  cooldown: number; // segundos entre golpes
  type: AttackType;
}
export interface Armor {
  melee: number;
  ranged: number;
}

/**
 * Ventajas entre tipos (multiplicador del daño). Reglas sencillas de explicar:
 * la infantería frena a la caballería; la caballería arrasa trabajadores,
 * tiradores y artillería; los tiradores castigan a la infantería y derriban
 * aviones; el asedio derriba edificios; los blindados aplastan a casi todos;
 * la aviación castiga blindados y artillería.
 */
export const DAMAGE_BONUS: Partial<Record<Category, Partial<Record<Category, number>>>> = {
  infantry: { cavalry: 1.5, building: 1.5 },
  cavalry: { worker: 1.5, ranged: 1.5, siege: 2 },
  ranged: { infantry: 1.25, air: 1.5 },
  siege: { building: 3, infantry: 1.25, armor: 1.25 },
  armor: { infantry: 1.5, cavalry: 1.5, ranged: 1.5, building: 1.5 },
  air: { armor: 1.5, siege: 1.5, building: 1.25 },
};

/** Distancia extra de "contacto" para el cuerpo a cuerpo (casillas entre centros de unidades). */
export const MELEE_REACH = 0.9;

// ---------- Unidades ----------
export type UnitType =
  | 'worker' | 'scout' | 'warrior'
  | 'spearman' | 'archer' | 'knight'
  | 'rifleman' | 'machine_gun' | 'light_vehicle' | 'artillery'
  | 'tank' | 'mech_infantry' | 'antitank' | 'heavy_artillery' | 'airplane';

export interface UnitDef {
  label: string;
  hp: number;
  speed: number; // casillas por segundo
  sight: number; // radio de visión en casillas
  pop: number; // población que ocupa
  cost: Cost;
  trainTime: number; // segundos
  attack: AttackDef;
  armor: Armor;
  category: Category;
  /** Primera y última era en que se puede entrenar (luego la reemplaza otra mejor). */
  era: number;
  untilEra: number;
  /** Ventaja propia además de la de su tipo (p. ej. el antitanque contra blindados). */
  bonus?: Partial<Record<Category, number>>;
  /** Vuela: no la frenan el terreno ni los edificios, y solo la alcanzan ataques a distancia. */
  flies?: boolean;
  /** Cómo se dibuja su disparo: flecha (por defecto), bala o proyectil de cañón. */
  shot?: 'bullet' | 'shell';
  /** Para la interfaz: en qué es buena y en qué no. */
  strong: string;
  weak: string;
}

const melee = (damage: number, cooldown = 1.5): AttackDef => ({ damage, range: 0, cooldown, type: 'melee' });
const ranged = (damage: number, range: number, cooldown: number): AttackDef => ({ damage, range, cooldown, type: 'ranged' });

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  // Era 1 — Tribal
  worker: {
    label: 'Trabajador', hp: 25, speed: 1.6, sight: 4, pop: 1, cost: { food: 50 }, trainTime: 12,
    attack: melee(3), armor: { melee: 0, ranged: 0 }, category: 'worker', era: 1, untilEra: 4,
    strong: 'Recolecta, construye y repara', weak: 'Casi no sabe pelear',
  },
  scout: {
    label: 'Explorador', hp: 45, speed: 2.7, sight: 7, pop: 1, cost: { food: 80 }, trainTime: 18,
    attack: melee(4), armor: { melee: 0, ranged: 2 }, category: 'cavalry', era: 1, untilEra: 2,
    strong: 'Muy rápido y ve lejos. Bueno contra trabajadores', weak: 'Pierde contra la infantería',
  },
  warrior: {
    label: 'Guerrero', hp: 45, speed: 1.3, sight: 4, pop: 1, cost: { food: 60, wood: 20 }, trainTime: 15,
    attack: melee(6), armor: { melee: 1, ranged: 1 }, category: 'infantry', era: 1, untilEra: 1,
    strong: 'Resistente. Bueno contra caballería y edificios', weak: 'Lento',
  },
  // Era 2 — Medieval
  spearman: {
    label: 'Lancero', hp: 55, speed: 1.3, sight: 4, pop: 1, cost: { food: 50, wood: 25 }, trainTime: 15,
    attack: melee(6), armor: { melee: 1, ranged: 1 }, category: 'infantry', era: 2, untilEra: 2, bonus: { cavalry: 2 },
    strong: 'Barato. Muy bueno contra caballería', weak: 'Pierde contra arqueros',
  },
  archer: {
    label: 'Arquero', hp: 35, speed: 1.4, sight: 6, pop: 1, cost: { wood: 45, metal: 20 }, trainTime: 16,
    attack: ranged(5, 5, 2), armor: { melee: 0, ranged: 1 }, category: 'ranged', era: 2, untilEra: 2,
    strong: 'Ataca de lejos. Bueno contra infantería', weak: 'Frágil ante la caballería',
  },
  knight: {
    label: 'Caballero', hp: 110, speed: 2.3, sight: 5, pop: 1, cost: { food: 70, metal: 70 }, trainTime: 24,
    attack: melee(9, 1.8), armor: { melee: 2, ranged: 2 }, category: 'cavalry', era: 2, untilEra: 2,
    strong: 'Fuerte y rápido. Bueno contra arqueros', weak: 'Caro; pierde contra lanceros',
  },
  // Era 3 — Industrial
  rifleman: {
    label: 'Fusilero', shot: 'bullet', hp: 60, speed: 1.4, sight: 6, pop: 1, cost: { food: 60, metal: 40 }, trainTime: 18,
    attack: ranged(9, 5, 1.8), armor: { melee: 1, ranged: 1 }, category: 'ranged', era: 3, untilEra: 4,
    strong: 'Soldado básico a distancia. Derriba aviones', weak: 'Pierde contra ametralladoras',
  },
  machine_gun: {
    label: 'Ametralladora', shot: 'bullet', hp: 70, speed: 1.0, sight: 6, pop: 1, cost: { food: 60, wood: 40, metal: 90 }, trainTime: 24,
    attack: ranged(6, 5, 0.6), armor: { melee: 1, ranged: 2 }, category: 'ranged', era: 3, untilEra: 4, bonus: { infantry: 2.5 },
    strong: 'Detiene a la infantería', weak: 'Lenta; pierde contra artillería y vehículos',
  },
  light_vehicle: {
    label: 'Vehículo ligero', shot: 'bullet', hp: 120, speed: 3.0, sight: 7, pop: 1, cost: { wood: 40, metal: 120 }, trainTime: 25,
    attack: ranged(8, 4, 1), armor: { melee: 2, ranged: 3 }, category: 'cavalry', era: 3, untilEra: 4,
    strong: 'El más rápido. Explora y caza artillería', weak: 'Pierde contra antitanques',
  },
  artillery: {
    label: 'Artillería', shot: 'shell', hp: 80, speed: 0.9, sight: 7, pop: 1, cost: { wood: 150, metal: 150 }, trainTime: 35,
    attack: ranged(40, 9, 5), armor: { melee: 0, ranged: 3 }, category: 'siege', era: 3, untilEra: 3,
    strong: 'Muy lejos. Destruye edificios', weak: 'Indefensa de cerca',
  },
  // Era 4 — Moderna
  tank: {
    label: 'Tanque', shot: 'shell', hp: 400, speed: 1.6, sight: 7, pop: 1, cost: { food: 100, metal: 300 }, trainTime: 40,
    attack: ranged(30, 6, 3), armor: { melee: 5, ranged: 8 }, category: 'armor', era: 4, untilEra: 4,
    strong: 'Muy resistente. Aplasta a casi todos', weak: 'Antitanques y aviones',
  },
  mech_infantry: {
    label: 'Infantería mecanizada', shot: 'bullet', hp: 90, speed: 2.4, sight: 6, pop: 1, cost: { food: 80, metal: 80 }, trainTime: 22,
    attack: ranged(10, 5, 1.5), armor: { melee: 2, ranged: 3 }, category: 'infantry', era: 4, untilEra: 4,
    strong: 'Rápida y resistente', weak: 'Pierde contra ametralladoras',
  },
  antitank: {
    label: 'Antitanque', shot: 'shell', hp: 60, speed: 1.3, sight: 6, pop: 1, cost: { food: 60, metal: 80 }, trainTime: 22,
    attack: ranged(14, 6, 2.5), armor: { melee: 1, ranged: 2 }, category: 'infantry', era: 4, untilEra: 4,
    bonus: { armor: 3.5, cavalry: 2 },
    strong: 'Destruye tanques y vehículos', weak: 'Frágil ante infantería y ametralladoras',
  },
  heavy_artillery: {
    label: 'Artillería pesada', shot: 'shell', hp: 150, speed: 0.8, sight: 8, pop: 1, cost: { wood: 200, metal: 300 }, trainTime: 45,
    attack: ranged(70, 11, 6), armor: { melee: 1, ranged: 4 }, category: 'siege', era: 4, untilEra: 4,
    strong: 'El mayor alcance. Arrasa edificios', weak: 'Indefensa de cerca; blanco de aviones',
  },
  airplane: {
    label: 'Avión', shot: 'bullet', hp: 150, speed: 4, sight: 9, pop: 1, cost: { food: 150, metal: 350 }, trainTime: 45,
    attack: ranged(25, 3, 2.5), armor: { melee: 0, ranged: 2 }, category: 'air', era: 4, untilEra: 4, flies: true,
    strong: 'Vuela sobre todo. Castiga tanques y artillería', weak: 'Lo derriban fusileros y torres',
  },
};

/** Economía del trabajador: cuánto carga y a qué ritmo recolecta (unidades/seg). */
export const WORKER_CARRY_CAPACITY = 10;
export const WORKER_GATHER_RATE: Record<ResourceType, number> = {
  food: 0.6,
  wood: 0.55,
  stone: 0.45,
  metal: 0.45,
};
/** Las granjas se trabajan un poco más lento que las bayas, pero no se acaban tan rápido. */
export const FARM_GATHER_RATE = 0.45;
/** Distancia (en casillas, desde el centro del trabajador) para recolectar o descargar. */
export const INTERACT_RANGE = 1.25;

// ---------- Edificios ----------
export type BuildingType =
  | 'town_center' | 'house' | 'storehouse' | 'farm' | 'barracks'
  | 'archery_range' | 'stable' | 'tech_center' | 'tower' | 'wall' | 'gate'
  | 'workshop' | 'factory';

export interface BuildingDef {
  label: string;
  description: string;
  size: number; // ocupa size x size casillas
  hp: number;
  cost: Cost;
  buildTime: number; // segundos con UN trabajador
  popProvided: number;
  dropoff: readonly ResourceType[]; // recursos que se pueden descargar aquí
  /** Unidades que entrena (cada una solo en sus eras). */
  trains: readonly UnitType[];
  /** Tecnologías que se investigan aquí. */
  researches: readonly TechId[];
  armor: Armor;
  sight: number;
  attack?: AttackDef; // solo edificios defensivos
  /** false = se puede caminar encima (granja). */
  solid: boolean;
  /** Comida que da una granja antes de agotarse. */
  food?: number;
  /** ¿Lo pueden construir los trabajadores? */
  buildable: boolean;
  /** Era desde la que se puede construir. */
  era: number;
}

const DEFENSE = { melee: 1, ranged: 5 };
export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  town_center: {
    label: 'Centro Urbano',
    description: 'Tu base principal. Entrena trabajadores, investiga el avance de era y dispara flechas.',
    size: 3, hp: 2000, cost: { wood: 275, stone: 100 }, buildTime: 120, popProvided: 5, dropoff: RESOURCE_TYPES,
    trains: ['worker'], researches: ['era2', 'era3', 'era4', 'tools', 'wheelbarrow', 'plow'],
    armor: { melee: 3, ranged: 6 }, sight: 8, attack: ranged(5, 6, 2), solid: true, buildable: false, era: 1,
  },
  house: {
    label: 'Casa', description: 'Aumenta la población máxima en 5.',
    size: 2, hp: 550, cost: { wood: 30 }, buildTime: 20, popProvided: 5, dropoff: [], trains: [], researches: [],
    armor: DEFENSE, sight: 3, solid: true, buildable: true, era: 1,
  },
  storehouse: {
    label: 'Almacén', description: 'Depósito de recursos. Constrúyelo cerca de bosques y minas para ahorrar caminatas.',
    size: 2, hp: 800, cost: { wood: 60 }, buildTime: 25, popProvided: 0, dropoff: RESOURCE_TYPES, trains: [], researches: [],
    armor: DEFENSE, sight: 3, solid: true, buildable: true, era: 1,
  },
  farm: {
    label: 'Granja', description: 'Fuente de comida para un trabajador. Mejor junto a un depósito.',
    size: 3, hp: 300, cost: { wood: 60 }, buildTime: 15, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 0, ranged: 0 }, sight: 1, solid: false, food: 300, buildable: true, era: 1,
  },
  barracks: {
    label: 'Cuartel', description: 'Entrena la infantería de cada era.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [],
    trains: ['warrior', 'scout', 'spearman', 'rifleman', 'machine_gun', 'antitank'], researches: [],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 1,
  },
  archery_range: {
    label: 'Campo de tiro', description: 'Entrena arqueros.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [], trains: ['archer'], researches: [],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  stable: {
    label: 'Establo', description: 'Entrena exploradores y caballeros.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [], trains: ['scout', 'knight'], researches: [],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  tech_center: {
    label: 'Centro tecnológico', description: 'Investiga mejoras militares y avances. Lo necesitas para la Era Industrial.',
    size: 3, hp: 1400, cost: { wood: 200, stone: 100 }, buildTime: 50, popProvided: 0, dropoff: [], trains: [],
    researches: ['forge', 'armor_tech', 'masonry', 'ballistics', 'machinery', 'plating'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  tower: {
    label: 'Torre defensiva', description: 'Dispara a los enemigos cercanos (también a los aviones).',
    size: 2, hp: 1000, cost: { wood: 50, stone: 125 }, buildTime: 40, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 3, ranged: 8 }, sight: 8, attack: ranged(7, 7, 2), solid: true, buildable: true, era: 2,
  },
  wall: {
    label: 'Muralla', description: 'Bloquea el paso. Coloca varias seguidas con Mayús.',
    size: 1, hp: 700, cost: { stone: 5 }, buildTime: 6, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 5, ranged: 10 }, sight: 1, solid: true, buildable: true, era: 2,
  },
  gate: {
    label: 'Puerta', description: 'Parte de la muralla: deja pasar a los tuyos y a tus aliados.',
    size: 1, hp: 700, cost: { stone: 20 }, buildTime: 10, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 5, ranged: 10 }, sight: 2, solid: true, buildable: true, era: 2,
  },
  workshop: {
    label: 'Taller', description: 'Fabrica artillería.',
    size: 3, hp: 1400, cost: { wood: 200, metal: 100 }, buildTime: 50, popProvided: 0, dropoff: [],
    trains: ['artillery', 'heavy_artillery'], researches: [],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 3,
  },
  factory: {
    label: 'Fábrica', description: 'Fabrica vehículos, tanques y aviones. La necesitas para la Era Moderna.',
    size: 3, hp: 1800, cost: { wood: 250, stone: 150, metal: 150 }, buildTime: 60, popProvided: 0, dropoff: [],
    trains: ['light_vehicle', 'tank', 'mech_infantry', 'airplane'], researches: [],
    armor: { melee: 2, ranged: 6 }, sight: 4, solid: true, buildable: true, era: 3,
  },
};
/** Edificios que aparecen en el menú de construcción, en orden. */
export const BUILD_MENU: readonly BuildingType[] = [
  'house', 'storehouse', 'farm', 'barracks',
  'archery_range', 'stable', 'tech_center', 'tower', 'wall', 'gate',
  'workshop', 'factory',
];

/** ¿Se puede entrenar esta unidad en esta era? */
export function unitAvailable(type: UnitType, era: number): boolean {
  const d = UNIT_DEFS[type];
  return era >= d.era && era <= d.untilEra;
}

/** Reparar cuesta esta fracción del precio del edificio (proporcional a la vida recuperada). */
export const REPAIR_COST_FACTOR = 0.5;
/** Elementos que caben en la cola de un edificio. */
export const MAX_QUEUE = 5;
/** Población máxima por jugador (límite de rendimiento para la clase). */
export const POP_CAP_MAX = 75;

// ---------- Mejoras que suman facciones y tecnologías ----------
export interface StatMods {
  hp?: number;
  attack?: number;
  speed?: number;
  /** Armadura extra (se suma, no multiplica). */
  armor?: number;
  /** Alcance extra en casillas (solo ataques a distancia). */
  range?: number;
}

// ---------- Tecnologías ----------
export type TechId =
  | 'era2' | 'era3' | 'era4'
  | 'tools' | 'wheelbarrow' | 'plow'
  | 'forge' | 'armor_tech' | 'masonry' | 'ballistics' | 'machinery' | 'plating';

export interface TechDef {
  label: string;
  description: string;
  cost: Cost;
  time: number; // segundos
  /** Era mínima para investigarla. */
  era: number;
  /** Edificio propio (terminado) que hace falta tener. */
  requires?: BuildingType;
  /** Avance de era: la era a la que lleva. */
  advancesTo?: number;
  units?: Partial<Record<Category, StatMods>>;
  gather?: Partial<Record<ResourceType, number>>;
  farm?: number;
  carry?: number;
  buildingHp?: number;
}

export const TECH_DEFS: Record<TechId, TechDef> = {
  era2: {
    label: 'Avanzar a la Era Medieval', description: 'Lancero, arquero, caballero, torres, murallas y el centro tecnológico.',
    cost: { food: 500, metal: 150 }, time: 60, era: 1, requires: 'barracks', advancesTo: 2,
  },
  era3: {
    label: 'Avanzar a la Era Industrial', description: 'Armas de fuego, artillería, fábricas y vehículos.',
    cost: { food: 900, stone: 250, metal: 350 }, time: 90, era: 2, requires: 'tech_center', advancesTo: 3,
  },
  era4: {
    label: 'Avanzar a la Era Moderna', description: 'Tanques, antitanques, infantería mecanizada, artillería pesada y aviones.',
    cost: { food: 1400, stone: 400, metal: 700 }, time: 120, era: 3, requires: 'factory', advancesTo: 4,
  },
  tools: {
    label: 'Herramientas', description: 'Los trabajadores recolectan madera, piedra y metal un 15 % más rápido.',
    cost: { food: 100, wood: 100 }, time: 30, era: 1, gather: { wood: 1.15, stone: 1.15, metal: 1.15 },
  },
  wheelbarrow: {
    label: 'Carretilla', description: 'Los trabajadores cargan 5 más y caminan un 10 % más rápido.',
    cost: { food: 150, wood: 100 }, time: 40, era: 2, carry: 5, units: { worker: { speed: 1.1 } },
  },
  plow: {
    label: 'Arado', description: 'Las granjas producen un 25 % más rápido.',
    cost: { food: 100, wood: 150 }, time: 40, era: 2, farm: 1.25,
  },
  forge: {
    label: 'Forja', description: 'Infantería y caballería: +15 % de ataque.',
    cost: { food: 150, metal: 100 }, time: 45, era: 2, units: { infantry: { attack: 1.15 }, cavalry: { attack: 1.15 } },
  },
  armor_tech: {
    label: 'Armaduras', description: 'Infantería y caballería: +1 de armadura.',
    cost: { food: 150, metal: 150 }, time: 45, era: 2, units: { infantry: { armor: 1 }, cavalry: { armor: 1 } },
  },
  masonry: {
    label: 'Mampostería', description: 'Todos los edificios: +20 % de vida.',
    cost: { wood: 100, stone: 150 }, time: 45, era: 2, buildingHp: 1.2,
  },
  ballistics: {
    label: 'Balística', description: 'Unidades a distancia y artillería: +20 % de ataque y +1 de alcance.',
    cost: { food: 150, metal: 250 }, time: 60, era: 3,
    units: { ranged: { attack: 1.2, range: 1 }, siege: { attack: 1.2, range: 1 } },
  },
  machinery: {
    label: 'Maquinaria', description: 'Toda la recolección es un 20 % más rápida.',
    cost: { wood: 200, metal: 200 }, time: 60, era: 3, gather: { food: 1.2, wood: 1.2, stone: 1.2, metal: 1.2 },
  },
  plating: {
    label: 'Blindaje', description: 'Blindados y aviones: +15 % de vida y +2 de armadura.',
    cost: { metal: 400 }, time: 75, era: 4, units: { armor: { hp: 1.15, armor: 2 }, air: { hp: 1.15, armor: 2 } },
  },
};

/** ¿Es un avance de era? */
export function isEraTech(t: TechId): boolean {
  return TECH_DEFS[t].advancesTo !== undefined;
}

// ---------- Facciones ----------
/**
 * Cada facción tiene especialidades (estilo Total War): algunos tipos de
 * unidad son más fuertes y otros más débiles. Los números son multiplicadores
 * (1.2 = +20 %). Así un mismo tipo de unidad no rinde igual en cada ejército.
 */
export type FactionId = 'legion' | 'wind' | 'forest' | 'forge' | 'river' | 'mountain';
export interface FactionDef {
  name: string;
  motto: string;
  units: Partial<Record<Category, StatMods>>;
  gather?: Partial<Record<ResourceType, number>>;
  /** Multiplicador de la vida de los edificios. */
  buildingHp?: number;
  strengths: string[];
  weaknesses: string[];
}
export const FACTIONS: Record<FactionId, FactionDef> = {
  legion: {
    name: 'Legión del Norte',
    motto: 'Muros de escudos que no retroceden',
    units: { infantry: { hp: 1.2, armor: 1 }, ranged: { attack: 0.9 } },
    strengths: ['Infantería: +20 % vida y +1 armadura'],
    weaknesses: ['A distancia: −10 % ataque'],
  },
  wind: {
    name: 'Clan del Viento',
    motto: 'Nadie cabalga más rápido',
    units: { cavalry: { attack: 1.2, hp: 1.15, speed: 1.1 }, air: { speed: 1.1 }, siege: { attack: 0.8 } },
    strengths: ['Caballería y vehículos: +20 % ataque, +15 % vida, +10 % velocidad', 'Aviones: +10 % velocidad'],
    weaknesses: ['Asedio: −20 % ataque'],
  },
  forest: {
    name: 'Guardia del Bosque',
    motto: 'La flecha llega antes que el enemigo',
    units: { ranged: { attack: 1.15, range: 1 }, cavalry: { hp: 0.85 } },
    gather: { wood: 1.1 },
    strengths: ['A distancia: +15 % ataque y +1 alcance', 'Madera: +10 % recolección'],
    weaknesses: ['Caballería: −15 % vida'],
  },
  forge: {
    name: 'Gremio de la Forja',
    motto: 'Nuestras máquinas derriban cualquier muralla',
    units: { siege: { attack: 1.25, hp: 1.2 }, armor: { hp: 1.1 }, cavalry: { attack: 0.8 } },
    buildingHp: 1.2,
    strengths: ['Asedio: +25 % ataque y +20 % vida', 'Tanques: +10 % vida', 'Edificios: +20 % vida'],
    weaknesses: ['Caballería: −20 % ataque'],
  },
  river: {
    name: 'Liga del Río',
    motto: 'Quien tiene graneros llenos gana la guerra larga',
    units: { worker: { hp: 1.2 }, infantry: { attack: 0.9 } },
    gather: { food: 1.15, metal: 1.15 },
    strengths: ['Comida y metal: +15 % recolección', 'Trabajadores: +20 % vida'],
    weaknesses: ['Infantería: −10 % ataque'],
  },
  mountain: {
    name: 'Pueblo de la Montaña',
    motto: 'Piedra sobre piedra, nadie nos derriba',
    units: { infantry: { speed: 0.95 }, cavalry: { speed: 0.95 } },
    gather: { stone: 1.2 },
    buildingHp: 1.25,
    strengths: ['Edificios: +25 % vida', 'Piedra: +20 % recolección'],
    weaknesses: ['Infantería y caballería: −5 % velocidad'],
  },
};
export const FACTION_ORDER: readonly FactionId[] = ['legion', 'wind', 'forest', 'forge', 'river', 'mountain'];

// ---------- Diplomacia ----------
/** Relación entre dos jugadores: en guerra, en paz (no se atacan) o aliados. */
export type Relation = 'war' | 'peace' | 'ally';
export const RELATIONS: readonly Relation[] = ['war', 'peace', 'ally'];
export const RELATION_LABELS: Record<Relation, string> = { war: 'En guerra', peace: 'En paz', ally: 'Aliados' };
/** Segundos de aviso antes de que empiece una guerra declarada. */
export const WAR_DELAY_SEC = 20;
/** Segundos que dura una propuesta (alianza o paz) sin respuesta. */
export const PROPOSAL_SEC = 60;
export type DiploAction =
  | 'proposeAlliance'
  | 'acceptAlliance'
  | 'rejectAlliance'
  | 'breakAlliance'
  | 'declareWar'
  | 'proposePeace'
  | 'acceptPeace'
  | 'rejectPeace';
export const DIPLO_ACTIONS: readonly DiploAction[] = [
  'proposeAlliance', 'acceptAlliance', 'rejectAlliance', 'breakAlliance',
  'declareWar', 'proposePeace', 'acceptPeace', 'rejectPeace',
];
/** Largo máximo de un mensaje de chat. */
export const CHAT_MAX = 140;

// ---------- Partida ----------
export const STARTING_UNITS: readonly UnitType[] = ['worker', 'worker', 'worker', 'scout'];
/** Colores de jugador (16, bien distinguibles entre sí). */
export const PLAYER_COLORS: readonly string[] = [
  '#2f6fd6', '#d63a2f', '#2fa84f', '#e0b020',
  '#8e44c9', '#1fb3b3', '#e0772a', '#d6479b',
  '#6b8e23', '#7a4b2a', '#4a5a8c', '#c0c0c0',
  '#00897b', '#ff6f91', '#9e9d24', '#37474f',
];
