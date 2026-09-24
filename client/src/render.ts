// Escena con Canvas 2D: terreno, objetos ordenados de atrás hacia adelante,
// selección, efectos de combate y previsualización de construcción.

import { BUILDING_DEFS, TILE_MOUNTAIN, TILE_WATER, type BuildingType } from '../../shared/data.ts';
import type { BuildingView, NodeView, UnitView } from '../../shared/protocol.ts';
import { unitStats } from '../../shared/stats.ts';
import {
  buildingHeight,
  drawBuilding,
  drawConstruction,
  drawMountain,
  drawNode,
  drawUnit,
  ellipse,
  fillFootprint,
  hash,
  healthBar,
  outlineFootprint,
} from './sprites.ts';
import type { ClientState } from './state.ts';
import { Camera, TILE_H, TILE_W, worldToPx } from './view.ts';

export { RESOURCE_COLORS, shade } from './sprites.ts';

/** Píxeles de textura por casilla en la textura del terreno. */
export const TEX = 8;

// ---------- Terreno: una sola textura, dibujada con una transformación afín ----------

export function buildTerrainTexture(state: ClientState): HTMLCanvasElement {
  const n = state.size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * TEX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n * TEX, n * TEX);
  const d = img.data;
  const kindAt = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? -1 : state.tile(x, y));

  for (let ty = 0; ty < n; ty++)
    for (let tx = 0; tx < n; tx++) {
      const kind = state.tile(tx, ty);
      const tileNoise = hash(tx >> 2, ty >> 2) * 0.5 + hash(tx, ty) * 0.5; // manchas suaves
      // Bordes que tocan agua (para playas y agua poco profunda).
      const waterN = kindAt(tx, ty - 1) === TILE_WATER, waterS = kindAt(tx, ty + 1) === TILE_WATER;
      const waterW = kindAt(tx - 1, ty) === TILE_WATER, waterE = kindAt(tx + 1, ty) === TILE_WATER;
      const landN = !waterN && kindAt(tx, ty - 1) >= 0, landS = !waterS && kindAt(tx, ty + 1) >= 0;
      const landW = !waterW && kindAt(tx - 1, ty) >= 0, landE = !waterE && kindAt(tx + 1, ty) >= 0;

      for (let v = 0; v < TEX; v++)
        for (let u = 0; u < TEX; u++) {
          const gx = tx * TEX + u, gy = ty * TEX + v;
          const r = hash(gx, gy);
          let c: [number, number, number];
          if (kind === TILE_WATER) {
            const edge = (landN && v < 2) || (landS && v >= TEX - 2) || (landW && u < 2) || (landE && u >= TEX - 2);
            c = edge ? [72, 140, 186] : [44 + tileNoise * 10, 98 + tileNoise * 14, 160 + tileNoise * 12];
            if (!edge && r > 0.97) c = [110, 165, 210]; // brillos
          } else if (kind === TILE_MOUNTAIN) {
            c = [112 + r * 18, 104 + r * 14, 92 + r * 12];
          } else {
            const beach = (waterN && v < 2) || (waterS && v >= TEX - 2) || (waterW && u < 2) || (waterE && u >= TEX - 2);
            if (beach) c = [196 + r * 12, 182 + r * 10, 124 + r * 10];
            else c = [78 + tileNoise * 26 + r * 10, 132 + tileNoise * 26 + r * 12, 56 + tileNoise * 14 + r * 6];
          }
          const i = (gy * n * TEX + gx) * 4;
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
          d[i + 3] = 255;
        }
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------- Escena ----------

export interface Marker {
  x: number;
  y: number;
  color: string;
  t0: number;
}

export interface SceneSelection {
  units: Set<number>;
  building: number | null;
  node: number | null;
}

/** Edificio que se está por colocar (sigue al ratón). */
export interface Ghost {
  type: BuildingType;
  tx: number;
  ty: number;
  ok: boolean;
}

type Drawable =
  | { depth: number; k: 'unit'; u: UnitView; x: number; y: number }
  | { depth: number; k: 'node'; n: NodeView }
  | { depth: number; k: 'building'; b: BuildingView }
  | { depth: number; k: 'mountain'; tx: number; ty: number };

/** Duración de cada efecto (ms). */
const EFFECT_MS = { shot: 300, hit: 180, death: 900, destroyed: 1200 } as const;

export class Renderer {
  private terrain: HTMLCanvasElement | null = null;
  private mountains: { tx: number; ty: number }[] = [];

  /** Llamar al recibir un mapa nuevo. */
  setMap(state: ClientState): void {
    this.terrain = buildTerrainTexture(state);
    this.mountains = [];
    for (let ty = 0; ty < state.size; ty++)
      for (let tx = 0; tx < state.size; tx++) if (state.tile(tx, ty) === TILE_MOUNTAIN) this.mountains.push({ tx, ty });
  }

  get terrainTexture(): HTMLCanvasElement | null {
    return this.terrain;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    cam: Camera,
    state: ClientState,
    sel: SceneSelection,
    markers: Marker[],
    ghost: Ghost | null,
    now: number,
  ): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, cam.width, cam.height);
    if (!this.terrain) return;

    // Transformación de cámara: a partir de aquí se dibuja en px del mundo.
    const z = cam.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, dpr * (cam.width / 2) - cam.cx * z, dpr * (cam.height / 2) - cam.cy * z);

    // Terreno: la textura (1 texel = 1/TEX casilla) se proyecta con una transformación afín.
    ctx.save();
    ctx.transform(TILE_W / 2 / TEX, TILE_H / 2 / TEX, -TILE_W / 2 / TEX, TILE_H / 2 / TEX, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0);
    ctx.restore();

    // Objetos visibles.
    const vis = cam.visiblePx(100);
    const inView = (x: number, y: number) => {
      const p = worldToPx(x, y);
      return p.px >= vis.x0 && p.px <= vis.x1 && p.py >= vis.y0 && p.py <= vis.y1;
    };
    const list: Drawable[] = [];
    const flat: BuildingView[] = []; // granjas: van pegadas al suelo, debajo de todo
    for (const m of this.mountains)
      if (inView(m.tx + 0.5, m.ty + 0.5)) list.push({ depth: m.tx + m.ty + 1, k: 'mountain', tx: m.tx, ty: m.ty });
    for (const n of state.nodes.values())
      if (inView(n.tx + 0.5, n.ty + 0.5)) list.push({ depth: n.tx + n.ty + 1, k: 'node', n });
    for (const b of state.buildings.values()) {
      const s = BUILDING_DEFS[b.type].size;
      if (!inView(b.tx + s / 2, b.ty + s / 2)) continue;
      if (b.type === 'farm') flat.push(b);
      else list.push({ depth: b.tx + b.ty + s, k: 'building', b });
    }
    for (const cu of state.units.values()) {
      const p = state.unitPos(cu, now);
      if (inView(p.x, p.y)) list.push({ depth: p.x + p.y, k: 'unit', u: cu.v, x: p.x, y: p.y });
    }
    list.sort((a, b) => a.depth - b.depth);

    for (const b of flat) {
      if (b.progress < 1) drawConstruction(ctx, b, state.color(b.owner));
      else drawBuilding(ctx, b, state.color(b.owner));
    }

    // Marcas de selección en el suelo (debajo de todo).
    for (const d of list) {
      if (d.k === 'unit' && sel.units.has(d.u.id)) {
        const p = worldToPx(d.x, d.y);
        const r = d.u.type === 'scout' ? 13 : 10;
        ellipse(ctx, p.px, p.py, r, r / 2, null, d.u.owner === state.you ? '#ffffff' : '#ff8080', 1.5);
      } else if (d.k === 'node' && sel.node === d.n.id) {
        outlineFootprint(ctx, d.n.tx, d.n.ty, 1, '#ffe27a');
      }
    }
    if (sel.building !== null) {
      const b = state.buildings.get(sel.building);
      if (b) outlineFootprint(ctx, b.tx, b.ty, BUILDING_DEFS[b.type].size, b.owner === state.you ? '#ffffff' : '#ff8080');
    }

    for (const d of list) {
      switch (d.k) {
        case 'mountain': {
          const p = worldToPx(d.tx + 0.5, d.ty + 0.5);
          drawMountain(ctx, p.px, p.py, hash(d.tx, d.ty));
          break;
        }
        case 'node': {
          const p = worldToPx(d.n.tx + 0.5, d.n.ty + 0.5);
          drawNode(ctx, d.n, p.px, p.py);
          break;
        }
        case 'building': {
          const color = state.color(d.b.owner);
          if (d.b.progress < 1) drawConstruction(ctx, d.b, color);
          else drawBuilding(ctx, d.b, color);
          break;
        }
        case 'unit': {
          const p = worldToPx(d.x, d.y);
          drawUnit(ctx, d.u, p.px, p.py, state.color(d.u.owner), now);
          break;
        }
      }
    }

    // Barras de vida: de lo seleccionado y de todo lo que esté herido.
    for (const d of list) {
      if (d.k === 'unit') {
        const max = unitStats(state.faction(d.u.owner), d.u.type).hp;
        if (d.u.hp < max || sel.units.has(d.u.id)) {
          const p = worldToPx(d.x, d.y);
          healthBar(ctx, p.px, p.py - (d.u.type === 'scout' ? 36 : 32), d.u.hp / max);
        }
      } else if (d.k === 'building') {
        const max = state.maxHpOf(d.b);
        if (d.b.progress >= 1 && (d.b.hp < max || sel.building === d.b.id)) {
          const s = BUILDING_DEFS[d.b.type].size;
          const c = worldToPx(d.b.tx + s / 2, d.b.ty + s / 2);
          healthBar(ctx, c.px, c.py - buildingHeight(d.b.type) - 4, d.b.hp / max, 16 + s * 10);
        } else if (d.b.progress < 1) {
          const s = BUILDING_DEFS[d.b.type].size;
          const c = worldToPx(d.b.tx + s / 2, d.b.ty + s / 2);
          // Barra de progreso de construcción (azul).
          ctx.fillStyle = '#0d1b2a';
          ctx.fillRect(c.px - 15, c.py - 12, 30, 4);
          ctx.fillStyle = '#5ab0ff';
          ctx.fillRect(c.px - 15, c.py - 12, 30 * d.b.progress, 4);
        }
      }
    }
    for (const b of flat)
      if (b.progress < 1) {
        const c = worldToPx(b.tx + 1.5, b.ty + 1.5);
        ctx.fillStyle = '#0d1b2a';
        ctx.fillRect(c.px - 15, c.py - 4, 30, 4);
        ctx.fillStyle = '#5ab0ff';
        ctx.fillRect(c.px - 15, c.py - 4, 30 * b.progress, 4);
      }

    // Punto de reunión del edificio propio seleccionado.
    if (sel.building !== null) {
      const b = state.buildings.get(sel.building);
      if (b?.rally && b.owner === state.you) {
        const s = BUILDING_DEFS[b.type].size;
        const from = worldToPx(b.tx + s / 2, b.ty + s / 2), to = worldToPx(b.rally.x, b.rally.y);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.px, from.py);
        ctx.lineTo(to.px, to.py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(to.px - 1, to.py - 16, 2, 16);
        ctx.fillStyle = state.color(state.you);
        ctx.fillRect(to.px + 1, to.py - 16, 10, 7);
      }
    }

    this.drawEffects(ctx, state, now);

    // Previsualización del edificio a colocar.
    if (ghost) {
      const s = BUILDING_DEFS[ghost.type].size;
      fillFootprint(ctx, ghost.tx, ghost.ty, s, ghost.ok ? 'rgba(80,220,110,0.35)' : 'rgba(230,60,60,0.4)');
      outlineFootprint(ctx, ghost.tx, ghost.ty, s, ghost.ok ? '#7dff8a' : '#ff6b6b', 2);
      ctx.globalAlpha = 0.55;
      drawBuilding(ctx, { id: 0, owner: state.you, type: ghost.type, tx: ghost.tx, ty: ghost.ty, hp: 1, progress: 1, food: BUILDING_DEFS[ghost.type].food }, state.color(state.you));
      ctx.globalAlpha = 1;
    }

    // Marcas de órdenes (clic derecho).
    for (const m of markers) {
      const age = (now - m.t0) / 600;
      if (age >= 1) continue;
      const p = worldToPx(m.x, m.y);
      ctx.globalAlpha = 1 - age;
      ellipse(ctx, p.px, p.py, 6 + age * 10, 3 + age * 5, null, m.color, 2);
      ctx.globalAlpha = 1;
    }
  }

  /** Flechas, golpes, muertes y derrumbes. Los efectos viejos se descartan. */
  private drawEffects(ctx: CanvasRenderingContext2D, state: ClientState, now: number): void {
    state.effects = state.effects.filter(({ e, t0 }) => now - t0 < EFFECT_MS[e.k]);
    for (const { e, t0 } of state.effects) {
      const age = (now - t0) / EFFECT_MS[e.k];
      switch (e.k) {
        case 'shot': {
          // Flecha en arco desde el tirador hasta el blanco.
          const a = worldToPx(e.x1, e.y1), b = worldToPx(e.x2, e.y2);
          const x = a.px + (b.px - a.px) * age, y = a.py - 30 + (b.py - 12 - (a.py - 30)) * age - Math.sin(age * Math.PI) * 18;
          const ang = Math.atan2(b.py - a.py - 12, b.px - a.px);
          ctx.strokeStyle = '#3b2a1a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7);
          ctx.lineTo(x, y);
          ctx.stroke();
          break;
        }
        case 'hit': {
          const p = worldToPx(e.x, e.y);
          ctx.globalAlpha = 1 - age;
          ctx.fillStyle = '#fff3b0';
          for (let i = 0; i < 4; i++) {
            const ang = i * (Math.PI / 2) + 0.4;
            ctx.fillRect(p.px + Math.cos(ang) * 5 * (0.5 + age) - 1, p.py - 14 + Math.sin(ang) * 5 * (0.5 + age) - 1, 2, 2);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'death': {
          const p = worldToPx(e.x, e.y);
          ctx.globalAlpha = 0.8 * (1 - age);
          ellipse(ctx, p.px, p.py - 4 - age * 10, 6 + age * 8, 4 + age * 5, '#9a9a9a');
          ctx.globalAlpha = 1;
          break;
        }
        case 'destroyed': {
          const p = worldToPx(e.x, e.y);
          ctx.globalAlpha = 0.7 * (1 - age);
          for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2;
            const r = 8 + age * 14 * e.size;
            ellipse(ctx, p.px + Math.cos(ang) * r, p.py - 10 - age * 20 + Math.sin(ang) * r * 0.5, 10 + age * 10, 7 + age * 7, '#7d6a55');
          }
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
  }
}
