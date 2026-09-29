// Moral y huida, como en Total War: Attila.
//
// Cada soldado tiene moral (0–100). La pierde al recibir golpes (más si le pegan de
// costado o por la espalda, y más aún si el enemigo es de un pueblo temible) y al ver caer
// compañeros cerca. La recupera sola cuando no hay enemigos cerca. En 0 huye hacia su
// ciudad sin pelear (y recibe más daño); cuando está a salvo y recupera ánimo, se reagrupa.
// Trabajadores, máquinas de asedio, vehículos y aviones no tienen moral.

import {
  FACTIONS,
  GENERAL_AURA_REGEN,
  GENERAL_AURA_RESOLVE,
  GENERAL_DEATH_MORALE,
  GENERAL_DEATH_RADIUS,
  MORALE_ALLY_DEATH,
  MORALE_FLANK,
  MORALE_MAX,
  MORALE_PER_HP,
  MORALE_REAR,
  MORALE_REGEN_COMBAT,
  MORALE_REGEN_ROUT,
  MORALE_REGEN_SAFE,
  ROUT_MIN_SECONDS,
  ROUT_RALLY,
  TICK_RATE,
  UNIT_DEFS,
} from '../../../shared/data.ts';
import { UnitGrid } from './combat.ts';
import { isEnemy } from './diplomacy.ts';
import { buffMoraleLoss, isHero, nearGeneral } from './general.ts';
import { pathToPoint } from './pathfinding.ts';
import type { Unit, World } from './world.ts';

/** Distancia (casillas) a la que un enemigo cuenta como "peligro cerca". */
const DANGER_RADIUS = 6;
/** Distancia a la que se ve caer a un compañero. */
const WITNESS_RADIUS = 5;

/** ¿Tiene moral? Solo los soldados de a pie, a caballo y a distancia. */
export function hasMorale(u: Unit): boolean {
  if (UNIT_DEFS[u.type].hero) return false; // el General no huye
  const c = UNIT_DEFS[u.type].category;
  return c === 'infantry' || c === 'cavalry' || c === 'ranged';
}

const resolveOf = (world: World, owner: number) => FACTIONS[world.factionOf(owner)].traits?.resolve ?? 1;
const fearOf = (world: World, owner: number) => FACTIONS[world.factionOf(owner)].traits?.fear ?? 1;

/**
 * Lado por el que llega un golpe según hacia dónde mira la víctima:
 * 0 = de frente, 1 = de costado, 2 = por la espalda.
 */
export function flankSide(victim: Unit, fromX: number, fromY: number): 0 | 1 | 2 {
  const dx = fromX - victim.x, dy = fromY - victim.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  const dot = (dx * victim.fx + dy * victim.fy) / d;
  return dot > 0.5 ? 0 : dot < -0.5 ? 2 : 1;
}

/** Moral que pierde un soldado al recibir un golpe. */
export function hitMorale(world: World, victim: Unit, dmg: number, side: 0 | 1 | 2, attackerOwner: number, melee: boolean): void {
  if (!hasMorale(victim) || victim.routing > 0 || victim.hp <= 0) return;
  const maxHp = world.statsOf(victim).hp;
  let loss = (dmg / maxHp) * MORALE_PER_HP + (side === 1 ? MORALE_FLANK : side === 2 ? MORALE_REAR : 0);
  if (melee) loss *= fearOf(world, attackerOwner);
  loss /= resolveOf(world, victim.owner);
  loss *= buffMoraleLoss(victim);
  if (nearGeneral(world, victim)) loss /= GENERAL_AURA_RESOLVE;
  victim.morale -= loss;
  if (victim.morale <= 0) startRout(world, victim);
}

/** Al caer un soldado, sus compañeros cercanos pierden moral. */
export function deathMorale(world: World, dead: Unit): void {
  if (isHero(dead)) {
    // ¡Cayó el General! Los suyos que lo ven se desmoralizan.
    world.notify(dead.owner, 'Your General has fallen! Train a new one at the Town Center');
    for (const u of world.units.values()) {
      if (u.owner !== dead.owner || !hasMorale(u) || u.routing > 0 || u.hp <= 0) continue;
      if ((u.x - dead.x) ** 2 + (u.y - dead.y) ** 2 > GENERAL_DEATH_RADIUS ** 2) continue;
      u.morale -= GENERAL_DEATH_MORALE / resolveOf(world, u.owner);
      if (u.morale <= 0) startRout(world, u);
    }
    return;
  }
  if (!hasMorale(dead)) return;
  for (const u of world.units.values()) {
    if (u === dead || u.owner !== dead.owner || !hasMorale(u) || u.routing > 0 || u.hp <= 0) continue;
    if ((u.x - dead.x) ** 2 + (u.y - dead.y) ** 2 > WITNESS_RADIUS ** 2) continue;
    u.morale -= MORALE_ALLY_DEATH / resolveOf(world, u.owner);
    if (u.morale <= 0) startRout(world, u);
  }
}

const lastRoutNotice = new Map<number, number>();

/** La tropa se quiebra y huye hacia su ciudad. */
export function startRout(world: World, u: Unit): void {
  u.morale = 0;
  u.routing = ROUT_MIN_SECONDS * TICK_RATE;
  u.task = null;
  u.chaseGoal = null;
  u.speedCap = 0;
  flee(world, u);
  const last = lastRoutNotice.get(u.owner) ?? -Infinity;
  if (world.tick - last > 10 * TICK_RATE) {
    lastRoutNotice.set(u.owner, world.tick);
    world.notify(u.owner, 'Your troops are routing! Pull them back or send help');
  }
}

/** Camino de huida: a la propia ciudad; si no hay, lejos del enemigo más cercano. */
function flee(world: World, u: Unit): void {
  let goal: { x: number; y: number } | null = null;
  for (const b of world.buildings.values())
    if (b.owner === u.owner && b.type === 'town_center' && b.progress >= 1) {
      goal = { x: b.tx + b.size / 2, y: b.ty + b.size / 2 + b.size / 2 + 1 };
      break;
    }
  if (!goal) {
    const e = nearestEnemy(world, u, 30);
    const dx = e ? u.x - e.x : 1, dy = e ? u.y - e.y : 1;
    const d = Math.hypot(dx, dy) || 1;
    goal = { x: Math.max(0.5, Math.min(world.size - 0.5, u.x + (dx / d) * 12)), y: Math.max(0.5, Math.min(world.size - 0.5, u.y + (dy / d) * 12)) };
  }
  u.path = pathToPoint(world, u, goal.x, goal.y) ?? [];
  u.state = u.path.length ? 'moving' : 'idle';
}

function nearestEnemy(world: World, u: Unit, r: number, grid?: UnitGrid): Unit | null {
  let best: Unit | null = null, bd = r * r;
  for (const o of grid ? grid.near(u.x, u.y, r) : world.units.values()) {
    if (o.hp <= 0 || !isEnemy(world, u.owner, o.owner) || UNIT_DEFS[o.type].category === 'worker') continue;
    const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
    if (d < bd) [bd, best] = [d, o];
  }
  return best;
}

/** Recuperación de moral y reagrupamiento (una vez por paso). */
export function updateMorale(world: World, dt: number): void {
  let grid: UnitGrid | null = null;
  for (const u of world.units.values()) {
    if (!hasMorale(u) || (u.morale >= MORALE_MAX && u.routing === 0)) continue;
    grid ??= new UnitGrid(world);
    const danger = nearestEnemy(world, u, DANGER_RADIUS, grid) !== null;
    if (u.routing > 0) {
      u.morale = Math.min(MORALE_MAX, u.morale + (danger ? MORALE_REGEN_COMBAT * 2 : MORALE_REGEN_ROUT) * dt);
      if (u.routing > 1) u.routing--;
      else if (u.morale >= ROUT_RALLY && !danger) {
        // A salvo y con ánimo: se reagrupa donde está.
        u.routing = 0;
        u.path = [];
        u.state = 'idle';
        continue;
      }
      if (u.path.length === 0 && danger) flee(world, u);
      continue;
    }
    const aura = nearGeneral(world, u) ? GENERAL_AURA_REGEN : 0;
    u.morale = Math.min(MORALE_MAX, u.morale + ((danger ? MORALE_REGEN_COMBAT : MORALE_REGEN_SAFE) + aura) * dt);
  }
}

/** ¿Está huyendo? (no pelea, corre y recibe más daño). */
export const isRouting = (u: Unit) => u.routing > 0;
