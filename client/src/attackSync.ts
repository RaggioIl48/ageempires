// Animación de ataque sincronizada con el golpe REAL del servidor.
//
// El servidor decide el daño (y cuándo): aplica el golpe en un paso exacto y avisa el número
// de ese paso (`sk`). El cliente solo elige qué cuadro dibujar:
//   - preparación: sube el arma antes del próximo golpe previsto (último golpe + espera real);
//   - si el golpe se atrasa (red lenta, objetivo que se aleja), se queda con el arma en alto;
//   - impacto: el cuadro del corte/estocada/disparo se muestra recién cuando llega la
//     confirmación del servidor (a la vez que la vida que baja y las chispas);
//   - recuperación: el resto del movimiento, y queda en guardia hasta la próxima preparación.
// Nada de esto cambia el daño ni el ritmo de los golpes: solo el dibujo.

export interface SwingTiming {
  /** Cuadros de la animación de ataque y su velocidad natural. */
  n: number;
  fps: number;
  /** Cuadro del impacto (corte, estocada o soltar la flecha). */
  hit: number;
  /** Tiempo real entre golpes en el servidor (ms). */
  cooldownMs: number;
}

/** Fases del golpe (para pruebas y depuración). */
export type SwingPhase = 'ready' | 'windup' | 'hold' | 'impact' | 'recover';

/** Duraciones de la preparación y la recuperación: la animación natural, comprimida si los golpes van más rápido. */
export function swingDurations(t: SwingTiming): { windup: number; recover: number } {
  const natural = (t.n / Math.max(1, t.fps)) * 1000;
  const dur = Math.min(natural, t.cooldownMs * 0.9);
  const hit = Math.max(0, Math.min(t.n - 1, t.hit));
  return { windup: (dur * hit) / t.n, recover: (dur * (t.n - hit)) / t.n };
}

/**
 * Cuadro de la animación de ataque en el instante `now` (reloj del cliente, ms).
 * `lastHit` = cuándo llegó la confirmación del último golpe (undefined = todavía ninguno).
 */
export function attackFrame(now: number, lastHit: number | undefined, t: SwingTiming): { frame: number; phase: SwingPhase } {
  const hit = Math.max(0, Math.min(t.n - 1, t.hit));
  const { windup, recover } = swingDurations(t);
  // Sin golpes todavía: en guardia, esperando el primero (no se inventa un impacto).
  if (lastHit === undefined) return { frame: 0, phase: 'ready' };
  const e = now - lastHit;
  // Recién golpeó: impacto y recuperación.
  if (e >= 0 && e < recover) {
    const k = hit + Math.floor((e / recover) * (t.n - hit));
    return { frame: Math.min(t.n - 1, k), phase: k === hit ? 'impact' : 'recover' };
  }
  // Próximo golpe previsto: último + espera real del servidor.
  const next = e < 0 ? lastHit : lastHit + t.cooldownMs;
  const start = next - windup;
  if (now < start || hit === 0) return { frame: 0, phase: 'ready' };
  // Prepara el golpe; si la confirmación no llega a tiempo, se queda justo antes del impacto.
  const k = Math.floor(((now - start) / Math.max(1, windup)) * hit);
  if (k >= hit) return { frame: hit - 1, phase: 'hold' };
  return { frame: k, phase: 'windup' };
}

/** Cuadro de impacto por defecto cuando la hoja no lo indica: la mitad del movimiento. */
export const defaultHit = (n: number): number => Math.floor(n / 2);
