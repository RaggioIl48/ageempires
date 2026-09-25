// Estado completo de la partida en el servidor. Nada de red aquí: la
// simulación se puede probar sin sockets ni navegador.

import {
  BUILDING_DEFS,
  FACTION_ORDER,
  NODE_DEFS,
  POP_CAP_MAX,
  RESOURCE_TYPES,
  STARTING_RESOURCES,
  TILE_GRASS,
  TICK_RATE,
  UNIT_DEFS,
  type BuildingType,
  type Cost,
  type FactionId,
  type Relation,
  type NodeType,
  type ResourceType,
  type Resources,
  type TechId,
  type UnitType,
} from '../../../shared/data.ts';
import type { GameEvent, UnitState } from '../../../shared/protocol.ts';
import type { PendingWar, Proposal } from './diplomacy.ts';
import { buildingMaxHp, canAfford, unitStats, type UnitStats } from '../../../shared/stats.ts';

/** Valor de `solid` para las puertas: bloquean solo a quien no es aliado. */
export const GATE = 2;

export interface Point {
  x: number;
  y: number;
}

/** Lo que está haciendo una unidad por orden del jugador (o por reacción propia). */
export type Task =
  /** Recolectar de un nodo del mapa o de una granja (targetId). */
  | { kind: 'gather'; targetId: number; resource: ResourceType; tx: number; ty: number }
  /** Construir o reparar un edificio propio. */
  | { kind: 'build'; targetId: number }
  /** Atacar. `auto` = lo eligió la unidad sola (no el jugador). */
  | { kind: 'attack'; targetId: number; auto: boolean };

export interface Unit {
  id: number;
  owner: number;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  state: UnitState;
  path: Point[]; // puntos de paso pendientes (en casillas)
  task: Task | null;
  carryType: ResourceType | null;
  carryAmount: number;
  gatherProgress: number; // fracción acumulada hasta el siguiente punto de recurso
  failedPaths: number; // llegadas seguidas "fuera de alcance"
  cooldown: number; // segundos hasta poder volver a atacar
  /** Hacia dónde apuntaba el último camino de persecución (para no recalcular a cada paso). */
  chaseGoal: Point | null;
  repathIn: number; // pasos hasta poder recalcular la persecución
}

export interface ResourceNode {
  id: number;
  type: NodeType;
  tx: number;
  ty: number;
  amount: number;
}

/** Algo en la cola de un edificio: una unidad o una tecnología. */
export interface QueueItem {
  unit?: UnitType;
  tech?: TechId;
  progress: number;
}

export interface Building {
  id: number;
  owner: number;
  type: BuildingType;
  tx: number;
  ty: number;
  size: number;
  hp: number;
  maxHp: number;
  /** 0..1; el edificio funciona solo cuando llega a 1. */
  progress: number;
  queue: QueueItem[];
  /** Punto de reunión; targetId = recurso donde las unidades nuevas se ponen a trabajar. */
  rally: { x: number; y: number; targetId: number } | null;
  /** Granjas: comida restante y quién la trabaja. */
  food: number;
  farmerId: number;
  /** Producción detenida por falta de población. */
  needsHouses: boolean;
  cooldown: number; // edificios que disparan
  /** Fracciones de recurso pendientes de cobrar al reparar (se cobra por unidades enteras). */
  repairOwed: Resources;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  faction: FactionId;
  connected: boolean;
  resources: Resources;
  start: Point; // centro de la zona de inicio
  /** Entregas recientes (para calcular producción por minuto). */
  deposits: { tick: number; type: ResourceType; amount: number }[];
  /** Avisos pendientes de enviar a este jugador. */
  notices: string[];
  lastAttackNotice: number; // tick del último "¡Te atacan!"
  /** Estadísticas para el resumen final. */
  gathered: number;
  kills: number;
  /** Era actual (1 = Tribal … 4 = Moderna). */
  era: number;
  /** Tecnologías investigadas (máscara de bits, ver stats.ts). */
  techs: number;
}

export class World {
  readonly size: number;
  readonly tiles: Uint8Array;
  /** id del nodo o edificio que ocupa cada casilla (0 = libre). */
  readonly occupant: Int32Array;
  /** 1 = no se puede caminar (nodo o edificio sólido). */
  readonly solid: Uint8Array;
  readonly units = new Map<number, Unit>();
  readonly nodes = new Map<number, ResourceNode>();
  readonly buildings = new Map<number, Building>();
  readonly players = new Map<number, Player>();
  tick = 0;
  private nextId = 1;

  // Cambios de nodos desde el último envío (el servidor los manda y los limpia).
  readonly changedNodes = new Set<number>();
  readonly removedNodes: number[] = [];
  /** Efectos de este paso (disparos, muertes…). */
  events: GameEvent[] = [];

  // Diplomacia (ver diplomacy.ts). Por defecto, todos en guerra (todos contra todos).
  private readonly relations = new Map<number, Relation>();
  diploLocked = false;
  /** Sube con cada cambio diplomático (para mandarlo a los clientes solo cuando cambia). */
  diploVersion = 0;
  proposals: Proposal[] = [];
  pendingWars: PendingWar[] = [];
  /** Sube cuando algún jugador cambia de era o investiga algo. */
  techVersion = 0;
  /**
   * Dueño de la unidad que está buscando camino ahora: las puertas dejan pasar
   * a su dueño y a sus aliados (0 = nadie).
   */
  walker = 0;

  constructor(size: number) {
    this.size = size;
    this.tiles = new Uint8Array(size * size).fill(TILE_GRASS);
    this.occupant = new Int32Array(size * size);
    this.solid = new Uint8Array(size * size);
  }

  newId(): number {
    return this.nextId++;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size;
  }

  /** ¿Puede una unidad terrestre pisar esta casilla? (las puertas dependen de `walker`) */
  isWalkable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * this.size + tx;
    if (this.tiles[i] !== TILE_GRASS) return false;
    const s = this.solid[i];
    if (s === 0) return true;
    if (s !== GATE || this.walker === 0) return false;
    const gate = this.buildings.get(this.occupant[i]);
    return !!gate && this.relation(this.walker, gate.owner) === 'ally';
  }

  /** ¿Casilla de pasto sin nada encima? (para colocar cosas) */
  isFree(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * this.size + tx;
    return this.tiles[i] === TILE_GRASS && this.occupant[i] === 0;
  }

  // ---------- Jugadores ----------

  addPlayer(id: number, name: string, color: string, start: Point, faction?: FactionId): Player {
    const p: Player = {
      id,
      name,
      color,
      faction: faction ?? FACTION_ORDER[(id - 1) % FACTION_ORDER.length],
      connected: false,
      resources: { ...STARTING_RESOURCES },
      start,
      deposits: [],
      notices: [],
      lastAttackNotice: -Infinity,
      gathered: 0,
      kills: 0,
      era: 1,
      techs: 0,
    };
    this.players.set(id, p);
    return p;
  }

  factionOf(playerId: number): FactionId {
    return this.players.get(playerId)?.faction ?? 'romans';
  }

  notify(playerId: number, text: string): void {
    const p = this.players.get(playerId);
    if (p && !p.notices.includes(text)) p.notices.push(text);
  }

  /** Aviso para todos los jugadores (noticias diplomáticas). */
  announce(text: string): void {
    for (const id of this.players.keys()) this.notify(id, text);
    this.news.push(text);
    if (this.news.length > 30) this.news.shift();
    this.newsCount++;
  }
  /** Últimas noticias (para el profesor que mira) y cuántas hubo en total. */
  news: string[] = [];
  newsCount = 0;

  relation(a: number, b: number): Relation {
    if (a === b) return 'ally';
    return this.relations.get(Math.min(a, b) * 1000 + Math.max(a, b)) ?? 'war';
  }

  setRelation(a: number, b: number, r: Relation): void {
    if (a === b) return;
    this.relations.set(Math.min(a, b) * 1000 + Math.max(a, b), r);
    this.diploVersion++;
  }

  canAfford(playerId: number, cost: Cost): boolean {
    const p = this.players.get(playerId);
    return !!p && canAfford(p.resources, cost);
  }

  /** Cobra el costo si alcanza. Devuelve false (y no cobra nada) si no alcanza. */
  spend(playerId: number, cost: Cost): boolean {
    const p = this.players.get(playerId);
    if (!p || !canAfford(p.resources, cost)) return false;
    for (const r of RESOURCE_TYPES) p.resources[r] -= cost[r] ?? 0;
    return true;
  }

  refund(playerId: number, cost: Cost): void {
    const p = this.players.get(playerId);
    if (!p) return;
    for (const r of RESOURCE_TYPES) p.resources[r] += cost[r] ?? 0;
  }

  // ---------- Nodos de recursos ----------

  addNode(type: NodeType, tx: number, ty: number): ResourceNode | null {
    if (!this.isFree(tx, ty)) return null;
    const node: ResourceNode = { id: this.newId(), type, tx, ty, amount: NODE_DEFS[type].amount };
    this.nodes.set(node.id, node);
    const i = ty * this.size + tx;
    this.occupant[i] = node.id;
    this.solid[i] = 1;
    return node;
  }

  removeNode(id: number): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    const i = node.ty * this.size + node.tx;
    this.occupant[i] = 0;
    this.solid[i] = 0;
    this.changedNodes.delete(id);
    this.removedNodes.push(id);
  }

  /** Nodo que ocupa la casilla, si hay. */
  nodeAt(tx: number, ty: number): ResourceNode | undefined {
    if (!this.inBounds(tx, ty)) return undefined;
    return this.nodes.get(this.occupant[ty * this.size + tx]);
  }

  // ---------- Edificios ----------

  /** Motivo por el que no se puede colocar ahí, o null si se puede. */
  placementError(type: BuildingType, tx: number, ty: number): string | null {
    const s = BUILDING_DEFS[type].size;
    for (let y = ty; y < ty + s; y++)
      for (let x = tx; x < tx + s; x++) {
        if (!this.inBounds(x, y)) return 'You cannot build outside the map';
        if (!this.isFree(x, y)) return 'You cannot build there';
      }
    return null;
  }

  /** Coloca un edificio (terminado o como cimiento). Aparta a las unidades que estorban. */
  addBuilding(type: BuildingType, owner: number, tx: number, ty: number, built = true): Building | null {
    if (this.placementError(type, tx, ty)) return null;
    const def = BUILDING_DEFS[type];
    const maxHp = buildingMaxHp(this.factionOf(owner), type, this.techsOf(owner));
    const b: Building = {
      id: this.newId(),
      owner,
      type,
      tx,
      ty,
      size: def.size,
      hp: built ? maxHp : 1,
      maxHp,
      progress: built ? 1 : 0,
      queue: [],
      rally: null,
      food: def.food ?? 0,
      farmerId: 0,
      needsHouses: false,
      cooldown: 0,
      repairOwed: { food: 0, wood: 0, stone: 0, metal: 0 },
    };
    this.buildings.set(b.id, b);
    for (let y = ty; y < ty + def.size; y++)
      for (let x = tx; x < tx + def.size; x++) {
        this.occupant[y * this.size + x] = b.id;
        if (def.solid) this.solid[y * this.size + x] = type === 'gate' ? GATE : 1;
      }
    if (def.solid) this.pushUnitsOut(b);
    return b;
  }

  removeBuilding(id: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    this.buildings.delete(id);
    for (let y = b.ty; y < b.ty + b.size; y++)
      for (let x = b.tx; x < b.tx + b.size; x++) {
        this.occupant[y * this.size + x] = 0;
        this.solid[y * this.size + x] = 0;
      }
  }

  /** Las unidades que quedaron dentro de un edificio nuevo salen a la casilla libre más cercana. */
  private pushUnitsOut(b: Building): void {
    for (const u of this.units.values()) {
      if (this.statsOf(u).flies) continue; // los aviones pasan por encima
      const tx = Math.floor(u.x), ty = Math.floor(u.y);
      if (tx < b.tx || ty < b.ty || tx >= b.tx + b.size || ty >= b.ty + b.size) continue;
      const spot = freeTilesAround(this, tx, ty, 1)[0];
      if (spot) {
        u.x = spot.x + 0.5;
        u.y = spot.y + 0.5;
        u.path = [];
      }
    }
  }

  // ---------- Unidades ----------

  addUnit(type: UnitType, owner: number, x: number, y: number): Unit {
    const u: Unit = {
      id: this.newId(),
      owner,
      type,
      x,
      y,
      hp: unitStats(this.factionOf(owner), type, this.techsOf(owner)).hp,
      state: 'idle',
      path: [],
      task: null,
      carryType: null,
      carryAmount: 0,
      gatherProgress: 0,
      failedPaths: 0,
      cooldown: 0,
      chaseGoal: null,
      repathIn: 0,
    };
    this.units.set(u.id, u);
    return u;
  }

  statsOf(u: Unit): UnitStats {
    return unitStats(this.factionOf(u.owner), u.type, this.techsOf(u.owner));
  }

  /** Tecnologías investigadas por un jugador (máscara). */
  techsOf(playerId: number): number {
    return this.players.get(playerId)?.techs ?? 0;
  }

  eraOf(playerId: number): number {
    return this.players.get(playerId)?.era ?? 1;
  }

  // ---------- Economía ----------

  popOf(playerId: number): { pop: number; popCap: number } {
    let pop = 0;
    for (const u of this.units.values()) if (u.owner === playerId) pop += UNIT_DEFS[u.type].pop;
    let popCap = 0;
    for (const b of this.buildings.values())
      if (b.owner === playerId && b.progress >= 1) popCap += BUILDING_DEFS[b.type].popProvided;
    return { pop, popCap: Math.min(popCap, POP_CAP_MAX) };
  }

  /** Registra una entrega de recursos y la suma al jugador. */
  deposit(playerId: number, type: ResourceType, amount: number): void {
    const p = this.players.get(playerId);
    if (!p || amount <= 0) return;
    p.resources[type] += amount;
    p.gathered += amount;
    p.deposits.push({ tick: this.tick, type, amount });
  }

  /** Recursos entregados en los últimos 60 segundos (descarta las entregas más viejas). */
  perMinute(playerId: number): Resources {
    const out: Resources = { food: 0, wood: 0, stone: 0, metal: 0 };
    const p = this.players.get(playerId);
    if (!p) return out;
    const oldest = this.tick - 60 * TICK_RATE;
    while (p.deposits.length > 0 && p.deposits[0].tick <= oldest) p.deposits.shift();
    for (const d of p.deposits) out[d.type] += d.amount;
    return out;
  }

  /** ¿Tiene el rectángulo alguna casilla libre alrededor? (p. ej. un árbol del borde del bosque) */
  isExposed(tx: number, ty: number, size = 1): boolean {
    for (let y = ty - 1; y <= ty + size; y++)
      for (let x = tx - 1; x <= tx + size; x++) {
        const inside = x >= tx && x < tx + size && y >= ty && y < ty + size;
        if (!inside && this.isWalkable(x, y)) return true;
      }
    return false;
  }
}

/** Distancia desde un punto hasta el rectángulo de un edificio (0 si está dentro). */
export function distanceToRect(x: number, y: number, tx: number, ty: number, size: number): number {
  const dx = Math.max(tx - x, 0, x - (tx + size));
  const dy = Math.max(ty - y, 0, y - (ty + size));
  return Math.hypot(dx, dy);
}

/**
 * Las `count` casillas transitables más cercanas a (cx, cy), en orden de distancia.
 * `accept` permite filtrar más (p. ej. solo casillas alcanzables).
 */
export function freeTilesAround(
  world: World,
  cx: number,
  cy: number,
  count: number,
  accept: (x: number, y: number) => boolean = () => true,
): Point[] {
  const out: Point[] = [];
  for (let r = 0; r < 30 && out.length < count; r++) {
    const ring: Point[] = [];
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r && world.isWalkable(x, y) && accept(x, y))
          ring.push({ x, y });
    ring.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    for (const p of ring) if (out.length < count) out.push(p);
  }
  return out;
}
