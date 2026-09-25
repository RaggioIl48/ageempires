// Jinetes: un personaje LPC montado en un caballo de "[LPC] Horses" (bluecarrot16),
// con los recortes y desplazamientos de "[LPC] Horse Riding" (bigbeargames).
//
// El caballo viene en dos partes (fondo y frente) para que las piernas del jinete
// queden entre ambas. Cuadros de 128 px; filas norte, oeste, sur, este.

import path from 'node:path';
import { Img } from './img.mjs';

/** Colores de caballo (carpetas del paquete de monta). */
export const HORSE_COLORS = { dun: 1, golden: 2, chestnut: 3, black: 4, gray: 5 };

// Desplazamiento del jinete [x, y] por ciclo, dirección (n, w, s, e) y cuadro.
const MOD = {
  s: [[[0, -23]], [[-3, -28]], [[0, -21]], [[3, -28]]],
  w: [
    [[1, -23], [0, -23], [-1, -23], [0, -23]],
    [[-3, -28], [-3, -28], [-4, -28], [-4, -28]],
    [[0, -21], [0, -21], [0, -20], [0, -20]],
    [[3, -28], [3, -28], [4, -28], [4, -28]],
  ],
  r: [
    [[0, -22], [0, -23], [0, -26], [0, -24]],
    [[-2, -32], [-2, -28], [-7, -24], [-5, -26]],
    [[0, -21], [0, -22], [0, -25], [0, -23]],
    [[2, -32], [2, -28], [7, -24], [5, -26]],
  ],
};

/** Lienzo de cada cuadro montado; el caballo (128) va centrado. */
const C = 256;
const H0 = (C - 128) / 2;
/** Pies del caballo dentro del lienzo. */
export const RIDE_ANCHOR = { ax: H0 + 64, ay: H0 + 93 };

export class Rider {
  constructor(comp, rideDir) {
    this.comp = comp;
    this.rideDir = rideDir;
    this.horses = new Map();
    this.renders = new Map();
  }

  horse(color, cycle, part) {
    const key = `${color}/${cycle}${part}`;
    if (!this.horses.has(key)) this.horses.set(key, Img.read(path.join(this.rideDir, String(HORSE_COLORS[color]), `${cycle}${part}.png`)));
    return this.horses.get(key);
  }

  /** Cuadro (todas las direcciones) del jinete con un filtro de piezas. */
  async render(parts, anim, frame, filter, tag) {
    const key = `${tag}|${anim}|${frame}`;
    if (!this.renders.has(key)) this.renders.set(key, this.comp.anim(parts, anim, { frames: [frame], filter }));
    return this.renders.get(key);
  }

  /**
   * Una animación montada.
   *   cycle: 's' (quieto), 'w' (paso), 'r' (galope)
   *   hframes: cuadros del caballo; anim/frames: animación y cuadros del jinete
   * Si hay un cuadro de caballo y varios del jinete, el caballo queda quieto; si hay
   * varios de caballo y uno de jinete, el jinete queda quieto.
   */
  async anim(parts, color, { cycle, hframes, anim, frames }) {
    // Los renders del jinete se guardan por unidad (mismas piezas).
    if (this.parts !== parts) {
      this.parts = parts;
      this.renders = new Map();
    }
    const n = Math.max(hframes.length, frames.length);
    const noWeapons = (cat) => cat !== 'weapon' && cat !== 'shield';
    const only = (want) => (cat) => cat === want;
    const base = [[], [], [], []], mask = [[], [], [], []];
    for (let k = 0; k < n; k++) {
      const hk = hframes[Math.min(k, hframes.length - 1)];
      const rk = frames[Math.min(k, frames.length - 1)];
      const full = await this.render(parts, anim, rk, null, 'full');
      const legsSide = await this.render(parts, 'thrust', 2, noWeapons, 'legs');
      const legsFront = await this.render(parts, 'spellcast', 5, noWeapons, 'legs');
      const legsBackAll = await this.render(parts, 'spellcast', 5, null, 'full');
      const feet = await this.render(parts, 'thrust', 2, only('feet'), 'feet');
      const weapons = await this.render(parts, anim, rk, only('weapon'), 'weapon');
      const heads = await this.render(parts, anim, rk, only('head'), 'head');
      const shields = await this.render(parts, anim, rk, only('shield'), 'shield');
      const hb = this.horse(color, cycle, 'b'), hf = this.horse(color, cycle, 'f');
      for (let d = 0; d < 4; d++) {
        const out = new Img(C, C), m = new Img(C, C);
        const [mx, my0] = MOD[cycle][d][Math.min(hk, MOD[cycle][d].length - 1)];
        const my = my0 + (anim === 'spellcast' ? 1 : 0);
        const rx = H0 + 32 + mx, ry = H0 + 32 + my;
        const horse = (img) => {
          out.draw(img, hk * 128, d * 128, 128, 128, H0, H0);
          m.erase(img, hk * 128, d * 128, 128, 128, H0, H0);
        };
        /** Pega un recorte (en coordenadas del cuadro de 64) de un render del jinete. */
        const put = (r, clip = { x: 0, y: 0, w: 64, h: 64 }, dx = 0, dy = 0) => {
          const off = (r.fs - 64) / 2;
          const full64 = clip.w === 64 && clip.h === 64 && !clip.x && !clip.y;
          const [sx, sy, sw, sh] = full64 ? [0, 0, r.fs, r.fs] : [clip.x + off, clip.y + off, clip.w, clip.h];
          const tx = rx + dx - off + sx, ty = ry + dy - off + sy;
          out.draw(r.base[d][0], sx, sy, sw, sh, tx, ty);
          m.erase(r.base[d][0], sx, sy, sw, sh, tx, ty);
          m.draw(r.mask[d][0], sx, sy, sw, sh, tx, ty);
        };
        const shoot = anim === 'shoot' ? 1 : 0;
        horse(hb);
        if (d === 1 || d === 3) {
          // De costado: torso arriba, piernas abiertas (estocada) abajo.
          put(full, { x: 0, y: 0, w: 64, h: 50 });
          put(legsSide, { x: 0, y: 50, w: 64, h: 14 });
          horse(hf);
          if (d === 3) {
            put(feet, { x: 0, y: 0, w: 32, h: 57 });
            put(feet, { x: 0, y: 58, w: 33, h: 6 });
          } else {
            put(feet, { x: 32, y: 0, w: 32, h: 58 });
            put(feet, { x: 31, y: 58, w: 33, h: 6 });
          }
          put(weapons);
          if (!shoot) put(heads, { x: 0, y: 0, w: 64, h: 24 });
          put(shields);
        } else if (d === 2) {
          // De frente.
          put(legsFront, { x: 0, y: 47, w: 64, h: 17 });
          put(full, { x: 0, y: 0, w: 64, h: 50 });
          put(shields);
          horse(hf);
          put(weapons, undefined, shoot, 0);
          if (!shoot) put(heads, { x: 0, y: 0, w: 64, h: 24 });
        } else {
          // De espaldas.
          put(legsBackAll, { x: 0, y: 46, w: 34, h: 18 }, -2, 0);
          put(legsBackAll, { x: 30, y: 46, w: 34, h: 18 }, 2, 0);
          put(full, { x: 0, y: 0, w: 64, h: 52 }, shoot, 0);
          horse(hf);
          put(weapons, undefined, shoot, 0);
          if (!shoot) put(heads, { x: 0, y: 0, w: 64, h: 24 });
        }
        base[d].push(out);
        mask[d].push(m);
      }
    }
    return { fs: C, dirs: 4, n, base, mask, ...RIDE_ANCHOR };
  }
}
