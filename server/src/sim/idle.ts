// Aviso de economía parada: en clase, un alumno puede pasar minutos sin notar que sus obreros no
// hacen nada (la barra solo muestra "Idle: 3"). Si hay obreros sin trabajo durante
// IDLE_WARN_SECONDS, se le avisa, y se repite cada IDLE_WARN_REPEAT mientras sigan así.

import { IDLE_WARN_REPEAT, IDLE_WARN_SECONDS, TICK_RATE } from '../../../shared/data.ts';
import type { World } from './world.ts';

/** Una vez por segundo: cuenta los obreros sin trabajo de cada jugador y avisa si hace falta. */
export function warnIdleWorkers(world: World): void {
  if (world.tick % TICK_RATE !== 0 || world.outcome) return;
  const idle = new Map<number, number>();
  for (const u of world.units.values())
    if (u.type === 'worker' && !u.task && u.state === 'idle') idle.set(u.owner, (idle.get(u.owner) ?? 0) + 1);
  for (const p of world.players.values()) {
    const n = idle.get(p.id) ?? 0;
    if (p.defeated || n === 0) {
      p.idleSince = -1;
      continue;
    }
    if (p.idleSince < 0) p.idleSince = world.tick;
    if (world.tick - p.idleSince < IDLE_WARN_SECONDS * TICK_RATE) continue;
    if (world.tick - p.lastIdleNotice < IDLE_WARN_REPEAT * TICK_RATE) continue;
    p.lastIdleNotice = world.tick;
    const who = n === 1 ? '1 worker is' : `${n} workers are`;
    world.notify(p.id, `${who} doing nothing. Click "Idle" in the top bar to find them and put them to work.`);
  }
}
