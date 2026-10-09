// Medidor de fluidez: cuadros por segundo, cuánto tarda en dibujarse cada cuadro, el ping
// con el servidor y cuánto tarda el servidor en cada paso. Responde la pregunta
// "¿va lento por internet o por el juego?" con un veredicto en palabras simples.

export interface PerfSample {
  fps: number;
  /** ms que tarda en dibujarse un cuadro en este computador. */
  drawMs: number;
  /** Ida y vuelta al servidor (ms); 0 = todavía no se midió. */
  ping: number;
  /** ms que tarda el servidor en simular un paso (de 100 ms disponibles). */
  serverMs: number;
}

export type PerfLevel = 'good' | 'warn' | 'bad';

/** Veredicto: lo peor de las tres causas posibles (red, servidor, este computador). */
export function perfVerdict(s: PerfSample): { level: PerfLevel; text: string } {
  const issues: { level: PerfLevel; text: string }[] = [];
  if (s.ping > 250) issues.push({ level: 'bad', text: 'Slow connection: the internet or Wi-Fi is the problem' });
  else if (s.ping > 120) issues.push({ level: 'warn', text: 'The connection is a bit slow' });
  if (s.serverMs > 60) issues.push({ level: 'bad', text: 'The server is overloaded (too much for its computer)' });
  else if (s.serverMs > 30) issues.push({ level: 'warn', text: 'The server is busy' });
  if (s.fps > 0 && s.fps < 25 && s.drawMs > 20) issues.push({ level: 'bad', text: 'This computer struggles to draw the game: zoom in or close other tabs' });
  else if (s.fps > 0 && s.fps < 45) issues.push({ level: 'warn', text: 'This computer draws the game a bit slowly' });
  if (issues.length === 0) return { level: 'good', text: 'Smooth' };
  const level: PerfLevel = issues.some((i) => i.level === 'bad') ? 'bad' : 'warn';
  return { level, text: issues.filter((i) => i.level === level).map((i) => i.text).join(' · ') };
}

/** Promedios suaves de lo medido en cada cuadro y en cada ping. */
export class PerfMeter {
  fps = 0;
  drawMs = 0;
  ping = 0;
  serverMs = 0;
  private frames = 0;
  private since = -1;
  private sentAt = new Map<number, number>();
  private nextPing = 1;

  /** Llamar cada cuadro con cuánto tardó en dibujarse. */
  frame(now: number, drawMs: number): void {
    this.drawMs = this.drawMs ? this.drawMs * 0.95 + drawMs * 0.05 : drawMs;
    this.frames++;
    if (this.since < 0) this.since = now;
    if (now - this.since >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.since);
      this.frames = 0;
      this.since = now;
    }
  }

  /** Número del próximo ping (y recuerda cuándo salió). */
  ping_(now: number): number {
    const n = this.nextPing++;
    this.sentAt.set(n, now);
    if (this.sentAt.size > 20) this.sentAt.delete(this.sentAt.keys().next().value!);
    return n;
  }

  /** Llegó la respuesta: ida y vuelta, y el tiempo de paso que informa el servidor. */
  pong(n: number, serverMs: number, now: number): void {
    const t = this.sentAt.get(n);
    if (t === undefined) return;
    this.sentAt.delete(n);
    const rtt = now - t;
    this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt;
    this.serverMs = serverMs;
  }

  sample(): PerfSample {
    return { fps: this.fps, drawMs: this.drawMs, ping: this.ping, serverMs: this.serverMs };
  }
}
