// Reduce una imagen RGBA a 256 colores (corte por la mediana) para que img.mjs la guarde como
// PNG con paleta: los soldados renderizados en 3D tienen miles de tonos, pero pocos materiales
// (piel, bronce, tela, madera), y con 256 colores bien elegidos no se nota la diferencia.
// Sin tramado (dithering): a este tamaño no hace falta y comprime mucho mejor.

import { Img } from './img.mjs';

/** Niveles de alfa que se conservan en los bordes suaves. */
const ALPHA_STEP = 32;

/** Copia de `img` con, como mucho, `max` colores (el transparente aparte). */
export function quantize(img, max = 255) {
  const d = img.data;
  // Colores únicos (con el alfa en pocos niveles) y cuántas veces aparece cada uno.
  const counts = new Map();
  const keyOf = (i) => {
    const a = d[i + 3] >= 248 ? 255 : Math.round(d[i + 3] / ALPHA_STEP) * ALPHA_STEP;
    return a === 0 ? -1 : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | Math.min(255, a)) >>> 0;
  };
  for (let i = 0; i < d.length; i += 4) {
    const k = keyOf(i);
    if (k >= 0) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const all = [...counts].map(([k, n]) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, n]);
  // Cajas: se parte siempre la de mayor "error" (rango × píxeles) por la mediana de su eje más largo.
  const boxes = [all];
  const spread = (b) => {
    let best = 0, axis = 0;
    for (let c = 0; c < 4; c++) {
      let lo = 255, hi = 0;
      for (const p of b) {
        if (p[c] < lo) lo = p[c];
        if (p[c] > hi) hi = p[c];
      }
      const r = (hi - lo) * (c === 3 ? 0.75 : 1);
      if (r > best) [best, axis] = [r, c];
    }
    return { best, axis };
  };
  const weight = (b) => b.reduce((s, p) => s + p[4], 0);
  while (boxes.length < max) {
    let pick = -1, score = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const s = spread(boxes[i]).best * Math.sqrt(weight(boxes[i]));
      if (s > score) [score, pick] = [s, i];
    }
    if (pick < 0) break;
    const b = boxes[pick];
    const { axis } = spread(b);
    b.sort((p, q) => p[axis] - q[axis]);
    // Mediana por cantidad de píxeles (no por cantidad de colores).
    const half = weight(b) / 2;
    let acc = 0, cut = 1;
    for (; cut < b.length - 1; cut++) {
      acc += b[cut - 1][4];
      if (acc >= half) break;
    }
    boxes.splice(pick, 1, b.slice(0, cut), b.slice(cut));
  }
  const palette = boxes.map((b) => {
    const w = weight(b);
    return [0, 1, 2, 3].map((c) => Math.round(b.reduce((s, p) => s + p[c] * p[4], 0) / w));
  });
  // Cada color único va al más cercano de la paleta.
  const map = new Map();
  for (const [r, g, b, a] of all) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const p = palette[k];
      const dist = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2 + 2 * (p[3] - a) ** 2;
      if (dist < bd) [bd, best] = [dist, k];
    }
    map.set(((r << 24) | (g << 16) | (b << 8) | a) >>> 0, palette[best]);
  }
  const out = new Img(img.w, img.h);
  for (let i = 0; i < d.length; i += 4) {
    const k = keyOf(i);
    if (k >= 0) out.data.set(map.get(k), i);
  }
  return out;
}
