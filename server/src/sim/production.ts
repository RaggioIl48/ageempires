// Producción: cada edificio tiene una cola de unidades y tecnologías. El
// costo se cobra al encargar (y se devuelve si se cancela). Si no hay
// población libre, las unidades esperan hasta que se construyan más casas.
// Las tecnologías (incluido el avance de era) se investigan una sola vez.

import {
  BUILDING_DEFS,
  MAX_QUEUE,
  TECH_DEFS,
  UNIT_DEFS,
  eraLabel,
  unitAvailable,
  type Cost,
  type TechId,
  type UnitType,
} from '../../../shared/data.ts';
import { buildingMaxHp, hasTech, techBit, unitStats } from '../../../shared/stats.ts';
import { assignGather } from './gather.ts';
import { moveGroup } from './movement.ts';
import { freeTilesAround, type Building, type QueueItem, type World } from './world.ts';

function itemCost(item: QueueItem): Cost {
  return item.tech ? TECH_DEFS[item.tech].cost : UNIT_DEFS[item.unit!].cost;
}

/** Encarga una unidad. Devuelve un aviso si no se puede, o null si quedó en cola. */
export function queueUnit(world: World, playerId: number, b: Building, unit: UnitType): string | null {
  if (b.owner !== playerId) return null; // edificio ajeno: se ignora en silencio
  if (b.progress < 1) return 'El edificio aún no está terminado';
  if (!BUILDING_DEFS[b.type].trains.includes(unit)) return null;
  const def = UNIT_DEFS[unit];
  if (!unitAvailable(unit, world.eraOf(playerId)))
    return world.eraOf(playerId) < def.era ? `${def.label}: necesitas la ${eraLabel(def.era)}` : `${def.label} ya no se entrena en esta era`;
  if (b.queue.length >= MAX_QUEUE) return `La cola está llena (máximo ${MAX_QUEUE})`;
  if (!world.spend(playerId, def.cost)) return 'Recursos insuficientes';
  b.queue.push({ unit, progress: 0 });
  return null;
}

/** ¿Está esta tecnología en alguna cola del jugador? */
function techQueued(world: World, playerId: number, tech: TechId): boolean {
  for (const b of world.buildings.values()) if (b.owner === playerId && b.queue.some((q) => q.tech === tech)) return true;
  return false;
}

/** ¿Tiene el jugador un edificio terminado de este tipo? */
function hasBuilding(world: World, playerId: number, type: Building['type']): boolean {
  for (const b of world.buildings.values()) if (b.owner === playerId && b.type === type && b.progress >= 1) return true;
  return false;
}

/** Motivo por el que no se puede investigar ahora, o null si se puede (sin mirar recursos). */
export function researchError(world: World, playerId: number, tech: TechId): string | null {
  const p = world.players.get(playerId);
  if (!p) return 'Jugador desconocido';
  const def = TECH_DEFS[tech];
  if (hasTech(p.techs, tech)) return `${def.label}: ya está investigada`;
  if (techQueued(world, playerId, tech)) return `${def.label}: ya se está investigando`;
  if (def.advancesTo !== undefined) {
    if (p.era >= def.advancesTo) return 'Ya estás en esa era';
    if (p.era < def.era) return `Primero avanza a la ${eraLabel(def.era)}`;
  } else if (p.era < def.era) return `${def.label}: necesitas la ${eraLabel(def.era)}`;
  if (def.requires && !hasBuilding(world, playerId, def.requires))
    return `${def.label}: necesitas un ${BUILDING_DEFS[def.requires].label} terminado`;
  return null;
}

/** Encarga una investigación. Devuelve un aviso si no se puede, o null si quedó en cola. */
export function queueTech(world: World, playerId: number, b: Building, tech: TechId): string | null {
  if (b.owner !== playerId) return null;
  if (b.progress < 1) return 'El edificio aún no está terminado';
  if (!BUILDING_DEFS[b.type].researches.includes(tech)) return null;
  const error = researchError(world, playerId, tech);
  if (error) return error;
  if (b.queue.length >= MAX_QUEUE) return `La cola está llena (máximo ${MAX_QUEUE})`;
  if (!world.spend(playerId, TECH_DEFS[tech].cost)) return 'Recursos insuficientes';
  b.queue.push({ tech, progress: 0 });
  return null;
}

/** Cancela un encargo y devuelve todo su costo. */
export function cancelQueued(world: World, playerId: number, b: Building, index: number): void {
  if (b.owner !== playerId || index < 0 || index >= b.queue.length) return;
  const [item] = b.queue.splice(index, 1);
  world.refund(playerId, itemCost(item));
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
    if (item.tech) {
      item.progress = Math.min(1, item.progress + dt / TECH_DEFS[item.tech].time);
      if (item.progress < 1) continue;
      b.queue.shift();
      completeTech(world, b.owner, item.tech);
      continue;
    }
    const def = UNIT_DEFS[item.unit!];
    const pop = popOf(b.owner);
    if (pop.pop + def.pop > pop.popCap) {
      if (!b.needsHouses) world.notify(b.owner, 'Población máxima: construye más casas');
      b.needsHouses = true;
      continue;
    }
    b.needsHouses = false;
    item.progress = Math.min(1, item.progress + dt / def.trainTime);
    // Terminada: sale si hay dónde ponerla (si está rodeado, espera).
    if (item.progress < 1 || !spawn(world, b, item.unit!)) continue;
    b.queue.shift();
    pop.pop += def.pop;
  }
}

/**
 * Aplica una tecnología terminada. Si sube la vida máxima (Mampostería,
 * Blindaje), las unidades y edificios que ya existen suben en proporción.
 */
export function completeTech(world: World, playerId: number, tech: TechId): void {
  const p = world.players.get(playerId);
  if (!p || hasTech(p.techs, tech)) return;
  const before = p.techs;
  p.techs |= techBit(tech);
  world.techVersion++;
  const def = TECH_DEFS[tech];
  if (def.advancesTo !== undefined) {
    p.era = Math.max(p.era, def.advancesTo);
    world.announce(`${p.name} avanzó a la ${eraLabel(p.era)}`);
  } else world.notify(playerId, `Investigación terminada: ${def.label}`);

  for (const u of world.units.values()) {
    if (u.owner !== playerId) continue;
    const oldMax = unitStats(p.faction, u.type, before).hp;
    const newMax = unitStats(p.faction, u.type, p.techs).hp;
    if (newMax !== oldMax) u.hp = (u.hp * newMax) / oldMax;
  }
  for (const b of world.buildings.values()) {
    if (b.owner !== playerId) continue;
    const newMax = buildingMaxHp(p.faction, b.type, p.techs);
    if (newMax !== b.maxHp) {
      b.hp = (b.hp * newMax) / b.maxHp;
      b.maxHp = newMax;
    }
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
  world.walker = 0;
  const spot = freeTilesAround(world, ex, ey, 1)[0];
  if (!spot) return false;
  const u = world.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  if (!b.rally) return true;
  const node = b.rally.targetId ? world.nodes.get(b.rally.targetId) : undefined;
  if (node && type === 'worker') assignGather(world, u, node);
  else moveGroup(world, [u], b.rally.x, b.rally.y);
  return true;
}
