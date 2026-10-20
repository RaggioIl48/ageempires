// En marcha (orden de mover simple): los tiradores disparan sin detenerse y los cuerpo a cuerpo
// traban combate con el enemigo que se les pega; después siguen hacia su destino.
// También: la clave de pruebas (10.000 de cada recurso) y las variantes de muerte en la red.
import { describe, expect, it } from 'vitest';
import { RESOURCE_TYPES } from '../../shared/data.ts';
import { decodeEvent, encodeEvent } from '../../shared/codec.ts';
import type { ClientMessage, RoomSettings, ServerMessage } from '../../shared/protocol.ts';
import type { Conn } from '../src/lobby/conn.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import { TEST_KEY, TEST_KEY_AMOUNT, type Room } from '../src/lobby/room.ts';
import { flatGame, run, runUntil } from './helpers.ts';

/** Un enemigo quieto en modo guardia (no sale a buscar a nadie que pase a más de 2 casillas). */
function guardFoe(g: ReturnType<typeof flatGame>, type: 'warrior' | 'spearman', x: number, y: number) {
  const foe = g.world.addUnit(type, 2, x, y);
  g.enqueue(2, { kind: 'stance', unitIds: [foe.id], guard: true });
  g.step();
  return foe;
}

describe('disparo en marcha', () => {
  it('un arquero que marcha junto a un enemigo a tiro le dispara sin detenerse y llega a su destino', () => {
    const g = flatGame();
    const foe = guardFoe(g, 'spearman', 20.5, 24);
    const archer = g.world.addUnit('archer', 1, 12.5, 20.5);
    const hp0 = foe.hp;
    g.enqueue(1, { kind: 'move', unitIds: [archer.id], x: 28.5, y: 20.5 });
    const t = runUntil(g, () => Math.hypot(archer.x - 28.5, archer.y - 20.5) < 0.6, 30);
    expect(t).toBeLessThan(30);
    expect(foe.hp).toBeLessThan(hp0); // le tiró en la pasada
    expect(archer.task).toBeNull(); // nunca se puso a perseguirlo
  });

  it('con la orden de mover, no dispara a lo que está fuera de su alcance', () => {
    const g = flatGame();
    const foe = guardFoe(g, 'spearman', 20.5, 28.5); // a 8 casillas del camino: alcance 5
    const archer = g.world.addUnit('archer', 1, 12.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [archer.id], x: 28.5, y: 20.5 });
    run(g, 14);
    expect(foe.hp).toBe(g.world.statsOf(foe).hp);
  });
});

describe('combate cercano en marcha', () => {
  it('un lancero que pasa pegado a un enemigo traba combate, lo vence y sigue hacia su destino', () => {
    const g = flatGame();
    const foe = guardFoe(g, 'warrior', 20.5, 21.6);
    foe.hp = 4;
    const spear = g.world.addUnit('spearman', 1, 12.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [spear.id], x: 28.5, y: 20.5 });
    expect(runUntil(g, () => spear.task?.kind === 'attack', 15)).toBeLessThan(15);
    expect(spear.resume).not.toBeNull();
    expect(runUntil(g, () => foe.hp <= 0, 15)).toBeLessThan(15);
    const t = runUntil(g, () => Math.hypot(spear.x - 28.5, spear.y - 20.5) < 0.8, 20);
    expect(t).toBeLessThan(20);
  });

  it('a un enemigo que pasa a varias casillas lo ignora y sigue marchando', () => {
    const g = flatGame();
    const foe = guardFoe(g, 'warrior', 20.5, 24.5); // a 4 casillas: fuera del radio cercano
    const spear = g.world.addUnit('spearman', 1, 12.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [spear.id], x: 28.5, y: 20.5 });
    let fought = false;
    runUntil(g, () => {
      fought ||= spear.task?.kind === 'attack';
      return Math.hypot(spear.x - 28.5, spear.y - 20.5) < 0.8;
    }, 20);
    expect(fought).toBe(false);
    expect(foe.hp).toBe(g.world.statsOf(foe).hp);
  });

  it('una orden nueva cancela el regreso a la marcha', () => {
    const g = flatGame();
    guardFoe(g, 'warrior', 20.5, 21.6);
    const spear = g.world.addUnit('spearman', 1, 12.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [spear.id], x: 28.5, y: 20.5 });
    runUntil(g, () => spear.task?.kind === 'attack', 15);
    g.enqueue(1, { kind: 'move', unitIds: [spear.id], x: 12.5, y: 12.5 });
    g.step();
    expect(spear.resume).toBeNull();
  });
});

// ---------- Clave de pruebas ----------

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
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].t === t) return this.inbox[i] as Extract<ServerMessage, { t: T }>;
    return undefined;
  }
}

const SETTINGS: RoomSettings = { maxPlayers: 4, mapSize: 'small', durationMin: 0, diplomacy: 'free', chat: true, fog: false, battlePause: 0, quiz: 'off' };

function room(settings: RoomSettings, students: string[]) {
  const lobby = new Lobby({ pin: '4321', urls: () => [], seed: () => 5 });
  const teacher = new FakeConn(true);
  const send = (c: Conn, m: ClientMessage) => lobby.handle(c, m);
  send(teacher, { t: 'teacher' });
  send(teacher, { t: 'createRoom', settings });
  const code = [...lobby.rooms.keys()][0];
  const conns = students.map((name) => {
    const c = new FakeConn();
    send(c, { t: 'join', code, name });
    return c;
  });
  send(teacher, { t: 'start', code });
  return { send, conns, room: lobby.rooms.get(code)! };
}

describe('clave de pruebas', () => {
  it('jugando solo (contra la computadora), la clave deja 10.000 de cada recurso', () => {
    const { send, conns, room: r } = room(SETTINGS, ['Ana']);
    send(conns[0], { t: 'chat', text: ` ${TEST_KEY.toUpperCase()} `, to: 'all' });
    const p = r.game!.world.players.get(conns[0].last('joined')!.memberId)!;
    for (const res of RESOURCE_TYPES) expect(p.resources[res]).toBe(TEST_KEY_AMOUNT);
    expect(conns[0].last('chat')).toBeUndefined(); // la clave no se publica en el chat
  });

  it('en clase (varios estudiantes) no funciona salvo que el profesor active el modo pruebas', () => {
    const off = room(SETTINGS, ['Ana', 'Bruno']);
    off.send(off.conns[0], { t: 'chat', text: TEST_KEY, to: 'all' });
    expect(off.conns[0].last('error')?.message).toMatch(/test key is off/);
    expect(off.room.game!.world.players.get(off.conns[0].last('joined')!.memberId)!.resources.food).toBeLessThan(TEST_KEY_AMOUNT);
    expect(off.conns[1].last('chat')).toBeUndefined(); // ni se publica

    const on = room({ ...SETTINGS, testMode: true }, ['Ana', 'Bruno']);
    on.send(on.conns[1], { t: 'chat', text: TEST_KEY, to: 'all' });
    expect(on.room.game!.world.players.get(on.conns[1].last('joined')!.memberId)!.resources.stone).toBe(TEST_KEY_AMOUNT);
  });
});

describe('variantes de muerte en la red', () => {
  it('la dirección del golpe y si fue brutal viajan con el evento de muerte', () => {
    expect(decodeEvent(encodeEvent({ k: 'death', x: 3, y: 4, d: 0, h: 1 }))).toEqual({ k: 'death', x: 3, y: 4, d: 0, h: 1 });
    expect(decodeEvent(encodeEvent({ k: 'death', x: 3, y: 4, d: 15 }))).toEqual({ k: 'death', x: 3, y: 4, d: 15 });
    expect(decodeEvent(encodeEvent({ k: 'death', x: 3, y: 4 }))).toEqual({ k: 'death', x: 3, y: 4 });
  });

  it('el servidor anota desde dónde llegó el golpe mortal y si fue una carga', () => {
    const g = flatGame();
    const victim = g.world.addUnit('warrior', 2, 20.5, 20.5);
    victim.hp = 1;
    g.world.addUnit('spearman', 1, 19.6, 20.5); // a su izquierda: el golpe va hacia +x (sector 0)
    let death: ReturnType<typeof decodeEvent> | undefined;
    runUntil(g, () => {
      death = g.world.events.find((e) => e.k === 'death');
      return !!death;
    }, 10);
    expect(death).toMatchObject({ k: 'death', d: 0 });
  });
});
