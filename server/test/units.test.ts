import { describe, expect, it } from 'vitest';
import { NODE_DEFS, STARTING_RESOURCES, WORKER_CARRY_CAPACITY } from '../../shared/data.ts';
import type { ResourceNode } from '../src/sim/world.ts';
import { newGame, run, workersOf } from './helpers.ts';

function nearestNode(game: ReturnType<typeof newGame>, playerId: number, type: ResourceNode['type']): ResourceNode {
  const p = game.world.players.get(playerId)!;
  return [...game.world.nodes.values()]
    .filter((n) => n.type === type)
    .sort((a, b) => Math.hypot(a.tx - p.start.x, a.ty - p.start.y) - Math.hypot(b.tx - p.start.x, b.ty - p.start.y))[0];
}

describe('movimiento', () => {
  it('una unidad llega al punto indicado', () => {
    const g = newGame();
    const [u] = workersOf(g, 1);
    const target = { x: u.x + 4, y: u.y + 0.5 };
    // Asegura un destino transitable.
    expect(g.world.isWalkable(Math.floor(target.x), Math.floor(target.y))).toBe(true);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: target.x, y: target.y });
    run(g, 6);
    expect(Math.hypot(u.x - target.x, u.y - target.y)).toBeLessThan(0.3);
    expect(u.state).toBe('idle');
  });

  it('un grupo se reparte en formación en vez de apilarse', () => {
    const g = newGame();
    const ws = workersOf(g, 1);
    const p = g.world.players.get(1)!;
    g.enqueue(1, { kind: 'move', unitIds: ws.map((u) => u.id), x: p.start.x + 0.5, y: p.start.y + 4.5 });
    run(g, 10);
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++)
        expect(Math.hypot(ws[i].x - ws[j].x, ws[i].y - ws[j].y)).toBeGreaterThan(0.3);
  });

  it('a group of 30 crosses half the map (shared path) and everyone arrives', () => {
    const g = newGame(8, 31);
    const w = g.world;
    const [p1] = [...w.players.values()];
    const group = workersOf(g, 1);
    for (let i = 0; group.length < 30; i++) {
      const x = p1.start.x - 3 + (i % 7), y = p1.start.y + 3 + Math.floor(i / 7);
      if (w.isWalkable(x, y)) group.push(w.addUnit('worker', 1, x + 0.5, y + 0.5));
    }
    const dest = { x: w.size / 2 + 0.5, y: w.size / 2 + 0.5 }; // the center (open area, no enemies)
    g.enqueue(1, { kind: 'move', unitIds: group.map((u) => u.id), x: dest.x, y: dest.y });
    run(g, 150);
    for (const u of group) {
      expect(u.state).toBe('idle');
      expect(Math.hypot(u.x - dest.x, u.y - dest.y)).toBeLessThan(8);
    }
  });

  it('ignora órdenes sobre unidades ajenas', () => {
    const g = newGame();
    const [enemy] = workersOf(g, 2);
    const before = { x: enemy.x, y: enemy.y };
    g.enqueue(1, { kind: 'move', unitIds: [enemy.id], x: 5, y: 5 });
    run(g, 3);
    expect({ x: enemy.x, y: enemy.y }).toEqual(before);
  });

  it('detener deja la unidad inactiva', () => {
    const g = newGame();
    const [u] = workersOf(g, 1);
    g.enqueue(1, { kind: 'move', unitIds: [u.id], x: u.x + 6, y: u.y });
    run(g, 0.5);
    g.enqueue(1, { kind: 'stop', unitIds: [u.id] });
    run(g, 0.2);
    expect(u.state).toBe('idle');
    expect(u.path).toHaveLength(0);
  });
});

describe('recolección', () => {
  for (const type of ['tree', 'berries', 'stone', 'metal'] as const) {
    const res = NODE_DEFS[type].resource;
    it(`un trabajador recolecta ${res}, lo lleva al Centro Urbano y vuelve`, () => {
      const g = newGame();
      const [u] = workersOf(g, 1);
      const node = nearestNode(g, 1, type);
      g.enqueue(1, { kind: 'gather', unitIds: [u.id], targetId: node.id });
      run(g, 90);
      const player = g.world.players.get(1)!;
      // Hizo varios viajes completos.
      expect(player.resources[res] - STARTING_RESOURCES[res]).toBeGreaterThanOrEqual(WORKER_CARRY_CAPACITY * 2);
      expect((u.task?.kind === 'gather' && u.task.resource)).toBe(res);
      expect(g.economyOf(1).workers[res]).toBe(1);
      expect(g.economyOf(1).perMinute[res]).toBeGreaterThan(0);
    });
  }

  it('un grupo enviado a un árbol se reparte entre árboles cercanos', () => {
    const g = newGame();
    const ws = workersOf(g, 1);
    const tree = nearestNode(g, 1, 'tree');
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: tree.id });
    g.step();
    const nodes = new Set(ws.map((u) => u.task!.targetId));
    expect(nodes.size).toBe(ws.length);
    expect(nodes.has(tree.id)).toBe(true);
  });

  it('si el árbol elegido está encerrado en el bosque, va a uno accesible cercano', () => {
    const g = newGame();
    const w = g.world;
    const inner = [...w.nodes.values()].find((n) => n.type === 'tree' && !w.isExposed(n.tx, n.ty));
    expect(inner).toBeDefined();
    const [u] = workersOf(g, 1);
    g.enqueue(1, { kind: 'gather', unitIds: [u.id], targetId: inner!.id });
    g.step();
    expect(u.state).toBe('toResource');
    expect(u.task!.targetId).not.toBe(inner!.id);
    expect((u.task!.kind === 'gather' && u.task!.resource)).toBe('wood');
  });

  it('lo recolectado sale del nodo (no se crea de la nada)', () => {
    const g = newGame();
    const ws = workersOf(g, 1);
    const node = nearestNode(g, 1, 'stone');
    const totalBefore = [...g.world.nodes.values()].filter((n) => n.type === 'stone').reduce((s, n) => s + n.amount, 0);
    g.enqueue(1, { kind: 'gather', unitIds: ws.map((u) => u.id), targetId: node.id });
    run(g, 60);
    const totalAfter = [...g.world.nodes.values()].filter((n) => n.type === 'stone').reduce((s, n) => s + n.amount, 0);
    const p = g.world.players.get(1)!;
    const carried = ws.reduce((s, u) => s + (u.carryType === 'stone' ? u.carryAmount : 0), 0);
    expect(totalBefore - totalAfter).toBe(p.resources.stone - STARTING_RESOURCES.stone + carried);
  });

  it('cuando un árbol se agota, el trabajador pasa a otro cercano', () => {
    const g = newGame();
    const [u] = workersOf(g, 1);
    const tree = nearestNode(g, 1, 'tree');
    tree.amount = 3; // casi agotado
    g.enqueue(1, { kind: 'gather', unitIds: [u.id], targetId: tree.id });
    run(g, 40);
    expect(g.world.nodes.has(tree.id)).toBe(false);
    expect(u.task).not.toBeNull();
    expect(u.task!.targetId).not.toBe(tree.id);
    expect((u.task!.kind === 'gather' && u.task!.resource)).toBe('wood');
  });

  it('cambiar de recurso descarta la carga anterior', () => {
    const g = newGame();
    const [u] = workersOf(g, 1);
    u.carryType = 'wood';
    u.carryAmount = 5;
    const berries = nearestNode(g, 1, 'berries');
    g.enqueue(1, { kind: 'gather', unitIds: [u.id], targetId: berries.id });
    run(g, 30);
    expect(u.carryType === 'wood').toBe(false);
  });

  it('los recursos de un jugador no cambian por el trabajo de otro', () => {
    const g = newGame();
    const node = nearestNode(g, 2, 'metal');
    g.enqueue(2, { kind: 'gather', unitIds: workersOf(g, 2).map((u) => u.id), targetId: node.id });
    run(g, 60);
    expect(g.world.players.get(1)!.resources).toEqual(STARTING_RESOURCES);
    expect(g.world.players.get(2)!.resources.metal).toBeGreaterThan(STARTING_RESOURCES.metal);
  });
});
