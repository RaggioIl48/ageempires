// Niebla de guerra: qué casillas ve cada jugador (con sus aliados).
//
// Cada unidad y edificio propio o aliado ilumina un círculo de su radio de visión; desde lo
// alto de una colina se ve más lejos (+VISION_PER_LEVEL por nivel). Lo que alguna vez se vio
// queda "explorado": se ve el terreno y los edificios como se los vio por última vez, pero no
// las tropas. Servidor y cliente usan esta misma función.

import { VISION_PER_LEVEL } from './data.ts';
import type { HeightField } from './terrain.ts';

export interface VisionSource {
  x: number;
  y: number;
  /** Radio de visión en casillas (sin contar la altura). */
  r: number;
}

/** Marca con 1 las casillas visibles en `out` (size×size); lo demás queda en 0. */
export function computeVisible(size: number, height: HeightField, sources: Iterable<VisionSource>, out: Uint8Array): void {
  out.fill(0);
  for (const s of sources) {
    const r = s.r + height.at(s.x, s.y) * VISION_PER_LEVEL;
    const r2 = r * r;
    const y0 = Math.max(0, Math.floor(s.y - r)), y1 = Math.min(size - 1, Math.floor(s.y + r));
    for (let ty = y0; ty <= y1; ty++) {
      const dy = ty + 0.5 - s.y;
      const half = Math.sqrt(Math.max(0, r2 - dy * dy));
      const x0 = Math.max(0, Math.floor(s.x - half)), x1 = Math.min(size - 1, Math.floor(s.x + half));
      const row = ty * size;
      for (let tx = x0; tx <= x1; tx++) out[row + tx] = 1;
    }
  }
}

/** Suma lo visible a lo explorado. Devuelve true si se exploró algo nuevo. */
export function addExplored(visible: Uint8Array, explored: Uint8Array): boolean {
  let fresh = false;
  for (let i = 0; i < visible.length; i++)
    if (visible[i] && !explored[i]) {
      explored[i] = 1;
      fresh = true;
    }
  return fresh;
}

/** ¿Se ve algo de este rectángulo de casillas? */
export function rectVisible(size: number, grid: Uint8Array, tx: number, ty: number, s: number): boolean {
  for (let y = Math.max(0, ty); y < Math.min(size, ty + s); y++)
    for (let x = Math.max(0, tx); x < Math.min(size, tx + s); x++) if (grid[y * size + x]) return true;
  return false;
}

/** ¿Se ve este punto? */
export function pointVisible(size: number, grid: Uint8Array, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < size && ty < size && grid[ty * size + tx] === 1;
}
