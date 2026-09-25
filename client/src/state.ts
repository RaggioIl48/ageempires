// Copia local de lo que el servidor nos cuenta. El cliente nunca la modifica
// por su cuenta: solo la actualiza con mensajes del servidor.
// (Código sin navegador: también lo usan las pruebas del servidor.)

import { decodeBuilding, decodeEvent, decodeUnit, NODE_TYPES } from '../../shared/codec.ts';
import { BUILDING_DEFS, RELATIONS, TICK_MS, TILE_GRASS, type BuildingType, type FactionId, type Relation, type UnitType } from '../../shared/data.ts';
import {
  decodeTiles,
  type BuildingView,
  type DeltaMessage,
  type EconomyView,
  type GameEvent,
  type NodeView,
  type PlayerView,
  type RoomSettings,
  type ServerMessage,
  type UnitView,
} from '../../shared/protocol.ts';
import { buildingMaxHp, unitStats, type UnitStats } from '../../shared/stats.ts';

export interface ClientUnit {
  v: UnitView;
  prevX: number;
  prevY: number;
}

/** Propuesta diplomática pendiente. */
export interface ProposalView {
  from: number;
  to: number;
  kind: 'alliance' | 'peace';
  secondsLeft: number;
}

/** Mensaje de chat recibido. */
export interface ChatLine {
  from: number;
  name: string;
  color: string;
  text: string;
  to: 'all' | 'allies';
  at: number;
}

/** Un efecto visual (flecha, golpe, muerte) con su momento de inicio. */
export interface Effect {
  e: GameEvent;
  t0: number;
}

export class ClientState {
  /** Id del jugador propio; 0 = observador (profesor). */
  you = 0;
  size = 0;
  tiles: Uint8Array = new Uint8Array(0);
  settings: RoomSettings | null = null;
  players = new Map<number, PlayerView>();
  nodes = new Map<number, NodeView>();
  /** Índice casilla → id de nodo (para saber qué hay en cada casilla). */
  nodeIndex = new Map<number, number>();
  buildings = new Map<number, BuildingView>();
  units = new Map<number, ClientUnit>();
  economy: EconomyView | null = null;
  /** Solo el profesor: economía de cada jugador. */
  economies = new Map<number, EconomyView>();
  /** Reloj: segundos de partida y límite (0 = sin límite). */
  clock: [number, number] = [0, 0];
  tick = 0;
  lastStateAt = 0;
  /** Sube cada vez que cambian los nodos o edificios (para redibujar el minimapa). */
  nodesVersion = 0;
  effects: Effect[] = [];
  /** Avisos recibidos que la interfaz todavía no mostró. */
  notices: string[] = [];
  // Diplomacia (la decide el servidor; aquí solo se muestra).
  private rel = new Map<number, Relation>();
  proposals: ProposalView[] = [];
  pendingWars: { from: number; to: number; secondsLeft: number }[] = [];
  diploLocked = false;
  /** Sube cuando cambia la diplomacia (para redibujar el panel). */
  diploVersion = 0;
  chat: ChatLine[] = [];
  /** Era y tecnologías (máscara) de cada jugador. */
  eras = new Map<number, number>();
  techs = new Map<number, number>();
  /** Sube cuando alguien cambia de era o investiga algo. */
  techVersion = 0;

  /** Relación entre dos jugadores (uno mismo cuenta como aliado). */
  relation(a: number, b: number): Relation {
    if (a === b) return 'ally';
    return this.rel.get(Math.min(a, b) * 1000 + Math.max(a, b)) ?? 'war';
  }

  /** Relación de un jugador con el propio (para colores y órdenes). */
  relationTo(playerId: number): Relation | 'own' {
    if (playerId === this.you) return 'own';
    return this.relation(this.you, playerId);
  }

  get spectator(): boolean {
    return this.you === 0;
  }

  apply(msg: ServerMessage, now: number): void {
    switch (msg.t) {
      case 'welcome': {
        this.you = msg.you;
        this.size = msg.map.size;
        this.tiles = decodeTiles(msg.map.tilesRle, msg.map.size);
        this.settings = msg.settings;
        this.players = new Map(msg.players.map((p) => [p.id, p]));
        this.nodes.clear();
        this.nodeIndex.clear();
        const n = msg.nodes;
        for (let i = 0; i + 4 < n.length; i += 5) {
          const node: NodeView = { id: n[i], type: NODE_TYPES[n[i + 1]], tx: n[i + 2], ty: n[i + 3], amount: n[i + 4] };
          this.nodes.set(node.id, node);
          this.nodeIndex.set(node.ty * this.size + node.tx, node.id);
        }
        this.buildings.clear();
        this.units.clear();
        this.economy = null;
        this.economies.clear();
        this.effects = [];
        this.rel.clear();
        this.proposals = [];
        this.pendingWars = [];
        this.chat = [];
        this.eras.clear();
        this.techs.clear();
        this.nodesVersion++;
        break;
      }
      case 'players':
        this.players = new Map(msg.players.map((p) => [p.id, p]));
        break;
      case 'chat':
        this.chat.push({ from: msg.from, name: msg.name, color: msg.color, text: msg.text, to: msg.to, at: now });
        if (this.chat.length > 50) this.chat.shift();
        break;
      case 'd':
        this.applyDelta(msg, now);
        break;
      default:
        break;
    }
  }

  private applyDelta(d: DeltaMessage, now: number): void {
    // Punto de partida de la interpolación: donde se dibuja cada unidad ahora.
    for (const cu of this.units.values()) {
      const p = this.unitPos(cu, now);
      cu.prevX = p.x;
      cu.prevY = p.y;
    }
    for (const t of d.u ?? []) {
      const v = decodeUnit(t);
      const old = this.units.get(v.id);
      if (old) old.v = v;
      else this.units.set(v.id, { v, prevX: v.x, prevY: v.y });
    }
    const p = d.p ?? [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      const cu = this.units.get(p[i]);
      if (cu) cu.v = { ...cu.v, x: p[i + 1] / 100, y: p[i + 2] / 100 };
    }
    for (const id of d.ur ?? []) this.units.delete(id);

    let structural = false;
    for (const t of d.b ?? []) {
      const v = decodeBuilding(t);
      if (!this.buildings.has(v.id)) structural = true;
      this.buildings.set(v.id, v);
    }
    for (const id of d.br ?? []) structural = this.buildings.delete(id) || structural;

    const n = d.n ?? [];
    for (let i = 0; i + 1 < n.length; i += 2) {
      const node = this.nodes.get(n[i]);
      if (node) node.amount = n[i + 1];
    }
    for (const id of d.nr ?? []) {
      const node = this.nodes.get(id);
      if (node) this.nodeIndex.delete(node.ty * this.size + node.tx);
      structural = this.nodes.delete(id) || structural;
    }
    if (structural) this.nodesVersion++;

    for (const e of d.e ?? []) this.effects.push({ e: decodeEvent(e), t0: now });
    if (d.eco) this.economy = d.eco;
    if (d.ecoAll) this.economies = new Map(Object.entries(d.ecoAll).map(([id, e]) => [Number(id), e]));
    if (d.no) this.notices.push(...d.no);
    if (d.clk) this.clock = d.clk;
    if (d.dip) {
      this.rel.clear();
      for (let i = 0; i + 2 < d.dip.r.length; i += 3)
        this.rel.set(Math.min(d.dip.r[i], d.dip.r[i + 1]) * 1000 + Math.max(d.dip.r[i], d.dip.r[i + 1]), RELATIONS[d.dip.r[i + 2]]);
      this.proposals = [];
      for (let i = 0; i + 3 < d.dip.p.length; i += 4)
        this.proposals.push({ from: d.dip.p[i], to: d.dip.p[i + 1], kind: d.dip.p[i + 2] === 0 ? 'alliance' : 'peace', secondsLeft: d.dip.p[i + 3] });
      this.pendingWars = [];
      for (let i = 0; i + 2 < d.dip.w.length; i += 3)
        this.pendingWars.push({ from: d.dip.w[i], to: d.dip.w[i + 1], secondsLeft: d.dip.w[i + 2] });
      this.diploLocked = d.dip.locked;
      this.diploVersion++;
    }
    if (d.pt) {
      for (let i = 0; i + 2 < d.pt.length; i += 3) {
        this.eras.set(d.pt[i], d.pt[i + 1]);
        this.techs.set(d.pt[i], d.pt[i + 2]);
      }
      this.techVersion++;
    }
    this.tick = d.k;
    this.lastStateAt = now;
  }

  /** Posición dibujada: interpola entre el estado anterior y el último. */
  unitPos(u: ClientUnit, now: number): { x: number; y: number } {
    const t = Math.min(1, Math.max(0, (now - this.lastStateAt) / TICK_MS));
    return { x: u.prevX + (u.v.x - u.prevX) * t, y: u.prevY + (u.v.y - u.prevY) * t };
  }

  color(playerId: number): string {
    return this.players.get(playerId)?.color ?? '#888';
  }

  faction(playerId: number): FactionId {
    return this.players.get(playerId)?.faction ?? 'legion';
  }

  eraOf(playerId: number): number {
    return this.eras.get(playerId) ?? 1;
  }

  techsOf(playerId: number): number {
    return this.techs.get(playerId) ?? 0;
  }

  /** Estadísticas reales de una unidad (facción y tecnologías de su dueño). */
  statsOf(owner: number, type: UnitType): UnitStats {
    return unitStats(this.faction(owner), type, this.techsOf(owner));
  }

  maxHpOf(b: BuildingView): number {
    return buildingMaxHp(this.faction(b.owner), b.type, this.techsOf(b.owner));
  }

  tile(x: number, y: number): number {
    return this.tiles[y * this.size + x];
  }

  nodeAt(x: number, y: number): NodeView | undefined {
    const id = this.nodeIndex.get(y * this.size + x);
    return id === undefined ? undefined : this.nodes.get(id);
  }

  buildingAt(x: number, y: number): BuildingView | undefined {
    for (const b of this.buildings.values()) {
      const s = BUILDING_DEFS[b.type].size;
      if (x >= b.tx && y >= b.ty && x < b.tx + s && y < b.ty + s) return b;
    }
    return undefined;
  }

  /**
   * ¿Se puede colocar ahí? (previsualización; el servidor decide de verdad).
   * Mismas reglas que el servidor: dentro del mapa, sobre pasto, sin nada encima.
   */
  canPlace(type: BuildingType, tx: number, ty: number): boolean {
    const s = BUILDING_DEFS[type].size;
    for (let y = ty; y < ty + s; y++)
      for (let x = tx; x < tx + s; x++) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
        if (this.tile(x, y) !== TILE_GRASS || this.nodeAt(x, y) || this.buildingAt(x, y)) return false;
      }
    return true;
  }
}

