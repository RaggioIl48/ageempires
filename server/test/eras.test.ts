// Phase 5: eras, technologies, advanced units, towers, walls and gates, aircraft.
import { describe, expect, it } from 'vitest';
import { decodeBuilding, encodeBuilding } from '../../shared/codec.ts';
import { BUILDING_DEFS, TECH_DEFS, UNIT_DEFS, unitAvailable, type TechId, type UnitType } from '../../shared/data.ts';
import { parseClientMessage } from '../../shared/protocol.ts';
import { buildingMaxHp, carryCapacity, damage, gatherRate, techBit, unitStats } from '../../shared/stats.ts';
import { ClientSync, buildFrame } from '../src/net/sync.ts';
import { initRelations } from '../src/sim/diplomacy.ts';
import { completeTech } from '../src/sim/production.ts';
import { flatGame, run, runUntil } from './helpers.ts';

const RICH = { food: 9999, wood: 9999, stone: 9999, metal: 9999 };

function richGame() {
  const g = flatGame();
  const w = g.world;
  w.players.get(1)!.resources = { ...RICH };
  w.players.get(2)!.resources = { ...RICH };
  const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
  return { g, w, tc };
}

const research = (g: ReturnType<typeof flatGame>, buildingId: number, tech: TechId) =>
  g.enqueue(1, { kind: 'research', buildingId, tech });
const train = (g: ReturnType<typeof flatGame>, buildingId: number, unit: UnitType) =>
  g.enqueue(1, { kind: 'train', buildingId, unit });

describe('eras', () => {
  it('everyone starts in the Tribal Era with no technologies', () => {
    const { w } = richGame();
    expect(w.players.get(1)!.era).toBe(1);
    expect(w.players.get(1)!.techs).toBe(0);
  });

  it('advancing to the Medieval Era needs a finished barracks, charges the cost and takes its time', () => {
    const { g, w, tc } = richGame();
    research(g, tc.id, 'era2');
    g.step();
    expect(tc.queue).toHaveLength(0);
    expect(g.takeNotices(1).some((n) => n.includes('Barracks'))).toBe(true);
    expect(w.players.get(1)!.resources).toEqual(RICH);

    w.addBuilding('barracks', 1, 12, 12);
    research(g, tc.id, 'era2');
    g.step();
    expect(tc.queue).toHaveLength(1);
    expect(w.players.get(1)!.resources.food).toBe(RICH.food - TECH_DEFS.era2.cost.food!);
    const secs = runUntil(g, () => w.players.get(1)!.era === 2);
    expect(secs).toBeGreaterThan(TECH_DEFS.era2.time - 1);
    expect(secs).toBeLessThan(TECH_DEFS.era2.time + 1);
    // The whole class hears about it.
    expect(g.takeNotices(2).some((n) => n.includes('advanced to the Medieval Age'))).toBe(true);
  });

  it('you cannot skip an era, nor research the same thing twice at the same time', () => {
    const { g, w, tc } = richGame();
    w.addBuilding('barracks', 1, 12, 12);
    w.addBuilding('tech_center', 1, 16, 12);
    research(g, tc.id, 'era3');
    research(g, tc.id, 'era2');
    research(g, tc.id, 'era2');
    g.step();
    expect(tc.queue.map((q) => q.tech)).toEqual(['era2']);
  });

  it('cancelling a research refunds everything', () => {
    const { g, w, tc } = richGame();
    w.addBuilding('barracks', 1, 12, 12);
    research(g, tc.id, 'era2');
    g.step();
    g.enqueue(1, { kind: 'cancelTrain', buildingId: tc.id, index: 0 });
    g.step();
    expect(w.players.get(1)!.resources).toEqual(RICH);
  });

  it('units and buildings unlock by era, and old units are no longer trained', () => {
    const { g, w } = richGame();
    const barracks = w.addBuilding('barracks', 1, 12, 12)!;
    train(g, barracks.id, 'spearman');
    g.step();
    expect(barracks.queue).toHaveLength(0);
    expect(g.takeNotices(1).some((n) => n.includes('Medieval Age'))).toBe(true);

    const [worker] = [w.addUnit('worker', 1, 20.5, 20.5)];
    g.enqueue(1, { kind: 'build', unitIds: [worker.id], building: 'archery_range', tx: 22, ty: 22 });
    g.step();
    expect([...w.buildings.values()].some((b) => b.type === 'archery_range')).toBe(false);

    completeTech(w, 1, 'era2');
    train(g, barracks.id, 'spearman');
    train(g, barracks.id, 'warrior'); // Tribal only
    g.enqueue(1, { kind: 'build', unitIds: [worker.id], building: 'archery_range', tx: 22, ty: 22 });
    g.step();
    expect(barracks.queue.map((q) => q.unit)).toEqual(['spearman']);
    expect([...w.buildings.values()].some((b) => b.type === 'archery_range')).toBe(true);
  });

  it('every unit can be trained in some building of its eras', () => {
    for (const [type, def] of Object.entries(UNIT_DEFS) as [UnitType, (typeof UNIT_DEFS)[UnitType]][]) {
      const where = Object.values(BUILDING_DEFS).filter((b) => b.trains.includes(type) && b.era <= def.untilEra);
      expect(where.length, type).toBeGreaterThan(0);
      expect(unitAvailable(type, def.era)).toBe(true);
    }
  });

  it('every era offers military units', () => {
    for (let era = 1; era <= 4; era++) {
      const units = (Object.keys(UNIT_DEFS) as UnitType[]).filter((t) => t !== 'worker' && unitAvailable(t, era));
      expect(units.length, `era ${era}`).toBeGreaterThanOrEqual(era === 1 ? 2 : 3);
    }
  });

  it('the Industrial and Modern Eras need a tech center and a factory', () => {
    const { g, w, tc } = richGame();
    completeTech(w, 1, 'era2');
    research(g, tc.id, 'era3');
    g.step();
    expect(tc.queue).toHaveLength(0);
    w.addBuilding('tech_center', 1, 16, 12);
    research(g, tc.id, 'era3');
    run(g, TECH_DEFS.era3.time + 1);
    expect(w.players.get(1)!.era).toBe(3);
    research(g, tc.id, 'era4');
    g.step();
    expect(tc.queue).toHaveLength(0);
    w.addBuilding('factory', 1, 20, 12);
    research(g, tc.id, 'era4');
    run(g, TECH_DEFS.era4.time + 1);
    expect(w.players.get(1)!.era).toBe(4);
  });
});

describe('technologies', () => {
  it('tools: faster wood, stone and metal; plow: faster farms; wheelbarrow: carries more', () => {
    const tools = techBit('tools');
    expect(gatherRate('legion', 'wood', false, tools)).toBeCloseTo(gatherRate('legion', 'wood') * 1.15);
    expect(gatherRate('legion', 'food', false, tools)).toBe(gatherRate('legion', 'food'));
    expect(gatherRate('legion', 'food', true, techBit('plow'))).toBeCloseTo(gatherRate('legion', 'food', true) * 1.25);
    expect(carryCapacity(techBit('wheelbarrow'))).toBe(carryCapacity() + 5);
  });

  it('forge raises the attack of infantry and cavalry, but not of archers', () => {
    const f = techBit('forge');
    expect(unitStats('legion', 'spearman', f).attack.damage).toBeCloseTo(UNIT_DEFS.spearman.attack.damage * 1.15, 1);
    expect(unitStats('legion', 'archer', f).attack.damage).toBe(unitStats('legion', 'archer').attack.damage);
  });

  it('ballistics: +1 range for ranged units, and it adds to the faction bonus', () => {
    const base = unitStats('forest', 'rifleman').attack.range;
    expect(unitStats('forest', 'rifleman', techBit('ballistics')).attack.range).toBe(base + 1);
    expect(base).toBe(UNIT_DEFS.rifleman.attack.range + 1); // Guardia del Bosque
  });

  it('a researched technology works in the game: workers gather faster', () => {
    const { g, w, tc } = richGame();
    research(g, tc.id, 'tools');
    run(g, TECH_DEFS.tools.time + 1);
    expect(w.players.get(1)!.techs & techBit('tools')).toBeTruthy();
    expect(g.takeNotices(1).some((n) => n.includes('Tools'))).toBe(true);
    research(g, tc.id, 'tools'); // already researched
    g.step();
    expect(tc.queue).toHaveLength(0);
  });

  it('masonry raises the hit points of buildings that already exist (keeping the proportion)', () => {
    const { w, tc } = richGame();
    completeTech(w, 1, 'era2');
    tc.hp = tc.maxHp / 2;
    completeTech(w, 1, 'masonry');
    expect(tc.maxHp).toBe(buildingMaxHp('legion', 'town_center', w.players.get(1)!.techs));
    expect(tc.maxHp).toBe(Math.round(2000 * 1.2));
    expect(tc.hp).toBeCloseTo(tc.maxHp / 2);
  });

  it('technologies of the tech center are researched only there', () => {
    const { g, w, tc } = richGame();
    completeTech(w, 1, 'era2');
    research(g, tc.id, 'forge');
    g.step();
    expect(tc.queue).toHaveLength(0);
    const center = w.addBuilding('tech_center', 1, 16, 12)!;
    research(g, center.id, 'forge');
    g.step();
    expect(center.queue.map((q) => q.tech)).toEqual(['forge']);
  });
});

describe('advanced units', () => {
  it('spearmen beat knights; knights beat archers', () => {
    const spear = unitStats('legion', 'spearman'), knight = unitStats('legion', 'knight'), archer = unitStats('legion', 'archer');
    const spearHitsKnight = damage(spear.attack, 'infantry', 'cavalry', knight.armor, spear.bonus);
    expect(spearHitsKnight).toBe(Math.round(6 * 2 - 2));
    // Time to kill (in hits × cooldown): a spearman kills a knight faster than it dies... in pairs of 2 vs 1 cost-wise
    const knightHitsArcher = damage(knight.attack, 'cavalry', 'ranged', archer.armor, knight.bonus);
    expect(knightHitsArcher).toBeGreaterThanOrEqual(13);
  });

  it('the anti-tank team destroys tanks; a machine gun shreds infantry', () => {
    const at = unitStats('legion', 'antitank'), tank = unitStats('legion', 'tank');
    expect(damage(at.attack, 'infantry', 'armor', tank.armor, at.bonus)).toBe(14 * 3.5 - 8);
    // Liga del Río: no ranged bonuses or penalties.
    const mg = unitStats('river', 'machine_gun'), rifle = unitStats('river', 'rifleman');
    expect(damage(mg.attack, 'ranged', 'ranged', rifle.armor, mg.bonus)).toBe(6 - 1);
    const mech = unitStats('river', 'mech_infantry');
    expect(damage(mg.attack, 'ranged', 'infantry', mech.armor, mg.bonus)).toBe(Math.round(6 * 2.5 - 3));
  });

  it('a battle: 3 anti-tank teams beat a tank', () => {
    const g = flatGame();
    const w = g.world;
    completeTech(w, 1, 'era4');
    completeTech(w, 2, 'era4');
    const tank = w.addUnit('tank', 2, 22.5, 20.5);
    const teams = [0, 1, 2].map((i) => w.addUnit('antitank', 1, 17.5, 19.5 + i));
    run(g, 20);
    expect(tank.hp).toBeLessThanOrEqual(0);
    expect(teams.some((u) => u.hp > 0)).toBe(true);
  });
});

describe('towers, walls and gates', () => {
  it('a tower shoots enemies that come close', () => {
    const { g, w } = richGame();
    const tower = w.addBuilding('tower', 1, 20, 20)!;
    const enemy = w.addUnit('warrior', 2, 25.5, 21.5);
    const hp = enemy.hp;
    run(g, 3);
    expect(enemy.hp).toBeLessThan(hp);
    expect(tower.progress).toBe(1);
  });

  it('a wall blocks the way; a gate lets its owner and allies through, but not enemies', () => {
    const g = flatGame();
    const w = g.world;
    w.addPlayer(3, 'Tres', '#2fa84f', { x: 5, y: 34 });
    initRelations(w, (id) => (id === 2 ? 2 : 1), true); // 1 and 3 allies; 2 enemy
    // A wall from top to bottom at x = 20, with a gate at y = 20.
    for (let y = 0; y < 40; y++) w.addBuilding(y === 20 ? 'gate' : 'wall', 1, 20, y);
    // Workers: they don't start fights on their own.
    const mine = w.addUnit('worker', 1, 15.5, 20.5);
    const ally = w.addUnit('worker', 3, 15.5, 18.5);
    const enemy = w.addUnit('worker', 2, 15.5, 22.5);
    for (const u of [mine, ally, enemy]) g.enqueue(u.owner, { kind: 'move', unitIds: [u.id], x: 25.5, y: u.y });
    run(g, 10);
    expect(mine.x).toBeGreaterThan(21);
    expect(ally.x).toBeGreaterThan(21);
    expect(enemy.x).toBeLessThan(20);
  });

  it('walls, gates and towers can be built from the Tribal Age', () => {
    const { g, w } = richGame();
    expect(w.players.get(1)!.era).toBe(1);
    const u = w.addUnit('worker', 1, 15.5, 15.5);
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'wall', tx: 17, ty: 15 });
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'gate', tx: 18, ty: 15 });
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'tower', tx: 20, ty: 18 });
    g.step();
    const types = [...w.buildings.values()].filter((b) => b.owner === 1).map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(['wall', 'gate', 'tower']));
  });

  it('the Medieval Age lasts: the Industrial Age costs much more than the Medieval one', () => {
    const total = (t: TechId) => Object.values(TECH_DEFS[t].cost).reduce((a, b) => a + (b ?? 0), 0);
    expect(total('era3')).toBeGreaterThanOrEqual(4 * total('era2'));
    expect(TECH_DEFS.era3.time).toBeGreaterThanOrEqual(3 * TECH_DEFS.era2.time);
  });

  it('walls can be placed tile by tile', () => {
    const { g, w } = richGame();
    completeTech(w, 1, 'era2');
    const u = w.addUnit('worker', 1, 15.5, 15.5);
    for (let x = 17; x < 21; x++) g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'wall', tx: x, ty: 15 });
    g.step();
    expect([...w.buildings.values()].filter((b) => b.type === 'wall')).toHaveLength(4);
  });
});

describe('aircraft', () => {
  it('a plane flies over water and buildings in a straight line', () => {
    const g = flatGame();
    const w = g.world;
    for (let y = 0; y < 40; y++) w.tiles[y * 40 + 20] = 1; // river
    w.addBuilding('house', 1, 24, 19);
    const plane = w.addUnit('airplane', 1, 15.5, 20.5);
    g.enqueue(1, { kind: 'move', unitIds: [plane.id], x: 26, y: 20 });
    run(g, 4);
    expect(plane.x).toBeCloseTo(26, 1);
  });

  it('only ranged attacks reach a plane', () => {
    const g = flatGame();
    const w = g.world;
    const plane = w.addUnit('airplane', 2, 20.5, 20.5);
    const knight = w.addUnit('knight', 1, 19.5, 20.5);
    const rifle = w.addUnit('rifleman', 1, 17.5, 20.5);
    g.enqueue(1, { kind: 'attack', unitIds: [knight.id], targetId: plane.id });
    g.step();
    expect(knight.task).toBeNull();
    expect(g.takeNotices(1).some((n) => n.includes('airplanes'))).toBe(true);
    plane.cooldown = 99; // the plane doesn't fight back in this test
    const hp = plane.hp;
    g.enqueue(1, { kind: 'attack', unitIds: [knight.id, rifle.id], targetId: plane.id });
    run(g, 3);
    expect(plane.hp).toBeLessThan(hp);
    expect(knight.task).toBeNull();
    expect(rifle.task?.kind).toBe('attack');
  });

  it('melee units ignore planes when they look for targets on their own', () => {
    const g = flatGame();
    const w = g.world;
    w.addUnit('airplane', 2, 20.5, 20.5).cooldown = 999;
    const spear = w.addUnit('spearman', 1, 19.5, 20.5);
    run(g, 3);
    expect(spear.task).toBeNull();
  });
});

describe('network', () => {
  it('the research command is validated', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'research', buildingId: 3, tech: 'era2' } }))).toBeTruthy();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'research', buildingId: 3, tech: 'magic' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'research', buildingId: 3, tech: 'constructor' } }))).toBeNull();
  });

  it('queues with technologies survive encoding', () => {
    const v = { id: 3, owner: 1, type: 'town_center' as const, tx: 4, ty: 5, hp: 900, progress: 1,
      queue: [{ tech: 'era2' as const, progress: 0.5 }, { unit: 'worker' as const, progress: 0 }] };
    expect(decodeBuilding(encodeBuilding(v))).toEqual(v);
  });

  it('eras and technologies of every player reach the clients when they change', () => {
    const { g, w } = richGame();
    const sync = new ClientSync(2);
    const first = sync.build(buildFrame(g, 0, true), g);
    expect(first.pt).toEqual([1, 1, 0, 2, 1, 0]);
    g.step();
    expect(sync.build(buildFrame(g, 0), g).pt).toBeUndefined();
    completeTech(w, 1, 'era2');
    g.step();
    expect(sync.build(buildFrame(g, 0), g).pt).toEqual([1, 2, techBit('era2'), 2, 1, 0]);
  });
});
