// Arte original hecho con formas simples: unidades, edificios y recursos.
// Todo se dibuja en "px del mundo" (la cámara ya está aplicada).

import { BUILDING_DEFS, type ResourceType } from '../../shared/data.ts';
import type { BuildingView, NodeView, UnitView } from '../../shared/protocol.ts';
import { worldToPx } from './view.ts';

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  food: '#d8434f',
  wood: '#8a5a2b',
  stone: '#a8a8a2',
  metal: '#7f9bb8',
};

export function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- Primitivas ----------

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | null,
  stroke: string | null = null,
  lw = 1,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function poly(ctx: CanvasRenderingContext2D, pts: number[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw = 1): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Oscurece (f<1) o aclara (f>1) un color #rrggbb. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function outlineFootprint(ctx: CanvasRenderingContext2D, tx: number, ty: number, s: number, color: string, lw = 1.5): void {
  const a = worldToPx(tx, ty), b = worldToPx(tx + s, ty), c = worldToPx(tx + s, ty + s), d = worldToPx(tx, ty + s);
  ctx.beginPath();
  ctx.moveTo(a.px, a.py);
  ctx.lineTo(b.px, b.py);
  ctx.lineTo(c.px, c.py);
  ctx.lineTo(d.px, d.py);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export function fillFootprint(ctx: CanvasRenderingContext2D, tx: number, ty: number, s: number, color: string): void {
  const a = worldToPx(tx, ty), b = worldToPx(tx + s, ty), c = worldToPx(tx + s, ty + s), d = worldToPx(tx, ty + s);
  poly(ctx, [a.px, a.py, b.px, b.py, c.px, c.py, d.px, d.py], color);
}

export function healthBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, w = 18): void {
  ctx.fillStyle = '#300';
  ctx.fillRect(x - w / 2, y, w, 3);
  ctx.fillStyle = frac > 0.5 ? '#4cd964' : frac > 0.25 ? '#ffcc00' : '#ff3b30';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 3);
}

// ---------- Terreno y recursos ----------

export function drawMountain(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const h = 22 + r * 18;
  const ax = x + (r - 0.5) * 10;
  poly(ctx, [x - 32, y, ax, y - h, x, y + 16], '#8d8577');
  poly(ctx, [ax, y - h, x + 32, y, x, y + 16], '#6b6459');
  if (r > 0.6) poly(ctx, [ax, y - h, ax - 7, y - h + 9, ax + 6, y - h + 8], '#eef2f5'); // nieve
}

export function drawNode(ctx: CanvasRenderingContext2D, n: NodeView, x: number, y: number): void {
  const r = hash(n.tx, n.ty);
  switch (n.type) {
    case 'tree':
      ellipse(ctx, x + 4, y + 1, 12, 5, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x - 2, y - 11, 4, 11);
      if (r < 0.45) {
        // Pino
        const s = 0.85 + r * 0.5;
        poly(ctx, [x, y - 44 * s, x - 13 * s, y - 20 * s, x + 13 * s, y - 20 * s], '#2f6b3a');
        poly(ctx, [x, y - 34 * s, x - 15 * s, y - 9, x + 15 * s, y - 9], '#28603a');
        poly(ctx, [x, y - 44 * s, x + 13 * s, y - 20 * s, x + 3, y - 22 * s], '#3c8048');
      } else {
        // Frondoso
        const s = 0.8 + (r - 0.45) * 0.6;
        ellipse(ctx, x, y - 22 * s, 13 * s, 12 * s, '#3a7a36');
        ellipse(ctx, x - 6 * s, y - 25 * s, 8 * s, 8 * s, '#468c40');
        ellipse(ctx, x + 5 * s, y - 28 * s, 7 * s, 6 * s, '#58a04d');
      }
      break;
    case 'berries':
      ellipse(ctx, x + 2, y + 1, 11, 4, 'rgba(0,0,0,0.2)');
      ellipse(ctx, x, y - 7, 10, 8, '#3f7c35');
      ellipse(ctx, x - 6, y - 4, 6, 5, '#4a8a3e');
      ellipse(ctx, x + 6, y - 5, 6, 5, '#468637');
      ctx.fillStyle = '#d23a48';
      for (let i = 0; i < 7; i++) {
        const a = hash(n.id, i) * Math.PI * 2, d = 3 + hash(i, n.id) * 6;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y - 7 + Math.sin(a) * d * 0.7, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'stone':
      ellipse(ctx, x + 2, y + 1, 13, 5, 'rgba(0,0,0,0.25)');
      rock(ctx, x - 5, y - 1, 9, 12, '#b3b3ad', '#85857f');
      rock(ctx, x + 6, y + 1, 7, 9, '#a6a6a0', '#7a7a74');
      break;
    case 'metal':
      ellipse(ctx, x + 2, y + 1, 13, 5, 'rgba(0,0,0,0.25)');
      rock(ctx, x - 4, y - 1, 9, 13, '#5f6776', '#434a56');
      rock(ctx, x + 7, y + 1, 7, 9, '#58606e', '#3d434e');
      ctx.fillStyle = '#d9913f'; // vetas de óxido
      ctx.fillRect(x - 7, y - 8, 3, 2);
      ctx.fillRect(x + 5, y - 4, 3, 2);
      ctx.fillStyle = '#dfe8f2'; // brillo metálico
      ctx.fillRect(x - 2, y - 11, 2, 2);
      ctx.fillRect(x + 8, y - 6, 2, 1);
      break;
  }
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, dark: string): void {
  poly(ctx, [x - w, y, x - w * 0.6, y - h, x + w * 0.3, y - h * 1.1, x + w, y - h * 0.3, x + w * 0.8, y], light);
  poly(ctx, [x + w * 0.3, y - h * 1.1, x + w, y - h * 0.3, x + w * 0.8, y, x + w * 0.1, y], dark);
}

// ---------- Edificios ----------

type P = { px: number; py: number };

/** Esquinas de la huella (con un pequeño margen) y centro. */
function corners(b: { tx: number; ty: number }, s: number, inset: number): { T: P; R: P; B: P; L: P; C: P } {
  return {
    T: worldToPx(b.tx + inset, b.ty + inset),
    R: worldToPx(b.tx + s - inset, b.ty + inset),
    B: worldToPx(b.tx + s - inset, b.ty + s - inset),
    L: worldToPx(b.tx + inset, b.ty + s - inset),
    C: worldToPx(b.tx + s / 2, b.ty + s / 2),
  };
}

/** Caja isométrica: muro izquierdo y derecho de altura H. */
function box(ctx: CanvasRenderingContext2D, k: ReturnType<typeof corners>, H: number, left: string, right: string): void {
  const { R, B, L } = k;
  poly(ctx, [L.px, L.py, B.px, B.py, B.px, B.py - H, L.px, L.py - H], left);
  poly(ctx, [B.px, B.py, R.px, R.py, R.px, R.py - H, B.px, B.py - H], right);
}

/** Techo a cuatro aguas desde la parte alta de los muros hasta un vértice. */
function hipRoof(ctx: CanvasRenderingContext2D, k: ReturnType<typeof corners>, H: number, rise: number, color: string): P {
  const { T, R, B, L, C } = k;
  const apex = { px: C.px, py: C.py - H - rise };
  poly(ctx, [T.px, T.py - H, R.px, R.py - H, apex.px, apex.py], shade(color, 0.75));
  poly(ctx, [T.px, T.py - H, L.px, L.py - H, apex.px, apex.py], shade(color, 0.9));
  poly(ctx, [L.px, L.py - H, B.px, B.py - H, apex.px, apex.py], shade(color, 1.1));
  poly(ctx, [B.px, B.py - H, R.px, R.py - H, apex.px, apex.py], shade(color, 0.8));
  return apex;
}

function along(p: P, q: P, k: number): P {
  return { px: p.px + (q.px - p.px) * k, py: p.py + (q.py - p.py) * k };
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, h = 18): void {
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 1, y - h, 2, h);
  poly(ctx, [x + 1, y - h, x + 14, y - h + 4, x + 1, y - h + 8], color);
}

/** Altura total aproximada del dibujo de cada edificio (para "levantarlo" al construir). */
export function buildingHeight(type: BuildingView['type']): number {
  return { town_center: 90, house: 50, storehouse: 44, farm: 6, barracks: 64 }[type];
}

export function drawBuilding(ctx: CanvasRenderingContext2D, b: BuildingView, color: string): void {
  const s = BUILDING_DEFS[b.type].size;
  switch (b.type) {
    case 'town_center': {
      const k = corners(b, s, 0.25);
      const H = 30;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.25)');
      box(ctx, k, H, '#c9ae84', '#a38862');
      box(ctx, k, 6, '#8f8a80', '#77726a');
      const d0 = along(k.L, k.B, 0.42), d1 = along(k.L, k.B, 0.62);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 17, d0.px, d0.py - 17], '#4a3222');
      ctx.fillStyle = '#3b2d22';
      for (const f of [0.2, 0.35, 0.65, 0.8]) {
        const w = along(k.B, k.R, f);
        ctx.fillRect(w.px - 2, w.py - 20, 4, 6);
      }
      const apex = hipRoof(ctx, k, H, 38, color);
      flag(ctx, apex.px, apex.py, color);
      break;
    }
    case 'house': {
      const k = corners(b, s, 0.2);
      const H = 18;
      poly(ctx, [k.T.px, k.T.py + 3, k.R.px + 6, k.R.py + 3, k.B.px, k.B.py + 4, k.L.px - 3, k.L.py + 3], 'rgba(0,0,0,0.22)');
      box(ctx, k, H, '#d9c29a', '#b89f78');
      const d0 = along(k.L, k.B, 0.45), d1 = along(k.L, k.B, 0.65);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 11, d0.px, d0.py - 11], '#5a3d26');
      const w = along(k.B, k.R, 0.5);
      ctx.fillStyle = '#3b2d22';
      ctx.fillRect(w.px - 2, w.py - 13, 4, 5);
      hipRoof(ctx, k, H, 24, color);
      break;
    }
    case 'storehouse': {
      const k = corners(b, s, 0.2);
      const H = 20;
      poly(ctx, [k.T.px, k.T.py + 3, k.R.px + 6, k.R.py + 3, k.B.px, k.B.py + 4, k.L.px - 3, k.L.py + 3], 'rgba(0,0,0,0.22)');
      box(ctx, k, H, '#9a6b3f', '#7d5431');
      // Tablones
      for (let i = 1; i < 4; i++) {
        const a = along(k.L, k.B, i / 4), c = along(k.B, k.R, i / 4);
        line(ctx, a.px, a.py, a.px, a.py - H, '#6d4527');
        line(ctx, c.px, c.py, c.px, c.py - H, '#5c3a20');
      }
      // Portón grande abierto
      const d0 = along(k.L, k.B, 0.3), d1 = along(k.L, k.B, 0.75);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 14, d0.px, d0.py - 14], '#2e2016');
      hipRoof(ctx, k, H, 14, shade(color, 0.85));
      // Cajas y un saco afuera
      const c1 = along(k.B, k.R, 0.8);
      ctx.fillStyle = '#b07a44';
      ctx.fillRect(c1.px - 3, c1.py - 2, 7, 6);
      ctx.fillStyle = '#e0cfa0';
      ellipse(ctx, c1.px + 8, c1.py + 3, 3.5, 3, '#e0cfa0');
      break;
    }
    case 'farm': {
      const food = b.food ?? 0;
      const ripe = Math.max(0, Math.min(1, food / (BUILDING_DEFS.farm.food ?? 300)));
      fillFootprint(ctx, b.tx + 0.1, b.ty + 0.1, s - 0.2, '#7a5a38');
      // Surcos con cultivo: más verde cuanta más comida queda.
      for (let i = 1; i < 6; i++) {
        const a = worldToPx(b.tx + 0.2, b.ty + (i * s) / 6), c = worldToPx(b.tx + s - 0.2, b.ty + (i * s) / 6);
        line(ctx, a.px, a.py, c.px, c.py, '#5e4128', 2);
        const crop = ripe > 0.05 ? `rgb(${Math.round(120 - ripe * 40)},${Math.round(140 + ripe * 40)},${Math.round(50)})` : '#8a6a45';
        line(ctx, a.px, a.py - 2, c.px, c.py - 2, crop, 2.5);
      }
      // Postes de la cerca con el color del jugador
      for (const [dx, dy] of [[0, 0], [s, 0], [s, s], [0, s]]) {
        const p = worldToPx(b.tx + dx, b.ty + dy);
        ctx.fillStyle = color;
        ctx.fillRect(p.px - 1.5, p.py - 6, 3, 6);
      }
      break;
    }
    case 'barracks': {
      const k = corners(b, s, 0.25);
      const H = 26;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.25)');
      box(ctx, k, H, '#9d9990', '#7f7b73');
      // Almenas
      ctx.fillStyle = '#b3afa6';
      for (let i = 0; i <= 6; i++) {
        const a = along(k.L, k.B, i / 6), c = along(k.B, k.R, i / 6);
        ctx.fillRect(a.px - 2, a.py - H - 5, 4, 5);
        ctx.fillRect(c.px - 2, c.py - H - 5, 4, 5);
      }
      // Techo plano con el color del jugador
      poly(ctx, [k.T.px, k.T.py - H, k.R.px, k.R.py - H, k.B.px, k.B.py - H, k.L.px, k.L.py - H], shade(color, 0.7));
      const d0 = along(k.L, k.B, 0.4), d1 = along(k.L, k.B, 0.6);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 16, d0.px, d0.py - 16], '#3a2c20');
      // Estandarte y lanzas
      const e = along(k.B, k.R, 0.35);
      poly(ctx, [e.px - 4, e.py - 22, e.px + 4, e.py - 22, e.px + 4, e.py - 8, e.px, e.py - 5, e.px - 4, e.py - 8], color);
      const r = along(k.L, k.B, 0.15);
      for (let i = 0; i < 3; i++) line(ctx, r.px + i * 3, r.py + 2, r.px + i * 3 + 1, r.py - 16, '#6b4a2b', 1.2);
      flag(ctx, k.C.px, k.C.py - H - 2, color, 22);
      break;
    }
  }
}

/** Cimiento: se ve el edificio "subiendo" y un andamio de madera. */
export function drawConstruction(ctx: CanvasRenderingContext2D, b: BuildingView, color: string): void {
  const s = BUILDING_DEFS[b.type].size;
  fillFootprint(ctx, b.tx + 0.05, b.ty + 0.05, s - 0.1, 'rgba(120,100,70,0.55)');
  outlineFootprint(ctx, b.tx, b.ty, s, '#6b5236', 1.2);
  if (b.type === 'farm') {
    // La granja se "ara" de a poco.
    ctx.globalAlpha = 0.3 + b.progress * 0.7;
    drawBuilding(ctx, { ...b, food: 0 }, color);
    ctx.globalAlpha = 1;
    return;
  }
  const bottom = worldToPx(b.tx + s, b.ty + s).py + 6;
  const top = bottom - buildingHeight(b.type) * Math.max(0.08, b.progress);
  const left = worldToPx(b.tx, b.ty + s).px - 10, right = worldToPx(b.tx + s, b.ty).px + 10;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top + 20);
  ctx.clip();
  drawBuilding(ctx, b, color);
  ctx.restore();
  // Andamio
  const L = worldToPx(b.tx, b.ty + s), B = worldToPx(b.tx + s, b.ty + s), R = worldToPx(b.tx + s, b.ty);
  for (const p of [L, B, R]) line(ctx, p.px, p.py, p.px, top - 4, '#8b6a3e', 1.5);
  line(ctx, L.px, top + 2, B.px, top + 2, '#8b6a3e', 1.2);
  line(ctx, B.px, top + 2, R.px, top + 2, '#8b6a3e', 1.2);
}

// ---------- Unidades ----------

export function drawUnit(ctx: CanvasRenderingContext2D, u: UnitView, x: number, y: number, color: string, now: number): void {
  const t = now / 1000 + u.id * 0.37;
  const walking = u.walk === 1;
  switch (u.type) {
    case 'worker':
      return drawWorker(ctx, u, x, y, color, t, walking);
    case 'warrior':
      return drawWarrior(ctx, u, x, y, color, t, walking);
    case 'scout':
      return drawScout(ctx, u, x, y, color, t, walking);
  }
}

function drawWorker(ctx: CanvasRenderingContext2D, u: UnitView, x: number, y: number, color: string, t: number, walking: boolean): void {
  const bob = walking ? Math.abs(Math.sin(t * 10)) * 1.5 : 0;
  const step = walking ? Math.sin(t * 10) * 2 : 0;
  ellipse(ctx, x, y, 6, 3, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = '#3b2f25';
  ctx.fillRect(x - 3 + step * 0.5, y - 6, 2, 6);
  ctx.fillRect(x + 1 - step * 0.5, y - 6, 2, 6);
  ctx.fillStyle = shade(color, 0.7);
  ctx.fillRect(x - 4.5, y - 16 - bob, 9, 11);
  ctx.fillStyle = color;
  ctx.fillRect(x - 3.5, y - 15 - bob, 7, 9);
  ellipse(ctx, x, y - 19 - bob, 3.5, 3.5, '#e2b68c');
  ellipse(ctx, x, y - 21.5 - bob, 5, 1.6, '#d8c070');
  if (u.carryType && u.carryAmount) {
    ctx.fillStyle = RESOURCE_COLORS[u.carryType];
    const sz = 2 + Math.min(4, u.carryAmount / 3);
    ctx.fillRect(x - 5 - sz, y - 15 - bob, sz, sz + 2);
  }
  // Herramienta: hacha/pico al recolectar, martillo al construir, puño al pelear.
  const working = u.state === 'gathering' || u.state === 'building' || u.state === 'attacking';
  if (working && !walking) {
    const swing = Math.sin(t * 7) * 0.9 - 0.6;
    const hx = x + 3, hy = y - 12 - bob;
    const ex = hx + Math.cos(swing) * 9, ey = hy + Math.sin(swing) * 9;
    line(ctx, hx, hy, ex, ey, '#6b4a2b', 1.5);
    ctx.fillStyle = u.state === 'building' ? '#8d8f94' : u.task === 'food' ? '#b88a4a' : '#c9ccd1';
    ctx.fillRect(ex - 2, ey - 2, 4, 3);
  }
}

function drawWarrior(ctx: CanvasRenderingContext2D, u: UnitView, x: number, y: number, color: string, t: number, walking: boolean): void {
  const bob = walking ? Math.abs(Math.sin(t * 9)) * 1.5 : 0;
  const step = walking ? Math.sin(t * 9) * 2 : 0;
  ellipse(ctx, x, y, 7, 3.5, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = '#2e2620';
  ctx.fillRect(x - 3.5 + step * 0.5, y - 7, 2.5, 7);
  ctx.fillRect(x + 1 - step * 0.5, y - 7, 2.5, 7);
  // Torso con armadura y tabardo del jugador
  ctx.fillStyle = '#6f757d';
  ctx.fillRect(x - 5, y - 18 - bob, 10, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 3.5, y - 16 - bob, 7, 10);
  // Cabeza con casco
  ellipse(ctx, x, y - 21 - bob, 3.6, 3.6, '#e2b68c');
  poly(ctx, [x - 4.5, y - 21 - bob, x, y - 27 - bob, x + 4.5, y - 21 - bob], '#8a9099');
  // Escudo redondo
  ellipse(ctx, x - 6, y - 12 - bob, 4.5, 5.5, shade(color, 0.8), '#d9d2c0', 1.2);
  // Arma (maza/espada) que se balancea al atacar
  const attacking = u.state === 'attacking' && !walking;
  const a = attacking ? Math.sin(t * 8) * 1.1 - 0.4 : -1.2;
  const hx = x + 5, hy = y - 13 - bob;
  line(ctx, hx, hy, hx + Math.cos(a) * 11, hy + Math.sin(a) * 11, '#cfd3d8', 2);
}

function drawScout(ctx: CanvasRenderingContext2D, u: UnitView, x: number, y: number, color: string, t: number, walking: boolean): void {
  const gallop = walking ? Math.sin(t * 14) : 0;
  ellipse(ctx, x, y, 11, 4.5, 'rgba(0,0,0,0.3)');
  // Patas
  ctx.strokeStyle = '#5b3a24';
  ctx.lineWidth = 2;
  for (const [dx, ph] of [[-6, 0], [-3, 1.5], [4, 3], [7, 4.5]]) {
    const sw = walking ? Math.sin(t * 14 + ph) * 2.5 : 0;
    ctx.beginPath();
    ctx.moveTo(x + dx, y - 8);
    ctx.lineTo(x + dx + sw, y - 1);
    ctx.stroke();
  }
  // Cuerpo y cabeza del caballo
  ellipse(ctx, x, y - 10 - gallop * 0.8, 10, 5, '#8a5a3b');
  poly(ctx, [x + 7, y - 13 - gallop, x + 14, y - 19 - gallop, x + 16, y - 16 - gallop, x + 10, y - 9 - gallop], '#7a4d31');
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(x - 11, y - 12 - gallop, 3, 6); // cola
  // Manta con el color del jugador
  ctx.fillStyle = color;
  ctx.fillRect(x - 4, y - 14 - gallop, 8, 5);
  // Jinete
  ctx.fillStyle = shade(color, 0.75);
  ctx.fillRect(x - 3, y - 23 - gallop, 6, 9);
  ellipse(ctx, x, y - 26 - gallop, 3.2, 3.2, '#e2b68c');
  // Lanza
  const attacking = u.state === 'attacking' && !walking;
  const thrust = attacking ? Math.max(0, Math.sin(t * 8)) * 4 : 0;
  line(ctx, x - 6 + thrust, y - 14 - gallop, x + 12 + thrust, y - 28 - gallop, '#c8b27a', 1.5);
}
