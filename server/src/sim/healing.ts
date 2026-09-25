// Curación: algunas unidades se curan solas (berserkers, infantería vikinga)
// y el Nemeton de los galos cura a las unidades propias que están cerca.

import { BUILDING_DEFS } from '../../../shared/data.ts';
import type { World } from './world.ts';

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
}
