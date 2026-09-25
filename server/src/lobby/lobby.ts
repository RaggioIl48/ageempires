// El lobby recibe los mensajes de cada conexión y los reparte: los del
// profesor (crear sala, iniciar, pausar…) y los de los estudiantes (entrar con
// código, elegir facción, dar órdenes). Cada acción se autoriza aquí.

import { CODE_ALPHABET, CODE_LENGTH, type ClientMessage, type ServerMessage } from '../../../shared/protocol.ts';
import type { Conn } from './conn.ts';
import { Room } from './room.ts';

/** Intentos de clave de profesor antes de cortar la conexión. */
const MAX_PIN_FAILS = 5;

export interface LobbyOptions {
  /** Clave del profesor (desde el computador del servidor no hace falta). */
  pin: string;
  /** Direcciones para los estudiantes (http://IP:puerto). */
  urls: () => string[];
  /** Semilla de mapa para cada partida (por defecto, al azar). */
  seed?: () => number;
}

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly teachers = new Set<Conn>();

  constructor(private readonly opts: LobbyOptions) {}

  handle(conn: Conn, msg: ClientMessage): void {
    switch (msg.t) {
      // ---------- Estudiantes ----------
      case 'join': {
        const room = this.rooms.get(msg.code);
        if (!room)
          return conn.send({
            t: 'error',
            message: 'No existe una partida con ese código. Revisa las letras o pide el código a tu profesor.',
          });
        if (conn.role === 'teacher') return conn.send({ t: 'error', message: 'Esta ventana es la del profesor.' });
        if (conn.room && conn.room !== room) conn.room.leave(conn);
        const error = room.join(conn, msg.name, msg.token);
        if (error) conn.send({ t: 'error', message: error });
        return;
      }
      case 'leave':
        conn.room?.leave(conn);
        conn.role = 'none';
        return;
      case 'choose': {
        if (conn.role !== 'student' || !conn.room) return;
        const error = conn.room.choose(conn, msg.faction, msg.color);
        if (error) conn.send({ t: 'error', message: error });
        return;
      }
      case 'cmd':
        if (conn.role === 'student') conn.room?.command(conn, msg.cmd);
        return;
      case 'chat': {
        if (conn.role !== 'student' || !conn.room) return;
        const error = conn.room.chat(conn, msg.text, msg.to);
        if (error) conn.send({ t: 'error', message: error });
        return;
      }
      case 'start': {
        // El profesor probando como "estudiante" también puede iniciar su sala desde la sala de
        // espera: si está en el computador del servidor, o si da la clave del profesor.
        const byTeacher = conn.isLocal || (msg.pin !== undefined && msg.pin === this.opts.pin);
        if (conn.role === 'student' && byTeacher && conn.room?.code === msg.code) {
          const error = conn.room.start();
          if (error) conn.send({ t: 'error', message: error });
          return;
        }
        if (conn.role === 'student') {
          conn.pinFails++;
          if (conn.pinFails >= MAX_PIN_FAILS) conn.close();
          return conn.send({ t: 'error', message: 'Clave de profesor incorrecta: no se puede iniciar.' });
        }
        break; // si no, sigue abajo: solo el profesor
      }

      // ---------- Profesor ----------
      case 'teacher': {
        if (conn.isLocal || msg.pin === this.opts.pin) {
          if (conn.room) conn.room.leave(conn);
          conn.role = 'teacher';
          this.teachers.add(conn);
          conn.send({ t: 'teacherOk', rooms: this.summaries(), urls: this.opts.urls() });
          for (const room of this.rooms.values()) conn.send({ t: 'room', room: room.view() });
        } else {
          conn.send({ t: 'error', message: 'Clave de profesor incorrecta.' });
          if (++conn.pinFails >= MAX_PIN_FAILS) conn.close();
        }
        return;
      }
    }

    // El resto es solo para el profesor.
    if (conn.role !== 'teacher') return conn.send({ t: 'error', message: 'Solo el profesor puede hacer eso.' });
    if (msg.t === 'createRoom') {
      const code = this.newCode();
      const seed = this.opts.seed?.() ?? Math.floor(Math.random() * 1_000_000);
      const room = new Room(code, msg.settings, seed, (r) => this.roomChanged(r));
      this.rooms.set(code, room);
      this.roomChanged(room);
      return;
    }
    if (msg.t === 'unwatch') {
      conn.room?.unwatch(conn);
      return;
    }
    const room = this.rooms.get(msg.code);
    if (!room) return conn.send({ t: 'error', message: 'Esa sala ya no existe.' });
    let error: string | null = null;
    switch (msg.t) {
      case 'setSettings':
        error = room.setSettings(msg.settings);
        break;
      case 'kick':
        room.kick(msg.memberId);
        break;
      case 'setTeam':
        error = room.setTeam(msg.memberId, msg.team);
        break;
      case 'start':
        error = room.start();
        break;
      case 'pause':
        room.setPaused(msg.paused);
        break;
      case 'end':
        room.end('El profesor terminó la partida.');
        break;
      case 'closeRoom':
        room.close();
        this.rooms.delete(room.code);
        this.broadcastTeachers({ t: 'rooms', rooms: this.summaries() });
        break;
      case 'watch':
        if (conn.room && conn.room !== room) conn.room.unwatch(conn);
        room.watch(conn);
        break;
    }
    if (error) conn.send({ t: 'error', message: error });
  }

  /** La conexión se cerró. */
  disconnect(conn: Conn): void {
    this.teachers.delete(conn);
    conn.room?.detach(conn);
  }

  /** Avanza un paso todas las partidas en curso. */
  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  private summaries() {
    return [...this.rooms.values()].map((r) => r.summary());
  }

  private roomChanged(room: Room): void {
    this.broadcastTeachers({ t: 'room', room: room.view() });
    this.broadcastTeachers({ t: 'rooms', rooms: this.summaries() });
  }

  private broadcastTeachers(msg: ServerMessage): void {
    for (const t of this.teachers) t.send(msg);
  }

  /** Código de 4 letras fácil de dictar (sin O, I ni L para no confundir). */
  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
