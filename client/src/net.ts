// Conexión WebSocket con reconexión automática. Al volver a conectarse avisa
// (onOpen) para que la aplicación vuelva a entrar a su partida con su token.

import type { ClientMessage, Command, ServerMessage } from '../../shared/protocol.ts';

export type NetStatus = 'connecting' | 'online' | 'offline';

/**
 * Servidor de juego. Normalmente, el mismo que sirvió la página. Si el juego se abrió desde GitHub
 * Pages, el enlace trae el túnel de la PC del profesor (?server=algo.trycloudflare.com): la página y
 * el arte (pesados) bajan rápido de Pages y por el túnel solo pasa la partida (liviana). Solo se
 * aceptan direcciones de túnel, para que un enlace no lleve a los alumnos a cualquier servidor.
 */
const TUNNEL_HOST = /^[a-z0-9-]+\.(trycloudflare\.com|ts\.net)$/i;
export function gameServerUrl(): string {
  let host: string | null = null;
  try {
    const q = new URLSearchParams(location.search).get('server')?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (q && TUNNEL_HOST.test(q)) sessionStorage.setItem('server', q);
    host = sessionStorage.getItem('server');
  } catch {
    host = null; // sin sessionStorage (modo privado estricto): el servidor de la página
  }
  if (host && TUNNEL_HOST.test(host)) return `wss://${host}/ws`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class Net {
  private ws: WebSocket | null = null;
  status: NetStatus = 'connecting';
  /** Intentos seguidos fallidos: la espera crece (1,5 s … 10 s) para no saturar al servidor que vuelve. */
  private failures = 0;

  constructor(
    private onMessage: (msg: ServerMessage) => void,
    private onStatus: (s: NetStatus) => void,
    /** Se llama cada vez que la conexión queda lista (la primera y tras reconectar). */
    private onOpen: () => void,
  ) {}

  connect(): void {
    const ws = new WebSocket(gameServerUrl());
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.failures = 0;
      this.setStatus('online');
      this.onOpen();
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.setStatus('offline');
      // Con algo de azar: si se reinicia el servidor, no vuelven los 16 alumnos en el mismo instante.
      const wait = Math.min(10_000, 1500 * 1.6 ** this.failures++) * (0.8 + Math.random() * 0.4);
      setTimeout(() => this.connect(), wait);
    };
  }

  private setStatus(s: NetStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  command(cmd: Command): void {
    this.send({ t: 'cmd', cmd });
  }
}
