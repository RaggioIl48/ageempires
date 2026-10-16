// Las murallas son paredes para todos: nadie las cruza caminando por encima (propios, aliados ni
// enemigos). Solo suben los que reciben la orden de guarnecerlas; los atacantes, con escalas en un asedio.
import { describe, expect, it } from 'vitest';
import { wallLine } from '../../shared/wall.ts';
import { flatGame, run } from './helpers.ts';

function walled() {
  const g = flatGame();
  const w = g.world;
  for (const t of wallLine(20, 0, 20, 39, 999)) w.addBuilding('wall', 1, t.x, t.y, true);
  return g;
}
const onWall = (w: ReturnType<typeof walled>['world'], u: { x: number; y: number }) => w.solid[Math.floor(u.y) * w.size + Math.floor(u.x)] !== 0;

describe('walls block everyone', () => {
  it('own infantry, cavalry and enemies do not cross or walk over a wall', () => {
    const g = walled();
    const w = g.world;
    const own = [0, 1, 2].map((i) => w.addUnit('swordsman', 1, 15.5, 16.5 + i * 2));
    const cav = w.addUnit('knight', 1, 15.5, 24.5);
    const foe = [0, 1].map((i) => w.addUnit('spearman', 2, 15.5, 27.5 + i * 2));
    g.enqueue(1, { kind: 'move', unitIds: [...own, cav].map((u) => u.id), x: 26.5, y: 20.5 });
    g.enqueue(2, { kind: 'move', unitIds: foe.map((u) => u.id), x: 26.5, y: 20.5 });
    for (let i = 0; i < 300; i++) {
      g.step();
      for (const u of [...own, cav, ...foe]) expect(onWall(w, u), `unit ${u.id} on the wall`).toBe(false);
    }
    for (const u of [...own, cav, ...foe]) expect(u.x).toBeLessThan(20);
  });

  it('soldiers ordered to man the wall do go up', () => {
    const g = walled();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 18.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [archer.id], x: 20.5, y: 20.5 });
    run(g, 6);
    expect(onWall(w, archer)).toBe(true);
  });
});
