// Unidades dibujadas con hojas de sprites de proyectos abiertos (ver tools/art y la
// pantalla de Créditos). Cada hoja trae varias animaciones (quieto, caminar, atacar,
// herramientas, morir) en 4 u 8 direcciones, y aparte los recortes con el color de
// equipo (túnicas, capas, escudos) que se tiñen con el color de cada jugador.
//
// Si una unidad no tiene hoja, o la imagen aún no llegó, se dibuja con las formas
// de sprites.ts: el juego nunca queda sin dibujo.

import { BUILDING_DEFS, type FactionId, type UnitType } from '../../shared/data.ts';
import type { BuildingView, UnitView } from '../../shared/protocol.ts';
import { stickyRow } from './motion.ts';
import { attackFrame, defaultHit } from './attackSync.ts';

interface AnimMeta {
  /** Fila superior del bloque; w×h = tamaño de cada cuadro; n = cuadros; d = direcciones. */
  y: number;
  w: number;
  h: number;
  n: number;
  d: number;
  /** Punto del cuadro que va sobre la posición de la unidad (los pies). */
  ax: number;
  ay: number;
  fps: number;
  /** Cuadro del impacto del ataque (corte, estocada, disparo); si falta, la mitad. */
  hit?: number;
  loop: boolean;
  /** Recortes de color de equipo: 6 números por cuadro [x, y, w, h, dx, dy]. */
  m: number[];
}

interface SheetMeta {
  file: string;
  scale: number;
  /** Orden de las filas: 'lpc4' = N, O, S, E · 'oga8' = S, SE, E, NE, N, NO, O, SO. */
  o: 'lpc4' | 'oga8';
  credits: string[];
  license: string;
  anims: Record<string, AnimMeta>;
  maskY: number;
}

interface Manifest {
  v: number;
  sheets: Record<string, SheetMeta>;
  units: Record<string, string>;
}

/** Edificios (Unknown Horizons): una imagen por edificio y estilo de construcción. */
interface BuildingArt {
  v: number;
  /** Estilo de construcción de cada pueblo en cada era (índice 0 = Edad Tribal). */
  styles: Record<FactionId, string[]>;
  sprites: Record<string, SpriteDef>;
  /** Árboles: por especie, sus etapas de crecimiento (0 = brote … 4 = adulto). */
  trees: string[][];
  /**
   * Imágenes de cada edificio (varias = variantes). Se busca en este orden:
   * 'pueblo@era/tipo', 'pueblo/tipo', 'estilo/tipo' y '*' + '/tipo'.
   */
  map: Record<string, string[]>;
  /** Piezas de muralla y puertas de cada pueblo (0 A.D.). */
  walls: Record<FactionId, WallPieces>;
  credits: string[];
}

interface SpriteDef {
  file: string;
  w: number;
  h: number;
  /** Casillas de lado de la base dibujada. */
  tiles: number;
  /** Punto de la imagen sobre el centro de la base (si falta: abajo al centro). */
  ax?: number;
  ay?: number;
  /** Zonas con el color del jugador (en gris), para teñir. */
  mask?: string;
}

export interface WallPieces {
  post: string;
  e: string;
  w: string;
  s: string;
  n: string;
  gateU: string;
  gateV: string;
}

const BASE = import.meta.env.BASE_URL ?? '/';
let manifest: Manifest | null = null;
/**
 * Arte experimental (de prueba, no publicado): si existe art/experimental/units.json, sus hojas
 * reemplazan a las normales de esas unidades. Si no existe, o su imagen no carga, se usa la
 * hoja normal (respaldo): nunca queda una unidad sin dibujo.
 */
let experimental: Manifest | null = null;
let buildingArt: BuildingArt | null = null;
let loading: Promise<void> | null = null;
/** Imagen de cada hoja; null = falló (se usa el dibujo de formas). */
const images = new Map<string, HTMLImageElement | null>();
const ready = new Set<string>();
const tints = new Map<string, HTMLCanvasElement>();
/** Sube cada vez que termina de cargar una imagen o un retrato (para redibujar la interfaz). */
export let artVersion = 0;

const getJson = <T>(file: string): Promise<T | null> =>
  fetch(`${BASE}art/${file}`)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

/** Carga los manifiestos (las imágenes se piden recién cuando aparece cada cosa). */
export function loadArt(): Promise<void> {
  loading ??= Promise.all([getJson<Manifest>('units.json'), getJson<BuildingArt>('buildings.json'), getJson<Manifest>('experimental/units.json')]).then(([m, b, x]) => {
    if (m?.v === 1) manifest = m;
    if (x?.v === 1 && m?.v === 1) experimental = x;
    if (b?.v === 3) buildingArt = b;
  });
  return loading;
}

/** Imagen de un archivo de arte, o null si aún no cargó (y la pide). */
function artImage(file: string): HTMLImageElement | null {
  if (ready.has(file)) return images.get(file)!;
  if (!images.has(file)) {
    const img = new Image();
    img.decoding = 'async';
    images.set(file, img);
    img.onload = () => {
      ready.add(file);
      if (img.width * img.height > BIG_SHEET_PX) bigFiles.add(file);
      artVersion++;
    };
    img.onerror = () => images.set(file, null);
    img.src = `${BASE}art/${file}`;
  }
  return null;
}

export interface BuildingSprite {
  img: HTMLImageElement;
  /** Zonas con el color del jugador, ya teñidas (si la imagen las tiene y cargaron). */
  tint?: HTMLCanvasElement | null;
  /** Rectángulo de dibujo en px del mundo. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** true = la imagen es más chica que la base del edificio (se dibuja un patio alrededor). */
  yard: boolean;
}

/**
 * Imagen para un edificio terminado (según el pueblo de su dueño), ya ubicada: su base
 * queda centrada sobre la base del edificio. null = no tiene (o no cargó): se usan formas.
 */
export function buildingSprite(b: BuildingView, faction: FactionId, cx: number, cy: number, era = 1, color?: string): BuildingSprite | null {
  if (!buildingArt) return null;
  const eras = buildingArt.styles[faction];
  const style = eras?.[Math.max(0, Math.min(eras.length - 1, era - 1))];
  const m = buildingArt.map;
  const list = m[`${faction}@${era}/${b.type}`] ?? m[`${faction}/${b.type}`] ?? m[`${style}/${b.type}`] ?? m[`*/${b.type}`];
  if (!list) return null;
  let id = list[b.id % list.length];
  if (b.type === 'farm') {
    const full = BUILDING_DEFS.farm.field!.amount;
    if ((b.stock ?? full) >= full * 0.4 && buildingArt.sprites['farm-ripe']) id = 'farm-ripe';
  }
  const sp = buildingArt.sprites[id];
  if (!sp) return null;
  const size = BUILDING_DEFS[b.type].size;
  return placeSprite(sp, cx, cy, Math.min(1, size / sp.tiles), color, sp.tiles < size);
}

/** Imagen ubicada con su base centrada en (cx, cy), escala k y color de equipo. */
function placeSprite(sp: SpriteDef, cx: number, cy: number, k: number, color?: string, yard = false): BuildingSprite | null {
  const img = artImage(sp.file);
  if (!img) return null;
  const ax = sp.ax ?? sp.w / 2, ay = sp.ay ?? sp.h - sp.tiles * 16;
  let tint: HTMLCanvasElement | null = null;
  if (sp.mask && color) {
    const mask = artImage(sp.mask);
    if (mask) tint = tintImage(sp.mask, mask, color);
  }
  return { img, tint, x: cx - ax * k, y: cy - ay * k, w: sp.w * k, h: sp.h * k, yard };
}

/** Imagen gris teñida con un color (se guarda por imagen y color). */
function tintImage(key: string, img: HTMLImageElement, color: string): HTMLCanvasElement {
  const k = `${key}|${color}`;
  let c = tints.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    tints.set(k, c);
  }
  return c;
}

/** Pieza de muralla o puerta de un pueblo, con su base en el centro de la casilla (cx, cy). */
export function wallPiece(faction: FactionId, piece: keyof WallPieces, cx: number, cy: number, color?: string): BuildingSprite | null {
  const id = buildingArt?.walls?.[faction]?.[piece];
  const sp = id ? buildingArt!.sprites[id] : undefined;
  return sp ? placeSprite(sp, cx, cy, 1, color) : null;
}

/** Solo para el visor de animaciones (preview.html): hoja forzada por 'pueblo/tipo'. */
const forced = new Map<string, string>();
export function forceSheet(faction: FactionId, type: UnitType, id: string | null): void {
  if (id) forced.set(`${faction}/${type}`, id);
  else forced.delete(`${faction}/${type}`);
}

function sheetId(faction: FactionId, type: UnitType): string | undefined {
  const f = forced.get(`${faction}/${type}`);
  if (f && manifest?.sheets[f]) return f;
  // Primero la experimental, pero solo si su imagen ya está lista (si falla o tarda, la normal).
  const ex = experimental?.units[`${faction}/${type}`] ?? experimental?.units[`*/${type}`];
  if (ex && experimental!.sheets[ex] && artImage(experimental!.sheets[ex].file)) return ex;
  return manifest?.units[`${faction}/${type}`] ?? manifest?.units[`*/${type}`];
}

/** Datos de una hoja (experimental o normal). */
const sheetMeta = (id: string): SheetMeta => experimental?.sheets[id] ?? manifest!.sheets[id];

/** Imagen lista de una hoja, o null (y la pide si aún no se pidió). */
function imageOf(_id: string, sheet: SheetMeta): HTMLImageElement | null {
  return artImage(sheet.file);
}

/** Recortes de equipo teñidos con el color del jugador (uno por hoja y color). */
function tintOf(id: string, img: HTMLImageElement, sheet: SheetMeta, color: string): HTMLCanvasElement {
  const key = `${id}|${color}`;
  let c = tints.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = Math.max(1, img.height - sheet.maskY);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, sheet.maskY, c.width, c.height, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, sheet.maskY, c.width, c.height, 0, 0, c.width, c.height);
    tints.set(key, c);
  }
  return c;
}

/** Fila de la hoja según hacia dónde mira la unidad (ángulo en pantalla, y hacia abajo). */
function dirRow(o: SheetMeta['o'], dirs: number, angle: number): number {
  if (dirs === 1) return 0;
  if (o === 'oga8' && dirs === 8) {
    const k = Math.round(angle / (Math.PI / 4));
    return (((2 - k) % 8) + 8) % 8;
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  if (Math.abs(c) >= Math.abs(s)) return c < 0 ? 1 : 3;
  return s < 0 ? 0 : 2;
}

/** Última dirección dibujada de cada unidad (para no parpadear en las diagonales). */
const lastRow = new Map<number, number>();

/** Fila de la hoja para esta unidad, con margen respecto de la que ya tenía. */
function rowOf(u: UnitView, sheet: SheetMeta, dirs: number, face: number): number {
  if (dirs <= 1) return 0;
  if (lastRow.size > 5000) lastRow.clear();
  const key = u.id * 16 + dirs;
  const row = stickyRow(lastRow.get(key), face, dirs === 8 ? 0.14 : 0.22, (a) => dirRow(sheet.o, dirs, a));
  lastRow.set(key, row);
  return row;
}

/** Qué animación corresponde a lo que está haciendo la unidad. */
function animName(u: UnitView): string {
  if (u.walk === 1) return 'walk';
  switch (u.state) {
    case 'attacking':
      return u.type === 'worker' ? 'chop' : 'attack';
    case 'gathering':
      return u.task === 'wood' ? 'chop' : u.task === 'food' ? 'farm' : 'mine';
    case 'building':
      return 'build';
    default:
      return 'idle';
  }
}

export interface SpriteInfo {
  /** Altura de la figura sobre los pies (px del mundo), para barras y estrellas. */
  top: number;
  /** false = la hoja no trae color de equipo (asedio): hay que marcarla aparte. */
  team: boolean;
}

/**
 * Dibuja la unidad con su hoja de sprites. Devuelve false si no hay hoja (o no cargó)
 * para que se use el dibujo de formas.
 */
export function drawSpriteUnit(
  ctx: CanvasRenderingContext2D,
  u: UnitView,
  x: number,
  y: number,
  color: string,
  now: number,
  faction: FactionId,
  face: number,
  shadow: number,
): SpriteInfo | null {
  const id = sheetId(faction, u.type);
  if (!id) return null;
  const sheet = sheetMeta(id);
  const img = sourceFor(ctx, sheet, now);
  if (!img && !halves.get(sheet.file)) return null;
  const name = animName(u);
  const a = sheet.anims[name] ?? sheet.anims.idle;
  const t = now / 1000 + u.id * 0.37;
  // Caminar: las piernas al ritmo de la velocidad real (al paso, más lentas; al galope, más rápidas).
  const pace = name === 'walk' && u.sp ? Math.min(1.5, Math.max(0.45, u.sp / 1.4)) : 1;
  // Ataque: sincronizado con el golpe real del servidor (preparación, impacto, recuperación).
  const f =
    name === 'attack' && u.cool
      ? attackFrame(now, u.ha, { n: a.n, fps: a.fps, hit: a.hit ?? defaultHit(a.n), cooldownMs: u.cool }).frame
      : Math.floor(t * a.fps * pace) % a.n;
  drawShadow(ctx, x, y, shadow);
  const row = rowOf(u, sheet, a.d, face);
  // Transición: al cambiar de animación (caminar → quieto → atacar), el cuadro anterior se
  // desvanece en unos 120 ms en vez de cortar de golpe.
  const tr = blendOf(u.id, name, row, f, now);
  if (tr && sheet.anims[tr.name]) {
    const pa = sheet.anims[tr.name];
    ctx.globalAlpha = tr.alpha;
    drawFrame(ctx, id, sheet, img, pa, Math.min(tr.row, pa.d - 1), Math.min(tr.frame, pa.n - 1), x, y, color);
    ctx.globalAlpha = 1 - tr.alpha * 0.6;
  }
  const info = drawFrame(ctx, id, sheet, img, a, row, f, x, y, color);
  ctx.globalAlpha = 1;
  // Golpe recibido: un destello claro breve sobre la figura.
  if (u.hf) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = u.hf * 0.45;
    drawFrame(ctx, id, sheet, img, a, row, f, x, y, color);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  return info;
}

/** Duración de la transición entre animaciones (ms). */
const BLEND_MS = 120;
/** Última animación dibujada de cada unidad (para la transición). */
const lastAnim = new Map<number, { name: string; row: number; frame: number; since: number; prev?: { name: string; row: number; frame: number } }>();
function blendOf(id: number, name: string, row: number, frame: number, now: number): { name: string; row: number; frame: number; alpha: number } | null {
  if (lastAnim.size > 5000) lastAnim.clear();
  const s = lastAnim.get(id);
  if (!s) {
    lastAnim.set(id, { name, row, frame, since: -Infinity });
    return null;
  }
  if (s.name !== name) {
    s.prev = { name: s.name, row: s.row, frame: s.frame };
    s.since = now;
    s.name = name;
  }
  s.row = row;
  s.frame = frame;
  const k = (now - s.since) / BLEND_MS;
  if (!s.prev || k >= 1) return null;
  return { ...s.prev, alpha: 1 - k };
}

/** Sombra difusa de una figura (degradado ya pintado: barato y suave). */
let shadowImg: HTMLCanvasElement | null = null;
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, half: number): void {
  if (!shadowImg) {
    shadowImg = document.createElement('canvas');
    shadowImg.width = 64;
    shadowImg.height = 32;
    const g = shadowImg.getContext('2d')!;
    const grad = g.createRadialGradient(32, 16, 2, 32, 16, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.5, 0, 8);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  // La luz viene de arriba a la izquierda: la sombra cae un poco a la derecha y hacia abajo.
  const w = half * 2.3, h = half * 1.15;
  ctx.drawImage(shadowImg, x - w / 2 + half * 0.28, y - h / 2 + half * 0.08, w, h);
}

/** Cuadro de la animación de morir (para los caídos), o false si la unidad no tiene. */
export function drawDyingUnit(
  ctx: CanvasRenderingContext2D,
  u: UnitView,
  x: number,
  y: number,
  color: string,
  faction: FactionId,
  face: number,
  age: number,
): boolean {
  const id = sheetId(faction, u.type);
  if (!id) return false;
  const sheet = sheetMeta(id);
  const a = sheet.anims.die;
  const img = a ? sourceFor(ctx, sheet, performance.now()) : null;
  if (!a || (!img && !halves.get(sheet.file))) return false;
  const f = Math.min(a.n - 1, Math.floor(age * a.fps));
  drawFrame(ctx, id, sheet, img, a, dirRow(sheet.o, a.d, face), f, x, y, color);
  return true;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  id: string,
  sheet: SheetMeta,
  img: HTMLImageElement | null,
  a: AnimMeta,
  d: number,
  f: number,
  x: number,
  y: number,
  color: string,
): SpriteInfo {
  const s = sheet.scale;
  const dx = x - a.ax * s, dy = y - a.ay * s;
  const info = { top: (sheet.anims.idle ?? a).ay * s, team: a.m.length > 0 };
  // Hojas grandes (soldados 3D) dibujadas a la mitad de su tamaño o menos: copia a media resolución
  // (más barata de muestrear y más liviana para la GPU). Si la original fue liberada, también se usa
  // la media mientras vuelve a llegar.
  const big = bigFiles.has(sheet.file);
  const small = big && lodEnabled && s * zoomOf(ctx) <= 0.5;
  const half = big ? (img ? halfOf(sheet.file, img) : (halves.get(sheet.file) ?? null)) : null;
  const src = (small && half) || img || half;
  if (!src) return info;
  const q = src === half ? 0.5 : 1;
  ctx.drawImage(src, f * a.w * q, (a.y + d * a.h) * q, a.w * q, a.h * q, dx, dy, a.w * s, a.h * s);
  if (a.m.length) {
    const k = (d * a.n + f) * 6;
    const mw = a.m[k + 2], mh = a.m[k + 3];
    if (mw && mh) {
      const tkey = `${id}|${color}|tint`;
      const tint = img ? tintOf(id, img, sheet, color) : null;
      const ht = big ? (tint ? halfOf(tkey, tint) : (halves.get(tkey) ?? null)) : null;
      const t2 = (src === half && ht) || tint || ht;
      if (t2) {
        const r2 = t2 === ht ? 0.5 : 1;
        ctx.drawImage(t2, a.m[k] * r2, (a.m[k + 1] - sheet.maskY) * r2, mw * r2, mh * r2, dx + a.m[k + 4] * s, dy + a.m[k + 5] * s, mw * s, mh * s);
      }
    }
  }
  return info;
}

/** Escala de pantalla del lienzo (zoom × densidad de píxeles). */
const zoomOf = (ctx: CanvasRenderingContext2D) => {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b);
};

/** Hojas grandes ya cargadas alguna vez, y cuándo se necesitó por última vez su resolución original. */
const bigFiles = new Set<string>();
const fullNeeded = new Map<string, number>();
/** Tras cuántos ms sin necesitar la original (con la media lista) se la libera. */
const EVICT_AFTER_MS = 15_000;
let lastEvict = 0;

/**
 * Imagen original de una hoja si hace falta (o ya está), o null. No la pide si alcanza con la
 * media resolución (así una hoja liberada no se vuelve a descargar mientras no se acerque el zoom).
 */
function sourceFor(ctx: CanvasRenderingContext2D, sheet: SheetMeta, now: number): HTMLImageElement | null {
  if (now - lastEvict > 5000) evictIdle(now);
  const file = sheet.file;
  const big = bigFiles.has(file);
  const needFull = !big || !lodEnabled || sheet.scale * zoomOf(ctx) > 0.5 || !halves.get(file);
  if (needFull) {
    fullNeeded.set(file, now);
    return artImage(file);
  }
  return ready.has(file) ? images.get(file)! : null;
}

/** Libera las originales que hace rato no hacen falta (la media resolución y su máscara ya están). */
function evictIdle(now: number): void {
  lastEvict = now;
  for (const file of bigFiles) {
    if (!ready.has(file) || !halves.get(file) || now - (fullNeeded.get(file) ?? 0) < EVICT_AFTER_MS) continue;
    // Las máscaras de equipo de esta hoja: se liberan las que ya tienen su copia a media resolución.
    for (const key of [...tints.keys()]) {
      const sid = key.slice(0, key.indexOf('|'));
      const sh = experimental?.sheets[sid] ?? manifest?.sheets[sid];
      if (sh?.file !== file) continue;
      if (halves.get(`${key}|tint`)) tints.delete(key);
      else return; // falta alguna máscara reducida: todavía no se libera esta hoja
    }
    images.delete(file);
    ready.delete(file);
  }
}

/** Desde cuántos píxeles una hoja vale la pena tener copia a media resolución. */
const BIG_SHEET_PX = 2_000_000;
/** Copias a media resolución activas (el visor de animaciones las apaga para comparar). */
let lodEnabled = true;
export function setLod(on: boolean): void {
  lodEnabled = on;
}
/** Copias a media resolución (se preparan fuera del hilo principal); null = en preparación o no disponible. */
const halves = new Map<string, ImageBitmap | null>();
function halfOf(key: string, src: HTMLImageElement | HTMLCanvasElement): ImageBitmap | null {
  const have = halves.get(key);
  if (have !== undefined) return have;
  halves.set(key, null);
  if (typeof createImageBitmap === 'function')
    createImageBitmap(src, { resizeWidth: Math.max(1, Math.round(src.width / 2)), resizeHeight: Math.max(1, Math.round(src.height / 2)), resizeQuality: 'high' })
      .then((b) => {
        halves.set(key, b);
        artVersion++;
      })
      .catch(() => {});
  return null;
}

/** Cantidad de especies de árboles con imagen. */
export function treeSpecies(): number {
  return buildingArt?.trees.length ?? 0;
}

/**
 * Imagen de un árbol (especie `species`, etapa 0 = brote … 4 = adulto) con la base de su
 * casilla en (cx, cy+16) y escala `k`. null = no hay o no cargó.
 */
export function treeSprite(species: number, stage: number, cx: number, cy: number, k = 1): BuildingSprite | null {
  const id = buildingArt?.trees[species % buildingArt.trees.length]?.[Math.max(0, Math.min(4, stage))];
  const sp = id ? buildingArt!.sprites[id] : undefined;
  const img = sp ? artImage(sp.file) : null;
  if (!sp || !img) return null;
  const w = sp.w * k, h = sp.h * k;
  return { img, x: cx - w / 2, y: cy + 16 * k - h, w, h, yard: false };
}

/** Retratos ya hechos (URL de la imagen), por hoja y color; null = en preparación. */
const portraits = new Map<string, string | null>();

/**
 * Retrato de una unidad para la interfaz (botones, selección, cola): medio cuerpo para
 * la infantería, de perfil para jinetes y máquinas, con el color del jugador.
 * Devuelve la URL, o null si aún no está (se prepara solo y aparece en el próximo dibujo).
 */
export function unitPortrait(faction: FactionId, type: UnitType, color: string, size = 48): string | null {
  const id = sheetId(faction, type);
  if (!id) return null;
  const key = `${id}|${color}|${size}`;
  if (portraits.has(key)) return portraits.get(key)!;
  const sheet = sheetMeta(id);
  const img = imageOf(id, sheet);
  const a = sheet.anims.idle;
  if (!img || !a) return null;
  portraits.set(key, null);
  // Cuadro completo con el color de equipo.
  const wide = a.w > a.h * 0.9; // jinete o máquina: mejor de costado
  const d = a.d === 1 ? 0 : sheet.o === 'oga8' ? 1 : wide ? 3 : 2;
  const frame = document.createElement('canvas');
  frame.width = a.w;
  frame.height = a.h;
  const g = frame.getContext('2d')!;
  g.drawImage(img, 0, a.y + d * a.h, a.w, a.h, 0, 0, a.w, a.h);
  const k = d * a.n * 6;
  if (a.m.length && a.m[k + 2]) {
    const tint = tintOf(id, img, sheet, color);
    g.drawImage(tint, a.m[k], a.m[k + 1] - sheet.maskY, a.m[k + 2], a.m[k + 3], a.m[k + 4], a.m[k + 5], a.m[k + 2], a.m[k + 3]);
  }
  // Recorte cuadrado: medio cuerpo (a pie) o la figura entera (jinetes y máquinas).
  const side = wide ? Math.max(a.w, a.h) : Math.round(a.ay * 0.72);
  const sx = wide ? (a.w - side) / 2 : a.ax - side / 2;
  const sy = wide ? (a.h - side) / 2 : 0;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = !wide;
  o.drawImage(frame, sx, sy, side, side, 0, 0, size, size);
  out.toBlob((blob) => {
    portraits.set(key, blob ? URL.createObjectURL(blob) : null);
    artVersion++;
  });
  return null;
}

/**
 * Precarga las hojas de las unidades de un pueblo (al entrar a la partida), de a una cada tanto
 * para no competir con el resto de la carga: así la primera tropa ya aparece con su dibujo.
 */
export function preloadFaction(faction: FactionId): void {
  void loadArt().then(() => {
    if (!manifest) return;
    const files = new Set<string>();
    for (const [key, id] of Object.entries(manifest.units)) {
      if (!key.startsWith(`${faction}/`) && !key.startsWith('*/')) continue;
      const sheet = manifest.sheets[id];
      if (sheet) files.add(sheet.file);
    }
    let i = 0;
    for (const file of files) setTimeout(() => artImage(file), 150 * i++);
  });
}

/** ¿Hay hoja para esta unidad? (para mostrar créditos o decidir sombras). */
export function hasSprite(faction: FactionId, type: UnitType): boolean {
  return !!sheetId(faction, type);
}

/** Altura (px del mundo) de la figura quieta, si tiene hoja. */
export function spriteTop(faction: FactionId, type: UnitType): number | null {
  const id = sheetId(faction, type);
  if (!id) return null;
  const sheet = sheetMeta(id);
  const a = sheet.anims.idle;
  return a ? a.ay * sheet.scale : null;
}
