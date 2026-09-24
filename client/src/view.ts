// Proyección isométrica (2:1) y cámara.
// Coordenadas del mundo = casillas (x, y). "px" = píxeles del mundo antes del zoom.

export const TILE_W = 64;
export const TILE_H = 32;

export function worldToPx(x: number, y: number): { px: number; py: number } {
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

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { px, py } = this.screenToPx(sx, sy);
    return pxToWorld(px, py);
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

  /** El centro de la cámara no puede salir del rombo del mapa. */
  clamp(): void {
    const w = pxToWorld(this.cx, this.cy);
    const x = Math.min(this.mapSize, Math.max(0, w.x));
    const y = Math.min(this.mapSize, Math.max(0, w.y));
    const p = worldToPx(x, y);
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
