// Niebla de guerra en el servidor: qué ve cada jugador en este paso y qué exploró ya.
// El filtro de lo que se manda a cada alumno está en net/sync.ts.

import { BUILDING_DEFS } from '../../../shared/data.ts';
import { addExplored, computeVisible, type VisionSource } from '../../../shared/vision.ts';
import type { World } from './world.ts';

/** Radio de visión de un edificio (los que no tienen uno propio ven un poco alrededor). */
export function buildingSight(type: keyof typeof BUILDING_DEFS, progress: number): number {
  return progress < 1 ? 2 : BUILDING_DEFS[type].sight;
}

/** Fuentes de visión de un jugador y sus aliados. */
function sourcesOf(world: World, playerId: number): VisionSource[] {
  const out: VisionSource[] = [];
  const team = (owner: number) => owner === playerId || world.relation(owner, playerId) === 'ally';
  for (const u of world.units.values()) if (u.hp > 0 && team(u.owner)) out.push({ x: u.x, y: u.y, r: world.statsOf(u).sight });
  for (const b of world.buildings.values())
    if (team(b.owner)) out.push({ x: b.tx + b.size / 2, y: b.ty + b.size / 2, r: buildingSight(b.type, b.progress) + b.size / 2 });
  return out;
}

/** Recalcula lo visible (y lo explorado) de cada jugador. Solo si la partida tiene niebla. */
export function updateVision(world: World): void {
  if (!world.fog) return;
  const n = world.size * world.size;
  for (const id of world.players.keys()) {
    let vis = world.visible.get(id);
    if (!vis) world.visible.set(id, (vis = new Uint8Array(n)));
    let exp = world.explored.get(id);
    if (!exp) world.explored.set(id, (exp = new Uint8Array(n)));
    computeVisible(world.size, world.height, sourcesOf(world, id), vis);
    addExplored(vis, exp);
  }
}
