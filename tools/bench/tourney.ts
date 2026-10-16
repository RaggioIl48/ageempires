// Balance entre pueblos: torneo de bots (nivel normal), todos contra todos, partidas completas.
//
//   node --import tsx tools/bench/tourney.ts [minutos máx.] [pueblos,separados,por,comas] [rondas]
//   (cada ronda = 2 partidas por par, con los lados cambiados; ~20 s por partida)
import { FACTION_ORDER, TICK_RATE, type FactionId } from '../../shared/data.ts';
import { Game } from '../../server/src/sim/game.ts';
import { AiPlayer } from '../../server/src/sim/ai.ts';
import { initRelations } from '../../server/src/sim/diplomacy.ts';
import { decideByGlory } from '../../server/src/sim/victory.ts';

const MAX_MIN = Number(process.argv[2] ?? 30);
const only = process.argv[3] ? (process.argv[3].split(',') as FactionId[]) : undefined;
const factions = (only ?? FACTION_ORDER) as FactionId[];
const wins: Record<string, number> = {}, games: Record<string, number> = {};
const lens: number[] = [];
function play(f1: FactionId, f2: FactionId, seed: number): FactionId | null {
  const g = new Game({ slots: 2, seed, players: [{ name: 'P1', color: '#00f', faction: f1 }, { name: 'P2', color: '#f00', faction: f2 }] } as never);
  try { (initRelations as any)(g.world, 'free'); } catch {}
  const ais = [1, 2].map((id) => new AiPlayer(id, 'normal'));
  const limit = MAX_MIN * 60 * TICK_RATE;
  while (!g.world.outcome && g.world.tick < limit) { for (const a of ais) a.update(g); g.step(); }
  lens.push(g.world.tick / TICK_RATE / 60);
  const winners = g.world.outcome?.winners ?? decideByGlory(g.world).winners;
  const how = g.world.outcome ? g.world.outcome.reason : 'time';
  const w = winners.length === 1 ? (winners[0] === 1 ? f1 : f2) : null;
  console.log(`${f1} vs ${f2} seed ${seed}: ${w ?? 'draw'} (${how}, ${(g.world.tick / TICK_RATE / 60).toFixed(1)} min)`);
  return w;
}
for (let i = 0; i < factions.length; i++) for (let j = i + 1; j < factions.length; j++) {
  const seeds = Number(process.argv[4] ?? 1);
  for (let k = 0; k < seeds; k++) for (const [a, b, s] of [[factions[i], factions[j], 101 + k * 1000], [factions[j], factions[i], 202 + k * 1000]] as const) {
    const w = play(a, b, s);
    games[a] = (games[a] ?? 0) + 1; games[b] = (games[b] ?? 0) + 1;
    if (w) wins[w] = (wins[w] ?? 0) + 1;
  }
}
console.log('--- win rate ---');
for (const f of factions) console.log(f.padEnd(12), `${wins[f] ?? 0}/${games[f]}`, `${Math.round((100 * (wins[f] ?? 0)) / games[f])}%`);
console.log('avg length', (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1), 'min');
