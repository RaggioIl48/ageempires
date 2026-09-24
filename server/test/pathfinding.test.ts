import { describe, expect, it } from 'vitest';
import { TILE_MOUNTAIN, TILE_WATER } from '../../shared/data.ts';
import { clearLine, pathToPoint, pathToRect } from '../src/sim/pathfinding.ts';
import { World } from '../src/sim/world.ts';

function emptyWorld(size = 20): World {
  return new World(size);
}

describe('búsqueda de caminos', () => {
  it('en terreno abierto va directo (un solo punto tras suavizar)', () => {
    const w = emptyWorld();
    const path = pathToPoint(w, { x: 2.5, y: 2.5 }, 15.5, 12.5)!;
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual({ x: 15.5, y: 12.5 });
  });

  it('rodea una pared de montaña', () => {
    const w = emptyWorld();
    for (let y = 0; y < 15; y++) w.tiles[y * w.size + 10] = TILE_MOUNTAIN; // pared en x=10
    const path = pathToPoint(w, { x: 5.5, y: 5.5 }, 15.5, 5.5)!;
    expect(path).not.toBeNull();
    // Debe pasar por debajo del extremo de la pared (y >= 15).
    expect(path.some((p) => p.y >= 15)).toBe(true);
    // Ningún tramo atraviesa la pared.
    let prev = { x: 5.5, y: 5.5 };
    for (const p of path) {
      expect(clearLine(w, prev, p)).toBe(true);
      prev = p;
    }
  });

  it('if the destination is enclosed by water, it gets as close as possible (like a move order)', () => {
    const w = emptyWorld();
    for (let y = 8; y <= 12; y++)
      for (let x = 8; x <= 12; x++) if (x === 8 || x === 12 || y === 8 || y === 12) w.tiles[y * w.size + x] = TILE_WATER;
    const path = pathToPoint(w, { x: 1.5, y: 1.5 }, 10.5, 10.5)!;
    expect(path).not.toBeNull();
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - 10.5, end.y - 10.5)).toBeLessThanOrEqual(4.5); // right at the edge of the lake
    expect(w.isWalkable(Math.floor(end.x), Math.floor(end.y))).toBe(true);
  });

  it('pathToRect (gather) returns null if there is no access at all', () => {
    const w = emptyWorld();
    for (let y = 8; y <= 12; y++)
      for (let x = 8; x <= 12; x++) if (x === 8 || x === 12 || y === 8 || y === 12) w.tiles[y * w.size + x] = TILE_WATER;
    expect(pathToRect(w, { x: 1.5, y: 1.5 }, 10, 10, 1)).toBeNull();
  });

  it('si el destino es agua, va a la casilla transitable más cercana', () => {
    const w = emptyWorld();
    w.tiles[10 * w.size + 10] = TILE_WATER;
    const path = pathToPoint(w, { x: 1.5, y: 1.5 }, 10.5, 10.5)!;
    const end = path[path.length - 1];
    expect(w.isWalkable(Math.floor(end.x), Math.floor(end.y))).toBe(true);
    expect(Math.hypot(end.x - 10.5, end.y - 10.5)).toBeLessThan(1.6);
  });

  it('no corta esquinas en diagonal entre dos obstáculos', () => {
    const w = emptyWorld(6);
    w.tiles[1 * 6 + 2] = TILE_MOUNTAIN;
    w.tiles[2 * 6 + 1] = TILE_MOUNTAIN;
    // (1,1) -> (2,2) solo por la diagonal bloqueada: debe dar un rodeo o nada, nunca cruzar.
    const path = pathToPoint(w, { x: 1.5, y: 1.5 }, 2.5, 2.5);
    if (path) {
      let prev = { x: 1.5, y: 1.5 };
      for (const p of path) {
        expect(clearLine(w, prev, p)).toBe(true);
        prev = p;
      }
    }
  });
});
