// Lector de modelos COLLADA (.dae) de 0 A.D.: triángulos con posición, normal y dos
// juegos de coordenadas de textura (0 = color, 1 = oclusión ambiental), ya puestos en
// su lugar según los nodos de la escena. También devuelve los "puntos de accesorio"
// (nodos prop-…) donde se enganchan otras piezas (banderas, techos, adornos).

import { all, kid, kids, nums, parseXml } from './xml.mjs';

// ---------- Matrices 4×4 (columna: M · v), guardadas por filas ----------
export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}

const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const scale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
function rotate(ax, ay, az, deg) {
  const l = Math.hypot(ax, ay, az) || 1;
  const [x, y, z] = [ax / l, ay / l, az / l];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

export function apply(m, x, y, z) {
  return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
}

export function applyDir(m, x, y, z) {
  const v = [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function nodeMatrix(node) {
  let m = IDENTITY;
  for (const c of node.children) {
    const v = nums(c.text);
    if (c.name === 'matrix') m = mul(m, v);
    else if (c.name === 'translate') m = mul(m, translate(v[0], v[1], v[2]));
    else if (c.name === 'rotate') m = mul(m, rotate(v[0], v[1], v[2], v[3]));
    else if (c.name === 'scale') m = mul(m, scale(v[0], v[1], v[2]));
  }
  return m;
}

/** Datos de una fuente (<source>): lista de vectores del tamaño de su "stride". */
function sourceData(src) {
  const arr = nums(kid(src, 'float_array').text);
  const acc = all(src, 'accessor')[0];
  const stride = Number(acc?.attrs.stride ?? 1);
  return { arr, stride };
}

/** Triángulos de una geometría (sin transformar). */
function readGeometry(geom) {
  const mesh = kid(geom, 'mesh');
  if (!mesh) return [];
  const sources = new Map(kids(mesh, 'source').map((s) => [s.attrs.id, sourceData(s)]));
  const vertices = kid(mesh, 'vertices');
  const vertexInputs = new Map(kids(vertices, 'input').map((i) => [i.attrs.semantic, i.attrs.source.slice(1)]));
  const tris = [];
  for (const prim of [...kids(mesh, 'polylist'), ...kids(mesh, 'triangles'), ...kids(mesh, 'polygons')]) {
    const inputs = kids(prim, 'input');
    const stride = Math.max(...inputs.map((i) => Number(i.attrs.offset))) + 1;
    const pick = (semantic, set) => {
      const inp = inputs.find((i) => i.attrs.semantic === semantic && (set === undefined || Number(i.attrs.set ?? 0) === set));
      return inp ? { off: Number(inp.attrs.offset), src: sources.get(inp.attrs.source.slice(1)) } : null;
    };
    const vIn = inputs.find((i) => i.attrs.semantic === 'VERTEX');
    const pos = { off: Number(vIn.attrs.offset), src: sources.get(vertexInputs.get('POSITION')) };
    const nrm = pick('NORMAL') ?? (vertexInputs.get('NORMAL') ? { off: pos.off, src: sources.get(vertexInputs.get('NORMAL')) } : null);
    const texSets = inputs.filter((i) => i.attrs.semantic === 'TEXCOORD').map((i) => Number(i.attrs.set ?? 0)).sort((a, b) => a - b);
    const uv0 = texSets.length ? pick('TEXCOORD', texSets[0]) : null;
    const uv1 = texSets.length > 1 ? pick('TEXCOORD', texSets[1]) : null;
    const polys = prim.name === 'polygons' ? kids(prim, 'p').map((p) => nums(p.text)) : [nums(kid(prim, 'p').text)];
    const vcount = kid(prim, 'vcount') ? nums(kid(prim, 'vcount').text) : null;
    for (const p of polys) {
      const counts = prim.name === 'triangles' ? new Array(p.length / stride / 3).fill(3) : prim.name === 'polygons' ? [p.length / stride] : vcount;
      let at = 0;
      for (const cnt of counts) {
        const corner = (k) => {
          const base = (at + k) * stride;
          const get = (x, size) => (x ? x.src.arr.slice(p[base + x.off] * x.src.stride, p[base + x.off] * x.src.stride + size) : null);
          return { p: get(pos, 3), n: get(nrm, 3), t0: get(uv0, 2), t1: get(uv1, 2) };
        };
        for (let k = 1; k + 1 < cnt; k++) tris.push([corner(0), corner(k), corner(k + 1)]);
        at += cnt;
      }
    }
  }
  return tris;
}

/**
 * Carga un .dae. Devuelve { tris, points }:
 *   tris: triángulos [{p, n, t0, t1} ×3] en coordenadas del modelo (Z hacia arriba)
 *   points: puntos de accesorio { nombre: matriz } (sin el prefijo "prop-")
 */
export function loadCollada(text) {
  const doc = parseXml(text);
  const geoms = new Map(all(doc, 'geometry').map((g) => [g.attrs.id, g]));
  const controllers = new Map(all(doc, 'controller').map((c) => [c.attrs.id, c]));
  const cache = new Map();
  const geomTris = (id) => {
    if (!cache.has(id)) cache.set(id, geoms.has(id) ? readGeometry(geoms.get(id)) : []);
    return cache.get(id);
  };
  const tris = [];
  const points = {};
  const place = (list, m) => {
    for (const t of list)
      tris.push(t.map((c) => ({ p: apply(m, ...c.p), n: c.n ? applyDir(m, ...c.n) : null, t0: c.t0, t1: c.t1 })));
  };
  const visit = (node, parent) => {
    const m = mul(parent, nodeMatrix(node));
    const name = node.attrs.name ?? node.attrs.id ?? '';
    const pm = /^prop[-_](.+)$/.exec(name);
    if (pm) points[pm[1]] = m;
    for (const ig of kids(node, 'instance_geometry')) place(geomTris(ig.attrs.url.slice(1)), m);
    for (const ic of kids(node, 'instance_controller')) {
      const ctl = controllers.get(ic.attrs.url.slice(1));
      const skin = ctl && kid(ctl, 'skin');
      if (!skin) continue;
      const bind = kid(skin, 'bind_shape_matrix') ? nums(kid(skin, 'bind_shape_matrix').text) : IDENTITY;
      place(geomTris(skin.attrs.source.slice(1)), mul(m, bind));
    }
    for (const c of kids(node, 'node')) visit(c, m);
  };
  const scene = all(doc, 'visual_scene')[0];
  if (scene) for (const n of kids(scene, 'node')) visit(n, IDENTITY);
  return { tris, points };
}
