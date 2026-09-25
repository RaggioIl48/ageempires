// Licencias del arte: cuáles aceptamos y con qué licencia se publica cada imagen armada.
// Una imagen mezcla piezas de varios autores; se publica con una licencia que TODAS
// sus piezas permitan (cada pieza suele ofrecer varias a elegir).

/** Licencias con las que se puede publicar una imagen, y qué licencias de pieza caben en cada una. */
export const OUTPUT_LICENSES = {
  'CC-BY-SA 4.0': ['CC0', 'CC-BY 3.0', 'CC-BY 4.0', 'OGA-BY 3.0', 'CC-BY-SA 3.0', 'CC-BY-SA 4.0'],
  'GPL 3.0': ['CC0', 'CC-BY 4.0', 'CC-BY-SA 4.0', 'GPL 3.0'],
};

/** Licencias abiertas permitidas para cualquier pieza (sin "no comercial" ni "sin derivados"). */
export const ALLOWED = ['CC0', 'CC-BY 3.0', 'CC-BY 4.0', 'OGA-BY 3.0', 'CC-BY-SA 3.0', 'CC-BY-SA 4.0', 'GPL 2.0', 'GPL 3.0'];

/**
 * Nombres uniformes: LPC escribe a veces "OGA-BY-3.0" o "GPL 2.0+" ("o posterior").
 * "X o posterior" se expande a las versiones que permite usar.
 */
export function normalizeLicenses(list) {
  const out = [];
  for (const raw of list) {
    let l = raw.trim().replace(/^OGA-BY-/, 'OGA-BY ').replace(/^CC-BY-SA-/, 'CC-BY-SA ').replace(/^CC-BY-(\d)/, 'CC-BY $1');
    if (/^CC0/i.test(l)) l = 'CC0';
    const later = l.endsWith('+');
    if (later) l = l.slice(0, -1);
    out.push(l);
    if (later && l === 'GPL 2.0') out.push('GPL 3.0');
    if (later && l === 'CC-BY-SA 3.0') out.push('CC-BY-SA 4.0');
    if (later && l === 'CC-BY 3.0') out.push('CC-BY 4.0');
  }
  return [...new Set(out)];
}

/** Licencia de una imagen hecha con piezas cuyas licencias son `lists` (una lista por pieza). */
export function sheetLicense(lists) {
  for (const [out, accepts] of Object.entries(OUTPUT_LICENSES))
    if (lists.every((l) => l.some((x) => accepts.includes(x)))) return out;
  throw new Error(`sin licencia común para: ${JSON.stringify(lists)}`);
}
