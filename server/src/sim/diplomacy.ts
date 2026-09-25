// Diplomacia: la decide SIEMPRE el servidor. Cada par de jugadores está en
// guerra, en paz o aliado. Las alianzas y la paz necesitan que ambos acepten;
// la guerra se declara con aviso (WAR_DELAY_SEC) para que nadie sea atacado
// por sorpresa. Todo cambio importante se anuncia a toda la clase.

import { PROPOSAL_SEC, TICK_RATE, WAR_DELAY_SEC, type DiploAction, type Relation } from '../../../shared/data.ts';
import type { DiploView } from '../../../shared/protocol.ts';
import type { World } from './world.ts';

export interface Proposal {
  from: number;
  to: number;
  kind: 'alliance' | 'peace';
  expires: number; // tick
}

export interface PendingWar {
  from: number;
  to: number;
  at: number; // tick en que empieza
}

/** ¿Pueden atacarse? Solo si están en guerra. */
export function isEnemy(world: World, a: number, b: number): boolean {
  return a !== b && world.relation(a, b) === 'war';
}

export function isAlly(world: World, a: number, b: number): boolean {
  return a === b || world.relation(a, b) === 'ally';
}

/**
 * Relaciones al empezar: los del mismo equipo son aliados; el resto, en guerra.
 * `locked` = equipos fijos (nadie puede cambiar la diplomacia).
 */
export function initRelations(world: World, teamOf: (playerId: number) => number, locked: boolean): void {
  const ids = [...world.players.keys()];
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      const ta = teamOf(a), tb = teamOf(b);
      world.setRelation(a, b, ta > 0 && ta === tb ? 'ally' : 'war');
    }
  world.diploLocked = locked;
  world.diploVersion++;
}

/** Acción diplomática de `from` hacia `target`. Valida todo; si no corresponde, avisa y no hace nada. */
export function diplo(world: World, from: number, action: DiploAction, target: number): void {
  const me = world.players.get(from), other = world.players.get(target);
  if (!me || !other || from === target) return;
  if (world.diploLocked) {
    world.notify(from, 'En esta partida los equipos son fijos: no se puede cambiar la diplomacia');
    return;
  }
  const rel = world.relation(from, target);
  const find = (kind: Proposal['kind'], a: number, b: number) =>
    world.proposals.find((p) => p.kind === kind && p.from === a && p.to === b);
  const remove = (p: Proposal | undefined) => {
    if (!p) return;
    world.proposals = world.proposals.filter((q) => q !== p);
    world.diploVersion++;
  };
  const propose = (kind: Proposal['kind'], text: string) => {
    if (find(kind, from, target)) return; // ya la propuso
    const reverse = find(kind, target, from);
    if (reverse) return accept(kind); // el otro ya lo había propuesto: se acepta
    world.proposals.push({ from, to: target, kind, expires: world.tick + PROPOSAL_SEC * TICK_RATE });
    world.diploVersion++;
    world.notify(target, `${me.name} ${text}`);
    world.notify(from, `Propuesta enviada a ${other.name}`);
  };
  const accept = (kind: Proposal['kind']) => {
    const p = find(kind, target, from);
    if (!p) return world.notify(from, 'Esa propuesta ya no existe');
    remove(p);
    cancelWars(world, from, target);
    if (kind === 'alliance') {
      world.setRelation(from, target, 'ally');
      world.announce(`📜 ${me.name} y ${other.name} ahora son aliados`);
    } else {
      world.setRelation(from, target, 'peace');
      world.announce(`🕊 ${me.name} y ${other.name} firmaron la paz`);
    }
  };

  switch (action) {
    case 'proposeAlliance':
      if (rel !== 'ally') propose('alliance', 'te propone una alianza');
      return;
    case 'acceptAlliance':
      return accept('alliance');
    case 'rejectAlliance': {
      const p = find('alliance', target, from);
      if (p) {
        remove(p);
        world.notify(target, `${me.name} rechazó tu propuesta de alianza`);
      }
      return;
    }
    case 'breakAlliance':
      if (rel !== 'ally') return;
      world.setRelation(from, target, 'peace');
      world.announce(`💔 ${me.name} rompió su alianza con ${other.name}`);
      return;
    case 'declareWar': {
      if (rel === 'war' || world.pendingWars.some((w) => pair(w.from, w.to) === pair(from, target))) return;
      if (rel === 'ally') world.setRelation(from, target, 'peace'); // primero se rompe la alianza
      for (const p of world.proposals.filter((q) => pair(q.from, q.to) === pair(from, target))) remove(p);
      world.pendingWars.push({ from, to: target, at: world.tick + WAR_DELAY_SEC * TICK_RATE });
      world.diploVersion++;
      world.announce(`⚔ ${me.name} declaró la guerra a ${other.name}: empieza en ${WAR_DELAY_SEC} segundos`);
      return;
    }
    case 'proposePeace':
      if (rel === 'war') propose('peace', 'te propone la paz');
      return;
    case 'acceptPeace':
      return accept('peace');
    case 'rejectPeace': {
      const p = find('peace', target, from);
      if (p) {
        remove(p);
        world.notify(target, `${me.name} rechazó tu propuesta de paz`);
      }
      return;
    }
  }
}

/** Cada paso: vencen las propuestas viejas y empiezan las guerras declaradas. */
export function updateDiplomacy(world: World): void {
  if (world.proposals.length > 0) {
    const expired = world.proposals.filter((p) => world.tick >= p.expires);
    if (expired.length > 0) {
      world.proposals = world.proposals.filter((p) => world.tick < p.expires);
      world.diploVersion++;
      for (const p of expired) {
        const other = world.players.get(p.to);
        world.notify(p.from, `${other?.name ?? 'El otro jugador'} no respondió tu propuesta`);
      }
    }
  }
  if (world.pendingWars.length > 0) {
    const starting = world.pendingWars.filter((w) => world.tick >= w.at);
    if (starting.length > 0) {
      world.pendingWars = world.pendingWars.filter((w) => world.tick < w.at);
      for (const w of starting) {
        world.setRelation(w.from, w.to, 'war');
        const a = world.players.get(w.from)?.name, b = world.players.get(w.to)?.name;
        world.announce(`⚔ Comenzó la guerra entre ${a} y ${b}`);
      }
    }
  }
}

function cancelWars(world: World, a: number, b: number): void {
  const before = world.pendingWars.length;
  world.pendingWars = world.pendingWars.filter((w) => pair(w.from, w.to) !== pair(a, b));
  if (world.pendingWars.length !== before) world.diploVersion++;
}

function pair(a: number, b: number): number {
  return Math.min(a, b) * 1000 + Math.max(a, b);
}

const REL_CODE: Record<Relation, number> = { war: 0, peace: 1, ally: 2 };

/**
 * Lo que ve un jugador: todas las relaciones (son públicas), las propuestas en
 * las que participa y las guerras por empezar. El profesor (0) ve todas las propuestas.
 */
export function diploView(world: World, playerId: number): DiploView {
  const ids = [...world.players.keys()].sort((x, y) => x - y);
  const r: number[] = [];
  for (const a of ids) for (const b of ids) if (a < b) r.push(a, b, REL_CODE[world.relation(a, b)]);
  const secs = (tick: number) => Math.max(0, Math.ceil((tick - world.tick) / TICK_RATE));
  const p: number[] = [];
  for (const q of world.proposals)
    if (playerId === 0 || q.from === playerId || q.to === playerId) p.push(q.from, q.to, q.kind === 'alliance' ? 0 : 1, secs(q.expires));
  const w: number[] = [];
  for (const q of world.pendingWars) w.push(q.from, q.to, secs(q.at));
  return { r, p, w, locked: world.diploLocked };
}
