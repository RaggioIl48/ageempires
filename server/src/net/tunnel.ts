// Modo online desde el panel del profesor: abre (o cierra) un túnel rápido de Cloudflare hacia este
// servidor y avisa el enlace público https://…trycloudflare.com. Gratis y sin cuenta; el enlace
// cambia cada vez que se abre. Necesita cloudflared instalado (winget install --id Cloudflare.cloudflared).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
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

/**
 * Primera prueba del enlace nuevo recién a los FIRST_CHECK_MS. Un enlace de trycloudflare tarda unos
 * segundos en existir en el DNS; si se pregunta antes, el DNS de la red (el del router o el del
 * proveedor) guarda "no existe" y lo repite por minutos (medido el 2026-10-20 en una red con DNS
 * 10.128.128.128: más de 60 s sin poder abrirlo desde el propio servidor, y el modo online fallaba).
 */
const FIRST_CHECK_MS = 15_000;
/**
 * DNS públicos para probar el enlace sin pasar por el DNS de Windows ni el del router: así este
 * computador nunca guarda el "no existe" (y el navegador del profesor lo puede abrir aquí mismo).
 * Se van rotando: cada uno también recuerda un "no existe" por un rato.
 */
const PUBLIC_DNS = ['1.1.1.1', '8.8.8.8', '9.9.9.9', '1.0.0.1', '8.8.4.4', '149.112.112.112'];
let dnsTurn = 0;

/** Dirección del nombre según un DNS público (o null si no responde ninguno de los que se prueban). */
async function publicLookup(host: string): Promise<{ ip: string } | { missing: true } | null> {
  for (let k = 0; k < 2; k++) {
    const r = new dns.Resolver({ timeout: 3000, tries: 1 });
    r.setServers([PUBLIC_DNS[dnsTurn++ % PUBLIC_DNS.length]]);
    try {
      const [ip] = await r.resolve4(host);
      if (ip) return { ip };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // "No existe todavía": se reintenta más tarde con otro DNS (este ya lo recuerda).
      if (code === 'ENOTFOUND' || code === 'ENODATA') return { missing: true };
      // Sin respuesta (la red bloquea los DNS públicos): se prueba el siguiente.
    }
  }
  return null;
}

/** HEAD a una dirección ya resuelta, con el nombre correcto para el certificado (SNI) y el Host. */
function headAt(ip: string, url: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: ip, port: url.port || 443, path: '/', method: 'HEAD', servername: url.hostname, headers: { Host: url.host }, timeout: 10_000 },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** ¿Responde el enlace público? (desde este computador, saliendo por internet). */
export async function linkAlive(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && !net.isIP(u.hostname)) {
      const found = await publicLookup(u.hostname);
      if (found && 'missing' in found) return false;
      if (found) return (await headAt(found.ip, u)) < 500;
      // La red no deja usar DNS públicos: queda el del sistema (por eso la primera prueba espera).
    }
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
    private readonly firstCheckMs = Math.min(FIRST_CHECK_MS, checkMs),
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
    // No preguntar por el nombre antes de que exista (ver FIRST_CHECK_MS).
    await new Promise((r) => setTimeout(r, this.firstCheckMs));
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
