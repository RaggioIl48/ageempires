// Unidades de la Era Industrial y Moderna a partir de los "PixVoxel Isometric Wargame Sprites"
// de Tommy Ettinger (CC0, https://opengameart.org/content/pixvoxel-very-diverse-isometric-wargame-sprites).
//
// Se usa la versión "Blank": cada píxel guarda un índice de paleta (0 = transparente). Con las
// paletas del paquete se pinta la unidad, y los índices de "pintura" (los que cambian entre las
// paletas de distintos colores) van a la máscara de equipo: así cada tanque, avión o soldado
// lleva el color del jugador. Las 4 direcciones isométricas se reparten en las 8 del juego.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { Img } from './img.mjs';

export const PIXVOXEL_CREDIT = {
  pack: 'pixvoxel',
  title: 'PixVoxel Very Diverse Isometric Wargame Sprites',
  authors: ['Tommy Ettinger'],
  licenses: ['CC0'],
  urls: ['https://opengameart.org/content/pixvoxel-very-diverse-isometric-wargame-sprites'],
  notes: 'Industrial and Modern Age units (riflemen, machine guns, anti-tank, mechanized infantry, armored cars, tanks, artillery, airplanes), repainted with each player\'s color.',
};

const ARCHIVE_URL = 'https://opengameart.org/sites/default/files/Blank_PixVoxel_Wargame_Iso_A.7z';
const ROOT = 'Blank_PixVoxel_Wargame_Iso_A';

/**
 * Unidades del juego → unidad PixVoxel, animación de ataque, escala y "altura" que se quiere
 * (px en pantalla) para que queden del tamaño de las demás.
 */
export const PIXVOXEL_UNITS = [
  { id: 'any-rifleman', unit: '*/rifleman', src: 'Infantry_T', attack: 'attack_1', height: 34 },
  { id: 'any-machine_gun', unit: '*/machine_gun', src: 'Infantry', attack: 'attack_0', height: 34 },
  { id: 'any-light_vehicle', unit: '*/light_vehicle', src: 'Recon', attack: 'attack_0', height: 44 },
  { id: 'any-antitank', unit: '*/antitank', src: 'Infantry_P', attack: 'attack_1', height: 34 },
  { id: 'any-mech_infantry', unit: '*/mech_infantry', src: 'Infantry_PS', attack: 'attack_0', height: 36 },
  { id: 'any-tank', unit: '*/tank', src: 'Tank_P', attack: 'attack_0', height: 50 },
  { id: 'any-heavy_artillery', unit: '*/heavy_artillery', src: 'Artillery', attack: 'attack_1', height: 46 },
  { id: 'any-airplane', unit: '*/airplane', src: 'Plane', attack: 'attack_0', height: 46 },
];

/** Descarga (65 MB) y extrae solo lo necesario, la primera vez. Usa el tar de Windows (lee .7z). */
async function ensureFiles(cache) {
  const dir = path.join(cache, 'pixvoxel');
  const base = path.join(dir, ROOT);
  const need = PIXVOXEL_UNITS.map((u) => path.join(base, 'standing_frames', u.src));
  if (need.every((p) => fs.existsSync(p)) && fs.existsSync(path.join(base, 'palettes'))) return base;
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, 'blank.7z');
  if (!fs.existsSync(archive)) {
    const res = await fetch(ARCHIVE_URL);
    if (!res.ok) throw new Error(`PixVoxel: descarga fallida (${res.status})`);
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  }
  const pats = [`${ROOT}/palettes/*`, `${ROOT}/LICENSE.txt`];
  for (const u of PIXVOXEL_UNITS) pats.push(`${ROOT}/standing_frames/${u.src}/${u.src}_Large_*`, `${ROOT}/animation_frames/${u.src}/${u.src}_Large_*`);
  const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'bsdtar';
  execFileSync(tar, ['-xf', archive, ...pats], { cwd: dir, stdio: 'inherit' });
  return base;
}

/** Lee un PNG indexado (8 bits) y devuelve los índices; tolera datos de más al final. */
export function readIndexed(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (type !== 3 || depth !== 8) throw new Error(`${file}: se esperaba un PNG indexado de 8 bits`);
  const raw = zlib.inflateSync(Buffer.concat(idat), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  const out = new Uint8Array(w * h);
  const stride = w;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    out.set(cur, y * w);
    prev = cur;
  }
  return { w, h, idx: out };
}

/** Paleta (tira de 256 colores). */
function readPalette(file) {
  const img = Img.read(file);
  return img.data;
}

/** Índices de "pintura": los que cambian entre las paletas de distinto color (0 a 7). */
function paintIndices(base) {
  const pals = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => readPalette(path.join(base, 'palettes', `color${k}.png`)));
  const paint = new Set();
  for (let i = 1; i < 256; i++)
    for (const q of pals.slice(1)) if (q[i * 4] !== pals[0][i * 4] || q[i * 4 + 1] !== pals[0][i * 4 + 1] || q[i * 4 + 2] !== pals[0][i * 4 + 2]) paint.add(i);
  return paint;
}

/** Filas del juego (S, SE, E, NE, N, NW, W, SW) → cara de PixVoxel (0 SE, 1 SW, 2 NW, 3 NE). */
const FACE_OF_ROW = [0, 0, 3, 3, 2, 2, 1, 1];

export async function buildPixVoxel(cache) {
  const base = await ensureFiles(cache);
  const pal = readPalette(path.join(base, 'palettes', 'color1.png')); // "blanco": la pintura queda gris y se tiñe
  const paint = paintIndices(base);
  const out = [];
  for (const def of PIXVOXEL_UNITS) {
    const dir = (kind) => path.join(base, kind, def.src);
    const load = (kind, name) => readIndexed(path.join(dir(kind), name));
    // Cuadro indexado → imagen pintada y máscara de equipo, centrado en un lienzo común.
    const toImgs = (fr, W, H) => {
      const img = new Img(W, H), mask = new Img(W, H);
      const ox = Math.floor((W - fr.w) / 2), oy = Math.floor((H - fr.h) / 2);
      for (let y = 0; y < fr.h; y++)
        for (let x = 0; x < fr.w; x++) {
          const k = fr.idx[y * fr.w + x];
          if (!k) continue;
          const j = ((y + oy) * W + x + ox) * 4;
          img.data[j] = pal[k * 4];
          img.data[j + 1] = pal[k * 4 + 1];
          img.data[j + 2] = pal[k * 4 + 2];
          img.data[j + 3] = 255;
          if (paint.has(k)) {
            const g = Math.round(0.3 * pal[k * 4] + 0.59 * pal[k * 4 + 1] + 0.11 * pal[k * 4 + 2]);
            mask.data[j] = mask.data[j + 1] = mask.data[j + 2] = g;
            mask.data[j + 3] = 255;
          }
        }
      return [img, mask];
    };
    // `step`: se toma un cuadro de cada tantos (la hoja pesa la mitad y se ve igual de fluida en el juego).
    const anim = (kind, suffix, n, fps, loop = true, step = 1) => {
      const frames = [];
      for (let r = 0; r < 8; r++) {
        const row = [];
        for (let i = 0; i < n; i += step) row.push(load(kind, `${def.src}_Large_face${FACE_OF_ROW[r]}${suffix}_${i}.png`));
        frames.push(row);
      }
      return { frames, fps, loop };
    };
    const count = (kind, suffix) => fs.readdirSync(dir(kind)).filter((f) => f.startsWith(`${def.src}_Large_face0${suffix}_`)).length;
    const raw = {
      idle: anim('standing_frames', '', 1, 1),
      walk: anim('standing_frames', '', count('standing_frames', ''), 8),
      attack: anim('animation_frames', `_${def.attack}`, count('animation_frames', `_${def.attack}`), 8, true, 2),
      die: anim('animation_frames', '_death', count('animation_frames', '_death'), 5, false, 2),
    };
    // Lienzo común (el más grande) para que todo quede alineado, y el punto de apoyo: el centro
    // de la figura quieta, a la altura de su base.
    const W = Math.max(...Object.values(raw).map((a) => a.frames[0][0].w));
    const H = Math.max(...Object.values(raw).map((a) => a.frames[0][0].h));
    const anims = {};
    for (const [name, a] of Object.entries(raw)) {
      const base2 = [], mask = [];
      for (const row of a.frames) {
        const pair = row.map((fr) => toImgs(fr, W, H));
        base2.push(pair.map((p) => p[0]));
        mask.push(pair.map((p) => p[1]));
      }
      anims[name] = { fs: W, dirs: 8, n: a.frames[0].length, base: base2, mask, fps: a.fps, loop: a.loop };
    }
    const bb = anims.idle.base[0][0].bbox();
    const ax = Math.round(bb.x + bb.w / 2), ay = Math.round(bb.y + bb.h * 0.86);
    // Disparos y explosiones: solo cerca de la unidad (el juego dibuja sus propios proyectiles).
    const M = 36;
    const keep = (x, y) => x >= bb.x - M && x < bb.x + bb.w + M && y >= bb.y - M && y < bb.y + bb.h + M / 2;
    for (const name of ['attack', 'die'])
      for (const rows of [anims[name].base, anims[name].mask])
        for (const row of rows)
          for (const img of row)
            for (let y = 0; y < img.h; y++)
              for (let x = 0; x < img.w; x++) if (!keep(x, y)) img.data[(y * img.w + x) * 4 + 3] = 0;
    for (const a of Object.values(anims)) Object.assign(a, { ax, ay });
    out.push({ ...def, anims, scale: Math.round((def.height / bb.h) * 100) / 100 });
  }
  return out;
}
