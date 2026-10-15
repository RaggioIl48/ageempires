// Órdenes de RTS táctico (Total War):
// - Atacar-moviendo: la tropa avanza hacia su puesto y pelea con lo que encuentre en el camino;
//   cuando ya no quedan enemigos cerca, sigue hacia el puesto.
// - Cola de órdenes (Shift + clic derecho): los movimientos se cumplen uno tras otro; cada soldado
//   conserva su lugar en la formación (la distancia al centro del grupo cuando se dio la orden).

import { clearLine, pathToPoint } from './pathfinding.ts';
import type { Unit, World } from './world.ts';

/** Agrega un movimiento a la cola de cada soldado (si está quieto, sale ya). */
export function queueMoves(world: World, units: Unit[], x: number, y: number, amove: boolean): void {
  // Dónde va a estar cada uno al terminar lo que ya tiene pendiente, y el centro de esos puntos.
  const lastOf = (u: Unit) => u.orders[u.orders.length - 1] ?? u.amove ?? u.path[u.path.length - 1] ?? { x: u.x, y: u.y };
  const cx = units.reduce((s, u) => s + lastOf(u).x, 0) / units.length, cy = units.reduce((s, u) => s + lastOf(u).y, 0) / units.length;
  for (const u of units) {
    // El destino de cada uno: el del grupo más su lugar relativo (formación conservada, sin apretujarse).
    const last = lastOf(u);
    const ox = Math.max(-4, Math.min(4, last.x - cx)), oy = Math.max(-4, Math.min(4, last.y - cy));
    const tx = clampTo(world, x + ox), ty = clampTo(world, y + oy);
    u.orders.push({ x: tx, y: ty, amove });
    if (u.orders.length > 8) u.orders.shift();
  }
}

const clampTo = (world: World, v: number) => Math.min(world.size - 0.01, Math.max(0, v));

/** Atacar-moviendo: el puesto de cada soldado es adonde lo llevó su camino de formación. */
export function setAttackMove(units: Unit[]): void {
  for (const u of units) {
    const goal = u.path[u.path.length - 1];
    u.amove = goal ? { x: goal.x, y: goal.y } : null;
  }
}

/** Una orden nueva (que no va en cola) borra lo pendiente. */
export function clearOrders(units: Unit[]): void {
  for (const u of units) {
    u.amove = null;
    u.orders = [];
  }
}

/** ¿Está libre para seguir con lo pendiente? */
const free = (u: Unit) => !u.task && u.path.length === 0 && u.state === 'idle' && u.routing === 0 && u.down === 0;

/** Retoma el atacar-moviendo interrumpido por una pelea y sigue con la cola de órdenes. */
export function updateOrders(world: World): void {
  for (const u of world.units.values()) {
    if (!free(u)) continue;
    if (u.amove) {
      if (Math.hypot(u.amove.x - u.x, u.amove.y - u.y) > 0.8) {
        go(world, u, u.amove.x, u.amove.y);
        continue;
      }
      u.amove = null;
    }
    const next = u.orders.shift();
    if (!next) continue;
    go(world, u, next.x, next.y);
    u.amove = next.amove ? { x: next.x, y: next.y } : null;
  }
}

function go(world: World, u: Unit, x: number, y: number): void {
  const goal = { x, y };
  u.path = clearLine(world, u, goal) ? [goal] : (pathToPoint(world, u, x, y) ?? []);
  u.state = u.path.length ? 'moving' : 'idle';
  if (!u.path.length) u.amove = null; // no se puede llegar: se olvida
}
