// Upgrades (AoE-style unit lines and elites), people's abilities (Total War style)
// and the mid-game economy (storehouse technologies and the Market).
import { describe, expect, it } from 'vitest';
import {
  BUILDING_DEFS,
  CHARGE_BONUS,
  MARKET_LOT,
  MARKET_START,
  MARKET_STEP,
  TECH_DEFS,
  UNIQUE_UNITS,
  UNIT_DEFS,
  sellPrice,
  type FactionId,
} from '../../shared/data.ts';
import { parseClientMessage } from '../../shared/protocol.ts';
import { NO_TECHS, addTech, gatherRate, hasTech, isUpgraded, maskOf, unitLabel, unitStats } from '../../shared/stats.ts';
import { completeTech } from '../src/sim/production.ts';
import { flatGame, run, runUntil } from './helpers.ts';

const RICH = { food: 9999, wood: 9999, stone: 9999, metal: 9999 };

function game(factions: [FactionId, FactionId] = ['romans', 'vikings'], era = 2) {
  const g = flatGame(factions);
  const w = g.world;
  for (const p of w.players.values()) {
    p.resources = { ...RICH };
    if (era >= 2) completeTech(w, p.id, 'era2');
    if (era >= 3) completeTech(w, p.id, 'era3');
  }
  return { g, w };
}

describe('technology masks', () => {
  it('any number of technologies fits in the mask (it is a hexadecimal text)', () => {
    const all = Object.keys(TECH_DEFS) as (keyof typeof TECH_DEFS)[];
    expect(all.length).toBeGreaterThan(53);
    const m = maskOf(all);
    expect(typeof m).toBe('string');
    for (const t of all) expect(hasTech(m, t), t).toBe(true);
    const last = all[all.length - 1];
    expect(hasTech(maskOf([last]), all[0])).toBe(false);
    expect(addTech(addTech(NO_TECHS, last), last)).toBe(maskOf([last])); // adding twice changes nothing
    expect(hasTech(NO_TECHS, 'tools')).toBe(false);
  });
});

describe('unit upgrades (AoE style)', () => {
  it('Pikeman: spearmen get stronger and change their name, including the ones already on the map', () => {
    const { g, w } = game();
    const barracks = w.addBuilding('barracks', 1, 12, 12)!;
    const spear = w.addUnit('spearman', 1, 16.5, 16.5);
    spear.hp -= 10;
    const before = unitStats('romans', 'spearman', w.players.get(1)!.techs);
    g.enqueue(1, { kind: 'research', buildingId: barracks.id, tech: 'pikeman' });
    run(g, TECH_DEFS.pikeman.time + 1);
    const mask = w.players.get(1)!.techs;
    const after = unitStats('romans', 'spearman', mask);
    expect(after.hp).toBeGreaterThan(before.hp);
    expect(after.attack.damage).toBeGreaterThan(before.attack.damage);
    expect(unitLabel('spearman', mask)).toBe('Pikeman');
    expect(isUpgraded('spearman', mask)).toBe(true);
    expect(spear.hp).toBeCloseTo(((before.hp - 10) * after.hp) / before.hp); // same proportion of health
  });

  it('every unique unit has an elite version, researched only by its people at its unique building', () => {
    for (const u of UNIQUE_UNITS) {
      const t = TECH_DEFS[`elite_${u}`];
      expect(t.faction).toBe(UNIT_DEFS[u].faction);
      const home = Object.values(BUILDING_DEFS).find((b) => b.trains.includes(u))!;
      expect(home.researches).toContain(`elite_${u}`);
    }
    const { g, w } = game(['mongols', 'romans']);
    const ordu = w.addBuilding('ordu', 1, 12, 12)!;
    g.enqueue(1, { kind: 'research', buildingId: ordu.id, tech: 'elite_horse_archer' });
    run(g, TECH_DEFS.elite_horse_archer.time + 1);
    const m = w.players.get(1)!.techs;
    // The Mongol elite horse archer: recurve bow, +1 range.
    expect(unitStats('mongols', 'horse_archer', m).attack.range).toBe(UNIT_DEFS.horse_archer.attack.range + 1);
    expect(unitLabel('horse_archer', m)).toBe('Elite Horse Archer');
  });

  it('Man-at-Arms is available from the Tribal Age', () => {
    const { g, w } = game(['romans', 'vikings'], 1);
    const barracks = w.addBuilding('barracks', 1, 12, 12)!;
    g.enqueue(1, { kind: 'research', buildingId: barracks.id, tech: 'man_at_arms' });
    g.step();
    expect(barracks.queue.map((q) => q.tech)).toEqual(['man_at_arms']);
  });
});

describe("peoples' abilities (Total War style)", () => {
  it('cavalry charge: the first hit after a while hits harder; Ostrogoths hit hardest', () => {
    const hitOf = (faction: FactionId) => {
      const g = flatGame([faction, 'romans']);
      const w = g.world;
      const k = w.addUnit('knight', 1, 20.5, 20.5);
      const target = w.addUnit('warrior', 2, 21.3, 20.5);
      target.cooldown = 999; // it does not fight back
      const hp0 = target.hp;
      g.enqueue(1, { kind: 'attack', unitIds: [k.id], targetId: target.id });
      runUntil(g, () => target.hp < hp0, 10);
      const first = hp0 - target.hp;
      const hp1 = target.hp;
      runUntil(g, () => target.hp < hp1, 10);
      return { first, second: hp1 - target.hp };
    };
    const germans = hitOf('germans');
    expect(germans.first).toBeGreaterThan(germans.second);
    expect(germans.first / germans.second).toBeCloseTo(CHARGE_BONUS, 0);
    const ostro = hitOf('ostrogoths');
    expect(ostro.first).toBeGreaterThan(germans.first);
  });

  it('Viking infantry heals over time; Berserkers heal even faster', () => {
    const { g, w } = game(['vikings', 'romans']);
    const warrior = w.addUnit('spearman', 1, 20.5, 20.5);
    const berserker = w.addUnit('berserker', 1, 22.5, 20.5);
    warrior.hp = 20;
    berserker.hp = 20;
    run(g, 10);
    expect(warrior.hp).toBeCloseTo(20 + 0.5 * 10, 0);
    expect(berserker.hp).toBeCloseTo(20 + 2 * 10, 0);
    // A Roman spearman does not heal.
    const roman = w.addUnit('spearman', 2, 30.5, 20.5);
    roman.hp = 20;
    run(g, 5);
    expect(roman.hp).toBe(20);
  });

  it('the Gallic Nemeton heals nearby units (druids)', () => {
    const { g, w } = game(['gauls', 'romans']);
    w.addBuilding('nemeton', 1, 15, 15);
    const near = w.addUnit('spearman', 1, 19.5, 16.5);
    const far = w.addUnit('spearman', 1, 30.5, 10.5);
    near.hp = far.hp = 10;
    run(g, 5);
    expect(near.hp).toBeCloseTo(20, 0);
    expect(far.hp).toBe(10);
  });

  it('Romans build faster; Germans train infantry faster', () => {
    const buildTime = (faction: FactionId) => {
      const { g, w } = game([faction, 'romans'], 1);
      const u = w.addUnit('worker', 1, 11.5, 11.5);
      g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'house', tx: 12, ty: 12 });
      g.step();
      const house = [...w.buildings.values()].find((b) => b.type === 'house')!;
      return runUntil(g, () => house.progress >= 1);
    };
    expect(buildTime('romans')).toBeLessThan(buildTime('mongols') * 0.85);

    const trainTime = (faction: FactionId) => {
      const { g, w } = game([faction, 'romans'], 1);
      w.addBuilding('house', 1, 20, 20);
      const barracks = w.addBuilding('barracks', 1, 12, 12)!;
      g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'warrior' });
      return runUntil(g, () => [...w.units.values()].some((u) => u.type === 'warrior'));
    };
    expect(trainTime('germans')).toBeLessThan(trainTime('romans') * 0.85);
  });
});

describe('mid-game economy', () => {
  it('storehouse technologies speed up gathering; farms hold more food', () => {
    const m = maskOf(['double_axe', 'stone_mining', 'metal_mining']);
    expect(gatherRate('romans', 'wood', false, m)).toBeCloseTo(gatherRate('romans', 'wood') * 1.2);
    expect(gatherRate('romans', 'metal', false, m)).toBeCloseTo(gatherRate('romans', 'metal') * 1.2);
    expect(BUILDING_DEFS.storehouse.researches).toContain('double_axe');
    expect(BUILDING_DEFS.farm.field!.amount).toBeGreaterThanOrEqual(400);
  });

  it('Market: buying raises the price, selling lowers it, and prices are the same for everyone', () => {
    const { g, w } = game();
    const market = w.addBuilding('market', 1, 12, 12)!;
    const p = w.players.get(1)!;
    g.enqueue(1, { kind: 'trade', buildingId: market.id, resource: 'stone', buy: true });
    g.step();
    expect(p.resources.stone).toBe(RICH.stone + MARKET_LOT);
    expect(p.resources.metal).toBe(RICH.metal - MARKET_START.stone);
    expect(w.market.stone).toBe(MARKET_START.stone + MARKET_STEP);
    g.enqueue(1, { kind: 'trade', buildingId: market.id, resource: 'food', buy: false });
    g.step();
    expect(p.resources.food).toBe(RICH.food - MARKET_LOT);
    expect(p.resources.metal).toBe(RICH.metal - MARKET_START.stone + sellPrice(MARKET_START.food));
    expect(w.market.food).toBe(MARKET_START.food - MARKET_STEP);
    // Someone else's market, or without enough to sell: nothing happens.
    const theirs = w.addBuilding('market', 2, 25, 25)!;
    const before = { ...p.resources };
    g.enqueue(1, { kind: 'trade', buildingId: theirs.id, resource: 'wood', buy: true });
    p.resources.wood = 50;
    g.enqueue(1, { kind: 'trade', buildingId: market.id, resource: 'wood', buy: false });
    g.step();
    expect(p.resources.metal).toBe(before.metal);
    expect(g.takeNotices(1).some((n) => n.includes('to sell'))).toBe(true);
  });

  it('the trade order is validated', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'trade', buildingId: 3, resource: 'wood', buy: true } }))).toBeTruthy();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'trade', buildingId: 3, resource: 'metal', buy: true } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'trade', buildingId: 3, resource: 'wood', buy: 'yes' } }))).toBeNull();
  });
});

describe('unit guide counters', () => {
  it('only name enemies from the same ages', async () => {
    const { goodAgainst, weakAgainst } = await import('../../shared/counters.ts');
    expect(weakAgainst('scout').join()).not.toMatch(/Anti-tank|Armored/);
    expect(weakAgainst('scout').join()).toMatch(/Infantry/);
    expect(weakAgainst('knight').join()).toMatch(/Spearman/);
    expect(goodAgainst('archer').join()).not.toMatch(/Aircraft/);
    expect(goodAgainst('rifleman').join()).toMatch(/Aircraft/);
    expect(weakAgainst('tank').join()).toMatch(/Anti-tank/);
    expect(weakAgainst('airplane').join()).toMatch(/only ranged/);
  });
});

describe('cost technologies (units and buildings get cheaper)', () => {
  it('Standardized Arms: units cost 20% less metal; Woodworking: 20% less wood; they stack with Mass Production', async () => {
    const { unitCost, buildingCost } = await import('../../shared/stats.ts');
    expect(unitCost('knight', maskOf(['standard_arms'])).metal).toBe(Math.round(UNIT_DEFS.knight.cost.metal! * 0.8));
    expect(unitCost('archer', maskOf(['woodworking'])).wood).toBe(Math.round(UNIT_DEFS.archer.cost.wood! * 0.8));
    expect(unitCost('archer', maskOf(['woodworking', 'mass_production'])).wood).toBe(Math.round(UNIT_DEFS.archer.cost.wood! * 0.8 * 0.85));
    // Supplies only for infantry; Horse Breeding only for cavalry.
    expect(unitCost('spearman', maskOf(['supplies'])).food).toBe(Math.round(UNIT_DEFS.spearman.cost.food! * 0.8));
    expect(unitCost('knight', maskOf(['supplies'])).food).toBe(UNIT_DEFS.knight.cost.food);
    expect(unitCost('knight', maskOf(['horse_breeding'])).food).toBe(Math.round(UNIT_DEFS.knight.cost.food! * 0.8));
    // Masons' Guild: buildings, walls and towers need less stone.
    expect(buildingCost('tower', maskOf(['masons_guild'])).stone).toBe(Math.round(BUILDING_DEFS.tower.cost.stone! * 0.75));
  });

  it('the server charges the reduced price and refunds exactly what was paid', () => {
    const { g, w } = game(['romans', 'vikings']);
    const stable = w.addBuilding('stable', 1, 12, 12)!;
    const center = w.addBuilding('tech_center', 1, 16, 12)!;
    g.enqueue(1, { kind: 'research', buildingId: center.id, tech: 'standard_arms' });
    run(g, TECH_DEFS.standard_arms.time + 1);
    const p = w.players.get(1)!;
    const metal = p.resources.metal;
    g.enqueue(1, { kind: 'train', buildingId: stable.id, unit: 'knight' });
    g.step();
    expect(p.resources.metal).toBe(metal - Math.round(UNIT_DEFS.knight.cost.metal! * 0.8));
    g.enqueue(1, { kind: 'cancelTrain', buildingId: stable.id, index: 0 });
    g.step();
    expect(p.resources.metal).toBe(metal);
  });
});
