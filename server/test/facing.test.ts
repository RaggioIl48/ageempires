// Estado del cliente para el arte de sprites: hacia dónde mira cada unidad y
// qué unidades quedan "caídas" un momento para animar su muerte.
import { describe, expect, it } from 'vitest';
import { encodeEvent, encodeUnit } from '../../shared/codec.ts';
import type { DeltaMessage, UnitView } from '../../shared/protocol.ts';
import { ClientState } from '../../client/src/state.ts';

const unit = (over: Partial<UnitView>): UnitView => ({ id: 1, owner: 1, type: 'warrior', x: 10, y: 10, hp: 50, state: 'idle', ...over });
const delta = (k: number, d: Partial<DeltaMessage>): DeltaMessage => ({ t: 'd', k, ...d });

describe('orientación y caídos (cliente)', () => {
  it('mira hacia donde camina, en ángulo de pantalla isométrica', () => {
    const s = new ClientState();
    s.size = 64;
    s.apply(delta(1, { u: [encodeUnit(unit({}))] }), 0);
    expect(s.units.get(1)!.face).toBeCloseTo(Math.PI / 2); // al principio mira a la cámara
    // +x en casillas = abajo a la derecha en pantalla (≈ 26,6°).
    s.apply(delta(2, { p: [1, 1100, 1000] }), 100);
    expect(s.units.get(1)!.face).toBeCloseTo(Math.atan2(0.5, 1));
    // −y en casillas = arriba a la derecha.
    s.apply(delta(3, { p: [1, 1100, 900] }), 200);
    expect(s.units.get(1)!.face).toBeCloseTo(Math.atan2(-0.5, 1));
  });

  it('al pelear mira a su objetivo aunque esté quieta', () => {
    const s = new ClientState();
    s.size = 64;
    s.apply(delta(1, { u: [encodeUnit(unit({})), encodeUnit(unit({ id: 2, owner: 2, x: 8, y: 10 }))] }), 0);
    s.apply(delta(2, { u: [encodeUnit(unit({ state: 'attacking', targetId: 2 }))] }), 100);
    // El objetivo está en −x: arriba a la izquierda en pantalla.
    expect(Math.cos(s.units.get(1)!.face)).toBeLessThan(0);
    expect(Math.sin(s.units.get(1)!.face)).toBeLessThan(0);
  });

  it('una unidad que muere en combate queda caída; una que solo desaparece, no', () => {
    const s = new ClientState();
    s.size = 64;
    s.apply(delta(1, { u: [encodeUnit(unit({})), encodeUnit(unit({ id: 2, x: 30, y: 30 }))] }), 0);
    s.apply(delta(2, { ur: [1, 2], e: [encodeEvent({ k: 'death', x: 10, y: 10 })] }), 100);
    expect(s.corpses.map((c) => c.v.id)).toEqual([1]);
    expect(s.units.size).toBe(0);
    expect(s.effects.length).toBe(1);
  });
});

describe('smooth movement with a jittery network', () => {
  it('if states arrive late, units keep gliding instead of stopping and jumping', () => {
    const s = new ClientState();
    s.size = 64;
    s.apply(delta(1, { u: [encodeUnit(unit({}))] }), 0);
    // Los estados llegan cada 160 ms (wifi lento) en vez de cada 100 ms.
    for (let k = 2; k <= 30; k++) s.apply(delta(k, { p: [1, 1000 + k * 10, 1000] }), (k - 1) * 160);
    const cu = s.units.get(1)!;
    const last = 29 * 160;
    // A los 100 ms del último estado todavía no llegó al final: sigue avanzando.
    const mid = s.unitPos(cu, last + 100).x;
    expect(mid).toBeLessThan(cu.v.x);
    expect(mid).toBeGreaterThan(s.unitPos(cu, last + 20).x);
    // Con la red estable (cada 100 ms) el tramo es exacto: llega justo a los 100 ms.
    const t = new ClientState();
    t.size = 64;
    t.apply(delta(1, { u: [encodeUnit(unit({}))] }), 0);
    for (let k = 2; k <= 30; k++) t.apply(delta(k, { p: [1, 1000 + k * 10, 1000] }), (k - 1) * 100);
    const tu = t.units.get(1)!;
    expect(t.unitPos(tu, 29 * 100 + 100).x).toBeCloseTo(tu.v.x);
  });
});
