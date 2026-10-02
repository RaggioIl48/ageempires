// "¿Contra quién es buena esta unidad y quién le gana?" — se calcula a partir
// de las tablas de ventajas, así la guía y el panel de información siempre
// coinciden con lo que de verdad pasa en combate. Solo se nombran unidades que
// existen en las mismas eras (un explorador tribal no se cruza con tanques).

import { CATEGORY_LABELS, DAMAGE_BONUS, UNIT_DEFS, type Category, type UnitType, type Weapon } from './data.ts';
import { weaponMult } from './stats.ts';

const WEAPON_LABELS: Record<Weapon, string> = { spear: 'Spear infantry', blade: 'Sword and axe infantry' };

/** Multiplicador de daño de `a` contra un objetivo (categoría y arma), como en combate. */
function multOf(a: UnitType, cat: Category, tw?: Weapon): number {
  const A = UNIT_DEFS[a];
  let m = A.bonus?.[cat] ?? DAMAGE_BONUS[A.category]?.[cat] ?? 1;
  const w = weaponMult(A.attack, A.category, A.weapon, cat, tw);
  if (w !== undefined) m = w < 1 ? Math.min(m, w) : Math.max(m, w);
  return m;
}

const ALL = Object.keys(UNIT_DEFS) as UnitType[];

/** ¿Pueden encontrarse estas dos unidades en alguna era? */
function coexist(a: UnitType, b: UnitType): boolean {
  const A = UNIT_DEFS[a], B = UNIT_DEFS[b];
  return A.era <= B.untilEra && B.era <= A.untilEra;
}

/** ¿Hay alguna unidad de esta categoría en las eras de `type`? */
function categoryAround(type: UnitType, cat: Category): boolean {
  return cat === 'building' || ALL.some((u) => UNIT_DEFS[u].category === cat && coexist(type, u));
}

/** Tipos contra los que esta unidad hace daño extra. */
export function goodAgainst(type: UnitType): string[] {
  const d = UNIT_DEFS[type];
  const out: string[] = [];
  for (const c of Object.keys(CATEGORY_LABELS) as Category[]) {
    const mult = multOf(type, c);
    if (mult > 1 && categoryAround(type, c)) out.push(`${CATEGORY_LABELS[c]} ×${mult}`);
  }
  // Lanza o espada: ventaja contra un tipo de infantería en particular.
  for (const w of Object.keys(WEAPON_LABELS) as Weapon[]) {
    const mult = multOf(type, 'infantry', w);
    if (mult > Math.max(1, multOf(type, 'infantry')) && ALL.some((u) => UNIT_DEFS[u].weapon === w && coexist(type, u)))
      out.push(`${WEAPON_LABELS[w]} ×${mult}`);
  }
  return out;
}

/** Quién le hace daño extra a esta unidad: tipos y unidades especialistas. */
export function weakAgainst(type: UnitType): string[] {
  const def = UNIT_DEFS[type], cat = def.category;
  const out: string[] = [];
  for (const c of Object.keys(DAMAGE_BONUS) as Category[]) {
    // La infantería en general ya no es buena contra la caballería: solo la de lanzas (va abajo).
    if (c === 'infantry' && cat === 'cavalry' && !ALL.some((u) => UNIT_DEFS[u].category === 'infantry' && !UNIT_DEFS[u].weapon && !UNIT_DEFS[u].faction && coexist(type, u))) continue;
    if ((DAMAGE_BONUS[c]?.[cat] ?? 1) > 1 && categoryAround(type, c)) out.push(CATEGORY_LABELS[c]);
  }
  // Especialistas (p. ej. lanceros contra caballería, espadachines contra lanceros, antitanques contra blindados).
  for (const u of ALL) {
    const d = UNIT_DEFS[u];
    if (d.faction || !coexist(type, u)) continue;
    if (multOf(u, cat, def.weapon) > Math.max(1, DAMAGE_BONUS[d.category]?.[cat] ?? 1)) out.push(d.label);
  }
  if (UNIT_DEFS[type].flies) out.push('only ranged attacks can hit it');
  return out;
}
