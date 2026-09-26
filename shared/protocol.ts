// Protocolo cliente <-> servidor: mensajes JSON por WebSocket.
// El servidor es autoritativo: el cliente solo envía INTENCIONES (órdenes) y
// dibuja lo que el servidor le cuenta. Nunca decide recursos, vida ni resultados.

import {
  BUILDING_DEFS,
  CHAT_MAX,
  DIPLO_ACTIONS,
  FACTIONS,
  PLAYER_COLORS,
  TECH_DEFS,
  TRADE_RESOURCES,
  UNIT_DEFS,
  type BuildingType,
  type DiploAction,
  type FactionId,
  type NodeType,
  type ResourceType,
  type Resources,
  type TechId,
  type TradeResource,
  type UnitType,
} from './data.ts';
import type { BuildingTuple, EventTuple, UnitTuple } from './codec.ts';

// ---------- Vistas (lo que el cliente puede saber) ----------

export type UnitState =
  | 'idle'
  | 'moving'
  | 'toResource'
  | 'gathering'
  | 'returning'
  | 'toBuild'
  | 'building'
  | 'attacking';

export interface UnitView {
  id: number;
  owner: number;
  type: UnitType;
  x: number; // posición en casillas (float, centro de la unidad)
  y: number;
  hp: number;
  state: UnitState;
  /** 1 si está caminando (para animar). */
  walk?: 1;
  /** Recurso que está recolectando (tarea actual), si tiene una. */
  task?: ResourceType;
  carryType?: ResourceType;
  carryAmount?: number;
  /** Objetivo de ataque o de construcción. */
  targetId?: number;
  /** Cuadrilla: trabajadores que recogen lo mismo cerca (contándolo), si son 2 o más. */
  crew?: number;
}

export interface NodeView {
  id: number;
  type: NodeType;
  tx: number;
  ty: number;
  amount: number;
}

/** En la cola: una unidad o una tecnología. */
export interface QueueItemView {
  unit?: UnitType;
  tech?: TechId;
  progress: number; // 0..1, solo avanza el primero
}

export interface BuildingView {
  id: number;
  owner: number;
  type: BuildingType;
  tx: number; // casilla superior izquierda
  ty: number;
  hp: number;
  /** 0..1 mientras está en construcción; 1 = terminado. */
  progress: number;
  /** Campos de trabajo (granja, cantera, mina): recurso que les queda. */
  stock?: number;
  /** Solo para el dueño: cola de producción, punto de reunión y si falta población. */
  queue?: QueueItemView[];
  rally?: { x: number; y: number };
  needsHouses?: 1;
}

export interface PlayerView {
  id: number;
  name: string;
  color: string;
  faction: FactionId;
  connected: boolean;
}

/** Resumen económico: solo lo recibe el dueño (y el profesor). */
export interface EconomyView {
  resources: Resources;
  pop: number;
  popCap: number;
  /** Trabajadores por tarea. 'idle' = sin nada que hacer. */
  workers: Record<ResourceType | 'idle' | 'other', number>;
  /** Recurso entregado en el último minuto. */
  perMinute: Resources;
}

/** Cosas que pasaron en este paso (para efectos visuales). */
export type GameEvent =
  /** s: 0 flecha, 1 bala, 2 proyectil de cañón. */
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; s?: number }
  /** c: 1 = golpe de carga (más grande). */
  | { k: 'hit'; x: number; y: number; c?: 1 }
  | { k: 'death'; x: number; y: number }
  /** Entrega con bonificación de cuadrilla: o = dueño, r = recurso (índice), n = cantidad. */
  | { k: 'gain'; x: number; y: number; o: number; r: number; n: number }
  | { k: 'destroyed'; x: number; y: number; size: number };

export interface MapView {
  size: number;
  /** Casillas comprimidas por tramos: [valor, cantidad, valor, cantidad, …] fila por fila. */
  tilesRle: number[];
}

// ---------- Salas (lobby) ----------

export type MapSize = 'small' | 'normal' | 'large';

/** Opciones que el profesor elige al crear la partida. */
export interface RoomSettings {
  maxPlayers: number; // 1..16
  mapSize: MapSize;
  /** Duración máxima en minutos (0 = sin límite). */
  durationMin: number;
  /** 'free' = alianzas y guerras pueden cambiar en la partida; 'locked' = los equipos no cambian. */
  diplomacy: 'free' | 'locked';
  /** Chat entre jugadores (el profesor puede apagarlo). */
  chat: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface MemberView {
  id: number;
  name: string;
  color: string;
  faction: FactionId;
  connected: boolean;
  /** Equipo asignado por el profesor (0 = sin equipo). */
  team: number;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  paused: boolean;
  settings: RoomSettings;
  members: MemberView[];
}

/** Resumen de una sala para la lista del profesor. */
export interface RoomSummary {
  code: string;
  phase: RoomPhase;
  paused: boolean;
  players: number;
  connected: number;
  settings: RoomSettings;
}

/** Resultado de cada jugador al terminar. */
export interface PlayerSummary {
  id: number;
  name: string;
  color: string;
  faction: FactionId;
  gathered: number;
  units: number;
  buildings: number;
  kills: number;
  era: number;
}

// ---------- Cliente -> Servidor ----------

/** Ejército en marcha forzada hacia una ciudad enemiga (o de vuelta a casa). */
export interface MarchView {
  id: number;
  owner: number;
  /** Ciudad (jugador) a la que marcha; en la vuelta, la propia. */
  target: number;
  /** Cantidad de soldados. */
  n: number;
  /** Segundos que faltan para llegar. */
  left: number;
  home: boolean;
}

/** Batalla en curso por una ciudad. a = atacante, d = defensor. */
export interface BattleView {
  id: number;
  a: number;
  d: number;
  /** Centro y radio del campo de batalla (casillas). */
  x: number;
  y: number;
  r: number;
  /** Segundos que le quedan al atacante para tomar la ciudad. */
  left: number;
  /** Fuerza (vida total de los soldados) ahora y la mayor que tuvo cada bando. */
  as: number;
  ds: number;
  a0: number;
  d0: number;
  /** Soldados caídos de cada bando. */
  al: number;
  dl: number;
}

/** Cómo terminó una batalla. */
export type BattleEnd = 'repelled' | 'fallen' | 'time' | 'retreat';

export interface BattleResultView {
  id: number;
  a: number;
  d: number;
  winner: number;
  end: BattleEnd;
  al: number;
  dl: number;
  /** Edificios del defensor destruidos. */
  buildings: number;
  /** Botín que se llevó el atacante (si la ciudad cayó). */
  loot: Partial<Record<ResourceType, number>>;
}

/** Formaciones para mover grupos. */
export const FORMATIONS = ['line', 'column', 'loose'] as const;
export type Formation = (typeof FORMATIONS)[number];

export type Command =
  /** formation: 'line' = filas (infantería adelante, a distancia detrás, caballería a los lados), 'column' = columna angosta, 'loose' = grupo suelto. */
  | { kind: 'move'; unitIds: number[]; x: number; y: number; formation?: Formation }
  /** Marcha forzada de los soldados elegidos hacia la ciudad del jugador `target`. */
  | { kind: 'march'; unitIds: number[]; target: number }
  /** El atacante se retira de una batalla: sus soldados vuelven a casa. */
  | { kind: 'retreat'; battleId: number }
  | { kind: 'stop'; unitIds: number[] }
  /** Recolectar de un recurso del mapa o de una granja propia. */
  | { kind: 'gather'; unitIds: number[]; targetId: number }
  /** Colocar un edificio nuevo y mandar a construirlo. */
  | { kind: 'build'; unitIds: number[]; building: BuildingType; tx: number; ty: number }
  /** Muralla larga de una sola orden: de (x0, y0) a (x1, y1). */
  | { kind: 'wall'; unitIds: number[]; x0: number; y0: number; x1: number; y1: number }
  /** Ayudar a construir o reparar un edificio propio. */
  | { kind: 'construct'; unitIds: number[]; targetId: number }
  | { kind: 'attack'; unitIds: number[]; targetId: number }
  | { kind: 'train'; buildingId: number; unit: UnitType }
  /** Comprar (buy) o vender un lote de un recurso en el Mercado propio. */
  | { kind: 'trade'; buildingId: number; resource: TradeResource; buy: boolean }
  /** Investigar una tecnología (o avanzar de era). */
  | { kind: 'research'; buildingId: number; tech: TechId }
  | { kind: 'cancelTrain'; buildingId: number; index: number }
  | { kind: 'rally'; buildingId: number; x: number; y: number }
  /** Eliminar unidades o edificios propios. */
  | { kind: 'delete'; ids: number[] }
  /** Diplomacia con otro jugador (proponer alianza, declarar guerra…). */
  | { kind: 'diplo'; action: DiploAction; target: number };

export type ClientMessage =
  // Estudiante
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'leave' }
  | { t: 'choose'; faction?: FactionId; color?: string }
  | { t: 'cmd'; cmd: Command }
  // Profesor
  | { t: 'teacher'; pin?: string }
  | { t: 'createRoom'; settings: RoomSettings }
  | { t: 'setSettings'; code: string; settings: RoomSettings }
  | { t: 'kick'; code: string; memberId: number }
  /** `pin`: el profesor probando como estudiante en otro computador (inicia desde la sala de espera). */
  | { t: 'start'; code: string; pin?: string }
  | { t: 'pause'; code: string; paused: boolean }
  | { t: 'end'; code: string }
  | { t: 'closeRoom'; code: string }
  | { t: 'watch'; code: string }
  | { t: 'unwatch' }
  | { t: 'setTeam'; code: string; memberId: number; team: number }
  | { t: 'chat'; text: string; to: 'all' | 'allies' };

// ---------- Servidor -> Cliente ----------

/**
 * Cambios desde el último mensaje a ESTE cliente (el primero trae todo).
 * Solo van los campos que cambiaron; todos son opcionales.
 */
export interface DeltaMessage {
  t: 'd';
  k: number; // paso de simulación
  /** Unidades nuevas o con cambios además de la posición (tupla completa). */
  u?: UnitTuple[];
  /** Unidades que solo se movieron: [id, x, y, id, x, y, …] en centésimas. */
  p?: number[];
  /** Unidades que desaparecieron. */
  ur?: number[];
  b?: BuildingTuple[];
  br?: number[];
  /** Recursos del mapa que cambiaron: [id, cantidad, id, cantidad, …]. */
  n?: number[];
  nr?: number[];
  e?: EventTuple[];
  eco?: EconomyView;
  /** Profesor: economía de todos los jugadores. */
  ecoAll?: Record<number, EconomyView>;
  no?: string[];
  /** Reloj: [segundos transcurridos, límite en segundos (0 = sin límite)]. */
  clk?: [number, number];
  /** Diplomacia (solo cuando cambia, o cada segundo si hay plazos corriendo). */
  dip?: DiploView;
  /** Era y tecnologías de cada jugador: [id, era, máscara (hexadecimal), …] (cuando cambian). */
  pt?: (number | string)[];
  /** Precios del Mercado [comida, madera, piedra] (cuando cambian). */
  mk?: number[];
  /** Guerra: marchas propias o contra uno, y batallas en curso (cuando cambian y cada segundo). */
  war?: { m: MarchView[]; b: BattleView[] };
  /** Batallas que terminaron (para mostrar el resultado). */
  res?: BattleResultView[];
}

export type ServerMessage =
  | { t: 'error'; message: string }
  /**
   * El estudiante entró a una sala. Guarda el token para poder volver.
   * `host`: está en el computador del servidor (el del profesor) y puede iniciar la partida.
   */
  | { t: 'joined'; code: string; token: string; memberId: number; host: boolean }
  | { t: 'room'; room: RoomView }
  | { t: 'kicked'; message: string }
  /** Respuesta al profesor: salas existentes y direcciones para los estudiantes. */
  | { t: 'teacherOk'; rooms: RoomSummary[]; urls: string[] }
  | { t: 'rooms'; rooms: RoomSummary[] }
  | {
      t: 'welcome';
      you: number; // 0 = observador (profesor)
      map: MapView;
      players: PlayerView[];
      /** Recursos del mapa: [id, tipo, tx, ty, cantidad, …] */
      nodes: number[];
      settings: RoomSettings;
    }
  | { t: 'players'; players: PlayerView[] }
  | DeltaMessage
  | { t: 'paused'; paused: boolean }
  | { t: 'ended'; reason: string; summary: PlayerSummary[] }
  | { t: 'chat'; from: number; name: string; color: string; text: string; to: 'all' | 'allies' };

/**
 * Estado diplomático (público: todos ven quién está con quién).
 * r: [a, b, relación] por cada par (0 guerra, 1 paz, 2 aliados)
 * p: propuestas que ve este jugador [de, para, tipo (0 alianza, 1 paz), segundos restantes]
 * w: guerras declaradas que aún no empiezan [de, para, segundos restantes]
 */
export interface DiploView {
  r: number[];
  p: number[];
  w: number[];
  /** true = los equipos no pueden cambiar. */
  locked: boolean;
}

// ---------- Validación de mensajes entrantes ----------

/** Máximo de unidades en una sola orden (evita mensajes abusivos). */
export const MAX_UNITS_PER_COMMAND = 200;
export const MAX_NAME_LENGTH = 20;
export const CODE_LENGTH = 4;
/** Letras de los códigos de sala: sin las que se confunden (O/0, I/1, L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

function isId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;
}
function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100_000;
}
function isTile(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 100_000;
}
function isIdList(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.length <= MAX_UNITS_PER_COMMAND && v.every(isId);
}
function isKey<T extends object>(obj: T, v: unknown): v is keyof T {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(obj, v);
}
function isCode(v: unknown): v is string {
  return typeof v === 'string' && v.length === CODE_LENGTH && [...v].every((c) => CODE_ALPHABET.includes(c));
}

/** Nombre limpio: sin caracteres de control, espacios recortados, largo máximo. */
export function cleanName(v: unknown): string {
  return cleanText(v, MAX_NAME_LENGTH);
}

/** Texto limpio: sin caracteres de control ni < >, espacios recortados, largo máximo. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseSettings(v: unknown): RoomSettings | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.maxPlayers) || (s.maxPlayers as number) < 1 || (s.maxPlayers as number) > 16) return null;
  if (s.mapSize !== 'small' && s.mapSize !== 'normal' && s.mapSize !== 'large') return null;
  if (!Number.isInteger(s.durationMin) || (s.durationMin as number) < 0 || (s.durationMin as number) > 240) return null;
  if (s.diplomacy !== undefined && s.diplomacy !== 'free' && s.diplomacy !== 'locked') return null;
  if (s.chat !== undefined && typeof s.chat !== 'boolean') return null;
  return {
    maxPlayers: s.maxPlayers as number,
    mapSize: s.mapSize,
    durationMin: s.durationMin as number,
    diplomacy: (s.diplomacy as RoomSettings['diplomacy'] | undefined) ?? 'free',
    chat: (s.chat as boolean | undefined) ?? true,
  };
}

/**
 * Convierte texto recibido en un ClientMessage válido, o null si es inválido.
 * Solo valida la FORMA; los permisos (¿es tu unidad?, ¿eres el profesor?) los
 * comprueba el servidor.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'cmd': {
      if (typeof m.cmd !== 'object' || m.cmd === null) return null;
      const cmd = parseCommand(m.cmd as Record<string, unknown>);
      return cmd ? { t: 'cmd', cmd } : null;
    }
    case 'join': {
      const name = cleanName(m.name);
      if (!isCode(m.code) || !name) return null;
      const token = typeof m.token === 'string' && /^[0-9a-f]{32}$/.test(m.token) ? m.token : undefined;
      return token ? { t: 'join', code: m.code, name, token } : { t: 'join', code: m.code, name };
    }
    case 'leave':
      return { t: 'leave' };
    case 'unwatch':
      return { t: 'unwatch' };
    case 'setTeam':
      return isCode(m.code) && isId(m.memberId) && Number.isInteger(m.team) && (m.team as number) >= 0 && (m.team as number) <= 8
        ? { t: 'setTeam', code: m.code, memberId: m.memberId, team: m.team as number }
        : null;
    case 'chat': {
      const text = cleanText(m.text, CHAT_MAX);
      if (!text || (m.to !== 'all' && m.to !== 'allies')) return null;
      return { t: 'chat', text, to: m.to };
    }
    case 'choose': {
      const out: ClientMessage = { t: 'choose' };
      if (m.faction !== undefined) {
        if (!isKey(FACTIONS, m.faction)) return null;
        out.faction = m.faction;
      }
      if (m.color !== undefined) {
        if (typeof m.color !== 'string' || !PLAYER_COLORS.includes(m.color)) return null;
        out.color = m.color;
      }
      return out;
    }
    case 'teacher':
      return typeof m.pin === 'string' && m.pin.length <= 12 ? { t: 'teacher', pin: m.pin } : { t: 'teacher' };
    case 'createRoom': {
      const settings = parseSettings(m.settings);
      return settings ? { t: 'createRoom', settings } : null;
    }
    case 'setSettings': {
      const settings = parseSettings(m.settings);
      return settings && isCode(m.code) ? { t: 'setSettings', code: m.code, settings } : null;
    }
    case 'kick':
      return isCode(m.code) && isId(m.memberId) ? { t: 'kick', code: m.code, memberId: m.memberId } : null;
    case 'pause':
      return isCode(m.code) && typeof m.paused === 'boolean' ? { t: 'pause', code: m.code, paused: m.paused } : null;
    case 'start':
      if (!isCode(m.code)) return null;
      return typeof m.pin === 'string' && m.pin.length <= 12 ? { t: 'start', code: m.code, pin: m.pin } : { t: 'start', code: m.code };
    case 'end':
    case 'closeRoom':
    case 'watch':
      return isCode(m.code) ? { t: m.t, code: m.code } : null;
    default:
      return null;
  }
}

function parseCommand(c: Record<string, unknown>): Command | null {
  // Órdenes sobre un edificio (no llevan lista de unidades).
  switch (c.kind) {
    case 'train':
      return isId(c.buildingId) && isKey(UNIT_DEFS, c.unit) ? { kind: 'train', buildingId: c.buildingId, unit: c.unit } : null;
    case 'trade':
      return isId(c.buildingId) && typeof c.resource === 'string' && (TRADE_RESOURCES as readonly string[]).includes(c.resource) && typeof c.buy === 'boolean'
        ? { kind: 'trade', buildingId: c.buildingId, resource: c.resource as TradeResource, buy: c.buy }
        : null;
    case 'research':
      return isId(c.buildingId) && isKey(TECH_DEFS, c.tech) ? { kind: 'research', buildingId: c.buildingId, tech: c.tech } : null;
    case 'cancelTrain':
      return isId(c.buildingId) && isTile(c.index) && c.index >= 0
        ? { kind: 'cancelTrain', buildingId: c.buildingId, index: c.index }
        : null;
    case 'rally':
      return isId(c.buildingId) && isCoord(c.x) && isCoord(c.y) ? { kind: 'rally', buildingId: c.buildingId, x: c.x, y: c.y } : null;
    case 'delete':
      return isIdList(c.ids) ? { kind: 'delete', ids: [...new Set(c.ids)] } : null;
    case 'retreat':
      return isId(c.battleId) ? { kind: 'retreat', battleId: c.battleId } : null;
    case 'diplo':
      return typeof c.action === 'string' && (DIPLO_ACTIONS as readonly string[]).includes(c.action) && isId(c.target)
        ? { kind: 'diplo', action: c.action as DiploAction, target: c.target }
        : null;
  }
  // Órdenes sobre unidades.
  if (!isIdList(c.unitIds)) return null;
  const unitIds = [...new Set(c.unitIds)];
  switch (c.kind) {
    case 'move':
      if (!isCoord(c.x) || !isCoord(c.y)) return null;
      return (FORMATIONS as readonly unknown[]).includes(c.formation)
        ? { kind: 'move', unitIds, x: c.x, y: c.y, formation: c.formation as Formation }
        : { kind: 'move', unitIds, x: c.x, y: c.y };
    case 'stop':
      return { kind: 'stop', unitIds };
    case 'march':
      return isId(c.target) ? { kind: 'march', unitIds, target: c.target } : null;
    case 'gather':
    case 'construct':
    case 'attack':
      return isId(c.targetId) ? { kind: c.kind, unitIds, targetId: c.targetId } : null;
    case 'wall':
      return isTile(c.x0) && isTile(c.y0) && isTile(c.x1) && isTile(c.y1)
        ? { kind: 'wall', unitIds, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }
        : null;
    case 'build':
      return isKey(BUILDING_DEFS, c.building) && isTile(c.tx) && isTile(c.ty)
        ? { kind: 'build', unitIds, building: c.building, tx: c.tx, ty: c.ty }
        : null;
    default:
      return null;
  }
}

// ---------- Utilidades del mapa ----------

/** Comprime las casillas por tramos iguales (el mapa ocupa ~50 veces menos). */
export function encodeTiles(tiles: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < tiles.length; ) {
    let j = i;
    while (j < tiles.length && tiles[j] === tiles[i]) j++;
    out.push(tiles[i], j - i);
    i = j;
  }
  return out;
}

export function decodeTiles(rle: number[], size: number): Uint8Array {
  const out = new Uint8Array(size * size);
  let k = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    out.fill(rle[i], k, Math.min(out.length, k + rle[i + 1]));
    k += rle[i + 1];
  }
  return out;
}
