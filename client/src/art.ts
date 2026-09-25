// Unidades dibujadas con hojas de sprites de proyectos abiertos (ver tools/art y la
// pantalla de Créditos). Cada hoja trae varias animaciones (quieto, caminar, atacar,
// herramientas, morir) en 4 u 8 direcciones, y aparte los recortes con el color de
// equipo (túnicas, capas, escudos) que se tiñen con el color de cada jugador.
//
// Si una unidad no tiene hoja, o la imagen aún no llegó, se dibuja con las formas
// de sprites.ts: el juego nunca queda sin dibujo.

import type { FactionId, UnitType } from '../../shared/data.ts';
import type { UnitView } from '../../shared/protocol.ts';

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

const BASE = import.meta.env.BASE_URL ?? '/';
let manifest: Manifest | null = null;
let loading: Promise<void> | null = null;
/** Imagen de cada hoja; null = falló (se usa el dibujo de formas). */
const images = new Map<string, HTMLImageElement | null>();
const ready = new Set<string>();
const tints = new Map<string, HTMLCanvasElement>();

/** Carga el manifiesto (las imágenes se piden recién cuando aparece cada unidad). */
export function loadArt(): Promise<void> {
  loading ??= fetch(`${BASE}art/units.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      if (m?.v === 1) manifest = m;
    })
    .catch(() => undefined);
  return loading;
}

function sheetId(faction: FactionId, type: UnitType): string | undefined {
  return manifest?.units[`${faction}/${type}`] ?? manifest?.units[`*/${type}`];
}

/** Imagen lista de una hoja, o null (y la pide si aún no se pidió). */
function imageOf(id: string, sheet: SheetMeta): HTMLImageElement | null {
  if (ready.has(id)) return images.get(id)!;
  if (!images.has(id)) {
    const img = new Image();
    img.decoding = 'async';
    images.set(id, img);
    img.onload = () => ready.add(id);
    img.onerror = () => images.set(id, null);
    img.src = `${BASE}art/${sheet.file}`;
  }
  return null;
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
