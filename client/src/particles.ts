// Partículas livianas (polvo y humo) para dar volumen a la escena 2D: el polvo que levanta
// la caballería, el humo de los cañonazos y de los derrumbes. Hay un tope fijo y los
// objetos se reciclan, así nunca frenan la partida aunque haya una gran batalla.

export type PuffKind = 'dust' | 'smoke';

export interface Puff {
  /** Posición en px del mundo (en el suelo) y altura sobre el suelo (px). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Tamaño inicial y final (radio en px). */
  r0: number;
  r1: number;
  t0: number;
  life: number;
  alpha: number;
  kind: PuffKind;
  alive: boolean;
}

/** Como mucho estas partículas a la vez (las más viejas se reemplazan). */
export const MAX_PUFFS = 240;

export class Particles {
  readonly pool: Puff[] = [];
  private next = 0;

  /** Agrega una partícula (si el tope está lleno, recicla la más vieja). */
  emit(p: Omit<Puff, 'alive'>): void {
    let slot: Puff;
    if (this.pool.length < MAX_PUFFS) {
      slot = { ...p, alive: true };
      this.pool.push(slot);
      return;
    }
    slot = this.pool[this.next];
    this.next = (this.next + 1) % MAX_PUFFS;
    Object.assign(slot, p, { alive: true });
  }

  /** Una nube de `n` partículas que se abren desde un punto. */
  burst(x: number, y: number, n: number, kind: PuffKind, now: number, size = 1): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = (8 + Math.random() * 14) * size;
      this.emit({
        x, y, z: 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: (6 + Math.random() * 10) * size,
        r0: 3 * size, r1: (9 + Math.random() * 6) * size,
        t0: now, life: 700 + Math.random() * 500, alpha: kind === 'smoke' ? 0.55 : 0.45, kind,
      });
    }
  }

  /** Partículas vivas ahora (y apaga las vencidas). */
  *live(now: number): Generator<Puff> {
    for (const p of this.pool) {
      if (!p.alive) continue;
      if (now - p.t0 >= p.life) {
        p.alive = false;
        continue;
      }
      yield p;
    }
  }

  count(now: number): number {
    let n = 0;
    for (const _ of this.live(now)) n++;
    return n;
  }
}

/** Estado de una partícula en el instante `now`: dónde dibujarla, de qué tamaño y cuán visible. */
export function puffAt(p: Puff, now: number): { x: number; y: number; r: number; a: number } {
  const k = Math.min(1, (now - p.t0) / p.life);
  const t = (now - p.t0) / 1000;
  // Se frena al abrirse (rozamiento) y el polvo cae un poco; el humo sube.
  const drag = 1 - Math.exp(-t * 2.2);
  const rise = p.kind === 'smoke' ? p.vz * t * 1.4 : p.vz * drag * 0.5;
  return {
    x: p.x + (p.vx / 2.2) * drag,
    y: p.y + (p.vy / 2.2) * drag - p.z - rise,
    r: p.r0 + (p.r1 - p.r0) * Math.sqrt(k),
    a: p.alpha * (1 - k) * (1 - k * 0.3),
  };
}
