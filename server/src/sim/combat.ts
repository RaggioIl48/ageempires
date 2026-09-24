// Combate sencillo de explicar:
//   daño = ataque × ventaja de tipo − armadura (mínimo 1)
// Cuerpo a cuerpo hay que tocar al objetivo; a distancia basta con tenerlo
// dentro del alcance. Las unidades militares quietas atacan solas a los
// enemigos que ven (primero a quien puede pelear, luego trabajadores y al
// final edificios). El Centro Urbano dispara flechas a los enemigos cercanos.

import { BUILDING_DEFS, MELEE_REACH, type AttackDef, type Category } from '../../../shared/data.ts';
import { damage } from '../../../shared/stats.ts';
import { stopWork } from './gather.ts';
import { clearLine, pathToPoint, pathToRect } from './pathfinding.ts';
import { distanceToRect, type Building, type Point, type Unit, type World } from './world.ts';

/**
 * ¿Están en guerra? Fase 2: todos contra todos.
 * En la fase 4 la diplomacia (alianzas, paz, guerra) se decidirá aquí.
 */
export function isEnemy(a: number, b: number): boolean {
  return a !== b;
}

export type Target = { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building };

export function targetOf(world: World, id: number): Target | null {
  const unit = world.units.get(id);
  if (unit && unit.hp > 0) return { kind: 'unit', unit };
  const building = world.buildings.get(id);
  if (building && building.hp > 0) return { kind: 'building', building };
  return null;
}

function ownerOf(t: Target): number {
  return t.kind === 'unit' ? t.unit.owner : t.building.owner;
}

/** Cuadrícula de unidades para buscar vecinos rápido (se rehace en cada paso). */
export class UnitGrid {
  static readonly CELL = 4;
  private cells = new Map<number, Unit[]>();
  constructor(world: World) {
    for (const u of world.units.values()) {
      const k = this.key(Math.floor(u.x / UnitGrid.CELL), Math.floor(u.y / UnitGrid.CELL));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(u);
    }
  }
  private key(cx: number, cy: number): number {
    return cy * 10_000 + cx;
  }
  /** Unidades a distancia ≤ r de (x, y). */
  *near(x: number, y: number, r: number): Generator<Unit> {
    const c = UnitGrid.CELL;
    for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++)
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (const u of list) if (u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= r) yield u;
      }
  }
}

/** Orden de atacar (del jugador o elegida por la propia unidad). */
export function assignAttack(u: Unit, targetId: number, auto = false): void {
  u.task = { kind: 'attack', targetId, auto };
  u.state = 'attacking';
  u.path = [];
  u.chaseGoal = null;
  u.repathIn = 0;
}

/**
 * Mejor objetivo enemigo cerca: gana el de menor "puntaje" = distancia +
 * penalización (trabajadores +3, edificios +6). Así se prioriza a quien pelea.
 */
export function findTarget(
  world: World,
  grid: UnitGrid,
  owner: number,
  x: number,
  y: number,
  radius: number,
  unitsOnly = false,
): Target | null {
  let best: Target | null = null;
  let bestScore = Infinity;
  for (const o of grid.near(x, y, radius)) {
    if (!isEnemy(owner, o.owner)) continue;
    const score = Math.hypot(o.x - x, o.y - y) + (o.type === 'worker' ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { kind: 'unit', unit: o };
    }
  }
  if (!unitsOnly)
    for (const b of world.buildings.values()) {
      if (!isEnemy(owner, b.owner)) continue;
      const d = distanceToRect(x, y, b.tx, b.ty, b.size);
      if (d <= radius && d + 6 < bestScore) {
        bestScore = d + 6;
        best = { kind: 'building', building: b };
      }
    }
  return best;
}

/** Distancia de un punto al objetivo (al centro de la unidad o al borde del edificio). */
function distanceTo(x: number, y: number, t: Target): number {
  return t.kind === 'unit'
    ? Math.hypot(t.unit.x - x, t.unit.y - y)
    : distanceToRect(x, y, t.building.tx, t.building.ty, t.building.size);
}

/** ¿Alcanza a golpear? Cuerpo a cuerpo: contacto; a distancia: dentro del alcance. */
function inAttackRange(x: number, y: number, attack: AttackDef, t: Target): boolean {
  const d = distanceTo(x, y, t);
  if (attack.type === 'ranged') return d <= attack.range + (t.kind === 'unit' ? 0.5 : 0);
  return d <= (t.kind === 'unit' ? MELEE_REACH : 0.8);
}

function categoryOf(t: Target, world: World): Category {
  return t.kind === 'unit' ? world.statsOf(t.unit).category : 'building';
}

function centerOf(t: Target): Point {
  return t.kind === 'unit'
    ? { x: t.unit.x, y: t.unit.y }
    : { x: t.building.tx + t.building.size / 2, y: t.building.ty + t.building.size / 2 };
}

/** Aplica un golpe. `from` es la posición del atacante (para dibujar flechas). */
function strike(world: World, owner: number, attack: AttackDef, cat: Category, from: Point, t: Target, attacker?: Unit): void {
  const armor = t.kind === 'unit' ? world.statsOf(t.unit).armor : BUILDING_DEFS[t.building.type].armor;
  const dmg = damage(attack, cat, categoryOf(t, world), armor);
  const at = centerOf(t);
  const before = t.kind === 'unit' ? t.unit.hp : t.building.hp;
  if (t.kind === 'unit') t.unit.hp -= dmg;
  else t.building.hp -= dmg;
  // Estadística: quién dio el golpe final.
  if (before > 0 && before - dmg <= 0) {
    const p = world.players.get(owner);
    if (p) p.kills++;
  }
  if (attack.type === 'ranged') world.events.push({ k: 'shot', x1: from.x, y1: from.y, x2: at.x, y2: at.y });
  else world.events.push({ k: 'hit', x: at.x, y: at.y });

  // Aviso para el atacado (como mucho uno cada 15 segundos).
  const victim = world.players.get(ownerOf(t));
  if (victim && world.tick - victim.lastAttackNotice > 150) {
    victim.lastAttackNotice = world.tick;
    world.notify(victim.id, '¡Te están atacando!');
  }
  // Una unidad militar quieta que recibe un golpe responde.
  if (attacker && t.kind === 'unit' && t.unit.hp > 0 && !t.unit.task && t.unit.state === 'idle' && t.unit.type !== 'worker')
    assignAttack(t.unit, attacker.id, true);
}

/** Intervalo (pasos) entre búsquedas automáticas de objetivo, repartido por id. */
const SCAN_EVERY = 5;
/** Pasos entre recálculos del camino de persecución. */
const REPATH_TICKS = 5;

export function updateCombat(world: World, dt: number): void {
  const grid = new UnitGrid(world);

  for (const u of world.units.values()) {
    if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt);
    const stats = world.statsOf(u);

    // Militares quietos: buscan enemigos a la vista.
    if (!u.task && u.state === 'idle' && stats.category !== 'worker' && (world.tick + u.id) % SCAN_EVERY === 0) {
      const t = findTarget(world, grid, u.owner, u.x, u.y, stats.sight);
      if (t) assignAttack(u, t.kind === 'unit' ? t.unit.id : t.building.id, true);
    }
    if (u.task?.kind !== 'attack') continue;

    let t = targetOf(world, u.task.targetId);
    if (t && !isEnemy(u.owner, ownerOf(t))) t = null;
    // Si lo eligió sola, lo deja si se aleja demasiado (no persigue por todo el mapa).
    if (t && u.task.auto && distanceTo(u.x, u.y, t) > stats.sight + 3) t = null;
    if (!t) {
      // Objetivo muerto o perdido: si es militar, busca otro cerca; si no, queda libre.
      const next = stats.category !== 'worker' ? findTarget(world, grid, u.owner, u.x, u.y, stats.sight) : null;
      if (next) assignAttack(u, next.kind === 'unit' ? next.unit.id : next.building.id, true);
      else stopWork(u);
      continue;
    }

    if (inAttackRange(u.x, u.y, stats.attack, t)) {
      u.path = [];
      u.chaseGoal = null;
      if (u.cooldown <= 0) {
        strike(world, u.owner, stats.attack, stats.category, u, t, u);
        u.cooldown = stats.attack.cooldown;
      }
      continue;
    }
    chase(world, u, t);
  }

  // Edificios que disparan (Centro Urbano).
  for (const b of world.buildings.values()) {
    const def = BUILDING_DEFS[b.type];
    if (!def.attack || b.progress < 1) continue;
    if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown > 0) continue;
    const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
    // Alcance medido desde el borde del edificio.
    const t = findTarget(world, grid, b.owner, cx, cy, def.attack.range + b.size / 2, true);
    if (!t) continue;
    strike(world, b.owner, def.attack, 'building', { x: cx, y: cy - 1 }, t);
    b.cooldown = def.attack.cooldown;
  }
}

/** Persigue al objetivo: en línea recta si se puede, si no con A*. */
function chase(world: World, u: Unit, t: Target): void {
  const goal = centerOf(t);
  const moved = !u.chaseGoal || Math.hypot(goal.x - u.chaseGoal.x, goal.y - u.chaseGoal.y) > 1.5;
  if (u.repathIn > 0) u.repathIn--;
  if (u.path.length > 0 && (!moved || u.repathIn > 0)) return;
  u.repathIn = REPATH_TICKS;
  u.chaseGoal = goal;
  let path: Point[] | null;
  if (t.kind === 'building') path = pathToRect(world, u, t.building.tx, t.building.ty, t.building.size);
  else if (clearLine(world, u, goal)) path = [goal];
  else path = pathToPoint(world, u, goal.x, goal.y);
  if (!path) {
    stopWork(u); // no hay forma de llegar
    return;
  }
  u.path = path;
}

/** Quita del mapa lo que se quedó sin vida. */
export function removeDead(world: World): void {
  for (const u of world.units.values()) {
    if (u.hp > 0) continue;
    world.units.delete(u.id);
    world.events.push({ k: 'death', x: u.x, y: u.y });
  }
  for (const b of world.buildings.values()) {
    if (b.hp > 0) continue;
    world.removeBuilding(b.id);
    world.events.push({ k: 'destroyed', x: b.tx + b.size / 2, y: b.ty + b.size / 2, size: b.size });
    world.notify(b.owner, `Perdiste un edificio: ${BUILDING_DEFS[b.type].label}`);
  }
}
