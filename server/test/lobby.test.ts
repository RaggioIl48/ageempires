// Phase 3: rooms, teacher, students, reconnection (no network: fake connections).
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, type ClientMessage, type RoomSettings, type ServerMessage } from '../../shared/protocol.ts';
import type { Conn } from '../src/lobby/conn.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import type { Room } from '../src/lobby/room.ts';

class FakeConn implements Conn {
  role: Conn['role'] = 'none';
  room: Room | null = null;
  pinFails = 0;
  closed = false;
  inbox: ServerMessage[] = [];
  constructor(readonly isLocal = false) {}
  send(msg: ServerMessage): void {
    this.inbox.push(JSON.parse(JSON.stringify(msg)));
  }
  congested(): boolean {
    return false;
  }
  close(): void {
    this.closed = true;
  }
  /** Last received message of that type. */
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].t === t) return this.inbox[i] as Extract<ServerMessage, { t: T }>;
    return undefined;
  }
  all<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.inbox.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
  }
}

const SETTINGS: RoomSettings = { maxPlayers: 4, mapSize: 'normal', durationMin: 0 };

function setup() {
  const lobby = new Lobby({ pin: '4321', urls: () => ['http://192.168.1.20:8080'], seed: () => 77 });
  const teacher = new FakeConn(true);
  const send = (c: Conn, m: ClientMessage) => lobby.handle(c, m);
  send(teacher, { t: 'teacher' });
  send(teacher, { t: 'createRoom', settings: SETTINGS });
  const code = [...lobby.rooms.keys()][0];
  const room = lobby.rooms.get(code)!;
  const student = (name: string, token?: string) => {
    const c = new FakeConn();
    send(c, { t: 'join', code, name, token });
    return c;
  };
  return { lobby, teacher, send, code, room, student };
}

describe('teacher', () => {
  it('on the server computer they get in without a PIN; from another one they need the right PIN', () => {
    const lobby = new Lobby({ pin: '4321', urls: () => [] });
    const local = new FakeConn(true);
    lobby.handle(local, { t: 'teacher' });
    expect(local.last('teacherOk')).toBeDefined();
    const remote = new FakeConn(false);
    lobby.handle(remote, { t: 'teacher', pin: '0000' });
    expect(remote.last('error')?.message).toMatch(/incorrecta/);
    expect(remote.role).toBe('none');
    lobby.handle(remote, { t: 'teacher', pin: '4321' });
    expect(remote.role).toBe('teacher');
  });

  it('after 5 wrong PINs the connection is cut (no guessing)', () => {
    const lobby = new Lobby({ pin: '4321', urls: () => [] });
    const c = new FakeConn(false);
    for (let i = 0; i < 5; i++) lobby.handle(c, { t: 'teacher', pin: String(1000 + i) });
    expect(c.closed).toBe(true);
  });

  it('testing alone: a "student" on the teacher\'s computer can start their room; one on another computer cannot', () => {
    const { lobby, code, room } = setup();
    const remote = new FakeConn(false);
    lobby.handle(remote, { t: 'join', code, name: 'Remote' });
    expect(remote.last('joined')?.host).toBe(false);
    lobby.handle(remote, { t: 'start', code });
    expect(room.phase).toBe('lobby');
    const local = new FakeConn(true);
    lobby.handle(local, { t: 'join', code, name: 'Teacher testing' });
    expect(local.last('joined')?.host).toBe(true);
    lobby.handle(local, { t: 'start', code });
    expect(room.phase).toBe('playing');
    expect(local.last('welcome')).toBeDefined();
  });

  it('online (another computer): the teacher testing as a student starts with their PIN; a wrong PIN does not work', () => {
    const { lobby, code, room } = setup();
    const t = new FakeConn(false);
    lobby.handle(t, { t: 'join', code, name: 'Teacher' });
    lobby.handle(t, { t: 'start', code, pin: '0000' });
    expect(room.phase).toBe('lobby');
    expect(t.last('error')?.message).toMatch(/Clave/);
    lobby.handle(t, { t: 'start', code });
    expect(room.phase).toBe('lobby');
    lobby.handle(t, { t: 'start', code, pin: '4321' });
    expect(room.phase).toBe('playing');
  });

  it('a local student can only start THEIR room, not someone else\'s', () => {
    const { lobby, teacher, code } = setup();
    lobby.handle(teacher, { t: 'createRoom', settings: SETTINGS });
    const other = [...lobby.rooms.keys()].find((c) => c !== code)!;
    const local = new FakeConn(true);
    lobby.handle(local, { t: 'join', code, name: 'Ana' });
    lobby.handle(local, { t: 'start', code: other });
    expect(lobby.rooms.get(other)!.phase).toBe('lobby');
  });

  it('a student cannot create, start or end games', () => {
    const { send, code, student, room } = setup();
    const s = student('Ana');
    send(s, { t: 'createRoom', settings: SETTINGS });
    expect(s.last('error')?.message).toMatch(/Solo el profesor/);
    send(s, { t: 'start', code });
    expect(s.last('error')?.message).toMatch(/Clave de profesor incorrecta/);
    send(s, { t: 'end', code });
    expect(s.last('error')?.message).toMatch(/Solo el profesor/);
    expect(room.phase).toBe('lobby');
  });

  it('creates rooms with an easy code (4 letters, no O/I/L) and sees them in their panel', () => {
    const { teacher, code } = setup();
    expect(code).toHaveLength(4);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(teacher.last('rooms')?.rooms.map((r) => r.code)).toContain(code);
    expect(teacher.last('teacherOk')?.urls).toEqual(['http://192.168.1.20:8080']);
  });
});

describe('students in the lobby', () => {
  it('join with name and code; they get a token; a wrong code fails', () => {
    const { send, student, teacher } = setup();
    const ana = student('Ana');
    const joined = ana.last('joined')!;
    expect(joined.token).toMatch(/^[0-9a-f]{32}$/);
    expect(ana.last('room')?.room.members.map((m) => m.name)).toEqual(['Ana']);
    expect(teacher.last('room')?.room.members).toHaveLength(1);
    const lost = new FakeConn();
    send(lost, { t: 'join', code: 'ZZZZ', name: 'Bruno' });
    expect(lost.last('error')?.message).toMatch(/No existe/);
  });

  it('repeated names get a number, and each one gets a different color', () => {
    const { student } = setup();
    student('Ana');
    const b = student('ana');
    const members = b.last('room')!.room.members;
    expect(members.map((m) => m.name)).toEqual(['Ana', 'ana 2']);
    expect(new Set(members.map((m) => m.color)).size).toBe(2);
  });

  it('they choose faction and color; a color already taken is refused', () => {
    const { send, student } = setup();
    const ana = student('Ana');
    const bruno = student('Bruno');
    send(ana, { t: 'choose', faction: 'wind', color: '#e0b020' });
    const view = ana.last('room')!.room.members.find((m) => m.name === 'Ana')!;
    expect(view.faction).toBe('wind');
    expect(view.color).toBe('#e0b020');
    send(bruno, { t: 'choose', color: '#e0b020' });
    expect(bruno.last('error')?.message).toMatch(/color/);
  });

  it('when the room is full nobody else gets in', () => {
    const { student } = setup();
    for (const n of ['A', 'B', 'C', 'D']) student(n);
    expect(student('E').last('error')?.message).toMatch(/llena/);
  });

  it('leaving the lobby frees up the spot', () => {
    const { send, student, room } = setup();
    const a = student('A');
    student('B');
    send(a, { t: 'leave' });
    expect(room.view().members.map((m) => m.name)).toEqual(['B']);
  });

  it('the teacher can remove a student from the lobby', () => {
    const { send, student, room, teacher, code } = setup();
    const a = student('A');
    const id = a.last('joined')!.memberId;
    send(teacher, { t: 'kick', code, memberId: id });
    expect(a.last('kicked')).toBeDefined();
    expect(a.closed).toBe(true);
    expect(room.view().members).toHaveLength(0);
  });
});

describe('game', () => {
  function started() {
    const s = setup();
    const ana = s.student('Ana');
    const bruno = s.student('Bruno');
    s.send(ana, { t: 'choose', faction: 'wind', color: '#e0772a' });
    s.send(bruno, { t: 'choose', faction: 'forge', color: '#e0b020' });
    s.send(s.teacher, { t: 'start', code: s.code });
    return { ...s, ana, bruno };
  }

  it('on start each student receives the map with their name, faction and color', () => {
    const { ana, bruno, room } = started();
    expect(room.phase).toBe('playing');
    const wa = ana.last('welcome')!, wb = bruno.last('welcome')!;
    expect(wa.you).toBe(1);
    expect(wb.you).toBe(2);
    expect(wa.players.map((p) => [p.name, p.faction, p.color])).toEqual([
      ['Ana', 'wind', '#e0772a'],
      ['Bruno', 'forge', '#e0b020'],
    ]);
    expect(ana.last('d')?.u?.length).toBeGreaterThan(0); // first message: the whole state
  });

  it('after starting, nobody new joins; orders only move your own units', () => {
    const { student, room, send, ana, lobby } = started();
    expect(student('Carla').last('error')?.message).toMatch(/ya empezó/);
    const w = room.game!.world;
    const mine = [...w.units.values()].find((u) => u.owner === 1)!;
    const theirs = [...w.units.values()].find((u) => u.owner === 2)!;
    const before = { x: theirs.x, y: theirs.y };
    const myStart = { x: mine.x, y: mine.y };
    send(ana, { t: 'cmd', cmd: { kind: 'move', unitIds: [mine.id, theirs.id], x: w.size / 2, y: w.size / 2 } });
    for (let i = 0; i < 20; i++) lobby.tickAll();
    expect(Math.hypot(mine.x - myStart.x, mine.y - myStart.y)).toBeGreaterThan(1); // mine moved
    expect({ x: theirs.x, y: theirs.y }).toEqual(before); // theirs did not
  });

  it('reconnection: with their token they return to the SAME player and see everything', () => {
    const { lobby, ana, room, code } = started();
    const token = ana.last('joined')!.token;
    lobby.disconnect(ana);
    expect(room.game!.world.players.get(1)!.connected).toBe(false);
    for (let i = 0; i < 10; i++) lobby.tickAll();
    const again = new FakeConn();
    lobby.handle(again, { t: 'join', code, name: 'Ana', token });
    expect(again.last('welcome')?.you).toBe(1);
    expect(again.last('d')?.u?.length).toBeGreaterThan(0);
    expect(room.game!.world.players.get(1)!.connected).toBe(true);
    expect(room.view().members).toHaveLength(2);
  });

  it('if they open the game in another tab, the old one is closed', () => {
    const { lobby, ana, code } = started();
    const token = ana.last('joined')!.token;
    const tab2 = new FakeConn();
    lobby.handle(tab2, { t: 'join', code, name: 'Ana', token });
    expect(ana.closed).toBe(true);
    expect(tab2.last('welcome')?.you).toBe(1);
  });

  it('a student removed during the game cannot come back with their token', () => {
    const { lobby, ana, teacher, code, room } = started();
    const { token, memberId } = ana.last('joined')!;
    lobby.handle(teacher, { t: 'kick', code, memberId });
    const again = new FakeConn();
    lobby.handle(again, { t: 'join', code, name: 'Ana', token });
    expect(again.last('error')?.message).toMatch(/sacó/);
    expect(room.view().members.map((m) => m.name)).toEqual(['Bruno']);
  });

  it('pause freezes the game and ignores orders; resume continues it', () => {
    const { lobby, teacher, code, room, ana } = started();
    lobby.handle(teacher, { t: 'pause', code, paused: true });
    expect(ana.last('paused')?.paused).toBe(true);
    const tick = room.game!.world.tick;
    for (let i = 0; i < 10; i++) lobby.tickAll();
    expect(room.game!.world.tick).toBe(tick);
    lobby.handle(teacher, { t: 'pause', code, paused: false });
    lobby.tickAll();
    expect(room.game!.world.tick).toBe(tick + 1);
  });

  it('the teacher ends the game: everyone receives the summary', () => {
    const { lobby, teacher, code, ana, bruno } = started();
    lobby.handle(teacher, { t: 'end', code });
    for (const c of [ana, bruno]) {
      const end = c.last('ended')!;
      expect(end.reason).toMatch(/terminó/);
      expect(end.summary.map((p) => p.name)).toEqual(['Ana', 'Bruno']);
    }
  });

  it('with a time limit the game ends on its own', () => {
    const s = setup();
    s.send(s.teacher, { t: 'setSettings', code: s.code, settings: { ...SETTINGS, durationMin: 1 } });
    const a = s.student('Ana');
    s.send(s.teacher, { t: 'start', code: s.code });
    for (let i = 0; i < 601; i++) s.lobby.tickAll();
    expect(s.room.phase).toBe('ended');
    expect(a.last('ended')?.reason).toMatch(/tiempo/);
    expect(a.all('d').some((d) => d.clk && d.clk[1] === 60)).toBe(true);
  });

  it('the teacher watches: sees the whole game and the economy of each player', () => {
    const { lobby, teacher, code } = started();
    lobby.handle(teacher, { t: 'watch', code });
    expect(teacher.last('welcome')?.you).toBe(0);
    for (let i = 0; i < 12; i++) lobby.tickAll();
    const withEco = teacher.all('d').filter((d) => d.ecoAll);
    expect(withEco.length).toBeGreaterThan(0);
    expect(Object.keys(withEco[0].ecoAll!)).toEqual(['1', '2']);
    // Stops watching: no more messages arrive.
    lobby.handle(teacher, { t: 'unwatch' });
    const count = teacher.all('d').length;
    for (let i = 0; i < 5; i++) lobby.tickAll();
    expect(teacher.all('d').length).toBe(count);
  });

  it('the teacher cannot give orders to units (only watches)', () => {
    const { lobby, teacher, code, room } = started();
    lobby.handle(teacher, { t: 'watch', code });
    const u = [...room.game!.world.units.values()][0];
    const before = { x: u.x, y: u.y };
    lobby.handle(teacher, { t: 'cmd', cmd: { kind: 'move', unitIds: [u.id], x: 1, y: 1 } });
    for (let i = 0; i < 10; i++) lobby.tickAll();
    expect({ x: u.x, y: u.y }).toEqual(before);
  });

  it('closing the room sends everyone back to the start screen', () => {
    const { lobby, teacher, code, ana } = started();
    lobby.handle(teacher, { t: 'closeRoom', code });
    expect(ana.last('kicked')?.message).toMatch(/cerró/);
    expect(lobby.rooms.has(code)).toBe(false);
  });
});
