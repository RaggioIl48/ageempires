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

/** Posición de una unidad en un paso del servidor. */
export interface TickPos {
  k: number;
  x: number;
  y: number;
}

/**
 * Reloj de dibujo: qué paso del servidor (con decimales) mostrar ahora, sin los tirones del wifi.
 *
 * Los estados llegan cada ~100 ms, pero con jitter (a veces 70 ms, a veces 140 ms). Si cada
 * unidad corre hasta la última posición y se frena, la tropa "late": se detiene y da un tirón.
 * Acá se estima cuándo debió llegar cada paso (un promedio que corrige despacio) y cuánto dura
 * un paso de verdad (si el servidor va lento, los pasos duran más), y se dibuja un paso atrás
 * del último más un margen según el jitter medido: siempre hay dos posiciones entre las que
 * interpolar, y el avance es parejo. Con la red estable, el retraso es el mismo de antes (un paso).
 */
export class TickClock {
  /** Duración real estimada de un paso (ms). */
  tickMs: number;
  /** Último paso recibido y cuándo se estima que llegó (sin el jitter). */
  k = -1;
  at = 0;
  /** Jitter medido (ms): cuánto se apartan las llegadas de lo previsto. */
  jitter = 0;

  constructor(tickMs: number) {
    this.tickMs = tickMs;
  }

  observe(k: number, now: number): void {
    if (this.k < 0 || k <= this.k || k - this.k > 50 || now - this.at > 2000) {
      // Primer estado, o un salto grande (pestaña dormida, reconexión): se reinicia.
      if (k > this.k || this.k < 0 || now - this.at > 2000) [this.k, this.at] = [k, now];
      return;
    }
    const predicted = this.at + (k - this.k) * this.tickMs;
    const err = now - predicted;
    this.jitter = this.jitter * 0.9 + Math.abs(err) * 0.1;
    // Duración del paso: promedio suave de lo que de verdad tardan (el servidor puede ir lento).
    const per = (now - this.at) / (k - this.k);
    if (per > 0 && per < 1000) this.tickMs = this.tickMs * 0.95 + per * 0.05;
    // Llegada estimada: lo previsto, corregido despacio hacia lo real; si se adelanta mucho, se sigue.
    this.at = err < -this.tickMs ? now : predicted + err * 0.1;
    this.k = k;
  }

  /** Paso a dibujar en `now` (con decimales). */
  renderTick(now: number): number {
    const margin = Math.min(1, (1.5 * this.jitter) / this.tickMs);
    return this.k - 1 - margin + (now - this.at) / this.tickMs;
  }
}

/**
 * Posición en el paso `rt` según el historial (ordenado por paso): interpola entre los dos que lo
 * rodean; pasado el último, sigue medio paso más a la misma velocidad (si un estado se atrasa, la
 * tropa no se frena en seco); antes del primero, el primero.
 */
export function posAt(hist: TickPos[], rt: number): { x: number; y: number } {
  const n = hist.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1 || rt <= hist[0].k) return { x: hist[0].x, y: hist[0].y };
  for (let i = n - 1; i > 0; i--) {
    const a = hist[i - 1], b = hist[i];
    if (rt >= a.k && rt <= b.k) {
      const t = (rt - a.k) / (b.k - a.k || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  // Pasado el último: medio paso de inercia como mucho.
  const a = hist[n - 2], b = hist[n - 1];
  const t = Math.min(0.5, rt - b.k) / (b.k - a.k || 1);
  return { x: b.x + (b.x - a.x) * t, y: b.y + (b.y - a.y) * t };
}
