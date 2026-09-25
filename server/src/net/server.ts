// Servidor HTTP + WebSocket. Sirve el cliente ya compilado y conecta cada
// navegador con el lobby (salas con código). Las partidas corren aquí a
// TICK_RATE pasos por segundo; los clientes solo mandan órdenes.

import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { TICK_MS } from '../../../shared/data.ts';
import { parseClientMessage, type ServerMessage } from '../../../shared/protocol.ts';
import type { Conn } from '../lobby/conn.ts';
import { Lobby } from '../lobby/lobby.ts';
import type { Room } from '../lobby/room.ts';

export interface GameServerOptions {
  port: number; // 0 = puerto libre cualquiera (útil en pruebas)
  host?: string;
  /** Clave del profesor para entrar desde otro computador. */
  pin: string;
  /** Carpeta del cliente compilado (client/dist). */
  staticDir?: string;
  /** false = no avanzar el tiempo solo (las pruebas llaman a tick()). */
  autoTick?: boolean;
  /** Direcciones que se muestran al profesor para compartir. */
  urls?: (port: number) => string[];
  /** Semilla fija de mapa (pruebas). */
  seed?: number;
}

export interface RunningServer {
  port: number;
  lobby: Lobby;
  /** Avanza un paso todas las partidas (lo usa el reloj interno; las pruebas lo llaman a mano). */
  tick(): void;
  close(): Promise<void>;
}

/** Mensajes por segundo que acepta el servidor de cada cliente. */
const MAX_MESSAGES_PER_SECOND = 30;
/** Si un cliente acumula más que esto sin leer, se le saltan mensajes (el siguiente los recupera). */
const MAX_BUFFERED_BYTES = 512 * 1024;

/** Conexión WebSocket vista por el lobby. */
class WsConn implements Conn {
  role: Conn['role'] = 'none';
  room: Room | null = null;
  pinFails = 0;
  windowStart = Date.now();
  messages = 0;
  constructor(
    private readonly ws: WebSocket,
    readonly isLocal: boolean,
  ) {}
  send(msg: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  congested(): boolean {
    return this.ws.bufferedAmount > MAX_BUFFERED_BYTES;
  }
  close(): void {
    this.ws.close();
  }
  /** Límite de mensajes por segundo (el exceso se ignora). */
  allow(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.messages = 0;
    }
    return ++this.messages <= MAX_MESSAGES_PER_SECOND;
  }
}

/**
 * ¿La conexión viene de este mismo computador? Sirve tanto "localhost" como
 * cualquiera de sus direcciones de red (p. ej. si el profesor abre el enlace
 * de los estudiantes en su propio navegador).
 */
export function isLocalAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const ip = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  return Object.values(networkInterfaces())
    .flat()
    .some((a) => a?.address === ip);
}

/**
 * ¿La conexión pasó por un intermediario (túnel, proxy, servidor en internet)?
 * En ese caso la dirección de origen es la del intermediario, que puede estar
 * en este mismo computador: NO hay que tratarla como "el computador del profesor".
 */
export function viaProxy(headers: Record<string, string | string[] | undefined>): boolean {
  return ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'cf-ray'].some(
    (h) => headers[h] !== undefined,
  );
}

export function startGameServer(opts: GameServerOptions): Promise<RunningServer> {
  let port = opts.port;
  const lobby = new Lobby({
    pin: opts.pin,
    urls: () => opts.urls?.(port) ?? [`http://localhost:${port}`],
    seed: opts.seed !== undefined ? () => opts.seed! : undefined,
  });

  const http = createServer((req, res) => serveStatic(opts.staticDir, req, res));
  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: 16 * 1024,
    // Compresión de los mensajes grandes (el estado de la partida ocupa ~3 veces menos).
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
  });
  const conns = new Set<WsConn>();

  wss.on('connection', (ws, req) => {
    // "Local" (profesor sin clave) solo si viene directo de este computador, nunca a través de un túnel.
    const conn = new WsConn(ws, isLocalAddress(req.socket.remoteAddress) && !viaProxy(req.headers));
    conns.add(conn);
    ws.on('message', (data, isBinary) => {
      if (isBinary || !conn.allow()) return;
      const msg = parseClientMessage(data.toString());
      if (msg) lobby.handle(conn, msg);
    });
    // Sin este manejador, un error de protocolo (p. ej. un mensaje gigante)
    // tumbaría el proceso entero. Así solo se cierra esa conexión.
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      conns.delete(conn);
      lobby.disconnect(conn);
    });
  });

  let lastErrorLog = 0;
  const tick = () => {
    try {
      lobby.tickAll();
    } catch (err) {
      // Un fallo en un paso no debe detener la partida de toda la clase.
      if (Date.now() - lastErrorLog > 5000) {
        lastErrorLog = Date.now();
        console.error('Error in simulation step:', err);
      }
    }
  };
  const timer = opts.autoTick === false ? null : setInterval(tick, TICK_MS);

  return new Promise((resolvePromise, reject) => {
    http.once('error', reject);
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      port = (http.address() as AddressInfo).port;
      resolvePromise({
        port,
        lobby,
        tick,
        close: () =>
          new Promise<void>((done) => {
            if (timer) clearInterval(timer);
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}

// ---------- Archivos estáticos (el cliente compilado) ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(dir: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (!dir || !isFile(join(dir, 'index.html'))) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Game server running. The client is not built yet: run "npm run build".');
    return;
  }
  const root = resolve(dir);
  let urlPath: string;
  try {
    urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  let file = normalize(join(root, urlPath));
  // Nunca servir nada fuera de la carpeta del cliente.
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!isFile(file)) file = join(root, 'index.html');
  // El archivo puede desaparecer justo ahora (p. ej. si se recompila con el servidor encendido).
  const stream = createReadStream(file);
  stream.once('error', () => {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  });
  stream.once('open', () => {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    stream.pipe(res);
  });
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
