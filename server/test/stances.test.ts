// Modos de combate y veteranía (Total War): modo guardia, hostigamiento de arqueros y rangos.
import { describe, expect, it } from 'vitest';
import { GUARD_LEASH, RANK_KILLS, rankOf } from '../../shared/data.ts';
import { decodeEvent, decodeUnit, encodeEvent, encodeUnit } from '../../shared/codec.ts';
import { strike } from '../src/sim/combat.ts';
import { hitMorale } from '../src/sim/morale.ts';
import { flatGame, run } from './helpers.ts';

describe('modo guardia', () => {
  it('no sale a buscar a un enemigo que ve de lejos; sin guardia, sí', () => {
    const g = flatGame();
    const w = g.world;
    const guard = w.addUnit('spearman', 1, 15.5, 15.5);
    const free = w.addUnit('spearman', 1, 15.5, 25.5);
    w.addUnit('warrior', 2, 18.5, 15.5); // a 3 casillas de cada uno
    w.addUnit('warrior', 2, 18.5, 25.5);
    g.enqueue(1, { kind: 'stance', unitIds: [guard.id], guard: true });
    run(g, 1);
    expect(guard.guard).toBe(true);
    expect(guard.task).toBeNull();
    expect(free.task?.kind).toBe('attack');
  });

  it('pelea con quien llega cerca, pero no lo persigue lejos de su puesto', () => {
    const g = flatGame();
    const w = g.world;
    const guard = w.addUnit('spearman', 1, 15.5, 15.5);
    g.enqueue(1, { kind: 'stance', unitIds: [guard.id], guard: true });
    g.step();
    const foe = w.addUnit('scout', 2, 16.8, 15.5);
    run(g, 1);
    expect(guard.task?.kind).toBe('attack');
    // El enemigo se va corriendo lejos: el de guardia vuelve a su puesto.
    foe.x = 26.5;
    run(g, 6);
    expect(Math.hypot(guard.x - 15.5, guard.y - 15.5)).toBeLessThan(GUARD_LEASH);
  });

  it('se ve en la red', () => {
    const v = decodeUnit(encodeUnit({ id: 1, owner: 1, type: 'spearman', x: 1, y: 1, hp: 50, state: 'idle', guard: 1, rank: 2 }));
    expect(v.guard).toBe(1);
    expect(v.rank).toBe(2);
    expect(decodeEvent(encodeEvent({ k: 'rank', x: 3, y: 4, r: 2 }))).toEqual({ k: 'rank', x: 3, y: 4, r: 2 });
  });
});

describe('hostigamiento', () => {
  it('un arquero retrocede si un guerrero se le viene encima', () => {
    const g = flatGame();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 20.5, 20.5);
    const foe = w.addUnit('warrior', 2, 22.2, 20.5);
    run(g, 1.5);
    expect(archer.x).toBeLessThan(20.2); // se alejó (hacia la izquierda)
    expect(Math.hypot(archer.x - foe.x, archer.y - foe.y)).toBeGreaterThan(1.5);
  });

  it('en modo guardia, o con una orden directa de atacar, no retrocede', () => {
    const g = flatGame();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 20.5, 20.5);
    const foe = w.addUnit('warrior', 2, 22.2, 20.5);
    g.enqueue(1, { kind: 'attack', unitIds: [archer.id], targetId: foe.id });
    const held = w.addUnit('archer', 1, 20.5, 30.5);
    w.addUnit('warrior', 2, 22.2, 30.5);
    g.enqueue(1, { kind: 'stance', unitIds: [held.id], guard: true });
    run(g, 1.5);
    expect(archer.x).toBeGreaterThan(20.3);
    expect(held.x).toBeGreaterThan(20.3);
  });
});

describe('veteranía', () => {
  it('con las bajas sube de rango, avisa, pega más y aguanta más', () => {
    expect(rankOf(0)).toBe(0);
    expect(rankOf(RANK_KILLS[0])).toBe(1);
    expect(rankOf(RANK_KILLS[2])).toBe(3);
    const g = flatGame();
    const w = g.world;
    const vet = w.addUnit('warrior', 1, 20.5, 20.5);
    for (let i = 0; i < RANK_KILLS[0]; i++) {
      const victim = w.addUnit('worker', 2, 21.2, 20.5);
      victim.hp = 1;
      const st = w.statsOf(vet);
      strike(w, 1, st.attack, st.category, vet, { kind: 'unit', unit: victim }, vet);
      w.units.delete(victim.id);
    }
    expect(vet.kills).toBe(RANK_KILLS[0]);
    expect(w.events.some((e) => e.k === 'rank')).toBe(true);
    const hitWith = (killsOfAttacker: number) => {
      const foe = w.addUnit('spearman', 2, 30.5, 30.5);
      const att = w.addUnit('warrior', 1, 31.3, 30.5);
      att.kills = killsOfAttacker;
      [foe.fx, foe.fy] = [1, 0];
      const st = w.statsOf(att);
      strike(w, 1, st.attack, st.category, att, { kind: 'unit', unit: foe }, att);
      const d = w.statsOf(foe).hp - foe.hp;
      w.units.delete(foe.id);
      w.units.delete(att.id);
      return d;
    };
    expect(hitWith(RANK_KILLS[2])).toBeGreaterThan(hitWith(0));
    const rookie = w.addUnit('spearman', 1, 10.5, 30.5), veteran = w.addUnit('spearman', 1, 12.5, 30.5);
    veteran.kills = RANK_KILLS[2];
    hitMorale(w, rookie, 20, 0, 2, true);
    hitMorale(w, veteran, 20, 0, 2, true);
    expect(100 - veteran.morale).toBeLessThan(100 - rookie.morale);
  });
});
