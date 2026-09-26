// Dibuja modelos 3D como imágenes 2D con la misma vista isométrica 2:1 del juego
// (casilla de 64×32). Rasterizador por software (sin Blender ni GPU): z-buffer,
// textura con filtro bilineal, luz de sol, oclusión ambiental y suavizado por
// supermuestreo. También arma la "máscara de equipo" (zonas con el color del jugador).
//
// Espacio de la casilla: u (hacia abajo a la derecha en pantalla), v (hacia abajo a la
// izquierda), h (altura). Todo medido en casillas.

import { Img } from './img.mjs';

/** Píxeles por casilla: x = (u − v)·32, y = (u + v)·16 − h·HEIGHT_PX. */
export const HEIGHT_PX = 32 * Math.SQRT2 * Math.cos(Math.PI / 6); // 39,19: vista a 30°
const CLOSE_UV = Math.cos(Math.PI / 6) / Math.SQRT2; // cercanía a la cámara por u+v
const CLOSE_H = 0.5; // … y por la altura
const VIEW = norm([CLOSE_UV, CLOSE_UV, CLOSE_H]);

function norm(v) {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}

/** Sol desde arriba a la izquierda de la pantalla (como en Unknown Horizons). */
const LIGHT = norm([-0.35, 0.55, 0.9]);

function sample(img, s, t) {
  // Coordenadas de textura con repetición; t = 0 abajo (COLLADA).
  let x = (s - Math.floor(s)) * img.w - 0.5;
  let y = (1 - (t - Math.floor(t))) * img.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const xx = (((x0 + dx) % img.w) + img.w) % img.w, yy = (((y0 + dy) % img.h) + img.h) % img.h;
    const i = (yy * img.w + xx) * 4;
    for (let c = 0; c < 4; c++) out[c] += img.data[i + c] * w;
  }
  return out;
}

/**
 * Dibuja objetos: [{ tris, tex, ao?, mode, clip? }]
 *   tris: triángulos ya en espacio de casilla [{p:[u,v,h], n:[..], t0:[s,t], t1:[s,t]} ×3]
 *   mode: 'player' (alfa = color del jugador), 'trans' (alfa = transparencia), 'opaque'
 *   clip(u, v, h): false = no dibujar ese punto (para recortar tramos de muralla)
 * Devuelve { img, mask, ox, oy }: (ox, oy) = píxel donde cae u = v = h = 0.
 */
export function render(objects, { ss = 3, ambient = 0.52, diffuse = 0.62 } = {}) {
  // Límites en pantalla.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const proj = (p) => [(p[0] - p[1]) * 32, (p[0] + p[1]) * 16 - p[2] * HEIGHT_PX];
  for (const o of objects)
    for (const t of o.tris)
      for (const c of t) {
        const [x, y] = proj(c.p);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  const pad = 2;
  const W = Math.ceil(maxX - minX) + pad * 2, H = Math.ceil(maxY - minY) + pad * 2;
  const offX = -minX + pad, offY = -minY + pad;
  const BW = W * ss, BH = H * ss;
  const depth = new Float32Array(BW * BH).fill(-Infinity);
  const color = new Float32Array(BW * BH * 3);
  const cover = new Uint8Array(BW * BH);
  const team = new Float32Array(BW * BH * 2); // [gris, peso]

  for (const o of objects) {
    for (const tri of o.tris) {
      const P = tri.map((c) => {
        const [x, y] = proj(c.p);
        return [(x + offX) * ss, (y + offY) * ss];
      });
      const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(BW - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(BH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const close = tri.map((c) => (c.p[0] + c.p[1]) * CLOSE_UV + c.p[2] * CLOSE_H);
      // Normal de la cara (por si el modelo no trae normales).
      const e1 = [0, 1, 2].map((k) => tri[1].p[k] - tri[0].p[k]), e2 = [0, 1, 2].map((k) => tri[2].p[k] - tri[0].p[k]);
      const faceN = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const sx = px + 0.5, sy = py + 0.5;
          const w0 = ((P[1][0] - sx) * (P[2][1] - sy) - (P[2][0] - sx) * (P[1][1] - sy)) / area;
          const w1 = ((P[2][0] - sx) * (P[0][1] - sy) - (P[0][0] - sx) * (P[2][1] - sy)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = close[0] * w0 + close[1] * w1 + close[2] * w2;
          const bi = py * BW + px;
          if (z <= depth[bi]) continue;
          if (o.clip) {
            const u = tri[0].p[0] * w0 + tri[1].p[0] * w1 + tri[2].p[0] * w2;
            const v = tri[0].p[1] * w0 + tri[1].p[1] * w1 + tri[2].p[1] * w2;
            const h = tri[0].p[2] * w0 + tri[1].p[2] * w1 + tri[2].p[2] * w2;
            if (!o.clip(u, v, h)) continue;
          }
          const lerp2 = (k) => (tri[0][k] ? [tri[0][k][0] * w0 + tri[1][k][0] * w1 + tri[2][k][0] * w2, tri[0][k][1] * w0 + tri[1][k][1] * w1 + tri[2][k][1] * w2] : null);
          const uv0 = lerp2('t0');
          const tex = o.tex && uv0 ? sample(o.tex, uv0[0], uv0[1]) : [180, 180, 180, 255];
          if (o.mode === 'trans' && tex[3] < 128) continue;
          let n = tri[0].n ? norm([0, 1, 2].map((k) => tri[0].n[k] * w0 + tri[1].n[k] * w1 + tri[2].n[k] * w2)) : faceN;
          // Cara vista de atrás: en una pieza recortada es el interior que dejó el corte, y se
          // pinta como una cara maciza y pareja ("tapa"); si no, se da vuelta la normal.
          const back = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] < 0;
          if (back) n = n.map((x) => -x);
          const cap = back && o.caps;
          const lit = cap ? ambient * 1.05 : ambient + diffuse * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
          let ao = 1;
          if (o.ao && !cap) {
            const uv1 = lerp2('t1') ?? uv0;
            if (uv1) ao = 0.35 + 0.65 * (sample(o.ao, uv1[0], uv1[1])[0] / 255);
          }
          const k = lit * ao;
          depth[bi] = z;
          cover[bi] = 1;
          const w = o.mode === 'player' && !cap ? 1 - tex[3] / 255 : 0;
          const gray = 200;
          for (let c = 0; c < 3; c++) color[bi * 3 + c] = Math.min(255, (tex[c] * (1 - w) + gray * w) * k);
          team[bi * 2] = Math.min(255, 235 * k);
          team[bi * 2 + 1] = w;
        }
    }
  }

  // Reducir el supermuestreo (promedio de ss×ss).
  const img = new Img(W, H), mask = new Img(W, H);
  const n2 = ss * ss;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0, tg = 0, tw = 0;
      for (let dy = 0; dy < ss; dy++)
        for (let dx = 0; dx < ss; dx++) {
          const bi = (y * ss + dy) * BW + (x * ss + dx);
          if (!cover[bi]) continue;
          a++;
          r += color[bi * 3];
          g += color[bi * 3 + 1];
          b += color[bi * 3 + 2];
          tg += team[bi * 2] * team[bi * 2 + 1];
          tw += team[bi * 2 + 1];
        }
      if (!a) continue;
      const i = (y * W + x) * 4;
      img.data[i] = r / a;
      img.data[i + 1] = g / a;
      img.data[i + 2] = b / a;
      img.data[i + 3] = Math.round((a / n2) * 255);
      if (tw > 0.01) {
        const gv = tg / tw;
        mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = gv;
        mask.data[i + 3] = Math.round((tw / n2) * 255);
      }
    }
  return { img, mask, ox: offX, oy: offY };
}

/** Recorta una imagen (y su máscara) a lo visible; devuelve el nuevo origen. */
export function cropRender(r) {
  const bb = r.img.bbox(0, 0, r.img.w, r.img.h);
  if (!bb) return r;
  return { img: r.img.sub(bb.x, bb.y, bb.w, bb.h), mask: r.mask.sub(bb.x, bb.y, bb.w, bb.h), ox: r.ox - bb.x, oy: r.oy - bb.y };
}
