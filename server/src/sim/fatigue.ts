// Cansancio (Total War): correr, subir cuestas y pelear cansa; descansar lo recupera.
// Una tropa cansada camina más lento, pega más flojo y se quiebra antes. Por eso conviene
// marchar en formación (se cansa menos), no perseguir de más y tener reservas frescas.

import {
  FATIGUE_REST,
  FATIGUE_REST_COMBAT,
  FATIGUE_TIERS,
  UNIT_DEFS,
} from '../../../shared/data.ts';
import type { Unit, World } from './world.ts';

/** ¿Se cansa? Solo los soldados (no los trabajadores, las máquinas ni los vehículos). */
export function tires(u: Unit): boolean {
  const c = UNIT_DEFS[u.type].category;
  return c === 'infantry' || c === 'cavalry' || c === 'ranged';
}

/** Efectos del cansancio según el aguante que le queda (0–100). */
export function fatigueOf(stamina: number): (typeof FATIGUE_TIERS)[number] {
  for (const t of FATIGUE_TIERS) if (stamina >= t.min) return t;
  return FATIGUE_TIERS[FATIGUE_TIERS.length - 1];
}

/** Gasta aguante (nunca baja de 0). */
export function spend(u: Unit, amount: number): void {
  if (tires(u)) u.stamina = Math.max(0, u.stamina - amount);
}

/** Descanso: quieto se recupera; quieto pero peleando, muy poco. */
export function updateFatigue(world: World, dt: number): void {
  for (const u of world.units.values()) {
    if (!tires(u) || u.stamina >= 100) continue;
    if (u.path.length > 0) continue; // caminando no descansa
    const fighting = u.task?.kind === 'attack' || u.routing > 0;
    u.stamina = Math.min(100, u.stamina + (fighting ? FATIGUE_REST_COMBAT : FATIGUE_REST) * dt);
  }
}
