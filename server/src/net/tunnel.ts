// Modo online desde el panel del profesor: abre (o cierra) un túnel rápido de Cloudflare hacia este
// servidor y avisa el enlace público https://…trycloudflare.com. Gratis y sin cuenta; el enlace
// cambia cada vez que se abre. Necesita cloudflared instalado (winget install --id Cloudflare.cloudflared).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import type { TunnelView } from '../../../shared/protocol.ts';

/** Dónde puede estar cloudflared (en el PATH o donde lo deja el instalador de Windows). */
const CANDIDATES = ['cloudflared', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'];
/** Si en este tiempo no dio un enlace, algo anda mal (sin internet, bloqueado por la red). */
const START_TIMEOUT_MS = 45_000;

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
  private state: TunnelView = { state: 'off' };

  constructor(
    private readonly port: () => number,
    private readonly onChange: (v: TunnelView) => void,
    private readonly find: () => string | null = findCloudflared,
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
    const child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${this.port()}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    const scan = (chunk: Buffer) => {
      const url = parseTunnelUrl(String(chunk));
      if (url && this.child === child && this.state.state !== 'on') {
        this.clearTimer();
        this.set({ state: 'on', url });
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
      this.set({ state: 'error', message: 'No public link after 45 s: check the internet connection (some school networks block it).' });
    }, START_TIMEOUT_MS);
  }

  stop(): void {
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
