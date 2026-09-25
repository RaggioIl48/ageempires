// Recolección, como en los RTS clásicos: el trabajador camina al recurso,
// recolecta hasta llenar su carga, la lleva al depósito más cercano y vuelve.
// Si el recurso se agota, busca otro del mismo tipo cerca.
// Las granjas son edificios: las trabaja un solo trabajador y se agotan.

import { BUILDING_DEFS, INTERACT_RANGE, NODE_DEFS } from '../../../shared/data.ts';
import { carryCapacity, gatherRate } from '../../../shared/stats.ts';
import { pathToPoint, pathToRect } from './pathfinding.ts';
import { distanceToRect, type Building, type ResourceNode, type Unit, type World } from './world.ts';

/** Radio (casillas) para buscar otro recurso igual cuando se agota el actual. */
const RETARGET_RADIUS = 8;
/** Llegadas seguidas "fuera de alcance" antes de rendirse y quedar inactivo. */
const MAX_PATH_FAILURES = 4;
/** Distancia al borde de la granja para trabajarla (el granjero camina sobre ella). */
const FARM_RANGE = 0.5;

type Source = { kind: 'node'; node: ResourceNode } | { kind: 'farm'; farm: Building };

type GatherTask = Extract<Unit['task'], { kind: 'gather' }>;

/** ¿Es una granja terminada de este jugador? */
export function isOwnFarm(b: Building | undefined, owner: number): b is Building {
  return !!b && b.type === 'farm' && b.owner === owner && b.progress >= 1;
}

/** ¿La granja la está trabajando OTRO trabajador? */
export function farmTaken(world: World, farm: Building, by: Unit): boolean {
  if (farm.farmerId === 0 || farm.farmerId === by.id) return false;
  const other = world.units.get(farm.farmerId);
  return !!other && other.task?.kind === 'gather' && other.task.targetId === farm.id;
}

/** Orden de recolectar un nodo del mapa. */
export function assignGather(world: World, u: Unit, node: ResourceNode): void {
  u.task = { kind: 'gather', targetId: node.id, resource: NODE_DEFS[node.type].resource, tx: node.tx, ty: node.ty };
  u.failedPaths = 0;
  goToSource(world, u, { kind: 'node', node });
}

/** Orden de trabajar una granja propia. Devuelve false si ya la trabaja otro. */
export function assignFarm(world: World, u: Unit, farm: Building): boolean {
  if (farmTaken(world, farm, u)) return false;
  farm.farmerId = u.id;
  u.task = { kind: 'gather', targetId: farm.id, resource: 'food', tx: farm.tx, ty: farm.ty };
  u.failedPaths = 0;
  goToSource(world, u, { kind: 'farm', farm });
  return true;
}

export function updateGatherers(world: World, dt: number): void {
  for (const u of world.units.values()) {
    if (u.task?.kind !== 'gather') continue;
    switch (u.state) {
      case 'toResource':
        stepToResource(world, u);
        break;
      case 'gathering':
        stepGathering(world, u, dt);
        break;
      case 'returning':
        stepReturning(world, u);
        break;
      default:
        break;
    }
  }
}

function stepToResource(world: World, u: Unit): void {
  const src = currentSource(world, u);
  if (!src) return;
  if (inRange(u, src)) {
    startGathering(u);
  } else if (u.path.length === 0) {
    // Llegó al final del camino pero no alcanza (otra unidad lo empujó, etc.): reintentar pocas veces.
    if (++u.failedPaths > MAX_PATH_FAILURES) stopWork(u);
    else goToSource(world, u, src);
  }
}

function startGathering(u: Unit): void {
  u.path = [];
  u.state = 'gathering';
  u.failedPaths = 0;
}

function stepGathering(world: World, u: Unit, dt: number): void {
  const task = u.task as GatherTask;
  const src = currentSource(world, u);
  if (!src) return;
  if (!inRange(u, src)) {
    goToSource(world, u, src);
    return;
  }
  // Cambiar de recurso descarta lo que llevaba (regla clásica y fácil de explicar).
  if (u.carryType !== task.resource) {
    u.carryType = task.resource;
    u.carryAmount = 0;
  }
  const techs = world.techsOf(u.owner);
  const capacity = carryCapacity(techs);
  u.gatherProgress += gatherRate(world.factionOf(u.owner), task.resource, src.kind === 'farm', techs) * dt;
  while (u.gatherProgress >= 1 && u.carryAmount < capacity && remaining(src) > 0) {
    u.gatherProgress -= 1;
    u.carryAmount += 1;
    if (src.kind === 'node') {
      src.node.amount -= 1;
      world.changedNodes.add(src.node.id);
    } else {
      src.farm.food -= 1;
    }
  }
  if (remaining(src) <= 0) {
    if (src.kind === 'node') world.removeNode(src.node.id);
    else {
      world.removeBuilding(src.farm.id);
      world.notify(u.owner, 'A farm ran out: build another one');
    }
  }
  if (u.carryAmount >= capacity) startReturn(world, u);
}

function stepReturning(world: World, u: Unit): void {
  const drop = nearestDropoff(world, u);
  if (!drop) {
    stopWork(u); // sin depósito no hay a dónde llevarlo
    return;
  }
  if (distanceToRect(u.x, u.y, drop.tx, drop.ty, drop.size) <= INTERACT_RANGE) {
    if (u.carryType) world.deposit(u.owner, u.carryType, u.carryAmount);
    u.carryAmount = 0;
    u.carryType = null;
    u.path = [];
    u.failedPaths = 0;
    u.state = 'toResource'; // de vuelta al trabajo (o inactivo si ya no queda recurso)
    const src = currentSource(world, u);
    if (src) goToSource(world, u, src);
    return;
  }
  if (u.path.length === 0) {
    if (++u.failedPaths > MAX_PATH_FAILURES) stopWork(u);
    else startReturn(world, u);
  }
}

function remaining(src: Source): number {
  return src.kind === 'node' ? src.node.amount : src.farm.food;
}

function inRange(u: Unit, src: Source): boolean {
  return src.kind === 'node'
    ? distanceToRect(u.x, u.y, src.node.tx, src.node.ty, 1) <= INTERACT_RANGE
    : distanceToRect(u.x, u.y, src.farm.tx, src.farm.ty, src.farm.size) <= FARM_RANGE;
}

/** Fuente de la tarea, o una equivalente cercana si se agotó. null = sin trabajo. */
function currentSource(world: World, u: Unit): Source | null {
  const task = u.task as GatherTask;
  const node = world.nodes.get(task.targetId);
  if (node) return { kind: 'node', node };
  const farm = world.buildings.get(task.targetId);
  if (isOwnFarm(farm, u.owner)) {
    farm.farmerId = u.id;
    return { kind: 'farm', farm };
  }
  // Se agotó: buscar otra igual cerca.
  const next = findNearby(world, u);
  if (next) {
    task.targetId = next.kind === 'node' ? next.node.id : next.farm.id;
    const at = next.kind === 'node' ? next.node : next.farm;
    task.tx = at.tx;
    task.ty = at.ty;
    if (next.kind === 'farm') next.farm.farmerId = u.id;
    return next;
  }
  // No queda nada cerca: si lleva algo, lo entrega; si no, queda inactivo.
  if (u.carryAmount > 0 && u.state !== 'returning') startReturn(world, u);
  else if (u.state !== 'returning') stopWork(u);
  return null;
}

/** Fuente alcanzable del mismo recurso más cercana al trabajador, cerca de la original. */
function findNearby(world: World, u: Unit, excludeId = 0): Source | null {
  const task = u.task as GatherTask;
  let best: Source | null = null;
  let bestD = Infinity;
  const consider = (src: Source, tx: number, ty: number, size: number) => {
    if (Math.hypot(tx - task.tx, ty - task.ty) > RETARGET_RADIUS) return;
    const d = Math.hypot(tx + size / 2 - u.x, ty + size / 2 - u.y);
    if (d < bestD) {
      bestD = d;
      best = src;
    }
  };
  for (const n of world.nodes.values()) {
    if (n.id === excludeId || NODE_DEFS[n.type].resource !== task.resource) continue;
    if (!world.isExposed(n.tx, n.ty)) continue;
    consider({ kind: 'node', node: n }, n.tx, n.ty, 1);
  }
  // Un granjero cuya granja se agotó pasa a otra granja libre cercana.
  if (task.resource === 'food')
    for (const b of world.buildings.values())
      if (b.id !== excludeId && isOwnFarm(b, u.owner) && !farmTaken(world, b, u)) consider({ kind: 'farm', farm: b }, b.tx, b.ty, b.size);
  return best;
}

function goToSource(world: World, u: Unit, src: Source): void {
  if (inRange(u, src)) {
    startGathering(u);
    return;
  }
  let path =
    src.kind === 'node'
      ? pathToRect(world, u, src.node.tx, src.node.ty, 1)
      : pathToPoint(world, u, src.farm.tx + src.farm.size / 2, src.farm.ty + src.farm.size / 2);
  if (!path && src.kind === 'node') {
    // Inalcanzable (p. ej. árbol en medio del bosque): probar con uno vecino accesible.
    const alt = findNearby(world, u, src.node.id);
    if (alt?.kind === 'node') {
      u.task = { kind: 'gather', targetId: alt.node.id, resource: (u.task as GatherTask).resource, tx: alt.node.tx, ty: alt.node.ty };
      path = pathToRect(world, u, alt.node.tx, alt.node.ty, 1);
    }
  }
  if (!path) {
    stopWork(u); // no hay forma de llegar
    return;
  }
  u.path = path;
  u.state = 'toResource';
}

function startReturn(world: World, u: Unit): void {
  const drop = nearestDropoff(world, u);
  const path = drop ? pathToRect(world, u, drop.tx, drop.ty, drop.size) : null;
  if (!path) {
    if (!drop) world.notify(u.owner, 'You have nowhere to drop off resources');
    stopWork(u);
    return;
  }
  u.path = path;
  u.state = 'returning';
}

/** Depósito propio y terminado más cercano que acepte lo que lleva la unidad. */
export function nearestDropoff(world: World, u: Unit): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildings.values()) {
    if (b.owner !== u.owner || b.progress < 1) continue;
    const accepts = BUILDING_DEFS[b.type].dropoff;
    if (accepts.length === 0 || (u.carryType && !accepts.includes(u.carryType))) continue;
    const d = distanceToRect(u.x, u.y, b.tx, b.ty, b.size);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Deja a la unidad sin tarea (conserva lo que lleva). */
export function stopWork(u: Unit): void {
  u.task = null;
  u.path = [];
  u.state = 'idle';
  u.failedPaths = 0;
  u.chaseGoal = null;
}
