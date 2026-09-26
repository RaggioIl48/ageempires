// Lector XML mínimo (sin dependencias): elementos, atributos y texto.
// Suficiente para los actores y modelos COLLADA de 0 A.D.

export function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += src.slice(i, lt);
    if (src.startsWith('<!--', lt)) {
      i = src.indexOf('-->', lt) + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      i = src.indexOf('?>', lt) + 2;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      stack[stack.length - 1].text += src.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      i = src.indexOf('>', lt) + 1;
      continue;
    }
    const gt = src.indexOf('>', lt);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith('/')) {
      stack.pop();
      continue;
    }
    const self = raw.endsWith('/');
    const body = self ? raw.slice(0, -1) : raw;
    const m = /^([^\s/>]+)/.exec(body);
    const el = { name: m[1], attrs: {}, children: [], text: '' };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = re.exec(body))) el.attrs[a[1]] = a[3] ?? a[4];
    stack[stack.length - 1].children.push(el);
    if (!self) stack.push(el);
  }
  return root;
}

/** Hijos directos con ese nombre. */
export const kids = (el, name) => el.children.filter((c) => c.name === name);
/** Primer hijo con ese nombre. */
export const kid = (el, name) => el.children.find((c) => c.name === name);
/** Todos los descendientes con ese nombre. */
export function all(el, name, out = []) {
  for (const c of el.children) {
    if (c.name === name) out.push(c);
    all(c, name, out);
  }
  return out;
}
/** Números de un texto ("1 2 3.5 …"). */
export const nums = (s) => {
  const t = s.trim();
  return t ? t.split(/\s+/).map(Number) : [];
};
