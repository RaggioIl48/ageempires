// Modo online desde el panel del profesor (túnel rápido de Cloudflare).
import { describe, expect, it } from 'vitest';
import { parseClientMessage, type TunnelView } from '../../shared/protocol.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import { EventEmitter } from 'node:events';
import { linkAlive, parseTunnelUrl, Tunnel } from '../src/net/tunnel.ts';

/** cloudflared de mentira: escribe el enlace que se le pide. */
function fakeSpawner(urls: string[]) {
  const children: EventEmitter[] = [];
  const spawner = (() => {
    const c = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => true });
    children.push(c);
    const url = urls[children.length - 1];
    setTimeout(() => c.stderr.emit('data', Buffer.from(`INF |  ${url}  |`)), 1);
    return c;
  }) as never;
  return { spawner, children };
}
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg = { t: string; [k: string]: unknown };
function conn(isLocal: boolean) {
  const inbox: Msg[] = [];
  return { inbox, c: { role: 'none', room: null, pinFails: 0, isLocal, send: (m: Msg) => inbox.push(m), congested: () => false, close: () => {} } };
}

describe('online mode (tunnel)', () => {
  it('reads the public link from what cloudflared prints', () => {
    const log = '2026-10-16T10:00:00Z INF |  https://brave-lion-river.trycloudflare.com  |';
    expect(parseTunnelUrl(log)).toBe('https://brave-lion-river.trycloudflare.com');
    expect(parseTunnelUrl('connecting…')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'tunnel', on: true }))).toEqual({ t: 'tunnel', on: true });
    expect(parseClientMessage(JSON.stringify({ t: 'tunnel', on: 'yes' }))).toBeNull();
  });

  it('without cloudflared it says how to install it (and does not crash)', () => {
    const seen: TunnelView[] = [];
    const t = new Tunnel(() => 8080, (v) => seen.push(v), () => null);
    t.start();
    expect(seen.at(-1)?.state).toBe('missing');
    expect(t.url).toBeNull();
  });

  it('shows the link only once it answers (a fresh link takes a while to exist on the internet)', async () => {
    const seen: TunnelView[] = [];
    let answers = 0;
    const { spawner } = fakeSpawner(['https://a-b-c.trycloudflare.com']);
    const t = new Tunnel(() => 8080, (v) => seen.push(v), () => 'cloudflared', async () => ++answers >= 3, 5, spawner);
    t.start();
    await tick(60);
    expect(answers).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toEqual({ state: 'on', url: 'https://a-b-c.trycloudflare.com' });
    expect(seen.filter((v) => v.state === 'on').length).toBe(1); // nunca antes de responder
    t.stop();
  });

  it('does not ask for a fresh link right away (the network DNS would remember "does not exist" for minutes)', async () => {
    const seen: TunnelView[] = [];
    const asked: number[] = [];
    const t0 = Date.now();
    const { spawner } = fakeSpawner(['https://late-dns.trycloudflare.com']);
    const t = new Tunnel(() => 8080, (v) => seen.push(v), () => 'cloudflared', async () => (asked.push(Date.now() - t0), true), 5, spawner, 80);
    t.start();
    await tick(40);
    expect(asked).toEqual([]); // todavía no
    await tick(100);
    expect(asked[0]).toBeGreaterThanOrEqual(75);
    expect(t.url).toBe('https://late-dns.trycloudflare.com');
    t.stop();
  });

  it('if the link dies, it opens a new one by itself', async () => {
    const seen: TunnelView[] = [];
    let dead = false;
    const { spawner, children } = fakeSpawner(['https://old-link.trycloudflare.com', 'https://new-link.trycloudflare.com']);
    const t = new Tunnel(() => 8080, (v) => seen.push(v), () => 'cloudflared', async (u) => !(dead && u.includes('old')), 5, spawner);
    t.start();
    await tick(30);
    expect(t.url).toBe('https://old-link.trycloudflare.com');
    dead = true;
    await tick(120);
    expect(children.length).toBe(2);
    expect(t.url).toBe('https://new-link.trycloudflare.com');
    t.stop();
  });

  it('a link that does not exist is not alive', async () => {
    expect(await linkAlive('http://127.0.0.1:1')).toBe(false);
  });

  it('only the teacher on the server computer can turn it on or off; the link goes first for students', () => {
    let view: TunnelView = { state: 'off' };
    const calls: string[] = [];
    const lobby = new Lobby({
      pin: '1234',
      urls: () => (view.state === 'on' ? [view.url!, 'http://192.168.1.7:8080'] : ['http://192.168.1.7:8080']),
      tunnel: { start: () => calls.push('start'), stop: () => calls.push('stop'), view: () => view },
    });
    const local = conn(true), remote = conn(false);
    lobby.handle(local.c as never, { t: 'teacher' });
    expect(local.inbox.find((m) => m.t === 'tunnel')).toMatchObject({ state: 'off', canToggle: true });
    lobby.handle(remote.c as never, { t: 'teacher', pin: '1234' });
    expect(remote.inbox.find((m) => m.t === 'tunnel')).toMatchObject({ canToggle: false });

    lobby.handle(remote.c as never, { t: 'tunnel', on: true });
    expect(calls).toEqual([]);
    expect(remote.inbox.at(-1)?.t).toBe('error');

    lobby.handle(local.c as never, { t: 'tunnel', on: true });
    expect(calls).toEqual(['start']);
    view = { state: 'on', url: 'https://brave-lion-river.trycloudflare.com' };
    lobby.tunnelChanged();
    const msg = local.inbox.at(-1)!;
    expect(msg).toMatchObject({ t: 'tunnel', state: 'on', url: 'https://brave-lion-river.trycloudflare.com' });
    expect((msg.urls as string[])[0]).toBe('https://brave-lion-river.trycloudflare.com');
    lobby.handle(local.c as never, { t: 'tunnel', on: false });
    expect(calls).toEqual(['start', 'stop']);
  });
});
