// Movimiento: seguir caminos, mover grupos en formación y separar unidades
// que quedan amontonadas en el mismo punto.

import { CLIMB_SECONDS, TICK_RATE, WALK_FATIGUE, WALK_SPEED, FATIGUE_FORMATION, FATIGUE_PER_TILE, UNIT_DEFS, UPHILL_MIN_SPEED, WALL_SPEED_CLIMBER, WALL_SPEED_DEFENDER, type Category } from '../../../shared/data.ts';
import { fatigueOf, spend } from './fatigue.ts';
import type { Formation } from '../../../shared/protocol.ts';
import { formationLayout, rankOf } from '../../../shared/formation.ts';
import { clearLine, pathToPoint } from './pathfinding.ts';
import { isEnemy } from './diplomacy.ts';
import { WALL, type Point, type Unit, type World } from './world.ts';

/** Avanza cada unidad por su camino. `dt` en segundos. */
export function moveUnits(world: World, dt: number): void {
  const bodies = bucketBodies(world);
  for (const u of world.units.values()) {
    if (u.path.length === 0) continue;
    const stats = world.statsOf(u);
    world.setWalker(u);
    // En formación, todos marchan al paso del más lento.
    const speed = u.routing > 0 ? stats.speed * 1.2 : u.state === 'moving' && u.speedCap > 0 ? Math.min(stats.speed, u.speedCap) : stats.speed;
    const slope = stats.flies ? 1 : uphill(world, u);
    const wallMode = world.onWall(u);
    const wallSpeed = wallMode === 1 || wallMode === 3 ? WALL_SPEED_DEFENDER : wallMode === 2 ? WALL_SPEED_CLIMBER : 1;
    const wasOnWall = wallMode !== 0;
    const pace = u.walking && u.state === 'moving' ? WALK_SPEED : 1;
    let budget = speed * dt * slope * fatigueOf(u.stamina).speed * wallSpeed * pace;
    const walked = budget;
    while (budget > 0 && u.path.length > 0) {
      const wp = u.path[0];
      const d = Math.hypot(wp.x - u.x, wp.y - u.y);
      let step = Math.min(d, budget);
      let nx = d > 0 ? u.x + ((wp.x - u.x) / d) * step : wp.x;
      let ny = d > 0 ? u.y + ((wp.y - u.y) / d) * step : wp.y;
      // Cada uno tiene su espacio: si el paso lo mete encima de otro, lo rodea.
      if (!stats.flies && step > 1e-6) {
        const block = blockerAt(world, bodies, u, nx, ny);
        if (block) {
          const around = sidestep(world, bodies, u, (nx - u.x) / step, (ny - u.y) / step, step);
          if (around) [nx, ny] = around;
          else if (isEnemy(world, u.owner, block.owner)) break; // contra la línea enemiga se frena: a pelear
          else {
            // Un compañero quieto: pasa despacio y lo corre a un lado.
            step *= 0.35;
            nx = u.x + ((wp.x - u.x) / d) * step;
            ny = u.y + ((wp.y - u.y) / d) * step;
            shove(world, block, u, (wp.x - u.x) / d, (wp.y - u.y) / d);
          }
        }
      }
      // El camino pudo quedar viejo (p. ej. se construyó algo encima): no atravesar paredes.
      if (!stats.flies && !world.isWalkable(Math.floor(nx), Math.floor(ny))) {
        rerouteBlocked(world, u);
        break;
      }
      if (step > 1e-6) [u.fx, u.fy] = [(nx - u.x) / step, (ny - u.y) / step]; // mira hacia donde camina
      u.x = nx;
      u.y = ny;
      budget -= step;
      if (step >= d || Math.hypot(wp.x - u.x, wp.y - u.y) < 0.05) u.path.shift();
      else if (step < Math.min(d, budget + step) - 1e-6) break; // rodeó o se frenó: sigue el próximo paso
    }
    // Sube a una muralla enemiga desde el suelo: con escalas tarda; por una torre acoplada, no.
    if (!wasOnWall && world.onWall(u) >= 2) {
      const i = Math.floor(u.y) * world.size + Math.floor(u.x);
      u.climb = world.rampFor(u.owner, i) ? 0 : CLIMB_SECONDS * TICK_RATE;
    } else if (world.onWall(u) === 0) u.climb = 0;
    // Cansancio: por lo recorrido; al paso en formación, menos; cuesta arriba, más.
    const done = walked - Math.max(0, budget);
    if (done > 0) spend(u, done * FATIGUE_PER_TILE * (u.speedCap > 0 ? FATIGUE_FORMATION : 1) * (u.routing > 0 ? 1.4 : 1) * (pace < 1 ? WALK_FATIGUE : 1) / slope);
    if (u.path.length === 0 && u.state === 'moving') {
      u.state = 'idle';
      u.speedCap = 0;
      if (u.arriveFace) {
        [u.fx, u.fy] = u.arriveFace;
        u.arriveFace = null;
      }
    }
  }
}

/** Unidades de tierra por casilla (para ver rápido quién está cerca). */
function bucketBodies(world: World): Map<number, Unit[]> {
  const m = new Map<number, Unit[]>();
  for (const u of world.units.values()) {
    if (u.hp <= 0 || world.statsOf(u).flies) continue;
    const k = Math.floor(u.y) * world.size + Math.floor(u.x);
    let b = m.get(k);
    if (!b) m.set(k, (b = []));
    b.push(u);
  }
  return m;
}

/**
 * ¿Chocaría con alguien al ir a (x, y)? Cuentan los enemigos y los compañeros quietos (los que
 * también caminan se acomodan solos al separarse). Solo si se acerca: alejarse siempre se puede.
 */
function blockerAt(world: World, bodies: Map<number, Unit[]>, u: Unit, x: number, y: number): Unit | null {
  const ru = BODY_RADIUS[UNIT_DEFS[u.type].category];
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const list = bodies.get((cy + dy) * world.size + (cx + dx));
      if (!list) continue;
      for (const o of list) {
        if (o === u) continue;
        if (o.path.length > 0 && !isEnemy(world, u.owner, o.owner)) continue;
        const min = (ru + BODY_RADIUS[UNIT_DEFS[o.type].category]) * 0.9;
        const dn = Math.hypot(x - o.x, y - o.y);
        if (dn < min && dn < Math.hypot(u.x - o.x, u.y - o.y) - 1e-4) return o;
      }
    }
  return null;
}

/** Intenta rodear: el mismo paso, girado a un lado o al otro. */
function sidestep(world: World, bodies: Map<number, Unit[]>, u: Unit, dx: number, dy: number, step: number): [number, number] | null {
  for (const a of [0.6, -0.6, 1.15, -1.15]) {
    const c = Math.cos(a), s = Math.sin(a);
    const x = u.x + (dx * c - dy * s) * step, y = u.y + (dx * s + dy * c) * step;
    if (world.isWalkable(Math.floor(x), Math.floor(y)) && !blockerAt(world, bodies, u, x, y)) return [x, y];
  }
  return null;
}

/** Corre a un compañero quieto hacia un costado para dejar pasar. */
function shove(world: World, o: Unit, by: Unit, dx: number, dy: number): void {
  // Hacia el lado en que ya está respecto de la marcha del que pasa.
  const side = (o.x - by.x) * -dy + (o.y - by.y) * dx >= 0 ? 1 : -1;
  nudge(world, o, -dy * side * 0.08, dx * side * 0.08);
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
 * Orden de mover: un grupo se reparte alrededor del punto, suelto o en formación
 * (ver rankedSpots). Se calcula UN camino para el líder y el resto lo reutiliza
 * cuando puede (mucho más barato que una búsqueda por unidad).
 */
export function moveGroup(
  world: World,
  units: Unit[],
  x: number,
  y: number,
  formation: Formation = 'loose',
  face?: Point,
  width?: number,
  run = true,
): void {
  if (units.length === 0) return;
  world.walker = units[0].owner;
  // Los puestos pueden caer sobre la muralla solo si todos son de a pie.
  world.walkerFoot = units.every((u) => ['infantry', 'ranged'].includes(UNIT_DEFS[u.type].category));
  // Al arrastrar un frente (face), siempre en filas.
  if (face && formation === 'loose') formation = 'line';
  const ranked = formation !== 'loose' && (units.length > 1 || face !== undefined);
  const plan = ranked ? rankedSpots(world, units, x, y, formation, face, width) : null;
  const assigned = plan ? plan.spots : looseSpots(world, units, x, y);

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
    u.speedCap = 0;
    // En formación, al llegar todos miran al frente (importa para los flancos).
    u.arriveFace = plan ? [plan.face.x, plan.face.y] : null;
    const soldier = UNIT_DEFS[u.type].category !== 'worker';
    u.walking = soldier && !run;
    u.hold = plan !== null && soldier;
    if (u.guard || u.hold) u.post = { ...spot };
    if (plan && u.state === 'idle') [u.fx, u.fy] = u.arriveFace!;
  }
  // En formación, todos al paso del más lento (los aviones y el asedio van aparte).
  if (ranked) {
    // Las máquinas de asedio no frenan a la tropa: llegan detrás, a su paso.
    const ground = units.filter((u) => !world.statsOf(u).flies && world.statsOf(u).category !== 'siege');
    const cap = Math.min(...ground.map((u) => world.statsOf(u).speed));
    for (const u of ground) if (u.state === 'moving') u.speedCap = cap;
  }
}

/**
 * Guarnecer la muralla: los soldados de a pie se reparten por los tramos de muralla propia
 * unidos al que se eligió (uno por tramo, empezando por el más cercano). Devuelve false si no
 * corresponde (no es muralla propia o hay unidades que no pueden subir).
 */
export function manWalls(world: World, units: Unit[], tx: number, ty: number): boolean {
  if (!units.length || !world.inBounds(tx, ty)) return false;
  const i0 = ty * world.size + tx;
  if (world.solid[i0] !== WALL) return false;
  const first = world.buildings.get(world.occupant[i0]);
  if (!first || world.relation(units[0].owner, first.owner) !== 'ally') return false;
  if (!units.every((u) => ['infantry', 'ranged'].includes(UNIT_DEFS[u.type].category))) return false;
  // Tramos unidos al elegido, por cercanía (recorrido en anchura).
  const tiles: Point[] = [];
  const seen = new Set([i0]);
  const queue = [i0];
  while (queue.length && tiles.length < units.length) {
    const i = queue.shift()!;
    const x = i % world.size, y = (i - x) / world.size;
    tiles.push({ x: x + 0.5, y: y + 0.5 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!world.inBounds(nx, ny)) continue;
      const j = ny * world.size + nx;
      if (seen.has(j) || world.solid[j] !== WALL) continue;
      const b = world.buildings.get(world.occupant[j]);
      if (!b || world.relation(units[0].owner, b.owner) !== 'ally') continue;
      seen.add(j);
      queue.push(j);
    }
  }
  // Si sobran soldados, se ponen de a dos por tramo.
  while (tiles.length < units.length) tiles.push({ ...tiles[tiles.length % Math.max(1, seen.size)] });
  for (const { u, spot } of assignNearest(units, tiles, tiles[0])) {
    u.task = null;
    u.chaseGoal = null;
    u.path = pathToPoint(world, u, spot.x, spot.y) ?? [];
    u.state = u.path.length ? 'moving' : 'idle';
    u.speedCap = 0;
    u.arriveFace = null;
    u.hold = true; // defienden su tramo
    u.post = { ...spot };
  }
  return true;
}

/** Grupo suelto: cada puesto de una cuadrícula compacta lo ocupa la unidad más cercana. */
function looseSpots(world: World, units: Unit[], x: number, y: number): { u: Unit; spot: Point }[] {
  const spots = units.length === 1 ? [{ x, y }] : formationSpots(world, x, y, units.length);
  return assignNearest(units, spots, { x, y });
}

/** La unidad más cercana a cada puesto lo ocupa (evita cruces largos); las que sobran van al punto. */
function assignNearest(units: Unit[], spots: Point[], fallback: Point): { u: Unit; spot: Point }[] {
  const assigned: { u: Unit; spot: Point }[] = [];
  const free = [...units];
  for (const spot of spots) {
    if (free.length === 0) break;
    let best = 0;
    for (let i = 1; i < free.length; i++)
      if (dist2(free[i], spot) < dist2(free[best], spot)) best = i;
    assigned.push({ u: free.splice(best, 1)[0], spot });
  }
  for (const u of free) assigned.push({ u, spot: fallback });
  return assigned;
}

export { RANK_SPACING } from '../../../shared/formation.ts';

/**
 * Formación en filas mirando hacia `face` (si falta, del centro del grupo al destino).
 * La geometría está en shared/formation.ts (la misma que dibuja la vista previa del cliente).
 */
function rankedSpots(
  world: World,
  units: Unit[],
  x: number,
  y: number,
  formation: Formation,
  face?: Point,
  width?: number,
): { spots: { u: Unit; spot: Point }[]; face: Point } {
  let fx: number, fy: number;
  if (face) [fx, fy] = [face.x, face.y];
  else {
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    [fx, fy] = [x - cx, y - cy];
    const len = Math.hypot(fx, fy);
    if (len < 0.5) [fx, fy] = [Math.SQRT1_2, Math.SQRT1_2]; // sin dirección clara: de frente a la cámara
    else [fx, fy] = [fx / len, fy / len];
  }
  const byRank = new Map<number, Unit[]>();
  for (const u of units) {
    const r = rankOf(UNIT_DEFS[u.type].category, formation);
    byRank.set(r, [...(byRank.get(r) ?? []), u]);
  }
  const layout = formationLayout(new Map([...byRank].map(([r, l]) => [r, l.length])), x, y, fx, fy, formation, width);
  const out: { u: Unit; spot: Point }[] = [];
  for (const [r, list] of byRank) out.push(...assignNearest(list, layout.get(r) ?? [], { x, y }));
  // Puestos sobre agua, montañas o edificios: al lugar libre más cercano.
  const taken = new Set<number>();
  for (const o of out) o.spot = freeNear(world, o.spot, taken) ?? { x, y };
  return { spots: out, face: { x: fx, y: fy } };
}

/** Subir una loma cuesta: fracción de la velocidad según la pendiente hacia el próximo punto. */
export function uphill(world: World, u: Unit): number {
  const wp = u.path[0];
  if (!wp) return 1;
  const d = Math.hypot(wp.x - u.x, wp.y - u.y);
  if (d < 1e-6) return 1;
  const look = Math.min(d, 0.5);
  const grade = (world.heightAt(u.x + ((wp.x - u.x) / d) * look, u.y + ((wp.y - u.y) / d) * look) - world.heightAt(u.x, u.y)) / look;
  return Math.max(UPHILL_MIN_SPEED, 1 - 0.45 * Math.max(0, grade));
}

export function freeSpot(world: World, p: Point, taken: Set<number>, owner = 0): Point | null {
  if (owner) world.walker = owner;
  world.walkerFoot = false; // los puestos sueltos, siempre en el suelo
  return freeNear(world, p, taken);
}

/** Punto caminable más cercano (de a media casilla), sin repetir uno ya tomado. */
function freeNear(world: World, p: Point, taken: Set<number>): Point | null {
  for (let r = 0; r <= 6; r++)
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const q = { x: p.x + i * 0.5, y: p.y + j * 0.5 };
        const tx = Math.floor(q.x), ty = Math.floor(q.y);
        const key = Math.round(q.y * 4) * 100_000 + Math.round(q.x * 4);
        if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size || !world.isWalkable(tx, ty) || taken.has(key)) continue;
        taken.add(key);
        return q;
      }
  return null;
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

/**
 * Espacio personal de cada tipo (radio en casillas): un jinete ocupa más que un soldado a pie, y
 * una máquina más todavía. Dos unidades no pueden quedar más cerca que la suma de sus radios.
 */
export const BODY_RADIUS: Record<Category, number> = {
  worker: 0.22,
  infantry: 0.27,
  ranged: 0.25,
  cavalry: 0.42,
  siege: 0.5,
  armor: 0.5,
  air: 0,
  building: 0.5,
};
/** "Peso" al empujarse: el más pesado se mueve menos (el caballo no pasa por encima de la infantería). */
const MASS: Record<Category, number> = { worker: 1, infantry: 1.2, ranged: 1, cavalry: 2.5, siege: 4, armor: 4, air: 1, building: 9 };

/**
 * Cada unidad tiene su espacio: las que se superponen se separan, también mientras caminan (así
 * la caballería se abre paso alrededor de la infantería en vez de pasar por encima). Las que
 * caminan ceden un poco menos para no frenarse del todo.
 */
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
    if (world.statsOf(u).flies) continue;
    const cu = UNIT_DEFS[u.type].category, ru = BODY_RADIUS[cu];
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const others = buckets.get((cy + dy) * world.size + (cx + dx));
        if (!others) continue;
        for (const o of others) {
          if (o === u || o.id < u.id) continue; // cada par una sola vez
          const co = UNIT_DEFS[o.type].category;
          const min = ru + BODY_RADIUS[co];
          let ox = u.x - o.x, oy = u.y - o.y;
          let d = Math.hypot(ox, oy);
          if (d >= min) continue;
          const overlap = (min - Math.min(d, min)) * 0.45;
          if (d < 1e-4) {
            // Exactamente encima: separar en una dirección fija según los ids.
            const ang = (u.id * 2.39996) % (Math.PI * 2);
            ox = Math.cos(ang);
            oy = Math.sin(ang);
            d = 1;
          }
          const mu = MASS[cu], mo = MASS[co];
          // El liviano cede más; el que camina, un poco menos.
          const su = (mo / (mu + mo)) * (u.path.length ? 0.6 : 1);
          const so = (mu / (mu + mo)) * (o.path.length ? 0.6 : 1);
          nudge(world, u, (ox / d) * overlap * su, (oy / d) * overlap * su);
          nudge(world, o, (-ox / d) * overlap * so, (-oy / d) * overlap * so);
        }
      }
  }
}

function nudge(world: World, u: Unit, dx: number, dy: number): void {
  const nx = u.x + dx, ny = u.y + dy;
  world.setWalker(u);
  if (world.isWalkable(Math.floor(nx), Math.floor(ny))) {
    u.x = nx;
    u.y = ny;
  }
}

function dist2(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
