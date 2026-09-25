// Arma los cuadros de un personaje LPC a partir de sus piezas (cuerpo, cabeza,
// ropa, casco, arma…), en el orden de capas (zPos) que define LPC.
//
// Una pieza ("part") es: { def, variant?, color?, colors?, team? }
//   def     definición en sheet_definitions (p. ej. 'torso/armour/torso_armour_legion')
//   variant archivo de color ya pintado (para piezas con "variants")
//   color   color de paleta (p. ej. 'bronze'); colors = { color_1, color_2 } si tiene varias
//   team    true = la pieza lleva el color del jugador (se guarda aparte, en gris, para teñirla)
//
// Además de la imagen normal se arma una "máscara de equipo": los píxeles de las piezas
// con team=true que quedan visibles.

import { Img } from './img.mjs';
import { normalizeLicenses } from './licenses.mjs';

export function categoryOf(def) {
  if (def.startsWith('weapons/shields')) return 'shield';
  if (def.startsWith('weapons/') || def.startsWith('tools/')) return 'weapon';
  if (/^(hair|headwear|head)\//.test(def)) return 'head';
  if (def.startsWith('feet/')) return 'feet';
  return 'body';
}

export class Composer {
  constructor(lpc) {
    this.lpc = lpc;
    this.prepared = new Map();
    /** Créditos usados: clave = prefijo de archivo LPC. */
    this.credits = new Map();
  }

  /** Archivo de una capa para la animación `anim` (o la animación especial `custom`). */
  fileFor(def, layer, part, anim, custom, bodyType) {
    const p = layer[bodyType] ?? layer.male;
    if (!p) return null;
    const variant = part.variant ?? def.variants?.[0];
    let candidates;
    if (layer.custom_animation) {
      if (layer.custom_animation !== custom) return null;
      candidates = p.endsWith('/') ? [variant && `${p}${variant}.png`, `${p}${custom}.png`] : [`${p}.png`];
    } else {
      candidates = [variant && `${p}${anim}/${variant}.png`, `${p}${anim}.png`];
    }
    return candidates.find((c) => c && this.lpc.has(c)) ?? null;
  }

  /** Capas (ordenadas) de todas las piezas para una animación base. */
  layers(parts, anim, bodyType) {
    // ¿Alguna pieza trae una animación especial para esta animación? (arma grande, herramienta)
    let custom = null;
    for (const part of parts) {
      const def = this.lpc.def(part.def);
      for (const k of Object.keys(def))
        if (k.startsWith('layer_') && def[k].custom_animation && this.lpc.custom[def[k].custom_animation]?.base === anim)
          if (this.fileFor(def, def[k], part, anim, def[k].custom_animation, bodyType)) custom ??= def[k].custom_animation;
    }
    const out = [];
    parts.forEach((part, order) => {
      const def = this.lpc.def(part.def);
      for (const k of Object.keys(def)) {
        if (!k.startsWith('layer_')) continue;
        const rel = this.fileFor(def, def[k], part, anim, custom, bodyType);
        if (rel) out.push({ part, def, rel, custom: !!def[k].custom_animation, z: def[k].zPos ?? 0, order, cat: categoryOf(part.def) });
      }
    });
    out.sort((a, b) => a.z - b.z || a.order - b.order);
    return { custom, layers: out };
  }

  /** Imagen de una capa ya recoloreada (y en gris si es de equipo). */
  async prep(l) {
    const key = `${l.rel}|${l.part.variant ?? ''}|${JSON.stringify(l.part.color ?? l.part.colors ?? '')}|${l.part.team ? 1 : 0}`;
    if (this.prepared.has(key)) return this.prepared.get(key);
    const img = (await this.lpc.img(l.rel)).clone();
    const rc = l.def.recolors;
    if (rc) {
      const specs = rc.material ? { color_1: rc } : rc;
      const want = l.part.colors ?? (l.part.color ? { color_1: l.part.color } : {});
      for (const [slot, spec] of Object.entries(specs)) {
        if (!want[slot]) continue;
        const from = this.lpc.palette(spec.material, spec.base ?? this.lpc.paletteBase(spec.material));
        const to = this.lpc.palette(spec.material, want[slot]);
        img.recolor(from, to);
      }
    }
    if (l.part.team) img.toTeamGray();
    this.prepared.set(key, img);
    return img;
  }

  credit(def, rel) {
    let best = null;
    for (const c of def.credits ?? []) if (rel.startsWith(c.file) && (!best || c.file.length > best.file.length)) best = c;
    if (!best) throw new Error(`LPC: sin créditos para ${rel}`);
    const cur = this.credits.get(best.file);
    if (cur) cur.files.add(rel);
    else
      this.credits.set(best.file, {
        title: def.name,
        file: best.file,
        authors: best.authors,
        licenses: normalizeLicenses(best.licenses),
        urls: best.urls,
        notes: best.notes ?? '',
        files: new Set([rel]),
      });
    this.lastCredits?.add(best.file);
  }

  /**
   * Cuadros de una animación: base[d][i] y mask[d][i] (Img de fs×fs).
   * opts.frames: qué cuadros de la animación usar (índices); opts.filter(cat): qué piezas incluir.
   */
  async anim(parts, anim, opts = {}) {
    const bodyType = opts.bodyType ?? 'male';
    const { custom, layers } = this.layers(parts, anim, bodyType);
    const def = custom ? this.lpc.custom[custom] : null;
    const fs = def ? def.frameSize : 64;
    // Cuántos cuadros y filas: de la animación especial, o de la hoja del cuerpo.
    const bodyLayer = layers.find((l) => l.part.def === 'body/body' && !l.custom) ?? layers.find((l) => !l.custom);
    const bodyImg = await this.lpc.img(bodyLayer.rel);
    const dirs = def ? def.frames.length : Math.max(1, Math.floor(bodyImg.h / 64));
    const count = def ? def.frames[0].length : Math.floor(bodyImg.w / 64);
    const pick = opts.frames ?? [...Array(count).keys()];
    const off = (fs - 64) / 2;
    const base = [], mask = [];
    const imgs = await Promise.all(layers.map((l) => this.prep(l)));
    for (const l of layers) if (!opts.filter || opts.filter(l.cat, l.part)) this.credit(l.def, l.rel);
    for (let d = 0; d < dirs; d++) {
      base.push([]);
      mask.push([]);
      for (const i of pick) {
        const b = new Img(fs, fs), m = new Img(fs, fs);
        layers.forEach((l, k) => {
          if (opts.filter && !opts.filter(l.cat, l.part)) return;
          const img = imgs[k];
          let sx, sy, sw, sh, dx, dy;
          if (l.custom) [sx, sy, sw, sh, dx, dy] = [i * fs, d * fs, fs, fs, 0, 0];
          else {
            const bi = def ? def.frames[d][i] : i;
            [sx, sy, sw, sh, dx, dy] = [bi * 64, (img.h > 64 ? d : 0) * 64, 64, 64, off, off];
          }
          const clip = opts.clip; // recorte opcional {x,y,w,h} dentro del cuadro de 64
          if (clip && !l.custom) {
            sx += clip.x;
            sy += clip.y;
            dx += clip.x;
            dy += clip.y;
            sw = clip.w;
            sh = clip.h;
          }
          b.draw(img, sx, sy, sw, sh, dx, dy);
          if (l.part.team) m.draw(img, sx, sy, sw, sh, dx, dy);
          else m.erase(img, sx, sy, sw, sh, dx, dy);
        });
        base[d].push(b);
        mask[d].push(m);
      }
    }
    return { fs, dirs, n: pick.length, base, mask, custom };
  }
}
