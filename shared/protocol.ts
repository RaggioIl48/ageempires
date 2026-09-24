// Protocolo cliente <-> servidor: mensajes JSON por WebSocket.
// El servidor es autoritativo: el cliente solo envía INTENCIONES (órdenes) y
// dibuja lo que el servidor le cuenta. Nunca decide recursos, vida ni resultados.

import {
  BUILDING_DEFS,
  FACTIONS,
  PLAYER_COLORS,
  UNIT_DEFS,
  type BuildingType,
  type FactionId,
  type NodeType,
  type ResourceType,
  type Resources,
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
}

export interface NodeView {
  id: number;
  type: NodeType;
  tx: number;
  ty: number;
  amount: number;
}

export interface QueueItemView {
  unit: UnitType;
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
  /** Comida restante (granjas). */
  food?: number;
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
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'hit'; x: number; y: number }
  | { k: 'death'; x: number; y: number }
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
}

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface MemberView {
  id: number;
  name: string;
  color: string;
  faction: FactionId;
  connected: boolean;
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
}

// ---------- Cliente -> Servidor ----------

export type Command =
  | { kind: 'move'; unitIds: number[]; x: number; y: number }
  | { kind: 'stop'; unitIds: number[] }
  /** Recolectar de un recurso del mapa o de una granja propia. */
  | { kind: 'gather'; unitIds: number[]; targetId: number }
  /** Colocar un edificio nuevo y mandar a construirlo. */
  | { kind: 'build'; unitIds: number[]; building: BuildingType; tx: number; ty: number }
  /** Ayudar a construir o reparar un edificio propio. */
  | { kind: 'construct'; unitIds: number[]; targetId: number }
  | { kind: 'attack'; unitIds: number[]; targetId: number }
  | { kind: 'train'; buildingId: number; unit: UnitType }
  | { kind: 'cancelTrain'; buildingId: number; index: number }
  | { kind: 'rally'; buildingId: number; x: number; y: number }
  /** Eliminar unidades o edificios propios. */
  | { kind: 'delete'; ids: number[] };

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
  | { t: 'unwatch' };

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
  | { t: 'ended'; reason: string; summary: PlayerSummary[] };

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
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function parseSettings(v: unknown): RoomSettings | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.maxPlayers) || (s.maxPlayers as number) < 1 || (s.maxPlayers as number) > 16) return null;
  if (s.mapSize !== 'small' && s.mapSize !== 'normal' && s.mapSize !== 'large') return null;
  if (!Number.isInteger(s.durationMin) || (s.durationMin as number) < 0 || (s.durationMin as number) > 240) return null;
  return { maxPlayers: s.maxPlayers as number, mapSize: s.mapSize, durationMin: s.durationMin as number };
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
    case 'cancelTrain':
      return isId(c.buildingId) && isTile(c.index) && c.index >= 0
        ? { kind: 'cancelTrain', buildingId: c.buildingId, index: c.index }
        : null;
    case 'rally':
      return isId(c.buildingId) && isCoord(c.x) && isCoord(c.y) ? { kind: 'rally', buildingId: c.buildingId, x: c.x, y: c.y } : null;
    case 'delete':
      return isIdList(c.ids) ? { kind: 'delete', ids: [...new Set(c.ids)] } : null;
  }
  // Órdenes sobre unidades.
  if (!isIdList(c.unitIds)) return null;
  const unitIds = [...new Set(c.unitIds)];
  switch (c.kind) {
    case 'move':
      return isCoord(c.x) && isCoord(c.y) ? { kind: 'move', unitIds, x: c.x, y: c.y } : null;
    case 'stop':
      return { kind: 'stop', unitIds };
    case 'gather':
    case 'construct':
    case 'attack':
      return isId(c.targetId) ? { kind: c.kind, unitIds, targetId: c.targetId } : null;
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
