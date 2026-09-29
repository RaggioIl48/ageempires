// Batallas tácticas (Total War): líneas que no se deshacen, cansancio y asedios.
import { describe, expect, it } from 'vitest';
import { CLIMB_DAMAGE_TAKEN, FATIGUE_TIERS, MARCH_MAX_SECONDS, MARCH_STAMINA, SIEGE_SECONDS, TICK_RATE } from '../../shared/data.ts';
import { strike } from '../src/sim/combat.ts';
import { fatigueOf } from '../src/sim/fatigue.ts';
import { battleViews } from '../src/sim/war.ts';
import { flatGame, run, runUntil } from './helpers.ts';

type W = ReturnType<typeof flatGame>['world'];

/** Dos líneas de 10 frente a frente (jugador 1 en y = 16.5, jugador 2 en y = 22.5). */
function lines(w: W) {
  const A = Array.from({ length: 10 }, (_, i) => w.addUnit('spearman', 1, 15 + i * 0.9, 16.5));
  const B = Array.from({ length: 10 }, (_, i) => w.addUnit('warrior', 2, 15 + i * 0.9, 22.5));
  for (const u of A) [u.fx, u.fy] = [0, 1];
  for (const u of B) [u.fx, u.fy] = [0, -1];
  return { A, B };
}
const depth = (w: W, L: { id: number; y: number }[]) => {
  const a = L.filter((u) => w.units.has(u.id));
  const my = a.reduce((s, u) => s + u.y, 0) / a.length;
  return Math.sqrt(a.reduce((s, u) => s + (u.y - my) ** 2, 0) / a.length);
};

describe('batallas ordenadas', () => {
  it('al ordenar atacar a una unidad, la línea se reparte entre los enemigos de esa formación', () => {
    const g = flatGame();
    const w = g.world;
    const { A, B } = lines(w);
    g.enqueue(2, { kind: 'attack', unitIds: B.map((u) => u.id), targetId: A[4].id });
    g.step();
    const targets = new Map<number, number>();
    for (const u of B) if (u.task?.kind === 'attack') targets.set(u.task.targetId, (targets.get(u.task.targetId) ?? 0) + 1);
    expect(Math.max(...targets.values())).toBeLessThanOrEqual(2);
    expect(targets.size).toBeGreaterThanOrEqual(8);
  });

  it('las dos líneas chocan y siguen siendo líneas (no una bola)', () => {
    const g = flatGame();
    const w = g.world;
    const { A, B } = lines(w);
    g.enqueue(2, { kind: 'attack', unitIds: B.map((u) => u.id), targetId: A[4].id });
    run(g, 12);
    expect(depth(w, A)).toBeLessThan(0.6);
    expect(depth(w, B)).toBeLessThan(0.6);
  });

  it('la tropa que llega en formación mantiene su puesto: no sale a perseguir lo que ve de lejos', () => {
    const g = flatGame();
    const w = g.world;
    const units = Array.from({ length: 4 }, (_, i) => w.addUnit('spearman', 1, 10.5 + i, 10.5));
    g.enqueue(1, { kind: 'move', unitIds: units.map((u) => u.id), x: 15, y: 15, formation: 'line' });
    run(g, 8);
    expect(units.every((u) => u.hold)).toBe(true);
    w.addUnit('warrior', 2, 15, 19.5); // a unas 4 casillas
    run(g, 2);
    expect(units.every((u) => u.task === null)).toBe(true);
    // Una orden suelta la libera.
    g.enqueue(1, { kind: 'move', unitIds: [units[0].id], x: 12, y: 12 });
    g.step();
    expect(units[0].hold).toBe(false);
  });
});

describe('cansancio', () => {
  it('correr cansa, al paso en formación se cansa menos, y descansando se recupera', () => {
    const g = flatGame();
    const w = g.world;
    const runner = w.addUnit('spearman', 1, 8.5, 12.5);
    const pair = [w.addUnit('spearman', 1, 8.5, 20.5), w.addUnit('spearman', 1, 8.5, 21.5)];
    g.enqueue(1, { kind: 'move', unitIds: [runner.id], x: 30.5, y: 12.5 });
    g.enqueue(1, { kind: 'move', unitIds: pair.map((u) => u.id), x: 30.5, y: 21, formation: 'line' });
    run(g, 6);
    expect(runner.stamina).toBeLessThan(100);
    expect(pair[0].stamina).toBeGreaterThan(runner.stamina);
    const tired = runner.stamina;
    runUntil(g, () => runner.state === 'idle', 30);
    const atStop = runner.stamina;
    run(g, 5);
    expect(runner.stamina).toBeGreaterThan(atStop);
    expect(tired).toBeLessThan(100);
  });

  it('cansado camina más lento y pega más flojo', () => {
    expect(fatigueOf(10).speed).toBeLessThan(fatigueOf(100).speed);
    expect(fatigueOf(10).attack).toBeLessThan(1);
    expect(fatigueOf(10).name).toBe(FATIGUE_TIERS[FATIGUE_TIERS.length - 1].name);
    const g = flatGame();
    const w = g.world;
    const hit = (stamina: number) => {
      const foe = w.addUnit('spearman', 2, 30.5, 30.5);
      const att = w.addUnit('warrior', 1, 31.3, 30.5);
      att.stamina = stamina;
      [foe.fx, foe.fy] = [1, 0];
      const st = w.statsOf(att);
      strike(w, 1, st.attack, st.category, att, { kind: 'unit', unit: foe }, att);
      const d = w.statsOf(foe).hp - foe.hp;
      w.units.delete(foe.id);
      w.units.delete(att.id);
      return d;
    };
    expect(hit(5)).toBeLessThan(hit(100));
  });

  it('después de una marcha forzada, el ejército llega cansado', () => {
    const g = flatGame();
    const w = g.world;
    const army = Array.from({ length: 3 }, (_, i) => w.addUnit('warrior', 1, 9.5 + i, 9.5));
    g.enqueue(1, { kind: 'march', unitIds: army.map((u) => u.id), target: 2 });
    runUntil(g, () => w.battles.length > 0, MARCH_MAX_SECONDS + 2);
    const arrived = [...w.units.values()].filter((u) => u.owner === 1 && u.type === 'warrior');
    expect(arrived.length).toBe(3);
    for (const u of arrived) expect(u.stamina).toBeLessThanOrEqual(MARCH_STAMINA + 1);
  });
});

describe('asedios', () => {
  /** Muralla del jugador 2 de norte a sur en x = 26 (con una puerta en y = 30), frente a su ciudad. */
  function walled() {
    const g = flatGame();
    const w = g.world;
    for (let y = 24; y < 40; y++) w.addBuilding(y === 30 ? 'gate' : 'wall', 2, 26, y);
    return { g, w };
  }

  it('los soldados de a pie suben a su propia muralla; el enemigo, sin batalla, no; la caballería, nunca', () => {
    const { g, w } = walled();
    const archer = w.addUnit('archer', 2, 27.5, 26.5);
    const horse = w.addUnit('scout', 2, 27.5, 27.5);
    const foe = w.addUnit('spearman', 1, 24.5, 26.5);
    g.enqueue(2, { kind: 'move', unitIds: [archer.id], x: 26.5, y: 26.5 });
    g.enqueue(2, { kind: 'move', unitIds: [horse.id], x: 26.5, y: 27.5 });
    g.enqueue(1, { kind: 'move', unitIds: [foe.id], x: 26.5, y: 26.5 });
    run(g, 6);
    expect(w.onWall(archer)).toBe(1);
    expect(w.onWall(horse)).toBe(0);
    expect(w.onWall(foe)).toBe(0);
  });

  it('clic derecho en la muralla propia: los soldados de a pie se reparten por ella, uno por tramo', () => {
    const { g, w } = walled();
    const squad = Array.from({ length: 4 }, (_, i) => w.addUnit(i % 2 ? 'archer' : 'spearman', 2, 29.5, 26.5 + i));
    g.enqueue(2, { kind: 'move', unitIds: squad.map((u) => u.id), x: 26.5, y: 27.5 });
    run(g, 10);
    expect(squad.every((u) => w.onWall(u) === 1)).toBe(true);
    expect(new Set(squad.map((u) => Math.floor(u.y))).size).toBe(4); // cada uno en su tramo
    expect(squad.every((u) => u.hold)).toBe(true);
  });

  it('desde la muralla se pega más fuerte y las almenas cubren de las flechas', () => {
    const { w } = walled();
    const shoot = (defenderOnWall: boolean) => {
      const def = w.addUnit('archer', 2, defenderOnWall ? 26.5 : 28.5, 26.5);
      const att = w.addUnit('archer', 1, 22.5, 26.5);
      const st = w.statsOf(att);
      strike(w, 1, st.attack, st.category, att, { kind: 'unit', unit: def }, att);
      const taken = w.statsOf(def).hp - def.hp;
      const ds = w.statsOf(def);
      const foe = w.addUnit('spearman', 1, 22.5, 28.5);
      strike(w, 2, ds.attack, ds.category, def, { kind: 'unit', unit: foe }, def);
      const dealt = w.statsOf(foe).hp - foe.hp;
      for (const u of [def, att, foe]) w.units.delete(u.id);
      return { taken, dealt };
    };
    const onWall = shoot(true), ground = shoot(false);
    expect(onWall.taken).toBeLessThan(ground.taken);
    expect(onWall.dealt).toBeGreaterThan(ground.dealt);
  });

  it('en una batalla de asedio (más larga) la infantería atacante trepa con escalas, lenta y expuesta', () => {
    const { g, w } = walled();
    const army = Array.from({ length: 4 }, (_, i) => w.addUnit('spearman', 1, 22.5, 26.5 + i));
    g.enqueue(1, { kind: 'move', unitIds: army.map((u) => u.id), x: 29, y: 27 });
    runUntil(g, () => w.battles.length > 0, 20);
    const b = w.battles[0];
    expect(b.siege).toBe(true);
    expect((b.endTick - b.startTick) / TICK_RATE).toBe(SIEGE_SECONDS);
    expect(battleViews(w)[0].siege).toBe(1);
    // Con la batalla en curso, la muralla enemiga se puede escalar.
    w.walker = 1;
    w.walkerFoot = true;
    expect(w.isWalkable(26, 26)).toBe(true);
    w.walkerFoot = false;
    expect(w.isWalkable(26, 26)).toBe(false);
    // El que trepa recibe más daño.
    const climber = w.addUnit('spearman', 1, 26.5, 25.5);
    climber.climb = 20; // recién empieza a trepar
    expect(w.onWall(climber)).toBe(2);
    const def = w.addUnit('spearman', 2, 27.3, 25.5);
    const st = w.statsOf(def);
    strike(w, 2, st.attack, st.category, def, { kind: 'unit', unit: climber }, def);
    const onLadder = w.statsOf(climber).hp - climber.hp;
    const ground = w.addUnit('spearman', 1, 20.5, 35.5);
    const def2 = w.addUnit('spearman', 2, 21.3, 35.5);
    strike(w, 2, st.attack, st.category, def2, { kind: 'unit', unit: ground }, def2);
    expect(onLadder).toBeGreaterThanOrEqual(Math.floor((w.statsOf(ground).hp - ground.hp) * CLIMB_DAMAGE_TAKEN) - 1);
    expect(onLadder).toBeGreaterThan(w.statsOf(ground).hp - ground.hp);
  });
});
