// Combate sencillo de explicar:
//   daño = ataque × ventaja de tipo − armadura (mínimo 1)
// Cuerpo a cuerpo hay que tocar al objetivo; a distancia basta con tenerlo
// dentro del alcance. Las unidades militares quietas atacan solas a los
// enemigos que ven (primero a quien puede pelear, luego trabajadores y al
// final edificios). El Centro Urbano y las torres disparan a los enemigos
// cercanos. A los aviones solo los alcanzan los ataques a distancia.

import { BUILDING_DEFS, CHARGE_READY_SEC, FLANK_DAMAGE, MELEE_REACH, REAR_DAMAGE, ROUTING_DAMAGE, TICK_RATE, UNIT_DEFS, ELEV_RANGE_PER_LEVEL, CLIMB_DAMAGE_DEALT, CLIMB_DAMAGE_TAKEN, WALL_COVER, FATIGUE_CHARGE, FATIGUE_MELEE_HIT, FATIGUE_RANGED_HIT, GUARD_ENGAGE, GUARD_LEASH, RANK_DAMAGE, SPEAR_BRACE_DAMAGE, SKIRMISH_DIST, SKIRMISH_STEP, rankOf, type AttackDef, type Category } from '../../../shared/data.ts';
import { canHitAir, chargeOf, damage } from '../../../shared/stats.ts';
import { elevationDamage } from '../../../shared/terrain.ts';
import { isEnemy } from './diplomacy.ts';
import { stopWork } from './gather.ts';
import { deathMorale, flankSide, hitMorale, isRouting } from './morale.ts';
import { buffArmor, buffDamage } from './general.ts';
import { fatigueOf, spend } from './fatigue.ts';
import { clearLine, pathToPoint, pathToRect } from './pathfinding.ts';
import { distanceToRect, type Building, type Point, type Unit, type World } from './world.ts';

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
  /** Unidades vivas a distancia ≤ r de (x, y). (Un arreglo: mucho más rápido que un generador.) */
  near(x: number, y: number, r: number): Unit[] {
    const c = UnitGrid.CELL, r2 = r * r, out: Unit[] = [];
    const cx1 = Math.floor((x + r) / c), cy1 = Math.floor((y + r) / c);
    for (let cy = Math.floor((y - r) / c); cy <= cy1; cy++)
      for (let cx = Math.floor((x - r) / c); cx <= cx1; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const u = list[i], dx = u.x - x, dy = u.y - y;
          if (u.hp > 0 && dx * dx + dy * dy <= r2) out.push(u);
        }
      }
    return out;
  }
}

/** Orden de atacar (del jugador o elegida por la propia unidad). */
export function assignAttack(u: Unit, targetId: number, auto = false): void {
  u.walking = false; // a la carga se va corriendo
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
  hitsAir = false,
  buildingsOnly = false,
  crowd?: Map<number, number>,
): Target | null {
  let best: Target | null = null;
  let bestScore = Infinity;
  if (!buildingsOnly)
  for (const o of grid.near(x, y, radius)) {
    if (!isEnemy(world, owner, o.owner)) continue;
    if (!hitsAir && world.statsOf(o).flies) continue;
    const score = Math.hypot(o.x - x, o.y - y) + (o.type === 'worker' ? 3 : 0) + (crowd?.get(o.id) ?? 0) * CROWD_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      best = { kind: 'unit', unit: o };
    }
  }
  if (!unitsOnly)
    for (const b of world.buildings.values()) {
      if (!isEnemy(world, owner, b.owner)) continue;
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
export function strike(world: World, owner: number, attack: AttackDef, cat: Category, from: Point, t: Target, attacker?: Unit): void {
  let armor = t.kind === 'unit' ? world.statsOf(t.unit).armor : BUILDING_DEFS[t.building.type].armor;
  if (t.kind === 'unit') {
    // Sobre la propia muralla, las almenas cubren de las flechas.
    const cover = attack.type === 'ranged' && world.onWall(t.unit) === 1 ? WALL_COVER : 0;
    const extra = buffArmor(t.unit) + Math.max(0, rankOf(t.unit.kills) - 1) + cover;
    if (extra) armor = { melee: armor.melee + extra, ranged: armor.ranged + extra };
  }
  const as = attacker ? world.statsOf(attacker) : undefined;
  const tw = t.kind === 'unit' ? world.statsOf(t.unit).weapon : undefined;
  // De qué lado llega el golpe: de frente (0), de costado (1) o por la espalda (2).
  const side: 0 | 1 | 2 = t.kind === 'unit' && attacker ? flankSide(t.unit, attacker.x, attacker.y) : 0;
  // El muro de lanzas solo protege de frente: por el costado o la espalda, la caballería entra igual.
  const twHit = tw === 'spear' && cat === 'cavalry' && side !== 0 ? undefined : tw;
  let dmg = damage(attack, cat, categoryOf(t, world), armor, as?.bonus, as?.weapon, twHit);
  if (attacker && attacker.buff === 1) dmg = Math.round(dmg * buffDamage(attacker));
  // Veteranía: cada rango pega un poco más y el veterano de rango 2+ tiene más armadura.
  if (attacker && attacker.kills) dmg = Math.round(dmg * (1 + RANK_DAMAGE * rankOf(attacker.kills)));
  // Cansancio: pega más flojo, y cada golpe cansa.
  if (attacker) {
    dmg = Math.max(1, Math.round(dmg * fatigueOf(attacker.stamina).attack));
    spend(attacker, attack.type === 'melee' ? FATIGUE_MELEE_HIT : FATIGUE_RANGED_HIT);
  }
  // Colinas: de arriba hacia abajo se pega más fuerte (y al revés, menos).
  {
    const c = centerOf(t);
    const hFrom = attacker ? world.unitHeight(attacker) : world.heightAt(from.x, from.y);
    const hTo = t.kind === 'unit' ? world.unitHeight(t.unit) : world.heightAt(c.x, c.y);
    dmg = Math.max(1, Math.round(dmg * elevationDamage(hFrom, hTo)));
  }
  // Asedio: el que trepa por la escala pega poco y queda expuesto.
  if (attacker && world.onWall(attacker) === 2) dmg = Math.max(1, Math.round(dmg * CLIMB_DAMAGE_DEALT));
  if (t.kind === 'unit' && world.onWall(t.unit) === 2) dmg = Math.round(dmg * CLIMB_DAMAGE_TAKEN);
  // Flancos (Attila): cuerpo a cuerpo de costado o por la espalda hace más daño; el que huye recibe más.
  if (t.kind === 'unit') {
    if (attack.type === 'melee') dmg = Math.round(dmg * (side === 2 ? REAR_DAMAGE : side === 1 ? FLANK_DAMAGE : 1));
    if (isRouting(t.unit)) dmg = Math.round(dmg * ROUTING_DAMAGE);
  }
  if (attacker) {
    // Quien golpea mira a su objetivo.
    const c = centerOf(t), dx = c.x - attacker.x, dy = c.y - attacker.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) [attacker.fx, attacker.fy] = [dx / d, dy / d];
  }
  // Carga: la caballería cuerpo a cuerpo que lleva un rato sin pelear golpea más fuerte la primera vez.
  let charge = false;
  if (attacker && cat === 'cavalry' && attack.type === 'melee' && world.tick - attacker.lastStrike >= CHARGE_READY_SEC * TICK_RATE) {
    spend(attacker, FATIGUE_CHARGE);
    if (tw === 'spear' && side === 0) {
      // De frente contra las lanzas: la carga se clava. Sin bonificación, y el jinete sale herido.
      attacker.hp -= SPEAR_BRACE_DAMAGE;
      world.events.push({ k: 'hit', x: attacker.x, y: attacker.y });
    } else {
      dmg = Math.round(dmg * chargeOf(world.factionOf(owner)));
      charge = true;
    }
  }
  if (attacker) attacker.lastStrike = world.tick;
  const at = centerOf(t);
  const before = t.kind === 'unit' ? t.unit.hp : t.building.hp;
  if (t.kind === 'unit') {
    t.unit.hp -= dmg;
    hitMorale(world, t.unit, dmg, side, owner, attack.type === 'melee');
  } else {
    t.building.hp -= dmg;
    // Quién golpeó la capital por última vez (si cae, la conquistó él).
    if (t.building.type === 'town_center') {
      const victim = world.players.get(t.building.owner);
      if (victim && owner !== victim.id) victim.capitalHitBy = owner;
    }
  }
  // Estadística: quién dio el golpe final.
  if (before > 0 && before - dmg <= 0) {
    const p = world.players.get(owner);
    if (p) p.kills++;
    if (attacker && t.kind === 'unit') {
      const before = rankOf(attacker.kills);
      attacker.kills++;
      if (rankOf(attacker.kills) > before) world.events.push({ k: 'rank', x: attacker.x, y: attacker.y, r: rankOf(attacker.kills) });
    }
  }
  if (attack.type === 'ranged') {
    const look = attacker ? UNIT_DEFS[attacker.type].shot : undefined;
    world.events.push({ k: 'shot', x1: from.x, y1: from.y, x2: at.x, y2: at.y, s: look === 'bullet' ? 1 : look === 'shell' ? 2 : 0 });
  }
  else world.events.push({ k: 'hit', x: at.x, y: at.y, ...(charge ? { c: 1 as const } : {}), ...(side ? { fl: side } : {}) });

  // Aviso para el atacado (como mucho uno cada 15 segundos).
  const victim = world.players.get(ownerOf(t));
  if (victim && world.tick - victim.lastAttackNotice > 150) {
    victim.lastAttackNotice = world.tick;
    world.notify(victim.id, 'You are under attack!');
  }
  // Una unidad militar quieta que recibe un golpe responde.
  if (attacker && t.kind === 'unit' && t.unit.hp > 0 && !t.unit.task && t.unit.state === 'idle' && t.unit.type !== 'worker' && !isRouting(t.unit) && !UNIT_DEFS[t.unit.type].buildingsOnly && !UNIT_DEFS[t.unit.type].docks)
    assignAttack(t.unit, attacker.id, true);
}

/** Intervalo (pasos) entre búsquedas automáticas de objetivo, repartido por id. */
const SCAN_EVERY = 5;
/** Pasos entre recálculos del camino de persecución. */
const REPATH_TICKS = 5;

export function updateCombat(world: World, dt: number): void {
  const grid = new UnitGrid(world);

  const crowd = crowdMap(world);
  for (const u of world.units.values()) {
    if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt);
    if (isRouting(u)) continue; // huyendo no pelea
    if (UNIT_DEFS[u.type].docks) continue; // la torre de asedio no pelea
    const stats = world.statsOf(u);
    const onlyBuildings = UNIT_DEFS[u.type].buildingsOnly === true;
    const holding = u.guard || u.hold;

    // Hostigamiento: los arqueros retroceden si un enemigo cuerpo a cuerpo se les viene encima.
    if ((world.tick + u.id) % SCAN_EVERY === 0 && skirmish(world, grid, u, stats)) continue;
    // Militares quietos: buscan enemigos a la vista (en modo guardia, solo los que llegan cerca).
    const hitsAir = canHitAir(stats.attack);
    if (!u.task && u.state === 'idle' && stats.category !== 'worker' && (world.tick + u.id) % SCAN_EVERY === 0) {
      const scan = holding ? (stats.attack.type === 'ranged' ? stats.attack.range + 0.5 : GUARD_ENGAGE) : stats.sight;
      const t = findTarget(world, grid, u.owner, u.x, u.y, scan, false, hitsAir, onlyBuildings, crowd);
      if (t) {
        assignAttack(u, t.kind === 'unit' ? t.unit.id : t.building.id, true);
        if (t.kind === 'unit') crowd.set(t.unit.id, (crowd.get(t.unit.id) ?? 0) + 1);
      }
    }
    if (u.task?.kind !== 'attack') continue;

    let t = targetOf(world, u.task.targetId);
    if (t && !isEnemy(world, u.owner, ownerOf(t))) t = null;
    if (t && t.kind === 'unit' && !hitsAir && world.statsOf(t.unit).flies) t = null;
    if (t && t.kind === 'unit' && onlyBuildings) t = null;
    // Si lo eligió sola, lo deja si se aleja demasiado (no persigue por todo el mapa).
    if (t && u.task.auto && distanceTo(u.x, u.y, t) > stats.sight + 3) t = null;
    // En modo guardia no se aleja de su puesto: vuelve a él.
    if (t && u.task.auto && holding && u.post && Math.hypot(u.x - u.post.x, u.y - u.post.y) > GUARD_LEASH) {
      backToPost(world, u);
      continue;
    }
    if (!t) {
      // Objetivo muerto o perdido: si es militar, busca otro cerca; si no, queda libre.
      const scan = holding ? (stats.attack.type === 'ranged' ? stats.attack.range + 0.5 : GUARD_ENGAGE) : stats.sight;
      const next = stats.category !== 'worker' ? findTarget(world, grid, u.owner, u.x, u.y, scan, false, hitsAir, onlyBuildings, crowd) : null;
      if (next) {
        assignAttack(u, next.kind === 'unit' ? next.unit.id : next.building.id, true);
        if (next.kind === 'unit') crowd.set(next.unit.id, (crowd.get(next.unit.id) ?? 0) + 1);
      } else if (holding && u.post && Math.hypot(u.x - u.post.x, u.y - u.post.y) > 0.8) backToPost(world, u);
      else stopWork(u);
      continue;
    }

    if (inAttackRange(u.x, u.y, withHeight(world, stats.attack, u, t), t)) {
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

  // Edificios que disparan (Centro Urbano y torres).
  for (const b of world.buildings.values()) {
    const def = BUILDING_DEFS[b.type];
    if (!def.attack || b.progress < 1) continue;
    if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown > 0) continue;
    const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
    // Alcance medido desde el borde del edificio.
    const t = findTarget(world, grid, b.owner, cx, cy, def.attack.range + b.size / 2 + Math.max(0, world.heightAt(cx, cy)) * ELEV_RANGE_PER_LEVEL, true, true);
    if (!t) continue;
    strike(world, b.owner, def.attack, 'building', { x: cx, y: cy - 1 }, t);
    b.cooldown = def.attack.cooldown;
  }
}

/** Desde lo alto se dispara más lejos: alcance extra por cada nivel por encima del objetivo. */
export function withHeight(world: World, attack: AttackDef, u: Point, t: Target): AttackDef {
  if (attack.type !== 'ranged') return attack;
  const c = centerOf(t);
  const hu = 'owner' in u ? world.unitHeight(u as Unit) : world.heightAt(u.x, u.y);
  const ht = t.kind === 'unit' ? world.unitHeight(t.unit) : world.heightAt(c.x, c.y);
  const up = hu - ht;
  return up > 0 ? { ...attack, range: attack.range + up * ELEV_RANGE_PER_LEVEL } : attack;
}

/** Cuánto "cuesta" elegir a un enemigo que ya pelea con otros (evita que todos se amontonen sobre uno). */
const CROWD_PENALTY = 1.3;

/** Cuántos atacan a cada unidad ahora mismo. */
function crowdMap(world: World): Map<number, number> {
  const m = new Map<number, number>();
  for (const u of world.units.values()) if (u.task?.kind === 'attack') m.set(u.task.targetId, (m.get(u.task.targetId) ?? 0) + 1);
  return m;
}

/**
 * Orden de atacar a una unidad (Total War): como dos regimientos que chocan, cada soldado toma
 * al enemigo más cercano de ESA formación (los que están a menos de 6 casillas del elegido),
 * repartiéndose para que no se amontonen todos sobre uno.
 */
export function spreadAttack(world: World, attackers: Unit[], target: Unit): void {
  const cands = [target];
  for (const o of world.units.values())
    if (o !== target && o.owner === target.owner && o.hp > 0 && (o.x - target.x) ** 2 + (o.y - target.y) ** 2 <= 36 && (o.type !== 'worker' || target.type === 'worker'))
      cands.push(o);
  const cap = Math.max(1, Math.ceil(attackers.length / cands.length));
  const load = new Map<number, number>();
  const order = [...attackers].sort((a, b) => (a.x - target.x) ** 2 + (a.y - target.y) ** 2 - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2));
  for (const u of order) {
    let best = target, bestScore = Infinity;
    for (const c of cands) {
      const n = load.get(c.id) ?? 0;
      if (n >= cap) continue;
      const s = Math.hypot(c.x - u.x, c.y - u.y) + n * CROWD_PENALTY * 2;
      if (s < bestScore) [bestScore, best] = [s, c];
    }
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    u.hold = false;
    assignAttack(u, best.id);
  }
}

/** Modo guardia: vuelve a su puesto. */
function backToPost(world: World, u: Unit): void {
  stopWork(u);
  const p = u.post!;
  u.path = clearLine(world, u, p) ? [p] : (pathToPoint(world, u, p.x, p.y) ?? []);
  u.state = u.path.length ? 'moving' : 'idle';
}

/**
 * Hostigamiento (Total War): un arquero (o jinete arquero) que no está en modo guardia y no
 * recibió una orden directa retrocede si un enemigo cuerpo a cuerpo está por alcanzarlo.
 * Devuelve true si retrocedió.
 */
function skirmish(world: World, grid: UnitGrid, u: Unit, stats: ReturnType<World['statsOf']>): boolean {
  if (stats.attack.type !== 'ranged' || stats.category === 'siege' || stats.category === 'building' || u.guard || u.hold) return false;
  if (u.task && !(u.task.kind === 'attack' && u.task.auto)) return false; // el jugador le ordenó atacar: obedece
  if (world.tick < u.skirmishUntil || u.state === 'moving') return false;
  if (world.onWall(u) === 1) return false; // sobre su muralla está a salvo: no baja
  let threat: Unit | null = null, best = SKIRMISH_DIST ** 2;
  for (const o of grid.near(u.x, u.y, SKIRMISH_DIST)) {
    if (!isEnemy(world, u.owner, o.owner) || o.routing > 0) continue;
    const os = world.statsOf(o);
    if (os.attack.type !== 'melee' || os.category === 'worker' || UNIT_DEFS[o.type].buildingsOnly) continue;
    const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
    if (d < best) [best, threat] = [d, o];
  }
  if (!threat) return false;
  const dx = u.x - threat.x, dy = u.y - threat.y, len = Math.hypot(dx, dy) || 1;
  const goal = { x: u.x + (dx / len) * SKIRMISH_STEP, y: u.y + (dy / len) * SKIRMISH_STEP };
  if (!world.inBounds(Math.floor(goal.x), Math.floor(goal.y)) || !world.isWalkable(Math.floor(goal.x), Math.floor(goal.y))) return false;
  if (!clearLine(world, u, goal)) return false;
  stopWork(u);
  u.path = [goal];
  u.state = 'moving';
  u.skirmishUntil = world.tick + 2 * TICK_RATE;
  return true;
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
  if (world.statsOf(u).flies) path = [goal];
  else if (t.kind === 'building') path = pathToRect(world, u, t.building.tx, t.building.ty, t.building.size);
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
    deathMorale(world, u);
    const owner = world.players.get(u.owner);
    if (owner) owner.lost++;
    world.units.delete(u.id);
    world.events.push({ k: 'death', x: u.x, y: u.y });
  }
  for (const b of world.buildings.values()) {
    if (b.hp > 0) continue;
    world.removeBuilding(b.id);
    world.events.push({ k: 'destroyed', x: b.tx + b.size / 2, y: b.ty + b.size / 2, size: b.size });
    world.notify(b.owner, `You lost a building: ${BUILDING_DEFS[b.type].label}`);
  }
}
