// Proyección isométrica (2:1) y cámara.
// Coordenadas del mundo = casillas (x, y). "px" = píxeles del mundo antes del zoom.

import type { HeightField } from '../../shared/terrain.ts';

export const TILE_W = 64;
export const TILE_H = 32;

/** Píxeles de altura por cada nivel del terreno (colinas). */
export const ELEV_PX = 22;

let field: HeightField | null = null;
/** Relieve del mapa actual: todo lo que se dibuja con worldToPx queda sobre las colinas. */
export function setHeightField(f: HeightField | null): void {
  field = f;
}
export const heightAt = (x: number, y: number) => (field ? field.at(x, y) : 0);

/** Posición en pantalla (px del mundo) de un punto del suelo, contando la altura. */
export function worldToPx(x: number, y: number): { px: number; py: number } {
  return { px: (x - y) * (TILE_W / 2), py: (x + y) * (TILE_H / 2) - heightAt(x, y) * ELEV_PX };
}

/** Igual, pero como si todo fuera llano. */
export function flatToPx(x: number, y: number): { px: number; py: number } {
  return { px: (x - y) * (TILE_W / 2), py: (x + y) * (TILE_H / 2) };
}

export function pxToWorld(px: number, py: number): { x: number; y: number } {
  return { x: py / TILE_H + px / TILE_W, y: py / TILE_H - px / TILE_W };
}

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;

export class Camera {
  /** Centro de la pantalla, en px del mundo. */
  cx = 0;
  cy = 0;
  zoom = 1;
  width = 1; // tamaño de la pantalla (px CSS)
  height = 1;
  mapSize = 1;

  screenToPx(sx: number, sy: number): { px: number; py: number } {
    return { px: (sx - this.width / 2) / this.zoom + this.cx, py: (sy - this.height / 2) / this.zoom + this.cy };
  }

  pxToScreen(px: number, py: number): { sx: number; sy: number } {
    return { sx: (px - this.cx) * this.zoom + this.width / 2, sy: (py - this.cy) * this.zoom + this.height / 2 };
  }

  /** Punto del suelo bajo la pantalla: se busca contando las colinas (unas pocas vueltas). */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { px, py } = this.screenToPx(sx, sy);
    let w = pxToWorld(px, py);
    for (let i = 0; i < 4; i++) w = pxToWorld(px, py + heightAt(w.x, w.y) * ELEV_PX);
    return w;
  }

  worldToScreen(x: number, y: number): { sx: number; sy: number } {
    const { px, py } = worldToPx(x, y);
    return this.pxToScreen(px, py);
  }

  centerOn(x: number, y: number): void {
    const { px, py } = worldToPx(x, y);
    this.cx = px;
    this.cy = py;
    this.clamp();
  }

  pan(dsx: number, dsy: number): void {
    this.cx += dsx / this.zoom;
    this.cy += dsy / this.zoom;
    this.clamp();
  }

  /** Zoom manteniendo fijo el punto de la pantalla bajo el cursor. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToPx(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToPx(sx, sy);
    this.cx += before.px - after.px;
    this.cy += before.py - after.py;
    this.clamp();
  }

  /** Zoom suave (como en Total War): la rueda fija un objetivo y la cámara llega deslizándose. */
  private zoomGoal = 0;
  private zoomAnchor = { sx: 0, sy: 0 };

  /** La rueda: acumula el objetivo de zoom (con el punto bajo el cursor fijo). */
  zoomSmooth(sx: number, sy: number, factor: number): void {
    const from = this.zoomGoal || this.zoom;
    this.zoomGoal = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * factor));
    this.zoomAnchor = { sx, sy };
  }

  /** Llamar cada fotograma: acerca el zoom a su objetivo (llega en ~0,2 s, sin saltos). */
  update(dt: number): void {
    if (!this.zoomGoal) return;
    const k = 1 - Math.exp(-dt * 16);
    const z = this.zoom + (this.zoomGoal - this.zoom) * k;
    const done = Math.abs(this.zoomGoal - z) < 0.002;
    this.zoomAt(this.zoomAnchor.sx, this.zoomAnchor.sy, (done ? this.zoomGoal : z) / this.zoom);
    if (done) this.zoomGoal = 0;
  }

  /** El centro de la cámara no puede salir del rombo del mapa. */
  clamp(): void {
    const w = pxToWorld(this.cx, this.cy);
    if (w.x >= 0 && w.y >= 0 && w.x <= this.mapSize && w.y <= this.mapSize) return; // dentro: no se toca (las colinas suben la vista)
    const x = Math.min(this.mapSize, Math.max(0, w.x));
    const y = Math.min(this.mapSize, Math.max(0, w.y));
    const p = flatToPx(x, y);
    this.cx = p.px;
    this.cy = p.py;
  }

  /** Rectángulo visible en px del mundo (con margen). */
  visiblePx(margin = 64): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.screenToPx(0, 0);
    const b = this.screenToPx(this.width, this.height);
    return { x0: a.px - margin, y0: a.py - margin, x1: b.px + margin, y1: b.py + margin * 2 };
  }
}
