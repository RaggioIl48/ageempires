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

/** Recinto de 12..28 alrededor del Centro Urbano del jugador 1 (movido adentro), con una puerta en (20,28). */
function city() {
  const g = flatGame();
  const w = g.world;
  const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
  w.removeBuilding(tc.id);
  w.addBuilding('town_center', 1, 19, 19, true);
  const ring = [...wallLine(12, 12, 28, 12, 999), ...wallLine(28, 12, 28, 28, 999), ...wallLine(28, 28, 12, 28, 999), ...wallLine(12, 28, 12, 12, 999)];
  for (const t of ring) if (!(t.x === 20 && t.y === 28)) w.addBuilding('wall', 1, t.x, t.y, true);
  w.addBuilding('gate', 1, 20, 28, true);
  return g;
}

describe('a walled city is left only through the gate', () => {
  it('soldiers manning the wall come down on the inside and leave through the gate', () => {
    const g = city();
    const w = g.world;
    const men = [0, 1, 2, 3, 4, 5].map((i) => w.addUnit(i % 2 ? 'archer' : 'swordsman', 1, 14.5 + i * 2, 26.5));
    for (const u of men) g.enqueue(1, { kind: 'move', unitIds: [u.id], x: u.x, y: 28.5 });
    run(g, 12);
    expect(men.filter((u) => onWall(w, u)).length).toBeGreaterThanOrEqual(4);
    g.enqueue(1, { kind: 'move', unitIds: men.map((u) => u.id), x: 20.5, y: 35.5 });
    const crossed = new Set<number>();
    const prev = new Map(men.map((u) => [u.id, u.y]));
    for (let i = 0; i < 700; i++) {
      g.step();
      for (const u of men) {
        // Pasa de adentro (y < 29) a afuera: tiene que ser por la columna de la puerta.
        if (prev.get(u.id)! < 29 && u.y >= 29 && Math.floor(u.x) !== 20) crossed.add(u.id);
        prev.set(u.id, u.y);
      }
    }
    expect(crossed.size, 'units that came down the outside of the wall').toBe(0);
    expect(men.every((u) => u.y > 29)).toBe(true); // salieron todos, por la puerta
  });

  it('a crowd of 40 inside leaves only through the gate', () => {
    const g = city();
    const w = g.world;
    const types = ['swordsman', 'spearman', 'archer', 'knight'] as const;
    const men = Array.from({ length: 40 }, (_, i) => w.addUnit(types[i % 4], 1, 14.5 + (i % 12), 14.5 + Math.floor(i / 12) * 2));
    g.enqueue(1, { kind: 'move', unitIds: men.map((u) => u.id), x: 36.5, y: 36.5 });
    const prev = new Map(men.map((u) => [u.id, { x: u.x, y: u.y }]));
    let leaks = 0;
    for (let i = 0; i < 900; i++) {
      g.step();
      for (const u of men) {
        const p = prev.get(u.id)!;
        const inside = (q: { x: number; y: number }) => q.x > 12 && q.x < 29 && q.y > 12 && q.y < 29;
        if (inside(p) && !inside(u) && Math.floor(p.x) !== 20 && Math.floor(u.x) !== 20) leaks++;
        prev.set(u.id, { x: u.x, y: u.y });
      }
    }
    expect(leaks).toBe(0);
    expect(men.filter((u) => u.y > 29).length).toBe(40);
  });
});
