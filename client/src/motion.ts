// Movimiento que se ve suave: giros graduales y direcciones de dibujo que no parpadean.
// Funciones puras (se prueban sin navegador).

/** Diferencia de ángulos en (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Gira `cur` hacia `target` como mucho `maxStep` radianes (por el lado más corto). */
export function approachAngle(cur: number, target: number, maxStep: number): number {
  const d = angleDiff(target, cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/**
 * Dirección de dibujo con margen: si el ángulo está cerca del borde entre dos direcciones,
 * se queda en la que ya tenía. Así un soldado que camina en diagonal no parpadea entre
 * dos dibujos. `toRow` convierte un ángulo en fila de la hoja.
 */
export function stickyRow(prev: number | undefined, angle: number, margin: number, toRow: (a: number) => number): number {
  const row = toRow(angle);
  if (prev === undefined || prev === row) return row;
  if (toRow(angle + margin) === prev || toRow(angle - margin) === prev) return prev;
  return row;
}
