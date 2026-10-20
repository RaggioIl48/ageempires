// Caballos con peso (Total War): arrancan de a poco, giran en arco y la carga atraviesa la línea.
import { describe, expect, it } from 'vitest';
import { CAV_START_SPEED, CAV_TURN_DEG, TICK_RATE } from '../../shared/data.ts';
import { flatGame, run, runUntil } from './helpers.ts';

describe('cavalry with weight', () => {
  it('starts slowly and reaches full speed in about a second; infantry does not', () => {
    const g = flatGame();
    const w = g.world;
    const k = w.addUnit('knight', 1, 10.5, 20.5);
    const s = w.addUnit('swordsman', 1, 10.5, 24.5);
    g.enqueue(1, { kind: 'move', unitIds: [k.id], x: 30.5, y: 20.5 });
    g.enqueue(1, { kind: 'move', unitIds: [s.id], x: 30.5, y: 24.5 });
    g.step();
    const k0 = k.x, s0 = s.x;
    g.step();
    const kFirst = k.x - k0, sFirst = s.x - s0;
    run(g, 2);
    const k1 = k.x;
    g.step();
    const kLater = k.x - k1;
    const full = (w.statsOf(k).speed * 1) / TICK_RATE;
    expect(kFirst).toBeLessThan(full * (CAV_START_SPEED + 0.25));
    expect(kLater).toBeGreaterThan(full * 0.95);
    expect(sFirst).toBeCloseTo(w.statsOf(s).speed / TICK_RATE, 2); // a pie: sin arranque
  });

  it('turns in an arc: a half turn takes several steps and costs speed', () => {
    const g = flatGame();
    const w = g.world;
    const k = w.addUnit('knight', 1, 20.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [k.id], x: 34.5, y: 20.5 });
    run(g, 2); // al galope hacia el Este
    expect(k.fx).toBeCloseTo(1, 1);
    g.enqueue(1, { kind: 'move', unitIds: [k.id], x: 5.5, y: 20.5 }); // media vuelta
    g.step();
    g.step();
    const turned = Math.abs(Math.atan2(k.fy, k.fx));
    expect(turned).toBeLessThanOrEqual(((CAV_TURN_DEG * Math.PI) / 180 / TICK_RATE) * 2 + 1e-6);
    expect(k.momentum).toBeLessThan(0.5); // dar la vuelta le cuesta el impulso
    run(g, 2);
    expect(k.fx).toBeLessThan(-0.9); // y termina mirando al Oeste
  });

  it('a charge goes through the line instead of stopping dead, then turns back', () => {
    const g = flatGame();
    const w = g.world;
    const k = w.addUnit('knight', 1, 15.5, 20.5);
    const foe = w.addUnit('swordsman', 2, 18.5, 20.5);
    foe.cooldown = 999;
    g.enqueue(1, { kind: 'attack', unitIds: [k.id], targetId: foe.id });
    const hp0 = foe.hp;
    runUntil(g, () => foe.hp < hp0, 10);
    expect(k.passUntil).toBeGreaterThan(w.tick);
    run(g, 1.5);
    expect(k.x).toBeGreaterThan(foe.x + 0.8); // pasó del otro lado
    const hp1 = foe.hp;
    runUntil(g, () => foe.hp < hp1, 10);
    expect(foe.hp).toBeLessThan(hp1); // y volvió a pelear
  });

  it('braced spears in front stop the charge: no going through', () => {
    const g = flatGame();
    const w = g.world;
    const k = w.addUnit('knight', 1, 15.5, 20.5);
    const spear = w.addUnit('spearman', 2, 18.5, 20.5);
    spear.fx = -1;
    spear.fy = 0;
    spear.cooldown = 999;
    g.enqueue(1, { kind: 'attack', unitIds: [k.id], targetId: spear.id });
    const hp0 = spear.hp, kh0 = k.hp;
    runUntil(g, () => spear.hp < hp0 || k.hp < kh0, 10);
    expect(k.passUntil).toBeLessThanOrEqual(w.tick);
    run(g, 1);
    expect(k.x).toBeLessThan(spear.x);
  });
});
