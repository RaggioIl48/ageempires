// Sincronización eficiente: a cada cliente se le manda SOLO lo que cambió
// desde lo último que se le mandó a él. El primer mensaje trae todo.
//
// Se compara contra lo enviado a cada cliente (no contra el paso anterior),
// así que si a un cliente lento se le salta un mensaje, el siguiente incluye
// todo lo que se perdió: nunca queda desincronizado.

import {
  encodeBuilding,
  encodeEvent,
  encodeUnit,
  NODE_TYPES,
  sameExceptPosition,
  sameTuple,
  U_X,
  U_Y,
  type BuildingTuple,
  type EventTuple,
  type UnitTuple,
} from '../../../shared/codec.ts';
import { TICK_RATE } from '../../../shared/data.ts';
import { encodeTiles, type DeltaMessage, type EconomyView, type RoomSettings, type ServerMessage } from '../../../shared/protocol.ts';
import { diploView } from '../sim/diplomacy.ts';
import { buildingView, type Game } from '../sim/game.ts';

/** Primer mensaje al entrar a la partida: mapa comprimido, jugadores y recursos. */
export function welcomeMessage(game: Game, you: number, settings: RoomSettings): ServerMessage {
  const w = game.world;
  const nodes: number[] = [];
  for (const n of w.nodes.values()) nodes.push(n.id, NODE_TYPES.indexOf(n.type), n.tx, n.ty, n.amount);
  return {
    t: 'welcome',
    you,
    map: { size: w.size, tilesRle: encodeTiles(w.tiles) },
    players: game.playerViews(),
    nodes,
    settings,
  };
}

/** Todo lo que se calcula UNA vez por paso y comparten los clientes. */
export interface Frame {
  tick: number;
  units: UnitTuple[];
  /** Por edificio: versión pública y versión para el dueño (con cola y reunión). */
  buildings: { owner: number; pub: BuildingTuple; own: BuildingTuple }[];
  nodesChanged: [number, number][];
  nodesRemoved: number[];
  events: EventTuple[];
  clock: [number, number];
}

/**
 * `snapshot` = foto para alguien que recién entra: no consume los cambios de
 * recursos pendientes (son de los demás clientes) ni repite los efectos.
 */
export function buildFrame(game: Game, limitSec: number, snapshot = false): Frame {
  const w = game.world;
  const { changed, removed } = snapshot ? { changed: [], removed: [] } : game.takeNodeChanges();
  return {
    tick: w.tick,
    units: game.unitViews().map(encodeUnit),
    buildings: [...w.buildings.values()].map((b) => {
      const pub = encodeBuilding(buildingView(b, false));
      const hasPrivate = b.queue.length > 0 || b.rally !== null || b.needsHouses;
      return { owner: b.owner, pub, own: hasPrivate ? encodeBuilding(buildingView(b, true)) : pub };
    }),
    nodesChanged: changed.map((n) => [n.id, n.amount] as [number, number]),
    nodesRemoved: removed,
    events: snapshot ? [] : w.events.map(encodeEvent),
    clock: [Math.floor(w.tick / TICK_RATE), limitSec],
  };
}

export class ClientSync {
  private units = new Map<number, UnitTuple>();
  private buildings = new Map<number, BuildingTuple>();
  /** Cambios de recursos del mapa aún no enviados (-1 = desapareció). */
  private pendingNodes = new Map<number, number>();
  private lastEco = '';
  private lastClock = '';
  private lastEcoAllTick = -Infinity;
  private lastDiplo = -1;
  private lastNews = -1;

  /** playerId 0 = observador (el profesor): ve todo y la economía de todos. */
  constructor(readonly playerId: number) {}

  /**
   * Los cambios de recursos del mapa llegan una vez por paso para todos; cada
   * cliente los acumula hasta que se le puede enviar un mensaje.
   */
  collect(frame: Frame): void {
    for (const [id, amount] of frame.nodesChanged) this.pendingNodes.set(id, amount);
    for (const id of frame.nodesRemoved) this.pendingNodes.set(id, -1);
  }

  /** Mensaje con los cambios para este cliente (llamar después de collect). */
  build(frame: Frame, game: Game): DeltaMessage {
    const msg: DeltaMessage = { t: 'd', k: frame.tick };

    // Unidades: nuevas o con cambios → tupla completa; solo movidas → [id, x, y].
    const seen = new Set<number>();
    const u: UnitTuple[] = [];
    const p: number[] = [];
    for (const t of frame.units) {
      seen.add(t[0]);
      const old = this.units.get(t[0]);
      if (!old || !sameExceptPosition(old, t)) u.push(t);
      else if (old[U_X] !== t[U_X] || old[U_Y] !== t[U_Y]) p.push(t[0], t[U_X], t[U_Y]);
      this.units.set(t[0], t);
    }
    const ur: number[] = [];
    for (const id of this.units.keys())
      if (!seen.has(id)) {
        ur.push(id);
        this.units.delete(id);
      }
    if (u.length) msg.u = u;
    if (p.length) msg.p = p;
    if (ur.length) msg.ur = ur;

    // Edificios: cada uno ve la versión privada solo de los suyos.
    const bSeen = new Set<number>();
    const b: BuildingTuple[] = [];
    for (const entry of frame.buildings) {
      const t = entry.owner === this.playerId ? entry.own : entry.pub;
      bSeen.add(t[0]);
      if (!sameTuple(this.buildings.get(t[0]), t)) {
        b.push(t);
        this.buildings.set(t[0], t);
      }
    }
    const br: number[] = [];
    for (const id of this.buildings.keys())
      if (!bSeen.has(id)) {
        br.push(id);
        this.buildings.delete(id);
      }
    if (b.length) msg.b = b;
    if (br.length) msg.br = br;

    // Recursos del mapa acumulados.
    if (this.pendingNodes.size > 0) {
      const n: number[] = [];
      const nr: number[] = [];
      for (const [id, amount] of this.pendingNodes) {
        if (amount < 0) nr.push(id);
        else n.push(id, amount);
      }
      this.pendingNodes.clear();
      if (n.length) msg.n = n;
      if (nr.length) msg.nr = nr;
    }

    if (frame.events.length) msg.e = frame.events;

    // Economía propia solo cuando cambia; el profesor recibe la de todos cada segundo.
    if (this.playerId > 0) {
      const eco = game.economyOf(this.playerId);
      const key = JSON.stringify(eco);
      if (key !== this.lastEco) {
        this.lastEco = key;
        msg.eco = eco;
      }
      const notices = game.takeNotices(this.playerId);
      if (notices.length) msg.no = notices;
    } else if (frame.tick - this.lastEcoAllTick >= TICK_RATE) {
      this.lastEcoAllTick = frame.tick;
      const all: Record<number, EconomyView> = {};
      for (const id of game.world.players.keys()) all[id] = game.economyOf(id);
      msg.ecoAll = all;
    }

    // Diplomacia: cuando cambia, o cada segundo si hay plazos corriendo (propuestas, guerras por empezar).
    const w = game.world;
    const timers = w.proposals.length > 0 || w.pendingWars.length > 0;
    if (w.diploVersion !== this.lastDiplo || (timers && frame.tick % TICK_RATE === 0)) {
      this.lastDiplo = w.diploVersion;
      msg.dip = diploView(w, this.playerId);
    }
    // El profesor recibe las noticias diplomáticas como avisos.
    if (this.playerId === 0) {
      if (this.lastNews < 0) this.lastNews = w.newsCount; // al empezar a mirar, solo lo nuevo
      else if (w.newsCount > this.lastNews) {
        const fresh = w.news.slice(-Math.min(w.news.length, w.newsCount - this.lastNews));
        this.lastNews = w.newsCount;
        msg.no = fresh;
      }
    }

    const clock = frame.clock.join(',');
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      msg.clk = frame.clock;
    }
    return msg;
  }
}
