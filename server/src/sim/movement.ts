// Movimiento: seguir caminos, mover grupos en formación y separar unidades
// que quedan amontonadas en el mismo punto.

import { clearLine, pathToPoint } from './pathfinding.ts';
import type { Point, Unit, World } from './world.ts';

/** Avanza cada unidad por su camino. `dt` en segundos. */
export function moveUnits(world: World, dt: number): void {
  for (const u of world.units.values()) {
    if (u.path.length === 0) continue;
    const stats = world.statsOf(u);
    world.walker = u.owner;
    let budget = stats.speed * dt;
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
    if (u.path.length === 0 && u.state === 'moving') u.state = 'idle';
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
 * Orden de mover: un grupo se reparte en formación alrededor del punto.
 * Se calcula UN camino para el líder y el resto lo reutiliza cuando puede
 * (mucho más barato que una búsqueda por unidad).
 */
export function moveGroup(world: World, units: Unit[], x: number, y: number): void {
  if (units.length === 0) return;
  world.walker = units[0].owner;
  const spots = units.length === 1 ? [{ x, y }] : formationSpots(world, x, y, units.length);
  const assigned: { u: Unit; spot: Point }[] = [];
  const free = [...units];
  for (const spot of spots) {
    if (free.length === 0) break;
    // La unidad más cercana a cada puesto lo ocupa (evita cruces largos).
    let best = 0;
    for (let i = 1; i < free.length; i++)
      if (dist2(free[i], spot) < dist2(free[best], spot)) best = i;
    assigned.push({ u: free.splice(best, 1)[0], spot });
  }
  // Las que no alcanzaron puesto (mapa muy lleno) van al punto mismo.
  for (const u of free) assigned.push({ u, spot: { x, y } });

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
  }
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
