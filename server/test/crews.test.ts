// Cuadrillas (5 trabajadores juntos recolectan el doble), canteras y minas
// construibles, y formaciones en filas.
import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS, CREW_BONUS, CREW_SIZE, UNIT_DEFS } from '../../shared/data.ts';
import { parseClientMessage } from '../../shared/protocol.ts';
import { crewFactor } from '../src/sim/gather.ts';
import { RANK_SPACING } from '../src/sim/movement.ts';
import { flatGame, run, runUntil } from './helpers.ts';

describe('cuadrillas', () => {
  it(`${CREW_SIZE} trabajadores en el mismo bosque recolectan ×${CREW_BONUS}; 4 no`, () => {
    const gather = (n: number) => {
      const g = flatGame();
      const w = g.world;
      for (let i = 0; i < 8; i++) w.addNode('tree', 14 + (i % 4), 6 + Math.floor(i / 4));
      w.addBuilding('storehouse', 1, 14, 9);
      const ws = Array.from({ length: n }, (_, i) => w.addUnit('worker', 1, 13.5, 6.5 + i * 0.3));
      const tree = [...w.nodes.values()][0];
      g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: tree.id });
      run(g, 1);
      const crew = ws[0].crew;
      const wood0 = w.players.get(1)!.resources.wood;
      run(g, 60);
      return { crew, perWorker: (w.players.get(1)!.resources.wood - wood0) / n };
    };
    const four = gather(4), five = gather(5);
    expect(four.crew).toBe(4);
    expect(five.crew).toBe(5);
    // Con la cuadrilla completa, cada uno junta bastante más (el doble al recolectar; caminar no cambia).
    expect(five.perWorker).toBeGreaterThan(four.perWorker * 1.5);
    expect(crewFactor(4)).toBe(1);
    expect(crewFactor(5)).toBe(CREW_BONUS);
  });

  it('la cuadrilla viaja en la vista de la unidad', () => {
    const g = flatGame();
    const w = g.world;
    for (let i = 0; i < 6; i++) w.addNode('tree', 14 + i, 6);
    const ws = Array.from({ length: 5 }, (_, i) => w.addUnit('worker', 1, 13.5, 7.5 + i * 0.3));
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: [...w.nodes.values()][0].id });
    run(g, 1);
    expect(g.unitViews().find((v) => v.id === ws[0].id)!.crew).toBe(5);
  });
});

describe('cantera y mina', () => {
  it('se construyen en la Edad Tribal, sin rocas ni vetas, y admiten 5 trabajadores', () => {
    expect(BUILDING_DEFS.quarry.era).toBe(1);
    expect(BUILDING_DEFS.mine.era).toBe(1);
    expect(BUILDING_DEFS.quarry.field).toMatchObject({ resource: 'stone', workers: 5 });
    expect(BUILDING_DEFS.mine.field).toMatchObject({ resource: 'metal', workers: 5 });
    expect(BUILDING_DEFS.mine.dropoff).toEqual(['metal']);
  });

  it('quien construye una mina se queda a trabajarla y deja el metal en la misma mina', () => {
    const g = flatGame();
    const w = g.world;
    const u = w.addUnit('worker', 1, 16.5, 5.5);
    w.players.get(1)!.resources = { food: 0, wood: 500, stone: 500, metal: 0 };
    g.enqueue(1, { kind: 'build', unitIds: [u.id], building: 'mine', tx: 12, ty: 4 });
    g.step();
    const mine = [...w.buildings.values()].find((b) => b.type === 'mine')!;
    runUntil(g, () => mine.progress >= 1);
    run(g, 1);
    expect(u.task).toMatchObject({ kind: 'gather', targetId: mine.id, resource: 'metal' });
    run(g, 60);
    expect(w.players.get(1)!.resources.metal).toBeGreaterThan(10);
    // Nunca se alejó: descarga en la propia mina.
    expect(Math.hypot(u.x - 13.5, u.y - 5.5)).toBeLessThan(3.5);
  });

  it('una mina llena manda al sexto trabajador a otra mina; al agotarse desaparece', () => {
    const g = flatGame();
    const w = g.world;
    const m1 = w.addBuilding('mine', 1, 12, 4)!;
    const m2 = w.addBuilding('mine', 1, 12, 9)!;
    const ws = Array.from({ length: 6 }, (_, i) => w.addUnit('worker', 1, 16.5, 5.5 + i * 0.4));
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: m1.id });
    g.step();
    const on = (id: number) => ws.filter((u) => u.task?.kind === 'gather' && u.task.targetId === id).length;
    expect(on(m1.id)).toBe(5);
    expect(on(m2.id)).toBe(1);
    m1.stock = 2;
    run(g, 20);
    expect(w.buildings.has(m1.id)).toBe(false);
  });

  it('una cantera con su cuadrilla de 5 da el doble por trabajador', () => {
    const g = flatGame();
    const w = g.world;
    const q = w.addBuilding('quarry', 1, 12, 4)!;
    const ws = Array.from({ length: 5 }, (_, i) => w.addUnit('worker', 1, 16.5, 5.5 + i * 0.4));
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: q.id });
    run(g, 2);
    expect(ws.every((u) => u.crew === 5)).toBe(true);
  });
});

describe('formaciones', () => {
  it('el comando de mover acepta la formación y rechaza valores raros', () => {
    const move = (formation: string) => parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'move', unitIds: [1], x: 3, y: 4, formation } }));
    expect(move('line')).toMatchObject({ cmd: { formation: 'line' } });
    expect(move('wedge')).toMatchObject({ cmd: { kind: 'move' } });
    expect(move('wedge')!.t === 'cmd' && 'formation' in (move('wedge') as { cmd: object }).cmd).toBe(false);
  });

  it('en línea: infantería adelante, arqueros detrás, caballería a los lados, y marchan al paso del más lento', () => {
    const g = flatGame();
    const w = g.world;
    const inf = Array.from({ length: 6 }, (_, i) => w.addUnit('spearman', 1, 10 + (i % 3) * 0.6, 12 + Math.floor(i / 3) * 0.6));
    const arc = Array.from({ length: 4 }, (_, i) => w.addUnit('archer', 1, 10 + i * 0.6, 14));
    const cav = Array.from({ length: 2 }, (_, i) => w.addUnit('knight', 1, 9 + i * 3, 13));
    const all = [...inf, ...arc, ...cav];
    // Marchan hacia +x: "adelante" = x mayor.
    g.enqueue(1, { kind: 'move', unitIds: all.map((u) => u.id), x: 25.5, y: 13.5, formation: 'line' });
    g.step();
    const slowest = Math.min(...all.map((u) => w.statsOf(u).speed));
    expect(all.every((u) => u.speedCap === slowest)).toBe(true);
    runUntil(g, () => all.every((u) => u.state === 'idle'), 60);
    const avgX = (us: typeof all) => us.reduce((s, u) => s + u.x, 0) / us.length;
    expect(avgX(inf)).toBeGreaterThan(avgX(arc) + RANK_SPACING * 0.6);
    // Caballería a los costados (más lejos del eje de marcha que la infantería).
    const spreadY = (us: typeof all) => Math.max(...us.map((u) => Math.abs(u.y - 13.5)));
    expect(Math.min(...cav.map((u) => Math.abs(u.y - 13.5)))).toBeGreaterThan(spreadY(inf) - 0.2);
    expect(all.every((u) => u.speedCap === 0)).toBe(true);
    expect(UNIT_DEFS.knight.speed).toBeGreaterThan(slowest); // la caballería esperó al resto
  });

  it('en columna: 3 de ancho', () => {
    const g = flatGame();
    const w = g.world;
    const us = Array.from({ length: 9 }, (_, i) => w.addUnit('spearman', 1, 10 + (i % 3), 20 + Math.floor(i / 3)));
    g.enqueue(1, { kind: 'move', unitIds: us.map((u) => u.id), x: 10.5, y: 8.5, formation: 'column' });
    runUntil(g, () => us.every((u) => u.state === 'idle'), 60);
    const xs = us.map((u) => u.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(RANK_SPACING * 2 + 0.6);
  });
});
