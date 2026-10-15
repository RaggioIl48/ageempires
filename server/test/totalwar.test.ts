// Batallas a lo Total War: regimientos, proyectiles que vuelan (escudos, fuego amigo, munición),
// choque de la carga, atacar-moviendo y cola de órdenes.
import { describe, expect, it } from 'vitest';
import { AMMO, KNOCKDOWN_SECONDS, REGIMENT_SIZE, TICK_RATE } from '../../shared/data.ts';
import { decodeUnit, encodeUnit } from '../../shared/codec.ts';
import { strike } from '../src/sim/combat.ts';
import { hasShield, updateProjectiles } from '../src/sim/projectiles.ts';
import { regimentMembers, regimentPanic } from '../src/sim/regiment.ts';
import { flatGame, run, runUntil } from './helpers.ts';

/** Deja caer ya todos los proyectiles en vuelo. */
function land(w: ReturnType<typeof flatGame>['world']): void {
  for (const p of w.projectiles) p.at = w.tick;
  updateProjectiles(w);
}

describe('regiments', () => {
  function barracksGame() {
    const g = flatGame();
    const w = g.world;
    const p = w.players.get(1)!;
    p.resources = { food: 99999, wood: 99999, stone: 99999, metal: 99999 };
    for (let i = 0; i < 5; i++) w.addBuilding('house', 1, 12 + i * 2, 12);
    const b = w.addBuilding('barracks', 1, 10, 4)!;
    return { g, w, b };
  }

  it('soldiers of the same type from one barracks fill a regiment, then a new one opens', () => {
    const { g, w, b } = barracksGame();
    const size = REGIMENT_SIZE.infantry!;
    for (let i = 0; i < size + 1; i++) g.enqueue(1, { kind: 'train', buildingId: b.id, unit: 'warrior' });
    runUntil(g, () => [...w.units.values()].filter((u) => u.type === 'warrior').length >= size + 1, 600);
    const warriors = [...w.units.values()].filter((u) => u.type === 'warrior').sort((a, b2) => a.id - b2.id);
    expect(warriors.length).toBe(size + 1);
    const first = warriors[0].reg;
    expect(first).toBeGreaterThan(0);
    expect(regimentMembers(w, first)).toHaveLength(size);
    expect(warriors[size].reg).not.toBe(first); // el noveno abre otro regimiento
  });

  it('the regiment number travels to the client', () => {
    const { w } = barracksGame();
    const u = w.addUnit('warrior', 1, 8, 8);
    u.reg = 4242;
    const v = decodeUnit(encodeUnit({ id: u.id, owner: 1, type: 'warrior', x: 8, y: 8, hp: 10, state: 'idle', rg: 4242, am: 50, dn: 1 }));
    expect(v.rg).toBe(4242);
    expect(v.am).toBe(50);
    expect(v.dn).toBe(1);
  });

  it('when part of a regiment routs, the rest wavers (shared panic)', () => {
    const g = flatGame();
    const w = g.world;
    const reg = w.addUnit('warrior', 1, 8, 8);
    const mates = [reg, ...Array.from({ length: 5 }, (_, i) => w.addUnit('warrior', 1, 8 + i * 0.6, 9))];
    for (const m of mates) m.reg = 777;
    const alone = w.addUnit('warrior', 1, 20, 20); // otro regimiento: no se contagia
    alone.reg = 778;
    mates[0].routing = 80;
    mates[1].routing = 80;
    mates[2].routing = 80; // la mitad huye
    for (let i = 0; i < 10; i++) regimentPanic(w, 0.1);
    expect(mates[4].morale).toBeLessThan(100);
    expect(alone.morale).toBe(100);
  });
});

describe('projectiles fly, shields block, ammo runs out', () => {
  it('an arrow hurts when it lands, not when it is shot', () => {
    const g = flatGame();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 10.5, 10.5);
    const foe = w.addUnit('archer', 2, 15.5, 10.5);
    const st = w.statsOf(archer);
    const hp0 = foe.hp;
    strike(w, 1, st.attack, st.category, archer, { kind: 'unit', unit: foe }, archer);
    expect(foe.hp).toBe(hp0); // todavía vuela
    expect(w.projectiles).toHaveLength(1);
    expect(w.projectiles[0].at).toBeGreaterThan(w.tick);
    expect(w.events.some((e) => e.k === 'shot' && (e.ms ?? 0) > 0)).toBe(true);
    land(w);
    expect(foe.hp).toBeLessThan(hp0);
  });

  it('if the target dodges, the arrow can hit whoever is there — even a friend', () => {
    const g = flatGame();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 10.5, 10.5);
    const foe = w.addUnit('archer', 2, 15.5, 10.5);
    const st = w.statsOf(archer);
    strike(w, 1, st.attack, st.category, archer, { kind: 'unit', unit: foe }, archer);
    const p = w.projectiles[0];
    foe.x += 5; // se fue
    const friend = w.addUnit('archer', 1, p.x, p.y); // un compañero quedó justo ahí
    const hp0 = friend.hp;
    land(w);
    expect(friend.hp).toBeLessThan(hp0);
  });

  it('a shield facing the archer stops much of the damage', () => {
    const shot = (facingShooter: boolean) => {
      const g = flatGame();
      const w = g.world;
      const archer = w.addUnit('archer', 1, 10.5, 10.5);
      const foe = w.addUnit('spearman', 2, 15.5, 10.5);
      expect(hasShield('spearman')).toBe(true);
      [foe.fx, foe.fy] = facingShooter ? [-1, 0] : [1, 0];
      const st = w.statsOf(archer);
      const hp0 = foe.hp;
      strike(w, 1, st.attack, st.category, archer, { kind: 'unit', unit: foe }, archer);
      w.projectiles[0].x = foe.x;
      w.projectiles[0].y = foe.y;
      land(w);
      return hp0 - foe.hp;
    };
    expect(shot(true)).toBeLessThan(shot(false));
  });

  it('archers run out of arrows, stop shooting, and refill near their own barracks', () => {
    const g = flatGame();
    const w = g.world;
    const archer = w.addUnit('archer', 1, 20.5, 20.5);
    expect(archer.ammo).toBe(AMMO);
    const foe = w.addUnit('spearman', 2, 24.5, 20.5);
    foe.hp = 1e6; // no cae: el arquero tira hasta quedarse sin flechas
    foe.down = 1e9; // y no se acerca a pelear
    g.enqueue(1, { kind: 'attack', unitIds: [archer.id], targetId: foe.id });
    runUntil(g, () => archer.ammo === 0, 300);
    expect(archer.ammo).toBe(0);
    run(g, 3);
    expect(archer.task).toBeNull(); // sin flechas no sigue tirando
    // Cerca del Centro Urbano propio recupera munición.
    w.units.delete(foe.id);
    archer.x = 6.5;
    archer.y = 8.5;
    run(g, 5);
    expect(archer.ammo).toBeGreaterThan(0);
  });
});

describe('cavalry charge impact', () => {
  it('a charge knocks the target down and pushes it back; it gets up after a moment', () => {
    const g = flatGame();
    const w = g.world;
    const rider = w.addUnit('knight', 1, 10, 10);
    const foe = w.addUnit('swordsman', 2, 10.8, 10);
    const others = [w.addUnit('swordsman', 2, 11.4, 10.4), w.addUnit('swordsman', 2, 11.4, 9.6)];
    const x0 = foe.x;
    const st = w.statsOf(rider);
    w.tick = 1000; // lleva rato sin pelear: carga
    strike(w, 1, st.attack, st.category, rider, { kind: 'unit', unit: foe }, rider);
    expect(foe.down).toBeGreaterThan(0);
    expect(foe.x).toBeGreaterThan(x0);
    expect(others.some((o) => o.down > 0)).toBe(true); // arrolló a otro
    run(g, KNOCKDOWN_SECONDS + 0.5);
    expect(foe.down).toBe(0);
  });
});

describe('attack-move and queued orders', () => {
  it('attack-move: fights what it meets on the way, then carries on to its post', () => {
    const g = flatGame();
    const w = g.world;
    const us = [w.addUnit('swordsman', 1, 8.5, 20.5), w.addUnit('swordsman', 1, 8.5, 21.5)];
    const foe = w.addUnit('worker', 2, 16.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: us.map((u) => u.id), x: 28, y: 21, amove: true });
    const fought = runUntil(g, () => us.some((u) => u.task?.kind === 'attack'), 30);
    expect(fought).toBeLessThan(30);
    runUntil(g, () => !w.units.has(foe.id), 60);
    expect(w.units.has(foe.id)).toBe(false);
    runUntil(g, () => us.every((u) => u.x > 25), 60);
    expect(us.every((u) => u.x > 25)).toBe(true);
  });

  it('a plain move walks past enemies (does not stop to fight)', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('swordsman', 1, 8.5, 20.5);
    w.addUnit('worker', 2, 16.5, 22.5);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 28, y: 20.5 });
    run(g, 2);
    expect(u.task).toBeNull();
  });

  it('Shift-queued moves are done one after the other', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('swordsman', 1, 10.5, 10.5);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 20, y: 10.5 });
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 20, y: 20, queue: true });
    run(g, 0.2);
    expect(u.orders).toHaveLength(1);
    runUntil(g, () => Math.hypot(u.x - 20, u.y - 10.5) < 1, 30);
    runUntil(g, () => Math.hypot(u.x - 20, u.y - 20) < 1, 30);
    expect(Math.hypot(u.x - 20, u.y - 20)).toBeLessThan(1);
    expect(u.orders).toHaveLength(0);
  });

  it('a new (non-queued) order cancels the queue', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('swordsman', 1, 10.5, 10.5);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 20, y: 10.5 });
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: 20, y: 20, queue: true });
    run(g, 0.2);
    g.enqueue(1, { kind: 'stop', unitIds: [u.id] });
    run(g, 0.2);
    expect(u.orders).toHaveLength(0);
    expect(TICK_RATE).toBe(10);
  });
});
