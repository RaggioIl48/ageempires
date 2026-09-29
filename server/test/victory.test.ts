// Condiciones de victoria (Total War): conquista de la capital, último en pie o última alianza,
// Colina Sagrada y Gloria al acabarse el tiempo.
import { describe, expect, it } from 'vitest';
import { HILL_HOLD_SECONDS, TICK_RATE } from '../../shared/data.ts';
import { buildFrame, ClientSync } from '../src/net/sync.ts';
import { decideByGlory, gloryOf, victoryView } from '../src/sim/victory.ts';
import { flatGame, newGame, run } from './helpers.ts';

const tcOf = (w: ReturnType<typeof flatGame>['world'], owner: number) =>
  [...w.buildings.values()].find((b) => b.owner === owner && b.type === 'town_center')!;

describe('victoria', () => {
  it('quien pierde su capital pierde su imperio, y el último en pie gana', () => {
    const g = flatGame();
    const w = g.world;
    w.addUnit('warrior', 2, 30.5, 30.5);
    w.addBuilding('house', 2, 28, 28);
    g.step();
    const tc2 = tcOf(w, 2);
    // El jugador 1 le da el último golpe a la capital.
    const att = w.addUnit('warrior', 1, tc2.tx - 0.5, tc2.ty + 1);
    tc2.hp = 1;
    g.enqueue(1, { kind: 'attack', unitIds: [att.id], targetId: tc2.id });
    run(g, 3);
    const p2 = w.players.get(2)!;
    expect(p2.defeated).toBe(true);
    expect([...w.units.values()].some((u) => u.owner === 2)).toBe(false); // tropas rendidas
    expect([...w.buildings.values()].some((b) => b.owner === 2)).toBe(false); // ruinas
    expect(w.players.get(1)!.conquered).toBe(1);
    expect(w.outcome?.winners).toEqual([1]);
    expect(w.outcome?.reason).toContain('conquered');
    expect(w.news.some((n) => n.includes('empire has fallen'))).toBe(true);
    expect(victoryView(w).defeated).toEqual([2]);
  });

  it('una alianza gana junta cuando no queda ningún rival', () => {
    const g = flatGame();
    const w = g.world;
    w.addPlayer(3, 'Tres', '#2fa84f', { x: 5, y: 34 });
    w.addBuilding('town_center', 3, 4, 33);
    w.setRelation(1, 3, 'ally');
    g.step();
    expect(w.outcome).toBeNull();
    w.removeBuilding(tcOf(w, 2).id);
    g.step();
    expect(w.outcome?.winners.sort()).toEqual([1, 3]);
    expect(w.outcome?.reason).toContain('alliance');
  });

  it('Colina Sagrada: se toma con 3 soldados desde la Edad Media; con un enemigo cerca queda disputada', () => {
    const g = newGame(2);
    const w = g.world;
    const h = w.hill!;
    const put = (owner: number, n: number) => Array.from({ length: n }, (_, i) => w.addUnit('spearman', owner, h.x - 1 + i * 0.8, h.y));
    put(1, 3);
    g.step();
    expect(h.holder).toBe(0); // Edad Tribal: todavía no cuenta
    w.players.get(1)!.era = 2;
    g.step();
    expect(h.holder).toBe(1);
    const t0 = w.players.get(1)!.hillTicks;
    run(g, 2);
    expect(w.players.get(1)!.hillTicks).toBeGreaterThan(t0);
    const foe = put(2, 1)[0];
    g.step();
    expect(h.contested).toBe(true);
    expect(h.holder).toBe(0);
    w.units.delete(foe.id);
    // Casi 5 minutos: al completar el tiempo, gana.
    w.players.get(1)!.hillTicks = HILL_HOLD_SECONDS * TICK_RATE - 2;
    run(g, 1);
    expect(w.outcome?.winners).toEqual([1]);
    expect(w.outcome?.reason).toContain('Sacred Hill');
    expect(victoryView(w).hill?.held[0][0]).toBe(1);
  });

  it('al acabarse el tiempo gana quien tiene más Gloria', () => {
    const g = flatGame();
    const w = g.world;
    w.players.get(2)!.kills = 40;
    expect(gloryOf(w, 2)).toBeGreaterThan(gloryOf(w, 1));
    const r = decideByGlory(w);
    expect(r.winners).toEqual([2]);
    expect(r.reason).toContain('glory');
    expect(g.summary().find((p) => p.id === 2)!.glory).toBe(gloryOf(w, 2));
  });

  it('quien cae ya no tiene niebla: puede mirar el resto de la partida', () => {
    const g = flatGame();
    const w = g.world;
    g.enableFog();
    w.addUnit('scout', 1, 20.5, 20.5); // lejos de todo lo del jugador 2
    w.removeBuilding(tcOf(w, 2).id);
    w.players.get(2)!.hadCapital = true;
    g.step();
    expect(w.players.get(2)!.defeated).toBe(true);
    const sync = new ClientSync(2);
    const f = buildFrame(g, 0);
    sync.collect(f);
    const msg = sync.build(f, g);
    expect((msg.u ?? []).length).toBe([...w.units.values()].length); // ve todas las tropas
  });
});
