// Codificación compacta del estado para la red.
// En vez de objetos con nombres ({"id":12,"owner":3,...}) se envían listas de
// números ([12,3,...]): ocupa varias veces menos. Las posiciones van en
// centésimas de casilla (enteros). Servidor y cliente usan estas mismas
// funciones (el servidor entrega el cliente, así que siempre son la misma versión).

import { BUILDING_DEFS, NODE_DEFS, RESOURCE_TYPES, UNIT_DEFS, type BuildingType, type UnitType } from './data.ts';
import type { BuildingView, GameEvent, UnitState, UnitView } from './protocol.ts';

export const UNIT_TYPES = Object.keys(UNIT_DEFS) as UnitType[];
export const BUILDING_TYPES = Object.keys(BUILDING_DEFS) as BuildingType[];
export const NODE_TYPES = Object.keys(NODE_DEFS) as (keyof typeof NODE_DEFS)[];
export const UNIT_STATES: readonly UnitState[] = [
  'idle', 'moving', 'toResource', 'gathering', 'returning', 'toBuild', 'building', 'attacking',
];
const RES = RESOURCE_TYPES;

/** Casilla → entero en centésimas. */
export const q = (v: number): number => Math.round(v * 100);
const dq = (v: number): number => v / 100;

// ---------- Unidades ----------
// [id, owner, tipo, x, y, vida, estado, camina, tarea, tipoCarga, carga, objetivo]
export type UnitTuple = number[];
export const U_X = 3;
export const U_Y = 4;

export function encodeUnit(u: UnitView): UnitTuple {
  return [
    u.id,
    u.owner,
    UNIT_TYPES.indexOf(u.type),
    q(u.x),
    q(u.y),
    u.hp,
    UNIT_STATES.indexOf(u.state),
    u.walk ? 1 : 0,
    u.task ? RES.indexOf(u.task) : -1,
    u.carryType ? RES.indexOf(u.carryType) : -1,
    u.carryAmount ?? 0,
    u.targetId ?? 0,
  ];
}

export function decodeUnit(t: UnitTuple): UnitView {
  const v: UnitView = {
    id: t[0],
    owner: t[1],
    type: UNIT_TYPES[t[2]],
    x: dq(t[3]),
    y: dq(t[4]),
    hp: t[5],
    state: UNIT_STATES[t[6]],
  };
  if (t[7]) v.walk = 1;
  if (t[8] >= 0) v.task = RES[t[8]];
  if (t[9] >= 0 && t[10] > 0) {
    v.carryType = RES[t[9]];
    v.carryAmount = t[10];
  }
  if (t[11]) v.targetId = t[11];
  return v;
}

/** ¿Cambió algo además de la posición? (si no, basta con mandar la posición) */
export function sameExceptPosition(a: UnitTuple, b: UnitTuple): boolean {
  for (let i = 0; i < a.length; i++) if (i !== U_X && i !== U_Y && a[i] !== b[i]) return false;
  return true;
}

// ---------- Edificios ----------
// [id, owner, tipo, tx, ty, vida, progreso‰, comida, faltanCasas, reunionX, reunionY, (unidad, progreso%)…]
// Los campos privados (cola, reunión, casas) solo tienen datos para el dueño.
export type BuildingTuple = number[];

export function encodeBuilding(b: BuildingView): BuildingTuple {
  const t = [
    b.id,
    b.owner,
    BUILDING_TYPES.indexOf(b.type),
    b.tx,
    b.ty,
    b.hp,
    Math.round(b.progress * 1000),
    b.food ?? -1,
    b.needsHouses ? 1 : 0,
    b.rally ? q(b.rally.x) : -1,
    b.rally ? q(b.rally.y) : -1,
  ];
  for (const item of b.queue ?? []) t.push(UNIT_TYPES.indexOf(item.unit), Math.round(item.progress * 100));
  return t;
}

export function decodeBuilding(t: BuildingTuple): BuildingView {
  const v: BuildingView = {
    id: t[0],
    owner: t[1],
    type: BUILDING_TYPES[t[2]],
    tx: t[3],
    ty: t[4],
    hp: t[5],
    progress: t[6] / 1000,
  };
  if (t[7] >= 0) v.food = t[7];
  if (t[8]) v.needsHouses = 1;
  if (t[9] >= 0) v.rally = { x: dq(t[9]), y: dq(t[10]) };
  if (t.length > 11) {
    v.queue = [];
    for (let i = 11; i + 1 < t.length; i += 2) v.queue.push({ unit: UNIT_TYPES[t[i]], progress: t[i + 1] / 100 });
  }
  return v;
}

export function sameTuple(a: readonly number[] | undefined, b: readonly number[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------- Efectos ----------
// shot: [0, x1, y1, x2, y2] · hit: [1, x, y] · death: [2, x, y] · destroyed: [3, x, y, tamaño]
export type EventTuple = number[];

export function encodeEvent(e: GameEvent): EventTuple {
  switch (e.k) {
    case 'shot':
      return [0, q(e.x1), q(e.y1), q(e.x2), q(e.y2)];
    case 'hit':
      return [1, q(e.x), q(e.y)];
    case 'death':
      return [2, q(e.x), q(e.y)];
    case 'destroyed':
      return [3, q(e.x), q(e.y), e.size];
  }
}

export function decodeEvent(t: EventTuple): GameEvent {
  switch (t[0]) {
    case 0:
      return { k: 'shot', x1: dq(t[1]), y1: dq(t[2]), x2: dq(t[3]), y2: dq(t[4]) };
    case 1:
      return { k: 'hit', x: dq(t[1]), y: dq(t[2]) };
    case 2:
      return { k: 'death', x: dq(t[1]), y: dq(t[2]) };
    default:
      return { k: 'destroyed', x: dq(t[1]), y: dq(t[2]), size: t[3] };
  }
}

