// Fluidez del cliente: giros sin parpadeo, partículas con tope, niebla rápida, zoom suave,
// respuesta inmediata a las órdenes y el medidor de fluidez.
import { describe, expect, it } from 'vitest';
import { encodeUnit } from '../../shared/codec.ts';
import type { DeltaMessage, UnitView } from '../../shared/protocol.ts';
import { FOG_ALPHA, buildFogIndex, paintFog } from '../../client/src/fogmap.ts';
import { angleDiff, approachAngle, stickyRow } from '../../client/src/motion.ts';
import { MAX_PUFFS, Particles, puffAt } from '../../client/src/particles.ts';
import { PerfMeter, perfVerdict } from '../../client/src/perf.ts';
import { AIM_MS, ClientState } from '../../client/src/state.ts';
import { Camera, MAX_ZOOM } from '../../client/src/view.ts';

/** Fila de una hoja de 4 direcciones (igual que en el juego: este, sur, oeste, norte). */
const row4 = (a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  if (Math.abs(c) >= Math.abs(s)) return c < 0 ? 1 : 3;
  return s < 0 ? 0 : 2;
};

describe('turning without flicker', () => {
  it('turns by the shortest side, at most the allowed step, and wraps around', () => {
    expect(approachAngle(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approachAngle(0, 0.2, 0.3)).toBeCloseTo(0.2);
    // De 170° a −170°: el camino corto cruza los 180° (20°), no da la vuelta entera.
    const a = (170 * Math.PI) / 180, b = (-170 * Math.PI) / 180;
    expect(Math.abs(angleDiff(approachAngle(a, b, 0.1), a))).toBeCloseTo(0.1);
    expect(Math.abs(angleDiff(b, approachAngle(a, b, 1)))).toBeLessThan(1e-9);
  });

  it('near the border between two directions it keeps the one it had (no flicker)', () => {
    const edge = Math.PI / 4; // borde entre "este" y "sur"
    let row = stickyRow(undefined, edge - 0.05, 0.22, row4);
    const first = row;
    // Bamboleo alrededor del borde: no cambia.
    for (const a of [edge + 0.05, edge - 0.08, edge + 0.1, edge - 0.02]) {
      row = stickyRow(row, a, 0.22, row4);
      expect(row).toBe(first);
    }
    // Bien pasado el borde: cambia.
    row = stickyRow(row, edge + 0.4, 0.22, row4);
    expect(row).not.toBe(first);
  });
});

describe('particles (dust and smoke)', () => {
  it('never more than the cap: old ones are recycled', () => {
    const p = new Particles();
    for (let i = 0; i < MAX_PUFFS * 3; i++) p.emit({ x: i, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r0: 1, r1: 2, t0: 0, life: 1000, alpha: 0.5, kind: 'dust' });
    expect(p.pool.length).toBe(MAX_PUFFS);
    expect(p.count(10)).toBe(MAX_PUFFS);
    expect(p.count(2000)).toBe(0); // todas vencidas
  });

  it('a puff grows and fades out', () => {
    const p = new Particles();
    p.burst(0, 0, 4, 'smoke', 0);
    const q = p.pool[0];
    const early = puffAt(q, 50), late = puffAt(q, q.life - 10);
    expect(late.r).toBeGreaterThan(early.r);
    expect(late.a).toBeLessThan(early.a);
    expect(late.y).toBeLessThan(early.y); // el humo sube
  });
});

describe('fast fog veil', () => {
  // Proyección de prueba: casillas de 8×4 px, como el juego en chico.
  const flat = (x: number, y: number): [number, number] => [(x - y) * 4 + 16, (x + y) * 2 + 4];

  it('every pixel inside the map belongs to a tile, and each tile owns its centre', () => {
    const n = 4, W = 33, H = 26;
    const idx = buildFogIndex(n, W, H, flat);
    for (let ty = 0; ty < n; ty++)
      for (let tx = 0; tx < n; tx++) {
        const [cx, cy] = flat(tx + 0.5, ty + 0.5);
        expect(idx[Math.floor(cy) * W + Math.floor(cx)]).toBe(ty * n + tx);
      }
    // Sin huecos: a lo largo del eje del rombo, todo pertenece a alguna casilla.
    for (let y = 6; y < 20; y++) expect(idx[y * W + 16]).toBeGreaterThanOrEqual(0);
    expect(idx[0]).toBe(-1); // la esquina de la imagen queda fuera del mapa
  });

  it('a hill in front covers the tile behind it (like the terrain drawing)', () => {
    const n = 3, W = 30, H = 30;
    // La casilla (1,1) es una colina: sus esquinas suben 6 px.
    const hill = (x: number, y: number): [number, number] => {
      const [px, py] = flat(x, y);
      const up = x >= 1 && x <= 2 && y >= 1 && y <= 2 ? 6 : 0;
      return [px, py + 6 - up];
    };
    const idx = buildFogIndex(n, W, H, hill);
    const [cx, cy] = hill(1.5, 1.5);
    expect(idx[Math.floor(cy) * W + Math.floor(cx)]).toBe(1 * n + 1);
  });

  it('paints the darkness of each tile', () => {
    const idx = Int32Array.from([0, 1, -1]);
    const level = Float32Array.from([0, 1]);
    const rgba = new Uint8ClampedArray(12);
    paintFog(idx, level, rgba);
    expect([rgba[3], rgba[7], rgba[11]]).toEqual([0, FOG_ALPHA[8], 0]);
    expect(FOG_ALPHA[8]).toBe(Math.round(255 * 0.62));
  });
});

describe('smooth zoom', () => {
  it('glides to the target and keeps the point under the cursor in place', () => {
    const cam = new Camera();
    cam.width = 800;
    cam.height = 600;
    cam.mapSize = 100;
    cam.centerOn(50, 50);
    const before = cam.screenToPx(600, 200);
    cam.zoomSmooth(600, 200, 2);
    cam.update(1 / 60);
    expect(cam.zoom).toBeGreaterThan(1);
    expect(cam.zoom).toBeLessThan(2); // todavía no llegó: se desliza
    for (let i = 0; i < 60; i++) cam.update(1 / 60);
    expect(cam.zoom).toBeCloseTo(2);
    const after = cam.screenToPx(600, 200);
    expect(after.px).toBeCloseTo(before.px, 3);
    expect(after.py).toBeCloseTo(before.py, 3);
    // Muchas vueltas de rueda no pasan del máximo.
    for (let i = 0; i < 20; i++) cam.zoomSmooth(400, 300, 1.5);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.zoom).toBeCloseTo(MAX_ZOOM);
  });
});

describe('instant response to orders', () => {
  const unit = (over: Partial<UnitView>): UnitView => ({ id: 1, owner: 1, type: 'spearman', x: 10, y: 10, hp: 50, state: 'idle', ...over });
  const delta = (k: number, d: Partial<DeltaMessage>): DeltaMessage => ({ t: 'd', k, ...d });

  it('selected units turn at once toward the click, and the server facing does not undo it meanwhile', () => {
    const s = new ClientState();
    s.size = 64;
    s.you = 1;
    s.apply(delta(1, { u: [encodeUnit(unit({ fc: 2 }))] }), 0); // mira al sur (hacia la cámara)
    const cu = s.units.get(1)!;
    s.aimAt([1], 15, 10, 100); // clic al este (+x)
    const east = Math.atan2(0.5 * 5, 5);
    expect(cu.face).toBeCloseTo(east);
    // Llega un estado del servidor (todavía sin moverse, mirando al sur): el giro previsto se mantiene.
    s.apply(delta(2, { u: [encodeUnit(unit({ fc: 2 }))] }), 200);
    expect(cu.face).toBeCloseTo(east);
    // Pasado el tiempo sin moverse, manda otra vez el servidor.
    s.apply(delta(3, { u: [encodeUnit(unit({ fc: 2 }))] }), 100 + AIM_MS + 50);
    expect(cu.face).not.toBeCloseTo(east);
  });

  it('enemy units are not turned by my clicks', () => {
    const s = new ClientState();
    s.size = 64;
    s.you = 1;
    s.apply(delta(1, { u: [encodeUnit(unit({ id: 2, owner: 2 }))] }), 0);
    const before = s.units.get(2)!.face;
    s.aimAt([2], 15, 10, 100);
    expect(s.units.get(2)!.face).toBe(before);
  });
});

describe('smoothness meter', () => {
  it('names the real cause: network, server or this computer', () => {
    expect(perfVerdict({ fps: 60, drawMs: 3, ping: 40, serverMs: 5 })).toEqual({ level: 'good', text: 'Smooth' });
    expect(perfVerdict({ fps: 60, drawMs: 3, ping: 400, serverMs: 5 }).text).toMatch(/internet or Wi-Fi/);
    expect(perfVerdict({ fps: 60, drawMs: 3, ping: 40, serverMs: 90 }).text).toMatch(/server is overloaded/);
    expect(perfVerdict({ fps: 18, drawMs: 40, ping: 40, serverMs: 5 }).text).toMatch(/This computer/);
    expect(perfVerdict({ fps: 60, drawMs: 3, ping: 150, serverMs: 5 }).level).toBe('warn');
  });

  it('measures the round trip of a ping and fps', () => {
    const m = new PerfMeter();
    const n = m.ping_(1000);
    m.pong(n, 4.5, 1080);
    expect(m.ping).toBe(80);
    expect(m.serverMs).toBe(4.5);
    m.pong(n, 9, 2000); // repetido: se ignora
    expect(m.serverMs).toBe(4.5);
    for (let i = 0; i <= 61; i++) m.frame(i * (1000 / 60), 2);
    expect(m.fps).toBeGreaterThan(55);
    expect(m.drawMs).toBeCloseTo(2);
  });
});
