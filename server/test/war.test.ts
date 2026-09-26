// Guerra al estilo Total War: marcha forzada sobre una ciudad enemiga, batalla por la
// ciudad (pública, con reloj), ciudad que cae y se saquea, ataque rechazado, tiempo
// agotado y retirada (los soldados vuelven a casa).
import { describe, expect, it } from 'vitest';
import { BATTLE_SECONDS, CITY_RADIUS, LOOT_SHARE, MARCH_MAX_SECONDS, TICK_RATE } from '../../shared/data.ts';
import { battleViews, cityOf, marchViews } from '../src/sim/war.ts';
import { flatGame, run, runUntil } from './helpers.ts';

/** Partida con 5 guerreros del jugador 1 cerca de su ciudad (el 2 está en (34.5, 34.5)). */
function setup() {
  const g = flatGame();
  const w = g.world;
  const army = Array.from({ length: 5 }, (_, i) => w.addUnit('warrior', 1, 9.5 + (i % 3), 9.5 + Math.floor(i / 3)));
  return { g, w, army };
}

describe('marcha forzada y batalla por una ciudad', () => {
  it('el ejército sale del mapa, el defensor recibe aviso y al llegar se despliega frente a la ciudad', () => {
    const { g, w, army } = setup();
    g.enqueue(1, { kind: 'march', unitIds: army.map((u) => u.id), target: 2 });
    g.step();
    expect(army.every((u) => !w.units.has(u.id))).toBe(true);
    expect(w.marches).toHaveLength(1);
    expect(marchViews(w, 2)).toHaveLength(1); // el defensor lo ve venir
    expect(w.players.get(2)!.notices.some((t) => t.includes('marches on your city'))).toBe(true);
    const secs = runUntil(g, () => w.battles.length > 0, MARCH_MAX_SECONDS + 2);
    expect(secs).toBeLessThanOrEqual(MARCH_MAX_SECONDS + 1);
    const city = cityOf(w, 2)!;
    const arrived = [...w.units.values()].filter((u) => u.owner === 1 && u.type === 'warrior');
    expect(arrived).toHaveLength(5);
    for (const u of arrived) expect(Math.hypot(u.x - city.x, u.y - city.y)).toBeLessThan(CITY_RADIUS + 6);
    const [b] = battleViews(w);
    expect(b).toMatchObject({ a: 1, d: 2 });
    expect(b.as).toBeGreaterThan(0);
    expect(w.news.some((n) => n.includes('Battle'))).toBe(true);
  });

  it('solo marchan soldados, y solo contra quien se está en guerra', () => {
    const { g, w } = setup();
    const worker = w.addUnit('worker', 1, 8.5, 8.5);
    g.enqueue(1, { kind: 'march', unitIds: [worker.id], target: 2 });
    g.step();
    expect(w.marches).toHaveLength(0);
    expect(w.units.has(worker.id)).toBe(true);
  });

  it('si el atacante destruye el Centro Urbano, la ciudad cae y se saquea', () => {
    const { g, w, army } = setup();
    g.enqueue(1, { kind: 'march', unitIds: army.map((u) => u.id), target: 2 });
    runUntil(g, () => w.battles.length > 0, MARCH_MAX_SECONDS + 2);
    const pd = w.players.get(2)!, pa = w.players.get(1)!;
    pd.resources = { food: 1000, wood: 1000, stone: 1000, metal: 1000 };
    const wood0 = pa.resources.wood;
    const tc = [...w.buildings.values()].find((b) => b.owner === 2 && b.type === 'town_center')!;
    tc.hp = 0;
    run(g, 1.1);
    expect(w.battles).toHaveLength(0);
    const r = w.battleResults.at(-1)!;
    expect(r).toMatchObject({ a: 1, d: 2, winner: 1, end: 'fallen' });
    expect(r.loot.wood).toBe(1000 * LOOT_SHARE);
    expect(pa.resources.wood).toBe(wood0 + 1000 * LOOT_SHARE);
    expect(pd.resources.wood).toBe(1000 - 1000 * LOOT_SHARE);
  });

  it('si el atacante se queda sin soldados, el ataque es rechazado', () => {
    const { g, w, army } = setup();
    g.enqueue(1, { kind: 'march', unitIds: army.map((u) => u.id), target: 2 });
    runUntil(g, () => w.battles.length > 0, MARCH_MAX_SECONDS + 2);
    for (const u of w.units.values()) if (u.owner === 1 && u.type === 'warrior') u.hp = 0;
    run(g, 20);
    const r = w.battleResults.at(-1)!;
    expect(r).toMatchObject({ winner: 2, end: 'repelled', al: 5 });
  });

  it('si se acaba el tiempo o se retira, el atacante vuelve a casa en marcha forzada', () => {
    for (const how of ['time', 'retreat'] as const) {
      const { g, w, army } = setup();
      g.enqueue(1, { kind: 'march', unitIds: army.map((u) => u.id), target: 2 });
      runUntil(g, () => w.battles.length > 0, MARCH_MAX_SECONDS + 2);
      const b = w.battles[0];
      expect(b.endTick - b.startTick).toBe(BATTLE_SECONDS * TICK_RATE);
      if (how === 'time') b.endTick = w.tick + 1;
      else g.enqueue(1, { kind: 'retreat', battleId: b.id });
      run(g, 1.1);
      expect(w.battleResults.at(-1)).toMatchObject({ winner: 2, end: how });
      expect(w.marches.filter((m) => m.home)).toHaveLength(1);
      runUntil(g, () => w.marches.length === 0, MARCH_MAX_SECONDS + 2);
      const home = cityOf(w, 1)!;
      const back = [...w.units.values()].filter((u) => u.owner === 1 && u.type === 'warrior');
      expect(back).toHaveLength(5);
      for (const u of back) expect(Math.hypot(u.x - home.x, u.y - home.y)).toBeLessThan(10);
    }
  });

  it('soldados enemigos que entran caminando a una ciudad también empiezan una batalla', () => {
    const { g, w } = setup();
    const city = cityOf(w, 2)!;
    w.addUnit('warrior', 1, city.x - 6, city.y - 6);
    run(g, 1.1);
    expect(battleViews(w)).toMatchObject([{ a: 1, d: 2 }]);
  });
});
