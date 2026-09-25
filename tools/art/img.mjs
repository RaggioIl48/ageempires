// Imágenes RGBA en memoria: leer/escribir PNG, pegar con transparencia,
// recolorear por paleta y recortar. Solo para las herramientas de arte (Node).

import fs from 'node:fs';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';

export class Img {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data ?? new Uint8Array(w * h * 4);
  }

  static read(file) {
    const png = PNG.sync.read(fs.readFileSync(file));
    return new Img(png.width, png.height, new Uint8Array(png.data));
  }

  /** Guarda como PNG; con 256 colores o menos usa paleta (mucho más liviano). */
  write(file) {
    const indexed = encodeIndexed(this);
    if (indexed) {
      fs.writeFileSync(file, indexed);
      return;
    }
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6, deflateLevel: 9 }));
  }

  clone() {
    return new Img(this.w, this.h, new Uint8Array(this.data));
  }

  /** Copia un rectángulo a una imagen nueva. */
  sub(x, y, w, h) {
    const out = new Img(w, h);
    out.draw(this, x, y, w, h, 0, 0);
    return out;
  }

  /**
   * Pega (sx,sy,sw,sh) de `src` en (dx,dy) con mezcla normal ("source-over").
   * `onPixel(i, a)` se llama por cada píxel pintado (índice destino, alfa 0..1).
   */
  draw(src, sx, sy, sw, sh, dx, dy, onPixel) {
    for (let y = 0; y < sh; y++) {
      const ty = dy + y, fy = sy + y;
      if (ty < 0 || ty >= this.h || fy < 0 || fy >= src.h) continue;
      for (let x = 0; x < sw; x++) {
        const tx = dx + x, fx = sx + x;
        if (tx < 0 || tx >= this.w || fx < 0 || fx >= src.w) continue;
        const si = (fy * src.w + fx) * 4;
        const sa = src.data[si + 3];
        if (!sa) continue;
        const di = (ty * this.w + tx) * 4;
        blend(this.data, di, src.data, si);
        onPixel?.(di, sa / 255);
      }
    }
  }

  /** Borra lo que queda tapado por `src`: alfa *= (1 − alfa de src). */
  erase(src, sx, sy, sw, sh, dx, dy) {
    for (let y = 0; y < sh; y++) {
      const ty = dy + y, fy = sy + y;
      if (ty < 0 || ty >= this.h || fy < 0 || fy >= src.h) continue;
      for (let x = 0; x < sw; x++) {
        const tx = dx + x, fx = sx + x;
        if (tx < 0 || tx >= this.w || fx < 0 || fx >= src.w) continue;
        const sa = src.data[(fy * src.w + fx) * 4 + 3];
        if (!sa) continue;
        const di = (ty * this.w + tx) * 4 + 3;
        this.data[di] = Math.round(this.data[di] * (1 - sa / 255));
      }
    }
  }

  /** Reemplaza colores exactos (±1 por canal) de `from` por los de `to`. */
  recolor(from, to) {
    const src = from.map(hexRgb), dst = to.map(hexRgb);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      for (let k = 0; k < src.length; k++) {
        const c = src[k];
        if (Math.abs(d[i] - c[0]) <= 1 && Math.abs(d[i + 1] - c[1]) <= 1 && Math.abs(d[i + 2] - c[2]) <= 1) {
          [d[i], d[i + 1], d[i + 2]] = dst[k];
          break;
        }
      }
    }
    return this;
  }

  /** Pasa a escala de grises clara (para teñir luego con el color del jugador). */
  toTeamGray() {
    const d = this.data;
    const lum = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    if (!lum.length) return this;
    lum.sort((a, b) => a - b);
    const top = lum[Math.floor(lum.length * 0.9)] || 1;
    const k = Math.min(3, 235 / top);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const g = Math.min(255, Math.round((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * k));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    return this;
  }

  /** Caja mínima con píxeles visibles dentro de (x,y,w,h), o null. */
  bbox(x = 0, y = 0, w = this.w, h = this.h) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (this.data[(yy * this.w + xx) * 4 + 3] > 8) {
          if (xx < x0) x0 = xx;
          if (xx > x1) x1 = xx;
          if (yy < y0) y0 = yy;
          if (yy > y1) y1 = yy;
        }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** Espeja horizontalmente. */
  flipX() {
    const out = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const a = (y * this.w + x) * 4, b = (y * this.w + (this.w - 1 - x)) * 4;
        out.data.set(this.data.subarray(a, a + 4), b);
      }
    return out;
  }
}

function blend(d, di, s, si) {
  const sa = s[si + 3] / 255;
  if (sa >= 1) {
    d[di] = s[si];
    d[di + 1] = s[si + 1];
    d[di + 2] = s[si + 2];
    d[di + 3] = 255;
    return;
  }
  const da = d[di + 3] / 255;
  const oa = sa + da * (1 - sa);
  for (let c = 0; c < 3; c++) d[di + c] = Math.round((s[si + c] * sa + d[di + c] * da * (1 - sa)) / oa);
  d[di + 3] = Math.round(oa * 255);
}

// ---------- PNG con paleta (tipo de color 3) ----------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG de paleta si la imagen tiene ≤ 256 colores RGBA distintos; si no, null. */
function encodeIndexed(img) {
  const d = img.data;
  const index = new Map();
  const colors = [];
  const px = new Uint8Array(img.w * img.h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    // Todos los píxeles transparentes son el mismo color.
    const key = d[i + 3] === 0 ? 0 : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
    let k = index.get(key);
    if (k === undefined) {
      if (colors.length === 256) return null;
      k = colors.length;
      index.set(key, k);
      colors.push(key);
    }
    px[p] = k;
  }
  const raw = Buffer.alloc((img.w + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w + 1)] = 0; // sin filtro
    raw.set(px.subarray(y * img.w, (y + 1) * img.w), y * (img.w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 3; // paleta
  const plte = Buffer.alloc(colors.length * 3);
  const trns = Buffer.alloc(colors.length);
  colors.forEach((c, k) => {
    plte[k * 3] = c >>> 24;
    plte[k * 3 + 1] = (c >>> 16) & 255;
    plte[k * 3 + 2] = (c >>> 8) & 255;
    trns[k] = c & 255;
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
