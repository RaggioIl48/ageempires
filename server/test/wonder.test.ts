// Maravilla (como en Age of Empires): si queda en pie terminada 5 minutos, su imperio gana.
import { describe, expect, it } from 'vitest';
import { WONDER_HOLD_SECONDS } from '../../shared/data.ts';
import { victoryView } from '../src/sim/victory.ts';
import { flatGame, run } from './helpers.ts';

function richGame() {
  const g = flatGame();
  const w = g.world;
  for (const p of w.players.values()) {
    p.era = 2;
    for (const r of ['food', 'wood', 'stone', 'metal'] as const) p.resources[r] = 5000;
  }
  return g;
}

describe('Wonder', () => {
  it('a finished Wonder that stands 5 minutes wins the game (and everyone is warned)', () => {
    const g = richGame();
    const w = g.world;
    const b = w.addBuilding('wonder', 1, 17, 17)!; // terminada
    run(g, 1);
    expect(w.wonders.has(b.id)).toBe(true);
    expect(w.chronicle.some((c) => /finished a Wonder/.test(c.text))).toBe(true);
    const v = victoryView(w);
    expect(v.wonders?.[0][0]).toBe(1);
    expect(v.wonders?.[0][1]).toBeLessThanOrEqual(WONDER_HOLD_SECONDS);
    run(g, WONDER_HOLD_SECONDS - 5);
    expect(w.outcome).toBeNull();
    run(g, 6);
    expect(w.outcome?.winners).toEqual([1]);
    expect(w.outcome?.reason).toMatch(/Wonder/);
  });

  it('destroying it stops the countdown', () => {
    const g = richGame();
    const w = g.world;
    const b = w.addBuilding('wonder', 2, 17, 17)!;
    run(g, 60);
    w.removeBuilding(b.id);
    run(g, WONDER_HOLD_SECONDS);
    expect(w.outcome).toBeNull();
    expect(w.wonders.size).toBe(0);
    expect(victoryView(w).wonders).toBeUndefined();
  });

  it('an unfinished Wonder does not count, and only one per empire', () => {
    const g = richGame();
    const w = g.world;
    const worker = w.addUnit('worker', 1, 16.5, 16.5);
    g.enqueue(1, { kind: 'build', unitIds: [worker.id], building: 'wonder', tx: 17, ty: 17 });
    run(g, 1);
    const site = [...w.buildings.values()].find((b) => b.type === 'wonder');
    expect(site && site.progress < 1).toBe(true);
    expect(w.wonders.size).toBe(0);
    g.enqueue(1, { kind: 'build', unitIds: [worker.id], building: 'wonder', tx: 24, ty: 10 });
    run(g, 0.5);
    expect([...w.buildings.values()].filter((b) => b.type === 'wonder').length).toBe(1);
  });
});

describe('the computer and Wonders', () => {
  it('a bot sends its army against an enemy Wonder', async () => {
    const { AiPlayer } = await import('../src/sim/ai.ts');
    const g = richGame();
    const w = g.world;
    const wonder = w.addBuilding('wonder', 1, 17, 17)!;
    const army = Array.from({ length: 6 }, (_, i) => w.addUnit('swordsman', 2, 30.5 + (i % 3), 28.5 + Math.floor(i / 3)));
    const ai = new AiPlayer(2, 'normal');
    for (let i = 0; i < 40; i++) {
      ai.update(g);
      g.step();
    }
    expect(army.filter((u) => u.task?.kind === 'attack' && u.task.targetId === wonder.id).length).toBeGreaterThanOrEqual(5);
  });
});
