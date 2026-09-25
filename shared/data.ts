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
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
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
  tree: { label: 'Tree', resource: 'wood', amount: 100 },
  berries: { label: 'Berry bush', resource: 'food', amount: 150 },
  stone: { label: 'Stone quarry', resource: 'stone', amount: 400 },
  metal: { label: 'Metal vein', resource: 'metal', amount: 400 },
};

// ---------- Eras ----------
/** Cuatro eras: de lo tribal a la Segunda Guerra Mundial (nada futurista). */
export const ERAS = [
  { label: 'Tribal Age', short: 'Tribal' },
  { label: 'Medieval Age', short: 'Medieval' },
  { label: 'Industrial Age', short: 'Industrial' },
  { label: 'Modern Age', short: 'Modern' },
] as const;
export const MAX_ERA = ERAS.length;
export function eraLabel(era: number): string {
  return ERAS[Math.max(0, Math.min(MAX_ERA, era) - 1)].label;
}

// ---------- Combate ----------
/** Tipo de unidad para las ventajas: quién le gana a quién. */
export type Category = 'worker' | 'infantry' | 'ranged' | 'cavalry' | 'siege' | 'armor' | 'air' | 'building';
export const CATEGORY_LABELS: Record<Category, string> = {
  worker: 'Workers',
  infantry: 'Infantry',
  ranged: 'Ranged',
  cavalry: 'Cavalry and vehicles',
  siege: 'Siege and artillery',
  armor: 'Armored',
  air: 'Aircraft',
  building: 'Buildings',
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
  | 'tank' | 'mech_infantry' | 'antitank' | 'heavy_artillery' | 'airplane'
  // Unidades únicas de cada pueblo (Edad Media)
  | 'legionary' | 'scorpion'
  | 'horse_archer' | 'keshig'
  | 'fanatic' | 'chosen_swordsman'
  | 'chosen_spearman' | 'axe_thrower'
  | 'gothic_knight' | 'armored_archer'
  | 'gothic_lancer' | 'heavy_spearman'
  | 'berserker' | 'huscarl'
  | 'triarius' | 'trebuchet' | 'war_chariot' | 'chosen_axeman' | 'javelin_rider' | 'gothic_warband' | 'ulfhednar';

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
  /** Unidad única: solo la entrena este pueblo. */
  faction?: FactionId;
  /** Se cura sola (vida por segundo). */
  regen?: number;
  /** Para la interfaz: en qué es buena y en qué no. */
  strong: string;
  weak: string;
}

const melee = (damage: number, cooldown = 1.5): AttackDef => ({ damage, range: 0, cooldown, type: 'melee' });
const ranged = (damage: number, range: number, cooldown: number): AttackDef => ({ damage, range, cooldown, type: 'ranged' });

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  // Era 1 — Tribal
  worker: {
    label: 'Worker', hp: 25, speed: 1.6, sight: 4, pop: 1, cost: { food: 50 }, trainTime: 12,
    attack: melee(3), armor: { melee: 0, ranged: 0 }, category: 'worker', era: 1, untilEra: 4,
    strong: 'Gathers, builds and repairs', weak: 'Barely able to fight',
  },
  scout: {
    label: 'Scout', hp: 45, speed: 2.7, sight: 7, pop: 1, cost: { food: 80 }, trainTime: 18,
    attack: melee(4), armor: { melee: 0, ranged: 2 }, category: 'cavalry', era: 1, untilEra: 2,
    strong: 'Very fast and sees far. Good against workers', weak: 'Loses to infantry',
  },
  warrior: {
    label: 'Warrior', hp: 45, speed: 1.3, sight: 4, pop: 1, cost: { food: 60, wood: 20 }, trainTime: 15,
    attack: melee(6), armor: { melee: 1, ranged: 1 }, category: 'infantry', era: 1, untilEra: 1,
    strong: 'Tough. Good against cavalry and buildings', weak: 'Slow',
  },
  // Era 2 — Medieval
  spearman: {
    label: 'Spearman', hp: 55, speed: 1.3, sight: 4, pop: 1, cost: { food: 50, wood: 25 }, trainTime: 15,
    attack: melee(6), armor: { melee: 1, ranged: 1 }, category: 'infantry', era: 2, untilEra: 2, bonus: { cavalry: 2 },
    strong: 'Cheap. Very good against cavalry', weak: 'Loses to archers',
  },
  archer: {
    label: 'Archer', hp: 35, speed: 1.4, sight: 6, pop: 1, cost: { wood: 45, metal: 20 }, trainTime: 16,
    attack: ranged(5, 5, 2), armor: { melee: 0, ranged: 1 }, category: 'ranged', era: 2, untilEra: 2,
    strong: 'Attacks from afar. Good against infantry', weak: 'Fragile against cavalry',
  },
  knight: {
    label: 'Knight', hp: 110, speed: 2.3, sight: 5, pop: 1, cost: { food: 70, metal: 70 }, trainTime: 24,
    attack: melee(9, 1.8), armor: { melee: 2, ranged: 2 }, category: 'cavalry', era: 2, untilEra: 2,
    strong: 'Strong and fast. Good against archers', weak: 'Expensive; loses to spearmen',
  },
  // Era 3 — Industrial
  rifleman: {
    label: 'Rifleman', shot: 'bullet', hp: 60, speed: 1.4, sight: 6, pop: 1, cost: { food: 60, metal: 40 }, trainTime: 18,
    attack: ranged(9, 5, 1.8), armor: { melee: 1, ranged: 1 }, category: 'ranged', era: 3, untilEra: 4,
    strong: 'Basic ranged soldier. Shoots down airplanes', weak: 'Loses to machine guns',
  },
  machine_gun: {
    label: 'Machine gun', shot: 'bullet', hp: 70, speed: 1.0, sight: 6, pop: 1, cost: { food: 60, wood: 40, metal: 90 }, trainTime: 24,
    attack: ranged(6, 5, 0.6), armor: { melee: 1, ranged: 2 }, category: 'ranged', era: 3, untilEra: 4, bonus: { infantry: 2.5 },
    strong: 'Stops infantry', weak: 'Slow; loses to artillery and vehicles',
  },
  light_vehicle: {
    label: 'Light vehicle', shot: 'bullet', hp: 120, speed: 3.0, sight: 7, pop: 1, cost: { wood: 40, metal: 120 }, trainTime: 25,
    attack: ranged(8, 4, 1), armor: { melee: 2, ranged: 3 }, category: 'cavalry', era: 3, untilEra: 4,
    strong: 'The fastest. Scouts and hunts artillery', weak: 'Loses to anti-tank teams',
  },
  artillery: {
    label: 'Artillery', shot: 'shell', hp: 80, speed: 0.9, sight: 7, pop: 1, cost: { wood: 150, metal: 150 }, trainTime: 35,
    attack: ranged(40, 9, 5), armor: { melee: 0, ranged: 3 }, category: 'siege', era: 3, untilEra: 3,
    strong: 'Very long range. Destroys buildings', weak: 'Defenseless up close',
  },
  // Era 4 — Moderna
  tank: {
    label: 'Tank', shot: 'shell', hp: 400, speed: 1.6, sight: 7, pop: 1, cost: { food: 100, metal: 300 }, trainTime: 40,
    attack: ranged(30, 6, 3), armor: { melee: 5, ranged: 8 }, category: 'armor', era: 4, untilEra: 4,
    strong: 'Very tough. Crushes almost everything', weak: 'Anti-tank teams and airplanes',
  },
  mech_infantry: {
    label: 'Mechanized infantry', shot: 'bullet', hp: 90, speed: 2.4, sight: 6, pop: 1, cost: { food: 80, metal: 80 }, trainTime: 22,
    attack: ranged(10, 5, 1.5), armor: { melee: 2, ranged: 3 }, category: 'infantry', era: 4, untilEra: 4,
    strong: 'Fast and tough', weak: 'Loses to machine guns',
  },
  antitank: {
    label: 'Anti-tank', shot: 'shell', hp: 60, speed: 1.3, sight: 6, pop: 1, cost: { food: 60, metal: 80 }, trainTime: 22,
    attack: ranged(14, 6, 2.5), armor: { melee: 1, ranged: 2 }, category: 'infantry', era: 4, untilEra: 4,
    bonus: { armor: 3.5, cavalry: 2 },
    strong: 'Destroys tanks and vehicles', weak: 'Fragile against infantry and machine guns',
  },
  heavy_artillery: {
    label: 'Heavy artillery', shot: 'shell', hp: 150, speed: 0.8, sight: 8, pop: 1, cost: { wood: 200, metal: 300 }, trainTime: 45,
    attack: ranged(70, 11, 6), armor: { melee: 1, ranged: 4 }, category: 'siege', era: 4, untilEra: 4,
    strong: 'Longest range. Flattens buildings', weak: 'Defenseless up close; target for airplanes',
  },
  airplane: {
    label: 'Airplane', shot: 'bullet', hp: 150, speed: 4, sight: 9, pop: 1, cost: { food: 150, metal: 350 }, trainTime: 45,
    attack: ranged(25, 3, 2.5), armor: { melee: 0, ranged: 2 }, category: 'air', era: 4, untilEra: 4, flies: true,
    strong: 'Flies over everything. Punishes tanks and artillery', weak: 'Shot down by riflemen and towers',
  },

  // ---- Unique units (Medieval Age), inspired by Total War ----
  // Romans
  legionary: {
    label: 'Legionary', hp: 85, speed: 1.3, sight: 4, pop: 1, cost: { food: 70, metal: 40 }, trainTime: 22,
    attack: melee(9), armor: { melee: 3, ranged: 4 }, category: 'infantry', era: 2, untilEra: 2, faction: 'romans',
    strong: 'Heavy shield wall: holds any line', weak: 'Slow and costly',
  },
  scorpion: {
    label: 'Scorpion', hp: 60, speed: 1.0, sight: 8, pop: 1, cost: { wood: 120, metal: 60 }, trainTime: 28,
    attack: ranged(14, 8, 3.5), armor: { melee: 0, ranged: 2 }, category: 'siege', era: 2, untilEra: 2, faction: 'romans',
    bonus: { infantry: 2, cavalry: 1.5, building: 1.5 },
    strong: 'Bolt thrower: pierces infantry from afar', weak: 'Defenseless up close',
  },
  // Mongols
  horse_archer: {
    label: 'Horse Archer', hp: 70, speed: 2.6, sight: 7, pop: 1, cost: { food: 60, wood: 50, metal: 30 }, trainTime: 20,
    attack: ranged(6, 5, 1.6), armor: { melee: 0, ranged: 1 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'mongols',
    strong: 'Shoots from horseback: hit and run', weak: 'Fragile against spearmen and archers',
  },
  keshig: {
    label: 'Keshig', hp: 120, speed: 2.5, sight: 5, pop: 1, cost: { food: 80, metal: 80 }, trainTime: 26,
    attack: melee(11, 1.8), armor: { melee: 2, ranged: 3 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'mongols',
    strong: "The Khan's elite guard", weak: 'Expensive; loses to spearmen',
  },
  // Gauls
  fanatic: {
    label: 'Naked Fanatic', hp: 55, speed: 1.8, sight: 4, pop: 1, cost: { food: 60, wood: 20 }, trainTime: 14,
    attack: melee(12, 1.3), armor: { melee: 0, ranged: 0 }, category: 'infantry', era: 2, untilEra: 2, faction: 'gauls',
    strong: 'Huge attack and fast', weak: 'No armor: arrows cut them down',
  },
  chosen_swordsman: {
    label: 'Chosen Swordsman', hp: 80, speed: 1.4, sight: 4, pop: 1, cost: { food: 70, metal: 40 }, trainTime: 20,
    attack: melee(10), armor: { melee: 2, ranged: 2 }, category: 'infantry', era: 2, untilEra: 2, faction: 'gauls',
    bonus: { infantry: 1.5, building: 2 },
    strong: 'Elite swordsman: beats other infantry', weak: 'Loses to archers',
  },
  // Germans
  chosen_spearman: {
    label: 'Chosen Spearman', hp: 70, speed: 1.3, sight: 4, pop: 1, cost: { food: 60, wood: 30, metal: 10 }, trainTime: 18,
    attack: melee(8), armor: { melee: 2, ranged: 2 }, category: 'infantry', era: 2, untilEra: 2, faction: 'germans',
    bonus: { cavalry: 2.5 },
    strong: 'Wall of spears: stops any cavalry', weak: 'Loses to archers',
  },
  axe_thrower: {
    label: 'Axe Thrower', hp: 50, speed: 1.5, sight: 5, pop: 1, cost: { food: 50, wood: 40 }, trainTime: 16,
    attack: ranged(9, 3, 2), armor: { melee: 1, ranged: 1 }, category: 'ranged', era: 2, untilEra: 2, faction: 'germans',
    bonus: { infantry: 1.6 },
    strong: 'Thrown axes break infantry', weak: 'Very short range',
  },
  // Visigoths
  gothic_knight: {
    label: 'Gothic Knight', hp: 130, speed: 2.2, sight: 5, pop: 1, cost: { food: 90, metal: 90 }, trainTime: 28,
    attack: melee(12, 1.8), armor: { melee: 3, ranged: 3 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'visigoths',
    strong: 'The heaviest cavalry', weak: 'Very expensive; loses to spearmen',
  },
  armored_archer: {
    label: 'Armored Archer', hp: 55, speed: 1.3, sight: 6, pop: 1, cost: { wood: 50, metal: 40 }, trainTime: 18,
    attack: ranged(6, 6, 2), armor: { melee: 2, ranged: 3 }, category: 'ranged', era: 2, untilEra: 2, faction: 'visigoths',
    strong: 'Armored: survives other archers', weak: 'Slow',
  },
  // Ostrogoths
  gothic_lancer: {
    label: 'Gothic Lancer', hp: 110, speed: 2.6, sight: 5, pop: 1, cost: { food: 80, metal: 70 }, trainTime: 24,
    attack: melee(10, 1.6), armor: { melee: 2, ranged: 2 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'ostrogoths',
    bonus: { cavalry: 1.5 },
    strong: 'Fast shock cavalry: wins cavalry duels', weak: 'Loses to spearmen',
  },
  heavy_spearman: {
    label: 'Heavy Spearman', hp: 80, speed: 1.2, sight: 4, pop: 1, cost: { food: 60, metal: 30 }, trainTime: 18,
    attack: melee(7), armor: { melee: 3, ranged: 2 }, category: 'infantry', era: 2, untilEra: 2, faction: 'ostrogoths',
    bonus: { cavalry: 2 },
    strong: 'Armored spear wall against cavalry', weak: 'Slow',
  },
  // Vikings
  berserker: {
    label: 'Berserker', hp: 70, speed: 1.7, sight: 4, pop: 1, cost: { food: 70, wood: 30 }, trainTime: 18,
    attack: melee(14, 1.4), armor: { melee: 0, ranged: 0 }, category: 'infantry', era: 2, untilEra: 2, faction: 'vikings',
    bonus: { infantry: 1.3 }, regen: 1.5,
    strong: 'Battle fury: the strongest attack on foot', weak: 'No armor',
  },
  huscarl: {
    label: 'Huscarl', hp: 90, speed: 1.3, sight: 4, pop: 1, cost: { food: 80, metal: 50 }, trainTime: 22,
    attack: melee(11), armor: { melee: 3, ranged: 2 }, category: 'infantry', era: 2, untilEra: 2, faction: 'vikings',
    bonus: { infantry: 1.4, building: 2 },
    strong: 'Elite guard with a great axe', weak: 'Expensive',
  },

  // ---- Third unique unit of each people ----
  triarius: {
    label: 'Triarius', hp: 95, speed: 1.1, sight: 4, pop: 1, cost: { food: 70, metal: 50 }, trainTime: 24,
    attack: melee(8, 1.6), armor: { melee: 3, ranged: 3 }, category: 'infantry', era: 2, untilEra: 2, faction: 'romans',
    bonus: { cavalry: 2.5 },
    strong: 'Veteran spear line: stops any charge', weak: 'Very slow',
  },
  trebuchet: {
    label: 'Trebuchet', shot: 'shell', hp: 120, speed: 0.6, sight: 9, pop: 1, cost: { wood: 250, metal: 150 }, trainTime: 45,
    attack: ranged(90, 11, 7), armor: { melee: 1, ranged: 5 }, category: 'siege', era: 2, untilEra: 2, faction: 'mongols',
    bonus: { building: 4, infantry: 0.4, cavalry: 0.4, ranged: 0.4, worker: 0.4 },
    strong: 'Huge range: flattens walls and forts', weak: 'Almost useless against units; very slow',
  },
  war_chariot: {
    label: 'War Chariot', hp: 140, speed: 2.4, sight: 6, pop: 1, cost: { food: 90, wood: 60, metal: 30 }, trainTime: 26,
    attack: melee(10, 1.6), armor: { melee: 2, ranged: 1 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'gauls',
    bonus: { infantry: 1.5, ranged: 1.5, worker: 1.5 },
    strong: 'Scythed wheels crash through infantry and archers', weak: 'Loses to spearmen',
  },
  chosen_axeman: {
    label: 'Chosen Axeman', hp: 75, speed: 1.35, sight: 4, pop: 1, cost: { food: 65, metal: 35 }, trainTime: 20,
    attack: melee(11), armor: { melee: 1, ranged: 2 }, category: 'infantry', era: 2, untilEra: 2, faction: 'germans',
    bonus: { infantry: 1.4, building: 2 },
    strong: 'Axes break shields and gates', weak: 'Loses to archers',
  },
  javelin_rider: {
    label: 'Javelin Rider', hp: 85, speed: 2.5, sight: 6, pop: 1, cost: { food: 70, wood: 40, metal: 30 }, trainTime: 22,
    attack: ranged(8, 4, 2), armor: { melee: 1, ranged: 2 }, category: 'cavalry', era: 2, untilEra: 2, faction: 'visigoths',
    bonus: { cavalry: 1.5, ranged: 1.5 },
    strong: 'Mounted skirmisher: javelins hurt other riders', weak: 'Short range; loses to spearmen',
  },
  gothic_warband: {
    label: 'Gothic Warband', hp: 60, speed: 1.45, sight: 4, pop: 1, cost: { food: 45, wood: 15 }, trainTime: 11,
    attack: melee(8), armor: { melee: 1, ranged: 1 }, category: 'infantry', era: 2, untilEra: 2, faction: 'ostrogoths',
    strong: 'Cheap and quick to train: fills the ranks', weak: 'Light armor',
  },
  ulfhednar: {
    label: 'Ulfhednar', hp: 60, speed: 1.9, sight: 5, pop: 1, cost: { food: 60, wood: 25 }, trainTime: 15,
    attack: melee(10, 1.3), armor: { melee: 0, ranged: 1 }, category: 'infantry', era: 2, untilEra: 2, faction: 'vikings',
    bonus: { ranged: 1.6, worker: 2, siege: 1.6 },
    strong: 'Wolf warriors: raid archers, workers and siege', weak: 'No armor; loses to cavalry',
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
/** Canteras y minas: un poco más lentas que las rocas y vetas del mapa, pero se construyen donde quieras. */
export const MINE_GATHER_RATE = 0.36;

/**
 * Cuadrilla: si al menos CREW_SIZE trabajadores recogen el mismo recurso a menos de
 * CREW_RADIUS casillas unos de otros, cada uno recolecta CREW_BONUS veces más rápido.
 */
export const CREW_SIZE = 5;
export const CREW_BONUS = 2;
export const CREW_RADIUS = 5;
/** Distancia (en casillas, desde el centro del trabajador) para recolectar o descargar. */
export const INTERACT_RANGE = 1.25;

// ---------- Edificios ----------
export type BuildingType =
  | 'town_center' | 'house' | 'storehouse' | 'farm' | 'quarry' | 'mine' | 'barracks'
  | 'archery_range' | 'stable' | 'tech_center' | 'tower' | 'wall' | 'gate'
  | 'workshop' | 'factory' | 'market'
  // Edificio único de cada pueblo (Edad Media)
  | 'castrum' | 'ordu' | 'nemeton' | 'war_hall' | 'royal_hall' | 'royal_palace' | 'mead_hall';

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
  /**
   * Campo de trabajo (granja, cantera, mina): qué recurso da, cuánto antes de agotarse,
   * cuántos trabajadores caben y a qué ritmo recolecta cada uno (unidades/seg).
   */
  field?: { resource: ResourceType; amount: number; workers: number; rate: number };
  /** ¿Lo pueden construir los trabajadores? */
  buildable: boolean;
  /** Era desde la que se puede construir. */
  era: number;
  /** Edificio único: solo lo construye este pueblo. */
  faction?: FactionId;
  /** Cura a las unidades propias cercanas (druidas del Nemeton). */
  healAura?: { radius: number; hps: number };
  /** Mercado: compra y venta de recursos a cambio de metal. */
  market?: boolean;
}

const DEFENSE = { melee: 1, ranged: 5 };
export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  town_center: {
    label: 'Town Center',
    description: 'Your main base. Trains workers, researches the next age and shoots arrows.',
    size: 3, hp: 2000, cost: { wood: 275, stone: 100 }, buildTime: 120, popProvided: 5, dropoff: RESOURCE_TYPES,
    trains: ['worker'], researches: ['era2', 'era3', 'era4', 'tools', 'wheelbarrow', 'plow', 'hand_cart'],
    armor: { melee: 3, ranged: 6 }, sight: 8, attack: ranged(5, 6, 2), solid: true, buildable: false, era: 1,
  },
  house: {
    label: 'House', description: 'Raises the population limit by 5.',
    size: 2, hp: 550, cost: { wood: 30 }, buildTime: 20, popProvided: 5, dropoff: [], trains: [], researches: [],
    armor: DEFENSE, sight: 3, solid: true, buildable: true, era: 1,
  },
  storehouse: {
    label: 'Storehouse', description: 'Resource drop-off. Build it near forests and mines to save walking.',
    size: 2, hp: 800, cost: { wood: 60 }, buildTime: 25, popProvided: 0, dropoff: RESOURCE_TYPES, trains: [],
    researches: ['double_axe', 'stone_mining', 'metal_mining', 'horse_collar', 'masons_guild', 'bow_saw', 'shaft_mining'],
    armor: DEFENSE, sight: 3, solid: true, buildable: true, era: 1,
  },
  farm: {
    label: 'Farm', description: 'Food source for one worker. Best next to a drop-off.',
    size: 3, hp: 300, cost: { wood: 60 }, buildTime: 15, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 0, ranged: 0 }, sight: 1, solid: false, field: { resource: 'food', amount: 400, workers: 1, rate: FARM_GATHER_RATE }, buildable: true, era: 1,
  },
  quarry: {
    label: 'Quarry', description: 'Dig stone anywhere, no rocks needed: up to 5 workers, 800 stone. Stone drop-off.',
    size: 3, hp: 700, cost: { wood: 125 }, buildTime: 30, popProvided: 0, dropoff: ['stone'], trains: [], researches: [],
    armor: DEFENSE, sight: 2, solid: true, field: { resource: 'stone', amount: 800, workers: 5, rate: MINE_GATHER_RATE }, buildable: true, era: 1,
  },
  mine: {
    label: 'Mine', description: 'Dig metal anywhere, no veins needed: up to 5 workers, 800 metal. Metal drop-off.',
    size: 3, hp: 700, cost: { wood: 150, stone: 75 }, buildTime: 35, popProvided: 0, dropoff: ['metal'], trains: [], researches: [],
    armor: DEFENSE, sight: 2, solid: true, field: { resource: 'metal', amount: 800, workers: 5, rate: MINE_GATHER_RATE }, buildable: true, era: 1,
  },
  barracks: {
    label: 'Barracks', description: 'Trains the infantry of each age.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [],
    trains: ['warrior', 'scout', 'spearman', 'rifleman', 'machine_gun', 'antitank'], researches: ['man_at_arms', 'pikeman', 'supplies', 'veteran_riflemen'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 1,
  },
  archery_range: {
    label: 'Archery Range', description: 'Trains archers.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [], trains: ['archer'], researches: ['crossbow'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  stable: {
    label: 'Stable', description: 'Trains scouts and knights.',
    size: 3, hp: 1200, cost: { wood: 150 }, buildTime: 40, popProvided: 0, dropoff: [], trains: ['scout', 'knight'], researches: ['light_cavalry', 'cavalier', 'horse_breeding'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  tech_center: {
    label: 'Tech Center', description: 'Researches military and economic upgrades. Needed for the Industrial Age.',
    size: 3, hp: 1400, cost: { wood: 200, stone: 100 }, buildTime: 50, popProvided: 0, dropoff: [], trains: [],
    researches: ['forge', 'armor_tech', 'masonry', 'woodworking', 'standard_arms', 'ballistics', 'machinery', 'mass_production', 'plating'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2,
  },
  tower: {
    label: 'Defense Tower', description: 'Shoots nearby enemies (airplanes too).',
    size: 2, hp: 1000, cost: { wood: 50, stone: 125 }, buildTime: 40, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 3, ranged: 8 }, sight: 8, attack: ranged(7, 7, 2), solid: true, buildable: true, era: 1,
  },
  wall: {
    label: 'Wall', description: 'Blocks the way. Click where it starts and where it ends: one order builds the whole line.',
    size: 1, hp: 700, cost: { stone: 5 }, buildTime: 6, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 5, ranged: 10 }, sight: 1, solid: true, buildable: true, era: 1,
  },
  gate: {
    label: 'Gate', description: 'Lets you and your allies through. Place it on your own wall to turn that section into a gate.',
    size: 1, hp: 700, cost: { stone: 20 }, buildTime: 10, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: { melee: 5, ranged: 10 }, sight: 2, solid: true, buildable: true, era: 1,
  },
  workshop: {
    label: 'Workshop', description: 'Builds artillery.',
    size: 3, hp: 1400, cost: { wood: 200, metal: 100 }, buildTime: 50, popProvided: 0, dropoff: [],
    trains: ['artillery', 'heavy_artillery'], researches: ['iron_casting'],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 3,
  },
  factory: {
    label: 'Factory', description: 'Builds vehicles, tanks and airplanes. Needed for the Modern Age.',
    size: 3, hp: 1800, cost: { wood: 250, stone: 150, metal: 150 }, buildTime: 60, popProvided: 0, dropoff: [],
    trains: ['light_vehicle', 'tank', 'mech_infantry', 'airplane'], researches: ['armored_cars'],
    armor: { melee: 2, ranged: 6 }, sight: 4, solid: true, buildable: true, era: 3,
  },

  market: {
    label: 'Market', description: 'Trade: buy and sell food, wood and stone for metal. Prices go up when people buy and down when they sell.',
    size: 3, hp: 1300, cost: { wood: 175 }, buildTime: 45, popProvided: 0, dropoff: [], trains: [], researches: [],
    armor: DEFENSE, sight: 4, solid: true, buildable: true, era: 2, market: true,
  },

  // ---- Unique buildings (Medieval Age) ----
  castrum: {
    label: 'Castrum', description: 'Roman fort: shoots arrows. Trains Legionaries, Scorpions and Triarii.',
    size: 3, hp: 2200, cost: { wood: 150, stone: 150 }, buildTime: 60, popProvided: 0, dropoff: [],
    trains: ['legionary', 'scorpion', 'triarius'], researches: ['elite_legionary', 'elite_scorpion', 'elite_triarius'],
    armor: { melee: 3, ranged: 7 }, sight: 7, attack: ranged(6, 6, 2), solid: true, buildable: true, era: 2, faction: 'romans',
  },
  ordu: {
    label: 'Ordu', description: "The Khan's camp: +10 population. Trains Horse Archers, Keshig and Trebuchets.",
    size: 3, hp: 1000, cost: { wood: 120, food: 80 }, buildTime: 35, popProvided: 10, dropoff: [],
    trains: ['horse_archer', 'keshig', 'trebuchet'], researches: ['elite_horse_archer', 'elite_keshig', 'elite_trebuchet'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'mongols',
  },
  nemeton: {
    label: 'Nemeton', description: 'Sacred grove of the druids: heals your units nearby. Built with wood only. Trains Naked Fanatics, Chosen Swordsmen and War Chariots.',
    size: 3, hp: 1100, cost: { wood: 220 }, buildTime: 40, popProvided: 0, dropoff: [],
    trains: ['fanatic', 'chosen_swordsman', 'war_chariot'], researches: ['elite_fanatic', 'elite_chosen_swordsman', 'elite_war_chariot'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'gauls', healAura: { radius: 6, hps: 2 },
  },
  war_hall: {
    label: 'War Hall', description: 'Hall of the war chiefs: food and wood drop-off. Trains Chosen Spearmen, Axe Throwers and Chosen Axemen.',
    size: 3, hp: 1300, cost: { wood: 200 }, buildTime: 45, popProvided: 0, dropoff: ['food', 'wood'],
    trains: ['chosen_spearman', 'axe_thrower', 'chosen_axeman'], researches: ['elite_chosen_spearman', 'elite_axe_thrower', 'elite_chosen_axeman'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'germans',
  },
  royal_hall: {
    label: 'Royal Hall', description: 'Court of the Visigoth kings: drop-off for all resources. Trains Gothic Knights, Armored Archers and Javelin Riders.',
    size: 3, hp: 1500, cost: { wood: 150, stone: 100 }, buildTime: 50, popProvided: 0, dropoff: RESOURCE_TYPES,
    trains: ['gothic_knight', 'armored_archer', 'javelin_rider'], researches: ['elite_gothic_knight', 'elite_armored_archer', 'elite_javelin_rider'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'visigoths',
  },
  royal_palace: {
    label: 'Royal Palace', description: "Theodoric's palace: +5 population and stone/metal drop-off. Trains Gothic Lancers, Heavy Spearmen and Gothic Warbands.",
    size: 3, hp: 1500, cost: { wood: 150, stone: 120 }, buildTime: 50, popProvided: 5, dropoff: ['stone', 'metal'],
    trains: ['gothic_lancer', 'heavy_spearman', 'gothic_warband'], researches: ['elite_gothic_lancer', 'elite_heavy_spearman', 'elite_gothic_warband'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'ostrogoths',
  },
  mead_hall: {
    label: 'Mead Hall', description: 'Great longhouse: +5 population and food/wood drop-off. Trains Berserkers, Huscarls and Ulfhednar.',
    size: 3, hp: 1300, cost: { wood: 200 }, buildTime: 45, popProvided: 5, dropoff: ['food', 'wood'],
    trains: ['berserker', 'huscarl', 'ulfhednar'], researches: ['elite_berserker', 'elite_huscarl', 'elite_ulfhednar'],
    armor: DEFENSE, sight: 5, solid: true, buildable: true, era: 2, faction: 'vikings',
  },
};
/** Edificios que aparecen en el menú de construcción, en orden. */
export const BUILD_MENU: readonly BuildingType[] = [
  'house', 'storehouse', 'farm', 'quarry', 'mine', 'barracks', 'tower', 'wall', 'gate',
  'archery_range', 'stable', 'tech_center', 'market',
  'castrum', 'ordu', 'nemeton', 'war_hall', 'royal_hall', 'royal_palace', 'mead_hall',
  'workshop', 'factory',
];

/** ¿Se puede entrenar esta unidad en esta era (y con este pueblo, si es única)? */
export function unitAvailable(type: UnitType, era: number, faction?: FactionId): boolean {
  const d = UNIT_DEFS[type];
  if (d.faction && d.faction !== faction) return false;
  return era >= d.era && era <= d.untilEra;
}

/** ¿Puede este pueblo construir este edificio en esta era? */
export function buildingAvailable(type: BuildingType, era: number, faction?: FactionId): boolean {
  const d = BUILDING_DEFS[type];
  if (d.faction && d.faction !== faction) return false;
  return d.buildable && era >= d.era;
}

// ---------- Mercado ----------
/** Recursos que se compran y venden en el Mercado (el metal es la moneda). */
export type TradeResource = 'food' | 'wood' | 'stone';
export const TRADE_RESOURCES: readonly TradeResource[] = ['food', 'wood', 'stone'];
/** Cantidad por operación. */
export const MARKET_LOT = 100;
/** Precio inicial en metal por cada lote de 100. */
export const MARKET_START: Record<TradeResource, number> = { food: 100, wood: 100, stone: 130 };
/** Cuánto sube el precio al comprar (y baja al vender) un lote. */
export const MARKET_STEP = 4;
export const MARKET_MIN = 25;
export const MARKET_MAX = 400;
/** Al vender se recibe esta fracción del precio (el mercader se queda con el resto). */
export const MARKET_SELL_FACTOR = 0.7;
export function sellPrice(price: number): number {
  return Math.floor(price * MARKET_SELL_FACTOR);
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
  /** Curación extra (vida por segundo, se suma). */
  regen?: number;
}

// ---------- Tecnologías ----------
/** Unidades únicas: cada una tiene su versión de élite (se investiga en el edificio único). */
export const UNIQUE_UNITS = [
  'legionary', 'scorpion', 'horse_archer', 'keshig', 'fanatic', 'chosen_swordsman', 'chosen_spearman',
  'axe_thrower', 'gothic_knight', 'armored_archer', 'gothic_lancer', 'heavy_spearman', 'berserker', 'huscarl',
  'triarius', 'trebuchet', 'war_chariot', 'chosen_axeman', 'javelin_rider', 'gothic_warband', 'ulfhednar',
] as const;
export type UniqueUnitType = (typeof UNIQUE_UNITS)[number];

type BaseTechId =
  | 'era2' | 'era3' | 'era4'
  | 'tools' | 'wheelbarrow' | 'plow' | 'hand_cart'
  | 'double_axe' | 'stone_mining' | 'metal_mining' | 'horse_collar' | 'bow_saw' | 'shaft_mining'
  | 'forge' | 'armor_tech' | 'masonry' | 'ballistics' | 'machinery' | 'plating'
  | 'man_at_arms' | 'pikeman' | 'crossbow' | 'light_cavalry' | 'cavalier' | 'veteran_riflemen' | 'armored_cars'
  | 'supplies' | 'horse_breeding' | 'woodworking' | 'standard_arms' | 'masons_guild' | 'iron_casting' | 'mass_production';
export type TechId = BaseTechId | `elite_${UniqueUnitType}`;

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
  /** Mejora de un tipo de unidad concreto (evolución, como en AoE). */
  unitMods?: Partial<Record<UnitType, StatMods>>;
  /** Nombre nuevo de la unidad mejorada (p. ej. Lancero → Piquero). */
  rename?: Partial<Record<UnitType, string>>;
  /** Solo para este pueblo (élites de las unidades únicas). */
  faction?: FactionId;
  gather?: Partial<Record<ResourceType, number>>;
  farm?: number;
  carry?: number;
  buildingHp?: number;
  /** Abarata las unidades: multiplica su costo (`cats`: solo esos tipos; si falta, todas). */
  unitCost?: { cats?: Category[]; res: Partial<Record<ResourceType, number>> };
  /** Abarata los edificios: multiplica su costo. */
  buildingCost?: Partial<Record<ResourceType, number>>;
}

const BASE_TECHS: Record<BaseTechId, TechDef> = {
  era2: {
    label: 'Advance to the Medieval Age', description: 'Unique units and building of your people, upgrades, market, stable, archery range and tech center.',
    cost: { food: 500, metal: 150 }, time: 60, era: 1, requires: 'barracks', advancesTo: 2,
  },
  era3: {
    label: 'Advance to the Industrial Age', description: 'Firearms, artillery, factories and vehicles.',
    cost: { food: 1600, stone: 500, metal: 800 }, time: 180, era: 2, requires: 'tech_center', advancesTo: 3,
  },
  era4: {
    label: 'Advance to the Modern Age', description: 'Tanks, anti-tank teams, mechanized infantry, heavy artillery and airplanes.',
    cost: { food: 6000, wood: 3000, stone: 3000, metal: 6000 }, time: 300, era: 3, requires: 'factory', advancesTo: 4,
  },
  // ---- Economía ----
  tools: {
    label: 'Tools', description: 'Workers gather wood, stone and metal 15% faster.',
    cost: { food: 100, wood: 100 }, time: 30, era: 1, gather: { wood: 1.15, stone: 1.15, metal: 1.15 },
  },
  wheelbarrow: {
    label: 'Wheelbarrow', description: 'Workers carry 5 more and walk 10% faster.',
    cost: { food: 150, wood: 100 }, time: 40, era: 2, carry: 5, units: { worker: { speed: 1.1 } },
  },
  plow: {
    label: 'Plow', description: 'Farms produce 25% faster.',
    cost: { food: 100, wood: 150 }, time: 40, era: 2, farm: 1.25,
  },
  hand_cart: {
    label: 'Hand Cart', description: 'Workers carry 5 more and walk 10% faster.',
    cost: { food: 300, wood: 200 }, time: 55, era: 3, carry: 5, units: { worker: { speed: 1.1 } },
  },
  double_axe: {
    label: 'Double-Bit Axe', description: 'Workers chop wood 20% faster.',
    cost: { food: 100, wood: 50 }, time: 25, era: 2, gather: { wood: 1.2 },
  },
  stone_mining: {
    label: 'Stone Mining', description: 'Workers mine stone 20% faster.',
    cost: { food: 100, wood: 75 }, time: 30, era: 2, gather: { stone: 1.2 },
  },
  metal_mining: {
    label: 'Metal Mining', description: 'Workers mine metal 20% faster.',
    cost: { food: 100, wood: 75 }, time: 30, era: 2, gather: { metal: 1.2 },
  },
  horse_collar: {
    label: 'Horse Collar', description: 'Farms produce 20% faster.',
    cost: { food: 75, wood: 75 }, time: 25, era: 2, farm: 1.2,
  },
  bow_saw: {
    label: 'Bow Saw', description: 'Workers chop wood 20% faster.',
    cost: { food: 200, wood: 100 }, time: 40, era: 3, gather: { wood: 1.2 },
  },
  shaft_mining: {
    label: 'Shaft Mining', description: 'Workers mine stone and metal 20% faster.',
    cost: { food: 200, wood: 150 }, time: 45, era: 3, gather: { stone: 1.2, metal: 1.2 },
  },
  // ---- Militares generales ----
  forge: {
    label: 'Forge', description: 'Infantry and cavalry: +15% attack.',
    cost: { food: 150, metal: 100 }, time: 45, era: 2, units: { infantry: { attack: 1.15 }, cavalry: { attack: 1.15 } },
  },
  armor_tech: {
    label: 'Armor', description: 'Infantry and cavalry: +1 armor.',
    cost: { food: 150, metal: 150 }, time: 45, era: 2, units: { infantry: { armor: 1 }, cavalry: { armor: 1 } },
  },
  masonry: {
    label: 'Masonry', description: 'All buildings: +20% hit points.',
    cost: { wood: 100, stone: 150 }, time: 45, era: 2, buildingHp: 1.2,
  },
  ballistics: {
    label: 'Ballistics', description: 'Ranged units and artillery: +20% attack and +1 range.',
    cost: { food: 150, metal: 250 }, time: 60, era: 3,
    units: { ranged: { attack: 1.2, range: 1 }, siege: { attack: 1.2, range: 1 } },
  },
  machinery: {
    label: 'Machinery', description: 'All gathering is 20% faster.',
    cost: { wood: 200, metal: 200 }, time: 60, era: 3, gather: { food: 1.2, wood: 1.2, stone: 1.2, metal: 1.2 },
  },
  plating: {
    label: 'Plating', description: 'Tanks and airplanes: +15% hit points and +2 armor.',
    cost: { metal: 400 }, time: 75, era: 4, units: { armor: { hp: 1.15, armor: 2 }, air: { hp: 1.15, armor: 2 } },
  },
  // ---- Eficiencia: unidades y edificios más baratos ----
  supplies: {
    label: 'Supplies', description: 'Infantry costs 20% less food.',
    cost: { food: 150, wood: 100 }, time: 35, era: 2, unitCost: { cats: ['infantry'], res: { food: 0.8 } },
  },
  horse_breeding: {
    label: 'Horse Breeding', description: 'Cavalry costs 20% less food.',
    cost: { food: 150, wood: 150 }, time: 40, era: 2, unitCost: { cats: ['cavalry'], res: { food: 0.8 } },
  },
  woodworking: {
    label: 'Woodworking Guild', description: 'All units cost 20% less wood (bows, spears, siege engines).',
    cost: { food: 150, wood: 100 }, time: 40, era: 2, unitCost: { res: { wood: 0.8 } },
  },
  standard_arms: {
    label: 'Standardized Arms', description: 'All units cost 20% less metal.',
    cost: { food: 250, wood: 150 }, time: 50, era: 2, unitCost: { res: { metal: 0.8 } },
  },
  masons_guild: {
    label: "Masons' Guild", description: 'All buildings, walls and towers cost 25% less stone.',
    cost: { food: 150, wood: 100 }, time: 40, era: 2, buildingCost: { stone: 0.75 },
  },
  iron_casting: {
    label: 'Iron Casting', description: 'Siege and artillery cost 25% less metal and wood.',
    cost: { food: 200, metal: 100 }, time: 45, era: 3, unitCost: { cats: ['siege'], res: { metal: 0.75, wood: 0.75 } },
  },
  mass_production: {
    label: 'Mass Production', description: 'All units cost 15% less wood and metal.',
    cost: { wood: 300, metal: 300 }, time: 60, era: 3, unitCost: { res: { wood: 0.85, metal: 0.85 } },
  },
  // ---- Evoluciones de unidades (como en AoE) ----
  man_at_arms: {
    label: 'Man-at-Arms', description: 'Warriors become Men-at-Arms: +30% health, +35% attack, +1 armor.',
    cost: { food: 100, wood: 60 }, time: 35, era: 1,
    unitMods: { warrior: { hp: 1.3, attack: 1.35, armor: 1 } }, rename: { warrior: 'Man-at-Arms' },
  },
  pikeman: {
    label: 'Pikeman', description: 'Spearmen become Pikemen: +30% health, +40% attack.',
    cost: { food: 150, wood: 120 }, time: 40, era: 2,
    unitMods: { spearman: { hp: 1.3, attack: 1.4 } }, rename: { spearman: 'Pikeman' },
  },
  crossbow: {
    label: 'Crossbowman', description: 'Archers become Crossbowmen: +40% attack, +15% health, +1 range.',
    cost: { food: 125, metal: 75 }, time: 40, era: 2,
    unitMods: { archer: { attack: 1.4, hp: 1.15, range: 1 } }, rename: { archer: 'Crossbowman' },
  },
  light_cavalry: {
    label: 'Light Cavalry', description: 'Scouts become Light Cavalry: +50% health, +50% attack, +1 armor.',
    cost: { food: 150, metal: 50 }, time: 40, era: 2,
    unitMods: { scout: { hp: 1.5, attack: 1.5, armor: 1 } }, rename: { scout: 'Light Cavalry' },
  },
  cavalier: {
    label: 'Cavalier', description: 'Knights become Cavaliers: +25% health, +25% attack, +1 armor.',
    cost: { food: 250, metal: 150 }, time: 50, era: 2,
    unitMods: { knight: { hp: 1.25, attack: 1.25, armor: 1 } }, rename: { knight: 'Cavalier' },
  },
  veteran_riflemen: {
    label: 'Veteran Riflemen', description: 'Riflemen become veterans: +30% health, +20% attack.',
    cost: { food: 200, metal: 150 }, time: 50, era: 3,
    unitMods: { rifleman: { hp: 1.3, attack: 1.2 } }, rename: { rifleman: 'Veteran Rifleman' },
  },
  armored_cars: {
    label: 'Armored Cars', description: 'Light vehicles become Armored Cars: +30% health, +1 armor.',
    cost: { metal: 250 }, time: 50, era: 3,
    unitMods: { light_vehicle: { hp: 1.3, armor: 1 } }, rename: { light_vehicle: 'Armored Car' },
  },
};

/** Élites: nombre especial y mejora extra para algunas (p. ej. el arco recurvo mongol). */
const ELITE: Partial<Record<UniqueUnitType, { name: string; mods: StatMods; note: string }>> = {
  legionary: { name: 'Praetorian', mods: { hp: 1.3, attack: 1.25, armor: 2 }, note: "the emperor's own guard: +30% health, +25% attack, +2 armor" },
  scorpion: { name: 'Heavy Scorpion', mods: { attack: 1.3, hp: 1.25, range: 1 }, note: '+30% attack, +25% health, +1 range' },
  horse_archer: { name: 'Elite Horse Archer', mods: { attack: 1.35, hp: 1.25, armor: 1, range: 1 }, note: 'recurve bow: +35% attack, +1 range, +25% health, +1 armor' },
  keshig: { name: "Khan's Keshig", mods: { hp: 1.3, attack: 1.3, armor: 1, speed: 1.05 }, note: '+30% health and attack, +1 armor, +5% speed' },
  berserker: { name: 'Elite Berserker', mods: { hp: 1.3, attack: 1.25, regen: 1 }, note: '+30% health, +25% attack, heals 1 more health per second' },
};

function eliteTechs(): Record<`elite_${UniqueUnitType}`, TechDef> {
  const out = {} as Record<`elite_${UniqueUnitType}`, TechDef>;
  for (const u of UNIQUE_UNITS) {
    const d = UNIT_DEFS[u];
    const e = ELITE[u] ?? { name: `Elite ${d.label}`, mods: { hp: 1.25, attack: 1.25, armor: 1 }, note: '+25% health, +25% attack, +1 armor' };
    out[`elite_${u}`] = {
      label: e.name,
      description: `${d.label} becomes ${e.name}: ${e.note}.`,
      cost: { food: 250, metal: 200 }, time: 60, era: 2, faction: d.faction,
      unitMods: { [u]: e.mods }, rename: { [u]: e.name },
    };
  }
  return out;
}

export const TECH_DEFS: Record<TechId, TechDef> = { ...BASE_TECHS, ...eliteTechs() };

/** ¿Es un avance de era? */
export function isEraTech(t: TechId): boolean {
  return TECH_DEFS[t].advancesTo !== undefined;
}

/** ¿Es la evolución de una unidad (Piquero, élites…)? */
export function isUpgradeTech(t: TechId): boolean {
  return TECH_DEFS[t].unitMods !== undefined;
}

// ---------- Facciones ----------
/**
 * Pueblos históricos de la Edad Media (estilo Total War). Cada uno tiene
 * especialidades: algunos tipos de unidad son más fuertes y otros más débiles
 * (multiplicadores: 1.2 = +20 %). Además, al llegar a la Edad Media cada
 * pueblo desbloquea su edificio único y dos unidades únicas.
 */
export type FactionId = 'romans' | 'mongols' | 'gauls' | 'germans' | 'visigoths' | 'ostrogoths' | 'vikings';
export interface FactionDef {
  name: string;
  motto: string;
  units: Partial<Record<Category, StatMods>>;
  gather?: Partial<Record<ResourceType, number>>;
  /** Multiplicador de la vida de los edificios. */
  buildingHp?: number;
  /** Habilidades especiales (mecánicas propias de este pueblo). */
  traits?: {
    /** Velocidad de construcción de los trabajadores. */
    buildSpeed?: number;
    /** Velocidad de entrenamiento por tipo de unidad. */
    trainSpeed?: Partial<Record<Category, number>>;
    /** Curación propia por tipo de unidad (vida por segundo). */
    regen?: Partial<Record<Category, number>>;
    /** Multiplicador de la carga de caballería (reemplaza al normal). */
    charge?: number;
  };
  strengths: string[];
  weaknesses: string[];
  /** Habilidades explicadas para la interfaz. */
  abilities: string[];
}
export const FACTIONS: Record<FactionId, FactionDef> = {
  romans: {
    name: 'Romans',
    motto: 'Discipline conquers the world',
    units: { infantry: { hp: 1.15, armor: 1 }, siege: { attack: 1.15 }, cavalry: { attack: 0.85 } },
    buildingHp: 1.1,
    strengths: ['Infantry: +15% health and +1 armor', 'Siege: +15% attack', 'Buildings: +10% health'],
    weaknesses: ['Cavalry: −15% attack'],
    traits: { buildSpeed: 1.3 },
    abilities: ['Roman engineering: workers build 30% faster', 'The Castrum shoots arrows like a fort'],
  },
  mongols: {
    name: 'Mongols',
    motto: 'The steppe is our home, the horse our wall',
    units: { cavalry: { speed: 1.15, attack: 1.1 }, infantry: { hp: 0.8 } },
    gather: { food: 1.1 },
    buildingHp: 0.85,
    strengths: ['Cavalry: +15% speed and +10% attack', 'Food: +10% gathering'],
    weaknesses: ['Infantry: −20% health', 'Buildings: −15% health'],
    traits: { trainSpeed: { cavalry: 1.25 } },
    abilities: ['Steppe riders: cavalry trains 25% faster', 'The Ordu gives +10 population'],
  },
  gauls: {
    name: 'Gauls',
    motto: 'The forest fights with us',
    units: { infantry: { attack: 1.15, speed: 1.05 }, ranged: { attack: 0.9 } },
    gather: { wood: 1.15 },
    buildingHp: 0.9,
    strengths: ['Infantry: +15% attack and +5% speed', 'Wood: +15% gathering'],
    weaknesses: ['Ranged: −10% attack', 'Buildings: −10% health'],
    abilities: ['Druids: the Nemeton heals your units nearby (+2 health per second)'],
  },
  germans: {
    name: 'Germans',
    motto: 'From the dark woods we strike',
    units: { infantry: { hp: 1.1 }, siege: { attack: 0.8 } },
    gather: { food: 1.1, wood: 1.1 },
    strengths: ['Infantry: +10% health', 'Food and wood: +10% gathering'],
    weaknesses: ['Siege: −20% attack'],
    traits: { trainSpeed: { infantry: 1.25 } },
    abilities: ['Barbarian hordes: infantry trains 25% faster', 'The War Hall is a food and wood drop-off'],
  },
  visigoths: {
    name: 'Visigoths',
    motto: 'Heirs of Rome, masters of Hispania',
    units: { cavalry: { hp: 1.15 }, ranged: { range: 1 }, infantry: { attack: 0.9 } },
    strengths: ['Cavalry: +15% health', 'Ranged: +1 range'],
    weaknesses: ['Infantry: −10% attack'],
    traits: { charge: 1.8 },
    abilities: ['Heavy charge: cavalry charges deal ×1.8 damage', 'The Royal Hall is a drop-off for all resources'],
  },
  ostrogoths: {
    name: 'Ostrogoths',
    motto: 'The lance of Theodoric',
    units: { cavalry: { attack: 1.2 }, ranged: { attack: 0.85 } },
    gather: { stone: 1.15 },
    strengths: ['Cavalry: +20% attack', 'Stone: +15% gathering'],
    weaknesses: ['Ranged: −15% attack'],
    traits: { charge: 2.2 },
    abilities: ['Lance of Theodoric: cavalry charges deal ×2.2 damage', 'The Royal Palace gives +5 population'],
  },
  vikings: {
    name: 'Vikings',
    motto: 'Valhalla awaits the brave',
    units: { infantry: { attack: 1.1, speed: 1.1 }, cavalry: { hp: 0.75 } },
    gather: { wood: 1.1, metal: 1.1 },
    strengths: ['Infantry: +10% attack and +10% speed', 'Wood and metal: +10% gathering'],
    weaknesses: ['Cavalry: −25% health'],
    traits: { regen: { infantry: 0.5 } },
    abilities: ['Berserkergang: infantry heals 0.5 health per second', 'Berserkers heal even faster'],
  },
};
export const FACTION_ORDER: readonly FactionId[] = ['romans', 'mongols', 'gauls', 'germans', 'visigoths', 'ostrogoths', 'vikings'];
/** Unidades y edificio únicos de un pueblo (para mostrarlos en la sala de espera). */
export function uniquesOf(faction: FactionId): { units: UnitType[]; building: BuildingType | undefined } {
  return {
    units: (Object.keys(UNIT_DEFS) as UnitType[]).filter((u) => UNIT_DEFS[u].faction === faction),
    building: (Object.keys(BUILDING_DEFS) as BuildingType[]).find((b) => BUILDING_DEFS[b].faction === faction),
  };
}

/** Carga de caballería: tras unos segundos sin pelear, el primer golpe cuerpo a cuerpo hace más daño. */
export const CHARGE_BONUS = 1.5;
export const CHARGE_READY_SEC = 4;

// ---------- Diplomacia ----------
/** Relación entre dos jugadores: en guerra, en paz (no se atacan) o aliados. */
export type Relation = 'war' | 'peace' | 'ally';
export const RELATIONS: readonly Relation[] = ['war', 'peace', 'ally'];
export const RELATION_LABELS: Record<Relation, string> = { war: 'At war', peace: 'At peace', ally: 'Allies' };
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
