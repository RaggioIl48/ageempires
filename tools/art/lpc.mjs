// Acceso al generador de personajes LPC (Universal LPC Spritesheet Character Generator):
// definiciones de capas, paletas, créditos e imágenes. Se descargan solo los archivos
// que se usan, siempre de la misma versión (LPC_COMMIT), para que el resultado sea
// reproducible.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Img } from './img.mjs';

export const LPC_REPO = 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator';
export const LPC_COMMIT = '4963a69795255fb15a934c47f478a8bdcf3668f5';
const RAW = `https://raw.githubusercontent.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/${LPC_COMMIT}/`;

/** Filas de las hojas LPC: norte, oeste, sur, este. */
export const DIRS = ['n', 'w', 's', 'e'];

export class Lpc {
  constructor(cacheDir) {
    this.root = path.join(cacheDir, 'lpc');
    this.filesDir = path.join(cacheDir, 'lpc-files');
    ensureClone(this.root);
    const list = git(this.root, ['ls-tree', '-r', '--name-only', LPC_COMMIT, 'spritesheets']);
    this.list = new Set(list.split('\n').filter(Boolean).map((p) => p.slice('spritesheets/'.length)));
    this.custom = loadCustomAnimations(this.root);
    this.defs = new Map();
    this.palettes = new Map();
    this.pending = new Map();
    this.cache = new Map();
    this.downloads = 0;
  }

  def(name) {
    if (!this.defs.has(name)) {
      const file = path.join(this.root, 'sheet_definitions', `${name}.json`);
      if (!fs.existsSync(file)) throw new Error(`LPC: no existe la definición ${name}`);
      this.defs.set(name, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    return this.defs.get(name);
  }

  has(rel) {
    return this.list.has(rel);
  }

  /** Imagen de spritesheets/<rel> (se descarga la primera vez). */
  async img(rel) {
    if (this.cache.has(rel)) return this.cache.get(rel);
    if (!this.pending.has(rel))
      this.pending.set(
        rel,
        (async () => {
          const local = path.join(this.filesDir, rel);
          if (!fs.existsSync(local)) {
            if (!this.has(rel)) throw new Error(`LPC: no existe spritesheets/${rel}`);
            const res = await fetch(RAW + 'spritesheets/' + rel.split('/').map(encodeURIComponent).join('/'));
            if (!res.ok) throw new Error(`LPC: descarga fallida (${res.status}) ${rel}`);
            fs.mkdirSync(path.dirname(local), { recursive: true });
            fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
            this.downloads++;
          }
          const img = Img.read(local);
          this.cache.set(rel, img);
          return img;
        })(),
      );
    return this.pending.get(rel);
  }

  /** Colores de una paleta ("material" = body, cloth, metal, wood, hair, eye). */
  palette(material, key) {
    if (!this.palettes.has(material)) {
      const dir = path.join(this.root, 'palette_definitions', material);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, `meta_${material}.json`), 'utf8'));
      // Solo la versión "ulpc": todas sus paletas tienen la misma cantidad de colores.
      const all = JSON.parse(fs.readFileSync(path.join(dir, `${material}_ulpc.json`), 'utf8'));
      this.palettes.set(material, { base: meta.base, all });
    }
    const p = this.palettes.get(material);
    const k = key ?? p.base;
    if (!p.all[k]) throw new Error(`LPC: la paleta ${material} no tiene "${k}" (hay: ${Object.keys(p.all).join(', ')})`);
    return p.all[k];
  }

  paletteBase(material) {
    this.palette(material);
    return this.palettes.get(material).base;
  }
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 256 << 20 }).toString();
}

/** Clon parcial: sin imágenes (se bajan una a una), solo definiciones y paletas. */
function ensureClone(root) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', LPC_REPO + '.git', root], { stdio: 'inherit' });
  }
  const have = (() => {
    try {
      return git(root, ['cat-file', '-t', LPC_COMMIT]).trim() === 'commit';
    } catch {
      return false;
    }
  })();
  if (!have) git(root, ['fetch', '--depth', '1', '--filter=blob:none', 'origin', LPC_COMMIT]);
  if (!fs.existsSync(path.join(root, 'sheet_definitions'))) {
    git(root, ['sparse-checkout', 'set', '--no-cone', 'sheet_definitions/*', 'palette_definitions/*', '/CREDITS.csv', '/LICENSE']);
    git(root, ['checkout', LPC_COMMIT]);
  }
}

/** Animaciones especiales de LPC (armas grandes, herramientas) desde sources/custom-animations.ts. */
function loadCustomAnimations(root) {
  const src = git(root, ['show', `${LPC_COMMIT}:sources/custom-animations.ts`]);
  const start = src.indexOf('const customAnimations');
  const open = src.indexOf('{', src.indexOf('=', start));
  const end = src.indexOf('\n};', open);
  const obj = new Function(`return ${src.slice(open, end + 2)}`)();
  const out = {};
  for (const [name, def] of Object.entries(obj)) {
    const frames = def.frames.map((row) => row.map((s) => Number(s.split(',')[1])));
    const base = def.frames[0][0].split(',')[0].split('-')[0];
    out[name] = { frameSize: def.frameSize, base, frames };
  }
  return out;
}
