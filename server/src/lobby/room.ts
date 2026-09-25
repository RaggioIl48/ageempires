// Una sala: la crea el profesor, los estudiantes entran con su código, eligen
// facción y color, y el profesor inicia la partida. Cada estudiante tiene un
// "token" secreto: si se le cae la conexión, vuelve a su mismo puesto.

import { randomBytes } from 'node:crypto';
import { FACTION_ORDER, PLAYER_COLORS, TICK_RATE, type FactionId } from '../../../shared/data.ts';
import type {
  Command,
  MemberView,
  PlayerSummary,
  RoomPhase,
  RoomSettings,
  RoomSummary,
  RoomView,
  ServerMessage,
} from '../../../shared/protocol.ts';
import { buildFrame, ClientSync, welcomeMessage } from '../net/sync.ts';
import { initRelations } from '../sim/diplomacy.ts';
import { Game } from '../sim/game.ts';
import type { Conn } from './conn.ts';

export interface Member {
  /** En la sala: número de llegada. Al iniciar la partida pasa a ser el id de jugador. */
  id: number;
  name: string;
  token: string;
  color: string;
  faction: FactionId;
  conn: Conn | null;
  kicked: boolean;
  /** Equipo asignado por el profesor (0 = sin equipo). */
  team: number;
  /** Último mensaje de chat (para limitar el ritmo). */
  lastChat: number;
}

/** Segundos mínimos entre dos mensajes de chat de un mismo estudiante. */
const CHAT_COOLDOWN_MS = 1500;

export class Room {
  phase: RoomPhase = 'lobby';
  paused = false;
  members: Member[] = [];
  game: Game | null = null;
  /** Profesores mirando la partida. */
  readonly watchers = new Set<Conn>();
  private syncs = new Map<Conn, ClientSync>();
  private nextMemberId = 1;
  private ended: { reason: string; summary: PlayerSummary[] } | null = null;

  constructor(
    readonly code: string,
    public settings: RoomSettings,
    private readonly seed: number,
    /** Avisa al lobby que algo cambió (para refrescar el panel del profesor). */
    private readonly onChange: (room: Room) => void,
  ) {}

  // ---------- Estudiantes ----------

  /** Entrar (o volver) a la sala. Devuelve un mensaje de error o null. */
  join(conn: Conn, name: string, token?: string): string | null {
    const known = token ? this.members.find((m) => m.token === token) : undefined;
    if (known?.kicked) return 'El profesor te sacó de esta partida.';
    if (known) {
      // Vuelve a su puesto. Si tenía otra pestaña abierta, esa se cierra.
      const old = known.conn;
      if (old && old !== conn) {
        old.send({ t: 'error', message: 'Abriste el juego en otra ventana.' });
        this.detach(old);
        old.close();
      }
      this.attach(conn, known);
      return null;
    }
    if (this.phase !== 'lobby') return 'La partida ya empezó. Pide ayuda al profesor.';
    if (this.members.length >= this.settings.maxPlayers) return 'La partida está llena.';
    const member: Member = {
      id: this.nextMemberId++,
      name: this.uniqueName(name),
      token: randomBytes(16).toString('hex'),
      color: PLAYER_COLORS.find((c) => !this.members.some((m) => m.color === c)) ?? PLAYER_COLORS[0],
      faction: FACTION_ORDER[this.members.length % FACTION_ORDER.length],
      conn: null,
      kicked: false,
      team: 0,
      lastChat: 0,
    };
    this.members.push(member);
    this.attach(conn, member);
    return null;
  }

  private uniqueName(name: string): string {
    let candidate = name;
    for (let i = 2; this.members.some((m) => m.name.toLowerCase() === candidate.toLowerCase()); i++) candidate = `${name} ${i}`;
    return candidate;
  }

  private attach(conn: Conn, member: Member): void {
    member.conn = conn;
    conn.role = 'student';
    conn.room = this;
    conn.send({ t: 'joined', code: this.code, token: member.token, memberId: member.id, host: conn.isLocal });
    if (this.game) {
      const p = this.game.world.players.get(member.id);
      if (p) p.connected = true;
      this.startSync(conn, member.id);
      this.broadcastPlayers();
    }
    if (this.ended) conn.send({ t: 'ended', ...this.ended });
    this.changed();
  }

  /** La conexión se cortó o salió: el puesto queda guardado (se puede volver con el token). */
  detach(conn: Conn): void {
    this.syncs.delete(conn);
    this.watchers.delete(conn);
    const member = this.memberOf(conn);
    if (member) {
      member.conn = null;
      const p = this.game?.world.players.get(member.id);
      if (p) {
        p.connected = false;
        this.broadcastPlayers();
      }
    }
    conn.room = null;
    this.changed();
  }

  /** Salir a propósito: en la sala de espera se libera el lugar; en partida se conserva. */
  leave(conn: Conn): void {
    const member = this.memberOf(conn);
    this.detach(conn);
    if (member && this.phase === 'lobby') {
      this.members = this.members.filter((m) => m !== member);
      this.changed();
    }
  }

  memberOf(conn: Conn): Member | undefined {
    return this.members.find((m) => m.conn === conn);
  }

  choose(conn: Conn, faction?: FactionId, color?: string): string | null {
    const member = this.memberOf(conn);
    if (!member) return null;
    if (this.phase !== 'lobby') return 'La partida ya empezó.';
    if (color && this.members.some((m) => m !== member && m.color === color)) return 'Ese color ya lo eligió otro jugador.';
    if (faction) member.faction = faction;
    if (color) member.color = color;
    this.changed();
    return null;
  }

  command(conn: Conn, cmd: Command): void {
    const member = this.memberOf(conn);
    if (!member || member.kicked || !this.game || this.phase !== 'playing' || this.paused) return;
    this.game.enqueue(member.id, cmd);
  }

  // ---------- Profesor ----------

  setSettings(settings: RoomSettings): string | null {
    if (this.phase !== 'lobby') return 'La partida ya empezó.';
    if (settings.maxPlayers < this.members.length) return `Ya hay ${this.members.length} jugadores en la sala.`;
    this.settings = settings;
    this.changed();
    return null;
  }

  /** El profesor arma los equipos en la sala de espera. */
  setTeam(memberId: number, team: number): string | null {
    if (this.phase !== 'lobby') return 'Los equipos se arman antes de empezar.';
    const member = this.members.find((m) => m.id === memberId);
    if (!member) return null;
    member.team = team;
    this.changed();
    return null;
  }

  /**
   * Chat: a todos o solo a los aliados (en la sala de espera, al propio equipo).
   * El profesor que mira recibe todos los mensajes.
   */
  chat(conn: Conn, text: string, to: 'all' | 'allies'): string | null {
    const member = this.memberOf(conn);
    if (!member || member.kicked) return null;
    if (!this.settings.chat) return 'El profesor desactivó el chat en esta partida.';
    const now = Date.now();
    if (now - member.lastChat < CHAT_COOLDOWN_MS) return 'Espera un momento antes de enviar otro mensaje.';
    member.lastChat = now;
    const world = this.game?.world;
    const friend = (m: Member) =>
      m === member || (world ? world.relation(member.id, m.id) === 'ally' : member.team > 0 && m.team === member.team);
    const msg: ServerMessage = { t: 'chat', from: member.id, name: member.name, color: member.color, text, to };
    for (const m of this.members) if (m.conn && !m.kicked && (to === 'all' || friend(m))) m.conn.send(msg);
    for (const w of this.watchers) w.send(msg);
    return null;
  }

  kick(memberId: number): void {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) return;
    member.kicked = true;
    if (member.conn) {
      const conn = member.conn;
      conn.send({ t: 'kicked', message: 'El profesor te sacó de la partida.' });
      this.detach(conn);
      conn.close();
    }
    // En la sala de espera el lugar se libera; en partida sus unidades quedan quietas.
    if (this.phase === 'lobby') this.members = this.members.filter((m) => m !== member);
    this.changed();
  }

  start(): string | null {
    if (this.phase !== 'lobby') return 'La partida ya empezó.';
    const players = this.members.filter((m) => !m.kicked);
    if (players.length === 0) return 'No hay jugadores en la sala.';
    // Los jugadores quedan numerados 1..n en orden de llegada.
    players.forEach((m, i) => (m.id = i + 1));
    this.members = players;
    this.game = new Game({
      slots: players.length,
      seed: this.seed,
      mapSize: this.settings.mapSize,
      players: players.map((m) => ({ name: m.name, color: m.color, faction: m.faction })),
    });
    // Los del mismo equipo empiezan aliados; el resto, en guerra.
    initRelations(this.game.world, (id) => players.find((m) => m.id === id)?.team ?? 0, this.settings.diplomacy === 'locked');
    for (const m of players) {
      const p = this.game.world.players.get(m.id)!;
      p.connected = m.conn !== null;
      if (m.conn) this.startSync(m.conn, m.id);
    }
    for (const w of this.watchers) this.startSync(w, 0);
    this.phase = 'playing';
    this.changed();
    return null;
  }

  setPaused(paused: boolean): void {
    if (this.phase !== 'playing' || this.paused === paused) return;
    this.paused = paused;
    this.broadcast({ t: 'paused', paused });
    this.changed();
  }

  end(reason: string): void {
    if (this.phase !== 'playing' || !this.game) return;
    this.phase = 'ended';
    this.paused = false;
    this.ended = { reason, summary: this.game.summary() };
    this.broadcast({ t: 'ended', ...this.ended });
    this.changed();
  }

  /** Cerrar la sala: todos vuelven a la pantalla de inicio. */
  close(): void {
    for (const m of this.members)
      if (m.conn) {
        m.conn.send({ t: 'kicked', message: 'El profesor cerró la partida.' });
        m.conn.room = null;
        m.conn.role = 'none';
      }
    for (const w of this.watchers) w.room = null;
    this.members = [];
    this.syncs.clear();
    this.watchers.clear();
  }

  /** El profesor mira la partida (ve todo el mapa y la economía de todos). */
  watch(conn: Conn): void {
    conn.room = this;
    this.watchers.add(conn);
    if (this.game) this.startSync(conn, 0);
    conn.send({ t: 'room', room: this.view() });
    if (this.ended) conn.send({ t: 'ended', ...this.ended });
  }

  unwatch(conn: Conn): void {
    this.watchers.delete(conn);
    this.syncs.delete(conn);
    if (conn.room === this) conn.room = null;
  }

  // ---------- Paso de simulación ----------

  tick(): void {
    if (this.phase !== 'playing' || this.paused || !this.game) return;
    const game = this.game;
    game.step();
    const limit = this.settings.durationMin * 60;
    const frame = buildFrame(game, limit);
    for (const [conn, sync] of this.syncs) {
      sync.collect(frame);
      if (!conn.congested()) conn.send(sync.build(frame, game));
    }
    if (limit > 0 && game.world.tick >= limit * TICK_RATE) this.end('¡Se acabó el tiempo!');
  }

  /** Empieza a mandar la partida a una conexión: bienvenida + foto completa. */
  private startSync(conn: Conn, playerId: number): void {
    const game = this.game!;
    const sync = new ClientSync(playerId);
    this.syncs.set(conn, sync);
    conn.send(welcomeMessage(game, playerId, this.settings));
    conn.send(sync.build(buildFrame(game, this.settings.durationMin * 60, true), game));
    if (this.paused) conn.send({ t: 'paused', paused: true });
  }

  // ---------- Vistas y avisos ----------

  view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      settings: this.settings,
      members: this.members.filter((m) => !m.kicked).map(
        (m): MemberView => ({ id: m.id, name: m.name, color: m.color, faction: m.faction, connected: m.conn !== null, team: m.team }),
      ),
    };
  }

  summary(): RoomSummary {
    const active = this.members.filter((m) => !m.kicked);
    return {
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      players: active.length,
      connected: active.filter((m) => m.conn).length,
      settings: this.settings,
    };
  }

  /** Mensaje a todos los que están en la sala (jugadores y profesores mirando). */
  broadcast(msg: ServerMessage): void {
    for (const m of this.members) m.conn?.send(msg);
    for (const w of this.watchers) w.send(msg);
  }

  private broadcastPlayers(): void {
    if (this.game) this.broadcast({ t: 'players', players: this.game.playerViews() });
  }

  private changed(): void {
    const msg: ServerMessage = { t: 'room', room: this.view() };
    for (const m of this.members) m.conn?.send(msg);
    this.onChange(this);
  }
}
