// Zancada de cada animación de marcha (caminar / trotar / galopar): cuántas casillas avanza el
// cuerpo en un ciclo completo, medido en los propios cuadros. Con eso el juego reproduce la
// animación a la velocidad justa para que los pies o los cascos no "patinen" sobre el pasto
// (medido antes: el trote se veía 2,4 veces más lento de lo que avanzaba el caballo).
//
// Cómo se mide: en las vistas de costado y en diagonal, los cascos (o pies) apoyados se quedan
// quietos sobre el suelo mientras el cuerpo avanza, así que dentro del cuadro se corren hacia atrás.
// Ese corrimiento por cuadro (mediana de muchos), pasado a casillas, por los cuadros del ciclo,
// es la zancada. Se guarda como `st` (casillas por ciclo) en cada animación.
//
// Uso:  node tools/art/stride.mjs         (todas las hojas de 8 direcciones con atlas recortado)
//       node tools/art/stride.mjs <id>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'client/public/art');
const TILE_W = 64;
/** Un ciclo de galope cubre ~2,9 veces lo que uno de trote (mediana de los jinetes medidos: 2,2–3,5). */
export const GALLOP_PER_TROT = 2.9;

/**
 * Filas de una hoja oga8 que se ven de costado o en diagonal, con cuántos px de pantalla en x
 * avanza el cuerpo por casilla en esa dirección y hacia qué lado (+1 = derecha).
 * Este: mundo (1,-1)/√2 → 45,25 px; diagonales: mundo (3,1)/√10 → 20,24 px.
 */
const E = TILE_W / Math.SQRT2, D = (2 / Math.sqrt(10)) * (TILE_W / 2);
const ROWS = [
  { row: 2, xPerTile: E, sign: 1 }, // E
  { row: 6, xPerTile: E, sign: -1 }, // O
  { row: 1, xPerTile: D, sign: 1 }, // SE
  { row: 3, xPerTile: D, sign: 1 }, // NE
  { row: 5, xPerTile: D, sign: -1 }, // NO
  { row: 7, xPerTile: D, sign: -1 }, // SO
];

/** Píxeles opacos de un cuadro, en coordenadas de su celda. */
function framePixels(img, a, d, f) {
  const k = (d * a.n + f) * 6;
  const [x, y, w, h, dx, dy] = a.r.slice(k, k + 6);
  const pts = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (img.data[((y + yy) * img.w + x + xx) * 4 + 3] > 128) pts.push([dx + xx, dy + yy]);
  return pts;
}

/** Centros (en x) de los grupos de píxeles que tocan el suelo en un cuadro. */
function contacts(pts, ground) {
  const xs = [...new Set(pts.filter((p) => p[1] >= ground - 3).map((p) => p[0]))].sort((a, b) => a - b);
  const out = [];
  let cur = [];
  for (const x of xs) {
    if (cur.length && x - cur[cur.length - 1] > 3) {
      out.push((cur[0] + cur[cur.length - 1]) / 2);
      cur = [];
    }
    cur.push(x);
  }
  if (cur.length) out.push((cur[0] + cur[cur.length - 1]) / 2);
  return out;
}

/** Zancada (casillas por ciclo) de una animación, o null si no hay suficientes apoyos para medir. */
export function measureStride(img, sheet, a) {
  if (!a?.r || a.d !== 8) return null;
  const perFrame = []; // casillas por cuadro, de todas las filas medidas
  for (const { row, xPerTile, sign } of ROWS) {
    const frames = Array.from({ length: a.n }, (_, f) => framePixels(img, a, row, f));
    const ground = Math.max(...frames.flatMap((p) => p.map((q) => q[1])));
    const cs = frames.map((p) => contacts(p, ground));
    for (let f = 0; f < a.n; f++) {
      const A = cs[f], B = cs[(f + 1) % a.n];
      for (const xa of A) {
        let best = null;
        for (const xb of B) if (best === null || Math.abs(xb - xa) < Math.abs(best - xa)) best = xb;
        if (best === null) continue;
        const back = (xa - best) * sign; // apoyado: se corre hacia atrás de la marcha
        if (back > 0.5 && back < 14) perFrame.push((back * sheet.scale) / xPerTile);
      }
    }
  }
  if (perFrame.length < 6) return null;
  perFrame.sort((p, q) => p - q);
  return Math.round(perFrame[Math.floor(perFrame.length / 2)] * a.n * 1000) / 1000;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/stride.mjs')) {
  const only = process.argv[2];
  const mf = path.join(OUT, 'units.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  let n = 0;
  for (const [id, sheet] of Object.entries(manifest.sheets)) {
    if (only && id !== only) continue;
    if (!sheet.anims.walk?.r) continue;
    const img = Img.read(path.join(OUT, sheet.file));
    const res = [];
    for (const name of ['walk', 'run']) {
      const a = sheet.anims[name];
      if (!a) continue;
      const raw = measureStride(img, sheet, a);
      // Rangos creíbles (un paso humano o de caballo); fuera de eso la medición falló (ruedas, armas
      // que tocan el suelo…) y se usa el ritmo de siempre.
      const [lo, hi] = name === 'run' ? [1.1, 2.5] : [0.4, 1.05];
      const st = raw && raw >= lo && raw <= hi ? raw : null;
      if (st) a.st = st;
      else delete a.st;
      res.push(`${name} ${st ?? '—'}`);
    }
    // Si uno de los dos pasos no se pudo medir (pocos apoyos), se estima desde el otro.
    const w = sheet.anims.walk, r = sheet.anims.run;
    if (r && !r.st && w?.st) {
      r.st = Math.round(w.st * GALLOP_PER_TROT * 1000) / 1000;
      res.push(`(run estimated ${r.st})`);
    }
    if (r?.st && w && !w.st) {
      w.st = Math.round((r.st / GALLOP_PER_TROT) * 1000) / 1000;
      res.push(`(walk estimated ${w.st})`);
    }
    n++;
    console.log(`${id}: ${res.join(' · ')}`);
  }
  fs.writeFileSync(mf, JSON.stringify(manifest));
  console.log(`${n} sheets measured`);
}

