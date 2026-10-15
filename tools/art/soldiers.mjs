// Soldados de 0 A.D. animados en 8 direcciones (en lugar de las 4 de los personajes LPC).
//
// 1. Resuelve el actor de 0 A.D. (cuerpo con esqueleto, cabeza, casco, armas, escudo y sus
//    texturas) y descarga lo que falte a tools/art/.cache/0ad-files.
// 2. Pone al modelo en cada cuadro de sus animaciones REALES de 0 A.D. (reposo, paso, ataque,
//    muerte) con skin.mjs: la malla sigue a los huesos y las armas/escudo/casco a sus puntos.
// 3. Lo dibuja con raster.mjs (la misma vista isométrica 2:1 y la misma luz que los edificios
//    de 0 A.D. del juego) en las 8 direcciones, con la máscara del color del jugador que trae
//    el propio modelo (material "player": el alfa de la textura marca dónde va el color).
// 4. Empaqueta la hoja (pack.mjs) en el formato 'oga8' del juego, reducida a 256 colores
//    (quantize.mjs) para que pese ~600 KB en vez de ~2,5 MB.
//
// Uso:  npm run art                         (lo llama build.mjs, junto con el resto del arte)
//       node tools/art/soldiers.mjs [id]    (solo los soldados, o uno; actualiza units.json)
//
// Por qué no Blender: Blender 5.x ya no trae el importador COLLADA (.dae), que es el formato de
// 0 A.D.; leer el .dae y hacer el skinning acá deja el arte reproducible sin programas externos.
//
// Licencia: modelos, texturas y animaciones de 0 A.D. (Wildfire Games), CC-BY-SA 3.0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { readDds } from './dds.mjs';
import { packSheet } from './pack.mjs';
import { quantize } from './quantize.mjs';
import { IDENTITY, loadCollada, mul } from './collada.mjs';
import { loadAnimation, loadSkinned, pose, skinTris } from './skin.mjs';
import { HEIGHT_PX, cropRender, render } from './raster.mjs';
import { kid, kids, parseXml } from './xml.mjs';
import { ZEROAD_COMMIT, ZEROAD_CREDIT } from './zeroad.mjs';
import { normalizeLicenses, sheetLicense } from './licenses.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FILES = path.join(HERE, '.cache/0ad-files');
const OUT = path.join(ROOT, 'client/public/art');
const RAW = `https://raw.githubusercontent.com/0ad/0ad/${ZEROAD_COMMIT}/binaries/data/mods/public/art/`;

export const SOLDIER_CREDIT_ID = '0ad:units';
export const SOLDIER_CREDIT = {
  ...ZEROAD_CREDIT,
  pack: '0ad',
  title: '0 A.D. soldiers (models, textures and animations)',
  notes: 'Skeletal 3D models posed with their own 0 A.D. animations and drawn as 8-direction pictures with tools/art/soldiers.mjs.',
};

/** Animaciones del juego ← animaciones de 0 A.D. (reposo, paso, ataque cuerpo a cuerpo o a distancia, muerte). */
const footAnims = (attack = 'attack_melee') => ({
  idle: { from: 'idle', frames: 6, fps: 4 },
  walk: { from: 'walk', frames: 10, fps: 12 },
  attack: { from: attack, frames: 8, fps: 12 },
  die: { from: 'death', frames: 8, fps: 10, loop: false },
});
/** Soldado a pie: unidad del juego ('pueblo/tipo'), actor de 0 A.D. y variantes elegidas. */
const foot = (unit, actor, { attack, choose = [] } = {}) => ({ units: [unit], actor: `units/${actor}.xml`, choose, anims: footAnims(attack) });

/**
 * Recetas: actor de 0 A.D. para cada unidad del juego, variantes elegidas (escudo, armadura)
 * y qué animación de 0 A.D. va en cada animación del juego, con cuántos cuadros.
 * El impacto del ataque sale del propio 0 A.D. (atributo "event" de la animación).
 */
export const SOLDIERS = {
  // Romanos: guerrero sin casco (Edad Tribal), astados y príncipes (lanza y gladius con scutum),
  // legionario, triario veterano y vélites.
  'romans-warrior-3d': foot('romans/warrior', 'romans/infantry_swordsman_servus'),
  'romans-spearman-3d': foot('romans/spearman', 'romans/infantry_spearman_b'),
  'romans-swordsman-3d': foot('romans/swordsman', 'romans/infantry_swordsman_a'),
  'romans-legionary-3d': foot('romans/legionary', 'romans/infantry_swordsman_b', { choose: ['Scutum-01', 'cardiopylax-1c'] }),
  'romans-triarius-3d': foot('romans/triarius', 'romans/infantry_spearman_e'),
  // 0 A.D. no tiene arqueros romanos: el tirador es un vélite con jabalinas.
  'romans-archer-3d': foot('romans/archer', 'romans/infantry_javelinist_b', { attack: 'attack_ranged' }),
  // Galos: lanceros y espadachines con escudo hexagonal, guerreros elegidos y honderos.
  'gauls-warrior-3d': foot('gauls/warrior', 'gauls/infantry_spearman_a'),
  'gauls-spearman-3d': foot('gauls/spearman', 'gauls/infantry_spearman_b'),
  'gauls-swordsman-3d': foot('gauls/swordsman', 'gauls/infantry_swordsman_a'),
  'gauls-chosen_swordsman-3d': foot('gauls/chosen_swordsman', 'gauls/infantry_swordsman_e'),
  // 0 A.D. no tiene arqueros galos: el tirador es un hondero (el de ropa y escudo con color del jugador).
  'gauls-archer-3d': foot('gauls/archer', 'gauls/infantry_slinger_a', { attack: 'attack_ranged' }),
};

/** Altura de la figura en reposo (con casco) en la hoja, en px: da detalle para el zoom. */
const FIGURE_PX = 84;
/** Escala en el juego: la figura queda de ~34 px del mundo, como los soldados LPC (32–34 px). */
const GAME_SCALE = 0.4;
/** Cuadro de trabajo (luego pack.mjs recorta lo que sobra) y punto de los pies. */
const FS = 200, AX = 100, AY = 140;

async function file(rel) {
  const local = path.join(FILES, rel);
  if (!fs.existsSync(local)) {
    const res = await fetch(RAW + rel);
    if (!res.ok) throw new Error(`0 A.D.: descarga fallida (${res.status}) ${rel}`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  return local;
}

const readXml = async (rel) => parseXml(fs.readFileSync(await file(rel), 'utf8'));

async function variantFile(rel) {
  try {
    return kid(await readXml(`variants/${rel}`), 'variant');
  } catch {
    return null;
  }
}

/** Textura de color; 0 A.D. a veces declara .png y guarda .dds (o al revés). */
async function texture(rel) {
  if (!rel || /^(null|default)_/.test(path.basename(rel))) return null;
  for (const r of new Set([rel, rel.replace(/\.png$/, '.dds'), rel.replace(/\.dds$/, '.png')])) {
    try {
      const local = await file(`textures/skins/${r}`);
      return r.endsWith('.dds') ? readDds(local) : Img.read(local);
    } catch {
      /* la otra extensión */
    }
  }
  return null;
}

/**
 * Resuelve un actor: { mesh (texto .dae), tex, mode, props: [{ at, node }] } y junta en `anims`
 * sus animaciones por nombre (en minúsculas, como las trata 0 A.D.). En cada grupo usa la variante
 * de `choose`; si no, la más frecuente. Las animaciones de las variantes elegidas (la postura base
 * del soldado) mandan; las demás (muerte, formaciones…) solo completan las que falten.
 */
async function resolve(rel, choose, anims, depth = 0) {
  if (depth > 6) return null;
  const actor = kid(await readXml(`actors/${rel}`), 'actor');
  if (!actor) return null;
  const material = kid(actor, 'material')?.text.trim() ?? '';
  const node = { actor: rel, mode: /player/.test(material) ? 'player' : /trans|alpha/.test(material) ? 'trans' : 'opaque', mesh: null, tex: null, props: [] };
  let meshRel = null, baseTex = null;
  // Solo las del cuerpo: los accesorios (honda, estandarte) traen las suyas, que no son del soldado.
  const collect = (cur, picked) => {
    if (depth > 0) return;
    for (const a of kid(cur, 'animations')?.children ?? []) {
      const name = a.attrs.name?.toLowerCase();
      if (!name || !a.attrs.file || (anims[name] && (anims[name].picked || !picked))) continue;
      anims[name] = { file: a.attrs.file, event: Number(a.attrs.event ?? 0.5), picked };
    }
  };
  for (const group of kids(actor, 'group')) {
    const variants = kids(group, 'variant');
    const pick = variants.find((x) => choose.includes(x.attrs.name)) ?? [...variants].sort((a, b) => Number(b.attrs.frequency ?? 1) - Number(a.attrs.frequency ?? 1))[0];
    for (const v of variants) {
      if (v === pick || /formations\//.test(v.attrs.file ?? '')) continue;
      for (let cur = v, n = 0; cur && n < 6; n++) {
        collect(cur, false);
        cur = cur.attrs.file ? await variantFile(cur.attrs.file) : null;
      }
    }
    for (let cur = pick, n = 0; cur && n < 6; n++) {
      collect(cur, true);
      meshRel ??= kid(cur, 'mesh')?.text.trim() ?? null;
      for (const t of kid(cur, 'textures')?.children ?? []) if (t.attrs.name === 'baseTex') baseTex ??= t.attrs.file;
      for (const p of kid(cur, 'props')?.children ?? []) {
        const at = p.attrs.attachpoint ?? 'root';
        if (!p.attrs.actor || node.props.some((q) => q.at === at)) continue;
        const child = await resolve(p.attrs.actor, choose, anims, depth + 1);
        if (child) node.props.push({ at, node: child });
      }
      cur = cur.attrs.file ? await variantFile(cur.attrs.file) : null;
    }
  }
  if (meshRel) node.mesh = fs.readFileSync(await file(`meshes/${meshRel}`), 'utf8');
  node.tex = await texture(baseTex);
  return node;
}

/** Piezas del soldado en una pose: cuerpo con esqueleto + accesorios en sus puntos. */
function posedParts(body, skinned, world) {
  const parts = [{ tris: skinTris(skinned, world), tex: body.tex, mode: body.mode }];
  const point = (name) => world.get(`prop-${name}`) ?? world.get(name);
  const addProps = (node, at, points) => {
    for (const p of node.props) {
      const m = p.at === 'root' ? at : points ? points[p.at] && mul(at, points[p.at]) : point(p.at);
      if (!m || !p.node.mesh) continue;
      p.node.model ??= loadCollada(p.node.mesh);
      const { tris, points: own } = p.node.model;
      // Accesorio con esqueleto propio (capas, faldas): sigue a los mismos huesos que el cuerpo.
      if (/<skin\b/.test(p.node.mesh)) {
        p.node.skinned ??= loadSkinned(p.node.mesh);
        parts.push({ tris: skinTris(p.node.skinned, world), tex: p.node.tex, mode: p.node.mode });
      } else parts.push({ tris: tris.map((t) => t.map((c) => ({ ...c, p: applyM(m, c.p), n: c.n ? applyN(m, c.n) : null }))), tex: p.node.tex, mode: p.node.mode });
      addProps(p.node, m, own);
    }
  };
  addProps(body, IDENTITY, null);
  return parts;
}

const applyM = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
function applyN(m, n) {
  const v = [m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[4] * n[0] + m[5] * n[1] + m[6] * n[2], m[8] * n[0] + m[9] * n[1] + m[10] * n[2]];
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}

/** Dibuja las piezas mirando a la dirección r (0 = S, 1 = SE, … en el orden 'oga8'), pies en (AX, AY). */
function drawView(parts, r, k) {
  // El frente del modelo es −y; con el giro a = (r+1)·45° mira a S, SE, E, … (igual que los vehículos).
  const a = (((r + 1) % 8) * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
  const rot = (x, y) => [x * ca - y * sa, -(x * sa + y * ca)];
  const tp = parts.map((p) => ({
    ...p,
    tris: p.tris.map((t) => t.map((c) => {
      const [u, v] = rot(c.p[0], c.p[1]);
      return { ...c, p: [u * k, v * k, c.p[2] * k], n: c.n ? [...rot(c.n[0], c.n[1]), c.n[2]] : null };
    })),
  }));
  const out = cropRender(render(tp, { ss: 4, ambient: 0.56, diffuse: 0.6 }));
  const img = new Img(FS, FS), mask = new Img(FS, FS);
  const ox = Math.round(AX - out.ox), oy = Math.round(AY - out.oy);
  img.draw(out.img, 0, 0, out.img.w, out.img.h, ox, oy);
  mask.draw(out.mask, 0, 0, out.mask.w, out.mask.h, ox, oy);
  return [img, mask];
}

/** Hoja de un soldado: { packed, credits } (packed = imagen + datos de las animaciones). */
export async function soldierSheet(r) {
  const animsByName = {};
  const body = await resolve(r.actor, r.choose ?? [], animsByName);
  const skinned = loadSkinned(body.mesh);
  const anims = {};
  let k;
  for (const [name, a] of Object.entries(r.anims)) {
    const src = animsByName[a.from.toLowerCase()];
    if (!src) throw new Error(`${r.actor}: no tiene la animación ${a.from}`);
    const clip = loadAnimation(fs.readFileSync(await file(`animation/${src.file}`), 'utf8'));
    const loop = a.loop !== false;
    // Cuadros repartidos en toda la animación (en bucle no se repite el último = el primero).
    const times = [...Array(a.frames).keys()].map((k) => (clip.duration * k) / (loop ? a.frames : a.frames - 1));
    const poses = times.map((t) => posedParts(body, skinned, pose(skinned.nodes, clip, t)));
    // Escala (unidades del modelo → casillas): según la altura de la figura en su primera pose de reposo.
    k ??= FIGURE_PX / HEIGHT_PX / poses[0].reduce((top, p) => p.tris.reduce((t2, t) => Math.max(t2, t[0].p[2], t[1].p[2], t[2].p[2]), top), 0);
    const base = [], mask = [];
    for (let d = 0; d < 8; d++) {
      const row = poses.map((p) => drawView(p, d, k));
      base.push(row.map((x) => x[0]));
      mask.push(row.map((x) => x[1]));
    }
    anims[name] = {
      fs: FS, dirs: 8, n: a.frames, base, mask, ax: AX, ay: AY, fps: a.fps, loop,
      ...(name === 'attack' ? { hit: Math.min(a.frames - 1, Math.round(a.frames * src.event)) } : {}),
    };
  }
  const packed = packSheet(anims);
  // 256 colores bien elegidos: la hoja pesa ~4 veces menos y no se nota la diferencia.
  packed.img = quantize(packed.img);
  return packed;
}

/** Licencia de las hojas de soldados (la de 0 A.D., normalizada como el resto). */
export const soldierLicense = () => sheetLicense([normalizeLicenses(ZEROAD_CREDIT.licenses)]);

/**
 * Genera las hojas y las registra con `save(id, units, packed, extra)` (la de build.mjs).
 * Las unidades de estas hojas dejan de usar su hoja LPC de 4 direcciones; si solo se rehace
 * otra hoja (p. ej. la LPC de esa unidad), sus unidades siguen apuntando a la hoja 3D que ya hay.
 */
export async function buildSoldiers(save, only, manifest) {
  const done = [];
  for (const [id, r] of Object.entries(SOLDIERS)) {
    if (only && only !== id && only !== 'soldiers') {
      if (manifest?.sheets[id]) for (const u of r.units) manifest.units[u] = id;
      continue;
    }
    const t0 = Date.now();
    const packed = await soldierSheet(r);
    save(id, r.units, packed, { scale: GAME_SCALE, o: 'oga8', credits: [SOLDIER_CREDIT_ID], license: soldierLicense() });
    console.log(`  ${id.padEnd(28)} ${packed.img.w}×${packed.img.h}  ${soldierLicense()}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    done.push(id);
  }
  return done;
}

/** Qué trae un actor (para elegir recetas): sus animaciones y accesorios. */
export async function probe(actor) {
  const anims = {};
  const node = await resolve(actor, [], anims);
  const props = (n, d = 0) => n.props.flatMap((p) => [`${'  '.repeat(d)}@${p.at}: ${p.node.actor}`, ...props(p.node, d + 1)]);
  // Cuánto de cada pieza lleva el color del jugador (alfa < 255 en materiales "player").
  const team = (n) => {
    if (n.mode !== 'player' || !n.tex) return 0;
    let k = 0;
    for (let i = 3; i < n.tex.data.length; i += 4) if (n.tex.data[i] < 250) k++;
    return Math.round((k / (n.tex.data.length / 4)) * 1000) / 10;
  };
  const teams = (n) => [`${n.actor}: ${n.mode} ${team(n)} %`, ...n.props.flatMap((p) => teams(p.node))];
  return { anims: Object.fromEntries(Object.entries(anims).map(([k, v]) => [k, (v.picked ? '' : '(other) ') + v.file])), props: props(node), team: teams(node) };
}

const direct = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/soldiers.mjs');
// node tools/art/soldiers.mjs --probe units/gauls/infantry_slinger_b.xml  → animaciones y accesorios.
if (direct && process.argv[2] === '--probe') {
  for (const a of process.argv.slice(3)) console.log(a, JSON.stringify(await probe(a), null, 1));
} else if (direct) {
  // Uso directo: solo los soldados, sobre el units.json y credits.json que ya existen.
  const mf = path.join(OUT, 'units.json'), cf = path.join(OUT, 'credits.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const save = (id, units, packed, extra) => {
    const rel = `units/${id}.png`;
    packed.img.write(path.join(OUT, rel));
    manifest.sheets[id] = { file: rel, ...extra, ...packed.meta };
    for (const u of units) manifest.units[u] = id;
  };
  await buildSoldiers(save, process.argv[2], manifest);
  fs.writeFileSync(mf, JSON.stringify(manifest));
  const credits = JSON.parse(fs.readFileSync(cf, 'utf8'));
  credits.items[SOLDIER_CREDIT_ID] = { ...SOLDIER_CREDIT, licenses: normalizeLicenses(SOLDIER_CREDIT.licenses) };
  fs.writeFileSync(cf, JSON.stringify(credits, null, 1));
}
