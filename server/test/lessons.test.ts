// Contenido educativo: quiénes fueron los pueblos y preguntas para avanzar de era.
import { describe, expect, it } from 'vitest';
import { FACTION_ORDER, UNIT_DEFS, type UnitType } from '../../shared/data.ts';
import { PEOPLE_HISTORY, QUIZ_BANK, UNIT_HISTORY, parseQuizText } from '../../shared/lessons.ts';
import { parseClientMessage, type ClientMessage, type RoomSettings, type ServerMessage } from '../../shared/protocol.ts';
import type { Conn } from '../src/lobby/conn.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import type { Room } from '../src/lobby/room.ts';

class FakeConn implements Conn {
  role: Conn['role'] = 'none';
  room: Room | null = null;
  pinFails = 0;
  inbox: ServerMessage[] = [];
  constructor(readonly isLocal = false) {}
  send(msg: ServerMessage): void {
    this.inbox.push(JSON.parse(JSON.stringify(msg)));
  }
  congested(): boolean {
    return false;
  }
  close(): void {}
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].t === t) return this.inbox[i] as Extract<ServerMessage, { t: T }>;
    return undefined;
  }
}

function playing(settings: Partial<RoomSettings>) {
  const lobby = new Lobby({ pin: '4321', urls: () => [], seed: () => 77 });
  const teacher = new FakeConn(true);
  const send = (c: Conn, m: ClientMessage) => lobby.handle(c, m);
  send(teacher, { t: 'teacher' });
  send(teacher, { t: 'createRoom', settings: { maxPlayers: 2, mapSize: 'small', durationMin: 0, diplomacy: 'free', chat: true, fog: false, battlePause: 0, ...settings } });
  const code = [...lobby.rooms.keys()][0];
  const room = lobby.rooms.get(code)!;
  const ana = new FakeConn();
  send(ana, { t: 'join', code, name: 'Ana' });
  send(teacher, { t: 'start', code });
  const w = room.game!.world;
  const p = w.players.get(1)!;
  p.resources = { food: 5000, wood: 5000, stone: 5000, metal: 5000 };
  const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
  w.addBuilding('barracks', 1, tc.tx + 6, tc.ty);
  const advance = () => send(ana, { t: 'cmd', cmd: { kind: 'research', buildingId: tc.id, tech: 'era2' } });
  return { room, ana, send, tc, advance };
}

describe('who were they? (history cards)', () => {
  it('every people has a full history card and every unique unit a history note', () => {
    for (const f of FACTION_ORDER) {
      const h = PEOPLE_HISTORY[f];
      for (const k of ['when', 'where', 'leader', 'war', 'fact', 'legacy'] as const) expect(h[k].length).toBeGreaterThan(20);
    }
    for (const t of Object.keys(UNIT_DEFS) as UnitType[])
      if (UNIT_DEFS[t].faction && UNIT_DEFS[t].era === 2) expect(UNIT_HISTORY[t], t).toBeTruthy();
  });

  it('the question bank is well formed (2–4 different answers, no repeats)', () => {
    for (const era of [2, 3, 4]) {
      const qs = QUIZ_BANK[era];
      expect(qs.length).toBeGreaterThanOrEqual(4);
      expect(new Set(qs.map((q) => q.q)).size).toBe(qs.length);
      for (const q of qs) {
        expect(q.a.length).toBeGreaterThanOrEqual(2);
        expect(new Set(q.a).size).toBe(q.a.length);
      }
    }
  });
});

describe('questions to advance an age', () => {
  it('advancing asks a question first: a wrong answer waits 20 s, a right one starts the advance', () => {
    const { room, ana, send, tc, advance } = playing({ quiz: 'history' });
    advance();
    room.tick();
    expect(tc.queue).toHaveLength(0); // todavía no: primero la pregunta
    const quiz = ana.last('quiz')!;
    expect(quiz.era).toBe(2);
    expect(quiz.options.length).toBeGreaterThanOrEqual(2);
    // La respuesta correcta es la primera del banco (las opciones vienen mezcladas).
    const bank = QUIZ_BANK[2].find((q) => q.q === quiz.q)!;
    const right = quiz.options.indexOf(bank.a[0]);
    const wrong = right === 0 ? 1 : 0;
    send(ana, { t: 'quizAnswer', id: quiz.id, choice: wrong });
    const r1 = ana.last('quizResult')!;
    expect(r1.ok).toBe(false);
    expect(r1.answer).toBe(bank.a[0]);
    expect(r1.wait).toBe(20);
    // Enseguida no puede volver a intentar.
    advance();
    expect(ana.last('error')?.message).toMatch(/try again in/);
    // Pasado el tiempo, otra pregunta (distinta); bien contestada, empieza el avance.
    (room as unknown as { quizWait: Map<number, number> }).quizWait.clear();
    advance();
    const q2 = ana.last('quiz')!;
    expect(q2.q).not.toBe(quiz.q);
    const bank2 = QUIZ_BANK[2].find((q) => q.q === q2.q)!;
    send(ana, { t: 'quizAnswer', id: q2.id, choice: q2.options.indexOf(bank2.a[0]) });
    expect(ana.last('quizResult')!.ok).toBe(true);
    room.tick();
    expect(tc.queue.map((q) => q.tech)).toEqual(['era2']);
  });

  it('an old or made-up answer does nothing', () => {
    const { room, ana, send, tc, advance } = playing({ quiz: 'history' });
    advance();
    const quiz = ana.last('quiz')!;
    send(ana, { t: 'quizAnswer', id: quiz.id + 5, choice: 0 });
    expect(ana.last('quizResult')).toBeUndefined();
    room.tick();
    expect(tc.queue).toHaveLength(0);
  });

  it('the teacher can write their own questions, or turn questions off', () => {
    const qs = parseQuizText('What is 2 + 2? | 4 | 5 | 22\nbad line\nCapital of Chile? | Santiago | Lima');
    expect(qs).toEqual([
      { q: 'What is 2 + 2?', a: ['4', '5', '22'] },
      { q: 'Capital of Chile?', a: ['Santiago', 'Lima'] },
    ]);
    const msg = parseClientMessage(JSON.stringify({ t: 'createRoom', settings: { maxPlayers: 2, mapSize: 'small', durationMin: 0, quiz: 'custom', questions: qs } }));
    expect(msg && msg.t === 'createRoom' && msg.settings.questions).toEqual(qs);
    expect(parseClientMessage(JSON.stringify({ t: 'createRoom', settings: { maxPlayers: 2, mapSize: 'small', durationMin: 0, quiz: 'custom', questions: [{ q: 'x', a: ['only one'] }] } }))).toBeNull();

    const custom = playing({ quiz: 'custom', questions: qs });
    custom.advance();
    expect(qs.map((q) => q.q)).toContain(custom.ana.last('quiz')!.q);

    const off = playing({ quiz: 'off' });
    off.advance();
    off.room.tick();
    expect(off.ana.last('quiz')).toBeUndefined();
    expect(off.tc.queue.map((q) => q.tech)).toEqual(['era2']);
  });
});
