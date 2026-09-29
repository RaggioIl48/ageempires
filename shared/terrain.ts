// Relieve: colinas en las que atrincherarse (idea de Total War).
//
// Cada casilla tiene un nivel de altura (0 = llano … 3). La superficie es suave: la altura de
// cada esquina es el promedio de las casillas que la tocan, y dentro de una casilla se
// interpola entre sus cuatro esquinas. Servidor y cliente usan esta misma función, así lo que
// se ve (unidades subiendo la loma) coincide con lo que cuenta en el combate.

import { ELEV_DAMAGE_MAX, ELEV_DAMAGE_MIN, ELEV_DAMAGE_PER_LEVEL } from './data.ts';

export class HeightField {
  /** Altura de cada esquina ((size+1)²). */
  private corners: Float32Array;

  constructor(
    readonly size: number,
    readonly levels: Uint8Array,
  ) {
    const n = size + 1;
    this.corners = new Float32Array(n * n);
    for (let cy = 0; cy <= size; cy++)
      for (let cx = 0; cx <= size; cx++) {
        let sum = 0, k = 0;
        for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
          if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
          sum += levels[ty * size + tx];
          k++;
        }
        this.corners[cy * n + cx] = k ? sum / k : 0;
      }
  }

  /** Altura (en niveles, con decimales) en un punto del mundo. */
  at(x: number, y: number): number {
    const s = this.size;
    x = Math.min(s, Math.max(0, x));
    y = Math.min(s, Math.max(0, y));
    const tx = Math.min(s - 1, Math.floor(x)), ty = Math.min(s - 1, Math.floor(y));
    const fx = x - tx, fy = y - ty, n = s + 1, c = this.corners;
    const h00 = c[ty * n + tx], h10 = c[ty * n + tx + 1], h01 = c[(ty + 1) * n + tx], h11 = c[(ty + 1) * n + tx + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  /** Nivel de una casilla. */
  level(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return 0;
    return this.levels[ty * this.size + tx];
  }
}

/** Multiplicador de daño por la altura: de arriba hacia abajo pega más, de abajo hacia arriba menos. */
export function elevationDamage(attackerH: number, targetH: number): number {
  const m = 1 + (attackerH - targetH) * ELEV_DAMAGE_PER_LEVEL;
  return Math.min(ELEV_DAMAGE_MAX, Math.max(ELEV_DAMAGE_MIN, m));
}
