// Opción de partida "Última era": por defecto la partida termina en la Edad Media.
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../../shared/protocol.ts';
import { completeTech, researchError } from '../src/sim/production.ts';
import { flatGame } from './helpers.ts';

const create = (extra: Record<string, unknown>) =>
  parseClientMessage(JSON.stringify({ t: 'createRoom', settings: { maxPlayers: 2, mapSize: 'small', durationMin: 0, ...extra } }));

describe('última era de la partida', () => {
  it('sin decir nada, la partida termina en la Edad Media; el profesor puede elegir la Moderna', () => {
    const settingsOf = (m: ReturnType<typeof create>) => (m && m.t === 'createRoom' ? m.settings : null);
    expect(settingsOf(create({}))?.maxEra).toBe(2);
    expect(settingsOf(create({ maxEra: 4 }))?.maxEra).toBe(4);
    expect(create({ maxEra: 3 })).toBeNull();
  });

  it('con la Edad Media como última era no se puede avanzar a la Industrial', () => {
    const g = flatGame();
    const w = g.world;
    w.maxEra = 2;
    w.addBuilding('tech_center', 1, 10, 10);
    completeTech(w, 1, 'era2');
    for (const t of ['stage2', 'stage3'] as const) completeTech(w, 1, t);
    expect(researchError(w, 1, 'era3')).toContain('Medieval Age');
    w.maxEra = 4;
    expect(researchError(w, 1, 'era3')).toBeNull();
  });
});
