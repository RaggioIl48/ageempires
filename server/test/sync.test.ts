// Efficient sync: the client rebuilds EXACTLY the server state from
// changes alone, even if some messages are skipped (slow client).
import { describe, expect, it } from 'vitest';
import { decodeBuilding, decodeEvent, decodeUnit, encodeBuilding, encodeEvent, encodeUnit } from '../../shared/codec.ts';
import { createRng } from '../../shared/rng.ts';
import { decodeTiles, encodeTiles, type GameEvent, type ServerMessage, type UnitView } from '../../shared/protocol.ts';
import { ClientState } from '../../client/src/state.ts';
import { buildFrame, ClientSync, welcomeMessage } from '../src/net/sync.ts';
import { Game } from '../src/sim/game.ts';

const SETTINGS = { maxPlayers: 4, mapSize: 'normal' as const, durationMin: 0 };

/** Simulates the network: JSON there and back. */
const wire = (m: ServerMessage): ServerMessage => JSON.parse(JSON.stringify(m));

describe('compact encoding', () => {
  it('units, buildings and effects survive the round trip', () => {
    const u: UnitView = { id: 7, owner: 2, type: 'scout', x: 12.34, y: 5.67, hp: 40, state: 'attacking', walk: 1, targetId: 99 };
    expect(decodeUnit(encodeUnit(u))).toEqual(u);
    const w: UnitView = { id: 8, owner: 1, type: 'worker', x: 1, y: 2, hp: 25, state: 'returning', task: 'wood', carryType: 'wood', carryAmount: 7 };
    expect(decodeUnit(encodeUnit(w))).toEqual(w);
    const b = { id: 3, owner: 1, type: 'barracks' as const, tx: 4, ty: 5, hp: 900, progress: 1, queue: [{ unit: 'warrior' as const, progress: 0.5 }, { unit: 'scout' as const, progress: 0 }], rally: { x: 10.5, y: 3.25 }, needsHouses: 1 as const };
    expect(decodeBuilding(encodeBuilding(b))).toEqual(b);
    const farm = { id: 4, owner: 2, type: 'farm' as const, tx: 1, ty: 1, hp: 300, progress: 0.5, food: 120 };
    expect(decodeBuilding(encodeBuilding(farm))).toEqual(farm);
    const events: GameEvent[] = [
      { k: 'shot', x1: 1.5, y1: 2.5, x2: 3.25, y2: 4 },
      { k: 'hit', x: 1, y: 2 },
      { k: 'death', x: 5.5, y: 6 },
      { k: 'destroyed', x: 7.5, y: 8.5, size: 3 },
    ];
    for (const e of events) expect(decodeEvent(encodeEvent(e))).toEqual(e);
  });

  it('the map compressed by runs comes back the same and takes much less space', () => {
    const game = new Game({ slots: 4, seed: 3 });
    const rle = encodeTiles(game.world.tiles);
    expect(Array.from(decodeTiles(rle, game.world.size))).toEqual(Array.from(game.world.tiles));
    expect(JSON.stringify(rle).length).toBeLessThan(JSON.stringify(Array.from(game.world.tiles)).length / 5);
  });
});

describe('sync by changes', () => {
  it('3 minutes of random play: each client rebuilds exactly what the server has', () => {
    const game = new Game({ slots: 4, seed: 11 });
    const w = game.world;
    const rng = createRng(5);
    for (const p of w.players.values()) p.resources = { food: 2000, wood: 2000, stone: 500, metal: 500 };

    // Player 1 (never loses messages), player 2 (loses 30%) and the teacher (observer).
    const clients = [1, 2, 0].map((id) => ({ sync: new ClientSync(id), state: new ClientState(), dropRate: id === 2 ? 0.3 : 0 }));
    for (const c of clients) c.state.apply(wire(welcomeMessage(game, c.sync.playerId, SETTINGS)), 0);

    for (let tick = 1; tick <= 1800; tick++) {
      // Random orders every second.
      if (tick % 10 === 0)
        for (const p of w.players.values()) {
          const mine = [...w.units.values()].filter((u) => u.owner === p.id);
          if (mine.length === 0) continue;
          const roll = rng();
          const ids = mine.filter(() => rng() < 0.5).map((u) => u.id).concat(mine[0].id);
          if (roll < 0.3) {
            const node = [...w.nodes.values()].find((n) => Math.hypot(n.tx - p.start.x, n.ty - p.start.y) < 12 && rng() < 0.2);
            if (node) game.enqueue(p.id, { kind: 'gather', unitIds: ids, targetId: node.id });
          } else if (roll < 0.5) {
            game.enqueue(p.id, { kind: 'move', unitIds: ids, x: rng() * w.size, y: rng() * w.size });
          } else if (roll < 0.7) {
            const tc = [...w.buildings.values()].find((b) => b.owner === p.id);
            if (tc) game.enqueue(p.id, { kind: 'train', buildingId: tc.id, unit: 'worker' });
            if (tc && rng() < 0.3) game.enqueue(p.id, { kind: 'rally', buildingId: tc.id, x: p.start.x + 4, y: p.start.y + 4 });
          } else if (roll < 0.85) {
            const tx = Math.floor(p.start.x - 8 + rng() * 16), ty = Math.floor(p.start.y - 8 + rng() * 16);
            game.enqueue(p.id, { kind: 'build', unitIds: ids, building: rng() < 0.5 ? 'house' : 'farm', tx, ty });
          } else {
            const enemy = [...w.units.values()].find((u) => u.owner !== p.id);
            if (enemy) game.enqueue(p.id, { kind: 'attack', unitIds: ids, targetId: enemy.id });
          }
        }
      game.step();
      const frame = buildFrame(game, 0);
      for (const c of clients) {
        c.sync.collect(frame);
        if (rng() < c.dropRate) continue; // this client was "slow": this tick's message is skipped
        c.state.apply(wire(c.sync.build(frame, game)), tick * 100);
      }
    }

    // Final message for everyone, and comparison with the server.
    game.step();
    const frame = buildFrame(game, 0);
    for (const c of clients) {
      c.sync.collect(frame);
      c.state.apply(wire(c.sync.build(frame, game)), 999_999);
      const s = c.state;
      const units = game.unitViews().map((u) => decodeUnit(encodeUnit(u)));
      expect(s.units.size, `units of client ${c.sync.playerId}`).toBe(units.length);
      for (const u of units) expect(s.units.get(u.id)?.v).toEqual(u);
      const buildings = game.buildingViews(c.sync.playerId).map((b) => decodeBuilding(encodeBuilding(b)));
      expect(s.buildings.size).toBe(buildings.length);
      for (const b of buildings) expect(s.buildings.get(b.id)).toEqual(b);
      expect(s.nodes.size).toBe(w.nodes.size);
      for (const n of w.nodes.values()) expect(s.nodes.get(n.id)?.amount).toBe(n.amount);
      if (c.sync.playerId > 0) expect(s.economy).toEqual(game.economyOf(c.sync.playerId));
      else expect(s.economies.size).toBe(w.players.size);
    }
    // There was real activity.
    expect([...w.buildings.values()].length).toBeGreaterThan(4);
  }, 60_000);

  it("a player does NOT see another player's queue or rally point", () => {
    const game = new Game({ slots: 2, seed: 4 });
    const tc1 = [...game.world.buildings.values()].find((b) => b.owner === 1)!;
    game.enqueue(1, { kind: 'train', buildingId: tc1.id, unit: 'worker' });
    game.enqueue(1, { kind: 'rally', buildingId: tc1.id, x: 5, y: 5 });
    game.step();
    const frame = buildFrame(game, 0);
    const mine = new ClientSync(1).build(frame, game);
    const theirs = new ClientSync(2).build(frame, game);
    const find = (m: typeof mine) => decodeBuilding(m.b!.find((t) => t[0] === tc1.id)!);
    expect(find(mine).queue).toHaveLength(1);
    expect(find(mine).rally).toBeDefined();
    expect(find(theirs).queue).toBeUndefined();
    expect(find(theirs).rally).toBeUndefined();
  });

  it('if nothing changes, the message is tiny', () => {
    const game = new Game({ slots: 4, seed: 4 });
    const sync = new ClientSync(1);
    let frame = buildFrame(game, 0);
    sync.collect(frame);
    const first = JSON.stringify(sync.build(frame, game)).length;
    game.step();
    frame = buildFrame(game, 0);
    sync.collect(frame);
    const second = JSON.stringify(sync.build(frame, game)).length;
    expect(first).toBeGreaterThan(500);
    expect(second).toBeLessThan(60);
  });
});
