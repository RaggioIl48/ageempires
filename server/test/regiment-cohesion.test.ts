// Total War: un regimiento pelea entero, y un soldado trabado pelea con lo que tiene delante.
// Medido antes del cambio (2026-10-21): hasta un 36 % de los soldados se quedaban mirando mientras su
// regimiento peleaba, y la caballería quedaba parada contra una línea enemiga hasta un 9,5 % del tiempo.
import { describe, expect, it } from 'vitest';
import { REGIMENT_JOIN, UNIT_DEFS } from '../../shared/data.ts';
import { flatGame, run } from './helpers.ts';

function arena() {
  const g = flatGame();
  const w = g.world;
  for (const b of [...w.buildings.values()]) w.removeBuilding(b.id);
  w.setRelation(1, 2, 'war');
  return { g, w };
}

describe('regiment cohesion', () => {
  it('when part of a regiment is fighting, the rest join in even if they cannot see the enemy yet', () => {
    const { g, w } = arena();
    // Una columna de 6 lanceros: solo el de adelante ve al enemigo (vista 4).
    const men = Array.from({ length: 6 }, (_, i) => {
      const u = w.addUnit('spearman', 1, 16.5 - i * 1.0, 20.5);
      u.reg = 77;
      return u;
    });
    const foe = w.addUnit('swordsman', 2, 19.5, 20.5);
    const sight = UNIT_DEFS.spearman.sight;
    const far = men.filter((u) => Math.hypot(u.x - foe.x, u.y - foe.y) > sight);
    expect(far.length).toBeGreaterThan(2); // la prueba tiene sentido: varios no lo ven al empezar
    expect(far.every((u) => Math.hypot(u.x - foe.x, u.y - foe.y) <= sight + REGIMENT_JOIN + 1.2)).toBe(true);
    run(g, 3);
    const joined = men.filter((u) => u.hp > 0 && u.task?.kind === 'attack').length;
    expect(joined).toBeGreaterThanOrEqual(5);
  });

  it('a soldier without a regiment does not run to fights it cannot see', () => {
    const { g, w } = arena();
    const lone = w.addUnit('spearman', 1, 10.5, 20.5);
    const mate = w.addUnit('spearman', 1, 16.5, 20.5);
    mate.reg = 5; // otro regimiento
    w.addUnit('swordsman', 2, 19.5, 20.5);
    run(g, 3);
    expect(lone.task).toBeNull();
  });
});

describe('fighting what is in contact', () => {
  it('a soldier blocked by an enemy strikes it, and keeps the target the player gave it', () => {
    const { g, w } = arena();
    const sword = w.addUnit('swordsman', 1, 10.5, 20.5);
    const goal = w.addUnit('archer', 2, 18.5, 20.5); // a más de 6 casillas de la pared: la orden no se reparte entre los dos
    const wall = w.addUnit('spearman', 2, 11.2, 20.5); // pegado, en el camino
    wall.guard = true;
    goal.guard = true;
    g.enqueue(1, { kind: 'attack', unitIds: [sword.id], targetId: goal.id });
    const hp0 = wall.hp;
    run(g, 3);
    expect(wall.hp).toBeLessThan(hp0); // pelea con el que tiene delante, no se queda parado
    expect(sword.task?.kind === 'attack' && sword.task.targetId).toBe(goal.id); // la orden del jugador sigue
  });
});
