// Rival de la computadora: juega con las órdenes de un estudiante, sube de era, contraataca y conquista.
import { describe, expect, it } from 'vitest';
import { parseClientMessage, type RoomSettings } from '../../shared/protocol.ts';
import { Room } from '../src/lobby/room.ts';
import { AiPlayer } from '../src/sim/ai.ts';
import type { Game } from '../src/sim/game.ts';
import { flatGame, newGame } from './helpers.ts';

/** Juega `seconds` segundos con estos rivales de la computadora. */
function play(g: Game, ais: AiPlayer[], seconds: number, stop = () => false): void {
  for (let i = 0; i < seconds * 10 && !stop(); i++) {
    for (const ai of ais) ai.update(g);
    g.step();
  }
}

describe('computer rival', () => {
  it('builds an economy, houses and barracks, and advances to the Medieval Age', () => {
    const g = newGame(2, 5);
    play(g, [new AiPlayer(1, 'normal')], 8 * 60);
    const w = g.world;
    const mine = [...w.units.values()].filter((u) => u.owner === 1);
    const bs = [...w.buildings.values()].filter((b) => b.owner === 1);
    const workers = mine.filter((u) => u.type === 'worker');
    expect(workers.length).toBeGreaterThanOrEqual(20);
    expect(workers.filter((u) => !u.task).length).toBeLessThanOrEqual(3);
    expect(bs.filter((b) => b.type === 'house').length).toBeGreaterThanOrEqual(4);
    expect(bs.some((b) => b.type === 'barracks' && b.progress >= 1)).toBe(true);
    expect(w.players.get(1)!.era).toBe(2);
    expect(mine.filter((u) => u.type !== 'worker' && u.type !== 'general').length).toBeGreaterThanOrEqual(8);
  });

  it('counters what it sees: enemy cavalry near its city → it trains spearmen', () => {
    const g = flatGame(['germans', 'romans']);
    const w = g.world;
    const p = w.players.get(1)!;
    p.era = 2;
    p.resources = { food: 700, wood: 600, stone: 0, metal: 600 };
    w.addBuilding('house', 1, 9, 4);
    w.addBuilding('house', 1, 9, 7);
    const barracks = w.addBuilding('barracks', 1, 4, 9)!;
    for (let i = 0; i < 5; i++) w.addUnit('knight', 2, 20.5 + i, 20.5);
    for (let i = 0; i < 4; i++) w.addUnit('worker', 1, 6.5 + i, 8.5);
    w.tick = 6000; // ya pasó la apertura económica: entrena tropas
    play(g, [new AiPlayer(1, 'normal')], 3);
    expect(barracks.queue.map((q) => q.unit)).toContain('spearman');
    expect(barracks.queue.map((q) => q.unit)).not.toContain('swordsman');
  });

  it('a Normal rival conquers an Easy one (attack waves marching on the city)', () => {
    const g = newGame(2, 5);
    let marched = false;
    play(g, [new AiPlayer(1, 'normal'), new AiPlayer(2, 'easy')], 25 * 60, () => {
      if (g.world.marches.some((m) => m.owner === 1)) marched = true;
      return g.world.outcome !== null && g.world.outcome !== undefined;
    });
    expect(marched).toBe(true);
    expect(g.world.outcome?.winners).toEqual([1]);
  }, 60_000);

  it('the teacher adds computer players in the waiting room; they play on their own', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'addBot', code: 'ABCD', level: 'normal' }))).toEqual({ t: 'addBot', code: 'ABCD', level: 'normal' });
    expect(parseClientMessage(JSON.stringify({ t: 'addBot', code: 'ABCD', level: 'insane' }))).toBeNull();
    const settings: RoomSettings = { maxPlayers: 2, mapSize: 'small', durationMin: 0, diplomacy: 'free', chat: true, fog: true, battlePause: 0 };
    const room = new Room('ABCD', settings, 5, () => {});
    expect(room.addBot('easy')).toBeNull();
    expect(room.addBot('normal')).toBeNull();
    expect(room.addBot('normal')).toMatch(/full/);
    const view = room.view();
    expect(view.members.map((m) => m.bot)).toEqual(['easy', 'normal']);
    expect(view.members.every((m) => m.connected)).toBe(true);
    expect(room.start()).toBeNull();
    for (let i = 0; i < 1200; i++) room.tick();
    const w = room.game!.world;
    for (const id of [1, 2]) expect([...w.units.values()].filter((u) => u.owner === id && u.type === 'worker').length).toBeGreaterThan(5);
  });
});
