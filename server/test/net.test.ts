// Integration test: real server + real WebSocket clients (teacher and students).
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';
import { startGameServer, type RunningServer } from '../src/net/server.ts';

let server: RunningServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets) s.terminate();
  sockets.length = 0;
  await server?.close();
  server = null;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TestClient {
  ws: WebSocket;
  inbox: ServerMessage[];
  /** Bytes received (uncompressed JSON). */
  bytes: number;
  send(m: ClientMessage): void;
  next<T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>>;
}

/** Test client that stores every message it receives. */
async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const client: TestClient = {
    ws,
    inbox: [],
    bytes: 0,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`did not receive "${t}"`)), 3000);
        const check = () => {
          const i = client.inbox.findIndex((m) => m.t === t);
          if (i >= 0) {
            clearTimeout(timer);
            resolve(client.inbox.splice(i, 1)[0] as never);
          } else setTimeout(check, 5);
        };
        check();
      }),
  };
  ws.on('message', (data) => {
    const text = data.toString();
    client.bytes += text.length;
    client.inbox.push(JSON.parse(text));
  });
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return client;
}

async function startServer(): Promise<RunningServer> {
  server = await startGameServer({ port: 0, pin: '1234', autoTick: false, seed: 5 });
  return server;
}

/** Teacher (from this same computer) with a room created. */
async function teacherWithRoom(port: number, maxPlayers = 16) {
  const teacher = await connect(port);
  teacher.send({ t: 'teacher' });
  await teacher.next('teacherOk');
  teacher.send({ t: 'createRoom', settings: { maxPlayers, mapSize: 'normal', durationMin: 0 } });
  const code = (await teacher.next('rooms')).rooms[0].code;
  return { teacher, code };
}

describe('server over the network', () => {
  it('full class of 16 students: they join, play 30 s and use little network', async () => {
    const s = await startServer();
    const { teacher, code } = await teacherWithRoom(s.port);
    const students: TestClient[] = [];
    for (let i = 0; i < 16; i++) {
      const c = await connect(s.port);
      c.send({ t: 'join', code, name: `Estudiante ${i + 1}` });
      students.push(c);
    }
    await Promise.all(students.map((c) => c.next('joined')));
    teacher.send({ t: 'start', code });
    const welcomes = await Promise.all(students.map((c) => c.next('welcome')));
    expect(new Set(welcomes.map((w) => w.you)).size).toBe(16);
    expect(welcomes[0].players).toHaveLength(16);
    for (const c of students) c.bytes = 0; // the map at the start doesn't count: we measure the game

    // 30 seconds of play: every so often each student sends their workers to gather.
    const room = s.lobby.rooms.get(code)!;
    for (let t = 0; t < 300; t++) {
      if (t % 50 === 0)
        students.forEach((c, i) => {
          const pid = welcomes[i].you;
          const w = room.game!.world;
          const mine = [...w.units.values()].filter((u) => u.owner === pid && u.type === 'worker').map((u) => u.id);
          const p = w.players.get(pid)!;
          const node = [...w.nodes.values()].sort((a, b) => Math.hypot(a.tx - p.start.x, a.ty - p.start.y) - Math.hypot(b.tx - p.start.x, b.ty - p.start.y))[0];
          c.send({ t: 'cmd', cmd: { kind: 'gather', unitIds: mine, targetId: node.id } });
        });
      s.tick();
      if (t % 10 === 0) await sleep(2);
    }
    await sleep(50);
    const perStudentKBs = students.reduce((sum, c) => sum + c.bytes, 0) / students.length / 30 / 1024;
    // Goal of Phase 3: < 1.5 Mbit/s per student (~190 KB/s). We measure uncompressed JSON.
    expect(perStudentKBs).toBeLessThan(40);
    // Everyone did get their stuff (gathering underway).
    const eco = room.game!.economyOf(1);
    expect(eco.workers.idle).toBeLessThan(3);
  }, 30_000);

  it('reconnection: the connection drops and the student returns to their same player', async () => {
    const s = await startServer();
    const { teacher, code } = await teacherWithRoom(s.port);
    const ana = await connect(s.port);
    ana.send({ t: 'join', code, name: 'Ana' });
    const { token } = await ana.next('joined');
    const bruno = await connect(s.port);
    bruno.send({ t: 'join', code, name: 'Bruno' });
    await bruno.next('joined');
    teacher.send({ t: 'start', code });
    const first = await ana.next('welcome');
    ana.ws.terminate(); // Wi-Fi drops
    await sleep(50);
    for (let i = 0; i < 20; i++) s.tick();
    const players = await bruno.next('players');
    expect(players.players.find((p) => p.id === first.you)?.connected).toBe(false);

    const back = await connect(s.port);
    back.send({ t: 'join', code, name: 'Ana', token });
    const again = await back.next('welcome');
    expect(again.you).toBe(first.you);
    const d = await back.next('d');
    expect(d.u!.some((u) => u[1] === first.you)).toBe(true); // sees their own units
  });

  it('through a tunnel/proxy (even from this computer) the teacher PIN IS required', async () => {
    const s = await startServer();
    // Same thing a tunnel like Cloudflare does: connects from localhost but adds its headers.
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { 'x-forwarded-for': '203.0.113.9', 'cf-ray': 'abc' } });
    sockets.push(ws);
    const inbox: ServerMessage[] = [];
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => ws.once('open', () => res()));
    ws.send(JSON.stringify({ t: 'teacher' }));
    await sleep(100);
    expect(inbox.find((m) => m.t === 'teacherOk')).toBeUndefined();
    expect(inbox.find((m) => m.t === 'error')).toBeDefined();
    ws.send(JSON.stringify({ t: 'teacher', pin: '1234' }));
    await sleep(100);
    expect(inbox.find((m) => m.t === 'teacherOk')).toBeDefined();
  });

  it('a huge message (over the limit) does not crash the server', async () => {
    const s = await startServer();
    const a = await connect(s.port);
    const closed = new Promise<void>((res) => a.ws.once('close', () => res()));
    a.ws.send('x'.repeat(100 * 1024)); // 100 KB, the limit is 16 KB
    await closed; // the server closes THAT connection...
    const { teacher } = await teacherWithRoom(s.port); // ...but keeps serving others
    expect(teacher.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('flooding: the excess beyond 30 messages per second is ignored', async () => {
    const s = await startServer();
    let handled = 0;
    const original = s.lobby.handle.bind(s.lobby);
    s.lobby.handle = (c, m) => {
      handled++;
      original(c, m);
    };
    const a = await connect(s.port);
    for (let i = 0; i < 200; i++) a.send({ t: 'leave' });
    await sleep(150);
    expect(handled).toBe(30);
  });

  it('ignores garbage messages without crashing', async () => {
    const s = await startServer();
    const a = await connect(s.port);
    a.ws.send('esto no es json');
    a.ws.send(JSON.stringify({ t: 'join', code: 'no', name: '' }));
    a.ws.send(JSON.stringify({ t: 'cmd', cmd: { kind: 'move', unitIds: ['x'], x: 0, y: 0 } }));
    await sleep(50);
    const { teacher } = await teacherWithRoom(s.port);
    expect(teacher.ws.readyState).toBe(WebSocket.OPEN);
  });
});
