// Historical peoples (unique units and buildings), AoE-style long walls,
// contested resources in the center and the almost impossible Modern Age.
import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS, FACTIONS, FACTION_ORDER, TECH_DEFS, UNIT_DEFS, uniquesOf, type FactionId } from '../../shared/data.ts';
import { parseClientMessage } from '../../shared/protocol.ts';
import { unitStats } from '../../shared/stats.ts';
import { wallLine } from '../../shared/wall.ts';
import { generateWorld } from '../src/sim/mapgen.ts';
import { completeTech } from '../src/sim/production.ts';
import { flatGame, run, runUntil } from './helpers.ts';

const RICH = { food: 9999, wood: 9999, stone: 9999, metal: 9999 };

function medievalGame(factions: [FactionId, FactionId] = ['romans', 'vikings']) {
  const g = flatGame(factions);
  const w = g.world;
  for (const p of w.players.values()) p.resources = { ...RICH };
  completeTech(w, 1, 'era2');
  completeTech(w, 2, 'era2');
  return { g, w };
}

describe('historical peoples', () => {
  it('there are 7 peoples, each with 2 unique Medieval units and 1 unique building', () => {
    expect(FACTION_ORDER).toEqual(['romans', 'mongols', 'gauls', 'germans', 'visigoths', 'ostrogoths', 'vikings']);
    for (const f of FACTION_ORDER) {
      const u = uniquesOf(f);
      expect(u.units, f).toHaveLength(2);
      expect(u.building, f).toBeDefined();
      const b = BUILDING_DEFS[u.building!];
      expect(b.era).toBe(2);
      expect([...b.trains].sort()).toEqual([...u.units].sort());
      for (const unit of u.units) expect(UNIT_DEFS[unit].era).toBe(2);
      expect(FACTIONS[f].strengths.length).toBeGreaterThan(0);
      expect(FACTIONS[f].weaknesses.length).toBeGreaterThan(0);
    }
  });

  it('only the Romans can build a Castrum, and only in the Medieval Age', () => {
    const g = flatGame(['romans', 'vikings']);
    const w = g.world;
    for (const p of w.players.values()) p.resources = { ...RICH };
    const roman = w.addUnit('worker', 1, 14.5, 14.5);
    const viking = w.addUnit('worker', 2, 25.5, 25.5);
    g.enqueue(1, { kind: 'build', unitIds: [roman.id], building: 'castrum', tx: 15, ty: 15 });
    g.step();
    expect(g.takeNotices(1).some((n) => n.includes('Medieval Age'))).toBe(true);
    completeTech(w, 1, 'era2');
    completeTech(w, 2, 'era2');
    g.enqueue(1, { kind: 'build', unitIds: [roman.id], building: 'castrum', tx: 15, ty: 15 });
    g.enqueue(2, { kind: 'build', unitIds: [viking.id], building: 'castrum', tx: 26, ty: 26 });
    g.step();
    const castra = [...w.buildings.values()].filter((b) => b.type === 'castrum');
    expect(castra.map((b) => b.owner)).toEqual([1]);
    expect(g.takeNotices(2).some((n) => n.includes('only the Romans'))).toBe(true);
    expect(w.players.get(2)!.resources).toEqual(RICH);
  });

  it('a unique building trains only its own people’s units', () => {
    const { g, w } = medievalGame();
    const castrum = w.addBuilding('castrum', 1, 15, 15)!;
    g.enqueue(1, { kind: 'train', buildingId: castrum.id, unit: 'berserker' }); // Viking unit
    g.enqueue(1, { kind: 'train', buildingId: castrum.id, unit: 'legionary' });
    g.step();
    expect(castrum.queue.map((q) => q.unit)).toEqual(['legionary']);
    const secs = runUntil(g, () => [...w.units.values()].some((u) => u.type === 'legionary'));
    expect(secs).toBeLessThan(UNIT_DEFS.legionary.trainTime + 2);
  });

  it('the Castrum shoots like a tower; the Ordu gives +10 population', () => {
    const { g, w } = medievalGame(['romans', 'mongols']);
    w.addBuilding('castrum', 1, 15, 15);
    const enemy = w.addUnit('warrior', 2, 20.5, 16.5);
    const hp = enemy.hp;
    run(g, 3);
    expect(enemy.hp).toBeLessThan(hp);
    const before = w.popOf(2).popCap;
    w.addBuilding('ordu', 2, 28, 22);
    expect(w.popOf(2).popCap).toBe(before + 10);
  });

  it('Total War style counters: spearmen stop cavalry, berserkers crush infantry, scorpions shred infantry', () => {
    const chosen = unitStats('germans', 'chosen_spearman');
    const keshig = unitStats('mongols', 'keshig');
    const spearHit = Math.round(chosen.attack.damage * 2.5 - keshig.armor.melee);
    expect(spearHit).toBeGreaterThanOrEqual(17);
    const berserker = unitStats('vikings', 'berserker');
    expect(berserker.attack.damage).toBeGreaterThan(unitStats('vikings', 'warrior').attack.damage * 2);
    expect(UNIT_DEFS.scorpion.bonus?.infantry).toBe(2);
  });

  it('battle: 3 Chosen Spearmen beat 2 Keshig', () => {
    const g = flatGame(['germans', 'mongols']);
    const w = g.world;
    const spears = [0, 1, 2].map((i) => w.addUnit('chosen_spearman', 1, 18.5, 18.5 + i));
    const riders = [0, 1].map((i) => w.addUnit('keshig', 2, 21.5, 18.5 + i));
    runUntil(g, () => riders.every((u) => u.hp <= 0) || spears.every((u) => u.hp <= 0), 60);
    expect(riders.every((u) => u.hp <= 0)).toBe(true);
    expect(spears.some((u) => u.hp > 0)).toBe(true);
  });
});

describe('long walls (AoE style)', () => {
  it('the wall line is continuous: each section shares a side with the next one (stairs on diagonals)', () => {
    expect(wallLine(2, 2, 6, 2)).toHaveLength(5);
    const diag = wallLine(0, 0, 4, 4);
    expect(diag).toHaveLength(9);
    for (const line of [diag, wallLine(0, 0, 10, 3), wallLine(9, 1, 2, 7)]) {
      for (let i = 1; i < line.length; i++)
        expect(Math.abs(line[i].x - line[i - 1].x) + Math.abs(line[i].y - line[i - 1].y)).toBe(1);
    }
    expect(wallLine(0, 0, 10, 3).at(-1)).toEqual({ x: 10, y: 3 });
    expect(wallLine(9, 1, 2, 7).at(-1)).toEqual({ x: 2, y: 7 });
    expect(wallLine(0, 0, 500, 3)).toHaveLength(60);
  });

  it('one order lays a whole wall, skips occupied tiles and charges per section', () => {
    const g = flatGame();
    const w = g.world;
    w.players.get(1)!.resources = { ...RICH };
    w.addNode('tree', 18, 12);
    const workers = [0, 1, 2].map((i) => w.addUnit('worker', 1, 14.5 + i, 14.5));
    g.enqueue(1, { kind: 'wall', unitIds: workers.map((u) => u.id), x0: 12, y0: 12, x1: 27, y1: 12 });
    g.step();
    const walls = [...w.buildings.values()].filter((b) => b.type === 'wall');
    expect(walls).toHaveLength(15); // 16 tiles, one has a tree
    expect(w.players.get(1)!.resources.stone).toBe(RICH.stone - 15 * BUILDING_DEFS.wall.cost.stone!);
    // Builders go on to the next section by themselves until the whole wall is up.
    const secs = runUntil(g, () => walls.every((b) => b.progress >= 1), 400);
    expect(secs).toBeLessThan(400);
  });

  it('without enough stone, the wall stops where the money runs out', () => {
    const g = flatGame();
    const w = g.world;
    w.players.get(1)!.resources.stone = 5 * BUILDING_DEFS.wall.cost.stone! + 2;
    const u = w.addUnit('worker', 1, 14.5, 14.5);
    g.enqueue(1, { kind: 'wall', unitIds: [u.id], x0: 12, y0: 16, x1: 30, y1: 16 });
    g.step();
    expect([...w.buildings.values()].filter((b) => b.type === 'wall')).toHaveLength(5);
    expect(g.takeNotices(1).some((n) => n.includes('Not enough stone'))).toBe(true);
  });

  it('a gate placed on your own wall replaces that section', () => {
    const g = flatGame();
    const w = g.world;
    w.players.get(1)!.resources = { ...RICH };
    const piece = w.addBuilding('wall', 1, 20, 20)!;
    const u = w.addUnit('worker', 1, 18.5, 20.5);
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'gate', tx: 20, ty: 20 });
    g.step();
    expect(w.buildings.has(piece.id)).toBe(false);
    expect([...w.buildings.values()].some((b) => b.type === 'gate' && b.tx === 20 && b.ty === 20)).toBe(true);
    // Someone else's wall cannot be turned into your gate.
    const theirs = w.addBuilding('wall', 2, 24, 20)!;
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'gate', tx: 24, ty: 20 });
    g.step();
    expect(w.buildings.has(theirs.id)).toBe(true);
  });

  it('the wall order is validated', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'wall', unitIds: [1], x0: 1, y0: 2, x1: 5, y1: 2 } }))).toBeTruthy();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'wall', unitIds: [1], x0: 1.5, y0: 2, x1: 5, y1: 2 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'wall', unitIds: [1], x0: 1, y0: 2 } }))).toBeNull();
  });
});

describe('map and ages', () => {
  it('rich deposits of metal and stone in the center, one between each pair of neighbors', () => {
    for (const slots of [2, 4, 8]) {
      const w = generateWorld({ slots, seed: 42 });
      const c = w.size / 2;
      const central = [...w.nodes.values()].filter((n) => n.type !== 'tree' && Math.hypot(n.tx - c, n.ty - c) < w.size * 0.16);
      expect(central.filter((n) => n.type === 'metal').length, `${slots} players`).toBe(5 * slots);
      expect(central.filter((n) => n.type === 'stone').length, `${slots} players`).toBe(3 * slots);
    }
  });

  it('the Modern Age is almost impossible: it costs more than a base can gather from its own metal', () => {
    const w = generateWorld({ slots: 2, seed: 7 });
    const p = w.players.get(1)!;
    const ownMetal = [...w.nodes.values()]
      .filter((n) => n.type === 'metal' && Math.hypot(n.tx - p.start.x, n.ty - p.start.y) < 25)
      .reduce((a, n) => a + n.amount, 0);
    expect(TECH_DEFS.era4.cost.metal!).toBeGreaterThan(ownMetal);
    expect(TECH_DEFS.era4.time).toBeGreaterThanOrEqual(300);
  });
});
