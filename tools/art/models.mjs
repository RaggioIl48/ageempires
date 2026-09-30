// Modelos 3D sueltos (FBX binario y OBJ) para dibujar vehículos con el mismo renderizador que
// los de 0 A.D. Devuelven piezas [{ tris, color?, tex?, name }] en coordenadas del modelo, con
// Z hacia arriba (como espera el renderizador).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Img } from './img.mjs';

/** Créditos de los modelos sueltos (todos CC0, de OpenGameArt). */
export const MODEL_CREDITS = {
  'model:t12': {
    pack: 'model', title: 'T-12 soviet light tank lowpoly', authors: ['artie31'], licenses: ['CC0'],
    urls: ['https://opengameart.org/content/t-12-soviet-light-tank-lowpoly'], notes: 'Tank (Modern Age), painted in the player color.',
  },
  'model:gaz67': {
    pack: 'model', title: 'Lowpoly soviet jeep (GAZ-67)', authors: ['artie31'], licenses: ['CC0'],
    urls: ['https://opengameart.org/content/lowpoly-soviet-jeep'], notes: 'Armored car (Industrial Age), painted in the player color.',
  },
  'model:biplane': {
    pack: 'model', title: 'Low-Poly Biplane', authors: ['mfep'], licenses: ['CC0'],
    urls: ['https://opengameart.org/content/low-poly-biplane'], notes: 'Airplane (Modern Age).',
  },
};

/** Descarga y descomprime un modelo de OpenGameArt la primera vez. */
export async function ensureModel(cache, zipName, dir) {
  const base = path.join(cache, 'models', dir);
  if (fs.existsSync(base) && fs.readdirSync(base).length) return base;
  fs.mkdirSync(base, { recursive: true });
  const zip = path.join(cache, 'models', zipName);
  if (!fs.existsSync(zip)) {
    const res = await fetch('https://opengameart.org/sites/default/files/' + zipName);
    if (!res.ok) throw new Error('modelo: descarga fallida ' + zipName);
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'bsdtar', ['-xf', zip, '-C', base]);
  return base;
}

// ---------- FBX binario ----------

/** Árbol de nodos de un FBX binario: { name, props, children }. */
export function readFbxTree(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 18) !== 'Kaydara FBX Binary') throw new Error(`${file}: no es un FBX binario`);
  const version = buf.readUInt32LE(23);
  const big = version >= 7500; // desde la 7.5 los desplazamientos son de 64 bits
  let p = 27;
  const u = () => {
    const v = big ? Number(buf.readBigUInt64LE(p)) : buf.readUInt32LE(p);
    p += big ? 8 : 4;
    return v;
  };
  const array = (type) => {
    const len = buf.readUInt32LE(p), enc = buf.readUInt32LE(p + 4), clen = buf.readUInt32LE(p + 8);
    p += 12;
    let data = buf.subarray(p, p + clen);
    p += clen;
    if (enc === 1) data = zlib.inflateSync(data);
    const out = [];
    for (let i = 0; i < len; i++) {
      if (type === 'd') out.push(data.readDoubleLE(i * 8));
      else if (type === 'f') out.push(data.readFloatLE(i * 4));
      else if (type === 'i') out.push(data.readInt32LE(i * 4));
      else if (type === 'l') out.push(Number(data.readBigInt64LE(i * 8)));
      else out.push(data[i]);
    }
    return out;
  };
  const prop = () => {
    const t = String.fromCharCode(buf[p++]);
    switch (t) {
      case 'Y': p += 2; return buf.readInt16LE(p - 2);
      case 'C': return buf[p++] !== 0;
      case 'I': p += 4; return buf.readInt32LE(p - 4);
      case 'F': p += 4; return buf.readFloatLE(p - 4);
      case 'D': p += 8; return buf.readDoubleLE(p - 8);
      case 'L': p += 8; return Number(buf.readBigInt64LE(p - 8));
      case 'S':
      case 'R': {
        const len = buf.readUInt32LE(p);
        p += 4 + len;
        return t === 'S' ? buf.toString('utf8', p - len, p) : buf.subarray(p - len, p);
      }
      default: return array(t);
    }
  };
  const node = () => {
    const end = u();
    const nprops = u();
    u(); // largo de la lista de propiedades
    const nameLen = buf[p++];
    if (end === 0) return null; // registro nulo: fin de la lista
    const name = buf.toString('ascii', p, p + nameLen);
    p += nameLen;
    const props = [];
    for (let i = 0; i < nprops; i++) props.push(prop());
    const children = [];
    while (p < end) {
      const c = node();
      if (!c) break;
      children.push(c);
    }
    p = end;
    return { name, props, children };
  };
  const root = [];
  while (p < buf.length - 160) {
    const n = node();
    if (!n) break;
    root.push(n);
  }
  return root;
}

const kid = (n, name) => n?.children.find((c) => c.name === name);

/** Propiedades "P" de un nodo Properties70: nombre → valores. */
function props70(n) {
  const out = {};
  for (const c of kid(n, 'Properties70')?.children ?? []) if (c.name === 'P') out[c.props[0]] = c.props.slice(4);
  return out;
}

/** Matriz 4×4 (columnas) de T·R·S con ángulos en grados, orden XYZ. */
function trs(t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const [x, y, z] = r.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // R = Rz · Ry · Rx
  const R = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
  return (v) => [0, 1, 2].map((i) => R[i][0] * v[0] * s[0] + R[i][1] * v[1] * s[1] + R[i][2] * v[2] * s[2] + t[i]);
}

/**
 * Piezas de un FBX: una por modelo con malla, con el color de su material (o de cada material,
 * si la malla tiene varios). El eje vertical del archivo se pasa a Z.
 */
export function loadFbx(file) {
  const tree = readFbxTree(file);
  const objects = tree.find((n) => n.name === 'Objects');
  const conns = tree.find((n) => n.name === 'Connections')?.children.filter((c) => c.name === 'C') ?? [];
  const byId = new Map(objects.children.map((o) => [o.props[0], o]));
  const parentOf = new Map(), kids = new Map();
  for (const c of conns)
    if (c.props[0] === 'OO') {
      parentOf.set(c.props[1], c.props[2]);
      if (!kids.has(c.props[2])) kids.set(c.props[2], []);
      kids.get(c.props[2]).push(c.props[1]);
    }
  const settings = props70(tree.find((n) => n.name === 'GlobalSettings'));
  const upAxis = settings.UpAxis?.[0] ?? 1;
  // Transformación de un modelo, con la de sus padres.
  const world = (id) => {
    const chain = [];
    for (let cur = id; cur && byId.get(cur)?.name === 'Model'; cur = parentOf.get(cur)) chain.push(byId.get(cur));
    const fns = chain.map((m) => {
      const pr = props70(m);
      const pre = pr.PreRotation ?? [0, 0, 0];
      const rot = trs([0, 0, 0], pr['Lcl Rotation'] ?? [0, 0, 0]);
      const preR = trs([0, 0, 0], pre);
      const scale = pr['Lcl Scaling'] ?? [1, 1, 1];
      const t = pr['Lcl Translation'] ?? [0, 0, 0];
      return (v) => {
        const s = [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]];
        const r = preR(rot(s));
        return [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
      };
    });
    return (v) => fns.reduce((acc, f) => f(acc), v);
  };
  const toZup = (v) => (upAxis === 2 ? v : [v[0], -v[2], v[1]]);
  const parts = [];
  for (const g of objects.children.filter((o) => o.name === 'Geometry')) {
    const model = parentOf.get(g.props[0]);
    const xf = world(model);
    const mats = (kids.get(model) ?? []).map((id) => byId.get(id)).filter((o) => o?.name === 'Material');
    const colorOf = (m) => {
      const pr = props70(m);
      const c = pr.DiffuseColor ?? pr.Diffuse ?? [0.7, 0.7, 0.7];
      return c.slice(0, 3).map((x) => Math.round(Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2) * 255));
    };
    const verts = kid(g, 'Vertices').props[0];
    const index = kid(g, 'PolygonVertexIndex').props[0];
    const lm = kid(g, 'LayerElementMaterial');
    const matIdx = lm ? kid(lm, 'Materials').props[0] : [0];
    const allSame = !lm || kid(lm, 'MappingInformationType').props[0] === 'AllSame';
    const byMat = new Map();
    let poly = [], pi = 0;
    for (const raw of index) {
      const last = raw < 0;
      poly.push(last ? ~raw : raw);
      if (!last) continue;
      const mi = allSame ? matIdx[0] ?? 0 : matIdx[pi] ?? 0;
      const pts = poly.map((k) => toZup(xf([verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]])));
      if (!byMat.has(mi)) byMat.set(mi, []);
      for (let i = 1; i + 1 < pts.length; i++) byMat.get(mi).push([pts[0], pts[i], pts[i + 1]].map((q) => ({ p: q, n: null })));
      poly = [];
      pi++;
    }
    for (const [mi, tris] of byMat) {
      const mat = mats[mi];
      parts.push({ tris, color: mat ? colorOf(mat) : [170, 170, 170], name: `${g.props[1].split('\u0000')[0]}/${mat ? mat.props[1].split('\u0000')[0] : '-'}`, mode: 'opaque' });
    }
  }
  return parts;
}

// ---------- OBJ ----------

/** OBJ con una textura (opcional) para todo el modelo; Y hacia arriba en el archivo → Z. */
export function loadObj(file, texture) {
  const text = fs.readFileSync(file, 'utf8');
  const v = [], vt = [];
  const tris = [];
  for (const line of text.split('\n')) {
    const a = line.trim().split(/\s+/);
    if (a[0] === 'v') v.push([+a[1], -+a[3], +a[2]]);
    else if (a[0] === 'vt') vt.push([+a[1], 1 - +a[2]]);
    else if (a[0] === 'f') {
      const pts = a.slice(1).map((s) => {
        const [iv, it] = s.split('/').map((x) => (x ? parseInt(x, 10) : 0));
        return { p: v[iv > 0 ? iv - 1 : v.length + iv], t0: it ? vt[it > 0 ? it - 1 : vt.length + it] : null, n: null };
      });
      for (let i = 1; i + 1 < pts.length; i++) tris.push([pts[0], pts[i], pts[i + 1]]);
    }
  }
  const tex = texture && fs.existsSync(texture) ? Img.read(texture) : null;
  return [{ tris, tex, name: path.basename(file), mode: 'opaque' }];
}
