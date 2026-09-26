// Guerra al estilo Total War, pero en tiempo real y en línea:
//
// - Marcha forzada: un ejército elige una ciudad enemiga, sale del mapa y aparece al
//   rato frente a esa ciudad (del lado por donde viene). El defensor ve cuánto falta.
// - Batalla: cuando un ejército enemigo llega (o entra caminando) a la ciudad, empieza
//   una batalla por ella: se muestra a todos, con la fuerza de cada bando y un reloj.
// - Fin: la ciudad cae si el atacante destruye su Centro Urbano (y la saquea); resiste
//   si el atacante se queda sin soldados, se retira o se le acaba el tiempo (entonces
//   sus soldados vuelven a casa en marcha forzada).
// - Las murallas importan: sin murallas se entra directo; con murallas hay que abrir
//   brecha o romper una puerta.

import {
  BATTLE_SECONDS,
  CITY_RADIUS,
  LOOT_MAX,
  LOOT_SHARE,
  MARCH_MAX_SECONDS,
  MARCH_MIN_SECONDS,
  MARCH_SPEED,
  RESOURCE_TYPES,
  TICK_RATE,
  UNIT_DEFS,
} from '../../../shared/data.ts';
import type { BattleEnd, BattleResultView, BattleView, MarchView } from '../../../shared/protocol.ts';
import { isEnemy } from './diplomacy.ts';
import { freeSpot } from './movement.ts';
import type { Battle, March, Point, Unit, World } from './world.ts';

/** Radio del campo de batalla: la ciudad y un poco más (para los que llegan). */
const FIELD_RADIUS = CITY_RADIUS + 5;
/** Segundos antes de dar por rechazado un ataque sin soldados (para que lleguen). */
const GRACE_SECONDS = 15;

const isSoldier = (u: Unit) => UNIT_DEFS[u.type].category !== 'worker';

/** Centro de la ciudad de un jugador: su primer Centro Urbano terminado. */
export function cityOf(world: World, playerId: number): Point | null {
  for (const b of world.buildings.values())
    if (b.owner === playerId && b.type === 'town_center' && b.progress >= 1) return { x: b.tx + b.size / 2, y: b.ty + b.size / 2 };
  return null;
}

function nameOf(world: World, id: number): string {
  return world.players.get(id)?.name ?? `Player ${id}`;
}

function marchSeconds(from: Point, to: Point): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(Math.max(MARCH_MIN_SECONDS, Math.min(MARCH_MAX_SECONDS, d / MARCH_SPEED)));
}

/** Orden de marchar sobre la ciudad de `target`. Devuelve un error o null. */
export function startMarch(world: World, owner: number, units: Unit[], target: number): string | null {
  const soldiers = units.filter(isSoldier);
  if (soldiers.length === 0) return 'Only soldiers can march on a city (not workers)';
  if (!world.players.has(target) || target === owner) return 'Choose an enemy city';
  if (!isEnemy(world, owner, target)) return `You are not at war with ${nameOf(world, target)}`;
  const city = cityOf(world, target);
  if (!city) return `${nameOf(world, target)} has no city to attack`;
  const from = { x: soldiers.reduce((s, u) => s + u.x, 0) / soldiers.length, y: soldiers.reduce((s, u) => s + u.y, 0) / soldiers.length };
  const secs = marchSeconds(from, city);
  for (const u of soldiers) world.units.delete(u.id);
  world.marches.push({
    id: world.nextWarId++,
    owner,
    target,
    units: soldiers.map((u) => ({ type: u.type, hp: u.hp })),
    from,
    arriveTick: world.tick + secs * TICK_RATE,
    home: false,
  });
  world.warVersion++;
  world.notify(owner, `Your army of ${soldiers.length} marches on ${nameOf(world, target)}'s city: it arrives in ${secs} s`);
  world.notify(target, `⚠ An army of ${soldiers.length} soldiers from ${nameOf(world, owner)} marches on your city: it arrives in ${secs} s!`);
  return null;
}

/** El atacante se retira: sus soldados en el campo vuelven a casa. */
export function retreat(world: World, playerId: number, battleId: number): void {
  const b = world.battles.find((x) => x.id === battleId);
  if (!b || b.attacker !== playerId) return;
  endBattle(world, b, 'retreat');
}

export function updateWar(world: World): void {
  // Llegadas.
  for (const m of [...world.marches]) if (world.tick >= m.arriveTick) arrive(world, m);
  // Batallas: una vez por segundo.
  if (world.tick % TICK_RATE !== 0) return;
  detectRaids(world);
  for (const b of [...world.battles]) updateBattle(world, b);
}

function arrive(world: World, m: March): void {
  world.marches = world.marches.filter((x) => x !== m);
  world.warVersion++;
  if (m.home) {
    const home = cityOf(world, m.owner) ?? anyBuilding(world, m.owner);
    if (!home) {
      world.notify(m.owner, `Your army had no home to return to and scattered`);
      return;
    }
    deploy(world, m.owner, m.units, home, m.from, 4);
    world.notify(m.owner, `Your army of ${m.units.length} is back home`);
    return;
  }
  const city = cityOf(world, m.target);
  if (!city || !isEnemy(world, m.owner, m.target)) {
    // Ya no hay ciudad o hay paz: el ejército da media vuelta.
    marchHome(world, m.owner, m.units, city ?? m.from);
    world.notify(m.owner, `Your army could not attack ${nameOf(world, m.target)} and returns home`);
    return;
  }
  const units = deploy(world, m.owner, m.units, city, m.from, CITY_RADIUS + 3);
  const b = openBattle(world, m.owner, m.target, city);
  for (const u of units) b.aIds.add(u.id);
}

function anyBuilding(world: World, owner: number): Point | null {
  for (const b of world.buildings.values()) if (b.owner === owner && b.progress >= 1) return { x: b.tx + b.size / 2, y: b.ty + b.size / 2 };
  return null;
}

/** Vuelve a casa en marcha forzada. */
function marchHome(world: World, owner: number, units: { type: March['units'][number]['type']; hp: number }[], from: Point): void {
  if (units.length === 0) return;
  const home = cityOf(world, owner) ?? anyBuilding(world, owner) ?? from;
  world.marches.push({ id: world.nextWarId++, owner, target: owner, units, from, arriveTick: world.tick + marchSeconds(from, home) * TICK_RATE, home: true });
  world.warVersion++;
}

/**
 * Pone a los soldados en el mapa en filas, a `dist` casillas del centro `at`, del lado
 * de `from` y mirando hacia `at` (infantería adelante, el resto atrás).
 */
function deploy(world: World, owner: number, units: March['units'], at: Point, from: Point, dist: number): Unit[] {
  let fx = at.x - from.x, fy = at.y - from.y;
  const len = Math.hypot(fx, fy) || 1;
  [fx, fy] = [fx / len, fy / len];
  const rx = -fy, ry = fx;
  const base = { x: at.x - fx * dist, y: at.y - fy * dist };
  const order = [...units].sort((a, b) => rank(a.type) - rank(b.type));
  const width = Math.max(3, Math.ceil(Math.sqrt(order.length * 2.5)));
  const taken = new Set<number>();
  const out: Unit[] = [];
  order.forEach((s, i) => {
    const row = Math.floor(i / width), n = Math.min(width, order.length - row * width), col = (i % width) - (n - 1) / 2;
    const want = { x: base.x + rx * col * 0.9 - fx * row * 0.9, y: base.y + ry * col * 0.9 - fy * row * 0.9 };
    const p = freeSpot(world, want, taken, owner) ?? freeSpot(world, at, taken, owner);
    if (!p) return;
    const u = world.addUnit(s.type, owner, p.x, p.y);
    u.hp = Math.min(u.hp, s.hp);
    out.push(u);
  });
  return out;
}

function rank(type: March['units'][number]['type']): number {
  const c = UNIT_DEFS[type].category;
  return c === 'infantry' || c === 'armor' ? 0 : c === 'cavalry' ? 1 : c === 'ranged' ? 2 : 3;
}

/** Batalla por la ciudad de `defender` contra `attacker` (si ya hay una, esa misma). */
function openBattle(world: World, attacker: number, defender: number, city: Point): Battle {
  const old = world.battles.find((b) => b.attacker === attacker && b.defender === defender);
  if (old) return old;
  const b: Battle = {
    id: world.nextWarId++,
    attacker,
    defender,
    x: city.x,
    y: city.y,
    r: FIELD_RADIUS,
    startTick: world.tick,
    endTick: world.tick + BATTLE_SECONDS * TICK_RATE,
    as: 0,
    ds: 0,
    a0: 0,
    d0: 0,
    aIds: new Set(),
    dIds: new Set(),
    buildings: new Set(),
  };
  for (const bd of world.buildings.values()) if (bd.owner === defender && inField(b, bd.tx + bd.size / 2, bd.ty + bd.size / 2)) b.buildings.add(bd.id);
  world.battles.push(b);
  world.warVersion++;
  world.announce(`⚔ Battle! ${nameOf(world, attacker)} attacks ${nameOf(world, defender)}'s city`);
  world.notify(attacker, `⚔ The battle for ${nameOf(world, defender)}'s city begins! Destroy their Town Center within ${Math.round(BATTLE_SECONDS / 60)} minutes`);
  world.notify(defender, `⚔ Your city is under attack by ${nameOf(world, attacker)}! Hold on for ${Math.round(BATTLE_SECONDS / 60)} minutes`);
  updateBattle(world, b);
  return b;
}

const inField = (b: Battle, x: number, y: number) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r;

/** Soldados enemigos que entran caminando a una ciudad también empiezan una batalla. */
function detectRaids(world: World): void {
  const cities = new Map<number, Point>();
  for (const id of world.players.keys()) {
    const c = cityOf(world, id);
    if (c) cities.set(id, c);
  }
  for (const u of world.units.values()) {
    if (!isSoldier(u)) continue;
    for (const [owner, c] of cities) {
      if (owner === u.owner || (u.x - c.x) ** 2 + (u.y - c.y) ** 2 > CITY_RADIUS * CITY_RADIUS) continue;
      if (!isEnemy(world, u.owner, owner)) continue;
      if (!world.battles.some((b) => b.attacker === u.owner && b.defender === owner)) openBattle(world, u.owner, owner, c);
    }
  }
}

function updateBattle(world: World, b: Battle): void {
  let as = 0, ds = 0;
  for (const u of world.units.values()) {
    if (!isSoldier(u) || !inField(b, u.x, u.y)) continue;
    if (u.owner === b.attacker) {
      as += u.hp;
      b.aIds.add(u.id);
    } else if (u.owner === b.defender) {
      ds += u.hp;
      b.dIds.add(u.id);
    }
  }
  if (as !== b.as || ds !== b.ds) world.warVersion++;
  b.as = Math.round(as);
  b.ds = Math.round(ds);
  b.a0 = Math.max(b.a0, b.as);
  b.d0 = Math.max(b.d0, b.ds);

  const city = cityOf(world, b.defender);
  if (!city || !inField(b, city.x, city.y)) return endBattle(world, b, 'fallen');
  if (as === 0 && world.tick - b.startTick >= GRACE_SECONDS * TICK_RATE) return endBattle(world, b, 'repelled');
  if (world.tick >= b.endTick) return endBattle(world, b, 'time');
}

function endBattle(world: World, b: Battle, end: BattleEnd): void {
  world.battles = world.battles.filter((x) => x !== b);
  world.warVersion++;
  const winner = end === 'fallen' ? b.attacker : b.defender;
  const lost = (ids: Set<number>) => [...ids].filter((id) => !world.units.has(id)).length;
  const al = lost(b.aIds), dl = lost(b.dIds);
  const buildings = [...b.buildings].filter((id) => !world.buildings.has(id)).length;
  const loot: BattleResultView['loot'] = {};
  if (end === 'fallen') {
    // Saqueo: el atacante se lleva parte de lo que guardaba el defensor.
    const pa = world.players.get(b.attacker), pd = world.players.get(b.defender);
    if (pa && pd)
      for (const r of RESOURCE_TYPES) {
        const n = Math.min(LOOT_MAX, Math.floor(pd.resources[r] * LOOT_SHARE));
        if (n <= 0) continue;
        pd.resources[r] -= n;
        pa.resources[r] += n;
        loot[r] = n;
      }
  } else {
    // Rechazado, sin tiempo o en retirada: los soldados del atacante que quedan en el campo vuelven a casa.
    const back: March['units'] = [];
    for (const u of [...world.units.values()])
      if (u.owner === b.attacker && isSoldier(u) && inField(b, u.x, u.y)) {
        back.push({ type: u.type, hp: u.hp });
        world.units.delete(u.id);
      }
    marchHome(world, b.attacker, back, { x: b.x, y: b.y });
  }
  const text: Record<BattleEnd, string> = {
    fallen: `${nameOf(world, b.defender)}'s city has fallen to ${nameOf(world, b.attacker)}`,
    repelled: `${nameOf(world, b.defender)} repelled the attack of ${nameOf(world, b.attacker)}`,
    time: `${nameOf(world, b.defender)} held the city: ${nameOf(world, b.attacker)} ran out of time`,
    retreat: `${nameOf(world, b.attacker)} retreated from ${nameOf(world, b.defender)}'s city`,
  };
  world.announce(`⚔ ${text[end]}`);
  world.battleResults.push({ id: b.id, a: b.attacker, d: b.defender, winner, end, al, dl, buildings, loot });
}

// ---------- Vistas para la red ----------

/** Marchas que ve un jugador (las suyas y las que van contra él); el profesor ve todas. */
export function marchViews(world: World, playerId: number): MarchView[] {
  return world.marches
    .filter((m) => playerId === 0 || m.owner === playerId || m.target === playerId)
    .map((m) => ({ id: m.id, owner: m.owner, target: m.target, n: m.units.length, left: Math.max(0, Math.ceil((m.arriveTick - world.tick) / TICK_RATE)), home: m.home }));
}

/** Batallas en curso: todos las ven (las batallas son públicas). */
export function battleViews(world: World): BattleView[] {
  return world.battles.map((b) => ({
    id: b.id,
    a: b.attacker,
    d: b.defender,
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    r: b.r,
    left: Math.max(0, Math.ceil((b.endTick - world.tick) / TICK_RATE)),
    as: b.as,
    ds: b.ds,
    a0: b.a0,
    d0: b.d0,
    al: [...b.aIds].filter((id) => !world.units.has(id)).length,
    dl: [...b.dIds].filter((id) => !world.units.has(id)).length,
  }));
}
