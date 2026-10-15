// Regimientos, como en Total War: los soldados se mandan en bloque.
//
// Cada soldado sigue siendo una unidad de la simulación (pelea, se cansa y huye por su cuenta),
// pero pertenece a un regimiento (`u.reg`): los que salen de un mismo edificio y son del mismo
// tipo se suman al regimiento abierto hasta llenarlo (REGIMENT_SIZE). El cliente selecciona el
// regimiento entero con un clic; aquí se decide quién entra y el pánico compartido: cuando huye
// una parte del regimiento, los que siguen firmes pierden moral más rápido.

import { REGIMENT_PANIC, REGIMENT_PANIC_FROM, regimentSize } from '../../../shared/data.ts';
import { moveGroup } from './movement.ts';
import type { Building, Unit, World } from './world.ts';

/** Soldados vivos de un regimiento. */
export function regimentMembers(world: World, reg: number): Unit[] {
  if (!reg) return [];
  const out: Unit[] = [];
  for (const u of world.units.values()) if (u.reg === reg && u.hp > 0) out.push(u);
  return out;
}

/**
 * Un soldado recién salido de `b` se suma al regimiento abierto del edificio (si es de su tipo
 * y tiene lugar); si no, abre uno nuevo. Devuelve los compañeros que ya estaban.
 */
export function joinRegiment(world: World, b: Building, u: Unit): Unit[] {
  const size = regimentSize(u.type);
  if (!size) return [];
  let mates = b.openReg ? regimentMembers(world, b.openReg) : [];
  if (!mates.length || mates[0].type !== u.type || mates.length >= size) {
    b.openReg = world.newId();
    mates = [];
  }
  u.reg = b.openReg;
  if (mates.length + 1 >= size) b.openReg = 0; // lleno: el próximo abre otro
  return mates;
}

/**
 * Con punto de reunión, el regimiento se forma ahí en línea (solo los que no están peleando ni
 * marchando a otra parte); sin punto de reunión, el nuevo se acerca a sus compañeros.
 */
export function formAtRally(world: World, b: Building, u: Unit, mates: Unit[]): boolean {
  if (!mates.length) return false;
  const idle = [u, ...mates.filter((m) => m.state === 'idle' && !m.task && m.routing === 0)];
  if (b.rally) {
    moveGroup(world, idle, b.rally.x, b.rally.y, 'line');
    return true;
  }
  const cx = mates.reduce((s, m) => s + m.x, 0) / mates.length, cy = mates.reduce((s, m) => s + m.y, 0) / mates.length;
  moveGroup(world, idle, cx, cy, 'line');
  return true;
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
