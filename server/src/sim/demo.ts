// Ejércitos de demostración (solo para medir la fluidez): con la variable de entorno DEMO_ARMY=n,
// al empezar la partida cada jugador recibe n regimientos medievales entre su ciudad y el centro
// del mapa, que avanzan hacia el centro y chocan: una batalla grande sin jugar media hora antes.
// En una partida normal (sin la variable) no hace nada.

import { regimentSize, type UnitType } from '../../../shared/data.ts';
import { completeTech } from './production.ts';
import { moveGroup } from './movement.ts';
import type { World } from './world.ts';

const TYPES: UnitType[] = ['spearman', 'swordsman', 'archer', 'knight', 'warrior', 'scout'];

export function spawnDemoArmies(world: World, regiments: number): void {
  if (regiments <= 0) return;
  const c = world.size / 2;
  for (const p of world.players.values()) {
    completeTech(world, p.id, 'era2');
    // Del lado de su ciudad, a mitad de camino del centro.
    const sx = p.start.x + (c - p.start.x) * 0.45, sy = p.start.y + (c - p.start.y) * 0.45;
    for (let r = 0; r < regiments; r++) {
      const type = TYPES[r % TYPES.length];
      const n = Math.max(1, regimentSize(type));
      const reg = world.newId();
      const ox = sx + ((r % 4) - 1.5) * 3, oy = sy + (Math.floor(r / 4) - 1) * 3;
      const men = [];
      for (let i = 0; i < n; i++) {
        const tx = Math.floor(ox + (i % 3)), ty = Math.floor(oy + Math.floor(i / 3));
        if (!world.inBounds(tx, ty) || !world.isWalkable(tx, ty)) continue;
        const u = world.addUnit(type, p.id, tx + 0.5, ty + 0.5);
        u.reg = reg;
        men.push(u);
      }
      if (!men.length) continue;
      moveGroup(world, men, ox + 1, oy + 1, 'line');
      // Y después avanzan hacia el centro peleando con lo que encuentren (una batalla de verdad).
      for (const u of men) u.orders.push({ x: c + (u.x - sx) * 0.5, y: c + (u.y - sy) * 0.5, amove: true });
    }
  }
}
