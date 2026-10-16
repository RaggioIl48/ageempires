// Modo online desde el panel del profesor (túnel rápido de Cloudflare).
import { describe, expect, it } from 'vitest';
import { parseClientMessage, type TunnelView } from '../../shared/protocol.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import { parseTunnelUrl, Tunnel } from '../src/net/tunnel.ts';

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
