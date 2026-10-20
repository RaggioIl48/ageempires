// Ícono del juego (para el acceso directo del escritorio): el Centro Urbano de piedra del arte del
// juego sobre un escudo con el color del primer jugador. Escribe tools/icon/classroom-empires.ico
// (PNG adentro, 256/48/32/16 px). Uso: node tools/icon/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const full = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'client/public/art/buildings/tc-stone.png')));
// Recorte al dibujo (sin el borde transparente), cuadrado.
let x0 = full.width, y0 = full.height, x1 = 0, y1 = 0;
for (let y = 0; y < full.height; y++)
  for (let x = 0; x < full.width; x++)
    if (full.data[(y * full.width + x) * 4 + 3] > 20) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
const side = Math.max(x1 - x0, y1 - y0) + 1;
const src = new PNG({ width: side, height: side });
PNG.bitblt(full, src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, Math.floor((side - (x1 - x0 + 1)) / 2), Math.floor((side - (y1 - y0 + 1)) / 2));

/** Dibuja el ícono de lado `n`: fondo redondeado azul y el edificio escalado (promedio de píxeles). */
function icon(n) {
  const out = new PNG({ width: n, height: n });
  const r = n * 0.18;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      // Esquinas redondeadas.
      const cx = Math.min(x, n - 1 - x), cy = Math.min(y, n - 1 - y);
      const inside = cx >= r || cy >= r || Math.hypot(r - cx, r - cy) <= r;
      if (!inside) continue;
      const t = y / n;
      out.data[i] = 0x2f * (1 - t * 0.4);
      out.data[i + 1] = 0x6f * (1 - t * 0.4);
      out.data[i + 2] = 0xd6 * (1 - t * 0.4);
      out.data[i + 3] = 255;
    }
  // Edificio: ocupa el 90 % del lado, centrado.
  const box = n * 0.9, ox = (n - box) / 2, oy = (n - box) / 2;
  const k = src.width / box;
  for (let y = 0; y < box; y++)
    for (let x = 0; x < box; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      const sx0 = Math.floor(x * k), sy0 = Math.floor(y * k), s1 = Math.max(1, Math.floor(k));
      for (let dy = 0; dy < s1; dy++)
        for (let dx = 0; dx < s1; dx++) {
          const j = ((Math.min(src.height - 1, sy0 + dy)) * src.width + Math.min(src.width - 1, sx0 + dx)) * 4;
          const a = src.data[j + 3];
          rr += src.data[j] * a; gg += src.data[j + 1] * a; bb += src.data[j + 2] * a; aa += a;
        }
      if (aa === 0) continue;
      const a = aa / (s1 * s1) / 255;
      const tx = Math.floor(ox + x), ty = Math.floor(oy + y);
      if (tx >= n || ty >= n) continue;
      const i = (ty * n + tx) * 4;
      if (out.data[i + 3] === 0) continue;
      out.data[i] = out.data[i] * (1 - a) + (rr / aa) * a;
      out.data[i + 1] = out.data[i + 1] * (1 - a) + (gg / aa) * a;
      out.data[i + 2] = out.data[i + 2] * (1 - a) + (bb / aa) * a;
    }
  return PNG.sync.write(out);
}

const sizes = [256, 48, 32, 16];
const pngs = sizes.map(icon);
// ICO: cabecera, una entrada de 16 bytes por tamaño y los PNG uno tras otro.
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, k) => {
  const e = 6 + 16 * k;
  head.writeUInt8(s === 256 ? 0 : s, e);
  head.writeUInt8(s === 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[k].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[k].length;
});
fs.writeFileSync(path.join(HERE, 'classroom-empires.ico'), Buffer.concat([head, ...pngs]));
fs.writeFileSync(path.join(HERE, 'classroom-empires.png'), pngs[0]);
console.log('tools/icon/classroom-empires.ico');
