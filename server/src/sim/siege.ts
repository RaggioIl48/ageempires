// Torres de asedio (Total War): pegadas a una muralla enemiga dejan subir a la infantería sin
// demora ni castigo. Con escalas, en cambio, se trepa unos segundos (lento, débil y expuesto)
// y recién después se pelea arriba.

import { TOWER_REACH, UNIT_DEFS } from '../../../shared/data.ts';
import { isEnemy } from './diplomacy.ts';
import { WALL, type World } from './world.ts';

/** Una vez por paso: qué tramos tienen torre acoplada, y el tiempo de trepada que queda. */
export function updateSiege(world: World): void {
  world.ramps.clear();
  for (const u of world.units.values()) {
    if (UNIT_DEFS[u.type].docks) {
      u.docked = false;
      if (u.hp <= 0 || u.path.length > 0) continue;
      const r = Math.ceil(TOWER_REACH);
      for (let ty = Math.floor(u.y) - r; ty <= Math.floor(u.y) + r; ty++)
        for (let tx = Math.floor(u.x) - r; tx <= Math.floor(u.x) + r; tx++) {
          if (!world.inBounds(tx, ty)) continue;
          const i = ty * world.size + tx;
          if (world.solid[i] !== WALL || Math.hypot(tx + 0.5 - u.x, ty + 0.5 - u.y) > TOWER_REACH) continue;
          const wall = world.buildings.get(world.occupant[i]);
          if (!wall || !isEnemy(world, u.owner, wall.owner)) continue;
          world.ramps.set(i, u.owner);
          u.docked = true;
        }
    } else if (u.climb > 0) u.climb--;
  }
}
