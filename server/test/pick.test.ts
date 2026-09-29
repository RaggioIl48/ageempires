// Hacer clic en lo que se quiere: un trabajador parado frente a las bayas no las tapa al dar
// la orden de recolectar (clic derecho), y gana lo más cercano al puntero.
import { describe, expect, it } from 'vitest';
import { ClientState } from '../../client/src/state.ts';
import { pick } from '../../client/src/input.ts';
import { Camera } from '../../client/src/view.ts';
import type { ServerMessage } from '../../shared/protocol.ts';
import { buildFrame, ClientSync, welcomeMessage } from '../src/net/sync.ts';
import { flatGame } from './helpers.ts';

const SETTINGS = { maxPlayers: 2, mapSize: 'normal' as const, durationMin: 0, diplomacy: 'free' as const, chat: true, fog: false, battlePause: 0 };

describe('clic sobre recursos', () => {
  it('con clic derecho, las bayas se eligen aunque un trabajador propio esté encima', () => {
    const g = flatGame();
    const w = g.world;
    const berry = w.addNode('berries', 12, 12);
    w.addUnit('worker', 1, 12.9, 12.9); // parado justo delante (en la pantalla, bajo el arbusto)
    const state = new ClientState();
    state.apply(JSON.parse(JSON.stringify(welcomeMessage(g, 1, SETTINGS))) as ServerMessage, 0);
    const sync = new ClientSync(1);
    const f = buildFrame(g, 0, true);
    sync.collect(f);
    state.apply(JSON.parse(JSON.stringify(sync.build(f, g))) as ServerMessage, 0);
    const cam = new Camera();
    cam.width = 800;
    cam.height = 600;
    cam.mapSize = w.size;
    cam.centerOn(12.5, 12.5);
    // El puntero sobre el arbusto (un poco arriba del centro de su casilla).
    const s = cam.worldToScreen(12.5, 12.5);
    const target = pick(state, cam, s.sx, s.sy - 8, 1e9, true);
    expect(target).toEqual({ kind: 'node', id: berry!.id });
    // Clic izquierdo (seleccionar): gana lo más cercano al puntero: sobre el cuerpo del trabajador, él.
    expect(pick(state, cam, s.sx, s.sy - 8, 1e9)?.kind).toBe('node');
    expect(pick(state, cam, s.sx, s.sy + 3, 1e9)?.kind).toBe('unit');
  });
});
