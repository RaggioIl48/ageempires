// Movimiento: seguir caminos, mover grupos en formación y separar unidades
// que quedan amontonadas en el mismo punto.

import { UNIT_DEFS, type Category } from '../../../shared/data.ts';
import type { Formation } from '../../../shared/protocol.ts';
import { clearLine, pathToPoint } from './pathfinding.ts';
import type { Point, Unit, World } from './world.ts';

/** Avanza cada unidad por su camino. `dt` en segundos. */
export function moveUnits(world: World, dt: number): void {
  for (const u of world.units.values()) {
    if (u.path.length === 0) continue;
    const stats = world.statsOf(u);
    world.walker = u.owner;
    // En formación, todos marchan al paso del más lento.
    const speed = u.state === 'moving' && u.speedCap > 0 ? Math.min(stats.speed, u.speedCap) : stats.speed;
    let budget = speed * dt;
    while (budget > 0 && u.path.length > 0) {
      const wp = u.path[0];
      const d = Math.hypot(wp.x - u.x, wp.y - u.y);
      const step = Math.min(d, budget);
      const nx = d > 0 ? u.x + ((wp.x - u.x) / d) * step : wp.x;
      const ny = d > 0 ? u.y + ((wp.y - u.y) / d) * step : wp.y;
      // El camino pudo quedar viejo (p. ej. se construyó algo encima): no atravesar paredes.
      if (!stats.flies && !world.isWalkable(Math.floor(nx), Math.floor(ny))) {
        rerouteBlocked(world, u);
        break;
      }
      u.x = nx;
      u.y = ny;
      budget -= step;
      if (step >= d) u.path.shift();
    }
    if (u.path.length === 0 && u.state === 'moving') {
      u.state = 'idle';
      u.speedCap = 0;
    }
  }
}

/** El camino quedó bloqueado: quien solo camina busca otra ruta; quien tiene tarea, deja que su tarea recalcule. */
function rerouteBlocked(world: World, u: Unit): void {
  const dest = u.path[u.path.length - 1];
  u.path = [];
  if (u.state === 'moving' && dest) u.path = pathToPoint(world, u, dest.x, dest.y) ?? [];
}

/** Distancia máxima (casillas) al líder para reutilizar su camino. */
const SHARE_PATH_RADIUS = 6;

/**
 * Orden de mover: un grupo se reparte alrededor del punto, suelto o en formación
 * (ver rankedSpots). Se calcula UN camino para el líder y el resto lo reutiliza
 * cuando puede (mucho más barato que una búsqueda por unidad).
 */
export function moveGroup(world: World, units: Unit[], x: number, y: number, formation: Formation = 'loose'): void {
  if (units.length === 0) return;
  world.walker = units[0].owner;
  const ranked = formation !== 'loose' && units.length > 1;
  const assigned = ranked ? rankedSpots(world, units, x, y, formation) : looseSpots(world, units, x, y);

  // Líder: la unidad más cercana al centro del grupo.
  const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
  const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
  const leader = assigned.reduce((a, b) => (dist2(a.u, { x: cx, y: cy }) <= dist2(b.u, { x: cx, y: cy }) ? a : b));
  const leaderPath = world.statsOf(leader.u).flies ? [leader.spot] : pathToPoint(world, leader.u, leader.spot.x, leader.spot.y);

  for (const { u, spot } of assigned) {
    let path: Point[] | null = null;
    if (world.statsOf(u).flies) path = [spot]; // los aviones vuelan en línea recta
    else if (u === leader.u) path = leaderPath;
    else if (leaderPath && leaderPath.length >= 2 && dist2(u, leader.u) <= SHARE_PATH_RADIUS ** 2) {
      // Reutilizar: ir al primer punto del líder, seguir su ruta y terminar en su propio puesto.
      const shared = leaderPath.slice(0, -1);
      if (clearLine(world, u, shared[0]) && clearLine(world, shared[shared.length - 1], spot)) path = [...shared, spot];
    }
    path ??= pathToPoint(world, u, spot.x, spot.y);
    u.task = null;
    u.chaseGoal = null;
    u.path = path ?? [];
    u.state = u.path.length > 0 ? 'moving' : 'idle';
    u.speedCap = 0;
  }
  // En formación, todos al paso del más lento (los aviones van aparte).
  if (ranked) {
    const ground = units.filter((u) => !world.statsOf(u).flies);
    const cap = Math.min(...ground.map((u) => world.statsOf(u).speed));
    for (const u of ground) if (u.state === 'moving') u.speedCap = cap;
  }
}

/** Grupo suelto: cada puesto de una cuadrícula compacta lo ocupa la unidad más cercana. */
function looseSpots(world: World, units: Unit[], x: number, y: number): { u: Unit; spot: Point }[] {
  const spots = units.length === 1 ? [{ x, y }] : formationSpots(world, x, y, units.length);
  return assignNearest(units, spots, { x, y });
}

/** La unidad más cercana a cada puesto lo ocupa (evita cruces largos); las que sobran van al punto. */
function assignNearest(units: Unit[], spots: Point[], fallback: Point): { u: Unit; spot: Point }[] {
  const assigned: { u: Unit; spot: Point }[] = [];
  const free = [...units];
  for (const spot of spots) {
    if (free.length === 0) break;
    let best = 0;
    for (let i = 1; i < free.length; i++)
      if (dist2(free[i], spot) < dist2(free[best], spot)) best = i;
    assigned.push({ u: free.splice(best, 1)[0], spot });
  }
  for (const u of free) assigned.push({ u, spot: fallback });
  return assigned;
}

/** Separación entre puestos de una formación (casillas). */
export const RANK_SPACING = 0.9;

/** Fila de cada tipo en la formación (0 = adelante); −1 = caballería (a los lados). */
const RANK: Record<Category, number> = { infantry: 0, armor: 0, worker: 0, ranged: 1, siege: 2, air: 2, building: 2, cavalry: -1 };

/**
 * Formación en filas mirando hacia donde va el grupo (del centro del grupo al destino).
 * 'line': frente ancho; infantería adelante, unidades a distancia detrás, asedio al
 * fondo y caballería en los flancos. 'column': de a 3 en fondo, la caballería abre la marcha.
 */
function rankedSpots(world: World, units: Unit[], x: number, y: number, formation: Formation): { u: Unit; spot: Point }[] {
  const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
  const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
  let fx = x - cx, fy = y - cy;
  const len = Math.hypot(fx, fy);
  if (len < 0.5) [fx, fy] = [Math.SQRT1_2, Math.SQRT1_2]; // sin dirección clara: de frente a la cámara
  else [fx, fy] = [fx / len, fy / len];
  const rx = -fy, ry = fx; // hacia la derecha del frente
  const at = (col: number, row: number): Point => ({
    x: x + (rx * col - fx * row) * RANK_SPACING,
    y: y + (ry * col - fy * row) * RANK_SPACING,
  });

  const byRank = new Map<number, Unit[]>();
  for (const u of units) {
    let r = RANK[UNIT_DEFS[u.type].category];
    if (r === -1 && formation === 'column') r = -2; // en columna, la caballería va primero
    byRank.set(r, [...(byRank.get(r) ?? []), u]);
  }
  const cavalry = formation === 'line' ? (byRank.get(-1) ?? []) : [];
  const main = units.length - cavalry.length;
  const width = formation === 'column' ? 3 : Math.max(3, Math.ceil(Math.sqrt(main * 2.5)));
  const out: { u: Unit; spot: Point }[] = [];
  let row = 0;
  for (const r of [-2, 0, 1, 2]) {
    const list = byRank.get(r);
    if (!list) continue;
    const spots: Point[] = [];
    for (let i = 0; i < list.length; i += width, row++) {
      const n = Math.min(width, list.length - i);
      for (let c = 0; c < n; c++) spots.push(at(c - (n - 1) / 2, row));
    }
    out.push(...assignNearest(list, spots, { x, y }));
  }
  // Caballería en los flancos: izquierda y derecha alternadas, de adelante hacia atrás.
  if (cavalry.length) {
    const half = (Math.min(width, Math.max(main, 1)) - 1) / 2;
    const spots = cavalry.map((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      return at(side * (half + 1.2 + (k % 2)), Math.floor(k / 2));
    });
    out.push(...assignNearest(cavalry, spots, { x, y }));
  }
  // Puestos sobre agua, montañas o edificios: al lugar libre más cercano.
  const taken = new Set<number>();
  for (const a of out) a.spot = freeNear(world, a.spot, taken) ?? { x, y };
  return out;
}

/** Punto caminable más cercano (de a media casilla), sin repetir uno ya tomado. */
export function freeSpot(world: World, p: Point, taken: Set<number>, owner = 0): Point | null {
  if (owner) world.walker = owner;
  return freeNear(world, p, taken);
}

function freeNear(world: World, p: Point, taken: Set<number>): Point | null {
  for (let r = 0; r <= 6; r++)
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const q = { x: p.x + i * 0.5, y: p.y + j * 0.5 };
        const tx = Math.floor(q.x), ty = Math.floor(q.y);
        const key = Math.round(q.y * 4) * 100_000 + Math.round(q.x * 4);
        if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size || !world.isWalkable(tx, ty) || taken.has(key)) continue;
        taken.add(key);
        return q;
      }
  return null;
}

/** Puestos libres en una cuadrícula compacta alrededor de (x, y), del más cercano al más lejano. */
function formationSpots(world: World, x: number, y: number, count: number): Point[] {
  const spacing = 0.8;
  const out: Point[] = [];
  for (let r = 0; out.length < count && r < 20; r++) {
    const ring: Point[] = [];
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const p = { x: x + i * spacing, y: y + j * spacing };
        if (world.isWalkable(Math.floor(p.x), Math.floor(p.y))) ring.push(p);
      }
    ring.sort((a, b) => dist2(a, { x, y }) - dist2(b, { x, y }));
    out.push(...ring.slice(0, count - out.length));
  }
  return out;
}

const SEPARATION = 0.45; // distancia mínima deseada entre unidades quietas

/** Empuja suavemente a las unidades quietas que están una encima de otra. */
export function separateUnits(world: World): void {
  const buckets = new Map<number, Unit[]>();
  for (const u of world.units.values()) {
    if (world.statsOf(u).flies) continue; // los aviones no se empujan con los de tierra
    const k = Math.floor(u.y) * world.size + Math.floor(u.x);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(u);
  }
  for (const u of world.units.values()) {
    if (u.path.length > 0 || world.statsOf(u).flies) continue; // las que caminan no se empujan
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const others = buckets.get((cy + dy) * world.size + (cx + dx));
        if (!others) continue;
        for (const o of others) {
          if (o === u || o.id < u.id) continue; // cada par una sola vez
          let ox = u.x - o.x, oy = u.y - o.y;
          let d = Math.hypot(ox, oy);
          if (d >= SEPARATION) continue;
          if (d < 1e-4) {
            // Exactamente encima: separar en una dirección fija según los ids.
            const a = (u.id * 2.39996) % (Math.PI * 2);
            ox = Math.cos(a);
            oy = Math.sin(a);
            d = 1;
          }
          const push = (SEPARATION - Math.min(d, SEPARATION)) * 0.25;
          nudge(world, u, (ox / d) * push, (oy / d) * push);
          if (o.path.length === 0) nudge(world, o, (-ox / d) * push, (-oy / d) * push);
        }
      }
  }
}

function nudge(world: World, u: Unit, dx: number, dy: number): void {
  const nx = u.x + dx, ny = u.y + dy;
  world.walker = u.owner;
  if (world.isWalkable(Math.floor(nx), Math.floor(ny))) {
    u.x = nx;
    u.y = ny;
  }
}

function dist2(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
