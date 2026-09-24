// The server only serves files from the client folder, never outside it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGameServer, type RunningServer } from '../src/net/server.ts';

let server: RunningServer;
let base: string;

/** Raw GET (without normalizing the path, like an attacker would). */
function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'rts-static-'));
  mkdirSync(join(base, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(base, 'dist', 'index.html'), '<h1>juego</h1>');
  writeFileSync(join(base, 'dist', 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(base, 'secreto.txt'), 'NO DEBE VERSE');
  server = await startGameServer({ port: 0, pin: '1234', autoTick: false, staticDir: join(base, 'dist') });
});

afterAll(async () => {
  await server.close();
  rmSync(base, { recursive: true, force: true });
});

describe('static files', () => {
  it('serves the page and its files', async () => {
    expect((await get('/')).body).toContain('juego');
    const js = await get('/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.body).toContain('console.log');
  });

  it('an unknown path returns the main page', async () => {
    expect((await get('/no-existe')).body).toContain('juego');
  });

  for (const path of ['/../secreto.txt', '/%2e%2e/secreto.txt', '/assets/../../secreto.txt', '/..%2fsecreto.txt', '/%2e%2e%5csecreto.txt']) {
    it(`does not leave the game folder: ${path}`, async () => {
      const r = await get(path);
      expect(r.body).not.toContain('NO DEBE VERSE');
    });
  }

  it('a malformed URL does not crash the server', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400);
    expect((await get('/')).status).toBe(200);
  });
});

describe('who counts as "this computer" (teacher without a PIN)', () => {
  it('localhost and the computer\'s own network addresses; not other computers', async () => {
    const { isLocalAddress } = await import('../src/net/server.ts');
    const { networkInterfaces } = await import('node:os');
    expect(isLocalAddress('127.0.0.1')).toBe(true);
    expect(isLocalAddress('::1')).toBe(true);
    expect(isLocalAddress('::ffff:127.0.0.1')).toBe(true);
    const own = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
    if (own) {
      expect(isLocalAddress(own.address)).toBe(true);
      expect(isLocalAddress(`::ffff:${own.address}`)).toBe(true);
    }
    expect(isLocalAddress('203.0.113.77')).toBe(false); // another computer
    expect(isLocalAddress(undefined)).toBe(false);
  });
});
