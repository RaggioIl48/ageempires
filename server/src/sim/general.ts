// El General (héroe) de cada ejército, como en Total War: Attila.
//
// Cada jugador tiene uno (empieza con él y, si cae, puede entrenar otro en el Centro Urbano).
// Aura: los soldados cerca de su General pierden menos moral y la recuperan antes. Si cae, los
// suyos que lo ven pierden mucha moral. Dos habilidades con espera:
//   · Inspire: devuelve moral al instante (los que huyen se reagrupan) y da +25 % de daño.
//   · Hold the Line: +3 de armadura y pierden mucha menos moral (para aguantar en una colina).

import { ABILITIES, GENERAL_AURA, TICK_RATE, UNIT_DEFS, type AbilityId } from '../../../shared/data.ts';
import { hasMorale } from './morale.ts';
import type { Unit, World } from './world.ts';

export const isHero = (u: Unit) => UNIT_DEFS[u.type].hero === true;

/** Generales vivos, por dueño (se recalcula una vez por paso). */
let cacheTick = -1;
let cacheWorld: World | null = null;
let cache: Unit[] = [];
function generals(world: World): Unit[] {
  if (cacheTick !== world.tick || cacheWorld !== world) {
    cache = [];
    for (const u of world.units.values()) if (isHero(u) && u.hp > 0) cache.push(u);
    cacheTick = world.tick;
    cacheWorld = world;
  }
  return cache;
}

/** ¿Tiene este soldado a su General cerca? */
export function nearGeneral(world: World, u: Unit): boolean {
  for (const g of generals(world))
    if (g !== u && g.owner === u.owner && (g.x - u.x) ** 2 + (g.y - u.y) ** 2 <= GENERAL_AURA ** 2) return true;
  return false;
}

/** ¿Ya tiene General (vivo o en una cola)? */
export function hasGeneral(world: World, playerId: number): boolean {
  for (const u of world.units.values()) if (u.owner === playerId && isHero(u)) return true;
  for (const b of world.buildings.values()) if (b.owner === playerId && b.queue.some((q) => q.unit && UNIT_DEFS[q.unit].hero)) return true;
  for (const m of world.marches) if (m.owner === playerId && m.units.some((u) => UNIT_DEFS[u.type].hero)) return true;
  return false;
}

/** Usa una habilidad con los Generales de la selección. Devuelve un aviso, o null si se usó. */
export function useAbility(world: World, units: Unit[], ability: AbilityId): string | null {
  const def = ABILITIES[ability];
  const heroes = units.filter(isHero);
  if (heroes.length === 0) return 'Select your General to use his abilities';
  for (const g of heroes) {
    const wait = g.ready[ability] - world.tick;
    if (wait > 0) return `${def.label}: ready in ${Math.ceil(wait / TICK_RATE)} s`;
    g.ready[ability] = world.tick + def.cooldown * TICK_RATE;
    const kind: 1 | 2 = ability === 'inspire' ? 1 : 2;
    for (const u of world.units.values()) {
      if (u.owner !== g.owner || u.hp <= 0 || (u.x - g.x) ** 2 + (u.y - g.y) ** 2 > def.radius ** 2) continue;
      if (!hasMorale(u) && !isHero(u)) continue;
      u.buff = kind;
      u.buffUntil = world.tick + def.seconds * TICK_RATE;
      if (def.morale) {
        u.morale = Math.min(100, u.morale + def.morale);
        if (u.routing > 0) {
          // ¡Se reagrupan!
          u.routing = 0;
          u.morale = Math.max(u.morale, 50);
          u.path = [];
          u.state = 'idle';
        }
      }
    }
    world.events.push({ k: 'ability', x: g.x, y: g.y, a: kind, r: def.radius });
  }
  return null;
}

/** Los efectos se acaban con el tiempo. */
export function updateBuffs(world: World): void {
  for (const u of world.units.values()) if (u.buff && world.tick >= u.buffUntil) u.buff = 0;
}

/** Multiplicador de daño y armadura extra por habilidades activas. */
export const buffDamage = (u: Unit) => (u.buff === 1 ? (ABILITIES.inspire.damage ?? 1) : 1);
export const buffArmor = (u: Unit) => (u.buff === 2 ? (ABILITIES.hold.armor ?? 0) : 0);
export const buffMoraleLoss = (u: Unit) => (u.buff === 2 ? (ABILITIES.hold.moraleLoss ?? 1) : 1);
