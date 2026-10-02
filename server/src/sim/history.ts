// Historia de la partida para conversarla en clase: cada 30 s una foto de cada imperio
// (economía, ejército, trabajadores, bajas) y la crónica de lo que pasó (alianzas,
// traiciones, guerras, batallas, eras). Se manda al terminar, para los gráficos.

import { TICK_RATE, UNIT_DEFS } from '../../../shared/data.ts';
import type { HistorySample } from '../../../shared/protocol.ts';
import type { World } from './world.ts';

/** Cada cuántos segundos se toma una foto. */
export const HISTORY_EVERY_SEC = 30;

const costOf = (type: keyof typeof UNIT_DEFS) => Object.values(UNIT_DEFS[type].cost).reduce((a, b) => a + (b ?? 0), 0);

/** Foto de todos los imperios ahora. */
export function snapshot(world: World): HistorySample {
  const s: HistorySample = { t: Math.round(world.tick / TICK_RATE), p: {} };
  for (const p of world.players.values()) s.p[p.id] = { eco: p.gathered, army: 0, workers: 0, kills: p.kills, lost: p.lost, era: p.era };
  for (const u of world.units.values()) {
    const e = s.p[u.owner];
    if (!e) continue;
    if (u.type === 'worker') e.workers++;
    else e.army += costOf(u.type);
  }
  // Los ejércitos que marchan también cuentan.
  for (const m of world.marches) {
    const e = s.p[m.owner];
    if (e) for (const u of m.units) e.army += costOf(u.type);
  }
  return s;
}

/** Una vez por paso: guarda la foto cuando toca. */
export function recordHistory(world: World): void {
  if (world.tick % (HISTORY_EVERY_SEC * TICK_RATE) !== 0) return;
  world.history.push(snapshot(world));
}
