// Una sala: la crea el profesor, los estudiantes entran con su código, eligen
// facción y color, y el profesor inicia la partida. Cada estudiante tiene un
// "token" secreto: si se le cae la conexión, vuelve a su mismo puesto.

import { randomBytes } from 'node:crypto';
import { FACTION_ORDER, PLAYER_COLORS, TECH_DEFS, TICK_RATE, type FactionId } from '../../../shared/data.ts';
import { QUIZ_BANK, type QuizQuestion } from '../../../shared/lessons.ts';
import type {
  BotLevel,
  ChronicleEntry,
  HistorySample,
  Command,
  MemberView,
  PlayerSummary,
  RoomPhase,
  RoomSettings,
  RoomSummary,
  RoomView,
  ServerMessage,
  QuizMode,
} from '../../../shared/protocol.ts';
import { buildFrame, ClientSync, welcomeMessage } from '../net/sync.ts';
import { initRelations } from '../sim/diplomacy.ts';
import { AiPlayer } from '../sim/ai.ts';
import { snapshot } from '../sim/history.ts';
import { Game } from '../sim/game.ts';
import { decideByGlory } from '../sim/victory.ts';
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
  /** Rival de la computadora (su nivel). */
  bot?: BotLevel;
}

/** Segundos mínimos entre dos mensajes de chat de un mismo estudiante. */
const CHAT_COOLDOWN_MS = 1500;

/** Segundos de espera después de contestar mal la pregunta de la era. */
export const QUIZ_RETRY_SEC = 20;

/** Pregunta pendiente de un jugador. */
interface PendingQuiz {
  id: number;
  correct: number;
  question: QuizQuestion;
  options: string[];
  cmd: Command;
}

/** Órdenes que se guardan como mucho durante una pausa (protege al servidor). */
const MAX_PAUSED_ORDERS = 3000;

export class Room {
  phase: RoomPhase = 'lobby';
  paused = false;
  /** Fin de una pausa táctica automática (ms; 0 = la reanuda el profesor). */
  private pauseUntil = 0;
  private lastBattles = 0;
  members: Member[] = [];
  game: Game | null = null;
  /** Rivales de la computadora de la partida en curso. */
  private ais: AiPlayer[] = [];
  /** Preguntas para avanzar de era: la pendiente de cada jugador, cuándo puede reintentar y cuáles ya vio. */
  private quizzes = new Map<number, PendingQuiz>();
  private quizWait = new Map<number, number>();
  private quizSeen = new Map<number, Set<string>>();
  private nextQuizId = 1;
  /** Profesores mirando la partida. */
  readonly watchers = new Set<Conn>();
  private syncs = new Map<Conn, ClientSync>();
  private nextMemberId = 1;
  private ended: { reason: string; summary: PlayerSummary[]; winners: number[]; history?: HistorySample[]; chronicle?: ChronicleEntry[] } | null = null;

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
    if (known?.kicked) return 'The teacher removed you from this game.';
    if (known) {
      // Vuelve a su puesto. Si tenía otra pestaña abierta, esa se cierra.
      const old = known.conn;
      if (old && old !== conn) {
        old.send({ t: 'error', message: 'You opened the game in another window.' });
        this.detach(old);
        old.close();
      }
      this.attach(conn, known);
      return null;
    }
    if (this.phase !== 'lobby') return 'The game has already started. Ask your teacher for help.';
    if (this.members.length >= this.settings.maxPlayers) return 'The game is full.';
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

  /** Agrega un rival de la computadora (en la sala de espera). */
  addBot(level: BotLevel): string | null {
    if (this.phase !== 'lobby') return 'Computer players are added before the game starts.';
    if (this.members.length >= this.settings.maxPlayers) return 'The game is full: raise the number of players first.';
    const n = this.members.filter((m) => m.bot).length + 1;
    this.members.push({
      id: this.nextMemberId++,
      name: this.uniqueName(`Computer ${n} (${level === 'easy' ? 'Easy' : 'Normal'})`),
      token: randomBytes(16).toString('hex'),
      color: PLAYER_COLORS.find((c) => !this.members.some((m) => m.color === c)) ?? PLAYER_COLORS[0],
      // Un pueblo al azar entre los que nadie eligió.
      faction: FACTION_ORDER[(this.members.length * 3 + this.seed) % FACTION_ORDER.length],
      conn: null,
      kicked: false,
      team: 0,
      lastChat: 0,
      bot: level,
    });
    this.changed();
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
    if (this.phase !== 'lobby') return 'The game has already started.';
    if (color && this.members.some((m) => m !== member && m.color === color)) return 'Another player already chose that color.';
    if (faction) member.faction = faction;
    if (color) member.color = color;
    this.changed();
    return null;
  }

  command(conn: Conn, cmd: Command): void {
    const member = this.memberOf(conn);
    if (!member || member.kicked || !this.game || this.phase !== 'playing') return;
    // En pausa (táctica) se pueden dar órdenes: se aplican todas juntas al reanudar.
    if (this.paused && this.game.queued() >= MAX_PAUSED_ORDERS) return;
    // Avanzar de era: antes hay que contestar una pregunta (si la sala las tiene).
    if (cmd.kind === 'research' && TECH_DEFS[cmd.tech].advancesTo && this.quizMode() !== 'off') return this.askQuiz(member, cmd);
    this.game.enqueue(member.id, cmd);
  }

  private quizMode(): QuizMode {
    const mode = this.settings.quiz ?? 'off';
    return mode === 'custom' && !this.settings.questions?.length ? 'history' : mode;
  }

  /** Manda una pregunta (una que todavía no vio, si hay) para la era que quiere alcanzar. */
  private askQuiz(member: Member, cmd: Extract<Command, { kind: 'research' }>): void {
    const conn = member.conn;
    if (!conn) return;
    const wait = Math.ceil(((this.quizWait.get(member.id) ?? 0) - Date.now()) / 1000);
    if (wait > 0) return conn.send({ t: 'error', message: `Think about it for a moment: you can try again in ${wait} s.` });
    const era = TECH_DEFS[cmd.tech].advancesTo!;
    const bank = this.quizMode() === 'custom' ? this.settings.questions! : (QUIZ_BANK[era] ?? QUIZ_BANK[2]);
    const seen = this.quizSeen.get(member.id) ?? new Set<string>();
    this.quizSeen.set(member.id, seen);
    let pool = bank.filter((q) => !seen.has(q.q));
    if (pool.length === 0) {
      for (const q of bank) seen.delete(q.q);
      pool = bank;
    }
    const question = pool[Math.floor(Math.random() * pool.length)];
    seen.add(question.q);
    // Mezcla las respuestas (la primera del banco es la correcta).
    const order = question.a.map((_, i) => i).sort(() => Math.random() - 0.5);
    const pending: PendingQuiz = { id: this.nextQuizId++, correct: order.indexOf(0), question, options: order.map((i) => question.a[i]), cmd };
    this.quizzes.set(member.id, pending);
    conn.send({ t: 'quiz', id: pending.id, era, q: question.q, options: pending.options });
  }

  /** Respuesta a la pregunta: si acierta, empieza el avance; si no, espera un poco y aprende la respuesta. */
  answerQuiz(conn: Conn, id: number, choice: number): void {
    const member = this.memberOf(conn);
    const pending = member && this.quizzes.get(member.id);
    if (!member || !pending || pending.id !== id || !this.game || this.phase !== 'playing') return;
    this.quizzes.delete(member.id);
    const ok = choice === pending.correct;
    const answer = pending.options[pending.correct];
    const fact = pending.question.fact;
    if (ok) this.game.enqueue(member.id, pending.cmd);
    else this.quizWait.set(member.id, Date.now() + QUIZ_RETRY_SEC * 1000);
    conn.send({ t: 'quizResult', ok, answer, ...(fact ? { fact } : {}), ...(ok ? {} : { wait: QUIZ_RETRY_SEC }) });
  }

  // ---------- Profesor ----------

  setSettings(settings: RoomSettings): string | null {
    if (this.phase !== 'lobby') return 'The game has already started.';
    if (settings.maxPlayers < this.members.length) return `There are already ${this.members.length} players in the room.`;
    this.settings = settings;
    this.changed();
    return null;
  }

  /** El profesor arma los equipos en la sala de espera. */
  setTeam(memberId: number, team: number): string | null {
    if (this.phase !== 'lobby') return 'Teams are set up before the game starts.';
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
    if (!this.settings.chat) return 'The teacher turned off chat in this game.';
    const now = Date.now();
    if (now - member.lastChat < CHAT_COOLDOWN_MS) return 'Wait a moment before sending another message.';
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
    this.ais = this.ais.filter((ai) => ai.playerId !== memberId);
    if (member.conn) {
      const conn = member.conn;
      conn.send({ t: 'kicked', message: 'The teacher removed you from the game.' });
      this.detach(conn);
      conn.close();
    }
    // En la sala de espera el lugar se libera; en partida sus unidades quedan quietas.
    if (this.phase === 'lobby') this.members = this.members.filter((m) => m !== member);
    this.changed();
  }

  start(): string | null {
    if (this.phase !== 'lobby') return 'The game has already started.';
    const players = this.members.filter((m) => !m.kicked);
    if (players.length === 0) return 'There are no players in the room.';
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
    if (this.settings.fog !== false) this.game.enableFog();
    this.ais = players.filter((m) => m.bot).map((m) => new AiPlayer(m.id, m.bot!));
    for (const m of players) {
      const p = this.game.world.players.get(m.id)!;
      p.connected = m.conn !== null || !!m.bot;
      if (m.conn) this.startSync(m.conn, m.id);
    }
    for (const w of this.watchers) this.startSync(w, 0);
    this.phase = 'playing';
    this.changed();
    return null;
  }

  setPaused(paused: boolean, secs = 0, battle = false): void {
    if (this.phase !== 'playing' || this.paused === paused) return;
    this.paused = paused;
    this.pauseUntil = paused && secs > 0 ? Date.now() + secs * 1000 : 0;
    this.broadcast(paused && secs > 0 ? { t: 'paused', paused, secs, ...(battle ? { battle: 1 as const } : {}) } : { t: 'paused', paused });
    this.changed();
  }

  end(reason: string, winners?: number[]): void {
    if (this.phase !== 'playing' || !this.game) return;
    // Si la termina el profesor, gana quien tiene más Gloria.
    if (!winners) {
      const r = decideByGlory(this.game.world);
      winners = r.winners;
      const best = winners.length ? this.game.world.players.get(winners[0]) : undefined;
      if (best) reason += ` Most glory: ${best.name}.`;
    }
    this.phase = 'ended';
    this.paused = false;
    const w = this.game.world;
    w.history.push(snapshot(w)); // la foto final
    this.ended = { reason, summary: this.game.summary(), winners, history: w.history, chronicle: w.chronicle };
    this.broadcast({ t: 'ended', ...this.ended });
    this.changed();
  }

  /** Cerrar la sala: todos vuelven a la pantalla de inicio. */
  close(): void {
    for (const m of this.members)
      if (m.conn) {
        m.conn.send({ t: 'kicked', message: 'The teacher closed the game.' });
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
    // La pausa táctica de una batalla se levanta sola.
    if (this.paused && this.pauseUntil && Date.now() >= this.pauseUntil) this.setPaused(false);
    if (this.phase !== 'playing' || this.paused || !this.game) return;
    const game = this.game;
    for (const ai of this.ais) ai.update(game);
    game.step();
    // Empezó una batalla: pausa táctica para que todos den sus órdenes.
    if (game.world.battlesOpened > this.lastBattles) {
      this.lastBattles = game.world.battlesOpened;
      if (this.settings.battlePause > 0) this.setPaused(true, this.settings.battlePause, true);
    }
    const limit = this.settings.durationMin * 60;
    const frame = buildFrame(game, limit);
    for (const [conn, sync] of this.syncs) {
      sync.collect(frame);
      if (!conn.congested()) conn.send(sync.build(frame, game));
    }
    const outcome = game.world.outcome;
    if (outcome) this.end(outcome.reason, outcome.winners);
    else if (limit > 0 && game.world.tick >= limit * TICK_RATE) {
      const r = decideByGlory(game.world);
      this.end(r.reason, r.winners);
    }
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
        (m): MemberView => ({ id: m.id, name: m.name, color: m.color, faction: m.faction, connected: m.conn !== null || !!m.bot, team: m.team, ...(m.bot ? { bot: m.bot } : {}) }),
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
      connected: active.filter((m) => m.conn || m.bot).length,
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
