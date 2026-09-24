// Producción de unidades: cada edificio tiene una cola. El costo se cobra al
// encargar (y se devuelve si se cancela). Si no hay población libre, la
// producción espera hasta que se construyan más casas.

import { BUILDING_DEFS, MAX_QUEUE, UNIT_DEFS, type UnitType } from '../../../shared/data.ts';
import { assignGather } from './gather.ts';
import { moveGroup } from './movement.ts';
import { freeTilesAround, type Building, type World } from './world.ts';

/** Encarga una unidad. Devuelve un aviso si no se puede, o null si quedó en cola. */
export function queueUnit(world: World, playerId: number, b: Building, unit: UnitType): string | null {
  if (b.owner !== playerId) return null; // edificio ajeno: se ignora en silencio
  if (b.progress < 1) return 'El edificio aún no está terminado';
  if (!BUILDING_DEFS[b.type].trains.includes(unit)) return null;
  if (b.queue.length >= MAX_QUEUE) return `La cola está llena (máximo ${MAX_QUEUE})`;
  if (!world.spend(playerId, UNIT_DEFS[unit].cost)) return 'Recursos insuficientes';
  b.queue.push({ unit, progress: 0 });
  return null;
}

/** Cancela un encargo y devuelve todo su costo. */
export function cancelQueued(world: World, playerId: number, b: Building, index: number): void {
  if (b.owner !== playerId || index < 0 || index >= b.queue.length) return;
  const [item] = b.queue.splice(index, 1);
  world.refund(playerId, UNIT_DEFS[item.unit].cost);
  if (b.queue.length === 0) b.needsHouses = false;
}

export function setRally(world: World, playerId: number, b: Building, x: number, y: number): void {
  if (b.owner !== playerId || BUILDING_DEFS[b.type].trains.length === 0) return;
  const node = world.nodeAt(Math.floor(x), Math.floor(y));
  b.rally = { x, y, targetId: node?.id ?? 0 };
}

export function updateProduction(world: World, dt: number): void {
  // Población de cada jugador, calculada una vez por paso.
  const pops = new Map<number, { pop: number; popCap: number }>();
  const popOf = (id: number) => {
    let p = pops.get(id);
    if (!p) pops.set(id, (p = world.popOf(id)));
    return p;
  };

  for (const b of world.buildings.values()) {
    if (b.progress < 1 || b.queue.length === 0) continue;
    const item = b.queue[0];
    const def = UNIT_DEFS[item.unit];
    const pop = popOf(b.owner);
    if (pop.pop + def.pop > pop.popCap) {
      if (!b.needsHouses) world.notify(b.owner, 'Población máxima: construye más casas');
      b.needsHouses = true;
      continue;
    }
    b.needsHouses = false;
    item.progress = Math.min(1, item.progress + dt / def.trainTime);
    // Terminada: sale si hay dónde ponerla (si está rodeado, espera).
    if (item.progress < 1 || !spawn(world, b, item.unit)) continue;
    b.queue.shift();
    pop.pop += def.pop;
  }
}

/** La unidad nueva aparece junto al edificio, del lado del punto de reunión. */
function spawn(world: World, b: Building, type: UnitType): boolean {
  const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
  const toward = b.rally ?? { x: cx, y: cy + b.size };
  const dx = toward.x - cx, dy = toward.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  // Casilla libre más cercana al borde del edificio en dirección al punto de reunión.
  const ex = Math.floor(cx + (dx / len) * (b.size / 2 + 0.6));
  const ey = Math.floor(cy + (dy / len) * (b.size / 2 + 0.6));
  const spot = freeTilesAround(world, ex, ey, 1)[0];
  if (!spot) return false;
  const u = world.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  if (!b.rally) return true;
  const node = b.rally.targetId ? world.nodes.get(b.rally.targetId) : undefined;
  if (node && type === 'worker') assignGather(world, u, node);
  else moveGroup(world, [u], b.rally.x, b.rally.y);
  return true;
}
