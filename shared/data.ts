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

// ---------- Combate ----------
/** Tipo de unidad para las ventajas: quién le gana a quién. */
export type Category = 'worker' | 'infantry' | 'ranged' | 'cavalry' | 'siege' | 'building';
export const CATEGORY_LABELS: Record<Category, string> = {
  worker: 'Trabajadores',
  infantry: 'Infantería',
  ranged: 'A distancia',
  cavalry: 'Caballería',
  siege: 'Asedio',
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
 * Ventajas entre tipos (multiplicador del daño). Regla sencilla de explicar:
 * la infantería frena a la caballería, la caballería arrasa a trabajadores y
 * tiradores, los tiradores castigan a la infantería y el asedio derriba edificios.
 */
export const DAMAGE_BONUS: Partial<Record<Category, Partial<Record<Category, number>>>> = {
  infantry: { cavalry: 1.5, building: 1.5 },
  cavalry: { worker: 1.5, ranged: 1.5 },
  ranged: { infantry: 1.25 },
  siege: { building: 3 },
};

/** Distancia extra de "contacto" para el cuerpo a cuerpo (casillas entre centros de unidades). */
export const MELEE_REACH = 0.9;

// ---------- Unidades ----------
export type UnitType = 'worker' | 'scout' | 'warrior';
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
  /** Para la interfaz: en qué es bueno y en qué no. */
  strong: string;
  weak: string;
}
export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  worker: {
    label: 'Trabajador',
    hp: 25,
    speed: 1.6,
    sight: 4,
    pop: 1,
    cost: { food: 50 },
    trainTime: 12,
    attack: { damage: 3, range: 0, cooldown: 1.5, type: 'melee' },
    armor: { melee: 0, ranged: 0 },
    category: 'worker',
    strong: 'Recolecta, construye y repara',
    weak: 'Casi no sabe pelear',
  },
  scout: {
    label: 'Explorador',
    hp: 45,
    speed: 2.7,
    sight: 7,
    pop: 1,
    cost: { food: 80 },
    trainTime: 18,
    attack: { damage: 4, range: 0, cooldown: 1.5, type: 'melee' },
    armor: { melee: 0, ranged: 2 },
    category: 'cavalry',
    strong: 'Muy rápido y ve lejos. Bueno contra trabajadores',
    weak: 'Pierde contra la infantería',
  },
  warrior: {
    label: 'Guerrero',
    hp: 45,
    speed: 1.3,
    sight: 4,
    pop: 1,
    cost: { food: 60, wood: 20 },
    trainTime: 15,
    attack: { damage: 6, range: 0, cooldown: 1.5, type: 'melee' },
    armor: { melee: 1, ranged: 1 },
    category: 'infantry',
    strong: 'Resistente. Bueno contra caballería y edificios',
    weak: 'Lento',
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
export type BuildingType = 'town_center' | 'house' | 'storehouse' | 'farm' | 'barracks';
export interface BuildingDef {
  label: string;
  description: string;
  size: number; // ocupa size x size casillas
  hp: number;
  cost: Cost;
  buildTime: number; // segundos con UN trabajador
  popProvided: number;
  dropoff: readonly ResourceType[]; // recursos que se pueden descargar aquí
  trains: readonly UnitType[];
  armor: Armor;
  sight: number;
  attack?: AttackDef; // solo edificios defensivos
  /** false = se puede caminar encima (granja). */
  solid: boolean;
  /** Comida que da una granja antes de agotarse. */
  food?: number;
  /** ¿Lo pueden construir los trabajadores? */
  buildable: boolean;
}
export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  town_center: {
    label: 'Centro Urbano',
    description: 'Tu base principal. Entrena trabajadores, recibe recursos y dispara flechas.',
    size: 3,
    hp: 2000,
    cost: { wood: 275, stone: 100 },
    buildTime: 120,
    popProvided: 5,
    dropoff: RESOURCE_TYPES,
    trains: ['worker'],
    armor: { melee: 3, ranged: 6 },
    sight: 8,
    attack: { damage: 5, range: 6, cooldown: 2, type: 'ranged' },
    solid: true,
    buildable: false,
  },
  house: {
    label: 'Casa',
    description: 'Aumenta la población máxima en 5.',
    size: 2,
    hp: 550,
    cost: { wood: 30 },
    buildTime: 20,
    popProvided: 5,
    dropoff: [],
    trains: [],
    armor: { melee: 1, ranged: 5 },
    sight: 3,
    solid: true,
    buildable: true,
  },
  storehouse: {
    label: 'Almacén',
    description: 'Depósito de recursos. Constrúyelo cerca de bosques y minas para ahorrar caminatas.',
    size: 2,
    hp: 800,
    cost: { wood: 60 },
    buildTime: 25,
    popProvided: 0,
    dropoff: RESOURCE_TYPES,
    trains: [],
    armor: { melee: 1, ranged: 5 },
    sight: 3,
    solid: true,
    buildable: true,
  },
  farm: {
    label: 'Granja',
    description: 'Fuente de comida para un trabajador. Mejor junto a un depósito.',
    size: 3,
    hp: 300,
    cost: { wood: 60 },
    buildTime: 15,
    popProvided: 0,
    dropoff: [],
    trains: [],
    armor: { melee: 0, ranged: 0 },
    sight: 1,
    solid: false,
    food: 300,
    buildable: true,
  },
  barracks: {
    label: 'Cuartel',
    description: 'Entrena guerreros y exploradores.',
    size: 3,
    hp: 1200,
    cost: { wood: 150 },
    buildTime: 40,
    popProvided: 0,
    dropoff: [],
    trains: ['warrior', 'scout'],
    armor: { melee: 1, ranged: 5 },
    sight: 4,
    solid: true,
    buildable: true,
  },
};
/** Edificios que aparecen en el menú de construcción, en orden. */
export const BUILD_MENU: readonly BuildingType[] = ['house', 'storehouse', 'farm', 'barracks'];

/** Reparar cuesta esta fracción del precio del edificio (proporcional a la vida recuperada). */
export const REPAIR_COST_FACTOR = 0.5;
/** Unidades que caben en la cola de un edificio. */
export const MAX_QUEUE = 5;
/** Población máxima por jugador (límite de rendimiento para la clase). */
export const POP_CAP_MAX = 75;

// ---------- Facciones ----------
/**
 * Cada facción tiene especialidades (estilo Total War): algunos tipos de
 * unidad son más fuertes y otros más débiles. Los números son multiplicadores
 * (1.2 = +20 %). Así un mismo tipo de unidad no rinde igual en cada ejército.
 */
export type FactionId = 'legion' | 'wind' | 'forest' | 'forge' | 'river' | 'mountain';
export interface StatMods {
  hp?: number;
  attack?: number;
  speed?: number;
  /** Armadura extra (se suma, no multiplica). */
  armor?: number;
  /** Alcance extra en casillas (solo ataques a distancia). */
  range?: number;
}
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
    units: { cavalry: { attack: 1.2, hp: 1.15, speed: 1.1 }, siege: { attack: 0.8 } },
    strengths: ['Caballería: +20 % ataque, +15 % vida, +10 % velocidad'],
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
    units: { siege: { attack: 1.25, hp: 1.2 }, cavalry: { attack: 0.8 } },
    buildingHp: 1.2,
    strengths: ['Asedio: +25 % ataque y +20 % vida', 'Edificios: +20 % vida'],
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
