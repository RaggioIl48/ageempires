// Moral, huida y flancos (idea de Total War: Attila), y el ariete que solo ataca edificios.
import { describe, expect, it } from 'vitest';
import { FLANK_DAMAGE, REAR_DAMAGE, ROUT_MIN_SECONDS, ROUT_RALLY } from '../../shared/data.ts';
import { decodeUnit, encodeUnit } from '../../shared/codec.ts';
import { strike } from '../src/sim/combat.ts';
import { flankSide, hitMorale, startRout } from '../src/sim/morale.ts';
import { flatGame, run, runUntil } from './helpers.ts';

describe('moral y huida', () => {
  it('un golpe por la espalda quita más moral que uno de frente', () => {
    const g = flatGame();
    const w = g.world;
    const a = w.addUnit('spearman', 1, 20.5, 20.5), b = w.addUnit('spearman', 1, 22.5, 20.5);
    [a.fx, a.fy] = [1, 0];
    [b.fx, b.fy] = [1, 0];
    expect(flankSide(a, 21.5, 20.5)).toBe(0); // de frente
    expect(flankSide(a, 20.5, 21.5)).toBe(1); // de costado
    expect(flankSide(a, 19.5, 20.5)).toBe(2); // por la espalda
    hitMorale(w, a, 10, 0, 2, true);
    hitMorale(w, b, 10, 2, 2, true);
    expect(b.morale).toBeLessThan(a.morale);
  });

  it('los pueblos firmes pierden menos moral y los temibles la quiebran más rápido', () => {
    const g = flatGame(['romans', 'gauls']);
    const w = g.world;
    const roman = w.addUnit('spearman', 1, 20.5, 20.5), gaul = w.addUnit('spearman', 2, 24.5, 20.5);
    hitMorale(w, roman, 20, 0, 2, true); // golpe galo (miedo ×1,4) a un romano (firmeza ×1,35)
    hitMorale(w, gaul, 20, 0, 1, true); // golpe romano a un galo
    const g2 = flatGame(['gauls', 'gauls']);
    const u = g2.world.addUnit('spearman', 1, 20.5, 20.5);
    hitMorale(g2.world, u, 20, 0, 2, true);
    expect(100 - u.morale).toBeGreaterThan(100 - gaul.morale); // mismo golpe, sin firmeza
  });

  it('con moral 0 huye, no obedece, y se reagrupa cuando está a salvo', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('spearman', 1, 20.5, 20.5);
    startRout(w, u);
    expect(u.routing).toBeGreaterThan(0);
    expect(u.state).toBe('moving'); // corre hacia su ciudad
    expect(decodeUnit(encodeUnit({ id: 1, owner: 1, type: 'spearman', x: 1, y: 1, hp: 5, state: 'moving', morale: 0, rout: 1 })).rout).toBe(1);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 30.5, y: 30.5 });
    g.step();
    expect(u.routing).toBeGreaterThan(0); // la orden se ignora
    const secs = runUntil(g, () => u.routing === 0, 60);
    expect(secs).toBeGreaterThanOrEqual(ROUT_MIN_SECONDS - 0.2);
    expect(u.morale).toBeGreaterThanOrEqual(ROUT_RALLY);
    run(g, 20);
    expect(u.morale).toBeGreaterThan(ROUT_RALLY); // a salvo se sigue recuperando
  });

  it('los golpes de costado y por la espalda hacen más daño y bajan la moral', () => {
    const g = flatGame();
    const w = g.world;
    const hitFrom = (x: number, y: number) => {
      const def = w.addUnit('spearman', 2, 20.5, 20.5);
      [def.fx, def.fy] = [1, 0]; // mira al este
      const att = w.addUnit('warrior', 1, x, y);
      const stats = w.statsOf(att);
      strike(w, 1, stats.attack, stats.category, att, { kind: 'unit', unit: def }, att);
      const r = { dmg: w.statsOf(def).hp - def.hp, morale: def.morale };
      w.units.delete(def.id);
      w.units.delete(att.id);
      return r;
    };
    const front = hitFrom(21.3, 20.5), side = hitFrom(20.5, 21.3), rear = hitFrom(19.7, 20.5);
    expect(side.dmg).toBeGreaterThan(front.dmg);
    expect(rear.dmg).toBeGreaterThan(side.dmg);
    expect(rear.dmg / front.dmg).toBeCloseTo(REAR_DAMAGE, 0);
    expect(FLANK_DAMAGE).toBeGreaterThan(1);
    expect(rear.morale).toBeLessThan(side.morale);
    expect(side.morale).toBeLessThan(front.morale);
    expect(front.morale).toBeLessThan(100);
  });
});

describe('ariete', () => {
  it('no ataca soldados pero sí derriba edificios', () => {
    const g = flatGame();
    const w = g.world;
    const ram = w.addUnit('ram', 1, 30.5, 30.5);
    const foe = w.addUnit('warrior', 2, 31.5, 30.5);
    g.enqueue(1, { kind: 'attack', unitIds: [ram.id], targetId: foe.id });
    g.step();
    expect(ram.task).toBeNull();
    expect(w.players.get(1)!.notices.some((t) => t.includes('Rams only attack'))).toBe(true);
    w.units.delete(foe.id);
    const tc = [...w.buildings.values()].find((b) => b.owner === 2 && b.type === 'town_center')!;
    const hp0 = tc.hp;
    g.enqueue(1, { kind: 'attack', unitIds: [ram.id], targetId: tc.id });
    run(g, 20);
    expect(tc.hp).toBeLessThan(hp0 - 100);
  });
});
