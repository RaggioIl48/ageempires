// Pantalla de juego: lienzo, cámara, dibujo, entrada, interfaz y minimapa.

import { BUILDING_DEFS } from '../../shared/data.ts';
import type { ServerMessage } from '../../shared/protocol.ts';
import { ChatBox, DiploPanel } from './diplomacy.ts';
import { Hud } from './hud.ts';
import { Input } from './input.ts';
import { Minimap } from './minimap.ts';
import type { Net } from './net.ts';
import { Renderer } from './render.ts';
import { ClientState } from './state.ts';
import { Camera } from './view.ts';

export class GameView {
  readonly state = new ClientState();
  readonly cam = new Camera();
  readonly renderer = new Renderer();
  readonly input: Input;
  readonly hud: Hud;
  private readonly minimap: Minimap;
  readonly diplo: DiploPanel;
  private readonly chat: ChatBox;
  private readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  private readonly ctx = this.canvas.getContext('2d', { alpha: false })!;
  private needCenter = false;
  private last = performance.now();
  private lastMini = 0;
  active = false;

  constructor(net: Net) {
    this.input = new Input(this.canvas, this.cam, this.state, net);
    this.hud = new Hud(this.state, this.input);
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.cam, this.state, this.renderer, this.input);
    this.diplo = new DiploPanel(this.state, net);
    this.chat = new ChatBox(this.state, net);
    this.input.onSelectionChange = () => this.hud.update();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Mensajes de la partida (bienvenida, cambios, jugadores). */
  handle(msg: ServerMessage): void {
    this.state.apply(msg, performance.now());
    if (msg.t === 'welcome') {
      this.renderer.setMap(this.state);
      this.minimap.reset();
      this.cam.mapSize = this.state.size;
      this.input.selectOnly(null);
      this.needCenter = true;
    } else if (msg.t === 'd') {
      if (this.needCenter) this.centerOnStart();
      this.input.prune();
    }
    this.hud.update();
    this.diplo.update();
    this.chat.update();
  }

  /** Al empezar: la cámara sobre el Centro Urbano propio (o el centro del mapa si es el profesor). */
  private centerOnStart(): void {
    this.needCenter = false;
    const tc = [...this.state.buildings.values()].find((b) => b.owner === this.state.you && b.type === 'town_center');
    if (tc) {
      const s = BUILDING_DEFS[tc.type].size;
      this.cam.centerOn(tc.tx + s / 2, tc.ty + s / 2 + 2);
    } else {
      this.cam.centerOn(this.state.size / 2, this.state.size / 2);
    }
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.cam.width = window.innerWidth;
    this.cam.height = window.innerHeight;
    this.canvas.width = Math.round(this.cam.width * dpr);
    this.canvas.height = Math.round(this.cam.height * dpr);
    this.canvas.style.width = `${this.cam.width}px`;
    this.canvas.style.height = `${this.cam.height}px`;
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.active || this.state.size === 0) return;
    this.input.update(dt);
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    this.renderer.draw(ctx, dpr, this.cam, this.state, this.input.sel, this.input.markers, this.input.ghost, now);

    // Rectángulo de selección (en coordenadas de pantalla).
    const box = this.input.dragBox;
    if (box) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1);
      const w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }

    // Quitar marcas de órdenes viejas.
    while (this.input.markers.length > 0 && now - this.input.markers[0].t0 > 700) this.input.markers.shift();

    if (now - this.lastMini > 100) {
      this.minimap.draw(now);
      this.chat.update(); // los mensajes viejos se desvanecen
      this.lastMini = now;
    }
  }
}
