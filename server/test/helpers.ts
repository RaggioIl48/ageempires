import type { FactionId } from '../../shared/data.ts';
import { Game } from '../src/sim/game.ts';
import { World, type Unit } from '../src/sim/world.ts';

export function newGame(slots = 2, seed = 1234): Game {
  return new Game({ slots, seed });
}

export function workersOf(game: Game, playerId: number): Unit[] {
  return [...game.world.units.values()].filter((u) => u.owner === playerId && u.type === 'worker');
}

/** Avanza la simulación `seconds` segundos. */
export function run(game: Game, seconds: number): void {
  for (let i = 0; i < seconds * 10; i++) game.step();
}

/** Avanza hasta que se cumpla la condición (o se acabe el tiempo). Devuelve los segundos usados. */
export function runUntil(game: Game, cond: () => boolean, maxSeconds = 300): number {
  for (let i = 0; i < maxSeconds * 10; i++) {
    if (cond()) return i / 10;
    game.step();
  }
  return Infinity;
}

/**
 * Mapa plano y vacío de 40×40, controlado al detalle para pruebas precisas.
 * Jugador 1 con Centro Urbano en (4,4); jugador 2 con Centro Urbano en (33,33).
 */
export function flatGame(factions: [FactionId, FactionId] = ['legion', 'legion']): Game {
  const w = new World(40);
  w.addPlayer(1, 'Uno', '#2f6fd6', { x: 5, y: 5 }, factions[0]);
  w.addPlayer(2, 'Dos', '#d63a2f', { x: 34, y: 34 }, factions[1]);
  w.addBuilding('town_center', 1, 4, 4);
  w.addBuilding('town_center', 2, 33, 33);
  return new Game(w);
}
