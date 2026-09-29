// El General (héroe) de cada ejército: uno por jugador, aura de moral y habilidades con espera.
import { describe, expect, it } from 'vitest';
import { ABILITIES, GENERAL_DEATH_MORALE, TICK_RATE } from '../../shared/data.ts';
import { decodeEvent, decodeUnit, encodeEvent, encodeUnit } from '../../shared/codec.ts';
import { strike } from '../src/sim/combat.ts';
import { hitMorale, startRout } from '../src/sim/morale.ts';
import { flatGame, newGame, run } from './helpers.ts';

const generalOf = (w: ReturnType<typeof flatGame>['world'], owner: number) =>
  [...w.units.values()].find((u) => u.owner === owner && u.type === 'general');

describe('el General', () => {
  it('cada jugador empieza con uno y no puede tener dos; si cae, puede entrenar otro', () => {
    const g = newGame(2);
    const w = g.world;
    for (const id of [1, 2]) expect(generalOf(w, id)).toBeDefined();
    const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
    w.players.get(1)!.resources = { food: 1000, wood: 1000, stone: 1000, metal: 1000 };
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'general' });
    g.step();
    expect(tc.queue).toHaveLength(0);
    expect(w.players.get(1)!.notices.some((t) => t.includes('already have a General'))).toBe(true);
    generalOf(w, 1)!.hp = 0;
    g.step();
    expect(w.players.get(1)!.notices.some((t) => t.includes('General has fallen'))).toBe(true);
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'general' });
    g.step();
    expect(tc.queue.map((q) => q.unit)).toEqual(['general']);
  });

  it('su aura hace que los soldados cercanos pierdan menos moral', () => {
    const g = flatGame();
    const w = g.world;
    const near = w.addUnit('spearman', 1, 10.5, 10.5);
    const far = w.addUnit('spearman', 1, 30.5, 30.5);
    w.addUnit('general', 1, 11.5, 10.5);
    hitMorale(w, near, 20, 0, 2, true);
    hitMorale(w, far, 20, 0, 2, true);
    expect(100 - near.morale).toBeLessThan(100 - far.morale);
  });

  it('Inspire: reagrupa a los que huyen, devuelve moral y da más daño; luego hay que esperar', () => {
    const g = flatGame();
    const w = g.world;
    const gen = w.addUnit('general', 1, 20.5, 20.5);
    const fleeing = w.addUnit('spearman', 1, 22.5, 20.5);
    const tired = w.addUnit('warrior', 1, 20.5, 22.5);
    tired.morale = 30;
    startRout(w, fleeing);
    g.enqueue(1, { kind: 'ability', unitIds: [gen.id], ability: 'inspire' });
    g.step();
    expect(fleeing.routing).toBe(0);
    expect(fleeing.morale).toBeGreaterThanOrEqual(50);
    expect(tired.morale).toBeGreaterThanOrEqual(69);
    expect(tired.buff).toBe(1);
    expect(w.events.some((e) => e.k === 'ability')).toBe(true);

    // Daño: el inspirado pega un 25 % más.
    const hit = (buffed: boolean) => {
      const foe = w.addUnit('spearman', 2, 40.5, 40.5);
      const att = w.addUnit('warrior', 1, 41.3, 40.5);
      att.buff = buffed ? 1 : 0;
      att.buffUntil = w.tick + 100;
      [foe.fx, foe.fy] = [1, 0];
      const st = w.statsOf(att);
      strike(w, 1, st.attack, st.category, att, { kind: 'unit', unit: foe }, att);
      const d = w.statsOf(foe).hp - foe.hp;
      w.units.delete(foe.id);
      w.units.delete(att.id);
      return d;
    };
    expect(hit(true)).toBeGreaterThan(hit(false));

    // Espera: no se puede repetir enseguida.
    g.enqueue(1, { kind: 'ability', unitIds: [gen.id], ability: 'inspire' });
    g.step();
    expect(w.players.get(1)!.notices.some((t) => t.startsWith('Inspire: ready in'))).toBe(true);
    // El efecto se acaba.
    run(g, ABILITIES.inspire.seconds + 1);
    expect(tired.buff).toBe(0);
  });

  it('Hold the Line: más armadura y mucha menos moral perdida', () => {
    const g = flatGame();
    const w = g.world;
    const gen = w.addUnit('general', 1, 20.5, 20.5);
    const held = w.addUnit('spearman', 1, 21.5, 20.5);
    const alone = w.addUnit('spearman', 1, 35.5, 35.5);
    g.enqueue(1, { kind: 'ability', unitIds: [gen.id], ability: 'hold' });
    g.step();
    expect(held.buff).toBe(2);
    hitMorale(w, held, 20, 0, 2, true);
    hitMorale(w, alone, 20, 0, 2, true);
    expect(100 - held.morale).toBeLessThan((100 - alone.morale) * 0.5);
    const hitOn = (u: typeof held) => {
      const hp0 = u.hp;
      const att = w.addUnit('warrior', 2, u.x + 0.8, u.y);
      const st = w.statsOf(att);
      strike(w, 2, st.attack, st.category, att, { kind: 'unit', unit: u }, att);
      w.units.delete(att.id);
      return hp0 - u.hp;
    };
    [held.fx, held.fy] = [1, 0];
    [alone.fx, alone.fy] = [1, 0];
    expect(hitOn(held)).toBeLessThan(hitOn(alone));
  });

  it('si cae el General, los suyos cercanos pierden mucha moral; él no huye', () => {
    const g = flatGame();
    const w = g.world;
    const gen = w.addUnit('general', 1, 20.5, 20.5);
    const s = w.addUnit('spearman', 1, 22.5, 20.5);
    hitMorale(w, gen, 200, 2, 2, true);
    expect(gen.routing).toBe(0);
    gen.hp = 0;
    g.step();
    expect(s.morale).toBeLessThanOrEqual(100 - GENERAL_DEATH_MORALE / 1.35 + 1); // romanos: firmeza 1,35
  });

  it('la red lleva el efecto, las esperas y el aviso de la habilidad', () => {
    const v = decodeUnit(encodeUnit({ id: 3, owner: 1, type: 'general', x: 1, y: 2, hp: 200, state: 'idle', buff: 2, cd: [12, 0] }));
    expect(v.buff).toBe(2);
    expect(v.cd).toEqual([12, 0]);
    expect(decodeEvent(encodeEvent({ k: 'ability', x: 3, y: 4, a: 2, r: 8 }))).toEqual({ k: 'ability', x: 3, y: 4, a: 2, r: 8 });
    expect(TICK_RATE).toBeGreaterThan(0);
  });
});
