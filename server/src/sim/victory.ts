// Condiciones de victoria (idea de Total War).
//
// · Conquista: quien pierde su Centro Urbano (su capital) pierde su imperio: sus tropas se rinden
//   y sus edificios quedan en ruinas. Gana el último en pie (o la última alianza).
// · Colina Sagrada: el que mantiene la cima de la colina central (con al menos 3 soldados y sin
//   enemigos cerca) durante 5 minutos en total, gana. Solo cuenta desde la Edad Media.
// · Si se acaba el tiempo, gana quien tiene más Gloria (bajas, ciudades tomadas, colina, era…).

import {
  GLORY,
  HILL_HOLD_SECONDS,
  HILL_MIN_ERA,
  HILL_MIN_SOLDIERS,
  HILL_RADIUS,
  TICK_RATE,
  UNIT_DEFS,
} from '../../../shared/data.ts';
import type { VictoryView } from '../../../shared/protocol.ts';
import type { World } from './world.ts';

/** Gloria de un jugador (para desempatar al acabarse el tiempo). */
export function gloryOf(world: World, playerId: number): number {
  const p = world.players.get(playerId);
  if (!p) return 0;
  return Math.floor(
    p.kills * GLORY.kill +
      p.conquered * GLORY.city +
      (p.hillTicks / TICK_RATE) * GLORY.hillSecond +
      p.era * GLORY.era +
      p.gathered * GLORY.gathered +
      (p.defeated ? 0 : GLORY.alive),
  );
}

const alive = (world: World) => [...world.players.values()].filter((p) => !p.defeated);
const allied = (world: World, ids: number[]) => ids.every((a) => ids.every((b) => a === b || world.relation(a, b) === 'ally'));

/** Un jugador pierde su imperio: tropas rendidas, edificios en ruinas, marchas disueltas. */
export function defeat(world: World, playerId: number, by: number): void {
  const p = world.players.get(playerId);
  if (!p || p.defeated) return;
  p.defeated = true;
  const conqueror = by && by !== playerId ? world.players.get(by) : undefined;
  if (conqueror) conqueror.conquered++;
  for (const u of world.units.values())
    if (u.owner === playerId) {
      world.units.delete(u.id);
      world.events.push({ k: 'death', x: u.x, y: u.y });
    }
  for (const b of world.buildings.values())
    if (b.owner === playerId) {
      world.removeBuilding(b.id);
      world.events.push({ k: 'destroyed', x: b.tx + b.size / 2, y: b.ty + b.size / 2, size: b.size });
    }
  world.marches = world.marches.filter((m) => m.owner !== playerId);
  world.warVersion++;
  world.victoryVersion++;
  const text = conqueror ? `${p.name}'s capital was taken by ${conqueror.name}: their empire has fallen!` : `${p.name}'s empire has fallen!`;
  world.announce(text);
  world.notify(playerId, 'Your capital has fallen: your empire is defeated. You can keep watching the game.');
}

/** Una vez por paso: derrotas, Colina Sagrada y último en pie. */
export function updateVictory(world: World): void {
  if (world.outcome) return;
  // Conquista: sin Centro Urbano, el imperio cae.
  for (const p of world.players.values()) {
    if (p.defeated) continue;
    let tc = false;
    for (const b of world.buildings.values()) if (b.owner === p.id && b.type === 'town_center') tc = true;
    if (tc) p.hadCapital = true;
    else if (p.hadCapital) defeat(world, p.id, p.capitalHitBy); // tuvo capital y la perdió
  }
  updateHill(world);
  if (world.outcome) return;
  // Último en pie (o última alianza), si la partida empezó con al menos 2 jugadores.
  if (world.players.size >= 2) {
    const left = alive(world).map((p) => p.id);
    if (left.length === 0) world.outcome = { winners: [], reason: 'Every empire has fallen.' };
    else if (allied(world, left)) {
      const names = left.map((id) => world.players.get(id)!.name).join(' and ');
      world.outcome = { winners: left, reason: left.length === 1 ? `${names} conquered every rival!` : `The alliance of ${names} conquered every rival!` };
    }
  }
}

/** Colina Sagrada: quién la tiene y cuánto le falta. */
function updateHill(world: World): void {
  const h = world.hill;
  if (!h) return;
  const count = new Map<number, number>();
  for (const u of world.units.values()) {
    const cat = UNIT_DEFS[u.type].category;
    if (u.hp <= 0 || cat === 'worker' || cat === 'siege' || u.routing > 0) continue;
    if ((u.x - h.x) ** 2 + (u.y - h.y) ** 2 > HILL_RADIUS ** 2) continue;
    count.set(u.owner, (count.get(u.owner) ?? 0) + 1);
  }
  const owners = [...count.keys()];
  let holder = 0;
  const contested = owners.length > 0 && !allied(world, owners);
  if (!contested && owners.length) {
    // El que más soldados tiene arriba (entre aliados) es quien la tiene.
    const [best, n] = [...count].sort((a, b) => b[1] - a[1])[0];
    const total = [...count.values()].reduce((s, v) => s + v, 0);
    if (total >= HILL_MIN_SOLDIERS && world.eraOf(best) >= HILL_MIN_ERA && n > 0) holder = best;
  }
  const changed = holder !== h.holder || contested !== h.contested;
  h.holder = holder;
  h.contested = contested;
  if (holder) {
    const p = world.players.get(holder)!;
    p.hillTicks++;
    if (p.hillTicks % TICK_RATE === 0) world.victoryVersion++;
    if (p.hillTicks >= HILL_HOLD_SECONDS * TICK_RATE) {
      const winners = alive(world).filter((q) => q.id === holder || world.relation(q.id, holder) === 'ally').map((q) => q.id);
      world.outcome = { winners, reason: `${p.name} held the Sacred Hill for ${HILL_HOLD_SECONDS / 60} minutes!` };
    }
  }
  if (changed) world.victoryVersion++;
}

/** Se acabó el tiempo: gana quien tiene más Gloria (y sus aliados, si están en pie). */
export function decideByGlory(world: World): { winners: number[]; reason: string } {
  const ranked = alive(world).sort((a, b) => gloryOf(world, b.id) - gloryOf(world, a.id));
  if (!ranked.length) return { winners: [], reason: 'Time is up!' };
  const best = ranked[0];
  const winners = ranked.filter((q) => q.id === best.id || world.relation(q.id, best.id) === 'ally').map((q) => q.id);
  return { winners, reason: `Time is up! ${best.name} has the most glory (${gloryOf(world, best.id)}).` };
}

/** Lo que ven los clientes: la Colina Sagrada y quién cayó. */
export function victoryView(world: World): VictoryView {
  const h = world.hill;
  const defeated = [...world.players.values()].filter((p) => p.defeated).map((p) => p.id);
  if (!h) return { defeated };
  const secs = (id: number) => Math.floor((world.players.get(id)?.hillTicks ?? 0) / TICK_RATE);
  const leaders = [...world.players.values()].filter((p) => p.hillTicks > 0).sort((a, b) => b.hillTicks - a.hillTicks);
  return {
    defeated,
    hill: {
      x: h.x,
      y: h.y,
      r: HILL_RADIUS,
      holder: h.holder,
      contested: h.contested ? 1 : 0,
      need: HILL_HOLD_SECONDS,
      held: leaders.slice(0, 4).map((p) => [p.id, secs(p.id)] as [number, number]),
    },
  };
}
