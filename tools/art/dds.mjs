// Lector de texturas DDS (formato de GPU que usa 0 A.D.): DXT1, DXT3, DXT5 y RGBA
// sin comprimir. Devuelve una Img con el primer nivel (el de mayor tamaño).

import fs from 'node:fs';
import { Img } from './img.mjs';

function color565(c) {
  return [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
}

export function readDds(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'DDS ') throw new Error(`no es DDS: ${file}`);
  const h = b.readUInt32LE(12), w = b.readUInt32LE(16);
  const pfFlags = b.readUInt32LE(80);
  const four = b.toString('ascii', 84, 88);
  const img = new Img(w, h);
  let at = 128;
  if (pfFlags & 0x4) {
    const kind = four;
    if (!['DXT1', 'DXT3', 'DXT5'].includes(kind)) throw new Error(`DDS ${kind} no soportado: ${file}`);
    const blockBytes = kind === 'DXT1' ? 8 : 16;
    for (let by = 0; by < Math.ceil(h / 4); by++)
      for (let bx = 0; bx < Math.ceil(w / 4); bx++) {
        const blk = at;
        at += blockBytes;
        const alpha = new Array(16).fill(255);
        let cOff = blk;
        if (kind === 'DXT3') {
          for (let i = 0; i < 16; i++) alpha[i] = ((b[blk + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
          cOff = blk + 8;
        } else if (kind === 'DXT5') {
          const a0 = b[blk], a1 = b[blk + 1];
          const pal = [a0, a1];
          if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7);
          else {
            for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5);
            pal.push(0, 255);
          }
          let bits = 0n;
          for (let i = 0; i < 6; i++) bits |= BigInt(b[blk + 2 + i]) << BigInt(8 * i);
          for (let i = 0; i < 16; i++) alpha[i] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
          cOff = blk + 8;
        }
        const c0 = b.readUInt16LE(cOff), c1 = b.readUInt16LE(cOff + 2);
        const p0 = color565(c0), p1 = color565(c1);
        const pal = [p0, p1];
        if (kind !== 'DXT1' || c0 > c1) pal.push(p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3));
        else pal.push(p0.map((v, k) => (v + p1[k]) / 2), [0, 0, 0]);
        const idx = b.readUInt32LE(cOff + 4);
        for (let i = 0; i < 16; i++) {
          const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
          if (x >= w || y >= h) continue;
          const ci = (idx >> (2 * i)) & 3;
          const o = (y * w + x) * 4;
          const c = pal[ci];
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = kind === 'DXT1' && c0 <= c1 && ci === 3 ? 0 : alpha[i];
        }
      }
    return img;
  }
  // Sin comprimir: se leen las máscaras de cada canal.
  const bits = b.readUInt32LE(88);
  const masks = [92, 96, 100, 104].map((o) => b.readUInt32LE(o));
  const bpp = bits / 8;
  for (let i = 0; i < w * h; i++) {
    let v = 0;
    for (let k = 0; k < bpp; k++) v |= b[at + i * bpp + k] << (8 * k);
    v >>>= 0;
    for (let c = 0; c < 4; c++) {
      const m = masks[c];
      if (!m) {
        img.data[i * 4 + c] = c === 3 ? 255 : 0;
        continue;
      }
      const shift = Math.clz32(m & -m) ^ 31;
      const max = m >>> shift;
      img.data[i * 4 + c] = Math.round((((v & m) >>> shift) / max) * 255);
    }
  }
  return img;
}
