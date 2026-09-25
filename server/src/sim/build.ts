// Construcción y reparación. Los trabajadores levantan los cimientos poco a
// poco; cada ayudante extra acelera, pero cada vez menos (se reparten el trabajo).
// Reparar devuelve la vida perdida y cuesta una parte del precio del edificio.

import {
  BUILDING_DEFS,
  INTERACT_RANGE,
  REPAIR_COST_FACTOR,
  RESOURCE_TYPES,
  type Cost,
} from '../../../shared/data.ts';
import { buildSpeed, buildingCost } from '../../../shared/stats.ts';
import { assignFarm, farmTaken, stopWork } from './gather.ts';
import { pathToPoint, pathToRect } from './pathfinding.ts';
import { distanceToRect, type Building, type Unit, type World } from './world.ts';

const MAX_PATH_FAILURES = 4;

/** Velocidad de construcción con n trabajadores: 1 → 1×, 2 → 1,33×, 4 → 2×. */
export function builderSpeed(n: number): number {
  return (n + 2) / 3;
}

/** ¿Le falta trabajo? (en construcción o dañado) */
export function needsWork(b: Building): boolean {
  return b.progress < 1 || b.hp < b.maxHp;
}

export function assignBuild(world: World, u: Unit, b: Building): void {
  u.task = { kind: 'build', targetId: b.id };
  u.failedPaths = 0;
  goToBuilding(world, u, b);
}

function inBuildRange(u: Unit, b: Building): boolean {
  return distanceToRect(u.x, u.y, b.tx, b.ty, b.size) <= INTERACT_RANGE;
}

function goToBuilding(world: World, u: Unit, b: Building): void {
  if (inBuildRange(u, b)) {
    u.path = [];
    u.state = 'building';
    return;
  }
  const path = BUILDING_DEFS[b.type].solid
    ? pathToRect(world, u, b.tx, b.ty, b.size)
    : pathToPoint(world, u, b.tx + b.size / 2, b.ty + b.size / 2);
  if (!path) {
    stopWork(u);
    return;
  }
  u.path = path;
  u.state = 'toBuild';
}

export function updateBuilders(world: World, dt: number): void {
  // 1) Cada constructor camina hasta su obra; se cuentan los que ya trabajan.
  const working = new Map<Building, Unit[]>();
  for (const u of world.units.values()) {
    if (u.task?.kind !== 'build') continue;
    const b = world.buildings.get(u.task.targetId);
    // La obra ya no existe o acaba de ser destruida/cancelada en este paso
    // (hp ≤ 0): no se la puede "curar" construyendo.
    if (!b || b.owner !== u.owner || b.hp <= 0) {
      stopWork(u);
      continue;
    }
    if (!needsWork(b)) {
      afterWork(world, u, b);
      continue;
    }
    if (u.state === 'toBuild') {
      if (inBuildRange(u, b)) {
        u.path = [];
        u.state = 'building';
        u.failedPaths = 0;
      } else if (u.path.length === 0) {
        if (++u.failedPaths > MAX_PATH_FAILURES) stopWork(u);
        else goToBuilding(world, u, b);
      }
    }
    if (u.state === 'building') {
      if (!inBuildRange(u, b)) {
        goToBuilding(world, u, b);
        continue;
      }
      let list = working.get(b);
      if (!list) working.set(b, (list = []));
      list.push(u);
    }
  }

  // 2) Avanza cada obra según cuántos trabajan en ella.
  for (const [b, builders] of working) {
    const def = BUILDING_DEFS[b.type];
    const speed = builderSpeed(builders.length) * buildSpeed(world.factionOf(b.owner));
    if (b.progress < 1) {
      const dp = Math.min(1 - b.progress, (speed * dt) / def.buildTime);
      b.progress += dp;
      b.hp = Math.min(b.maxHp, b.hp + dp * b.maxHp);
      if (b.progress >= 1 - 1e-9) {
        b.progress = 1;
        for (const u of builders) afterWork(world, u, b);
      }
    } else {
      repair(world, b, builders, (speed * dt * b.maxHp) / (def.buildTime * 2));
    }
  }
}

/** Repara hasta `amount` de vida cobrando la parte proporcional del costo. */
function repair(world: World, b: Building, builders: Unit[], amount: number): void {
  const dhp = Math.min(b.maxHp - b.hp, amount);
  if (dhp <= 0) return;
  const cost = buildingCost(b.type, world.techsOf(b.owner));
  const frac = (dhp / b.maxHp) * REPAIR_COST_FACTOR;
  const charge: Cost = {};
  const owed = { ...b.repairOwed };
  for (const r of RESOURCE_TYPES) {
    owed[r] += (cost[r] ?? 0) * frac;
    charge[r] = Math.floor(owed[r]);
    owed[r] -= charge[r]!;
  }
  if (!world.spend(b.owner, charge)) {
    world.notify(b.owner, 'Not enough resources to repair');
    for (const u of builders) stopWork(u);
    return;
  }
  b.repairOwed = owed;
  b.hp += dhp;
}

/** Distancia (casillas) para pasar solo al siguiente cimiento propio (p. ej. el tramo de muralla de al lado). */
const NEXT_FOUNDATION_RANGE = 4;

/**
 * Al terminar: quien construyó una granja se queda a trabajarla; si hay otro
 * cimiento propio muy cerca (como el siguiente tramo de una muralla), sigue
 * con ese; si no, queda libre.
 */
function afterWork(world: World, u: Unit, b: Building): void {
  if (b.type === 'farm' && u.type === 'worker' && !farmTaken(world, b, u)) {
    assignFarm(world, u, b);
    return;
  }
  let next: Building | null = null;
  let best = NEXT_FOUNDATION_RANGE;
  for (const o of world.buildings.values()) {
    if (o === b || o.owner !== u.owner || o.progress >= 1 || o.hp <= 0) continue;
    const d = distanceToRect(u.x, u.y, o.tx, o.ty, o.size);
    if (d <= best) {
      best = d;
      next = o;
    }
  }
  if (next) assignBuild(world, u, next);
  else stopWork(u);
}
