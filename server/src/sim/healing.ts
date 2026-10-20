// Curación: algunas unidades se curan solas (berserkers, infantería vikinga),
// el Nemeton de los galos cura a las unidades propias que están cerca, y los
// monjes (comunes a todos los pueblos en la Edad Media) curan a los suyos alrededor.

import { BUILDING_DEFS, UNIT_DEFS } from '../../../shared/data.ts';
import { healOf } from '../../../shared/stats.ts';
import type { Unit, World } from './world.ts';

export function updateHealing(world: World, dt: number): void {
  // 1) Curación propia.
  for (const u of world.units.values()) {
    if (u.hp <= 0) continue;
    const st = world.statsOf(u);
    if (st.regen > 0 && u.hp < st.hp) u.hp = Math.min(st.hp, u.hp + st.regen * dt);
  }
  // 2) Edificios que curan alrededor (druidas).
  for (const b of world.buildings.values()) {
    const aura = BUILDING_DEFS[b.type].healAura;
    if (!aura || b.progress < 1 || b.hp <= 0) continue;
    const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
    for (const u of world.units.values()) {
      if (u.owner !== b.owner || u.hp <= 0) continue;
      if (Math.hypot(u.x - cx, u.y - cy) > aura.radius + b.size / 2) continue;
      const max = world.statsOf(u).hp;
      if (u.hp < max) u.hp = Math.min(max, u.hp + aura.hps * dt);
    }
  }
  // 3) Monjes: curan a las unidades propias heridas a su alrededor (no a las máquinas de asedio).
  // Varios monjes juntos no suman: cada herido recibe la cura del mejor que lo alcanza.
  const healers: { u: Unit; r2: number; hps: number }[] = [];
  for (const u of world.units.values()) {
    const h = UNIT_DEFS[u.type].heals;
    if (h && u.hp > 0 && u.routing <= 0) healers.push({ u, r2: h.radius * h.radius, hps: healOf(u.type, world.techsOf(u.owner)) });
  }
  if (!healers.length) return;
  for (const u of world.units.values()) {
    if (u.hp <= 0 || UNIT_DEFS[u.type].category === 'siege') continue;
    const max = world.statsOf(u).hp;
    if (u.hp >= max) continue;
    let best = 0;
    for (const h of healers)
      if (h.u.owner === u.owner && h.u !== u && h.hps > best && (h.u.x - u.x) ** 2 + (h.u.y - u.y) ** 2 <= h.r2) best = h.hps;
    if (best > 0) u.hp = Math.min(max, u.hp + best * dt);
  }
}
