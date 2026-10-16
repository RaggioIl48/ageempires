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
  /** Esquina del bloque (x: columna, si la hoja tiene las animaciones lado a lado; y: fila);
   *  w×h = tamaño de cada cuadro; n = cuadros; d = direcciones. */
  x?: number;
  /** Sin `r`: fila del bloque. Con `r` (atlas recortado) no se usa. */
  y?: number;
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
  /** Zancada: casillas que avanza el cuerpo en un ciclo (tools/art/stride.mjs). */
  st?: number;
  /** Atlas recortado (tools/art/trim.mjs): 6 números por cuadro [x, y, w, h, dx, dy] (dx, dy dentro de la celda). */
  r?: number[];
  /** Recortes de color de equipo: 6 números por cuadro [x, y, w, h, dx, dy]. */
  m: number[];
}

interface SheetMeta {
  file: string;
  /** Copia liviana (media resolución): la que se usa a tamaño normal (ver tools/art/lo.mjs). */
  lo?: string;
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
/**
 * Imagen ya decodificada, lista para dibujar. Se guarda como ImageBitmap: con imágenes comunes
 * (<img>) el navegador tiene un tope de memoria de imágenes decodificadas (~400–500 MB) y al
 * pasarlo vuelve a decodificar y subir a la GPU en CADA cuadro. Medido en este equipo: 300 dibujos
 * desde 75 hojas = 3,7 s por cuadro (el juego "se congela"); con ImageBitmap, 22 ms con 100 hojas.
 */
export type ArtImage = HTMLImageElement | ImageBitmap;
/** Imagen de cada hoja; null = falló (se usa el dibujo de formas). */
const images = new Map<string, ArtImage | null>();
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
function artImage(file: string): ArtImage | null {
  if (ready.has(file)) return images.get(file)!;
  if (!images.has(file)) {
    const img = new Image();
    images.set(file, img);
    const done = (out: ArtImage) => {
      if (images.get(file) !== img) {
        if (out instanceof ImageBitmap) out.close(); // se liberó mientras cargaba
        return;
      }
      images.set(file, out);
      ready.add(file);
      artVersion++;
      wake(file);
    };
    img.onload = () => {
      // Decodificar fuera del hilo del juego (sin tirón al aparecer una unidad nueva).
      if (typeof createImageBitmap === 'function') createImageBitmap(img).then(done, () => done(img));
      else done(img);
    };
    img.onerror = () => {
      images.set(file, null);
      wake(file);
    };
    img.src = `${BASE}art/${file}`;
  }
  return null;
}

/** Promesa que se cumple cuando la imagen está lista (o falló): para la pantalla de carga. */
const waiters = new Map<string, (() => void)[]>();
function whenLoaded(file: string): Promise<void> {
  if (ready.has(file) || images.get(file) === null) return Promise.resolve();
  artImage(file);
  return new Promise((done) => waiters.set(file, [...(waiters.get(file) ?? []), done]));
}
function wake(file: string): void {
  for (const done of waiters.get(file) ?? []) done();
  waiters.delete(file);
}

/** Libera una imagen (y su memoria de video, si es un ImageBitmap). */
function dropImage(file: string): void {
  const img = images.get(file);
  if (img instanceof ImageBitmap) img.close();
  images.delete(file);
  ready.delete(file);
}

export interface BuildingSprite {
  img: ArtImage;
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
function tintImage(key: string, img: ArtImage, color: string): HTMLCanvasElement {
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
function imageOf(_id: string, sheet: SheetMeta): ArtImage | null {
  return artImage(sheet.file);
}

/** Recortes de equipo teñidos con el color del jugador (uno por hoja y color). */
/**
 * Cuánto tiempo por cuadro se puede gastar preparando máscaras de equipo nuevas. Al empezar una
 * batalla aparecen de golpe decenas de tipos × colores (medido: 600 ms seguidos); así se reparten
 * en varios cuadros y, mientras tanto, la unidad se dibuja sin su color un instante.
 */
const TINT_BUDGET_MS = 4;
let tintWindow = 0, tintSpent = 0;

/**
 * Las máscaras de color se guardan a media resolución de la hoja que tiñen: son manchas de tela de
 * un solo color (no se nota) y cada una es una textura de video. Con 74 tipos × 8 colores ocupaban
 * ~1,8 GB y acercaban el juego al límite de la tarjeta gráfica (tirones otra vez); así, la cuarta parte.
 */
export const TINT_SCALE = 0.5;

function tintOf(id: string, img: ArtImage, sheet: SheetMeta, color: string, q = 1, force = false): HTMLCanvasElement | null {
  const key = `${id}|${color}|${q}`;
  let c = tints.get(key);
  if (!c) {
    const t0 = performance.now();
    if (t0 - tintWindow > 12) {
      tintWindow = t0;
      tintSpent = 0;
    }
    if (!force && tintSpent >= TINT_BUDGET_MS) return null;
    const top = Math.floor(sheet.maskY * q);
    const w = img.width, h = Math.max(1, img.height - top);
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * TINT_SCALE));
    c.height = Math.max(1, Math.ceil(h * TINT_SCALE));
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, top, w, h, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, top, w, h, 0, 0, c.width, c.height);
    tints.set(key, c);
    tintSpent += performance.now() - t0;
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
/**
 * Velocidades (casillas/s) para pasar del trote al galope y volver. Con un solo umbral, un jinete
 * que andaba justo en ese valor (frenando, apretado en formación) cambiaba de paso varias veces
 * por segundo; con dos, se queda en el paso que traía hasta que la diferencia es clara.
 */
const GALLOP_FROM = 2.0;
const TROT_BELOW = 1.65;
/** Infantería: a la carrera desde 1,0 casillas/s (en modo "caminar" van a ~0,85) y vuelve al paso por debajo de 0,9. */
const RUN_FROM = 1.0;
const WALK_BELOW = 0.9;
const galloping = new Set<number>();

function animName(u: UnitView, sheet?: SheetMeta): string {
  // Jinetes: trote al marchar, galope al correr o cargar.
  if (u.walk === 1) {
    if (!sheet?.anims.run) return 'walk';
    // Carga (Total War): atacando en movimiento, el jinete golpea al galope y atraviesa la línea.
    if (u.state === 'attacking' && sheet.anims.charge) {
      galloping.add(u.id);
      return 'charge';
    }
    const sp = u.sp ?? 0;
    const rider = !!sheet.anims.charge;
    const [up, down] = rider ? [GALLOP_FROM, TROT_BELOW] : [RUN_FROM, WALK_BELOW];
    if (galloping.has(u.id) ? sp < down : sp < up) {
      galloping.delete(u.id);
      return 'walk';
    }
    if (galloping.size > 5000) galloping.clear();
    galloping.add(u.id);
    return 'run';
  }
  galloping.delete(u.id);
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
  const img = pick(ctx, sheet, now);
  if (!img) return null;
  const name = animName(u, sheet);
  const a = sheet.anims[name] ?? sheet.anims.idle;
  const t = now / 1000 + u.id * 0.37;
  // Caminar: las piernas al ritmo de la velocidad real (al paso, más lentas; al galope, más rápidas).
  // El trote de un caballo se calcula para ~1,5 casillas/s y el galope para ~2,5.
  const rider = !!sheet.anims.charge;
  const base = rider ? (name === 'run' || name === 'charge' ? 2.5 : 1.5) : 1.4;
  const pace = (name === 'walk' || name === 'run') && u.sp ? Math.min(1.4, Math.max(0.55, u.sp / base)) : 1;
  // Ataque: sincronizado con el golpe real del servidor (preparación, impacto, recuperación).
  // Con la zancada medida: los pies (o cascos) apoyados quedan quietos sobre el suelo. Sin ella, el
  // ritmo de antes (proporcional a la velocidad). Acotado por si una medición quedó rara.
  const marching = (name === 'walk' || name === 'run' || name === 'charge') && u.sp;
  // La carga va sobre el galope: misma zancada.
  const stride = a.st ?? (name === 'charge' ? sheet.anims.run?.st : undefined);
  const fps = marching && stride ? Math.min(a.fps * 3, Math.max(a.fps * 0.5, (u.sp! / stride) * a.n)) : a.fps * pace;
  const f =
    name === 'attack' && u.cool
      ? attackFrame(now, u.ha, { n: a.n, fps: a.fps, hit: a.hit ?? defaultHit(a.n), cooldownMs: u.cool }).frame
      : Math.floor(t * fps) % a.n;
  if (sheet.anims.run) drawLongShadow(ctx, x, y, face, shadow);
  else drawShadow(ctx, x, y, shadow);
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

/**
 * Sombra de un jinete: alargada en el sentido en que mira el caballo (sobre el suelo, aplastada por
 * la perspectiva). La sombra redonda de un soldado a pie hacía que el caballo pareciera flotar.
 */
export function drawLongShadow(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, half: number): void {
  drawShadow(ctx, x, y, half); // la base, bajo las patas
  ctx.save();
  ctx.translate(x + half * 0.28, y + half * 0.1);
  ctx.scale(1, 0.5);
  ctx.rotate(face);
  ctx.globalAlpha *= 0.85;
  const w = half * 4.6, h = half * 1.5;
  ctx.drawImage(shadowCanvas(), -w / 2, -h / 2, w, h);
  ctx.restore();
}
function shadowCanvas(): HTMLCanvasElement {
  if (!shadowImg) drawShadow(document.createElement('canvas').getContext('2d')!, 0, 0, 1);
  return shadowImg!;
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
  const img = a ? pick(ctx, sheet, performance.now()) : null;
  if (!a || !img) return false;
  const f = Math.min(a.n - 1, Math.floor(age * a.fps));
  drawFrame(ctx, id, sheet, img, a, dirRow(sheet.o, a.d, face), f, x, y, color);
  return true;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  id: string,
  sheet: SheetMeta,
  pk: Picked,
  a: AnimMeta,
  d: number,
  f: number,
  x: number,
  y: number,
  color: string,
): SpriteInfo {
  const s = sheet.scale;
  const dx = x - a.ax * s, dy = y - a.ay * s;
  const { img, q } = pk;
  if (a.r) {
    // Atlas recortado: cada cuadro guarda su rectángulo y dónde va dentro de la celda.
    const k = (d * a.n + f) * 6;
    const w = a.r[k + 2], h = a.r[k + 3];
    if (w && h) ctx.drawImage(img, a.r[k] * q, a.r[k + 1] * q, w * q, h * q, dx + a.r[k + 4] * s, dy + a.r[k + 5] * s, w * s, h * s);
  } else ctx.drawImage(img, ((a.x ?? 0) + f * a.w) * q, ((a.y ?? 0) + d * a.h) * q, a.w * q, a.h * q, dx, dy, a.w * s, a.h * s);
  if (a.m.length) {
    const k = (d * a.n + f) * 6;
    const mw = a.m[k + 2], mh = a.m[k + 3];
    if (mw && mh) {
      const tint = tintOf(id, img, sheet, color, q);
      const top = Math.floor(sheet.maskY * q);
      const t = TINT_SCALE;
      if (tint) ctx.drawImage(tint, a.m[k] * q * t, (a.m[k + 1] * q - top) * t, mw * q * t, mh * q * t, dx + a.m[k + 4] * s, dy + a.m[k + 5] * s, mw * s, mh * s);
    }
  }
  return { top: (sheet.anims.idle ?? a).ay * s, team: a.m.length > 0 };
}

/** Imagen elegida para dibujar una hoja y su escala respecto de la original (0,5 = la liviana). */
interface Picked {
  img: ArtImage;
  q: number;
}

/** Escala de pantalla del lienzo (zoom × densidad de píxeles). */
const zoomOf = (ctx: CanvasRenderingContext2D) => {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b);
};

/** Hasta qué escala (px de pantalla por px de la hoja original) alcanza la copia liviana. */
const LO_UNTIL = 1.0;
/** Copias livianas activas (el visor de animaciones las apaga para comparar). */
let lodEnabled = true;
export function setLod(on: boolean): void {
  lodEnabled = on;
}
/** Cuándo se necesitó por última vez la resolución original de cada hoja. */
const fullNeeded = new Map<string, number>();
/** Tras cuántos ms sin necesitar la original (con la liviana lista) se la libera. */
const EVICT_AFTER_MS = 60_000;
/**
 * Hojas completas ya en uso (con mucho zoom). Al acercar la cámara a un ejército, varias pasaban a
 * la vez de la liviana a la completa: cada una es una textura grande que la GPU recibe en ese cuadro
 * (y su máscara de color a tamaño completo). Se promueve una cada PROMOTE_MS; las demás siguen con la
 * liviana un instante, que a esa distancia casi no se nota.
 */
const promoted = new Set<string>();
const PROMOTE_MS = 400;
let lastPromote = 0;
let lastEvict = 0;

/**
 * Imagen para dibujar una hoja: la liviana a tamaño normal (1/4 de la memoria), la original solo
 * con mucho zoom. Mientras llega la que corresponde, se usa la otra si ya está.
 */
function pick(ctx: CanvasRenderingContext2D, sheet: SheetMeta, now: number): Picked | null {
  if (now - lastEvict > 5000) evictIdle(now);
  const full = (): ArtImage | null => (ready.has(sheet.file) ? images.get(sheet.file)! : null);
  if (sheet.lo && lodEnabled) {
    const lo = artImage(sheet.lo);
    if (sheet.scale * zoomOf(ctx) <= LO_UNTIL) {
      if (lo) return { img: lo, q: 0.5 };
      const f = full();
      return f ? { img: f, q: 1 } : null;
    }
    fullNeeded.set(sheet.file, now);
    const f = artImage(sheet.file);
    if (f && !promoted.has(sheet.file) && (now - lastPromote >= PROMOTE_MS || !lo)) {
      promoted.add(sheet.file);
      lastPromote = now;
    }
    if (f && promoted.has(sheet.file)) return { img: f, q: 1 };
    return lo ? { img: lo, q: 0.5 } : f ? { img: f, q: 1 } : null;
  }
  const f = artImage(sheet.file);
  return f ? { img: f, q: 1 } : null;
}

/** Libera las originales que hace rato no hacen falta (para eso está la liviana) y sus máscaras. */
function evictIdle(now: number): void {
  lastEvict = now;
  const sheets = { ...(manifest?.sheets ?? {}), ...(experimental?.sheets ?? {}) };
  for (const [id, sh] of Object.entries(sheets)) {
    if (!sh.lo || !ready.has(sh.file) || now - (fullNeeded.get(sh.file) ?? 0) < EVICT_AFTER_MS) continue;
    dropImage(sh.file);
    promoted.delete(sh.file);
    for (const key of [...tints.keys()]) if (key.startsWith(`${id}|`) && key.endsWith('|1')) tints.delete(key);
  }
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
  const q = sheet.lo ? 0.5 : 1;
  const img = artImage(sheet.lo ?? sheet.file);
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
  if (a.r) {
    const k = d * a.n * 6;
    if (a.r[k + 2] && a.r[k + 3]) g.drawImage(img, a.r[k] * q, a.r[k + 1] * q, a.r[k + 2] * q, a.r[k + 3] * q, a.r[k + 4], a.r[k + 5], a.r[k + 2], a.r[k + 3]);
  } else g.drawImage(img, (a.x ?? 0) * q, ((a.y ?? 0) + d * a.h) * q, a.w * q, a.h * q, 0, 0, a.w, a.h);
  const k = d * a.n * 6;
  if (a.m.length && a.m[k + 2]) {
    const tint = tintOf(id, img, sheet, color, q, true)!;
    const t = TINT_SCALE;
    g.drawImage(tint, a.m[k] * q * t, (a.m[k + 1] * q - Math.floor(sheet.maskY * q)) * t, a.m[k + 2] * q * t, a.m[k + 3] * q * t, a.m[k + 4], a.m[k + 5], a.m[k + 2], a.m[k + 3]);
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
/**
 * Pantalla de carga: deja listo lo que va a usar ESTA partida antes de empezar a dibujarla, para que
 * no haya tirones cuando aparece por primera vez cada tipo de soldado (bajar la hoja, decodificarla y
 * teñir su color de equipo). Solo lo necesario: las hojas livianas de los pueblos que juegan (la
 * completa se sigue pidiendo al acercar mucho el zoom), los edificios y árboles, y la máscara de
 * cada pueblo con el color de cada jugador que lo usa. Todo el arte junto serían ~400 MB de video.
 */
export async function preloadGame(
  players: { faction: FactionId; color: string }[],
  onProgress: (done: number, total: number) => void,
  warm?: CanvasRenderingContext2D,
): Promise<void> {
  await loadArt();
  if (!manifest) return;
  const m = manifest;
  // Hojas de unidades de cada pueblo en juego (y las comunes '*/'), con los colores que las usan.
  const sheetColors = new Map<string, Set<string>>();
  for (const p of players)
    for (const [key, id] of Object.entries(m.units)) {
      if (!key.startsWith(`${p.faction}/`) && !key.startsWith('*/')) continue;
      if (!m.sheets[id]) continue;
      if (!sheetColors.has(id)) sheetColors.set(id, new Set());
      sheetColors.get(id)!.add(p.color);
    }
  const files = new Set<string>();
  for (const id of sheetColors.keys()) files.add(m.sheets[id].lo ?? m.sheets[id].file);
  for (const sp of Object.values(buildingArt?.sprites ?? {})) files.add(sp.file);
  const tints: [string, string][] = [];
  for (const [id, colors] of sheetColors) if (Object.values(m.sheets[id].anims).some((a) => a.m.length)) for (const c of colors) tints.push([id, c]);
  const total = files.size + tints.length;
  let done = 0;
  onProgress(0, total);
  // Imágenes: varias a la vez (el navegador reparte las descargas).
  await Promise.all([...files].map((f) => whenLoaded(f).then(() => onProgress(++done, total))));
  // Que la GPU ya tenga cada hoja: un dibujo de 1 px (bajo la pantalla de carga) la sube ahora y no
  // cuando aparece por primera vez ese soldado (por ejemplo, un ejército que sale de la niebla).
  if (warm)
    for (const f of files) {
      const img = images.get(f);
      if (img && ready.has(f)) warm.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    }
  // Máscaras de color: unas cuantas por cuadro, para que la barra de progreso siga moviéndose.
  for (let i = 0; i < tints.length; i++) {
    const [id, color] = tints[i];
    const sheet = m.sheets[id];
    const img = images.get(sheet.lo ?? sheet.file);
    if (img && ready.has(sheet.lo ?? sheet.file)) {
      const tint = tintOf(id, img, sheet, color, sheet.lo ? 0.5 : 1, true);
      if (warm && tint) warm.drawImage(tint, 0, 0, 1, 1, 0, 0, 1, 1);
    }
    onProgress(++done, total);
    if (i % 4 === 3) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}

/**
 * En la sala de espera: baja (sin decodificar) el arte del pueblo elegido y los edificios, para que la
 * pantalla de carga de la partida solo tenga que prepararlos. Queda en la caché del navegador (el
 * servidor la permite por un día). Una sola vez por pueblo; si cambia de pueblo, baja el nuevo.
 */
const prefetched = new Set<string>();
export function prefetchFaction(faction: FactionId): void {
  void loadArt().then(() => {
    if (!manifest) return;
    const files: string[] = [];
    for (const [key, id] of Object.entries(manifest.units)) {
      const sheet = manifest.sheets[id];
      if (sheet && (key.startsWith(`${faction}/`) || key.startsWith('*/'))) files.push(sheet.lo ?? sheet.file);
    }
    for (const sp of Object.values(buildingArt?.sprites ?? {})) files.push(sp.file);
    // De a una por vez: en el Wi-Fi del aula no compite con lo que necesitan los demás.
    let chain = Promise.resolve();
    for (const f of files) {
      if (prefetched.has(f) || ready.has(f)) continue;
      prefetched.add(f);
      chain = chain.then(() => fetch(`${BASE}art/${f}`).then((r) => r.blob()).then(() => undefined, () => undefined));
    }
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
