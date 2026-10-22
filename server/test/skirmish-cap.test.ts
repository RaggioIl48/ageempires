// Hostigamiento con límite (Total War): un tirador a caballo deja de huir tras SKIRMISH_MAX retiradas en
// SKIRMISH_WINDOW segundos, para que el infante que lo persigue lo alcance. Los tiradores de a pie
// siguen retrocediendo sin límite (su velocidad es la de la infantería).
import { describe, expect, it } from 'vitest';
import { flatGame, run } from './helpers.ts';

function line(left: 'spearman' | 'archer', right: 'horse_archer' | 'swordsman') {
  const g = flatGame();
  const w = g.world;
  for (const b of [...w.buildings.values()]) w.removeBuilding(b.id);
  w.setRelation(1, 2, 'war');
  const a = w.addUnit(left, 1, 18.5, 18.5);
  const b = w.addUnit(right, 2, 21.5, 18.5);
  g.enqueue(1, { kind: 'move', unitIds: [a.id], x: 27, y: 19, amove: true });
  return { g, a, b };
}

describe('skirmish limit', () => {
  it('a mounted archer that keeps backing away is caught by the spearman chasing it', () => {
    const { g, a, b } = line('spearman', 'horse_archer');
    const hp0 = b.hp;
    run(g, 30);
    expect(b.hp).toBeLessThan(hp0); // el lancero llega a golpear: ya no le alcanza con huir
    expect(a.hp).toBeGreaterThan(0);
  });

  it('a foot archer still backs away without that limit (the cap is for cavalry only)', () => {
    const g = flatGame();
    const w = g.world;
    for (const bl of [...w.buildings.values()]) w.removeBuilding(bl.id);
    w.setRelation(1, 2, 'war');
    const archer = w.addUnit('archer', 1, 18.5, 18.5);
    const sword = w.addUnit('swordsman', 2, 22.5, 18.5);
    g.enqueue(2, { kind: 'move', unitIds: [sword.id], x: 17, y: 18.5, amove: true }); // el espadachín viene a por él
    run(g, 4);
    expect(archer.x).toBeLessThan(18.5 - 1); // el arquero de pie se aleja a su ritmo
  });
});
