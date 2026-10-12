// Animación de ataque sincronizada con el golpe real del servidor: preparación, impacto y
// recuperación alineados con el paso en que el servidor aplica el daño, con distintas
// velocidades de ataque y distintas latencias. El servidor sigue decidiendo todo.
import { describe, expect, it } from 'vitest';
import { TICK_MS, UNIT_DEFS, type UnitType } from '../../shared/data.ts';
import { decodeUnit, encodeUnit } from '../../shared/codec.ts';
import type { DeltaMessage } from '../../shared/protocol.ts';
import { strikeIntervalTicks } from '../../shared/stats.ts';
import { attackFrame, defaultHit, swingDurations, type SwingTiming } from '../../client/src/attackSync.ts';
import { ClientState } from '../../client/src/state.ts';
import { flatGame } from './helpers.ts';

/**
 * Pone una unidad del jugador 1 junto al Centro Urbano enemigo (2000 de vida: no cae) y la
 * hace atacar. Devuelve el juego, la unidad y el centro.
 */
function attacker(type: UnitType) {
  const g = flatGame();
  const w = g.world;
  const tc = [...w.buildings.values()].find((b) => b.owner === 2 && b.type === 'town_center')!;
  const ranged = UNIT_DEFS[type].attack.type === 'ranged';
  const u = w.addUnit(type, 1, tc.tx - (ranged ? 2.5 : 0.6), tc.ty + 1.5);
  w.setRelation(1, 2, 'war');
  g.enqueue(1, { kind: 'attack', unitIds: [u.id], targetId: tc.id });
  return { g, w, u, tc };
}

describe('server: when the damage really lands', () => {
  // Una unidad de cada velocidad de ataque del juego (de 0,6 s a 7 s).
  const TYPES: UnitType[] = ['machine_gun', 'fanatic', 'berserker', 'spearman', 'general', 'knight', 'archer', 'antitank', 'ram', 'scorpion', 'artillery', 'trebuchet'];

  it.each(TYPES)('%s: hits exactly every strikeIntervalTicks(cooldown) steps, and reports each hit tick', (type) => {
    const { g, w, u, tc } = attacker(type);
    const strikes: number[] = [];
    let hp = tc.hp, last = u.lastStrike;
    for (let i = 0; i < 400 && strikes.length < 5; i++) {
      g.step();
      if (u.lastStrike !== last) {
        last = u.lastStrike;
        strikes.push(w.tick);
        // El daño se aplica en ese mismo paso (no después).
        expect(tc.hp).toBeLessThan(hp);
        // Y el cliente se entera de ese paso exacto.
        const v = g.unitViews().find((x) => x.id === u.id)!;
        expect(decodeUnit(encodeUnit(v)).sk).toBe(w.tick);
      }
      hp = tc.hp;
    }
    expect(strikes.length).toBe(5);
    const expected = strikeIntervalTicks(UNIT_DEFS[type].attack.cooldown);
    for (let i = 1; i < strikes.length; i++) expect(strikes[i] - strikes[i - 1]).toBe(expected);
  });

  it('the interval helper matches the plain cooldown (within one step of rounding)', () => {
    for (const c of [0.6, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 5, 6, 7])
      expect(Math.abs(strikeIntervalTicks(c) - c * 10)).toBeLessThanOrEqual(1);
  });

  it('the hit tick stops being reported a while after the last hit (no endless traffic)', () => {
    const { g, w, u, tc } = attacker('spearman');
    for (let i = 0; i < 30; i++) g.step();
    expect(g.unitViews().find((x) => x.id === u.id)!.sk).toBeDefined();
    // Sin nada más que atacar (si no, el soldado busca otro objetivo solo).
    w.removeBuilding(tc.id);
    for (let i = 0; i < 120; i++) g.step();
    expect(w.tick - u.lastStrike).toBeGreaterThan(100);
    expect(g.unitViews().find((x) => x.id === u.id)!.sk).toBeUndefined();
  });
});

describe('client: the swing follows the confirmed hits', () => {
  const T = (cooldownMs: number, n = 6, fps = 12, hit = 3): SwingTiming => ({ n, fps, hit, cooldownMs });

  it('impact and recovery right after a confirmed hit, then guard, then wind-up toward the next one', () => {
    const t = T(1500); // 6 cuadros a 12 fps = 500 ms: preparación 250, recuperación 250
    expect(swingDurations(t)).toEqual({ windup: 250, recover: 250 });
    expect(attackFrame(1000, 1000, t)).toEqual({ frame: 3, phase: 'impact' });
    expect(attackFrame(1100, 1000, t).phase).toBe('recover');
    expect(attackFrame(1300, 1000, t)).toEqual({ frame: 0, phase: 'ready' }); // en guardia
    // Próximo golpe previsto a los 1500 ms: la preparación empieza 250 ms antes.
    expect(attackFrame(2200, 1000, t).phase).toBe('ready');
    expect(attackFrame(2260, 1000, t)).toEqual({ frame: 0, phase: 'windup' });
    expect(attackFrame(2350, 1000, t)).toEqual({ frame: 1, phase: 'windup' });
    // El golpe se atrasa: el arma queda en alto, nunca muestra el impacto sin confirmación.
    expect(attackFrame(2600, 1000, t)).toEqual({ frame: 2, phase: 'hold' });
    expect(attackFrame(9000, 1000, t)).toEqual({ frame: 2, phase: 'hold' });
  });

  it('before the first hit it waits on guard (it does not invent an impact)', () => {
    for (const now of [0, 500, 5000]) expect(attackFrame(now, undefined, T(1500))).toEqual({ frame: 0, phase: 'ready' });
  });

  it('fast attackers: the swing is squeezed into the real cooldown (machine gun 0.6 s, fanatic 1.3 s)', () => {
    for (const cooldownMs of [600, 1300]) {
      const t = T(cooldownMs, 13, 16, 9); // una animación larga (13 cuadros a 16 fps = 812 ms)
      const { windup, recover } = swingDurations(t);
      expect(windup + recover).toBeLessThanOrEqual(cooldownMs * 0.9 + 1e-9);
      // Recupera antes de que empiece la próxima preparación.
      expect(recover).toBeLessThanOrEqual(cooldownMs - windup);
    }
  });

  it('slow attackers (trebuchet 7 s) keep the natural speed and wait on guard between shots', () => {
    const t = T(7000, 6, 8, 1);
    const { windup, recover } = swingDurations(t);
    expect(windup + recover).toBeCloseTo(750);
    expect(attackFrame(1000 + 3000, 1000, t).phase).toBe('ready');
  });

  it('missing impact frame in old art: half of the animation', () => {
    expect(defaultHit(6)).toBe(3);
    expect(defaultHit(13)).toBe(6);
  });
});

describe('end to end: server hits → network with latency → what the student sees', () => {
  /**
   * Juega en el servidor y entrega cada estado al cliente con `latency` ms (más un vaivén
   * determinista de ±`jitter`, en orden, como TCP). Cada 16 ms (un cuadro) el cliente elige el
   * cuadro de ataque. Devuelve cuándo llegó cada golpe y cuándo se dibujó cada impacto.
   */
  function simulate(type: UnitType, latency: number, jitter: number, seconds = 14) {
    const { g, u } = attacker(type);
    const s = new ClientState();
    s.size = 40;
    s.you = 1;
    const cooldownMs = strikeIntervalTicks(UNIT_DEFS[type].attack.cooldown) * TICK_MS;
    const queue: { at: number; msg: DeltaMessage }[] = [];
    let lastAt = 0, seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    const arrivals: number[] = [];
    const impacts: number[] = [];
    const phases: string[] = [];
    let prevSk: number | undefined, prevPhase = '';
    for (let now = 0; now < seconds * 1000; now += 16) {
      // Pasos del servidor (cada 100 ms) y su envío.
      while (g.world.tick * TICK_MS <= now) {
        g.step();
        const v = g.unitViews().find((x) => x.id === u.id)!;
        const at = Math.max(lastAt, g.world.tick * TICK_MS + latency + rand() * jitter);
        lastAt = at;
        queue.push({ at, msg: { t: 'd', k: g.world.tick, u: [encodeUnit(v)] } });
      }
      // Llegan los mensajes cuyo momento pasó.
      while (queue.length && queue[0].at <= now) {
        const { msg } = queue.shift()!;
        s.apply(msg, now);
        const sk = s.units.get(u.id)!.v.sk;
        if (sk !== undefined && sk !== prevSk) arrivals.push(now);
        prevSk = sk;
      }
      // Lo que se dibuja en este cuadro.
      const cu = s.units.get(u.id);
      if (!cu) continue;
      const { phase } = attackFrame(now, cu.hitAt, { n: 6, fps: 12, hit: 3, cooldownMs });
      if (phase === 'impact' && prevPhase !== 'impact') impacts.push(now);
      if (phase !== prevPhase) phases.push(phase);
      prevPhase = phase;
    }
    return { arrivals, impacts, phases, cooldownMs };
  }

  const CASES: [UnitType, number, number][] = [
    ['spearman', 0, 0],
    ['spearman', 50, 20],
    ['spearman', 150, 40],
    ['spearman', 300, 80],
    ['knight', 120, 60],
    ['machine_gun', 80, 30],
    ['archer', 200, 50],
    ['artillery', 250, 60],
  ];

  it.each(CASES)('%s with %i ms latency (±%i): one impact per real hit, drawn when the hit arrives', (type, latency, jitter) => {
    const { arrivals, impacts, phases } = simulate(type, latency, jitter);
    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    // Un impacto por cada golpe confirmado: ni más ni menos.
    expect(impacts.length).toBe(arrivals.length);
    // Cada impacto se dibuja en el cuadro en que llega su confirmación (a la vez que la vida que baja).
    for (let i = 0; i < impacts.length; i++) {
      expect(impacts[i]).toBeGreaterThanOrEqual(arrivals[i]);
      expect(impacts[i] - arrivals[i]).toBeLessThanOrEqual(16);
    }
    // Hay preparación antes de los golpes que siguen al primero.
    expect(phases.filter((p) => p === 'windup' || p === 'hold').length).toBeGreaterThanOrEqual(arrivals.length - 1);
  });

  it('the rhythm of the impacts on screen equals the server rhythm (latency only shifts it)', () => {
    const fast = simulate('spearman', 0, 0);
    const slow = simulate('spearman', 300, 0);
    const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);
    for (const g of [...gaps(fast.impacts), ...gaps(slow.impacts)]) expect(Math.abs(g - fast.cooldownMs)).toBeLessThanOrEqual(16);
  });
});
