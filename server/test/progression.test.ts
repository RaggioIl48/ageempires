// Audit: the whole progression works on a real map, using only player orders:
// build every building, advance through the four ages, research every technology
// and train every unit.
import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS, BUILD_MENU, FACTION_ORDER, TECH_DEFS, UNIT_DEFS, unitAvailable, type BuildingType, type TechId, type UnitType } from '../../shared/data.ts';
import { hasTech, maskOf } from '../../shared/stats.ts';
import type { Building } from '../src/sim/world.ts';
import { newGame, runUntil, workersOf } from './helpers.ts';

const LOTS = { food: 99999, wood: 99999, stone: 99999, metal: 99999 };

describe('full progression on a generated map', () => {
  for (const faction of FACTION_ORDER)
  it(`${faction}: builds everything, reaches the Modern Age and trains every unit`, () => {
    const g = newGame(2, 777);
    const w = g.world;
    const me = w.players.get(1)!;
    me.faction = faction;
    me.resources = { ...LOTS };
    const workers = workersOf(g, 1).map((u) => u.id);

    /** Free spot near the start for a building (spiral search). */
    const spotFor = (type: BuildingType): { tx: number; ty: number } => {
      const s = BUILDING_DEFS[type].size;
      for (let r = 3; r < 30; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const tx = Math.floor(me.start.x) + dx, ty = Math.floor(me.start.y) + dy;
            if (w.placementError(type, tx, ty)) continue;
            // Leave a 1-tile gap around it so nothing gets walled in.
            let clear = true;
            for (let y = ty - 1; y <= ty + s && clear; y++) for (let x = tx - 1; x <= tx + s; x++) if (!w.isFree(x, y)) clear = false;
            if (clear) return { tx, ty };
          }
      throw new Error('no room for ' + type);
    };

    const build = (type: BuildingType): Building => {
      const { tx, ty } = spotFor(type);
      g.enqueue(1, { kind: 'build', unitIds: workers, building: type, tx, ty });
      g.step();
      const b = [...w.buildings.values()].find((x) => x.owner === 1 && x.type === type && x.tx === tx && x.ty === ty);
      expect(b, `${type} was placed`).toBeDefined();
      const secs = runUntil(g, () => b!.progress >= 1, 400);
      expect(secs, `${type} got finished`).toBeLessThan(400);
      return b!;
    };

    const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
    const research = (where: Building, tech: TechId) => {
      g.enqueue(1, { kind: 'research', buildingId: where.id, tech });
      g.step();
      expect(where.queue.some((q) => q.tech === tech), `${tech} queued: ${g.takeNotices(1).join(' / ')}`).toBe(true);
      runUntil(g, () => hasTech(me.techs, tech), TECH_DEFS[tech].time + 5);
      expect(hasTech(me.techs, tech), tech).toBe(true);
    };

    // Houses first so population never blocks training.
    for (let i = 0; i < 5; i++) build('house');
    const built = new Map<BuildingType, Building>();
    const trained = new Set<UnitType>();
    const trainAll = () => {
      for (const [type, b] of built) {
        for (const unit of BUILDING_DEFS[type].trains) {
          if (!unitAvailable(unit, me.era, me.faction) || trained.has(unit)) continue;
          const before = [...w.units.values()].filter((u) => u.owner === 1 && u.type === unit).length;
          g.enqueue(1, { kind: 'train', buildingId: b.id, unit });
          const secs = runUntil(g, () => [...w.units.values()].filter((u) => u.owner === 1 && u.type === unit).length > before, UNIT_DEFS[unit].trainTime + 5);
          expect(secs, `${unit} trained at ${type}: ${g.takeNotices(1).join(' / ')}`).toBeLessThan(Infinity);
          trained.add(unit);
        }
      }
    };

    for (let era = 1; era <= 4; era++) {
      for (const type of BUILD_MENU) {
        const d = BUILDING_DEFS[type];
        if (d.era !== era || built.has(type) || type === 'house' || (d.faction && d.faction !== me.faction)) continue;
        built.set(type, build(type));
      }
      built.set('town_center', tc);
      trainAll();
      // Every technology of this age.
      for (const tech of Object.keys(TECH_DEFS) as TechId[]) {
        const t = TECH_DEFS[tech];
        if (t.advancesTo !== undefined || t.era !== era || (t.faction && t.faction !== faction)) continue;
        const where = [...built.values()].find((b) => BUILDING_DEFS[b.type].researches.includes(tech))!;
        research(where, tech);
      }
      if (era < 4) {
        research(tc, `era${era + 1}` as TechId);
        expect(me.era).toBe(era + 1);
      }
    }
    trainAll();

    const mine = (Object.keys(UNIT_DEFS) as UnitType[]).filter((u) => !UNIT_DEFS[u].faction || UNIT_DEFS[u].faction === me.faction);
    expect([...trained].sort()).toEqual(mine.sort());
    const mineTechs = (Object.keys(TECH_DEFS) as TechId[]).filter((t) => !TECH_DEFS[t].faction || TECH_DEFS[t].faction === faction);
    expect(me.techs).toBe(maskOf(mineTechs));
    for (const type of BUILD_MENU) {
      const d = BUILDING_DEFS[type];
      if (d.faction && d.faction !== me.faction) expect(built.has(type), type).toBe(false);
      else expect(built.has(type) || type === 'house', type).toBe(true);
    }
  });
});
