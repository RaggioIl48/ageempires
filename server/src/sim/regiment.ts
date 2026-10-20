// Regimientos, como en Total War: los soldados se mandan en bloque.
//
// Cada soldado sigue siendo una unidad de la simulación (pelea, se cansa y huye por su cuenta),
// pero pertenece a un regimiento (`u.reg`): se entrena el regimiento entero de una vez
// (REGIMENT_SIZE soldados, production.ts) y sale formado. El cliente lo selecciona con un clic;
// aquí está el pánico compartido: cuando huye una parte, los que siguen firmes pierden moral.

import { REGIMENT_PANIC, REGIMENT_PANIC_FROM } from '../../../shared/data.ts';
import { moveGroup } from './movement.ts';
import type { Building, Unit, World } from './world.ts';

/** Soldados vivos de un regimiento. */
export function regimentMembers(world: World, reg: number): Unit[] {
  if (!reg) return [];
  const out: Unit[] = [];
  for (const u of world.units.values()) if (u.reg === reg && u.hp > 0) out.push(u);
  return out;
}

/** Un regimiento recién entrenado se forma en línea en el punto de reunión (o junto al edificio). */
export function formRegiment(world: World, b: Building, men: Unit[]): void {
  if (b.rally) moveGroup(world, men, b.rally.x, b.rally.y, 'line');
  else {
    const cx = men.reduce((s2, m) => s2 + m.x, 0) / men.length, cy = men.reduce((s2, m) => s2 + m.y, 0) / men.length;
    moveGroup(world, men, cx, cy, 'line');
  }
}

/** Pánico compartido: si huye una buena parte del regimiento, el resto vacila. */
export function regimentPanic(world: World, dt: number): void {
  const count = new Map<number, [number, number]>(); // reg → [vivos, huyendo]
  for (const u of world.units.values()) {
    if (!u.reg || u.hp <= 0) continue;
    const c = count.get(u.reg) ?? [0, 0];
    c[0]++;
    if (u.routing > 0) c[1]++;
    count.set(u.reg, c);
  }
  for (const u of world.units.values()) {
    if (!u.reg || u.routing > 0 || u.hp <= 0) continue;
    const [alive, routing] = count.get(u.reg)!;
    const frac = routing / alive;
    if (frac >= REGIMENT_PANIC_FROM) u.morale = Math.max(0, u.morale - REGIMENT_PANIC * frac * dt);
  }
}
