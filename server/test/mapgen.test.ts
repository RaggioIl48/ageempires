import { describe, expect, it } from 'vitest';
import { NODE_DEFS, STARTING_UNITS, type ResourceType } from '../../shared/data.ts';
import { generateWorld, mapSizeFor } from '../src/sim/mapgen.ts';
import { pathToRect } from '../src/sim/pathfinding.ts';

describe('generación de mapa', () => {
  it('es determinista: la misma semilla da el mismo mapa', () => {
    const a = generateWorld({ slots: 4, seed: 42 });
    const b = generateWorld({ slots: 4, seed: 42 });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.nodes.size).toBe(b.nodes.size);
  });

  it('crece con la cantidad de jugadores', () => {
    expect(mapSizeFor(16)).toBeGreaterThan(mapSizeFor(4));
  });

  for (const slots of [2, 4, 8, 16]) {
    it(`da a cada uno de ${slots} jugadores un Centro Urbano, ${STARTING_UNITS.length} unidades iniciales y los mismos recursos cerca`, () => {
      const w = generateWorld({ slots, seed: 7 + slots });
      expect(w.players.size).toBe(slots);
      const counts: Record<ResourceType, number>[] = [];
      for (const p of w.players.values()) {
        const tcs = [...w.buildings.values()].filter((b) => b.owner === p.id && b.type === 'town_center');
        expect(tcs).toHaveLength(1);
        const mine = [...w.units.values()].filter((u) => u.owner === p.id).map((u) => u.type).sort();
        expect(mine).toEqual([...STARTING_UNITS].sort());

        const c: Record<ResourceType, number> = { food: 0, wood: 0, stone: 0, metal: 0 };
        for (const n of w.nodes.values())
          if (Math.hypot(n.tx - p.start.x, n.ty - p.start.y) <= 11) c[NODE_DEFS[n.type].resource]++;
        counts.push(c);
      }
      // Justicia: comida, piedra y metal idénticos; madera casi igual.
      for (const c of counts) {
        expect(c.food).toBe(counts[0].food);
        expect(c.stone).toBe(counts[0].stone);
        expect(c.metal).toBe(counts[0].metal);
        expect(Math.abs(c.wood - counts[0].wood)).toBeLessThanOrEqual(4);
        expect(c.food).toBeGreaterThan(0);
        expect(c.stone).toBeGreaterThan(0);
        expect(c.metal).toBeGreaterThan(0);
        expect(c.wood).toBeGreaterThan(20);
      }
    });
  }

  it('cada trabajador inicial puede llegar a su piedra y su metal', () => {
    const w = generateWorld({ slots: 4, seed: 99 });
    for (const u of w.units.values()) {
      const p = w.players.get(u.owner)!;
      for (const res of ['stone', 'metal'] as const) {
        const nearest = [...w.nodes.values()]
          .filter((n) => NODE_DEFS[n.type].resource === res)
          .sort((a, b) => Math.hypot(a.tx - p.start.x, a.ty - p.start.y) - Math.hypot(b.tx - p.start.x, b.ty - p.start.y))[0];
        expect(pathToRect(w, u, nearest.tx, nearest.ty, 1)).not.toBeNull();
      }
    }
  });
});
