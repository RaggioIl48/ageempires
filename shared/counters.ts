// "¿Contra quién es buena esta unidad y quién le gana?" — se calcula a partir
// de las tablas de ventajas, así la guía y el panel de información siempre
// coinciden con lo que de verdad pasa en combate. Solo se nombran unidades que
// existen en las mismas eras (un explorador tribal no se cruza con tanques).

import { CATEGORY_LABELS, DAMAGE_BONUS, UNIT_DEFS, type Category, type UnitType } from './data.ts';

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
    const mult = d.bonus?.[c] ?? DAMAGE_BONUS[d.category]?.[c] ?? 1;
    if (mult > 1 && categoryAround(type, c)) out.push(`${CATEGORY_LABELS[c]} ×${mult}`);
  }
  return out;
}

/** Quién le hace daño extra a esta unidad: tipos y unidades especialistas. */
export function weakAgainst(type: UnitType): string[] {
  const cat = UNIT_DEFS[type].category;
  const out: string[] = [];
  for (const c of Object.keys(DAMAGE_BONUS) as Category[])
    if ((DAMAGE_BONUS[c]?.[cat] ?? 1) > 1 && categoryAround(type, c)) out.push(CATEGORY_LABELS[c]);
  // Especialistas (p. ej. lanceros contra caballería, antitanques contra blindados).
  for (const u of ALL) {
    const d = UNIT_DEFS[u];
    if (d.faction || !coexist(type, u)) continue;
    if ((d.bonus?.[cat] ?? 1) > (DAMAGE_BONUS[d.category]?.[cat] ?? 1)) out.push(d.label);
  }
  if (UNIT_DEFS[type].flies) out.push('only ranged attacks can hit it');
  return out;
}
