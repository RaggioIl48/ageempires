// Tráfico de red por estudiante: bytes por segundo que manda el servidor a cada jugador en una
// partida con bots y ejércitos grandes (lo que importa en el Wi-Fi del aula).
//   node --import tsx tools/bench/traffic.ts [jugadores] [regimientos de demostración] [minutos]
import { deflateRawSync } from 'node:zlib';
import { TICK_RATE } from '../../shared/data.ts';
import { Game } from '../../server/src/sim/game.ts';
import { AiPlayer } from '../../server/src/sim/ai.ts';
import { spawnDemoArmies } from '../../server/src/sim/demo.ts';
import { buildFrame, ClientSync } from '../../server/src/net/sync.ts';

const slots = Number(process.argv[2] ?? 8), regs = Number(process.argv[3] ?? 6), mins = Number(process.argv[4] ?? 3);
const g = new Game({ slots, seed: 5 } as never);
g.enableFog();
spawnDemoArmies(g.world, regs);
const ais = [...g.world.players.keys()].map((id) => new AiPlayer(id, 'normal'));
const syncs = [...g.world.players.keys()].map((id) => new ClientSync(id));
let raw = 0, packed = 0, peak = 0, sec = 0;
const ticks = mins * 60 * TICK_RATE;
for (let t = 0; t < ticks; t++) {
  for (const a of ais) a.update(g);
  g.step();
  const fr = buildFrame(g, 0);
  for (const s of syncs) {
    s.collect(fr);
    const txt = JSON.stringify(s.build(fr, g));
    raw += txt.length;
    packed += deflateRawSync(txt).length;
    if (s === syncs[0]) sec += txt.length;
  }
  if (t % TICK_RATE === TICK_RATE - 1) {
    peak = Math.max(peak, sec);
    sec = 0;
  }
}
const secs = ticks / TICK_RATE, n = syncs.length;
console.log(`${n} players, ${g.world.units.size} units at the end`);
console.log(`per student: avg ${((raw / n / secs) * 8 / 1000).toFixed(0)} kbit/s (compressed ~${((packed / n / secs) * 8 / 1000).toFixed(0)}), peak ${((peak * 8) / 1000).toFixed(0)} kbit/s`);
console.log(`30 students ≈ ${((raw / n / secs) * 8 * 30 / 1e6).toFixed(1)} Mbit/s total`);
