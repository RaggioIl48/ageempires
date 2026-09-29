// Niebla de guerra: cada alumno recibe solo lo que ven sus tropas (y las de sus aliados);
// los edificios enemigos se recuerdan como se los vio por última vez.
import { describe, expect, it } from 'vitest';
import { decodeTiles, type DeltaMessage } from '../../shared/protocol.ts';
import { HeightField } from '../../shared/terrain.ts';
import { computeVisible } from '../../shared/vision.ts';
import { buildFrame, ClientSync, welcomeMessage } from '../src/net/sync.ts';
import type { Game } from '../src/sim/game.ts';
import { flatGame } from './helpers.ts';

const SETTINGS = { maxPlayers: 2, mapSize: 'normal' as const, durationMin: 0, diplomacy: 'free' as const, chat: true, fog: true };

/** Un paso y lo que le llega al jugador. */
function tick(g: Game, sync: ClientSync): DeltaMessage {
  g.step();
  const f = buildFrame(g, 0);
  sync.collect(f);
  return sync.build(f, g);
}
const unitIds = (m: DeltaMessage) => (m.u ?? []).map((t) => t[0]);

describe('niebla de guerra', () => {
  it('desde una colina se ve más lejos', () => {
    const size = 30, flat = new HeightField(size, new Uint8Array(size * size));
    const levels = new Uint8Array(size * size).fill(2);
    const high = new HeightField(size, levels);
    const a = new Uint8Array(size * size), b = new Uint8Array(size * size);
    computeVisible(size, flat, [{ x: 15, y: 15, r: 4 }], a);
    computeVisible(size, high, [{ x: 15, y: 15, r: 4 }], b);
    expect(b.reduce((s, v) => s + v, 0)).toBeGreaterThan(a.reduce((s, v) => s + v, 0));
  });

  it('una tropa enemiga lejana no llega; al entrar en la vista aparece y al irse, desaparece', () => {
    const g = flatGame();
    const w = g.world;
    g.enableFog();
    const sync = new ClientSync(1);
    const foe = w.addUnit('warrior', 2, 30.5, 30.5); // lejos de la ciudad 1 (5, 5)
    const first = tick(g, sync);
    expect(unitIds(first)).not.toContain(foe.id);
    expect([...w.units.values()].filter((u) => u.owner === 1).every((u) => unitIds(first).includes(u.id))).toBe(true);
    foe.x = 8.5; // entra en la vista
    foe.y = 8.5;
    expect(unitIds(tick(g, sync))).toContain(foe.id);
    foe.x = 30.5;
    foe.y = 30.5;
    expect(tick(g, sync).ur).toContain(foe.id);
  });

  it('los aliados comparten lo que ven', () => {
    const g = flatGame();
    const w = g.world;
    const foe = w.addUnit('warrior', 2, 30.5, 30.5);
    w.addPlayer(3, 'Tres', '#33aa33', { x: 30, y: 5 }, 'gauls');
    w.addUnit('scout', 3, 29.5, 30.5); // el aliado está al lado del enemigo
    w.setRelation(1, 3, 'ally');
    g.enableFog();
    const sync = new ClientSync(1);
    expect(unitIds(tick(g, sync))).toContain(foe.id);
  });

  it('un edificio enemigo visto se recuerda en la niebla, y se sabe que cayó solo al volver a verlo', () => {
    const g = flatGame();
    const w = g.world;
    g.enableFog();
    const sync = new ClientSync(1);
    const tc2 = [...w.buildings.values()].find((b) => b.owner === 2 && b.type === 'town_center')!;
    expect((tick(g, sync).b ?? []).map((t) => t[0])).not.toContain(tc2.id); // nunca visto
    const scout = w.addUnit('scout', 1, tc2.tx - 2, tc2.ty - 2);
    expect((tick(g, sync).b ?? []).map((t) => t[0])).toContain(tc2.id);
    w.units.delete(scout.id); // se va el explorador
    tc2.hp -= 500;
    const m = tick(g, sync);
    expect((m.b ?? []).map((t) => t[0])).not.toContain(tc2.id); // no se entera del daño
    w.buildings.delete(tc2.id); // cae en la niebla
    expect(tick(g, sync).br ?? []).not.toContain(tc2.id);
    w.addUnit('scout', 1, tc2.tx - 2, tc2.ty - 2); // vuelve a mirar
    expect(tick(g, sync).br).toContain(tc2.id);
  });

  it('los efectos (flechas, golpes) solo se ven donde se ve; el profesor lo ve todo', () => {
    const g = flatGame();
    const w = g.world;
    g.enableFog();
    const a = w.addUnit('warrior', 2, 30.5, 30.5), b = w.addUnit('warrior', 2, 31.2, 30.5);
    w.setRelation(2, 2, 'ally');
    void a;
    void b;
    const sync1 = new ClientSync(1), sync0 = new ClientSync(0);
    g.step();
    w.events.push({ k: 'hit', x: 30.5, y: 30.5 }, { k: 'hit', x: 6, y: 6 });
    const f = buildFrame(g, 0);
    sync1.collect(f);
    sync0.collect(f);
    expect(sync1.build(f, g).e).toHaveLength(1);
    expect(sync0.build(f, g).e).toHaveLength(2);
    expect(sync0.build(buildFrame(g, 0), g).u).toBeUndefined(); // el profesor ya tenía todo
  });

  it('al entrar, el alumno recibe lo que ya exploró', () => {
    const g = flatGame();
    g.enableFog();
    const m = welcomeMessage(g, 1, SETTINGS);
    expect(m.t).toBe('welcome');
    if (m.t !== 'welcome') return;
    const explored = decodeTiles(m.map.exploredRle!, g.world.size);
    expect(explored[5 * g.world.size + 5]).toBe(1); // su ciudad
    expect(explored[35 * g.world.size + 35]).toBe(0); // la ajena
  });
});
