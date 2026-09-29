// Cada unidad tiene su espacio: la caballería no se superpone a la infantería.
import { describe, expect, it } from 'vitest';
import { BODY_RADIUS } from '../src/sim/movement.ts';
import { flatGame } from './helpers.ts';

describe('espacio de cada unidad', () => {
  it('la caballería que atraviesa una línea de infantería no se le pone encima', () => {
    const g = flatGame();
    const w = g.world;
    const line = Array.from({ length: 8 }, (_, i) => w.addUnit('spearman', 1, 14 + i * 0.7, 20.5));
    const riders = Array.from({ length: 3 }, (_, i) => w.addUnit('scout', 1, 15.5 + i * 1.2, 14.5));
    g.enqueue(1, { kind: 'move', unitIds: riders.map((u) => u.id), x: 17, y: 27 });
    let closest = Infinity;
    for (let t = 0; t < 120; t++) {
      g.step();
      for (const r of riders) for (const s of line) closest = Math.min(closest, Math.hypot(r.x - s.x, r.y - s.y));
    }
    // Pueden rozarse un instante, pero nunca quedar uno dentro del otro.
    expect(closest).toBeGreaterThan((BODY_RADIUS.cavalry + BODY_RADIUS.infantry) * 0.6);
    // Y llegan del otro lado.
    for (const r of riders) expect(r.y).toBeGreaterThan(24);
  });

  it('dos unidades quietas en el mismo lugar se separan según su tamaño', () => {
    const g = flatGame();
    const w = g.world;
    const a = w.addUnit('spearman', 1, 20.5, 20.5);
    const b = w.addUnit('knight', 1, 20.5, 20.5);
    for (let t = 0; t < 30; t++) g.step();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((BODY_RADIUS.infantry + BODY_RADIUS.cavalry) * 0.9);
    // El jinete (más pesado) se movió menos que el lancero.
    expect(Math.hypot(b.x - 20.5, b.y - 20.5)).toBeLessThan(Math.hypot(a.x - 20.5, a.y - 20.5));
  });
});
