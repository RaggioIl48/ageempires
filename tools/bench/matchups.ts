// Balance: enfrentamientos a igual costo entre tipos de unidad (Edad Media), en campo abierto.
// Cada celda = lo que le queda al de la fila menos lo que le queda al de la columna (+1 = gana limpio).
//
//   node --import tsx tools/bench/matchups.ts [presupuesto] [filas,separadas,por,comas] [columnas]
//   HOLD=1 …      la fila espera quieta (arqueros apostados) y la columna carga contra ella
//   TWEAK="UNIT_DEFS.archer.attack={...UNIT_DEFS.archer.attack,damage:7}" …   probar un cambio sin tocar los datos
import { UNIT_DEFS, type FactionId, type UnitType } from '../../shared/data.ts';
import { World } from '../../server/src/sim/world.ts';
import { Game } from '../../server/src/sim/game.ts';
import { queueMoves } from '../../server/src/sim/orders.ts';

// eslint-disable-next-line no-eval -- herramienta local de prueba: el cambio lo escribe quien la corre
if (process.env.TWEAK) eval(process.env.TWEAK);
const BUDGET = Number(process.argv[2] ?? 1200);
const types = (process.argv[3]?.split(',') ?? ['warrior', 'spearman', 'swordsman', 'archer', 'knight', 'scout']) as UnitType[];
const cols = (process.argv[4]?.split(',') ?? types) as UnitType[];
const costOf = (t: UnitType) => Object.values(UNIT_DEFS[t].cost).reduce((a, b) => a + (b ?? 0), 0);
const factionOf = (t: UnitType): FactionId => (UNIT_DEFS[t].faction as FactionId) ?? 'romans';

function fight(a: UnitType, b: UnitType, seed: number) {
  const w = new World(48);
  w.addPlayer(1, 'A', '#2f6fd6', { x: 2, y: 2 }, factionOf(a));
  w.addPlayer(2, 'B', '#d63a2f', { x: 45, y: 45 }, factionOf(b));
  for (const p of w.players.values()) (p as any).era = 2;
  const g = new Game(w);
  const side = (t: UnitType, owner: number, y: number) => {
    const n = Math.max(1, Math.round(BUDGET / costOf(t)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = w.addUnit(t, owner, 24 - n / 4 + (i % Math.ceil(n / 2)) * 1.0 + ((seed * 0.37) % 0.3), y + Math.floor(i / Math.ceil(n / 2)) * (owner === 1 ? -1 : 1));
      u.reg = owner * 1000 + Math.floor(i / 6);
      out.push(u);
    }
    return out;
  };
  const A = side(a, 1, 18), B = side(b, 2, process.env.HOLD ? 34 : 30);
  if (!process.env.HOLD) queueMoves(w, A, 24, 30, true);
  queueMoves(w, B, 24, 18, true);
  const v0a = A.length * costOf(a), v0b = B.length * costOf(b);
  let t = 0;
  for (; t < 1800; t++) {
    g.step();
    const la = A.filter((u) => w.units.has(u.id) && u.hp > 0).length, lb = B.filter((u) => w.units.has(u.id) && u.hp > 0).length;
    if (!la || !lb) break;
  }
  const hpLeft = (us: typeof A) => us.filter((u) => w.units.has(u.id) && u.hp > 0).reduce((s, u) => s + u.hp / w.statsOf(u).hp, 0);
  const ra = (hpLeft(A) * costOf(a)) / v0a, rb = (hpLeft(B) * costOf(b)) / v0b;
  return { score: ra - rb, secs: t / 10 };
}

const pad = (s: string, n = 9) => s.slice(0, n).padStart(n);
console.log(`budget ${BUDGET} per side; cell = A's value left minus B's (fraction, +1 = A wins clean)`);
console.log(pad('A \ B', 16) + cols.map((t) => pad(t)).join(''));
for (const a of types) {
  let row = pad(a, 16);
  let sum = 0;
  for (const b of cols) {
    if (a === b) { row += pad('-'); continue; }
    const r = [1, 2].map((s) => fight(a, b, s));
    const sc = r.reduce((x, y) => x + y.score, 0) / r.length;
    sum += sc; row += pad((sc >= 0 ? '+' : '') + sc.toFixed(2));
  }
  console.log(row + pad('avg ' + (sum / cols.length).toFixed(2), 11));
}
