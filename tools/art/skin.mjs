// Modelos con esqueleto de 0 A.D. (COLLADA): la malla "pegada" a los huesos (skinning) y
// las animaciones (una matriz local por hueso y por instante). Con esto se puede poner al
// soldado en cualquier cuadro de su paso, su golpe o su caída, y dibujarlo con raster.mjs.
//
// Fórmula (skinning lineal, como el motor de 0 A.D.):
//   v' = Σ peso_j · (Mundo_j(t) · BindInversa_j · BindShape) · v

import { IDENTITY, apply, mul, nodeMatrix, readGeometry, sourceData } from './collada.mjs';
import { all, kid, kids, nums, parseXml } from './xml.mjs';

/** Árbol de nodos de la escena: { id, name, sid, local, children }. */
function readNodes(doc) {
  const scene = all(doc, 'visual_scene')[0];
  const conv = (n) => ({
    id: n.attrs.id ?? '',
    name: n.attrs.name ?? n.attrs.id ?? '',
    sid: n.attrs.sid ?? n.attrs.name ?? '',
    joint: n.attrs.type === 'JOINT',
    local: nodeMatrix(n),
    children: kids(n, 'node').map(conv),
  });
  return scene ? kids(scene, 'node').map(conv) : [];
}

/**
 * Malla con esqueleto. Devuelve { tris, weights, joints, invBind, bindShape, nodes }:
 *   tris: triángulos con esquinas { p, n, t0, t1, vi } (sin posar)
 *   weights[vi] = [[índice de hueso, peso], …]
 *   joints[j] = sid del hueso; invBind[j] = su matriz de enlace inversa
 */
export function loadSkinned(text) {
  const doc = parseXml(text);
  const skin = all(doc, 'skin')[0];
  if (!skin) throw new Error('el modelo no tiene esqueleto (skin)');
  const geom = all(doc, 'geometry').find((g) => g.attrs.id === skin.attrs.source.slice(1));
  const sources = new Map(kids(skin, 'source').map((s) => [s.attrs.id, s]));
  const jointSrc = sources.get(kids(kid(skin, 'joints'), 'input').find((i) => i.attrs.semantic === 'JOINT').attrs.source.slice(1));
  const joints = (kid(jointSrc, 'Name_array') ?? kid(jointSrc, 'IDREF_array')).text.trim().split(/\s+/);
  const ibmSrc = sources.get(kids(kid(skin, 'joints'), 'input').find((i) => i.attrs.semantic === 'INV_BIND_MATRIX').attrs.source.slice(1));
  const ibm = sourceData(ibmSrc).arr;
  const invBind = joints.map((_, j) => ibm.slice(j * 16, j * 16 + 16));
  const vw = kid(skin, 'vertex_weights');
  const inputs = kids(vw, 'input');
  const stride = Math.max(...inputs.map((i) => Number(i.attrs.offset))) + 1;
  const jOff = Number(inputs.find((i) => i.attrs.semantic === 'JOINT').attrs.offset);
  const wIn = inputs.find((i) => i.attrs.semantic === 'WEIGHT');
  const wArr = sourceData(sources.get(wIn.attrs.source.slice(1))).arr;
  const vcount = nums(kid(vw, 'vcount').text), v = nums(kid(vw, 'v').text);
  const weights = [];
  let at = 0;
  for (const c of vcount) {
    const list = [];
    for (let k = 0; k < c; k++, at += stride) list.push([v[at + jOff], wArr[v[at + Number(wIn.attrs.offset)]]]);
    const sum = list.reduce((s, x) => s + x[1], 0) || 1;
    weights.push(list.map(([j, w]) => [j, w / sum]));
  }
  const bindShape = kid(skin, 'bind_shape_matrix') ? nums(kid(skin, 'bind_shape_matrix').text) : IDENTITY;
  return { tris: readGeometry(geom), weights, joints, invBind, bindShape, nodes: readNodes(doc) };
}

/**
 * Animación: { duration, tracks: Map(id del nodo → { times, mats }) }.
 * Cada canal reemplaza la matriz local entera de su nodo ("Nodo/transform").
 */
export function loadAnimation(text) {
  const doc = parseXml(text);
  const tracks = new Map();
  let duration = 0;
  for (const anim of all(doc, 'animation')) {
    const ch = kid(anim, 'channel');
    if (!ch) continue;
    const [node, what] = ch.attrs.target.split('/');
    if (what !== 'transform') continue;
    const sampler = kids(anim, 'sampler').find((s) => s.attrs.id === ch.attrs.source.slice(1));
    const srcOf = (sem) => kids(anim, 'source').find((s) => s.attrs.id === kids(sampler, 'input').find((i) => i.attrs.semantic === sem).attrs.source.slice(1));
    const times = sourceData(srcOf('INPUT')).arr;
    const out = sourceData(srcOf('OUTPUT')).arr;
    if (out.length < times.length * 16) continue;
    tracks.set(node, { times, mats: times.map((_, k) => out.slice(k * 16, k * 16 + 16)) });
    duration = Math.max(duration, times[times.length - 1]);
  }
  return { duration, tracks };
}

/** Matriz local de un canal en el instante t (interpolación lineal entre muestras vecinas). */
function sampleTrack(tr, t) {
  const { times, mats } = tr;
  if (t <= times[0]) return mats[0];
  const last = times.length - 1;
  if (t >= times[last]) return mats[last];
  let k = 0;
  while (k < last && times[k + 1] < t) k++;
  const f = (t - times[k]) / (times[k + 1] - times[k] || 1);
  return mats[k].map((x, i) => x * (1 - f) + mats[k + 1][i] * f);
}

/**
 * Pose en el instante t: matrices de mundo de cada nodo, por sid y por nombre.
 * `fixRoot` = deja el cuerpo en el lugar (sin avanzar con el paso; el juego mueve la unidad).
 */
export function pose(nodes, anim, t, { fixRoot = true } = {}) {
  const world = new Map();
  const visit = (n, parent, depth) => {
    const tr = anim?.tracks.get(n.id);
    let local = tr ? sampleTrack(tr, t) : n.local;
    // El nodo raíz del esqueleto no avanza: solo conserva su altura.
    if (fixRoot && depth === 0 && tr) {
      local = [...local];
      local[3] = n.local[3];
      local[7] = n.local[7];
    }
    const m = mul(parent, local);
    if (n.sid) world.set(n.sid, m);
    if (n.name && !world.has(n.name)) world.set(n.name, m);
    for (const c of n.children) visit(c, m, depth + 1);
  };
  for (const n of nodes) visit(n, IDENTITY, 0);
  return world;
}

/** Triángulos de la malla puestos en la pose (posición y normal). */
export function skinTris(model, world) {
  const skinMats = model.joints.map((j, k) => mul(mul(world.get(j) ?? IDENTITY, model.invBind[k]), model.bindShape));
  // Matriz mezclada de cada vértice (las esquinas que comparten vértice comparten matriz).
  const blended = new Map();
  const matOf = (vi) => {
    let m = blended.get(vi);
    if (!m) {
      const ws = model.weights[vi] ?? [];
      m = ws.length ? new Array(16).fill(0) : IDENTITY;
      for (const [j, w] of ws) for (let i = 0; i < 16; i++) m[i] += skinMats[j][i] * w;
      blended.set(vi, m);
    }
    return m;
  };
  const vert = (c) => {
    const m = matOf(c.vi);
    const p = apply(m, ...c.p);
    let n = null;
    if (c.n) {
      n = [m[0] * c.n[0] + m[1] * c.n[1] + m[2] * c.n[2], m[4] * c.n[0] + m[5] * c.n[1] + m[6] * c.n[2], m[8] * c.n[0] + m[9] * c.n[1] + m[10] * c.n[2]];
      const l = Math.hypot(...n) || 1;
      n = n.map((x) => x / l);
    }
    return { p, n, t0: c.t0, t1: c.t1 };
  };
  return model.tris.map((t) => t.map(vert));
}
