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
