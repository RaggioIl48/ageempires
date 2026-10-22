// Auditoría P4: aviso de obreros sin trabajo y Colina Sagrada sin rivales.
import { describe, expect, it } from 'vitest';
import { IDLE_WARN_REPEAT, IDLE_WARN_SECONDS, TICK_RATE } from '../../shared/data.ts';
import { World } from '../src/sim/world.ts';
import { Game } from '../src/sim/game.ts';
import { flatGame, run } from './helpers.ts';

const idleNotices = (w: World, id: number) => w.players.get(id)!.notices.filter((n) => n.includes('doing nothing'));

describe('aviso de economía parada', () => {
  it('avisa cuando hay obreros sin trabajo un rato, y lo repite más tarde', () => {
    const g = flatGame();
    const w = g.world;
    w.addUnit('worker', 1, 8, 8);
    w.addUnit('worker', 1, 8.6, 8);
    run(g, IDLE_WARN_SECONDS - 2);
    expect(idleNotices(w, 1)).toEqual([]);
    run(g, 3);
    expect(idleNotices(w, 1)).toEqual(['2 workers are doing nothing. Click "Idle" in the top bar to find them and put them to work.']);
    w.players.get(1)!.notices.length = 0;
    run(g, IDLE_WARN_REPEAT - 2);
    expect(idleNotices(w, 1)).toEqual([]);
    run(g, 3);
    expect(idleNotices(w, 1)).toHaveLength(1);
    // El jugador 2 no tiene obreros: nada que avisar.
    expect(idleNotices(w, 2)).toEqual([]);
  });

  it('no avisa si los obreros vuelven a trabajar antes de tiempo', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 8, 8);
    run(g, IDLE_WARN_SECONDS - 5);
    w.units.delete(u.id); // ya no hay obreros quietos: la cuenta empieza de nuevo
    run(g, 2);
    w.addUnit('worker', 1, 8, 8);
    run(g, IDLE_WARN_SECONDS - 5);
    expect(idleNotices(w, 1)).toEqual([]);
    expect(w.players.get(1)!.idleSince).toBeGreaterThan(0);
    expect(w.tick - w.players.get(1)!.idleSince).toBeLessThan(IDLE_WARN_SECONDS * TICK_RATE);
  });
});

describe('Colina Sagrada sin rivales', () => {
  const soloOnHill = (players: number) => {
    const w = new World(40);
    for (let id = 1; id <= players; id++) {
      w.addPlayer(id, `P${id}`, '#2f6fd6', { x: 5 + id * 10, y: 5 }, 'romans');
      w.addBuilding('town_center', id, 4 + id * 10, 4);
    }
    w.hill = { x: 20, y: 25, holder: 0, contested: false };
    w.players.get(1)!.era = 2;
    for (let i = 0; i < 3; i++) w.addUnit('spearman', 1, 19 + i * 0.8, 25);
    const g = new Game(w);
    run(g, 2);
    return w;
  };

  it('con un solo jugador en la sala, la colina no cuenta', () => {
    const w = soloOnHill(1);
    expect(w.hill!.holder).toBe(0);
    expect(w.players.get(1)!.hillTicks).toBe(0);
  });

  it('con un rival en pie, cuenta como siempre', () => {
    const w = soloOnHill(2);
    expect(w.hill!.holder).toBe(1);
    expect(w.players.get(1)!.hillTicks).toBeGreaterThan(0);
  });
});
