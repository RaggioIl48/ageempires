// Minimapa en forma de rombo (esquina inferior derecha).
// Clic/arrastre izquierdo = mover la cámara · clic derecho = ordenar movimiento.

import { BUILDING_DEFS, type NodeType } from '../../shared/data.ts';
import type { Input } from './input.ts';
import { TEX, type Renderer } from './render.ts';
import type { ClientState } from './state.ts';
import type { Camera } from './view.ts';

const NODE_DOT: Record<NodeType, string> = {
  tree: '#1f4d22',
  berries: '#d8434f',
  stone: '#c9c9c2',
  metal: '#8fb3d9',
};

export class Minimap {
  private base = document.createElement('canvas'); // terreno + recursos
  private baseVersion = -1;
  private lastBaseAt = 0;
  private dragging = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: Camera,
    private state: ClientState,
    private renderer: Renderer,
    private input: Input,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      const w = this.eventToWorld(e);
      if (e.button === 0) {
        this.dragging = true;
        this.cam.centerOn(w.x, w.y);
      } else if (e.button === 2) {
        this.input.commandAt(w.x, w.y, null);
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const w = this.eventToWorld(e);
      this.cam.centerOn(w.x, w.y);
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  private get W(): number {
    return this.canvas.clientWidth;
  }
  private get H(): number {
    return this.canvas.clientHeight;
  }
  /** Escala: px del minimapa por casilla (a lo largo de cada eje del rombo). */
  private get s(): number {
    return this.W / (2 * Math.max(1, this.state.size));
  }

  private toMini(x: number, y: number): { mx: number; my: number } {
    return { mx: (x - y) * this.s + this.W / 2, my: ((x + y) * this.s) / 2 };
  }

  private eventToWorld(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left - this.W / 2, my = e.clientY - r.top;
    const x = my / this.s + mx / (2 * this.s), y = my / this.s - mx / (2 * this.s);
    const n = this.state.size;
    return { x: Math.min(n, Math.max(0, x)), y: Math.min(n, Math.max(0, y)) };
  }

  /** Llamar al recibir un mapa nuevo: el fondo se redibuja de inmediato. */
  reset(): void {
    this.baseVersion = -1;
  }

  private rebuildBase(dpr: number): boolean {
    const tex = this.renderer.terrainTexture;
    if (!tex || this.W === 0) return false;
    this.base.width = Math.round(this.W * dpr);
    this.base.height = Math.round(this.H * dpr);
    const ctx = this.base.getContext('2d')!;
    const s = this.s;
    ctx.setTransform((dpr * s) / TEX, (dpr * s) / (2 * TEX), (-dpr * s) / TEX, (dpr * s) / (2 * TEX), (dpr * this.W) / 2, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tex, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const n of this.state.nodes.values()) {
      const p = this.toMini(n.tx + 0.5, n.ty + 0.5);
      ctx.fillStyle = NODE_DOT[n.type];
      ctx.fillRect(p.mx - 1, p.my - 0.75, 2, 1.5);
    }
    return true;
  }

  draw(now: number): void {
    const dpr = window.devicePixelRatio || 1;
    const wantW = Math.round(this.W * dpr), wantH = Math.round(this.H * dpr);
    if (this.canvas.width !== wantW || this.canvas.height !== wantH) {
      this.canvas.width = wantW;
      this.canvas.height = wantH;
      this.baseVersion = -1;
    }
    // Los recursos cambian a menudo; basta con redibujarlos una vez por segundo.
    if (this.baseVersion !== this.state.nodesVersion && (this.baseVersion === -1 || now - this.lastBaseAt > 1000)) {
      if (this.rebuildBase(dpr)) {
        this.baseVersion = this.state.nodesVersion;
        this.lastBaseAt = now;
      }
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const b of this.state.buildings.values()) {
      const s = BUILDING_DEFS[b.type].size;
      const p = this.toMini(b.tx + s / 2, b.ty + s / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(p.mx - 3.5, p.my - 3.5, 7, 7);
      ctx.fillStyle = this.state.color(b.owner);
      ctx.fillRect(p.mx - 2.5, p.my - 2.5, 5, 5);
    }
    for (const u of this.state.units.values()) {
      const p = this.toMini(u.v.x, u.v.y);
      ctx.fillStyle = this.state.color(u.v.owner);
      ctx.fillRect(p.mx - 1.25, p.my - 1.25, 2.5, 2.5);
    }

    // Batallas: círculo rojo que late.
    for (const b of this.state.battles) {
      const p = this.toMini(b.x, b.y);
      ctx.strokeStyle = `rgba(255,70,60,${0.5 + 0.5 * Math.abs(Math.sin(now / 300))})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.mx, p.my, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Lo que muestra la cámara.
    const corners = [
      this.cam.screenToWorld(0, 0),
      this.cam.screenToWorld(this.cam.width, 0),
      this.cam.screenToWorld(this.cam.width, this.cam.height),
      this.cam.screenToWorld(0, this.cam.height),
    ].map((w) => this.toMini(w.x, w.y));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.mx, c.my) : ctx.lineTo(c.mx, c.my)));
    ctx.closePath();
    ctx.stroke();
  }
}
