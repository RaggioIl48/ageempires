// Modelos de 0 A.D. (Wildfire Games, arte CC-BY-SA 3.0): lee "actores" (edificio =
// modelo + texturas + accesorios), baja solo los archivos necesarios de una versión
// fija del repositorio y los deja listos para dibujar con raster.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { Img } from './img.mjs';
import { readDds } from './dds.mjs';
import { kid, kids, parseXml } from './xml.mjs';
import { IDENTITY, apply, applyDir, loadCollada, mul } from './collada.mjs';

export const ZEROAD_REPO = 'https://github.com/0ad/0ad';
export const ZEROAD_COMMIT = '61a3b9507d974084e6badb88a0826bd89a6d5b8b';
const RAW = `https://raw.githubusercontent.com/0ad/0ad/${ZEROAD_COMMIT}/binaries/data/mods/public/art/`;

export const ZEROAD_CREDIT = {
  pack: '0ad',
  title: '0 A.D. buildings, walls and towers',
  authors: ['Wildfire Games', '0 A.D. artists and contributors'],
  licenses: ['CC-BY-SA 3.0'],
  urls: ['https://play0ad.com', 'https://www.wildfiregames.com', `${ZEROAD_REPO}/blob/${ZEROAD_COMMIT}/binaries/data/mods/public/art/LICENSE.txt`],
  notes: '3D models rendered to isometric pictures (one view) with tools/art/raster.mjs.',
};

export class ZeroAD {
  constructor(cacheDir) {
    this.dir = path.join(cacheDir, '0ad-files');
    this.meshes = new Map();
    this.textures = new Map();
    this.downloads = 0;
  }

  async file(rel) {
    const local = path.join(this.dir, rel);
    if (!fs.existsSync(local)) {
      const res = await fetch(RAW + rel);
      if (!res.ok) throw new Error(`0 A.D.: descarga fallida (${res.status}) ${rel}`);
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
      this.downloads++;
    }
    return local;
  }

  async mesh(rel) {
    if (!this.meshes.has(rel)) this.meshes.set(rel, loadCollada(fs.readFileSync(await this.file(`meshes/${rel}`), 'utf8')));
    return this.meshes.get(rel);
  }

  async texture(rel) {
    if (!rel || !/\.(png|dds)$/.test(rel) || /^null_|^default_/.test(rel)) return null;
    if (!this.textures.has(rel)) {
      try {
        const local = await this.file(`textures/skins/${rel}`);
        this.textures.set(rel, rel.endsWith('.dds') ? readDds(local) : Img.read(local));
      } catch {
        this.textures.set(rel, null);
      }
    }
    return this.textures.get(rel);
  }

  /**
   * Piezas de un actor ya ubicadas: [{ tris, tex, ao, mode }] en coordenadas del modelo.
   * `skip(actorPath)` permite omitir accesorios (p. ej. adornos del suelo); `variantName`
   * elige una variante por su nombre (si no, la más frecuente).
   */
  async actor(rel, m = IDENTITY, skip = () => false, depth = 0, variantName = undefined) {
    if (depth > 6 || skip(rel)) return [];
    const doc = parseXml(fs.readFileSync(await this.file(`actors/${rel}`), 'utf8'));
    const actor = kid(doc, 'actor');
    if (!actor) return [];
    const materialName = kid(actor, 'material')?.text.trim() ?? '';
    const mode = /player/.test(materialName) ? 'player' : /trans|alpha/.test(materialName) ? 'trans' : 'opaque';
    let meshRel = null;
    const tex = {};
    const props = [];
    for (const group of kids(actor, 'group')) {
      const variants = kids(group, 'variant');
      // La variante "normal": la de más frecuencia, sin destrucción ni guarnición.
      const ok = variants.filter((v) => !/destruct|garrisoned|death|dead/i.test(`${v.attrs.name ?? ''} ${v.attrs.file ?? ''}`) || /ungarrisoned/i.test(v.attrs.name ?? ''));
      const named = variantName && variants.find((x) => x.attrs.name === variantName);
      const v = named || [...ok].sort((a, b) => Number(b.attrs.frequency ?? 1) - Number(a.attrs.frequency ?? 1))[0];
      if (!v) continue;
      const mesh = kid(v, 'mesh');
      if (mesh && !meshRel) meshRel = mesh.text.trim();
      for (const t of kid(v, 'textures')?.children ?? []) if (t.attrs.name && !tex[t.attrs.name]) tex[t.attrs.name] = t.attrs.file;
      for (const p of kid(v, 'props')?.children ?? []) if (p.attrs.actor) props.push(p.attrs);
    }
    const parts = [];
    let points = {};
    if (meshRel) {
      const mesh = await this.mesh(meshRel);
      points = mesh.points;
      parts.push({
        tris: mesh.tris.map((t) => t.map((c) => ({ p: apply(m, ...c.p), n: c.n ? applyDir(m, ...c.n) : null, t0: c.t0, t1: c.t1 }))),
        tex: await this.texture(tex.baseTex),
        ao: await this.texture(tex.aoTex),
        mode,
        source: rel,
      });
    }
    for (const p of props) {
      const at = p.attachpoint === 'root' || !p.attachpoint ? IDENTITY : points[p.attachpoint];
      if (!at) continue;
      parts.push(...(await this.actor(p.actor, mul(m, at), skip, depth + 1)));
    }
    return parts;
  }
}
