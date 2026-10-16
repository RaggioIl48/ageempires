// Reacomoda hojas de sprites demasiado altas para la GPU.
//
// Las hojas apilan sus animaciones una debajo de otra; las de caballería 3D llegaban a ~9000 px de
// alto. Muchas GPU no aceptan texturas de más de 8192 (o 4096) px por lado: el navegador entonces
// dibuja esa imagen por software en cada cuadro y el juego se arrastra (medido: 450 ms por cuadro con
// 100 unidades en una pantalla al 200 %). Acá cada bloque de animación (filas = direcciones,
// columnas = cuadros) se coloca en estantes de hasta MAX_W de ancho, y las piezas de la máscara de
// equipo debajo. El manifiesto anota la columna de cada animación (`x`). Los píxeles se copian tal cual.
//
// Uso:  node tools/art/repack.mjs            (las hojas que pasan de MAX_H de alto o MAX_W de ancho)
//       node tools/art/repack.mjs <id>       (una sola)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'client/public/art');
export const MAX_W = 5120;
export const MAX_H = 4096;

/** Ancho de la hoja: casi cuadrada (raíz del área, con un margen), sin pasar de MAX_W ni quedar más angosta que el bloque más ancho. */
export function sheetWidth(rects) {
  const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
  const widest = Math.max(...rects.map((r) => r.w));
  return Math.max(widest, Math.min(MAX_W, Math.ceil(Math.sqrt(area * 1.25))));
}

/** Coloca rectángulos {w, h} en estantes de ancho `maxW` (de más alto a más bajo). Devuelve {x, y} de cada uno y el alto total. */
export function shelfPack(rects, maxW, gap = 0) {
  const order = rects.map((r, i) => i).sort((a, b) => rects[b].h - rects[a].h);
  const pos = new Array(rects.length);
  let x = 0, y = 0, shelf = 0;
  for (const i of order) {
    const r = rects[i];
    if (x > 0 && x + r.w > maxW) {
      x = 0;
      y += shelf + gap;
      shelf = 0;
    }
    pos[i] = { x, y };
    x += r.w + gap;
    shelf = Math.max(shelf, r.h);
  }
  return { pos, height: y + shelf };
}

/** Reacomoda una hoja ya publicada (imagen + datos del manifiesto). Devuelve los datos nuevos. */
export function repackSheet(img, sheet) {
  const names = Object.keys(sheet.anims);
  const blocks = names.map((n) => {
    const a = sheet.anims[n];
    return { name: n, a, w: a.w * a.n, h: a.h * a.d };
  });
  const width = sheetWidth(blocks);
  const packed = shelfPack(blocks, width);
  // Piezas de la máscara (6 números por cuadro: x, y, w, h, dx, dy).
  const pieces = [];
  for (const b of blocks)
    for (let k = 0; k + 5 < b.a.m.length; k += 6) if (b.a.m[k + 2] && b.a.m[k + 3]) pieces.push({ b, k, w: b.a.m[k + 2], h: b.a.m[k + 3] });
  const maskPack = shelfPack(pieces, width, 1);
  const maskY = packed.height;
  const out = new Img(width, maskY + maskPack.height + (pieces.length ? 1 : 0));
  const anims = {};
  blocks.forEach((b, i) => {
    const { x, y } = packed.pos[i];
    out.draw(img, b.a.x ?? 0, b.a.y, b.w, b.h, x, y);
    anims[b.name] = { ...b.a, x, y, m: [...b.a.m] };
  });
  pieces.forEach((p, i) => {
    const { x, y } = maskPack.pos[i];
    const m = p.b.a.m;
    out.draw(img, m[p.k], m[p.k + 1], p.w, p.h, x, maskY + y);
    const nm = anims[p.b.name].m;
    nm[p.k] = x;
    nm[p.k + 1] = maskY + y;
  });
  return { img: out, meta: { ...sheet, anims, maskY } };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/repack.mjs')) {
  const only = process.argv[2];
  const mf = path.join(OUT, 'units.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  for (const [id, sheet] of Object.entries(manifest.sheets)) {
    if (only && id !== only) continue;
    const file = path.join(OUT, sheet.file);
    if (Object.values(sheet.anims).some((a) => a.r)) continue; // atlas recortado (trim.mjs): ya entra
    const img = Img.read(file);
    if (!only && img.w <= MAX_W && img.h <= MAX_H) continue;
    const r = repackSheet(img, sheet);
    r.img.write(file);
    manifest.sheets[id] = r.meta;
    console.log(`${id}: ${img.w}×${img.h} → ${r.img.w}×${r.img.h}`);
  }
  fs.writeFileSync(mf, JSON.stringify(manifest));
}
