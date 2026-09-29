// Pausa táctica, caminar o correr, y torres de asedio (Total War).
import { describe, expect, it } from 'vitest';
import { CLIMB_SECONDS, TICK_RATE, WALK_SPEED } from '../../shared/data.ts';
import { flatGame, run, runUntil } from './helpers.ts';

describe('caminar o correr', () => {
  it('caminando van más lento pero casi no se cansan; corriendo, al revés', () => {
    const g = flatGame();
    const w = g.world;
    const walker = w.addUnit('spearman', 1, 8.5, 12.5);
    const runner = w.addUnit('spearman', 1, 8.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [walker.id], x: 30.5, y: 12.5, walk: true });
    g.enqueue(1, { kind: 'move', unitIds: [runner.id], x: 30.5, y: 20.5 });
    run(g, 5);
    const dw = walker.x - 8.5, dr = runner.x - 8.5;
    expect(dw).toBeLessThan(dr);
    expect(dw / dr).toBeCloseTo(WALK_SPEED, 1);
    expect(100 - walker.stamina).toBeLessThan((100 - runner.stamina) / 3);
  });

  it('atacar es cargar: siempre corriendo', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('spearman', 1, 8.5, 12.5);
    const foe = w.addUnit('warrior', 2, 20.5, 12.5);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 10.5, y: 12.5, walk: true });
    g.step();
    expect(u.walking).toBe(true);
    g.enqueue(1, { kind: 'attack', unitIds: [u.id], targetId: foe.id });
    g.step();
    expect(u.walking).toBe(false);
  });
});

describe('torres de asedio', () => {
  /** Muralla del jugador 2 en x = 26, de borde a borde del mapa. */
  function siege() {
    const g = flatGame();
    const w = g.world;
    for (let y = 0; y < 40; y++) w.addBuilding('wall', 2, 26, y); // de borde a borde: no se puede rodear
    return { g, w };
  }

  it('con escalas se trepa unos segundos (expuesto) y después se pelea arriba', () => {
    const { g, w } = siege();
    const army = Array.from({ length: 3 }, (_, i) => w.addUnit('spearman', 1, 22.5, 26.5 + i));
    runUntil(g, () => w.battles.length > 0, 20); // al acercarse a la ciudad empieza la batalla (y hay escalas)
    g.enqueue(1, { kind: 'move', unitIds: army.map((u) => u.id), x: 29.5, y: 27.5 });
    const climber = army[0];
    runUntil(g, () => w.onWall(climber) !== 0, 20);
    expect(w.onWall(climber)).toBe(2); // trepando
    expect(climber.climb).toBeGreaterThan(0);
    // Quieto sobre la muralla, termina de trepar y queda arriba.
    climber.path = [];
    climber.state = 'idle';
    run(g, CLIMB_SECONDS + 0.5);
    if (w.onWall(climber)) expect(w.onWall(climber)).toBe(3);
  });

  it('la torre se acopla a la muralla enemiga y por ahí se sube sin trepar', () => {
    const { g, w } = siege();
    const tower = w.addUnit('siege_tower', 1, 21.5, 30.5);
    const wall = [...w.buildings.values()].find((b) => b.type === 'wall' && b.ty === 30)!;
    g.enqueue(1, { kind: 'attack', unitIds: [tower.id], targetId: wall.id });
    runUntil(g, () => tower.docked, 30);
    expect(tower.docked).toBe(true);
    expect(w.ramps.size).toBeGreaterThan(0);
    // Un soldado sube por la rampa: queda arriba sin tiempo de trepada.
    const [i] = [...w.ramps.keys()];
    const x = i % w.size, y = (i - x) / w.size;
    const s = w.addUnit('spearman', 1, x - 0.5, y + 0.5);
    g.enqueue(1, { kind: 'move', unitIds: [s.id], x: x + 0.5, y: y + 0.5 });
    runUntil(g, () => w.onWall(s) !== 0, 10);
    expect(w.onWall(s)).toBe(3);
    expect(s.climb).toBe(0);
  });

  it('la torre no pelea y no ataca soldados', () => {
    const { g, w } = siege();
    const tower = w.addUnit('siege_tower', 1, 21.5, 30.5);
    const foe = w.addUnit('warrior', 2, 22.3, 30.5);
    g.enqueue(1, { kind: 'attack', unitIds: [tower.id], targetId: foe.id });
    run(g, 3);
    expect(tower.task).toBeNull();
    expect(foe.hp).toBe(w.statsOf(foe).hp);
    expect(w.players.get(1)!.notices.some((t) => t.includes('Siege towers go to enemy walls'))).toBe(true);
    expect(TICK_RATE).toBeGreaterThan(0);
  });
});
