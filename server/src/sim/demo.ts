// Ejércitos de demostración (solo para medir la fluidez): con la variable de entorno DEMO_ARMY=n,
// al empezar la partida cada jugador recibe n regimientos medievales entre su ciudad y el centro
// del mapa, que avanzan hacia el centro y chocan: una batalla grande sin jugar media hora antes.
// En una partida normal (sin la variable) no hace nada. DEMO_TYPES=horse_archer,spearman elige las
// tropas (para revisar el arte de una unidad en marcha).

import { regimentSize, UNIT_DEFS, type UnitType } from '../../../shared/data.ts';
import { completeTech } from './production.ts';
import { moveGroup } from './movement.ts';
import type { World } from './world.ts';

const TYPES: UnitType[] = ['spearman', 'swordsman', 'archer', 'knight', 'warrior', 'scout'];

export function spawnDemoArmies(world: World, regiments: number, only = process.env.DEMO_TYPES): void {
  if (regiments <= 0) return;
  const chosen = (only ?? '').split(',').filter((t): t is UnitType => t in UNIT_DEFS);
  const types = chosen.length ? chosen : TYPES;
  const c = world.size / 2;
  for (const p of world.players.values()) {
    completeTech(world, p.id, 'era2');
    // Del lado de su ciudad, a mitad de camino del centro.
    const sx = p.start.x + (c - p.start.x) * 0.45, sy = p.start.y + (c - p.start.y) * 0.45;
    for (let r = 0; r < regiments; r++) {
      const type = types[r % types.length];
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

/**
 * Ciudad amurallada de demostración (solo para revisar el arte, DEMO_WALLS=1): el primer jugador
 * recibe una muralla alrededor de su Centro Urbano con una puerta hacia el centro del mapa, y dos
 * regimientos adentro que salen y vuelven a entrar varias veces (la puerta se abre y se cierra).
 */
export function spawnDemoWalls(world: World): void {
  const p = [...world.players.values()][0];
  const tc = [...world.buildings.values()].find((b) => b.owner === p?.id && b.type === 'town_center');
  if (!p || !tc) return;
  completeTech(world, p.id, 'era2');
  const R = 6;
  const cx = tc.tx + 1, cy = tc.ty + 1;
  const c = world.size / 2;
  // Puerta en el lado que mira al centro del mapa.
  const sx = Math.sign(c - cx) || 1, sy = Math.sign(c - cy) || 1;
  const gate = Math.abs(c - cx) > Math.abs(c - cy) ? { x: cx + sx * R, y: cy } : { x: cx, y: cy + sy * R };
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== R || !world.inBounds(x, y)) continue;
      const node = world.nodeAt(x, y);
      if (node) world.removeNode(node.id);
      world.addBuilding(x === gate.x && y === gate.y ? 'gate' : 'wall', p.id, x, y, true);
    }
  const inside = { x: cx + (gate.x - cx) * 0.4 + 0.5, y: cy + (gate.y - cy) * 0.4 + 0.5 };
  const outside = { x: gate.x + (gate.x - cx) * 0.8 + 0.5, y: gate.y + (gate.y - cy) * 0.8 + 0.5 };
  for (const [k, type] of (['swordsman', 'archer'] as UnitType[]).entries()) {
    const reg = world.newId();
    const men = [];
    for (let i = 0; i < regimentSize(type); i++) {
      const tx = Math.floor(inside.x + (i % 3) - 1 + (k ? (gate.y - cy) / R * 2 : 0)), ty = Math.floor(inside.y + Math.floor(i / 3) + (k ? (gate.x - cx) / R * 2 : 0));
      if (!world.inBounds(tx, ty) || !world.isWalkable(tx, ty)) continue;
      const u = world.addUnit(type, p.id, tx + 0.5, ty + 0.5);
      u.reg = reg;
      men.push(u);
    }
    for (const u of men) for (let t = 0; t < 4; t++) u.orders.push({ ...outside, amove: false }, { ...inside, amove: false });
  }
}
