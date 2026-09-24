// Performance benchmark (not a test): run with `npx tsx scripts/bench.ts`.
// Simulates a full class: 16 players × 50 workers and measures server cost.
import { NODE_DEFS, TICK_MS, type ResourceType } from '../shared/data.ts';
import { Game } from '../server/src/sim/game.ts';
import { generateWorld } from '../server/src/sim/mapgen.ts';
import { pathToPoint } from '../server/src/sim/pathfinding.ts';
import { buildFrame, ClientSync } from '../server/src/net/sync.ts';
import { deflateRawSync } from 'node:zlib';

function time<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const r = fn();
  return [r, performance.now() - t0];
}

// 1) Map generation
for (const slots of [4, 8, 16]) {
  const times: number[] = [];
  for (let seed = 1; seed <= 5; seed++) times.push(time(() => generateWorld({ slots, seed }))[1]);
  console.log(`Map ${slots} players: ${Math.max(...times).toFixed(0)} ms (worst of 5)`);
}

// 2) Full class
const game = new Game({ slots: 16, seed: 3 });
const w = game.world;
const PER_PLAYER = 50;
for (const p of w.players.values()) {
  let n = [...w.units.values()].filter((u) => u.owner === p.id).length;
  for (let r = 2; r < 12 && n < PER_PLAYER; r++)
    for (let dy = -r; dy <= r && n < PER_PLAYER; dy++)
      for (let dx = -r; dx <= r && n < PER_PLAYER; dx++) {
        const x = p.start.x + dx, y = p.start.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && w.isWalkable(x, y)) {
          w.addUnit('worker', p.id, x + 0.5, y + 0.5);
          n++;
        }
      }
}
console.log(`Units on the map: ${w.units.size}`);

// Everyone to work: resources split among the 4 resource types.
const order: ResourceType[] = ['wood', 'food', 'wood', 'stone', 'metal', 'food'];
let dispatchMs = 0;
for (const p of w.players.values()) {
  const mine = [...w.units.values()].filter((u) => u.owner === p.id);
  order.forEach((res, k) => {
    const group = mine.filter((_, i) => i % order.length === k).map((u) => u.id);
    const node = [...w.nodes.values()]
      .filter((n) => NODE_DEFS[n.type].resource === res && w.isExposed(n.tx, n.ty))
      .sort((a, b) => Math.hypot(a.tx - p.start.x, a.ty - p.start.y) - Math.hypot(b.tx - p.start.x, b.ty - p.start.y))[0];
    game.enqueue(p.id, { kind: 'gather', unitIds: group, targetId: node.id });
  });
}
dispatchMs = time(() => game.step())[1];
console.log(`Tick with 800 simultaneous gather orders: ${dispatchMs.toFixed(1)} ms`);

const stepTimes: number[] = [];
// Sync by changes, like the real server: one ClientSync per student.
const syncs = [...w.players.keys()].map((id) => new ClientSync(id));
let bytes = 0, zipped = 0, msgs = 0, syncMs = 0;
for (let i = 0; i < 600; i++) {
  stepTimes.push(time(() => game.step())[1]);
  syncMs += time(() => {
    const frame = buildFrame(game, 0);
    for (const c of syncs) {
      c.collect(frame);
      const text = JSON.stringify(c.build(frame, game));
      if (i >= 50) {
        bytes += text.length;
        if (i % 20 === 0) zipped += deflateRawSync(text).length * 20;
        msgs++;
      }
    }
  })[1];
}
const perStudent = (bytes / msgs) * 10; // bytes/s
const perStudentZip = (zipped / msgs) * 10;
stepTimes.sort((a, b) => a - b);
const avg = stepTimes.reduce((s, t) => s + t, 0) / stepTimes.length;
console.log(`Simulation step (60 s of play): average ${avg.toFixed(2)} ms · p99 ${stepTimes[Math.floor(stepTimes.length * 0.99)].toFixed(2)} ms · max ${stepTimes[stepTimes.length - 1].toFixed(2)} ms (budget: ${TICK_MS} ms)`);
console.log(`Sync (frame + 16 clients): ${(syncMs / 600).toFixed(2)} ms per tick`);
console.log(`BEFORE (full state as JSON): ~1200 KB/s per student · ~158 Mbit/s total`);
console.log(`NOW (changes only):      ${(perStudent / 1024).toFixed(1)} KB/s per student · ${((perStudent * 8 * 16) / 1e6).toFixed(1)} Mbit/s total`);
console.log(`NOW + compression:        ${(perStudentZip / 1024).toFixed(1)} KB/s per student · ${((perStudentZip * 8 * 16) / 1e6).toFixed(1)} Mbit/s total`);
let gathered = 0;
for (const p of w.players.values()) gathered += Object.values(game.economyOf(p.id).perMinute).reduce((s, v) => s + v, 0);
console.log(`Resources delivered in the last minute (all players): ${gathered}`);

// 3) Long paths
const map16 = generateWorld({ slots: 16, seed: 3 });
const ps = [...map16.players.values()];
const a = ps[0].start, b = ps[8].start; // opposite sides of the ring
const [path, pathMs] = time(() => pathToPoint(map16, { x: a.x + 2.5, y: a.y + 2.5 }, b.x + 2.5, b.y + 2.5));
console.log(`Path across the whole map: ${pathMs.toFixed(1)} ms, ${path?.length ?? 'NO PATH'} waypoints`);
const g2 = new Game({ slots: 16, seed: 3 });
const group = [...g2.world.units.values()].filter((u) => u.owner === 1);
for (let i = 0; i < 47; i++) group.push(g2.world.addUnit('worker', 1, group[0].x, group[0].y));
g2.enqueue(1, { kind: 'move', unitIds: group.map((u) => u.id), x: b.x + 4.5, y: b.y + 4.5 });
console.log(`Tick with 50 units sent across the whole map: ${time(() => g2.step())[1].toFixed(1)} ms`);
