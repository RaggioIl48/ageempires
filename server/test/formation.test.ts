// Formaciones: frente dibujado arrastrando con el clic derecho (Total War) y mirar al frente al llegar.
import { describe, expect, it } from 'vitest';
import { dragFacing, formationLayout, RANK_SPACING } from '../../shared/formation.ts';
import { parseClientMessage } from '../../shared/protocol.ts';

const parseCommand = (cmd: object) => {
  const m = parseClientMessage(JSON.stringify({ t: 'cmd', cmd }));
  return m && m.t === 'cmd' ? m.cmd : null;
};
import { flatGame, run } from './helpers.ts';

describe('frente de formación', () => {
  it('el frente mira hacia el lado contrario a donde está el grupo', () => {
    const f = dragFacing({ x: 10, y: 20 }, { x: 20, y: 20 }, { x: 15, y: 10 });
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(1); // el grupo está "arriba" (y menor): avanza hacia y mayor
  });

  it('el ancho arrastrado decide cuántos van en la primera fila', () => {
    const counts = new Map([[0, 12]]);
    const wide = formationLayout(counts, 20, 20, 0, 1, 'line', 11 * RANK_SPACING).get(0)!;
    const narrow = formationLayout(counts, 20, 20, 0, 1, 'line', 3 * RANK_SPACING).get(0)!;
    const firstRow = (spots: { x: number; y: number }[]) => spots.filter((s) => Math.abs(s.y - spots[0].y) < 1e-6).length;
    expect(firstRow(wide)).toBe(12);
    expect(firstRow(narrow)).toBe(4);
  });

  it('los soldados se ponen en línea sobre el frente y, al llegar, miran hacia adelante', () => {
    const g = flatGame();
    const w = g.world;
    const units = Array.from({ length: 6 }, (_, i) => w.addUnit('spearman', 1, 10.5 + (i % 3), 10.5 + Math.floor(i / 3)));
    // Frente de 5 casillas en x = 20, mirando hacia +x.
    g.enqueue(1, { kind: 'move', unitIds: units.map((u) => u.id), x: 20, y: 20, formation: 'line', front: { fx: 1, fy: 0, width: 5 } });
    run(g, 15);
    for (const u of units) {
      expect(u.state).toBe('idle');
      expect(u.fx).toBeCloseTo(1);
      expect(u.fy).toBeCloseTo(0);
      expect(Math.abs(u.x - 20)).toBeLessThan(0.6); // todos en la misma fila (x ≈ 20)
    }
    const ys = units.map((u) => u.y).sort((a, b) => a - b);
    expect(ys[ys.length - 1] - ys[0]).toBeGreaterThan(3.5); // desplegados a lo ancho
  });

  it('la red valida el frente', () => {
    const ok = parseCommand({ kind: 'move', unitIds: [1], x: 3, y: 4, front: { fx: 3, fy: 4, width: 6 } });
    expect(ok).toMatchObject({ kind: 'move', front: { fx: 0.6, fy: 0.8, width: 6 } });
    const bad = parseCommand({ kind: 'move', unitIds: [1], x: 3, y: 4, front: { fx: 0, fy: 0, width: 6 } });
    expect(bad).toMatchObject({ kind: 'move' });
    expect((bad as { front?: unknown }).front).toBeUndefined();
  });
});
