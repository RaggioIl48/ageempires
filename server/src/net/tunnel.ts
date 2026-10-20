// Modo online desde el panel del profesor: abre (o cierra) un túnel rápido de Cloudflare hacia este
// servidor y avisa el enlace público https://…trycloudflare.com. Gratis y sin cuenta; el enlace
// cambia cada vez que se abre. Necesita cloudflared instalado (winget install --id Cloudflare.cloudflared).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import type { TunnelView } from '../../../shared/protocol.ts';

/** Dónde puede estar cloudflared: el que trae el paquete portátil (CLOUDFLARED), el PATH o donde lo deja el instalador de Windows. */
const CANDIDATES = [...(process.env.CLOUDFLARED ? [process.env.CLOUDFLARED] : []), 'cloudflared', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'];
/** Si en este tiempo no dio un enlace, algo anda mal (sin internet, bloqueado por la red). */
const START_TIMEOUT_MS = 45_000;
/**
 * Vigilante: los túneles rápidos gratuitos a veces se caen sin aviso (cloudflared sigue corriendo
 * pero el enlace deja de existir: medido, el panel mostraba "encendido" con un enlace muerto). Cada
 * CHECK_MS se prueba el propio enlace desde aquí; tras CHECK_FAILS fallos seguidos se reabre solo
 * (con un enlace nuevo, que aparece en el panel del profesor).
 */
const CHECK_MS = 30_000;
const CHECK_FAILS = 3;

/** ¿Responde el enlace público? (desde este computador, saliendo por internet). */
export async function linkAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export function findCloudflared(): string | null {
  for (const c of CANDIDATES) {
    try {
      if (spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0) return c;
    } catch {
      // no está ahí
    }
  }
  return null;
}

/** Saca el enlace público de lo que escribe cloudflared. */
export function parseTunnelUrl(text: string): string | null {
  return /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text)?.[0] ?? null;
}

export class Tunnel {
  private child: ChildProcess | null = null;
  private timer: NodeJS.Timeout | null = null;
  private watch: NodeJS.Timeout | null = null;
  private fails = 0;
  private state: TunnelView = { state: 'off' };

  constructor(
    private readonly port: () => number,
    private readonly onChange: (v: TunnelView) => void,
    private readonly find: () => string | null = findCloudflared,
    private readonly alive: (url: string) => Promise<boolean> = linkAlive,
    private readonly checkMs = CHECK_MS,
    private readonly spawner: typeof spawn = spawn,
  ) {}

  view(): TunnelView {
    return this.state;
  }

  /** Enlace público mientras el túnel está abierto. */
  get url(): string | null {
    return this.state.state === 'on' ? (this.state.url ?? null) : null;
  }

  start(): void {
    if (this.child) return;
    const exe = this.find();
    if (!exe) return this.set({ state: 'missing', message: 'cloudflared is not installed on this computer.' });
    this.set({ state: 'starting' });
    const child = this.spawner(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${this.port()}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    const scan = (chunk: Buffer) => {
      const url = parseTunnelUrl(String(chunk));
      if (url && this.child === child && !this.pending && this.state.state !== 'on') {
        this.pending = url;
        void this.confirm(child, url);
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.once('error', (err) => {
      if (this.child !== child) return;
      this.child = null;
      this.clearTimer();
      this.set({ state: 'error', message: err.message });
    });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.clearTimer();
      this.set(this.state.state === 'on' || this.state.state === 'starting' ? { state: 'error', message: 'The tunnel closed (internet connection lost?).' } : { state: 'off' });
    });
    this.timer = setTimeout(() => {
      if (this.child !== child || this.state.state === 'on') return;
      this.stop();
      this.set({ state: 'error', message: 'No working public link after 90 s: check the internet connection (some networks block it).' });
    }, START_TIMEOUT_MS * 2);
  }

  private pending: string | null = null;

  /**
   * Un enlace recién creado tarda 10–20 s en existir en internet. Si un estudiante lo abría antes,
   * su navegador recibía "no existe" y lo recordaba varios minutos (en su casa no abría aunque ya
   * funcionara). Por eso se muestra recién cuando responde desde aquí.
   */
  private async confirm(child: ChildProcess, url: string): Promise<void> {
    for (let i = 0; i < 20 && this.child === child; i++) {
      if (await this.alive(url)) {
        if (this.child !== child) return;
        this.pending = null;
        this.clearTimer();
        this.set({ state: 'on', url });
        this.startWatch();
        return;
      }
      await new Promise((r) => setTimeout(r, Math.min(3000, this.checkMs)));
    }
  }

  /** Reabre el túnel (enlace nuevo) si el actual dejó de responder. */
  private startWatch(): void {
    this.stopWatch();
    this.fails = 0;
    this.watch = setInterval(() => {
      const url = this.url;
      if (!url) return;
      void this.alive(url).then((ok) => {
        if (this.url !== url) return;
        this.fails = ok ? 0 : this.fails + 1;
        if (this.fails < CHECK_FAILS) return;
        console.log('\n  The online link stopped answering: opening a new one…\n');
        this.stop();
        this.start();
      });
    }, this.checkMs);
    this.watch.unref?.();
  }

  private stopWatch(): void {
    if (this.watch) clearInterval(this.watch);
    this.watch = null;
  }

  stop(): void {
    this.pending = null;
    this.stopWatch();
    this.clearTimer();
    const child = this.child;
    this.child = null;
    child?.kill();
    this.set({ state: 'off' });
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(v: TunnelView): void {
    this.state = v;
    this.onChange(v);
  }
}
