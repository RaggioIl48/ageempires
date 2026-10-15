// Sonido de batalla, generado al vuelo con Web Audio (sin archivos: nada que descargar ni licenciar).
//
// - Choque de armas: ruido corto filtrado + parciales metálicos que se apagan rápido.
// - Escudo que para un tiro: golpe seco de madera.
// - Flecha / jabalina: silbido (ruido que baja de tono).
// - Carga: retumbar de cascos + golpe fuerte.
// - Caída: golpe sordo.
// - Cuerno: al empezar una batalla.
// Los sonidos se ubican según la cámara: lo que pasa fuera de la pantalla suena más bajo y hacia
// su lado, y se limita cuántos suenan a la vez (una batalla grande no satura). M = silencio.

import type { GameEvent } from '../../shared/protocol.ts';
import { worldToPx } from './view.ts';

type Kind = 'clash' | 'block' | 'arrow' | 'charge' | 'death' | 'horn';

/** Mínimo de ms entre dos sonidos del mismo tipo, y cuántos pueden sonar a la vez. */
const GAP: Record<Kind, number> = { clash: 55, block: 70, arrow: 45, charge: 250, death: 120, horn: 4000 };
const MAX_VOICES = 14;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<Kind, number> = { clash: 0, block: 0, arrow: 0, charge: 0, death: 0, horn: 0 };
  private voices = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('sound-muted') === '1';
    } catch {
      /* sin almacenamiento: con sonido */
    }
    // Los navegadores solo dejan sonar después de un gesto del usuario.
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', (e) => {
      unlock();
      if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) this.toggle();
    });
  }

  toggle(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    try {
      localStorage.setItem('sound-muted', this.muted ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }

  private ensure(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    // Un compresor suave: muchas espadas juntas no saturan.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /**
   * Eventos del servidor de este paso. `view` = rectángulo visible en px del mundo (para el volumen
   * y el paneo). `battle` = empezó una batalla (cuerno).
   */
  onEvents(events: GameEvent[], view: { cx: number; cy: number; w: number; h: number }, battle = false): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    if (battle) this.play('horn', 0.7, 0);
    for (const e of events) {
      const at = e.k === 'shot' ? { x: e.x1, y: e.y1 } : 'x' in e ? { x: e.x, y: e.y } : null;
      if (!at) continue;
      const p = worldToPx(at.x, at.y);
      const dx = (p.px - view.cx) / Math.max(1, view.w / 2), dy = (p.py - view.cy) / Math.max(1, view.h / 2);
      const off = Math.hypot(dx, dy);
      if (off > 2.2) continue; // muy lejos: no se oye
      const vol = off <= 1 ? 1 : Math.max(0, 1 - (off - 1) / 1.2) * 0.6;
      const pan = Math.max(-1, Math.min(1, dx * 0.7));
      if (e.k === 'hit') this.play(e.c ? 'charge' : e.b ? 'block' : 'clash', vol, pan);
      else if (e.k === 'shot' && e.s !== 1 && e.s !== 2) this.play('arrow', vol * 0.8, pan);
      else if (e.k === 'death') this.play('death', vol * 0.8, pan);
    }
  }

  private play(kind: Kind, vol: number, pan: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime * 1000;
    if (vol <= 0.02 || now - this.last[kind] < GAP[kind] || this.voices >= MAX_VOICES) return;
    this.last[kind] = now;
    this.voices++;
    const t = ctx.currentTime;
    const out = ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.master!);
    const end = (dur: number) => setTimeout(() => {
      this.voices--;
      out.disconnect();
    }, dur * 1000 + 50);
    const jitter = 0.9 + Math.random() * 0.2;
    switch (kind) {
      case 'clash': {
        this.burst(out, t, 0.06, 2600 * jitter, 6, 0.5 * vol);
        for (const f of [1320, 2710, 4130]) this.tone(out, t, f * jitter, 'triangle', 0.12 * vol, 0.18);
        end(0.25);
        break;
      }
      case 'block': {
        this.burst(out, t, 0.05, 700 * jitter, 2, 0.6 * vol);
        this.tone(out, t, 180 * jitter, 'sine', 0.25 * vol, 0.09);
        end(0.15);
        break;
      }
      case 'arrow': {
        const src = this.noiseSrc();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 3;
        bp.frequency.setValueAtTime(3200 * jitter, t);
        bp.frequency.exponentialRampToValueAtTime(700, t + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        src.connect(bp).connect(g).connect(out);
        src.start(t);
        src.stop(t + 0.26);
        end(0.27);
        break;
      }
      case 'charge': {
        // Retumbar de cascos y el golpe del choque.
        for (let i = 0; i < 4; i++) this.burst(out, t + i * 0.07, 0.06, 140, 1.2, 0.5 * vol);
        this.burst(out, t + 0.28, 0.12, 900, 1.5, 0.7 * vol);
        this.tone(out, t + 0.28, 95, 'sine', 0.5 * vol, 0.2);
        end(0.55);
        break;
      }
      case 'death': {
        this.burst(out, t, 0.12, 260 * jitter, 1, 0.45 * vol);
        this.tone(out, t, 110 * jitter, 'sine', 0.2 * vol, 0.16);
        end(0.2);
        break;
      }
      case 'horn': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(196, t);
        o.frequency.linearRampToValueAtTime(220, t + 0.25);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.15);
        g.gain.setValueAtTime(0.35 * vol, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        o.connect(lp).connect(g).connect(out);
        o.start(t);
        o.stop(t + 1.55);
        end(1.6);
        break;
      }
    }
  }

  private noiseSrc(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    return src;
  }

  /** Ruido corto filtrado (golpes). */
  private burst(out: AudioNode, t: number, dur: number, freq: number, q: number, vol: number): void {
    const ctx = this.ctx!;
    const src = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Tono que se apaga (parciales metálicos, cuerpo de los golpes). */
  private tone(out: AudioNode, t: number, freq: number, type: OscillatorType, vol: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
