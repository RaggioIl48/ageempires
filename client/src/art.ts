// Unidades dibujadas con hojas de sprites de proyectos abiertos (ver tools/art y la
// pantalla de Créditos). Cada hoja trae varias animaciones (quieto, caminar, atacar,
// herramientas, morir) en 4 u 8 direcciones, y aparte los recortes con el color de
// equipo (túnicas, capas, escudos) que se tiñen con el color de cada jugador.
//
// Si una unidad no tiene hoja, o la imagen aún no llegó, se dibuja con las formas
// de sprites.ts: el juego nunca queda sin dibujo.

import { BUILDING_DEFS, type FactionId, type UnitType } from '../../shared/data.ts';
import type { BuildingView, UnitView } from '../../shared/protocol.ts';

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
  loading ??= Promise.all([getJson<Manifest>('units.json'), getJson<BuildingArt>('buildings.json')]).then(([m, b]) => {
    if (m?.v === 1) manifest = m;
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

function sheetId(faction: FactionId, type: UnitType): string | undefined {
  return manifest?.units[`${faction}/${type}`] ?? manifest?.units[`*/${type}`];
}

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
  const sheet = manifest!.sheets[id];
  const img = imageOf(id, sheet);
  if (!img) return null;
  const a = sheet.anims[animName(u)] ?? sheet.anims.idle;
  const t = now / 1000 + u.id * 0.37;
  const f = Math.floor(t * a.fps) % a.n;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, shadow * 0.8, shadow * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  return drawFrame(ctx, id, sheet, img, a, dirRow(sheet.o, a.d, face), f, x, y, color);
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
  const sheet = manifest!.sheets[id];
  const a = sheet.anims.die;
  const img = a ? imageOf(id, sheet) : null;
  if (!a || !img) return false;
  const f = Math.min(a.n - 1, Math.floor(age * a.fps));
  drawFrame(ctx, id, sheet, img, a, dirRow(sheet.o, a.d, face), f, x, y, color);
  return true;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  id: string,
  sheet: SheetMeta,
  img: HTMLImageElement,
  a: AnimMeta,
  d: number,
  f: number,
  x: number,
  y: number,
  color: string,
): SpriteInfo {
  const s = sheet.scale;
  const dx = x - a.ax * s, dy = y - a.ay * s;
  ctx.drawImage(img, f * a.w, a.y + d * a.h, a.w, a.h, dx, dy, a.w * s, a.h * s);
  if (a.m.length) {
    const k = (d * a.n + f) * 6;
    const mw = a.m[k + 2], mh = a.m[k + 3];
    if (mw && mh) {
      const tint = tintOf(id, img, sheet, color);
      ctx.drawImage(tint, a.m[k], a.m[k + 1] - sheet.maskY, mw, mh, dx + a.m[k + 4] * s, dy + a.m[k + 5] * s, mw * s, mh * s);
    }
  }
  return { top: (sheet.anims.idle ?? a).ay * s, team: a.m.length > 0 };
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
export function unitPortrait(faction: FactionId, type: UnitType, color: string): string | null {
  const id = sheetId(faction, type);
  if (!id) return null;
  const key = `${id}|${color}`;
  if (portraits.has(key)) return portraits.get(key)!;
  const sheet = manifest!.sheets[id];
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
  out.width = out.height = 48;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = !wide;
  o.drawImage(frame, sx, sy, side, side, 0, 0, 48, 48);
  out.toBlob((blob) => {
    portraits.set(key, blob ? URL.createObjectURL(blob) : null);
    artVersion++;
  });
  return null;
}

/** ¿Hay hoja para esta unidad? (para mostrar créditos o decidir sombras). */
export function hasSprite(faction: FactionId, type: UnitType): boolean {
  return !!sheetId(faction, type);
}

/** Altura (px del mundo) de la figura quieta, si tiene hoja. */
export function spriteTop(faction: FactionId, type: UnitType): number | null {
  const id = sheetId(faction, type);
  if (!id) return null;
  const sheet = manifest!.sheets[id];
  const a = sheet.anims.idle;
  return a ? a.ay * sheet.scale : null;
}
