// Búsqueda de caminos A* sobre la cuadrícula (8 direcciones, sin cortar
// esquinas), con suavizado por línea de visión para que las unidades no
// caminen en zigzag de casilla en casilla.

import { freeTilesAround, type Point, type World } from './world.ts';

const SQRT2 = Math.SQRT2;
const DIRS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * Si el punto de partida es una unidad, las puertas de su dueño y de sus
 * aliados cuentan como abiertas mientras se busca su camino.
 */
function useWalker(world: World, from: Point): void {
  const owner = (from as { owner?: number }).owner;
  if (owner !== undefined) world.walker = owner;
}

/** Límite de casillas exploradas por búsqueda (protege el tick del servidor). */
export const MAX_EXPANSIONS = 20_000;
/** Desempate: favorece seguir avanzando hacia el destino (explora muchas menos casillas). */
const TIE_BREAK = 1.001;

// Memoria reutilizada entre búsquedas (evita crear arreglos grandes cada vez).
// Un valor solo es válido si su "sello" coincide con la búsqueda actual.
let capacity = 0;
let gCost = new Float64Array(0);
let parent = new Int32Array(0);
let seen = new Uint32Array(0);
let closed = new Uint32Array(0);
let stamp = 0;

function prepareBuffers(n: number): void {
  if (n > capacity) {
    capacity = n;
    gCost = new Float64Array(n);
    parent = new Int32Array(n);
    seen = new Uint32Array(n);
    closed = new Uint32Array(n);
    stamp = 0;
  }
  if (++stamp === 0xffffffff) {
    seen.fill(0);
    closed.fill(0);
    stamp = 1;
  }
}

/**
 * Camino desde `from` hasta cualquiera de las casillas `goals` (índices y*size+x).
 * Devuelve puntos de paso (centros de casilla), sin incluir el inicio, o null
 * si no hay camino. Nunca devuelve un camino vacío: si ya está en una casilla
 * destino, el camino es ir al centro de esa casilla.
 * Con `partial`, si no se puede llegar devuelve el camino a la casilla
 * alcanzable más cercana al destino (así se comportan las órdenes de mover).
 */
export function findPath(world: World, from: Point, goals: Set<number>, aim: Point, partial = false): Point[] | null {
  useWalker(world, from);
  const size = world.size;
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  if (!world.inBounds(sx, sy) || goals.size === 0) return null;
  const start = sy * size + sx;
  if (goals.has(start)) return [{ x: sx + 0.5, y: sy + 0.5 }];

  prepareBuffers(size * size);
  const s = stamp;
  const heap = new MinHeap();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x + 0.5 - aim.x), dy = Math.abs(y + 0.5 - aim.y);
    return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * TIE_BREAK;
  };
  gCost[start] = 0;
  parent[start] = -1;
  seen[start] = s;
  heap.push(start, h(sx, sy));
  let best = start;
  let bestH = h(sx, sy);

  let expansions = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === s) continue;
    if (goals.has(cur)) return smooth(world, from, reconstruct(cur, size));
    closed[cur] = s;
    const cx = cur % size, cy = (cur - cx) / size;
    const hc = h(cx, cy);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    if (++expansions > MAX_EXPANSIONS) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!world.isWalkable(nx, ny)) continue;
      // Diagonal: no atravesar esquinas de obstáculos.
      if (dx !== 0 && dy !== 0 && (!world.isWalkable(cx + dx, cy) || !world.isWalkable(cx, cy + dy))) continue;
      const ni = ny * size + nx;
      if (closed[ni] === s) continue;
      const ng = gCost[cur] + cost;
      if (seen[ni] !== s || ng < gCost[ni]) {
        seen[ni] = s;
        gCost[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  if (partial && best !== start) return smooth(world, from, reconstruct(best, size));
  return null;
}

/**
 * Camino hasta un punto del mapa. Si el punto no es transitable, va a la casilla
 * libre más cercana; si no se puede llegar, se acerca todo lo posible.
 */
export function pathToPoint(world: World, from: Point, x: number, y: number): Point[] | null {
  useWalker(world, from);
  const tx = Math.floor(x), ty = Math.floor(y);
  if (world.isWalkable(tx, ty)) {
    const goal = ty * world.size + tx;
    const path = findPath(world, from, new Set([goal]), { x, y }, true);
    if (path === null) return null;
    // Si llegó a la casilla pedida, termina exactamente en el punto, no en el centro.
    const last = path[path.length - 1];
    if (Math.floor(last.x) === tx && Math.floor(last.y) === ty) path[path.length - 1] = { x, y };
    return path;
  }
  const spot = freeTilesAround(world, tx, ty, 1)[0];
  if (!spot) return null;
  return findPath(world, from, new Set([spot.y * world.size + spot.x]), { x: spot.x + 0.5, y: spot.y + 0.5 }, true);
}

/** Camino hasta quedar junto a un rectángulo (nodo de recurso o edificio). */
export function pathToRect(world: World, from: Point, tx: number, ty: number, size: number): Point[] | null {
  useWalker(world, from);
  const goals = new Set<number>();
  for (let y = ty - 1; y <= ty + size; y++)
    for (let x = tx - 1; x <= tx + size; x++) {
      const inside = x >= tx && x < tx + size && y >= ty && y < ty + size;
      if (!inside && world.isWalkable(x, y)) goals.add(y * world.size + x);
    }
  return findPath(world, from, goals, { x: tx + size / 2, y: ty + size / 2 });
}

function reconstruct(end: number, size: number): Point[] {
  const out: Point[] = [];
  for (let i = end; parent[i] !== -1; i = parent[i]) {
    const x = i % size;
    out.push({ x: x + 0.5, y: (i - x) / size + 0.5 });
  }
  return out.reverse();
}

/** Puntos de paso que se revisan hacia adelante al suavizar (limita el costo en caminos largos). */
const SMOOTH_LOOKAHEAD = 24;

/** Quita puntos intermedios cuando hay línea recta libre entre dos puntos. */
function smooth(world: World, from: Point, path: Point[]): Point[] {
  if (path.length <= 1) return path;
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < path.length) {
    let far = i;
    for (let j = Math.min(path.length - 1, i + SMOOTH_LOOKAHEAD); j > i; j--) {
      if (clearLine(world, anchor, path[j])) {
        far = j;
        break;
      }
    }
    out.push(path[far]);
    anchor = path[far];
    i = far + 1;
  }
  return out;
}

/** ¿Se puede ir en línea recta de a a b? Se prueban tres líneas paralelas (ancho de la unidad). */
export function clearLine(world: World, a: Point, b: Point): boolean {
  useWalker(world, a);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const px = (-dy / len) * 0.3, py = (dx / len) * 0.3;
  const steps = Math.ceil(len / 0.25);
  const ax = Math.floor(a.x), ay = Math.floor(a.y);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + dx * t, y = a.y + dy * t;
    for (const k of [0, 1, -1]) {
      // La casilla de salida puede estar ocupada (p. ej. unidad pegada a un árbol).
      const cx = Math.floor(x + px * k), cy = Math.floor(y + py * k);
      if (cx === ax && cy === ay) continue;
      if (!world.isWalkable(cx, cy)) return false;
    }
  }
  return true;
}

/** Montículo binario mínimo de índices con prioridad. */
class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const a = this.items, q = this.prio;
    let i = a.length;
    a.push(item);
    q.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [q[i], q[parent]] = [q[parent], q[i]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const lastItem = a.pop()!, lastPrio = q.pop()!;
    if (a.length > 0) {
      a[0] = lastItem;
      q[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [q[i], q[m]] = [q[m], q[i]];
        i = m;
      }
    }
    return top;
  }
}
