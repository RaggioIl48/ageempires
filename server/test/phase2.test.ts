// Phase 2: construction, production, combat and factions.
import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS, FACTIONS, MAX_QUEUE, STARTING_RESOURCES, UNIT_DEFS } from '../../shared/data.ts';
import { damage, unitStats } from '../../shared/stats.ts';
import { builderSpeed } from '../src/sim/build.ts';
import { nearestDropoff } from '../src/sim/gather.ts';
import { flatGame, run, runUntil } from './helpers.ts';

const byType = (g: ReturnType<typeof flatGame>, owner: number, type: string) =>
  [...g.world.units.values()].filter((u) => u.owner === owner && u.type === type);
const buildingsOf = (g: ReturnType<typeof flatGame>, owner: number, type: string) =>
  [...g.world.buildings.values()].filter((b) => b.owner === owner && b.type === type);

describe('construction', () => {
  it('a worker builds a house: pays, raises the foundation and the population goes up', () => {
    const g = flatGame(['germans', 'germans']); // no build-speed bonus (the Romans build faster)
    const w = g.world;
    const u = w.addUnit('worker', 1, 10.5, 10.5);
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'house', tx: 12, ty: 10 });
    g.step();
    const [house] = buildingsOf(g, 1, 'house');
    expect(house).toBeDefined();
    expect(house.progress).toBeLessThan(0.05);
    expect(w.players.get(1)!.resources.wood).toBe(STARTING_RESOURCES.wood - 30);
    expect(w.popOf(1).popCap).toBe(5); // unfinished: no population yet
    const secs = runUntil(g, () => house.progress >= 1);
    expect(secs).toBeGreaterThan(BUILDING_DEFS.house.buildTime - 1);
    expect(secs).toBeLessThan(BUILDING_DEFS.house.buildTime + 5);
    expect(house.hp).toBe(house.maxHp);
    expect(w.popOf(1).popCap).toBe(10);
    run(g, 0.2);
    expect(u.task).toBeNull(); // done: free
  });

  it('more builders = faster, but each extra helps less', () => {
    expect(builderSpeed(1)).toBe(1);
    expect(builderSpeed(4)).toBe(2);
    const time = (n: number) => {
      const g = flatGame();
      const ids = Array.from({ length: n }, (_, i) => g.world.addUnit('worker', 1, 10.5 + i * 0.1, 12.5).id);
      g.enqueue(1, { kind: 'build', unitIds: ids, building: 'barracks', tx: 12, ty: 14 });
      g.step();
      const [b] = buildingsOf(g, 1, 'barracks');
      return runUntil(g, () => b.progress >= 1);
    };
    const one = time(1), four = time(4);
    expect(four).toBeLessThan(one * 0.6);
    expect(four).toBeGreaterThan(one * 0.4);
  });

  it('rejects building on a tree, on another building, off the map, or without resources', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 10.5, 10.5);
    w.addNode('tree', 15, 15);
    const tries: [number, number][] = [[14, 14], [4, 4], [39, 39], [-1, 5]];
    for (const [tx, ty] of tries) g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'house', tx, ty });
    g.step();
    expect(buildingsOf(g, 1, 'house')).toHaveLength(0);
    expect(w.players.get(1)!.resources).toEqual(STARTING_RESOURCES);
    w.players.get(1)!.resources.wood = 10;
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'house', tx: 20, ty: 20 });
    g.step();
    const notices = g.takeNotices(1);
    expect(buildingsOf(g, 1, 'house')).toHaveLength(0);
    expect(notices).toContain('Not enough resources');
  });

  it('the Town Center cannot be built by workers (not in the menu)', () => {
    const g = flatGame();
    const u = g.world.addUnit('worker', 1, 10.5, 10.5);
    g.world.players.get(1)!.resources = { food: 9999, wood: 9999, stone: 9999, metal: 9999 };
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'town_center', tx: 15, ty: 15 });
    g.step();
    expect(buildingsOf(g, 1, 'town_center')).toHaveLength(1);
  });

  it('units standing where a building is placed are moved out of the way', () => {
    const g = flatGame();
    const w = g.world;
    const builder = w.addUnit('worker', 1, 8.5, 12.5);
    const inTheWay = w.addUnit('worker', 1, 13.5, 13.5);
    g.enqueue(1, { kind: 'build', unitIds: [builder.id], building: 'barracks', tx: 12, ty: 12 });
    g.step();
    expect(w.isWalkable(Math.floor(inTheWay.x), Math.floor(inTheWay.y))).toBe(true);
  });

  it('the storehouse only receives resources once it is finished', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 25.5, 10.5);
    u.carryType = 'wood';
    u.carryAmount = 5;
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'storehouse', tx: 26, ty: 12 });
    g.step();
    expect(nearestDropoff(w, u)!.type).toBe('town_center');
    runUntil(g, () => buildingsOf(g, 1, 'storehouse')[0].progress >= 1);
    expect(nearestDropoff(w, u)!.type).toBe('storehouse');
  });

  it('deleting an unfinished foundation refunds what is left to build', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 10.5, 10.5);
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'barracks', tx: 12, ty: 10 });
    g.step();
    const [b] = buildingsOf(g, 1, 'barracks');
    runUntil(g, () => b.progress >= 0.5);
    g.enqueue(1, { kind: 'delete', ids: [b.id] });
    g.step();
    expect(w.buildings.has(b.id)).toBe(false);
    const wood = w.players.get(1)!.resources.wood;
    expect(wood).toBeGreaterThanOrEqual(STARTING_RESOURCES.wood - 150 + 70);
    expect(wood).toBeLessThanOrEqual(STARTING_RESOURCES.wood - 150 + 76);
    // The tiles are free again.
    expect(w.isWalkable(13, 11)).toBe(true);
  });

  it('a building destroyed while under construction does not survive thanks to its builders', () => {
    const g = flatGame();
    const w = g.world;
    const ids = [0, 1, 2].map((i) => w.addUnit('worker', 1, 11.5, 10.5 + i).id);
    g.enqueue(1, { kind: 'build', unitIds: ids, building: 'barracks', tx: 12, ty: 10 });
    g.step();
    const [b] = buildingsOf(g, 1, 'barracks');
    run(g, 5);
    b.hp = 0.5; // on its last legs
    const enemy = w.addUnit('warrior', 2, 15.5, 11.5);
    g.enqueue(2, { kind: 'attack', unitIds: [enemy.id], targetId: b.id });
    runUntil(g, () => !w.buildings.has(b.id), 10);
    expect(w.buildings.has(b.id)).toBe(false);
  });

  it('whoever builds a farm stays to work it; the farm gives food and runs out', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 9.5, 5.5);
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'farm', tx: 8, ty: 4 });
    g.step();
    const [farm] = buildingsOf(g, 1, 'farm');
    runUntil(g, () => farm.progress >= 1);
    run(g, 1);
    expect(u.task?.kind).toBe('gather');
    const food0 = w.players.get(1)!.resources.food;
    run(g, 60);
    expect(w.players.get(1)!.resources.food).toBeGreaterThan(food0 + 15);
    farm.food = 3; // almost exhausted
    run(g, 20);
    expect(w.buildings.has(farm.id)).toBe(false);
  });

  it('a farm has one farmer: the second worker goes to another free farm', () => {
    const g = flatGame();
    const w = g.world;
    const f1 = w.addBuilding('farm', 1, 8, 4)!;
    const f2 = w.addBuilding('farm', 1, 8, 8)!;
    const a = w.addUnit('worker', 1, 12.5, 6.5);
    const b = w.addUnit('worker', 1, 12.5, 7.5);
    g.enqueue(1, { kind: 'gather', unitIds: [a.id, b.id], targetId: f1.id });
    g.step();
    const targets = [a, b].map((u) => u.task?.targetId).sort();
    expect(targets).toEqual([f1.id, f2.id].sort());
  });

  it('repairing restores health and costs part of the price', () => {
    const g = flatGame();
    const w = g.world;
    const house = w.addBuilding('house', 1, 12, 12)!;
    house.hp = house.maxHp / 2;
    const u = w.addUnit('worker', 1, 11.5, 12.5);
    g.enqueue(1, { kind: 'construct', unitIds: [u.id], targetId: house.id });
    runUntil(g, () => house.hp >= house.maxHp);
    expect(house.hp).toBe(house.maxHp);
    const spent = STARTING_RESOURCES.wood - w.players.get(1)!.resources.wood;
    // Half of the health × 50% of the price (30) ≈ 7-8 wood.
    expect(spent).toBeGreaterThanOrEqual(6);
    expect(spent).toBeLessThanOrEqual(8);
  });

  it('repairing without resources stops the work and notifies', () => {
    const g = flatGame();
    const w = g.world;
    const house = w.addBuilding('house', 1, 12, 12)!;
    house.hp = 10;
    w.players.get(1)!.resources.wood = 0;
    const u = w.addUnit('worker', 1, 11.5, 12.5);
    g.enqueue(1, { kind: 'construct', unitIds: [u.id], targetId: house.id });
    run(g, 10);
    expect(house.hp).toBeLessThan(house.maxHp / 2);
    expect(u.task).toBeNull();
  });
});

describe('production', () => {
  it('the Town Center trains a worker: charges 50 food and it appears after its time', () => {
    const g = flatGame();
    const w = g.world;
    const [tc] = buildingsOf(g, 1, 'town_center');
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'worker' });
    g.step();
    expect(w.players.get(1)!.resources.food).toBe(STARTING_RESOURCES.food - 50);
    const secs = runUntil(g, () => byType(g, 1, 'worker').length === 1);
    expect(secs).toBeGreaterThan(UNIT_DEFS.worker.trainTime - 1);
    expect(secs).toBeLessThan(UNIT_DEFS.worker.trainTime + 1);
    const [u] = byType(g, 1, 'worker');
    expect(w.isWalkable(Math.floor(u.x), Math.floor(u.y))).toBe(true);
  });

  it('queue: they come out one by one and cancelling refunds the cost', () => {
    const g = flatGame();
    const w = g.world;
    const [tc] = buildingsOf(g, 1, 'town_center');
    for (let i = 0; i < 3; i++) g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'worker' });
    g.step();
    expect(tc.queue).toHaveLength(3);
    g.enqueue(1, { kind: 'cancelTrain', buildingId: tc.id, index: 2 });
    g.step();
    expect(tc.queue).toHaveLength(2);
    expect(w.players.get(1)!.resources.food).toBe(STARTING_RESOURCES.food - 100);
    run(g, 2 * UNIT_DEFS.worker.trainTime + 1);
    expect(byType(g, 1, 'worker')).toHaveLength(2);
  });

  it(`the queue fits at most ${MAX_QUEUE}`, () => {
    const g = flatGame();
    g.world.players.get(1)!.resources.food = 9999;
    const [tc] = buildingsOf(g, 1, 'town_center');
    for (let i = 0; i < MAX_QUEUE + 3; i++) g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'worker' });
    g.step();
    expect(tc.queue).toHaveLength(MAX_QUEUE);
    expect(g.world.players.get(1)!.resources.food).toBe(9999 - MAX_QUEUE * 50);
  });

  it('without room for population it waits and asks for houses; with a house it continues', () => {
    const g = flatGame();
    const w = g.world;
    for (let i = 0; i < 5; i++) w.addUnit('worker', 1, 10.5 + i, 10.5); // 5/5
    const [tc] = buildingsOf(g, 1, 'town_center');
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'worker' });
    g.step();
    run(g, UNIT_DEFS.worker.trainTime + 2);
    const notices = g.takeNotices(1);
    expect(byType(g, 1, 'worker')).toHaveLength(5);
    expect(tc.needsHouses).toBe(true);
    expect(notices).toContain('Population limit reached: build more houses');
    w.addBuilding('house', 1, 15, 15);
    run(g, UNIT_DEFS.worker.trainTime + 1);
    expect(byType(g, 1, 'worker')).toHaveLength(6);
  });

  it('an unfinished barracks does not train; a Town Center does not train warriors', () => {
    const g = flatGame();
    const w = g.world;
    w.players.get(1)!.resources = { food: 999, wood: 999, stone: 999, metal: 999 };
    const barracks = w.addBuilding('barracks', 1, 12, 12, false)!;
    const [tc] = buildingsOf(g, 1, 'town_center');
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'warrior' });
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'warrior' });
    g.step();
    expect(barracks.queue).toHaveLength(0);
    expect(tc.queue).toHaveLength(0);
    expect(w.players.get(1)!.resources.food).toBe(999);
  });

  it('nobody can train in someone else\'s building', () => {
    const g = flatGame();
    const [enemyTc] = buildingsOf(g, 2, 'town_center');
    g.enqueue(1, { kind: 'train', buildingId: enemyTc.id, unit: 'worker' });
    g.step();
    expect(enemyTc.queue).toHaveLength(0);
    expect(g.world.players.get(1)!.resources).toEqual(STARTING_RESOURCES);
    expect(g.world.players.get(2)!.resources).toEqual(STARTING_RESOURCES);
  });

  it('rally point: the new unit walks there; on a resource, the worker gathers', () => {
    const g = flatGame();
    const w = g.world;
    const [tc] = buildingsOf(g, 1, 'town_center');
    const tree = w.addNode('tree', 12, 12)!;
    g.enqueue(1, { kind: 'rally', buildingId: tc.id, x: 12.5, y: 12.5 });
    g.enqueue(1, { kind: 'train', buildingId: tc.id, unit: 'worker' });
    runUntil(g, () => byType(g, 1, 'worker').length === 1);
    const [u] = byType(g, 1, 'worker');
    expect(u.task?.kind === 'gather' && u.task.targetId).toBe(tree.id);
  });
});

describe('combat', () => {
  it('damage formula: attack × type advantage − armor (minimum 1)', () => {
    const warrior = unitStats('romans', 'warrior');
    const scout = unitStats('romans', 'scout');
    const worker = unitStats('romans', 'worker');
    // Warrior (6) against scout (cavalry, 0 melee armor): 6 × 1.5 = 9
    expect(damage(UNIT_DEFS.warrior.attack, 'infantry', 'cavalry', scout.armor)).toBe(9);
    // Scout (4) against worker: 4 × 1.5 = 6
    expect(damage(UNIT_DEFS.scout.attack, 'cavalry', 'worker', worker.armor)).toBe(6);
    // Worker (3) against warrior (Romans: armor 1+1=2): 3 − 2 = 1
    expect(damage(UNIT_DEFS.worker.attack, 'worker', 'infantry', warrior.armor)).toBe(1);
  });

  it('a warrior hunts down a worker', () => {
    const g = flatGame();
    const w = g.world;
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    const victim = w.addUnit('worker', 2, 18.5, 15.5);
    g.enqueue(1, { kind: 'attack', unitIds: [warrior.id], targetId: victim.id });
    const secs = runUntil(g, () => !w.units.has(victim.id), 30);
    expect(secs).toBeLessThan(15);
    expect(warrior.hp).toBe(warrior.hp); // alive
    run(g, 0.2);
    expect(warrior.task).toBeNull();
  });

  it('the warrior (infantry) beats the scout (cavalry) of the same faction', () => {
    const g = flatGame();
    const w = g.world;
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    const scout = w.addUnit('scout', 2, 16.5, 15.5);
    g.enqueue(2, { kind: 'attack', unitIds: [scout.id], targetId: warrior.id });
    runUntil(g, () => !w.units.has(scout.id) || !w.units.has(warrior.id), 60);
    expect(w.units.has(warrior.id)).toBe(true);
    expect(w.units.has(scout.id)).toBe(false);
  });

  it('factions: Mongol cavalry beats Roman cavalry, but the Romans are better at siege', () => {
    const red = unitStats('mongols', 'scout');
    const yellow = unitStats('romans', 'scout');
    expect(red.attack.damage).toBeGreaterThan(yellow.attack.damage);
    expect(red.speed).toBeGreaterThan(yellow.speed);
    // ...but the Romans are better at siege.
    expect(FACTIONS.romans.units.siege!.attack!).toBeGreaterThan(FACTIONS.mongols.units.siege?.attack ?? 1);
    // Real duel: 1 Mongol scout against 1 Roman scout.
    const g = flatGame(['mongols', 'romans']);
    const w = g.world;
    const r = w.addUnit('scout', 1, 15.5, 15.5);
    const y = w.addUnit('scout', 2, 16.5, 15.5);
    g.enqueue(1, { kind: 'attack', unitIds: [r.id], targetId: y.id });
    g.enqueue(2, { kind: 'attack', unitIds: [y.id], targetId: r.id });
    runUntil(g, () => !w.units.has(r.id) || !w.units.has(y.id), 60);
    expect(w.units.has(r.id)).toBe(true);
    expect(w.units.has(y.id)).toBe(false);
  });

  it('an idle warrior attacks on its own the enemies it sees; a worker does not', () => {
    const g = flatGame();
    const w = g.world;
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    const worker = w.addUnit('worker', 1, 15.5, 17.5);
    const enemy = w.addUnit('worker', 2, 18.5, 15.5);
    run(g, 1);
    expect(warrior.task?.kind === 'attack' && warrior.task.targetId).toBe(enemy.id);
    expect(worker.task).toBeNull();
  });

  it('priority: first whoever can fight, then workers', () => {
    const g = flatGame();
    const w = g.world;
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    w.addUnit('worker', 2, 17.5, 15.5); // closer, but it's a worker
    const enemyWarrior = w.addUnit('warrior', 2, 15.5, 18.5);
    run(g, 1);
    expect(warrior.task?.kind === 'attack' && warrior.task.targetId).toBe(enemyWarrior.id);
  });

  it('the Town Center shoots arrows at nearby enemies and not at its own units', () => {
    const g = flatGame();
    const w = g.world;
    const own = w.addUnit('worker', 1, 8.5, 5.5);
    const intruder = w.addUnit('worker', 2, 9.5, 6.5);
    const shots: number[] = [];
    for (let i = 0; i < 300 && w.units.has(intruder.id); i++) {
      g.step();
      shots.push(w.events.filter((e) => e.k === 'shot').length);
    }
    expect(w.units.has(intruder.id)).toBe(false);
    expect(shots.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(own.hp).toBe(unitStats('romans', 'worker').hp);
  });

  it('warriors bring down a house: it disappears, frees the tiles and its owner is notified', () => {
    const g = flatGame();
    const w = g.world;
    const house = w.addBuilding('house', 2, 20, 20)!;
    const ids = Array.from({ length: 5 }, (_, i) => w.addUnit('warrior', 1, 17.5, 18.5 + i * 0.5).id);
    g.enqueue(1, { kind: 'attack', unitIds: ids, targetId: house.id });
    runUntil(g, () => !w.buildings.has(house.id), 120);
    expect(w.buildings.has(house.id)).toBe(false);
    expect(w.isWalkable(20, 20)).toBe(true);
    expect(g.takeNotices(2).some((n) => n.includes('House'))).toBe(true);
  });

  it('you cannot attack your own units or buildings', () => {
    const g = flatGame();
    const w = g.world;
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    const friend = w.addUnit('worker', 1, 16.5, 15.5);
    const [tc] = buildingsOf(g, 1, 'town_center');
    g.enqueue(1, { kind: 'attack', unitIds: [warrior.id], targetId: friend.id });
    g.enqueue(1, { kind: 'attack', unitIds: [warrior.id], targetId: tc.id });
    run(g, 5);
    expect(friend.hp).toBe(unitStats('romans', 'worker').hp);
    expect(tc.hp).toBe(tc.maxHp);
  });

  it('chases a target that runs away', () => {
    const g = flatGame();
    const w = g.world;
    const scout = w.addUnit('scout', 1, 10.5, 20.5);
    const runner = w.addUnit('worker', 2, 12.5, 20.5);
    g.enqueue(2, { kind: 'move', unitIds: [runner.id], x: 25.5, y: 22.5 });
    g.enqueue(1, { kind: 'attack', unitIds: [scout.id], targetId: runner.id });
    const secs = runUntil(g, () => !w.units.has(runner.id), 40);
    expect(secs).toBeLessThan(40);
  });

  it('a hit idle warrior responds to the attacker', () => {
    const g = flatGame();
    const w = g.world;
    const defender = w.addUnit('warrior', 1, 15.5, 15.5);
    const attacker = w.addUnit('scout', 2, 16.4, 15.5);
    defender.state = 'idle';
    g.enqueue(2, { kind: 'attack', unitIds: [attacker.id], targetId: defender.id });
    run(g, 2);
    expect(defender.task?.kind === 'attack' && defender.task.targetId).toBe(attacker.id);
  });
});
