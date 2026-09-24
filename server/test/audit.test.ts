// Audit tests: suspected bugs and invariants that must always hold.
import { describe, expect, it } from 'vitest';
import { MAX_QUEUE, NODE_DEFS, RESOURCE_TYPES, STARTING_RESOURCES, type ResourceType } from '../../shared/data.ts';
import { createRng } from '../../shared/rng.ts';
import { generateWorld } from '../src/sim/mapgen.ts';
import type { World } from '../src/sim/world.ts';
import { newGame, run, workersOf } from './helpers.ts';

describe('audit: suspected bugs', () => {
  it('output per minute drops back to 0 when nobody is gathering anymore', () => {
    const g = newGame();
    const ws = workersOf(g, 1);
    const p = g.world.players.get(1)!;
    const berries = [...g.world.nodes.values()]
      .filter((n) => n.type === 'berries')
      .sort((a, b) => Math.hypot(a.tx - p.start.x, a.ty - p.start.y) - Math.hypot(b.tx - p.start.x, b.ty - p.start.y))[0];
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: berries.id });
    run(g, 40);
    expect(g.economyOf(1).perMinute.food).toBeGreaterThan(0);
    g.enqueue(1, { kind: 'stop', unitIds: ws.map((u) => u.id) });
    run(g, 61);
    expect(g.economyOf(1).perMinute.food).toBe(0);
  });

  it('a worker gathering right next to the drop-off does not stop after a few trips', () => {
    const g = newGame();
    const w = g.world;
    const [u] = workersOf(g, 1);
    const tc = [...w.buildings.values()].find((b) => b.owner === 1)!;
    // Berry bush two rows above the Town Center and the worker in between:
    // from there it reaches BOTH without walking (like a farm next to the depot).
    const bx = tc.tx + 1, by = tc.ty - 2;
    for (const [x, y] of [[bx, by], [bx, by + 1]]) {
      const other = w.nodeAt(x, y);
      if (other) w.removeNode(other.id);
    }
    const node = w.addNode('berries', bx, by)!;
    expect(node).not.toBeNull();
    u.x = bx + 0.5;
    u.y = by + 1.5;
    g.enqueue(1, { kind: 'gather', unitIds: [u.id], targetId: node.id });
    run(g, 150); // ~9 full trips
    expect(u.task).not.toBeNull();
    expect(w.players.get(1)!.resources.food - STARTING_RESOURCES.food).toBeGreaterThanOrEqual(80);
  });
});

/** Checks the invariants that must ALWAYS hold in the simulation. */
function checkInvariants(w: World, initialTotals: Record<ResourceType, number>): string[] {
  const errors: string[] = [];
  for (const u of w.units.values()) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) errors.push(`unit ${u.id} with invalid position`);
    if (u.x < 0 || u.y < 0 || u.x > w.size || u.y > w.size) errors.push(`unit ${u.id} outside the map`);
    if (!w.isWalkable(Math.floor(u.x), Math.floor(u.y))) errors.push(`unit ${u.id} on a blocked tile (${u.x},${u.y})`);
    const allowed: Record<string, string[]> = {
      gather: ['toResource', 'gathering', 'returning'],
      build: ['toBuild', 'building'],
      attack: ['attacking'],
    };
    if (u.task && !allowed[u.task.kind].includes(u.state))
      errors.push(`unit ${u.id} with task ${u.task.kind} but state ${u.state}`);
    if (!u.task && !['idle', 'moving'].includes(u.state)) errors.push(`unit ${u.id} with no task but state ${u.state}`);
    if (u.state === 'moving' && u.path.length === 0) errors.push(`unit ${u.id} "moving" with no path`);
    if (u.carryAmount < 0 || u.carryAmount > 10) errors.push(`unit ${u.id} carrying ${u.carryAmount}`);
  }
  for (const u of w.units.values()) {
    if (u.hp > w.statsOf(u).hp) errors.push(`unit ${u.id} with health above its maximum`);
    if (u.hp <= 0) errors.push(`dead unit ${u.id} still on the map`);
  }
  for (const b of w.buildings.values()) {
    if (b.hp > b.maxHp + 1e-6) errors.push(`building ${b.id} with health above its maximum`);
    if (b.hp <= 0) errors.push(`destroyed building ${b.id} still on the map`);
    if (b.progress < 0 || b.progress > 1) errors.push(`building ${b.id} with progress ${b.progress}`);
    if (b.queue.length > MAX_QUEUE) errors.push(`building ${b.id} with a queue of ${b.queue.length}`);
    if (b.progress < 1 && b.queue.length > 0) errors.push(`unfinished building ${b.id} with production`);
  }
  for (const n of w.nodes.values()) if (n.amount <= 0) errors.push(`depleted node ${n.id} still on the map`);
  // Conservation: what is on the map + what was gathered + what is being carried ≤ what there was at the start
  // (spending only lowers it). Food is excluded: farms produce it (paid for in wood).
  for (const r of RESOURCE_TYPES) {
    if (r === 'food') continue;
    let onMap = 0;
    for (const n of w.nodes.values()) if (NODE_DEFS[n.type].resource === r) onMap += n.amount;
    let carried = 0;
    for (const u of w.units.values()) if (u.carryType === r) carried += u.carryAmount;
    let banked = 0;
    for (const p of w.players.values()) banked += p.resources[r] - STARTING_RESOURCES[r];
    if (onMap + carried + banked > initialTotals[r]) errors.push(`${r}: resources created from nothing`);
  }
  for (const p of w.players.values())
    for (const r of RESOURCE_TYPES) if (p.resources[r] < 0) errors.push(`player ${p.id} with negative ${r}`);
  return errors;
}

describe('audit: stress test with random orders', () => {
  it('8 players × 12 workers, 5 minutes of random orders: invariants always hold', () => {
    const g = newGame(8, 777);
    const w = g.world;
    const rng = createRng(4242);
    // More workers per player, next to their Town Center.
    for (const p of w.players.values())
      for (let i = 0; i < 9; i++) {
        const spot = [...Array(40)].map((_, k) => ({ x: p.start.x - 4 + (k % 9), y: p.start.y + 3 + Math.floor(k / 9) }))
          .find((s) => w.isWalkable(s.x, s.y) && ![...w.units.values()].some((u) => Math.floor(u.x) === s.x && Math.floor(u.y) === s.y));
        if (spot) w.addUnit('worker', p.id, spot.x + 0.5, spot.y + 0.5);
      }
    const initial: Record<ResourceType, number> = { food: 0, wood: 0, stone: 0, metal: 0 };
    for (const n of w.nodes.values()) initial[NODE_DEFS[n.type].resource] += n.amount;

    const nodes = () => [...w.nodes.values()];
    for (let second = 0; second < 300; second++) {
      // Every second, each player gives a random order to a random group.
      for (const p of w.players.values()) {
        const mine = workersOf(g, p.id);
        const group = mine.filter(() => rng() < 0.4).map((u) => u.id);
        if (group.length === 0) continue;
        const roll = rng();
        if (roll < 0.55) {
          // Gather: a resource within 20 tiles of the base.
          const near = nodes().filter((n) => Math.hypot(n.tx - p.start.x, n.ty - p.start.y) < 20);
          const target = near[Math.floor(rng() * near.length)];
          if (target) g.enqueue(p.id, { kind: 'gather', unitIds: group, targetId: target.id });
        } else if (roll < 0.85) {
          g.enqueue(p.id, { kind: 'move', unitIds: group, x: rng() * w.size, y: rng() * w.size });
        } else if (roll < 0.95) {
          g.enqueue(p.id, { kind: 'stop', unitIds: group });
        } else {
          // Order on units of ANOTHER player: must be ignored.
          const other = [...w.units.values()].find((u) => u.owner !== p.id)!;
          g.enqueue(p.id, { kind: 'move', unitIds: [other.id], x: 1, y: 1 });
        }
      }
      for (let t = 0; t < 10; t++) {
        g.step();
        const errors = checkInvariants(w, initial);
        if (errors.length > 0) throw new Error(`second ${second}, tick ${w.tick}: ${errors.slice(0, 5).join(' | ')}`);
      }
    }
    // Real work got done.
    const gathered = [...w.players.values()].reduce((s, p) => s + p.resources.wood - STARTING_RESOURCES.wood, 0);
    expect(gathered).toBeGreaterThan(0);
  }, 60_000);
});

describe('audit: stress test with war (Phase 2)', () => {
  it('4 players build, train and fight for 6 minutes: invariants always hold', () => {
    const g = newGame(4, 99);
    const w = g.world;
    const rng = createRng(777);
    for (const p of w.players.values()) {
      p.resources = { food: 3000, wood: 3000, stone: 500, metal: 500 };
      // Each player starts with a finished Barracks, so there is an army from the beginning.
      let placed = false;
      for (let r = 4; r < 12 && !placed; r++)
        for (let a = 0; a < 8 && !placed; a++)
          placed = !!w.addBuilding('barracks', p.id, Math.round(p.start.x + Math.cos(a) * r), Math.round(p.start.y + Math.sin(a) * r));
      expect(placed).toBe(true);
    }
    const initial: Record<ResourceType, number> = { food: 0, wood: 0, stone: 0, metal: 0 };
    for (const n of w.nodes.values()) initial[NODE_DEFS[n.type].resource] += n.amount;
    // With so much stockpiled, the "banked" amount starts way above: we take it into account.
    for (const r of RESOURCE_TYPES) initial[r] += (3000 - STARTING_RESOURCES[r]) * 4;
    initial.stone += (500 - 3000) * 4;
    initial.metal += (500 - 3000) * 4;

    const pick = <T,>(list: T[]): T | undefined => list[Math.floor(rng() * list.length)];
    let fights = 0;
    const trained = new Set<number>();
    for (let second = 0; second < 360; second++) {
      for (const p of w.players.values()) {
        const mine = [...w.units.values()].filter((u) => u.owner === p.id);
        // Whoever is building is not interrupted (otherwise nothing ever gets finished).
        const workers = mine.filter((u) => u.type === 'worker' && u.task?.kind !== 'build');
        const army = mine.filter((u) => u.type !== 'worker');
        const own = [...w.buildings.values()].filter((b) => b.owner === p.id);
        const roll = rng();
        if (roll < 0.25 && workers.length > 0) {
          const near = [...w.nodes.values()].filter((n) => Math.hypot(n.tx - p.start.x, n.ty - p.start.y) < 18);
          const target = pick(near);
          if (target) g.enqueue(p.id, { kind: 'gather', unitIds: workers.filter(() => rng() < 0.5).map((u) => u.id).concat(workers[0].id), targetId: target.id });
        } else if (roll < 0.45 && workers.length > 0) {
          const type = pick(['house', 'storehouse', 'farm', 'barracks'] as const)!;
          const tx = Math.floor(p.start.x - 10 + rng() * 20), ty = Math.floor(p.start.y - 10 + rng() * 20);
          g.enqueue(p.id, { kind: 'build', unitIds: [pick(workers)!.id], building: type, tx, ty });
        } else if (roll < 0.65 && own.length > 0) {
          const b = pick(own)!;
          const unit = pick(['worker', 'warrior', 'scout'] as const)!;
          g.enqueue(p.id, { kind: 'train', buildingId: b.id, unit });
          if (rng() < 0.2) g.enqueue(p.id, { kind: 'cancelTrain', buildingId: b.id, index: 0 });
          if (rng() < 0.3) g.enqueue(p.id, { kind: 'rally', buildingId: b.id, x: p.start.x + rng() * 6, y: p.start.y + rng() * 6 });
        } else if (roll < 0.85 && army.length > 0) {
          // Attack something of another player (unit or building).
          const enemies = [...w.units.values(), ...w.buildings.values()].filter((e) => e.owner !== p.id);
          const target = pick(enemies);
          if (target) {
            g.enqueue(p.id, { kind: 'attack', unitIds: army.map((u) => u.id), targetId: target.id });
            fights++;
          }
        } else if (roll < 0.9 && own.length > 1) {
          const b = pick(own.filter((b) => b.type !== 'town_center'));
          if (b && rng() < 0.3) g.enqueue(p.id, { kind: 'delete', ids: [b.id] });
          else if (b && workers.length > 0) g.enqueue(p.id, { kind: 'construct', unitIds: [workers[0].id], targetId: b.id });
        } else if (mine.length > 0) {
          g.enqueue(p.id, { kind: 'move', unitIds: mine.filter(() => rng() < 0.3).map((u) => u.id).concat(mine[0].id), x: rng() * w.size, y: rng() * w.size });
        }
      }
      for (let t = 0; t < 10; t++) {
        g.step();
        for (const u of w.units.values()) if (u.type === 'warrior') trained.add(u.id);
        const errors = checkInvariants(w, initial);
        if (errors.length > 0) throw new Error(`second ${second}, tick ${w.tick}: ${errors.slice(0, 5).join(' | ')}`);
      }
    }
    expect(fights).toBeGreaterThan(0);
    expect(trained.size).toBeGreaterThan(4);
    const soldiers = [...w.units.values()].filter((u) => u.type !== 'worker').length;
    const built = [...w.buildings.values()].filter((b) => b.type !== 'town_center' && b.progress >= 1).length;
    expect(soldiers + built).toBeGreaterThan(0);
  }, 120_000);
});

describe('audit: map fairness across many seeds', () => {
  for (const slots of [2, 3, 5, 8, 12, 16]) {
    it(`${slots} players, 15 seeds: same food/stone/metal near each base and all reachable`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const w = generateWorld({ slots, seed: seed * 101 });
        const counts = [...w.players.values()].map((p) => {
          const c: Record<ResourceType, number> = { food: 0, wood: 0, stone: 0, metal: 0 };
          for (const n of w.nodes.values())
            if (Math.hypot(n.tx - p.start.x, n.ty - p.start.y) <= 11) c[NODE_DEFS[n.type].resource]++;
          return c;
        });
        for (const c of counts) {
          expect(c.food, `seed ${seed}`).toBe(counts[0].food);
          expect(c.stone, `seed ${seed}`).toBe(counts[0].stone);
          expect(c.metal, `seed ${seed}`).toBe(counts[0].metal);
        }
        // Every bush, quarry and vein must have access from the region where the bases are.
        const reach = reachable(w);
        for (const n of w.nodes.values()) {
          if (n.type === 'tree') continue;
          let ok = false;
          for (let dy = -1; dy <= 1 && !ok; dy++)
            for (let dx = -1; dx <= 1 && !ok; dx++) {
              const x = n.tx + dx, y = n.ty + dy;
              if (w.inBounds(x, y) && reach[y * w.size + x]) ok = true;
            }
          expect(ok, `seed ${seed}: ${n.type} at (${n.tx},${n.ty}) unreachable`).toBe(true);
        }
      }
    }, 60_000);
  }
});

/** Tiles reachable on foot from the first base. */
function reachable(w: World): Uint8Array {
  const seen = new Uint8Array(w.size * w.size);
  const p = [...w.players.values()][0];
  const stack: number[] = [];
  for (let y = p.start.y - 3; y <= p.start.y + 3; y++)
    for (let x = p.start.x - 3; x <= p.start.x + 3; x++)
      if (w.isWalkable(x, y)) {
        seen[y * w.size + x] = 1;
        stack.push(y * w.size + x);
      }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w.size, y = (i - x) / w.size;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!w.isWalkable(nx, ny)) continue;
      const j = ny * w.size + nx;
      if (!seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}
