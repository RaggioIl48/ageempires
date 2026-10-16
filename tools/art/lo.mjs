// Versiones livianas (media resolución) de las hojas grandes de unidades.
//
// Una hoja de caballería 3D decodificada ocupa más de 100 MB de memoria de video; con 10–15 tipos a la
// vista, una laptop con gráficos integrados se queda sin memoria y el juego se arrastra. El cliente usa
// estas copias (1/4 de los píxeles) para todo lo que se dibuja a tamaño normal, y solo pide la hoja
// completa al acercar mucho el zoom. Mismas coordenadas que la original, divididas por 2.
//
// Uso:  node tools/art/lo.mjs         (todas las hojas de más de MIN_PX píxeles)
//       node tools/art/lo.mjs <id>    (una sola)
// (soldiers.mjs y repack.mjs no la regeneran solas: correr esto después de cambiar una hoja.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { shrink } from './importgrid.mjs';
import { quantize } from './quantize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'client/public/art');
/** Desde cuántos píxeles vale la pena tener copia liviana. */
export const MIN_PX = 500_000;

/** Nombre de la copia liviana de una hoja. */
export const loName = (file) => file.replace(/\.png$/, '.lo.png');

/** Hace la copia liviana de una hoja (imagen ya leída). */
export function makeLo(img) {
  return quantize(shrink(img, 2));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/lo.mjs')) {
  const only = process.argv[2];
  const mf = path.join(OUT, 'units.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  let n = 0, full = 0, lite = 0;
  for (const [id, sheet] of Object.entries(manifest.sheets)) {
    if (only && id !== only) continue;
    const img = Img.read(path.join(OUT, sheet.file));
    if (img.w * img.h < MIN_PX) {
      delete sheet.lo;
      continue;
    }
    const lo = makeLo(img);
    sheet.lo = loName(sheet.file);
    lo.write(path.join(OUT, sheet.lo));
    full += img.w * img.h * 4;
    lite += lo.w * lo.h * 4;
    n++;
  }
  fs.writeFileSync(mf, JSON.stringify(manifest));
  console.log(`${n} copias livianas · memoria decodificada: ${(full / 1048576).toFixed(0)} MB → ${(lite / 1048576).toFixed(0)} MB`);
}
