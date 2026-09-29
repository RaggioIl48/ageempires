// Colinas (Total War): ciudades sobre una meseta, más daño y alcance desde lo alto, subir cuesta.
import { describe, expect, it } from 'vitest';
import { ELEV_DAMAGE_MAX, ELEV_DAMAGE_MIN } from '../../shared/data.ts';
import { decodeTiles, encodeTiles } from '../../shared/protocol.ts';
import { HeightField, elevationDamage } from '../../shared/terrain.ts';
import { strike, withHeight } from '../src/sim/combat.ts';
import { uphill } from '../src/sim/movement.ts';
import { CITY_HILL } from '../src/sim/mapgen.ts';
import { flatGame, newGame } from './helpers.ts';

/** Una loma cuadrada de nivel `lv` en [x0, x1) × [y0, y1). */
function hill(w: ReturnType<typeof flatGame>['world'], x0: number, y0: number, x1: number, y1: number, lv: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w.levels[y * w.size + x] = lv;
  w.updateHeights();
}

describe('relieve', () => {
  it('la superficie es suave: en la meseta vale su nivel y en la ladera, algo intermedio', () => {
    const levels = new Uint8Array(10 * 10);
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) levels[y * 10 + x] = 2;
    const h = new HeightField(10, levels);
    expect(h.at(5, 5)).toBeCloseTo(2);
    expect(h.at(0.5, 0.5)).toBeCloseTo(0);
    const slope = h.at(3, 5);
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeLessThan(2);
  });

  it('cada ciudad está sobre una meseta, igual para todos, y el agua queda en el llano', () => {
    const g = newGame(4);
    const w = g.world;
    for (const p of w.players.values()) {
      expect(w.heightAt(p.start.x + 0.5, p.start.y + 0.5)).toBeGreaterThanOrEqual(1.9);
      // Un poco más allá del borde de la meseta, se baja.
      const out = CITY_HILL[1] + 4;
      const lows = [0, 1, 2, 3].map((k) => w.heightAt(p.start.x + Math.cos(k * 1.57) * out, p.start.y + Math.sin(k * 1.57) * out));
      expect(Math.min(...lows)).toBeLessThan(1.5);
    }
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === 1) expect(w.levels[i]).toBe(0);
    expect(decodeTiles(encodeTiles(w.levels), w.size)).toEqual(w.levels);
  });

  it('desde lo alto se pega más fuerte; desde abajo, menos (con límites)', () => {
    expect(elevationDamage(2, 0)).toBeGreaterThan(1);
    expect(elevationDamage(0, 2)).toBeLessThan(1);
    expect(elevationDamage(10, 0)).toBe(ELEV_DAMAGE_MAX);
    expect(elevationDamage(0, 10)).toBe(ELEV_DAMAGE_MIN);
    const g = flatGame();
    const w = g.world;
    hill(w, 18, 18, 24, 24, 2);
    const hit = (ax: number, ay: number, tx: number, ty: number) => {
      const foe = w.addUnit('spearman', 2, tx, ty);
      const att = w.addUnit('warrior', 1, ax, ay);
      [foe.fx, foe.fy] = [ax - tx, ay - ty]; // de frente
      const st = w.statsOf(att);
      strike(w, 1, st.attack, st.category, att, { kind: 'unit', unit: foe }, att);
      const d = w.statsOf(foe).hp - foe.hp;
      w.units.delete(foe.id);
      w.units.delete(att.id);
      return d;
    };
    const sameHill = hit(21, 21, 21, 21.8); // los dos arriba
    const flat = hit(5.5, 5.5, 5.5, 6.3);
    const fromAbove = hit(20.5, 23.2, 20.5, 26.5); // arriba contra abajo
    const fromBelow = hit(20.5, 26.5, 20.5, 23.2); // abajo contra arriba
    expect(sameHill).toBe(flat); // misma altura: igual
    expect(fromAbove).toBeGreaterThan(flat);
    expect(fromBelow).toBeLessThan(flat);
  });

  it('los arqueros en la loma disparan más lejos', () => {
    const g = flatGame();
    const w = g.world;
    hill(w, 18, 18, 24, 24, 2);
    const archer = w.addUnit('archer', 1, 21, 21);
    const foe = w.addUnit('warrior', 2, 21, 30);
    const base = w.statsOf(archer).attack;
    expect(withHeight(w, base, archer, { kind: 'unit', unit: foe }).range).toBeGreaterThan(base.range);
    expect(withHeight(w, base, foe, { kind: 'unit', unit: archer }).range).toBe(base.range); // desde abajo, no
  });

  it('subir cuesta es más lento; bajar o andar en llano, no', () => {
    const g = flatGame();
    const w = g.world;
    hill(w, 18, 10, 30, 30, 3);
    const u = w.addUnit('warrior', 1, 17.2, 20.5);
    u.path = [{ x: 22.5, y: 20.5 }];
    expect(uphill(w, u)).toBeLessThan(1);
    u.path = [{ x: 8.5, y: 20.5 }];
    expect(uphill(w, u)).toBe(1);
  });
});
