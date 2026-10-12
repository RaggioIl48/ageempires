// Importa una hoja de sprites EXTERNA dibujada en cuadrícula (filas = acciones, columnas =
// direcciones; por ejemplo, una imagen hecha con IA) al formato de hojas del juego.
//
//   node tools/art/importgrid.mjs <spec.json> <imagen.jpg|png>
//
// La especificación (JSON) dice dónde está la cuadrícula, qué fila es cada acción, qué columna
// es cada dirección (y si alguna hay que espejarla), y cómo armar cada animación. El resultado
// va a client/public/art/experimental/ (no se publica: está en .gitignore) hasta confirmar la
// licencia; el juego lo usa si existe y, si no, dibuja la unidad normal (respaldo).
//
// Qué hace con cada celda:
//   1. quita el fondo (pergamino/papel claro) rellenando desde los bordes, más el fondo que
//      quedó encerrado (entre las patas, detrás del arco), y la sombra horneada (gris);
//   2. descarta restos sueltos (líneas de la cuadrícula, rótulos): se queda con las piezas grandes;
//   3. achica (promedio por bloques, sin bordes dentados) y apoya los pies en un punto fijo.
// La hoja no trae color del jugador: el juego le pone su estandarte (respaldo de siempre).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { packSheet } from './pack.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'client/public/art/experimental');
/** Orden de filas de las hojas de 8 direcciones del juego ('oga8'). */
export const OGA8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

/** Lee JPG o PNG como Img (RGBA). */
export function readImage(file) {
  if (/\.jpe?g$/i.test(file)) {
    const jpeg = require('jpeg-js');
    const j = jpeg.decode(fs.readFileSync(file), { useTArray: true });
    return new Img(j.width, j.height, new Uint8Array(j.data));
  }
  return Img.read(file);
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
/** ¿Papel/pergamino? claro y tirando a amarillo. */
const isPaper = (r, g, b) => lum(r, g, b) > 150 && r >= b + 25 && r - g < 45;
/** ¿Sombra horneada o papel sombreado? gris parduzco medio, poco saturado. */
const isShadow = (r, g, b) => {
  const L = lum(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return L > 95 && L < 175 && mx - mn < 45;
};

/** Recorta una celda (x0..x1, y0..y1) quitando fondo, sombra y restos. Devuelve una Img con transparencia. */
export function cutCell(src, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const out = src.sub(x0, y0, w, h);
  const d = out.data;
  const bg = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) if (d[k * 4 + 3] < 10) bg[k] = 1; // PNG con transparencia: ya es fondo
  // 1. Fondo: se rellena desde los bordes y desde todo papel bien claro (también el encerrado,
  //    p. ej. dentro del marco de la cuadrícula). La sombra gris solo cuenta abajo (bajo los cascos),
  //    para no comerse la armadura gris del jinete.
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  for (let k = 0; k < w * h; k++) {
    const i = k * 4;
    if (isPaper(d[i], d[i + 1], d[i + 2]) && lum(d[i], d[i + 1], d[i + 2]) > 172) stack.push(k % w, Math.floor(k / w));
  }
  const shadowFrom = h * 0.6;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || bg[y * w + x]) continue;
    const i = (y * w + x) * 4;
    if (!isPaper(d[i], d[i + 1], d[i + 2]) && !(y > shadowFrom && isShadow(d[i], d[i + 1], d[i + 2]))) continue;
    bg[y * w + x] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  // Borde con halo de papel (artefactos JPG): una pasada que quita lo claro pegado al fondo.
  const halo = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (bg[k]) continue;
      const i = k * 4;
      if (lum(d[i], d[i + 1], d[i + 2]) < 140 || d[i] < d[i + 2] + 15) continue;
      if (bg[k - 1] || bg[k + 1] || bg[k - w] || bg[k + w]) halo.push(k);
    }
  for (const k of halo) bg[k] = 1;
  // 2. Piezas: se queda con las grandes (la figura) y descarta líneas finas y restos.
  const comp = new Int32Array(w * h).fill(-1);
  const pieces = [];
  for (let s = 0; s < w * h; s++) {
    if (bg[s] || comp[s] >= 0) continue;
    const id = pieces.length, q = [s];
    comp[s] = id;
    let n = 0, a = w, b = h, c = 0, e = 0;
    while (q.length) {
      const k = q.pop(), x = k % w, y = (k - x) / w;
      n++;
      a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e = Math.max(e, y);
      for (const nk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1])
        if (nk >= 0 && !bg[nk] && comp[nk] < 0) {
          comp[nk] = id;
          q.push(nk);
        }
    }
    pieces.push({ n, bw: c - a + 1, bh: e - b + 1, edge: a === 0 || b === 0 || c === w - 1 || e === h - 1 });
  }
  const biggest = Math.max(0, ...pieces.map((p) => p.n));
  // Fuera: lo chico, las líneas finas y los marcos (pocos píxeles para lo que ocupan, tocando el borde).
  const keep = pieces.map((p) => p.n >= biggest * 0.04 && !(p.bw <= 4 && p.bh > h * 0.5) && !(p.bh <= 4 && p.bw > w * 0.5) && !(p.edge && p.n < p.bw * p.bh * 0.12));
  for (let k = 0; k < w * h; k++) if (bg[k] || !keep[comp[k]]) d[k * 4 + 3] = 0;
  return out;
}

/**
 * Color del jugador: las partes pintadas de magenta (#FF00FF, con sus luces y sombras) pasan a
 * la máscara de equipo en gris (el juego las tiñe con el color de cada jugador).
 * Devuelve la máscara y cuántos píxeles había.
 */
export function splitTeam(img) {
  const mask = new Img(img.w, img.h);
  let team = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b, a] = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    if (!a || !isMagenta(r, g, b)) continue;
    const v = Math.max(r, b);
    mask.data.set([v, v, v, a], i);
    img.data.set([v, v, v, a], i); // debajo, el mismo gris (por si la máscara no carga)
    team++;
  }
  return { mask, team };
}

/** ¿Magenta? (rojo y azul parecidos, sin verde), con cualquier luz o sombra. */
export const isMagenta = (r, g, b) => r > 70 && b > 70 && g < 0.55 * Math.min(r, b) && Math.abs(r - b) < 0.35 * Math.max(r, b);

/** Achica por un factor entero (promedio por bloques con alfa premultiplicado: bordes suaves). */
export function shrink(img, f) {
  if (f <= 1) return img;
  const w = Math.floor(img.w / f), h = Math.floor(img.h / f), out = new Img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * img.w + x * f + dx) * 4, al = img.data[i + 3];
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al;
        }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a);
        out.data[o + 3] = Math.round(a / (f * f));
      }
    }
  return out;
}

/**
 * Arma la hoja según la especificación. Devuelve { packed, report } (report = avisos de calidad).
 * spec = {
 *   id, units: ["pueblo/tipo"], grid: { x0, x1, cols, rows: [y0, y1, …] },
 *   rows: ["idle", "walk", …] (nombre de cada fila), cols: ["N", "NE", …] (rótulo de cada columna),
 *   dirs: { S: "S" | { col: "NE", mirror: true }, … } (de dónde sale cada una de las 8 direcciones),
 *   anims: { idle: { frames: ["idle"], fps }, walk: { frames: ["walk", "gallop"], fps, bob: [0, -1] }, … },
 *   shrink: 2, scale: 0.85, frame: 96
 * }
 * Disposición recomendada (docs/SPRITES_EXTERNOS.md): en vez de `frames`, cada animación da su bloque
 * `block: { x0, y0, cell, frames }` con filas = direcciones en orden OGA8 y columnas = cuadros; en
 * `dirs`, "col" es entonces la dirección de la que sale (p. ej. { col: "NE", mirror: true }).
 * En ese caso `grid`, `rows` y `cols` no hacen falta.
 */
export function buildSheet(src, spec) {
  const { grid } = spec;
  const cw = grid ? (grid.x1 - grid.x0) / grid.cols : 0;
  const cells = new Map();
  const cellImg = (row, col) => {
    const key = `${row}|${col}`;
    if (!cells.has(key)) {
      const r = spec.rows.indexOf(row), c = spec.cols.indexOf(col);
      if (r < 0 || c < 0) throw new Error(`no existe la celda ${row}/${col}`);
      const x0 = Math.round(grid.x0 + c * cw) + 3, x1 = Math.round(grid.x0 + (c + 1) * cw) - 3;
      cells.set(key, shrink(cutCell(src, x0, grid.rows[r] + 3, x1, grid.rows[r + 1] - 3), spec.shrink ?? 1));
    }
    return cells.get(key);
  };
  // Disposición recomendada: un bloque por animación, filas = direcciones (orden OGA8), columnas = cuadros.
  const blockCell = (b, dir, k) => {
    const d = OGA8.indexOf(dir);
    if (d < 0) throw new Error(`dirección desconocida: ${dir}`);
    const key = `block|${b.x0}|${b.y0}|${d}|${k}`;
    if (!cells.has(key)) {
      const x0 = b.x0 + k * b.cell, y0 = b.y0 + d * b.cell;
      cells.set(key, shrink(cutCell(src, x0 + 2, y0 + 2, x0 + b.cell - 2, y0 + b.cell - 2), spec.shrink ?? 1));
    }
    return cells.get(key);
  };
  const FS = spec.frame ?? 96, AX = FS / 2, AY = Math.round(FS * 0.86);
  const report = [];
  const anims = {};
  let teamPixels = 0;
  for (const [name, a] of Object.entries(spec.anims)) {
    const base = [], mask = [];
    for (const dir of OGA8) {
      const from = typeof spec.dirs[dir] === 'string' ? { col: spec.dirs[dir] } : spec.dirs[dir];
      const rowB = [], rowM = [];
      const count = a.block ? a.block.frames : a.frames.length;
      for (let k = 0; k < count; k++) {
        let c = a.block ? blockCell(a.block, from.col, k) : cellImg(a.frames[k], from.col);
        if (from.mirror) c = c.flipX();
        const bb = c.bbox();
        const fr = new Img(FS, FS);
        if (bb) {
          // Pies (abajo de la figura) en el punto de apoyo; centrado a lo ancho.
          const dx = Math.round(AX - (bb.x + bb.w / 2)), dy = Math.round(AY - (bb.y + bb.h)) + (a.bob?.[k] ?? 0);
          fr.draw(c, 0, 0, c.w, c.h, dx, dy);
          if (bb.w > FS || bb.h > FS) report.push(`${name}/${dir}: the figure (${bb.w}×${bb.h}) does not fit in ${FS}×${FS}`);
        } else report.push(`${name}/${dir}: empty cell`);
        const { mask: m, team } = splitTeam(fr);
        if (team) teamPixels += team;
        rowB.push(fr);
        rowM.push(m);
      }
      base.push(rowB);
      mask.push(rowM);
    }
    anims[name] = { fs: FS, dirs: 8, n: a.block ? a.block.frames : a.frames.length, base, mask, ax: AX, ay: AY, fps: a.fps ?? 8, loop: a.loop !== false, ...(a.hit !== undefined ? { hit: a.hit } : {}) };
  }
  if (!teamPixels) report.push('no magenta (#FF00FF) areas: the unit will not show the player colour (the game adds a small banner instead)');
  return { packed: packSheet(anims), report };
}

/** Escribe la hoja y la agrega (o reemplaza) en el manifiesto experimental. */
export function saveExperimental(spec, packed) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = `experimental/${spec.id}.png`;
  packed.img.write(path.join(OUT, `${spec.id}.png`));
  const mf = path.join(OUT, 'units.json');
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : { v: 1, sheets: {}, units: {} };
  manifest.sheets[spec.id] = { file, scale: spec.scale ?? 1, o: 'oga8', credits: [], license: spec.license ?? 'unconfirmed', ...packed.meta };
  for (const u of spec.units) manifest.units[u] = spec.id;
  fs.writeFileSync(mf, JSON.stringify(manifest));
  return { file: path.join(OUT, `${spec.id}.png`), bytes: fs.statSync(path.join(OUT, `${spec.id}.png`)).size };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/importgrid.mjs')) {
  const [specFile, imageFile] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const src = readImage(imageFile);
  const { packed, report } = buildSheet(src, spec);
  const out = saveExperimental(spec, packed);
  console.log(`${spec.id}: ${packed.img.w}×${packed.img.h}, ${(out.bytes / 1024).toFixed(0)} KB → ${out.file}`);
  for (const r of report) console.log('  ⚠', r);
}
