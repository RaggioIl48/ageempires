// Recorta el espacio vacío de cada cuadro de las hojas de unidades (atlas recortado).
//
// Cada animación guardaba sus cuadros en celdas del mismo tamaño (el del cuadro más grande): un
// caballo que muere ocupa 300 × 247 px aunque casi todo sea transparente. Medido: lo dibujado es
// solo el 22 % de la hoja. Con 40–70 tipos de unidad en pantalla (una batalla de 8 jugadores) las
// hojas no entran en la memoria de video y el navegador se congela 3–4 s seguidos. Acá cada cuadro
// se recorta a su contorno y se acomoda en estantes; el manifiesto anota, por cuadro, dónde quedó y
// dónde va dentro de su celda: `r` = 6 números por cuadro (x, y, w, h, dx, dy), igual que la
// máscara de equipo `m`. Los píxeles se copian tal cual; después se rehace la copia liviana.
//
// Uso:  node tools/art/trim.mjs            (todas las hojas sin recortar que ahorran al menos 25 %)
//       node tools/art/trim.mjs <id>       (una sola)
// Correr después de soldiers.mjs / repack.mjs (también rehace la copia liviana, ver lo.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { loName, makeLo, MIN_PX } from './lo.mjs';
import { MAX_W, shelfPack } from './repack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'client/public/art');
/** Separación entre piezas (px de la hoja completa): 1 px en la copia liviana, para que no se mezclen al filtrar. */
const GAP = 2;

/** Contorno de lo no transparente dentro de un rectángulo, relativo a él (o null si está vacío). */
export function tightBox(img, x0, y0, w, h) {
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) {
    const row = ((y0 + y) * img.w + x0) * 4 + 3;
    for (let x = 0; x < w; x++)
      if (img.data[row + x * 4]) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
  }
  return maxx < 0 ? null : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}

/** Copia exacta de píxeles (sin mezclar). */
function blit(dst, src, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) {
    const s = ((sy + y) * src.w + sx) * 4, d = ((dy + y) * dst.w + dx) * 4;
    dst.data.set(src.data.subarray(s, s + w * 4), d);
  }
}

/** Posiciones pares: al dividir por 2 (copia liviana) las piezas caen justo en un píxel. */
const even = (n) => n + (n & 1);

/** Recorta una hoja (imagen + datos del manifiesto). Devuelve los datos nuevos. */
export function trimSheet(img, sheet) {
  const pieces = [];
  for (const [name, a] of Object.entries(sheet.anims))
    for (let d = 0; d < a.d; d++)
      for (let f = 0; f < a.n; f++) {
        const cx = (a.x ?? 0) + f * a.w, cy = a.y + d * a.h;
        const box = tightBox(img, cx, cy, a.w, a.h);
        if (box) pieces.push({ name, k: (d * a.n + f) * 6, sx: cx + box.x, sy: cy + box.y, w: box.w, h: box.h, dx: box.x, dy: box.y });
        else pieces.push({ name, k: (d * a.n + f) * 6, w: 0, h: 0 });
      }
  const masks = [];
  for (const [name, a] of Object.entries(sheet.anims))
    for (let k = 0; k + 5 < a.m.length; k += 6) if (a.m[k + 2] && a.m[k + 3]) masks.push({ name, k, w: a.m[k + 2], h: a.m[k + 3] });
  const real = pieces.filter((p) => p.w);
  const area = [...real, ...masks].reduce((s, p) => s + (p.w + GAP) * (p.h + GAP), 0);
  const widest = Math.max(...real.map((p) => p.w), ...masks.map((p) => p.w), 1);
  const width = even(Math.max(widest + GAP, Math.min(MAX_W, Math.ceil(Math.sqrt(area * 1.15)))));
  // Piezas de tamaño par (con su separación) para que todas empiecen en posiciones pares.
  const size = (p) => ({ w: even(p.w) + GAP, h: even(p.h) + GAP });
  const framePack = shelfPack(real.map(size), width);
  const maskY = even(framePack.height);
  const maskPack = shelfPack(masks.map(size), width);
  const out = new Img(width, maskY + maskPack.height);
  const anims = {};
  for (const [name, a] of Object.entries(sheet.anims)) {
    const { x: _x, y: _y, ...rest } = a;
    anims[name] = { ...rest, r: new Array(a.d * a.n * 6).fill(0), m: [...a.m] };
  }
  real.forEach((p, i) => {
    const { x, y } = framePack.pos[i];
    blit(out, img, p.sx, p.sy, p.w, p.h, x, y);
    anims[p.name].r.splice(p.k, 6, x, y, p.w, p.h, p.dx, p.dy);
  });
  masks.forEach((p, i) => {
    const { x, y } = maskPack.pos[i];
    const m = sheet.anims[p.name].m;
    blit(out, img, m[p.k], m[p.k + 1], p.w, p.h, x, maskY + y);
    const nm = anims[p.name].m;
    nm[p.k] = x;
    nm[p.k + 1] = maskY + y;
  });
  return { img: out, meta: { ...sheet, anims, maskY } };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/trim.mjs')) {
  const only = process.argv[2];
  const mf = path.join(OUT, 'units.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  let before = 0, after = 0, n = 0;
  for (const [id, sheet] of Object.entries(manifest.sheets)) {
    if (only && id !== only) continue;
    if (Object.values(sheet.anims).some((a) => a.r)) continue; // ya recortada
    const file = path.join(OUT, sheet.file);
    const img = Img.read(file);
    const r = trimSheet(img, sheet);
    if (!only && r.img.w * r.img.h > img.w * img.h * 0.75) continue; // no vale la pena
    r.img.write(file);
    if (r.img.w * r.img.h >= MIN_PX) {
      r.meta.lo = loName(sheet.file);
      makeLo(r.img).write(path.join(OUT, r.meta.lo));
    } else {
      if (r.meta.lo) fs.rmSync(path.join(OUT, r.meta.lo), { force: true });
      delete r.meta.lo;
    }
    manifest.sheets[id] = r.meta;
    before += img.w * img.h;
    after += r.img.w * r.img.h;
    n++;
    console.log(`${id}: ${img.w}×${img.h} → ${r.img.w}×${r.img.h}`);
  }
  fs.writeFileSync(mf, JSON.stringify(manifest));
  console.log(`${n} hojas recortadas · píxeles: ${(before / 1e6).toFixed(0)} M → ${(after / 1e6).toFixed(0)} M`);
}
