// Geometría de las formaciones (la usan el servidor para mover y el cliente para la vista previa).
//
// Formación en filas mirando hacia `face`: infantería adelante, unidades a distancia detrás,
// asedio al fondo y caballería en los flancos ('line'), o de a 3 con la caballería abriendo la
// marcha ('column'). `width` (en casillas) fija el ancho del frente, como al arrastrar con el
// clic derecho en Total War; si falta, se elige uno proporcionado.

import type { Category } from './data.ts';
import type { Formation } from './protocol.ts';

export interface Point {
  x: number;
  y: number;
}

/** Separación entre puestos de una formación (casillas). */
export const RANK_SPACING = 0.9;

/** Fila de cada tipo en la formación (0 = adelante); −1 = caballería (a los lados). */
export const RANK: Record<Category, number> = { infantry: 0, armor: 0, worker: 0, ranged: 1, siege: 2, air: 2, building: 2, cavalry: -1 };

/** Fila de un tipo de unidad según la formación (en columna, la caballería va primero: −2). */
export function rankOf(cat: Category, formation: Formation): number {
  const r = RANK[cat];
  return r === -1 && formation === 'column' ? -2 : r;
}

/**
 * Puestos de cada fila. `counts` dice cuántas unidades hay en cada fila (−2, −1, 0, 1, 2).
 * Devuelve los puestos de cada fila, en el mismo orden de filas.
 */
export function formationLayout(
  counts: Map<number, number>,
  x: number,
  y: number,
  fx: number,
  fy: number,
  formation: Formation,
  width?: number,
): Map<number, Point[]> {
  const rx = -fy, ry = fx; // hacia la derecha del frente
  const at = (col: number, row: number): Point => ({
    x: x + (rx * col - fx * row) * RANK_SPACING,
    y: y + (ry * col - fy * row) * RANK_SPACING,
  });
  const cav = formation === 'line' ? (counts.get(-1) ?? 0) : 0;
  let total = 0;
  for (const n of counts.values()) total += n;
  const main = total - cav;
  const cols =
    formation === 'column'
      ? 3
      : width !== undefined
        ? Math.max(1, Math.round(width / RANK_SPACING) + 1 - (cav > 0 ? 2 : 0))
        : Math.max(3, Math.ceil(Math.sqrt(main * 2.5)));
  const out = new Map<number, Point[]>();
  let row = 0;
  for (const r of [-2, 0, 1, 2]) {
    const n = counts.get(r) ?? 0;
    if (!n) continue;
    const spots: Point[] = [];
    for (let i = 0; i < n; i += cols, row++) {
      const k = Math.min(cols, n - i);
      for (let c = 0; c < k; c++) spots.push(at(c - (k - 1) / 2, row));
    }
    out.set(r, spots);
  }
  if (cav) {
    // Caballería en los flancos: izquierda y derecha alternadas, de adelante hacia atrás.
    const half = (Math.min(cols, Math.max(main, 1)) - 1) / 2;
    const spots: Point[] = [];
    for (let i = 0; i < cav; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      spots.push(at(side * (half + 1.2 + (k % 2)), Math.floor(k / 2)));
    }
    out.set(-1, spots);
  }
  return out;
}

/**
 * Hacia dónde mira una formación dibujada arrastrando de `a` a `b`: perpendicular a la línea,
 * del lado contrario a donde está ahora el grupo (se avanza hacia adelante).
 */
export function dragFacing(a: Point, b: Point, from: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let fx = -dy / len, fy = dx / len;
  const mx = (a.x + b.x) / 2 - from.x, my = (a.y + b.y) / 2 - from.y;
  if (fx * mx + fy * my < 0) [fx, fy] = [-fx, -fy];
  return { x: fx, y: fy };
}
