// Piedra, papel o tijera de la Edad Media: lanza > caballería > espada > lanza.
import { describe, expect, it } from 'vitest';
import { SPEAR_BRACE_DAMAGE, TICK_RATE, UNIT_DEFS, type UnitType } from '../../shared/data.ts';
import { damage, unitStats } from '../../shared/stats.ts';
import { strike } from '../src/sim/combat.ts';
import { flatGame, runUntil } from './helpers.ts';

const s = (t: UnitType) => unitStats('germans', t);
/** Daño de un golpe de `a` contra `b` (sin carga, de frente). */
const hit = (a: UnitType, b: UnitType) => {
  const A = s(a), B = s(b);
  return damage(A.attack, A.category, B.category, B.armor, A.bonus, A.weapon, B.weapon);
};
/** Golpes que necesita `a` para matar a `b`. */
const hitsToKill = (a: UnitType, b: UnitType) => Math.ceil(s(b).hp / hit(a, b));

describe('weapons of the Medieval Age', () => {
  it('spears crush cavalry, and cavalry barely scratches spearmen', () => {
    expect(hit('spearman', 'knight')).toBeGreaterThanOrEqual(15);
    expect(hit('knight', 'spearman')).toBeLessThanOrEqual(4);
    expect(hitsToKill('spearman', 'knight')).toBeLessThan(hitsToKill('knight', 'spearman') / 3);
  });

  it('swords are weak against cavalry and cavalry rides them down', () => {
    expect(hit('swordsman', 'knight')).toBeLessThanOrEqual(4);
    expect(hitsToKill('knight', 'swordsman')).toBeLessThan(hitsToKill('swordsman', 'knight') / 4);
  });

  it('swords break spearmen', () => {
    expect(hitsToKill('swordsman', 'spearman')).toBeLessThan(hitsToKill('spearman', 'swordsman') / 2.5);
  });

  it('elite spears and blades keep the rule (a unique weakness always wins)', () => {
    // El carro de guerra galo (bueno contra infantería) no puede con las lanzas.
    expect(hit('war_chariot', 'spearman')).toBeLessThan(hit('war_chariot', 'swordsman') / 2);
    // Las lanzas de élite pegan aún más fuerte a la caballería que el lancero común.
    expect(hit('chosen_spearman', 'knight')).toBeGreaterThan(hit('spearman', 'knight'));
    // El berserker (hacha) sufre contra la caballería.
    expect(hit('berserker', 'knight')).toBeLessThan(hit('berserker', 'spearman'));
  });

  it('a frontal charge into spears is braced: no charge bonus and the rider is hurt', () => {
    const g = flatGame();
    const w = g.world;
    const spear = w.addUnit('spearman', 2, 20.5, 20.5);
    const knight = w.addUnit('knight', 1, 19.6, 20.5);
    // El lancero mira al jinete (de frente).
    [spear.fx, spear.fy] = [-1, 0];
    knight.lastStrike = -999;
    w.tick = 100;
    const st = w.statsOf(knight);
    strike(w, 1, st.attack, st.category, knight, { kind: 'unit', unit: spear }, knight);
    expect(knight.hp).toBe(w.statsOf(knight).hp - SPEAR_BRACE_DAMAGE);
    expect(w.statsOf(spear).hp - spear.hp).toBeLessThanOrEqual(hit('knight', 'spearman'));

    // Por la espalda, la carga sí entra con todo.
    const back = w.addUnit('spearman', 2, 25.5, 20.5);
    [back.fx, back.fy] = [1, 0];
    const k2 = w.addUnit('knight', 1, 24.6, 20.5);
    k2.lastStrike = -999;
    strike(w, 1, st.attack, st.category, k2, { kind: 'unit', unit: back }, k2);
    expect(k2.hp).toBe(w.statsOf(k2).hp);
    expect(w.statsOf(back).hp - back.hp).toBeGreaterThan(hit('knight', 'spearman') * 2);
  });

  /** Batalla de igual costo: devuelve la vida que le queda a cada bando (fracción). */
  const battle = (a: UnitType, na: number, b: UnitType, nb: number) => {
    const g = flatGame(['germans', 'germans']);
    const w = g.world;
    const A = Array.from({ length: na }, (_, i) => w.addUnit(a, 1, 16.5 + (i % 2), 14 + Math.floor(i / 2) * 1.1));
    const B = Array.from({ length: nb }, (_, i) => w.addUnit(b, 2, 21.5 + (i % 2), 14 + Math.floor(i / 2) * 1.1));
    const alive = (xs: typeof A) => xs.filter((u) => u.hp > 0 && w.units.has(u.id));
    const left = (xs: typeof A, t: UnitType) => alive(xs).reduce((n, u) => n + u.hp, 0) / (xs.length * s(t).hp);
    runUntil(g, () => alive(A).length === 0 || alive(B).length === 0, 120);
    return [left(A, a), left(B, b)] as const;
  };
  const cost = (t: UnitType) => Object.values(UNIT_DEFS[t].cost).reduce((x, y) => x + (y ?? 0), 0);

  it('in battle (similar cost): spearmen beat knights, knights beat swordsmen, swordsmen beat spearmen', () => {
    expect(Math.abs(8 * cost('spearman') - 4 * cost('knight'))).toBeLessThan(80);
    const [spears, knights] = battle('spearman', 8, 'knight', 4);
    expect(spears).toBeGreaterThan(knights + 0.3);
    const [swords, knights2] = battle('swordsman', 6, 'knight', 4);
    expect(knights2).toBeGreaterThan(swords + 0.3);
    const [swords2, spears2] = battle('swordsman', 6, 'spearman', 8);
    expect(swords2).toBeGreaterThan(spears2 + 0.3);
  });

  it('the swordsman is trained at the barracks in the Medieval Age', () => {
    expect(UNIT_DEFS.swordsman.era).toBe(2);
    expect(UNIT_DEFS.swordsman.weapon).toBe('blade');
    expect(TICK_RATE).toBeGreaterThan(0);
  });
});
