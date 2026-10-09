// Optimizaciones del servidor: deben dar exactamente lo mismo que antes, solo más rápido.
import { describe, expect, it } from 'vitest';
import { maskOf, unitStats } from '../../shared/stats.ts';
import { UnitGrid } from '../src/sim/combat.ts';
import { flatGame } from './helpers.ts';

describe('performance helpers', () => {
  it('the unit grid finds exactly the living units within the radius', () => {
    const g = flatGame();
    const w = g.world;
    const us = Array.from({ length: 200 }, (_, i) => w.addUnit('spearman', 1 + (i % 2), 2 + ((i * 7.3) % 36), 2 + ((i * 3.1) % 36)));
    us[5].hp = 0;
    const grid = new UnitGrid(w);
    for (const [x, y, r] of [[20, 20, 5], [3, 3, 2.5], [37, 10, 8], [10, 30, 0.5]]) {
      const got = grid.near(x, y, r).map((u) => u.id).sort((a, b) => a - b);
      const want = us.filter((u) => u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= r).map((u) => u.id).sort((a, b) => a - b);
      expect(got).toEqual(want);
    }
  });

  it('unit stats are remembered per player but refresh when a technology is researched', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('spearman', 1, 10.5, 10.5);
    const before = w.statsOf(u);
    expect(w.statsOf(u)).toBe(before);
    w.players.get(1)!.techs = maskOf(['pikeman']);
    expect(w.statsOf(u).hp).toBe(unitStats('romans', 'spearman', maskOf(['pikeman'])).hp);
    expect(w.statsOf(u).hp).toBeGreaterThan(before.hp);
  });
});

describe('performance budget and the smoothness meter', () => {
  it('a big battle (800 units) stays well inside the 100 ms of each step', async () => {
    const { Game } = await import('../src/sim/game.ts');
    const g = new Game({ slots: 8, seed: 7 });
    const w = g.world;
    const types = ['spearman', 'swordsman', 'archer', 'knight'] as const;
    const c = w.size / 2;
    for (let p = 1; p <= 8; p++) {
      const ang = (p / 8) * Math.PI * 2;
      for (let i = 0; i < 100; i++) {
        const r = 8 + (i % 10) * 0.9, a = ang + Math.floor(i / 10) * 0.05;
        w.addUnit(types[i % 4], p, c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
    }
    for (let i = 0; i < 20; i++) g.step(); // calentar
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) g.step();
    const avg = (performance.now() - t0) / 100;
    // En este equipo ronda los 6–8 ms; el margen es amplio porque las pruebas corren en paralelo.
    expect(avg).toBeLessThan(40);
  }, 60_000);

  it('the server answers pings with how long its steps take', async () => {
    const { Lobby } = await import('../src/lobby/lobby.ts');
    const { parseClientMessage } = await import('../../shared/protocol.ts');
    expect(parseClientMessage(JSON.stringify({ t: 'ping', n: 7 }))).toEqual({ t: 'ping', n: 7 });
    expect(parseClientMessage(JSON.stringify({ t: 'ping', n: -1 }))).toBeNull();
    const lobby = new Lobby({ pin: '1', urls: () => [], seed: () => 3 });
    const inbox: { t: string; n?: number; ms?: number }[] = [];
    const conn = { role: 'none', room: null, pinFails: 0, isLocal: true, send: (m: { t: string }) => inbox.push(m), congested: () => false, close: () => {} };
    lobby.handle(conn as never, { t: 'ping', n: 7 });
    expect(inbox.at(-1)).toEqual({ t: 'pong', n: 7, ms: 0 });
    // En una partida, informa el promedio de su paso.
    const teacher = { ...conn, send: () => {} };
    lobby.handle(teacher as never, { t: 'teacher' });
    lobby.handle(teacher as never, { t: 'createRoom', settings: { maxPlayers: 2, mapSize: 'small', durationMin: 0, diplomacy: 'free', chat: true, fog: false, battlePause: 0 } });
    const room = [...lobby.rooms.values()][0];
    room.addBot('easy');
    room.addBot('easy');
    room.start();
    for (let i = 0; i < 30; i++) room.tick();
    expect(room.stepMs).toBeGreaterThan(0);
    const student = { ...conn, room, inbox: [] as unknown[] };
    lobby.handle(student as never, { t: 'ping', n: 8 });
    expect(inbox.at(-1)!.ms).toBeCloseTo(Math.round(room.stepMs * 10) / 10);
  });
});
