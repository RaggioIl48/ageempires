// Arte original hecho con formas simples: unidades, edificios y recursos.
// Todo se dibuja en "px del mundo" (la cámara ya está aplicada).

import { BUILDING_DEFS, type ResourceType, type UnitType } from '../../shared/data.ts';
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

/** Oscurece (f<1) o aclara (f>1) un color #rrggbb o rgb(r,g,b). */
export function shade(color: string, f: number): string {
  let r: number, g: number, b: number;
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else [r, g, b] = (color.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
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
  return {
    town_center: 90, house: 50, storehouse: 44, farm: 6, barracks: 64,
    archery_range: 40, stable: 50, tech_center: 66, tower: 86, wall: 26, gate: 32, workshop: 72, factory: 86,
  }[type];
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
    case 'archery_range': {
      const k = corners(b, s, 0.2);
      fillFootprint(ctx, b.tx + 0.15, b.ty + 0.15, s - 0.3, 'rgba(160,130,80,0.45)');
      // Cobertizo al fondo
      const shed = corners(b, 1.6, 0.2);
      box(ctx, shed, 16, '#a8794a', '#8a5f36');
      hipRoof(ctx, shed, 16, 12, color);
      // Cerca de postes en los bordes de adelante
      for (let i = 0; i <= 8; i++) {
        const a = along(k.L, k.B, i / 8), c = along(k.B, k.R, i / 8);
        line(ctx, a.px, a.py, a.px, a.py - 7, '#6b4a2b', 1.5);
        line(ctx, c.px, c.py, c.px, c.py - 7, '#6b4a2b', 1.5);
      }
      line(ctx, k.L.px, k.L.py - 5, k.B.px, k.B.py - 5, '#8b6a3e', 1.2);
      line(ctx, k.B.px, k.B.py - 5, k.R.px, k.R.py - 5, '#8b6a3e', 1.2);
      // Dianas de paja
      for (const [dx, dy] of [[2.3, 0.8], [2.3, 2.0]]) {
        const p = worldToPx(b.tx + dx, b.ty + dy);
        line(ctx, p.px, p.py, p.px, p.py - 10, '#6b4a2b', 2);
        ellipse(ctx, p.px, p.py - 16, 7, 7, '#e8dcb5');
        ellipse(ctx, p.px, p.py - 16, 5, 5, '#c0392b');
        ellipse(ctx, p.px, p.py - 16, 3, 3, '#e8dcb5');
        ellipse(ctx, p.px, p.py - 16, 1.5, 1.5, color);
      }
      break;
    }
    case 'stable': {
      const k = corners(b, s, 0.25);
      const H = 20;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.22)');
      box(ctx, k, H, '#9a6b3f', '#7d5431');
      for (const f of [0.1, 0.4, 0.7]) {
        const a = along(k.L, k.B, f), c = along(k.L, k.B, f + 0.18);
        poly(ctx, [a.px, a.py, c.px, c.py, c.px, c.py - 13, a.px, a.py - 13], '#2e2016');
      }
      hipRoof(ctx, k, H, 26, shade(color, 0.95));
      // Paja y un caballo asomado
      const h = along(k.B, k.R, 0.5);
      ellipse(ctx, h.px + 4, h.py + 2, 6, 4, '#d8b85a');
      ellipse(ctx, h.px - 6, h.py - 8, 3, 4, '#7a4d31');
      break;
    }
    case 'tech_center': {
      const k = corners(b, s, 0.25);
      const H = 26;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.25)');
      box(ctx, k, H, '#e0dbcf', '#bdb6a7');
      // Columnas
      ctx.fillStyle = '#f4f1ea';
      for (let i = 1; i < 6; i++) {
        const a = along(k.L, k.B, i / 6);
        ctx.fillRect(a.px - 1.5, a.py - H + 3, 3, H - 3);
      }
      const d0 = along(k.B, k.R, 0.4), d1 = along(k.B, k.R, 0.6);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 15, d0.px, d0.py - 15], '#4a3a2a');
      poly(ctx, [k.T.px, k.T.py - H, k.R.px, k.R.py - H, k.B.px, k.B.py - H, k.L.px, k.L.py - H], '#cfc8b8');
      // Cúpula con el color del jugador
      ctx.beginPath();
      ctx.ellipse(k.C.px, k.C.py - H, 18, 20, 0, Math.PI, 0);
      ctx.fillStyle = shade(color, 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(k.C.px - 5, k.C.py - H - 4, 6, 12, 0, Math.PI, 0);
      ctx.fillStyle = shade(color, 1.15);
      ctx.fill();
      ellipse(ctx, k.C.px, k.C.py - H, 18, 4, '#bdb6a7');
      flag(ctx, k.C.px, k.C.py - H - 18, color, 14);
      break;
    }
    case 'tower': {
      const k = corners(b, s, 0.45);
      const H = 58;
      poly(ctx, [k.T.px, k.T.py + 3, k.R.px + 6, k.R.py + 3, k.B.px, k.B.py + 5, k.L.px - 3, k.L.py + 3], 'rgba(0,0,0,0.25)');
      box(ctx, k, H, '#aaa59b', '#8a857b');
      // Troneras
      ctx.fillStyle = '#2e2a25';
      const wl = along(k.L, k.B, 0.5), wr = along(k.B, k.R, 0.5);
      ctx.fillRect(wl.px - 1, wl.py - H + 12, 2, 7);
      ctx.fillRect(wr.px - 1, wr.py - H + 12, 2, 7);
      ctx.fillRect(wl.px - 1, wl.py - 30, 2, 7);
      // Almenas y techo
      ctx.fillStyle = '#bdb8ae';
      for (let i = 0; i <= 3; i++) {
        const a = along(k.L, k.B, i / 3), c = along(k.B, k.R, i / 3);
        ctx.fillRect(a.px - 2, a.py - H - 4, 4, 4);
        ctx.fillRect(c.px - 2, c.py - H - 4, 4, 4);
      }
      const apex = hipRoof(ctx, k, H, 18, color);
      flag(ctx, apex.px, apex.py, color, 12);
      break;
    }
    case 'wall':
    case 'gate': {
      const k = corners(b, s, 0.04);
      const H = b.type === 'gate' ? 24 : 18;
      box(ctx, k, H, '#aaa59b', '#8a857b');
      poly(ctx, [k.T.px, k.T.py - H, k.R.px, k.R.py - H, k.B.px, k.B.py - H, k.L.px, k.L.py - H], '#c2bdb3');
      ctx.fillStyle = '#c9c4ba';
      for (const f of [0.15, 0.55]) {
        const a = along(k.L, k.B, f), c = along(k.B, k.R, f);
        ctx.fillRect(a.px - 2, a.py - H - 4, 4, 4);
        ctx.fillRect(c.px - 2, c.py - H - 4, 4, 4);
      }
      // Franja del color del dueño
      line(ctx, k.L.px, k.L.py - H + 2, k.B.px, k.B.py - H + 2, color, 1.5);
      line(ctx, k.B.px, k.B.py - H + 2, k.R.px, k.R.py - H + 2, shade(color, 0.8), 1.5);
      if (b.type === 'gate')
        for (const [p, q] of [[k.L, k.B], [k.B, k.R]]) {
          const d0 = along(p, q, 0.25), d1 = along(p, q, 0.75);
          poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 15, d0.px, d0.py - 15], '#5a3d26');
          const mx = (d0.px + d1.px) / 2, my = (d0.py + d1.py) / 2;
          line(ctx, mx, my, mx, my - 15, '#3b2818', 1);
        }
      break;
    }
    case 'workshop': {
      const k = corners(b, s, 0.25);
      const H = 24;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.25)');
      // Chimenea (atrás) con humo
      ctx.fillStyle = '#6d3a28';
      ctx.fillRect(k.T.px + 10, k.T.py - H - 36, 8, 40);
      ellipse(ctx, k.T.px + 16, k.T.py - H - 44, 7, 5, 'rgba(90,90,90,0.55)');
      ellipse(ctx, k.T.px + 24, k.T.py - H - 54, 9, 6, 'rgba(110,110,110,0.4)');
      box(ctx, k, H, '#a45c3e', '#854a31');
      // Hiladas de ladrillo
      ctx.strokeStyle = 'rgba(60,30,20,0.35)';
      ctx.lineWidth = 1;
      for (let r = 6; r < H; r += 6) {
        ctx.beginPath();
        ctx.moveTo(k.L.px, k.L.py - r);
        ctx.lineTo(k.B.px, k.B.py - r);
        ctx.lineTo(k.R.px, k.R.py - r);
        ctx.stroke();
      }
      const d0 = along(k.L, k.B, 0.3), d1 = along(k.L, k.B, 0.75);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 18, d0.px, d0.py - 18], '#2e2a25');
      line(ctx, k.L.px, k.L.py - H + 3, k.B.px, k.B.py - H + 3, color, 3);
      line(ctx, k.B.px, k.B.py - H + 3, k.R.px, k.R.py - H + 3, shade(color, 0.8), 3);
      hipRoof(ctx, k, H, 16, '#5d5f63');
      // Engranaje
      const g = along(k.B, k.R, 0.55);
      ellipse(ctx, g.px, g.py - 13, 5, 5, '#c9ccd1', '#6d7077', 2);
      ellipse(ctx, g.px, g.py - 13, 1.8, 1.8, '#6d7077');
      break;
    }
    case 'factory': {
      const k = corners(b, s, 0.2);
      const H = 30;
      poly(ctx, [k.T.px, k.T.py + 4, k.R.px + 8, k.R.py + 4, k.B.px, k.B.py + 6, k.L.px - 4, k.L.py + 4], 'rgba(0,0,0,0.25)');
      // Chimeneas (atrás)
      for (const [f, h] of [[0.25, 50], [0.55, 44]]) {
        const c = along(k.T, k.R, f);
        ctx.fillStyle = '#5b4a40';
        ctx.fillRect(c.px - 4, c.py - H - h, 8, h);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(c.px - 4, c.py - H - h + 4, 8, 3);
        ellipse(ctx, c.px + 6, c.py - H - h - 8, 8, 5, 'rgba(90,90,90,0.5)');
      }
      box(ctx, k, H, '#8f8b83', '#716d66');
      // Ventanas
      ctx.fillStyle = '#c9d9e6';
      for (let i = 1; i < 6; i++) {
        const a = along(k.L, k.B, i / 6), c = along(k.B, k.R, i / 6);
        ctx.fillRect(a.px - 2, a.py - H + 6, 4, 6);
        ctx.fillRect(c.px - 2, c.py - H + 6, 4, 6);
      }
      const d0 = along(k.L, k.B, 0.35), d1 = along(k.L, k.B, 0.7);
      poly(ctx, [d0.px, d0.py, d1.px, d1.py, d1.px, d1.py - 16, d0.px, d0.py - 16], '#3a3630');
      line(ctx, k.L.px, k.L.py - H + 2, k.B.px, k.B.py - H + 2, color, 3);
      line(ctx, k.B.px, k.B.py - H + 2, k.R.px, k.R.py - H + 2, shade(color, 0.8), 3);
      // Techo de dientes de sierra
      poly(ctx, [k.T.px, k.T.py - H, k.R.px, k.R.py - H, k.B.px, k.B.py - H, k.L.px, k.L.py - H], '#6b6862');
      const off = { px: k.T.px - k.L.px, py: k.T.py - k.L.py };
      for (let i = 0; i < 3; i++) {
        const a = along(k.L, k.B, (i + 0.1) / 3), c = along(k.L, k.B, (i + 0.9) / 3);
        poly(ctx, [a.px, a.py - H, c.px, c.py - H, c.px + off.px, c.py + off.py - H - 12, a.px + off.px, a.py + off.py - H - 12], '#8a8780');
        poly(ctx, [c.px, c.py - H, c.px + off.px, c.py + off.py - H, c.px + off.px, c.py + off.py - H - 12], '#a9c1d4');
      }
      flag(ctx, k.B.px, k.B.py - H, color, 16);
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

/** Tamaño de cada unidad en pantalla: para elegirla con el ratón, el anillo de selección y la barra de vida. */
export const UNIT_LOOK: Record<UnitType, { half: number; top: number; ring: number }> = {
  worker: { half: 9, top: 28, ring: 10 },
  warrior: { half: 9, top: 28, ring: 10 },
  spearman: { half: 9, top: 32, ring: 10 },
  archer: { half: 9, top: 28, ring: 10 },
  rifleman: { half: 9, top: 28, ring: 10 },
  machine_gun: { half: 13, top: 26, ring: 13 },
  antitank: { half: 10, top: 28, ring: 10 },
  scout: { half: 13, top: 32, ring: 13 },
  knight: { half: 14, top: 36, ring: 14 },
  light_vehicle: { half: 14, top: 24, ring: 14 },
  mech_infantry: { half: 16, top: 28, ring: 16 },
  artillery: { half: 15, top: 24, ring: 15 },
  heavy_artillery: { half: 19, top: 30, ring: 19 },
  tank: { half: 18, top: 30, ring: 18 },
  airplane: { half: 18, top: 60, ring: 15 },
};
/** Altura de vuelo de los aviones (px). */
export const FLY_HEIGHT = 40;

export function drawUnit(ctx: CanvasRenderingContext2D, u: UnitView, x: number, y: number, color: string, now: number): void {
  const t = now / 1000 + u.id * 0.37;
  const walking = u.walk === 1;
  const attacking = u.state === 'attacking' && !walking;
  switch (u.type) {
    case 'worker':
      return drawWorker(ctx, u, x, y, color, t, walking);
    case 'warrior':
      return drawWarrior(ctx, u, x, y, color, t, walking);
    case 'scout':
      return drawHorseman(ctx, x, y, color, t, walking, attacking, false);
    case 'knight':
      return drawHorseman(ctx, x, y, color, t, walking, attacking, true);
    case 'spearman': {
      const bob = soldier(ctx, x, y, color, t, walking, '#7c6a52', 'cone');
      const thrust = attacking ? Math.max(0, Math.sin(t * 8)) * 4 : 0;
      const tipX = x + 10 + thrust, tipY = y - 34 - bob - thrust;
      line(ctx, x + 4 + thrust * 0.3, y - 5 - bob, tipX, tipY, '#8b6a3e', 1.6);
      poly(ctx, [tipX, tipY, tipX - 1.5, tipY + 5, tipX + 1.5, tipY + 5], '#cfd3d8');
      ellipse(ctx, x - 6, y - 12 - bob, 3.5, 5, shade(color, 0.8), '#d9d2c0', 1);
      return;
    }
    case 'archer': {
      const bob = soldier(ctx, x, y, color, t, walking, '#5e6b3a', 'hood');
      const cx = x + 4, cy = y - 14 - bob;
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, -1.2, 1.2);
      ctx.stroke();
      const pull = attacking ? Math.max(0, Math.sin(t * 5)) * 4 : 0;
      const ex = Math.cos(1.2) * 8, ey = Math.sin(1.2) * 8;
      line(ctx, cx + ex, cy - ey, cx - pull, cy, '#e8e0c8', 0.8);
      line(ctx, cx - pull, cy, cx + ex, cy + ey, '#e8e0c8', 0.8);
      return;
    }
    case 'rifleman': {
      const bob = soldier(ctx, x, y, color, t, walking, '#5d6b3f', 'round');
      line(ctx, x - 3, y - 11 - bob, x + 12, y - 16 - bob, '#3b2f25', 2);
      if (attacking && Math.sin(t * 6) > 0.8) ellipse(ctx, x + 13, y - 16 - bob, 2.5, 2, '#ffd65a');
      return;
    }
    case 'antitank': {
      const bob = soldier(ctx, x, y, color, t, walking, '#5d6b3f', 'round');
      line(ctx, x - 8, y - 18 - bob, x + 11, y - 21 - bob, '#4a5238', 4);
      ellipse(ctx, x + 11, y - 21 - bob, 2.2, 2.4, '#2f3527');
      if (attacking && Math.sin(t * 3) > 0.9) ellipse(ctx, x - 10, y - 18 - bob, 4, 3, 'rgba(200,200,200,0.7)');
      return;
    }
    case 'machine_gun': {
      soldier(ctx, x - 5, y - 1, color, t, walking, '#5d6b3f', 'round');
      line(ctx, x + 5, y - 7, x + 2, y, '#2b2b2b', 1.2);
      line(ctx, x + 5, y - 7, x + 9, y, '#2b2b2b', 1.2);
      line(ctx, x, y - 9, x + 15, y - 11, '#2b2b2b', 3);
      ctx.fillStyle = '#6b6f4a';
      ctx.fillRect(x + 1, y - 7, 4, 3);
      if (attacking && Math.sin(t * 25) > 0.3) ellipse(ctx, x + 16, y - 11, 2.5, 2, '#ffd65a');
      return;
    }
    case 'light_vehicle':
      return drawJeep(ctx, x, y, color, t, walking, attacking);
    case 'mech_infantry':
      return drawHalftrack(ctx, x, y, color, t, walking, attacking);
    case 'artillery':
      return drawGun(ctx, x, y, color, t, attacking, 1);
    case 'heavy_artillery':
      return drawGun(ctx, x, y, color, t, attacking, 1.4);
    case 'tank':
      return drawTank(ctx, x, y, color, t, walking, attacking);
    case 'airplane':
      return drawPlane(ctx, x, y, color, t);
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

/** Soldado de a pie: piernas, cuerpo con el color del jugador y casco. Devuelve el "rebote" al caminar. */
function soldier(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  t: number,
  walking: boolean,
  uniform: string,
  helmet: 'cone' | 'round' | 'hood',
): number {
  const bob = walking ? Math.abs(Math.sin(t * 9)) * 1.5 : 0;
  const step = walking ? Math.sin(t * 9) * 2 : 0;
  ellipse(ctx, x, y, 7, 3.5, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = '#2e2620';
  ctx.fillRect(x - 3.5 + step * 0.5, y - 7, 2.5, 7);
  ctx.fillRect(x + 1 - step * 0.5, y - 7, 2.5, 7);
  ctx.fillStyle = uniform;
  ctx.fillRect(x - 5, y - 18 - bob, 10, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 3.5, y - 16 - bob, 7, 6);
  if (helmet === 'hood') {
    ellipse(ctx, x, y - 21 - bob, 4.6, 4.6, shade(uniform, 0.8));
    ellipse(ctx, x + 0.8, y - 21 - bob, 2.8, 3, '#e2b68c');
    return bob;
  }
  ellipse(ctx, x, y - 21 - bob, 3.6, 3.6, '#e2b68c');
  if (helmet === 'cone') poly(ctx, [x - 4.5, y - 21 - bob, x, y - 27 - bob, x + 4.5, y - 21 - bob], '#8a9099');
  else {
    ctx.beginPath();
    ctx.ellipse(x, y - 22 - bob, 4.8, 3.8, 0, Math.PI, 0);
    ctx.fillStyle = '#4b5536';
    ctx.fill();
    line(ctx, x - 5.5, y - 22 - bob, x + 5.5, y - 22 - bob, '#3a4229', 1.2);
  }
  return bob;
}

/** Jinete: explorador (ligero) o caballero (caballo con manta y jinete con armadura). */
function drawHorseman(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  t: number,
  walking: boolean,
  attacking: boolean,
  heavy: boolean,
): void {
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
  const horse = heavy ? '#5a4a3e' : '#8a5a3b';
  ellipse(ctx, x, y - 10 - gallop * 0.8, 10, 5, horse);
  poly(ctx, [x + 7, y - 13 - gallop, x + 14, y - 19 - gallop, x + 16, y - 16 - gallop, x + 10, y - 9 - gallop], shade(horse, 0.9));
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(x - 11, y - 12 - gallop, 3, 6); // cola
  // Manta con el color del jugador (la del caballero es larga)
  ctx.fillStyle = color;
  if (heavy) ctx.fillRect(x - 8, y - 14 - gallop, 15, 8);
  else ctx.fillRect(x - 4, y - 14 - gallop, 8, 5);
  // Jinete (el caballero con armadura y casco)
  ctx.fillStyle = heavy ? '#8a9099' : shade(color, 0.75);
  ctx.fillRect(x - 3, y - 23 - gallop, 6, 9);
  if (heavy) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, y - 22 - gallop, 4, 6);
  }
  ellipse(ctx, x, y - 26 - gallop, 3.2, 3.2, heavy ? '#8a9099' : '#e2b68c');
  if (heavy) poly(ctx, [x - 3.5, y - 27 - gallop, x, y - 32 - gallop, x + 3.5, y - 27 - gallop], '#aab0b8');
  // Lanza
  const thrust = attacking ? Math.max(0, Math.sin(t * 8)) * 4 : 0;
  const len = heavy ? 1.3 : 1;
  line(ctx, x - 6 + thrust, y - 14 - gallop, x - 6 + 18 * len + thrust, y - 14 - 14 * len - gallop, '#c8b27a', 1.5);
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ellipse(ctx, x, y, r, r, '#1f1f1f');
  ellipse(ctx, x, y, r * 0.45, r * 0.45, '#6d6d6d');
}

function drawJeep(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number, walking: boolean, attacking: boolean): void {
  const b = walking ? Math.sin(t * 20) * 0.6 : 0;
  ellipse(ctx, x, y, 14, 5, 'rgba(0,0,0,0.3)');
  poly(ctx, [x - 12, y - 5 + b, x + 12, y - 5 + b, x + 13, y - 10 + b, x + 6, y - 11 + b, x + 3, y - 14 + b, x - 12, y - 13 + b], '#6b7040');
  ctx.fillStyle = color;
  ctx.fillRect(x - 12, y - 9 + b, 24, 2);
  line(ctx, x + 3, y - 14 + b, x + 1, y - 18 + b, '#aeb9c2', 1.5);
  ellipse(ctx, x - 4, y - 16 + b, 2.4, 2.4, '#e2b68c');
  line(ctx, x - 6, y - 15 + b, x + 6, y - 20 + b, '#2b2b2b', 2);
  if (attacking && Math.sin(t * 12) > 0.6) ellipse(ctx, x + 7, y - 20 + b, 2.5, 2, '#ffd65a');
  wheel(ctx, x - 7, y - 4, 3.2);
  wheel(ctx, x + 8, y - 4, 3.2);
}

function drawHalftrack(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number, walking: boolean, attacking: boolean): void {
  const b = walking ? Math.sin(t * 16) * 0.5 : 0;
  ellipse(ctx, x, y, 17, 5.5, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = '#2f3329';
  ctx.fillRect(x - 15, y - 7, 18, 6);
  poly(ctx, [x - 15, y - 7 + b, x + 15, y - 7 + b, x + 16, y - 12 + b, x + 9, y - 16 + b, x - 15, y - 16 + b], '#5b6446');
  ctx.fillStyle = color;
  ctx.fillRect(x - 14, y - 12 + b, 22, 2.5);
  // Soldados con casco asomados
  for (const dx of [-9, -3]) {
    ellipse(ctx, x + dx, y - 19 + b, 2.6, 2.6, '#e2b68c');
    ctx.beginPath();
    ctx.ellipse(x + dx, y - 20 + b, 3.2, 2.6, 0, Math.PI, 0);
    ctx.fillStyle = '#4b5536';
    ctx.fill();
  }
  line(ctx, x + 2, y - 17 + b, x + 13, y - 21 + b, '#2b2b2b', 2);
  if (attacking && Math.sin(t * 9) > 0.7) ellipse(ctx, x + 14, y - 21 + b, 2.5, 2, '#ffd65a');
  wheel(ctx, x + 10, y - 4, 3.2);
  for (const dx of [-12, -7, -2]) ellipse(ctx, x + dx, y - 4, 2.2, 2.2, '#555');
}

/** Cañón de campaña (k = 1) o artillería pesada (k más grande). */
function drawGun(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number, attacking: boolean, k: number): void {
  const recoil = attacking ? Math.max(0, Math.sin(t * 2)) ** 8 * 3 : 0;
  ellipse(ctx, x, y, 14 * k, 5 * k, 'rgba(0,0,0,0.3)');
  line(ctx, x - 2 * k, y - 6 * k, x - 15 * k, y - 1, '#4b4f3f', 2.5 * k);
  line(ctx, x - 2 * k - recoil, y - 10 * k, x + 15 * k - recoil, y - 17 * k, '#3d4436', 3.5 * k);
  poly(ctx, [x - 1 * k, y - 16 * k, x + 5 * k, y - 18 * k, x + 5 * k, y - 8 * k, x - 1 * k, y - 6 * k], color);
  wheel(ctx, x - 3 * k, y - 5 * k, 5 * k);
  if (k > 1.2) wheel(ctx, x + 6 * k, y - 4 * k, 4 * k);
  if (attacking && Math.sin(t * 2) > 0.95) ellipse(ctx, x + 17 * k, y - 18 * k, 5 * k, 4 * k, 'rgba(230,230,220,0.8)');
}

function drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number, walking: boolean, attacking: boolean): void {
  const b = walking ? Math.sin(t * 14) * 0.5 : 0;
  const recoil = attacking ? Math.max(0, Math.sin(t * 2.1)) ** 8 * 3 : 0;
  ellipse(ctx, x, y, 19, 6.5, 'rgba(0,0,0,0.3)');
  // Orugas
  ctx.fillStyle = '#2f3329';
  ctx.fillRect(x - 16, y - 9, 32, 8);
  for (let i = 0; i < 6; i++) ellipse(ctx, x - 13 + i * 5.2, y - 5, 2.4, 2.4, '#555a4c');
  // Casco, franja del jugador, torreta y cañón
  poly(ctx, [x - 15, y - 9 + b, x + 16, y - 9 + b, x + 13, y - 16 + b, x - 13, y - 16 + b], '#5b6446');
  ctx.fillStyle = color;
  ctx.fillRect(x - 13, y - 13 + b, 26, 2.5);
  poly(ctx, [x - 8, y - 16 + b, x + 6, y - 16 + b, x + 5, y - 22 + b, x - 6, y - 23 + b], '#66704e');
  line(ctx, x + 5 - recoil, y - 20 + b, x + 21 - recoil, y - 22 + b, '#4b543a', 3);
  ellipse(ctx, x - 2, y - 23 + b, 2.5, 1.2, '#3a4229');
  if (attacking && Math.sin(t * 2.1) > 0.95) ellipse(ctx, x + 23, y - 22 + b, 5, 3.5, 'rgba(255,214,90,0.9)');
}

/** Avión en vuelo: se dibuja en lo alto, con su sombra en el suelo. */
function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number): void {
  const a = y - FLY_HEIGHT + Math.sin(t * 2) * 2;
  ellipse(ctx, x, y, 14, 4, 'rgba(0,0,0,0.22)');
  poly(ctx, [x - 2, a, x + 2, a, x, a - 7, x - 4, a - 7], '#5e6650'); // ala de atrás
  ellipse(ctx, x, a, 15, 3.8, '#7b8468'); // fuselaje
  ellipse(ctx, x + 11, a - 0.5, 4, 3, '#5e6650'); // motor
  poly(ctx, [x - 14, a, x - 10, a, x - 13, a - 8], shade(color, 0.9)); // timón
  poly(ctx, [x - 3, a + 1, x + 3, a + 1, x + 1, a + 10, x - 6, a + 10], '#6b7359'); // ala de adelante
  ellipse(ctx, x - 2.5, a + 6, 2.2, 1.6, color); // escarapela
  ellipse(ctx, x + 3, a - 2.5, 3, 1.8, '#a9c1d4'); // cabina
  ellipse(ctx, x + 15, a, 1, 5 * Math.abs(Math.sin(t * 40)) + 1, 'rgba(230,230,230,0.8)'); // hélice
}
