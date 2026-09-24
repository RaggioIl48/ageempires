// Conexión WebSocket con reconexión automática. Al volver a conectarse avisa
// (onOpen) para que la aplicación vuelva a entrar a su partida con su token.

import type { ClientMessage, Command, ServerMessage } from '../../shared/protocol.ts';

export type NetStatus = 'connecting' | 'online' | 'offline';

export class Net {
  private ws: WebSocket | null = null;
  status: NetStatus = 'connecting';

  constructor(
    private onMessage: (msg: ServerMessage) => void,
    private onStatus: (s: NetStatus) => void,
    /** Se llama cada vez que la conexión queda lista (la primera y tras reconectar). */
    private onOpen: () => void,
  ) {}

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.setStatus('online');
      this.onOpen();
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.setStatus('offline');
      setTimeout(() => this.connect(), 1500);
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
