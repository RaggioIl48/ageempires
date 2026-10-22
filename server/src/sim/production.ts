// Producción: cada edificio tiene una cola de unidades y tecnologías. El
// costo se cobra al encargar (y se devuelve si se cancela). Si no hay
// población libre, las unidades esperan hasta que se construyan más casas.
// Las tecnologías (incluido el avance de era) se investigan una sola vez.

import {
  BUILDING_DEFS,
  FACTIONS,
  MAX_QUEUE,
  POP_CAP_MAX,
  MEDIEVAL_ERA,
  MEDIEVAL_STAGES,
  TECH_DEFS,
  UNIT_DEFS,
  eraLabel,
  stageLabel,
  stageReached,
  unitAvailable,
  type Cost,
  type TechId,
  type UnitType,
} from '../../../shared/data.ts';
import { addTech, buildingMaxHp, hasTech, stageOf, trainCost, trainCount, trainSpeed, trainTime, unitStats } from '../../../shared/stats.ts';
import { assignGather } from './gather.ts';
import { moveGroup } from './movement.ts';
import { hasGeneral } from './general.ts';
import { freeTilesAround, type Building, type QueueItem, type World } from './world.ts';
import { formRegiment } from './regiment.ts';

function itemCost(item: QueueItem): Cost {
  return item.paid ?? (item.tech ? TECH_DEFS[item.tech].cost : UNIT_DEFS[item.unit!].cost);
}

/** Encarga una unidad. Devuelve un aviso si no se puede, o null si quedó en cola. */
export function queueUnit(world: World, playerId: number, b: Building, unit: UnitType): string | null {
  if (b.owner !== playerId) return null; // edificio ajeno: se ignora en silencio
  if (b.progress < 1) return 'The building is not finished yet';
  if (!BUILDING_DEFS[b.type].trains.includes(unit)) return null;
  const def = UNIT_DEFS[unit];
  if (def.faction && def.faction !== world.factionOf(playerId)) return null; // unidad única de otro pueblo
  const era = world.eraOf(playerId);
  if (!unitAvailable(unit, era, world.factionOf(playerId), world.stageOf(playerId))) {
    if (era < def.era) return `${def.label}: you need the ${eraLabel(def.era)}`;
    return era > def.untilEra ? `${def.label} is no longer trained in this age` : `${def.label}: you need the ${stageLabel(def.stage!)}`;
  }
  if (def.hero && hasGeneral(world, playerId)) return 'You already have a General (only one per player)';
  if (b.queue.length >= MAX_QUEUE) return `The queue is full (maximum ${MAX_QUEUE})`;
  // Ya en el máximo de población (o de unidades de la partida): no se puede encargar más.
  const pop = world.popOf(playerId), count = trainCount(unit);
  if (pop.units + count > pop.unitCap || (pop.popCap >= POP_CAP_MAX && pop.pop + def.pop > POP_CAP_MAX)) return limitNotice(pop, def.pop, count);
  // Un encargo de soldados es un regimiento entero (con descuento); trabajadores y máquinas, de a uno.
  const cost = trainCost(unit, world.techsOf(playerId));
  if (!world.spend(playerId, cost)) return 'Not enough resources';
  b.queue.push({ unit, progress: 0, paid: cost });
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
  if (!p) return 'Unknown player';
  const def = TECH_DEFS[tech];
  if (def.faction && def.faction !== p.faction) return `${def.label}: only the ${FACTIONS[def.faction].name} can research it`;
  if (hasTech(p.techs, tech)) return `${def.label}: already researched`;
  if (techQueued(world, playerId, tech)) return `${def.label}: already being researched`;
  if (def.advancesTo !== undefined) {
    if (p.era >= def.advancesTo) return 'You are already in that age';
    if (def.advancesTo > world.maxEra) return `This game ends in the ${eraLabel(world.maxEra)}`;
    if (p.era < def.era) return `First advance to the ${eraLabel(def.era)}`;
  } else if (p.era < def.era) return `${def.label}: you need the ${eraLabel(def.era)}`;
  const stage = stageOf(p.techs);
  if (def.advancesStage !== undefined) {
    if (p.era !== MEDIEVAL_ERA) return `${def.label}: only during the ${eraLabel(MEDIEVAL_ERA)}`;
    if (stage >= def.advancesStage) return `You are already in the ${stageLabel(stage)}`;
  }
  if (!stageReached(def.stage, p.era, stage)) return `First advance to the ${stageLabel(def.stage!)}`;
  if (def.requires && !hasBuilding(world, playerId, def.requires))
    return `${def.label}: you need a finished ${BUILDING_DEFS[def.requires].label}`;
  return null;
}

/** Encarga una investigación. Devuelve un aviso si no se puede, o null si quedó en cola. */
export function queueTech(world: World, playerId: number, b: Building, tech: TechId): string | null {
  if (b.owner !== playerId) return null;
  if (b.progress < 1) return 'The building is not finished yet';
  if (!BUILDING_DEFS[b.type].researches.includes(tech)) return null;
  const error = researchError(world, playerId, tech);
  if (error) return error;
  if (b.queue.length >= MAX_QUEUE) return `The queue is full (maximum ${MAX_QUEUE})`;
  if (!world.spend(playerId, TECH_DEFS[tech].cost)) return 'Not enough resources';
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
  const pops = new Map<number, ReturnType<World['popOf']>>();
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
    const count = trainCount(item.unit!);
    // Un regimiento entero ocupa un solo lugar de población (su `pop`).
    if (pop.pop + def.pop > pop.popCap || pop.units + count > pop.unitCap) {
      if (!b.needsHouses) world.notify(b.owner, limitNotice(pop, def.pop, count));
      b.needsHouses = true;
      continue;
    }
    b.needsHouses = false;
    item.progress = Math.min(1, item.progress + (dt * trainSpeed(world.factionOf(b.owner), item.unit!)) / trainTime(item.unit!));
    // Terminada: sale si hay dónde ponerla (si está rodeado, espera).
    if (item.progress < 1 || !spawn(world, b, item.unit!, count)) continue;
    b.queue.shift();
    pop.pop += def.pop;
    pop.units += count;
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
  p.techs = addTech(p.techs, tech);
  world.techVersion++;
  const def = TECH_DEFS[tech];
  if (def.advancesTo !== undefined) {
    p.era = Math.max(p.era, def.advancesTo);
    world.announce(`${p.name} advanced to the ${eraLabel(p.era)}`, 'era');
  } else if (def.advancesStage !== undefined) {
    const s = MEDIEVAL_STAGES[def.advancesStage - 1];
    world.announce(`${p.name} entered the ${s.label} (${s.years})`, 'era');
  } else world.notify(playerId, `Research complete: ${def.label}`);

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

/** La unidad nueva (o el regimiento entero) aparece junto al edificio, del lado del punto de reunión. */
function spawn(world: World, b: Building, type: UnitType, count = 1): boolean {
  const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
  const toward = b.rally ?? { x: cx, y: cy + b.size };
  const dx = toward.x - cx, dy = toward.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  // Casilla libre más cercana al borde del edificio en dirección al punto de reunión.
  const ex = Math.floor(cx + (dx / len) * (b.size / 2 + 0.6));
  const ey = Math.floor(cy + (dy / len) * (b.size / 2 + 0.6));
  world.walker = 0;
  const spots = freeTilesAround(world, ex, ey, count);
  if (spots.length < count) return false;
  if (count > 1) {
    // Regimiento: salen todos juntos, con el mismo número, y se forman en línea.
    const reg = world.newId();
    const men = spots.map((s) => {
      const m = world.addUnit(type, b.owner, s.x + 0.5, s.y + 0.5);
      m.reg = reg;
      return m;
    });
    formRegiment(world, b, men);
    return true;
  }
  const spot = spots[0];
  const u = world.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  if (!b.rally) return true;
  const node = b.rally.targetId ? world.nodes.get(b.rally.targetId) : undefined;
  if (node && type === 'worker') assignGather(world, u, node);
  else moveGroup(world, [u], b.rally.x, b.rally.y);
  return true;
}

/** Por qué espera un encargo: faltan casas, se llegó a la población máxima o al tope de unidades de la partida. */
function limitNotice(pop: ReturnType<World['popOf']>, need: number, count: number): string {
  if (pop.units + count > pop.unitCap) return `Army limit reached: ${pop.unitCap} units per player in this game (so the server stays fast)`;
  if (pop.popCap >= POP_CAP_MAX && pop.pop + need > POP_CAP_MAX) return `Maximum population reached (${POP_CAP_MAX}): you cannot train more until some fall`;
  return 'Population limit reached: build more houses';
}
