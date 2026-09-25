// Murallas como en los RTS clásicos: se arrastra de un punto a otro y sale
// una línea de piezas de 1×1 (Bresenham). En los pasos diagonales se agrega
// una pieza intermedia ("escalera"): así, en la vista isométrica, la muralla
// se ve siempre continua, sin piezas que solo se tocan por una esquina.

/** Largo máximo de una muralla hecha con una sola orden. */
export const WALL_MAX_TILES = 60;

/** Casillas de la muralla desde (x0, y0) hasta (x1, y1), en orden. */
export function wallLine(x0: number, y0: number, x1: number, y1: number, max = WALL_MAX_TILES): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    out.push({ x, y });
    if ((x === x1 && y === y1) || out.length >= max) break;
    const e2 = 2 * err;
    const stepX = e2 >= dy, stepY = e2 <= dx;
    if (stepX) {
      err += dy;
      x += sx;
    }
    if (stepY) {
      err += dx;
      if (stepX) {
        out.push({ x, y }); // pieza intermedia del escalón
        if (out.length >= max) break;
      }
      y += sy;
    }
  }
  return out;
}
