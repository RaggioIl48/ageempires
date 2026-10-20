// Población: un regimiento entero ocupa un solo lugar (como un trabajador). Las casas suben el límite
// hasta POP_CAP_MAX; además hay un tope de unidades por partida para que el servidor siga rápido.
import { describe, expect, it } from 'vitest';
import { POP_CAP_MAX, UNIT_BUDGET, regimentSize, unitLimit } from '../../shared/data.ts';
import { completeTech } from '../src/sim/production.ts';
import { startMarch } from '../src/sim/war.ts';
import { flatGame, run, runUntil } from './helpers.ts';

function base() {
  const g = flatGame(['romans', 'gauls']);
  const w = g.world;
  w.players.get(1)!.resources = { food: 99999, wood: 99999, stone: 99999, metal: 99999 };
  completeTech(w, 1, 'era2');
  const barracks = w.addBuilding('barracks', 1, 12, 4)!;
  return { g, w, barracks };
}

describe('population: a regiment takes one place', () => {
  it('a regiment of 6 spearmen counts as 1 population, like one worker', () => {
    const { g, w, barracks } = base();
    w.addBuilding('house', 1, 9, 10);
    const before = w.popOf(1);
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'spearman' });
    expect(runUntil(g, () => w.popOf(1).units > before.units, 60)).toBeLessThan(60);
    const after = w.popOf(1);
    expect(after.units - before.units).toBe(regimentSize('spearman'));
    expect(after.pop - before.pop).toBe(1);
  });

  it('a regiment keeps its single place after a march on another city', () => {
    const { w } = base();
    const men = Array.from({ length: 6 }, (_, i) => w.addUnit('swordsman', 1, 15.5 + i, 15.5));
    for (const u of men) u.reg = 777;
    expect(startMarch(w, 1, men, 2)).toBeNull();
    const march = w.marches[0];
    expect(march.units.every((s) => s.reg === 777)).toBe(true);
  });

  it('the maximum population cannot be passed, and it says why', () => {
    const { g, w, barracks } = base();
    for (let i = 0; i < 14; i++) w.addBuilding('house', 1, 2 + (i % 7) * 2, 20 + Math.floor(i / 7) * 2);
    expect(w.popOf(1).popCap).toBe(POP_CAP_MAX);
    // Llena la población con regimientos de prueba.
    let reg = 1000;
    while (w.popOf(1).pop < POP_CAP_MAX) {
      reg++;
      for (let i = 0; i < 2; i++) w.addUnit('spearman', 1, 30.5, 10.5).reg = reg;
    }
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'spearman' });
    g.step();
    expect(barracks.queue).toHaveLength(0);
    expect(g.takeNotices(1).join(' ')).toMatch(/Maximum population reached/);
  });

  it('the unit limit is shared among the players of the game', () => {
    expect(unitLimit(16) * 16).toBeLessThanOrEqual(UNIT_BUDGET);
    expect(unitLimit(8)).toBe(300);
    expect(unitLimit(2)).toBe(400);
    const { g, w, barracks } = base();
    w.addBuilding('house', 1, 9, 10);
    const cap = w.popOf(1).unitCap;
    for (let i = w.popOf(1).units; i < cap - 2; i++) w.addUnit('spearman', 1, 30.5, 30.5).reg = 5000; // un solo regimiento gigante
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'spearman' });
    g.step();
    expect(barracks.queue).toHaveLength(0);
    expect(g.takeNotices(1).join(' ')).toMatch(/Army limit reached/);
    run(g, 1);
  });
});
