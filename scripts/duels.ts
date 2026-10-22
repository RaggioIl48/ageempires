// Auditoría de jugabilidad: duelos de regimientos en el simulador (sin red ni navegador).
//
//   npx tsx scripts/duels.ts                    → tabla de duelos, con los dos bandos quietos
//   npx tsx scripts/duels.ts --avance           → lo mismo, con el bando izquierdo atacando-moviendo
//   npx tsx scripts/duels.ts spearman knight    → un solo duelo (quieto)
//   npx tsx scripts/duels.ts --avance spearman horse_archer
//
// Dos bandos de 8 soldados en regimientos de 4, uno frente al otro, en mapa plano y con los frentes a
// la misma distancia del centro. Cada pareja se juega dos veces (cada tipo a cada lado) y se promedia,
// para que ningún lado tenga ventaja por la posición. Dura 90 s. Celda: vivos de la fila / vivos de la
// columna (promedio de las dos posiciones).
//
// Quieto: ninguno recibe órdenes (como un jugador que espera). Avance: el bando que está a la izquierda
// recibe una orden de atacar-moviendo hacia el otro (como un jugador que manda a pelear).

import { flatGame } from '../server/test/helpers.ts';
import { UNIT_DEFS, type UnitType } from '../shared/data.ts';

const SIZE = 8;
const SECONDS = 90;

interface Opts { advance: boolean }

/** Un duelo: `left` a la izquierda del mapa contra `right` a la derecha. Devuelve los vivos de cada uno. */
function play(left: UnitType, right: UnitType, opts: Opts): { left: number; right: number } {
  const g = flatGame();
  const w = g.world;
  for (const bld of [...w.buildings.values()]) w.removeBuilding(bld.id);
  w.setRelation(1, 2, 'war');
  const L: number[] = [], R: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    const r = Math.floor(i / 4), c = i % 4;
    const l = w.addUnit(left, 1, 18.5 - c * 1.2, 18 + r * 1.2);
    const rt = w.addUnit(right, 2, 21.5 + c * 1.2, 18 + r * 1.2);
    l.reg = 1000 + r;
    rt.reg = 1100 + r;
    L.push(l.id);
    R.push(rt.id);
  }
  if (opts.advance) g.enqueue(1, { kind: 'move', unitIds: L, x: 27, y: 19, amove: true });
  for (let i = 0; i < SECONDS * 10; i++) {
    g.step();
    const live = (ids: number[]) => ids.some((id) => (w.units.get(id)?.hp ?? 0) > 0 && !w.units.get(id)!.routing);
    if (!live(L) || !live(R)) break;
  }
  const alive = (ids: number[]) => ids.filter((id) => (w.units.get(id)?.hp ?? 0) > 0).length;
  return { left: alive(L), right: alive(R) };
}

/** Promedio de las dos posiciones: `a` a la izquierda y `a` a la derecha (con `b` al otro lado). */
function duel(a: UnitType, b: UnitType, opts: Opts): { a: number; b: number } {
  const x = play(a, b, opts); // a a la izquierda
  const y = play(b, a, opts); // a a la derecha
  return { a: (x.left + y.right) / 2, b: (x.right + y.left) / 2 };
}

const argv = process.argv.slice(2);
const opts: Opts = { advance: argv.includes('--avance') };
const args = argv.filter((a) => a !== '--avance') as UnitType[];
const mode = opts.advance ? 'el bando izquierdo ataca-moviendo' : 'ambos quietos';

if (args.length === 2) {
  const [a, b] = args;
  console.log(`${a} (${SIZE}) contra ${b} (${SIZE}), ${SECONDS} s, ${mode}, promedio de las dos posiciones`);
  const r = duel(a, b, opts);
  console.log(`  ${a}: ${r.a.toFixed(1)} vivos   ${b}: ${r.b.toFixed(1)} vivos`);
  process.exit(0);
}

const FIELD: UnitType[] = [
  'warrior', 'spearman', 'swordsman', 'archer', 'knight', 'scout',
  'legionary', 'chosen_spearman', 'horse_archer', 'gothic_knight', 'berserker', 'fanatic',
];
const short = (t: UnitType) => t.slice(0, 7).padStart(8);
console.log(`Duelos de ${SIZE} contra ${SIZE}, ${SECONDS} s, ${mode}, promedio de las dos posiciones.`);
console.log('Celda: vivos de la fila / vivos de la columna. "-" = mismo tipo.\n');
console.log(' '.repeat(16) + FIELD.map(short).join(''));
const table: Record<string, Record<string, { a: number; b: number }>> = {};
for (const a of FIELD) {
  table[a] = {};
  const cells = FIELD.map((b) => {
    if (a === b) return '     - ';
    if (table[b]?.[a]) {
      const v = table[b][a];
      table[a][b] = { a: v.b, b: v.a };
    } else {
      table[a][b] = duel(a, b, opts);
    }
    const r = table[a][b];
    return `${r.a.toFixed(1)}/${r.b.toFixed(1)}`.padStart(8);
  });
  console.log(a.padEnd(16) + cells.join(''));
}
console.log('\nFirma por tipo:');
for (const t of FIELD) {
  const d = UNIT_DEFS[t];
  console.log(`  ${t.padEnd(16)} ${d.category.padEnd(9)} vel ${d.speed}  vida ${d.hp}  ataque ${d.attack.damage} cada ${d.attack.cooldown}s  alcance ${d.attack.range}  arma ${d.weapon ?? '-'}`);
}
