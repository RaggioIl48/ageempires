// Empaqueta las animaciones de una unidad en una sola imagen:
//   arriba, un bloque por animación (filas = direcciones, columnas = cuadros),
//   recortado al espacio que de verdad se usa;
//   abajo, los recortes de la máscara de equipo (para teñirlos con el color del jugador).

import { Img } from './img.mjs';

/**
 * anims: { nombre: { fs, dirs, n, base[d][i], mask[d][i], fps, loop, ax, ay } }
 * (ax, ay) = punto del cuadro (de fs×fs) que va sobre la posición de la unidad (los pies).
 * Devuelve { img, meta } con meta.anims[nombre] = { y, w, h, n, d, ax, ay, fps, loop, m }.
 */
export function packSheet(anims) {
  const blocks = [];
  for (const [name, a] of Object.entries(anims)) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const row of a.base)
      for (const f of row) {
        const b = f.bbox();
        if (!b) continue;
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w - 1);
        y1 = Math.max(y1, b.y + b.h - 1);
      }
    if (x1 < 0) throw new Error(`animación vacía: ${name}`);
    blocks.push({ name, a, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  const width = Math.max(...blocks.map((b) => b.w * b.a.n));
  let y = 0;
  for (const b of blocks) {
    b.y = y;
    y += b.h * b.a.dirs;
  }
  const baseH = y;

  // Recortes de máscara, en estantes de izquierda a derecha.
  const pieces = [];
  for (const b of blocks)
    for (let d = 0; d < b.a.dirs; d++)
      for (let i = 0; i < b.a.n; i++) {
        const m = b.a.mask[d][i];
        const bb = m.bbox(b.x0, b.y0, b.w, b.h);
        pieces.push({ b, d, i, bb });
      }
  const W = Math.max(width, 64);
  let sx = 0, sy = baseH, shelf = 0;
  for (const p of pieces) {
    if (!p.bb) continue;
    if (sx + p.bb.w > W) {
      sx = 0;
      sy += shelf + 1;
      shelf = 0;
    }
    p.mx = sx;
    p.my = sy;
    sx += p.bb.w + 1;
    shelf = Math.max(shelf, p.bb.h);
  }
  const H = sy + shelf + (shelf ? 1 : 0);

  const img = new Img(W, Math.max(H, baseH));
  const meta = { anims: {} };
  for (const b of blocks) {
    const m = [];
    for (let d = 0; d < b.a.dirs; d++)
      for (let i = 0; i < b.a.n; i++) img.draw(b.a.base[d][i], b.x0, b.y0, b.w, b.h, i * b.w, b.y + d * b.h);
    for (const p of pieces.filter((q) => q.b === b)) {
      if (!p.bb) {
        m.push(0, 0, 0, 0, 0, 0);
        continue;
      }
      img.draw(b.a.mask[p.d][p.i], p.bb.x, p.bb.y, p.bb.w, p.bb.h, p.mx, p.my);
      m.push(p.mx, p.my, p.bb.w, p.bb.h, p.bb.x - b.x0, p.bb.y - b.y0);
    }
    meta.anims[b.name] = {
      y: b.y,
      w: b.w,
      h: b.h,
      n: b.a.n,
      d: b.a.dirs,
      ax: b.a.ax - b.x0,
      ay: b.a.ay - b.y0,
      fps: b.a.fps,
      loop: b.a.loop !== false,
      m: m.every((v) => v === 0) ? [] : m,
    };
  }
  meta.maskY = baseH;
  return { img, meta };
}
