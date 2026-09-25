// Ratón y teclado, como en los RTS clásicos:
//   clic izquierdo = seleccionar · arrastrar = selección múltiple (Mayús suma)
//   doble clic = todas las unidades de ese tipo en pantalla
//   clic derecho = orden según lo que haya debajo: mover, recolectar, atacar,
//                  construir/reparar, o punto de reunión (con un edificio elegido)
//   rueda = zoom · botón central = desplazar · WASD/flechas = cámara
//   H = Centro Urbano · . = trabajador inactivo · Esc = cancelar · Supr = eliminar
//   Q E R T = construir (con trabajadores) o entrenar (con un edificio)

import { BUILDING_DEFS, BUILD_MENU, type BuildingType } from '../../shared/data.ts';
import type { Net } from './net.ts';
import type { Ghost, Marker, SceneSelection } from './render.ts';
import { buildingHeight } from './sprites.ts';
import type { ClientState } from './state.ts';
import { Camera, worldToPx } from './view.ts';

export type Picked = { kind: 'unit' | 'building' | 'node'; id: number } | null;

const DRAG_THRESHOLD = 5; // px antes de considerar que es un arrastre
const KEY_PAN_SPEED = 900; // px de pantalla por segundo
const DOUBLE_CLICK_MS = 350;
/** Teclas de la cuadrícula de acciones (sin W/A/S/D, que mueven la cámara). */
export const ACTION_KEYS = ['Q', 'E', 'R', 'T', 'F', 'G'] as const;

/** ¿Qué objeto hay bajo el punto de la pantalla? Las unidades tienen prioridad. */
export function pick(state: ClientState, cam: Camera, sx: number, sy: number, now: number): Picked {
  const { px, py } = cam.screenToPx(sx, sy);
  let best: Picked = null;
  let bestDepth = -Infinity;
  for (const cu of state.units.values()) {
    const p = state.unitPos(cu, now);
    const w = worldToPx(p.x, p.y);
    const half = cu.v.type === 'scout' ? 13 : 9, top = cu.v.type === 'scout' ? 32 : 28;
    if (px >= w.px - half && px <= w.px + half && py >= w.py - top && py <= w.py + 5 && p.x + p.y > bestDepth) {
      best = { kind: 'unit', id: cu.v.id };
      bestDepth = p.x + p.y;
    }
  }
  if (best) return best;
  const world = cam.screenToWorld(sx, sy);
  for (const b of state.buildings.values()) {
    const s = BUILDING_DEFS[b.type].size;
    const L = worldToPx(b.tx, b.ty + s), R = worldToPx(b.tx + s, b.ty), T = worldToPx(b.tx, b.ty), B = worldToPx(b.tx + s, b.ty + s);
    const insideFootprint = world.x >= b.tx && world.x < b.tx + s && world.y >= b.ty && world.y < b.ty + s;
    const inBox = b.type !== 'farm' && px >= L.px && px <= R.px && py >= T.py - buildingHeight(b.type) + 10 && py <= B.py;
    if ((insideFootprint || inBox) && b.tx + b.ty + s > bestDepth) {
      best = { kind: 'building', id: b.id };
      bestDepth = b.tx + b.ty + s;
    }
  }
  for (const n of state.nodes.values()) {
    const w = worldToPx(n.tx + 0.5, n.ty + 0.5);
    const top = n.type === 'tree' ? 42 : 16;
    if (px >= w.px - 13 && px <= w.px + 13 && py >= w.py - top && py <= w.py + 6 && n.tx + n.ty + 1 > bestDepth) {
      best = { kind: 'node', id: n.id };
      bestDepth = n.tx + n.ty + 1;
    }
  }
  return best;
}

export class Input {
  readonly sel: SceneSelection = { units: new Set(), building: null, node: null };
  readonly markers: Marker[] = [];
  /** Rectángulo de selección en pantalla mientras se arrastra. */
  dragBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Edificio que se está por colocar. */
  ghost: Ghost | null = null;
  onSelectionChange: () => void = () => {};

  private keys = new Set<string>();
  private leftDown: { x: number; y: number } | null = null;
  private panFrom: { x: number; y: number } | null = null;
  private lastClick = { time: 0, id: 0 };
  private idleCursor = 0;
  private mouse = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: Camera,
    private state: ClientState,
    private net: Net,
  ) {
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Llamar cada fotograma: cámara con teclado y posición de la previsualización. */
  update(dt: number): void {
    let dx = 0, dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (dx || dy) this.cam.pan(dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
    if (this.ghost) this.moveGhost();
  }

  // ---------- Selección ----------

  /** Unidades seleccionadas que son del jugador (solo a esas se les dan órdenes). */
  ownSelected(): number[] {
    return [...this.sel.units].filter((id) => this.state.units.get(id)?.v.owner === this.state.you);
  }

  ownWorkersSelected(): number[] {
    return this.ownSelected().filter((id) => this.state.units.get(id)?.v.type === 'worker');
  }

  /** Edificio propio seleccionado (terminado o no). */
  ownBuilding() {
    const b = this.sel.building !== null ? this.state.buildings.get(this.sel.building) : undefined;
    return b && b.owner === this.state.you ? b : undefined;
  }

  selectOnly(p: Picked): void {
    this.sel.units.clear();
    this.sel.building = null;
    this.sel.node = null;
    if (p?.kind === 'unit') this.sel.units.add(p.id);
    else if (p?.kind === 'building') this.sel.building = p.id;
    else if (p?.kind === 'node') this.sel.node = p.id;
    this.ghost = null;
    this.onSelectionChange();
  }

  /** Quita de la selección lo que ya no existe (recurso agotado, unidad muerta…). */
  prune(): void {
    let changed = false;
    for (const id of this.sel.units)
      if (!this.state.units.has(id)) {
        this.sel.units.delete(id);
        changed = true;
      }
    if (this.sel.node !== null && !this.state.nodes.has(this.sel.node)) {
      this.sel.node = null;
      changed = true;
    }
    if (this.sel.building !== null && !this.state.buildings.has(this.sel.building)) {
      this.sel.building = null;
      changed = true;
    }
    if (this.ghost && this.ownWorkersSelected().length === 0) this.ghost = null;
    if (changed) this.onSelectionChange();
  }

  // ---------- Acciones (botones y teclas) ----------

  stopSelected(): void {
    const ids = this.ownSelected();
    if (ids.length > 0) this.net.command({ kind: 'stop', unitIds: ids });
  }

  deleteSelected(): void {
    const ids = this.ownSelected();
    const b = this.ownBuilding();
    if (b) ids.push(b.id);
    if (ids.length > 0) this.net.command({ kind: 'delete', ids });
  }

  /** Empieza a colocar un edificio (sigue al ratón hasta hacer clic). */
  startPlacing(type: BuildingType): void {
    if (this.ownWorkersSelected().length === 0) return;
    this.ghost = { type, tx: 0, ty: 0, ok: false };
    this.moveGhost();
    this.onSelectionChange();
  }

  train(index: number): void {
    const b = this.ownBuilding();
    if (!b || b.progress < 1) return;
    const unit = BUILDING_DEFS[b.type].trains[index];
    if (unit) this.net.command({ kind: 'train', buildingId: b.id, unit });
  }

  cancelTrain(index: number): void {
    const b = this.ownBuilding();
    if (b) this.net.command({ kind: 'cancelTrain', buildingId: b.id, index });
  }

  /** Selecciona el siguiente trabajador inactivo y centra la cámara en él. */
  nextIdleWorker(): void {
    const idle = [...this.state.units.values()].filter((u) => u.v.owner === this.state.you && u.v.state === 'idle' && u.v.type === 'worker');
    if (idle.length === 0) return;
    const u = idle[this.idleCursor++ % idle.length];
    this.selectOnly({ kind: 'unit', id: u.v.id });
    this.cam.centerOn(u.v.x, u.v.y);
  }

  goHome(): void {
    const tc = [...this.state.buildings.values()].find((b) => b.owner === this.state.you && b.type === 'town_center');
    if (!tc) return;
    const s = BUILDING_DEFS[tc.type].size;
    this.selectOnly({ kind: 'building', id: tc.id });
    this.cam.centerOn(tc.tx + s / 2, tc.ty + s / 2);
  }

  /** Orden contextual en un punto del mundo (clic derecho en el mapa o minimapa). */
  commandAt(x: number, y: number, target: Picked): void {
    const now = performance.now();
    const ids = this.ownSelected();
    const workers = this.ownWorkersSelected();
    const mark = (mx: number, my: number, color: string) => this.markers.push({ x: mx, y: my, color, t0: now });

    // Solo un edificio propio elegido: clic derecho = punto de reunión.
    if (ids.length === 0) {
      const b = this.ownBuilding();
      if (b && BUILDING_DEFS[b.type].trains.length > 0) {
        // Sobre un recurso: se apunta a SU casilla (el dibujo sobresale hacia arriba
        // y el punto bajo el ratón puede caer en la casilla de atrás).
        const n = target?.kind === 'node' ? this.state.nodes.get(target.id) : undefined;
        const rx = n ? n.tx + 0.5 : x, ry = n ? n.ty + 0.5 : y;
        this.net.command({ kind: 'rally', buildingId: b.id, x: rx, y: ry });
        mark(rx, ry, '#ffffff');
      }
      return;
    }

    if (target?.kind === 'unit' || target?.kind === 'building') {
      const owner =
        target.kind === 'unit' ? this.state.units.get(target.id)?.v.owner : this.state.buildings.get(target.id)?.owner;
      if (owner !== undefined && owner !== this.state.you && this.state.relation(this.state.you, owner) === 'war') {
        this.net.command({ kind: 'attack', unitIds: ids, targetId: target.id });
        mark(x, y, '#ff5252');
        return;
      }
      if (target.kind === 'building' && workers.length > 0) {
        const b = this.state.buildings.get(target.id)!;
        const s = BUILDING_DEFS[b.type].size;
        const damaged = b.hp < this.state.maxHpOf(b);
        if (b.progress < 1 || damaged) {
          this.net.command({ kind: 'construct', unitIds: workers, targetId: b.id });
          mark(b.tx + s / 2, b.ty + s / 2, '#5ab0ff');
          return;
        }
        if (b.type === 'farm') {
          this.net.command({ kind: 'gather', unitIds: workers, targetId: b.id });
          mark(b.tx + s / 2, b.ty + s / 2, '#ffe27a');
          return;
        }
      }
    }
    if (target?.kind === 'node' && workers.length > 0) {
      const n = this.state.nodes.get(target.id)!;
      this.net.command({ kind: 'gather', unitIds: workers, targetId: target.id });
      mark(n.tx + 0.5, n.ty + 0.5, '#ffe27a');
      return;
    }
    this.net.command({ kind: 'move', unitIds: ids, x, y });
    mark(x, y, '#7dff8a');
  }

  // ---------- Eventos ----------

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private moveGhost(): void {
    if (!this.ghost) return;
    const s = BUILDING_DEFS[this.ghost.type].size;
    const w = this.cam.screenToWorld(this.mouse.x, this.mouse.y);
    this.ghost.tx = Math.round(w.x - s / 2);
    this.ghost.ty = Math.round(w.y - s / 2);
    this.ghost.ok = this.state.canPlace(this.ghost.type, this.ghost.tx, this.ghost.ty);
  }

  private onMouseDown(e: MouseEvent): void {
    const p = this.local(e);
    this.mouse = p;
    if (this.ghost) {
      if (e.button === 0) this.placeGhost(e.shiftKey);
      else if (e.button === 2) this.ghost = null; // clic derecho cancela
      this.onSelectionChange();
      return;
    }
    if (e.button === 0) this.leftDown = p;
    else if (e.button === 1) {
      e.preventDefault(); // evita el desplazamiento automático del navegador
      this.panFrom = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      const w = this.cam.screenToWorld(p.x, p.y);
      this.commandAt(w.x, w.y, pick(this.state, this.cam, p.x, p.y, performance.now()));
    }
  }

  /** Coloca el edificio de la previsualización. Con Mayús se pueden poner varios seguidos. */
  private placeGhost(keepPlacing: boolean): void {
    const g = this.ghost!;
    this.moveGhost();
    if (!g.ok) return;
    const workers = this.ownWorkersSelected();
    this.net.command({ kind: 'build', unitIds: workers, building: g.type, tx: g.tx, ty: g.ty });
    const s = BUILDING_DEFS[g.type].size;
    this.markers.push({ x: g.tx + s / 2, y: g.ty + s / 2, color: '#5ab0ff', t0: performance.now() });
    if (!keepPlacing) this.ghost = null;
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.panFrom) {
      this.cam.pan(this.panFrom.x - e.clientX, this.panFrom.y - e.clientY);
      this.panFrom = { x: e.clientX, y: e.clientY };
    }
    const p = this.local(e);
    this.mouse = p;
    if (this.leftDown) {
      if (this.dragBox || Math.hypot(p.x - this.leftDown.x, p.y - this.leftDown.y) > DRAG_THRESHOLD)
        this.dragBox = { x0: this.leftDown.x, y0: this.leftDown.y, x1: p.x, y1: p.y };
    }
    this.updateCursor(p);
  }

  /** Cursor según lo que haría el clic derecho: espada (atacar), mano (trabajar). */
  private updateCursor(p: { x: number; y: number }): void {
    if (isOutsideCanvas(p, this.canvas)) return;
    let cursor = 'default';
    if (this.ghost) cursor = 'copy';
    else if (this.ownSelected().length > 0) {
      const t = pick(this.state, this.cam, p.x, p.y, performance.now());
      const owner = t?.kind === 'unit' ? this.state.units.get(t.id)?.v.owner : t?.kind === 'building' ? this.state.buildings.get(t.id)?.owner : undefined;
      if (owner !== undefined && owner !== this.state.you && this.state.relation(this.state.you, owner) === 'war') cursor = 'crosshair';
      else if (t && this.ownWorkersSelected().length > 0 && t.kind !== 'unit') cursor = 'pointer';
    }
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) this.panFrom = null;
    if (e.button !== 0 || !this.leftDown) return;
    const p = this.local(e);
    const now = performance.now();
    if (this.dragBox) this.boxSelect(this.dragBox, e.shiftKey, now);
    else this.clickSelect(p.x, p.y, e.shiftKey, now);
    this.dragBox = null;
    this.leftDown = null;
  }

  private clickSelect(sx: number, sy: number, additive: boolean, now: number): void {
    const target = pick(this.state, this.cam, sx, sy, now);
    const isDouble = target?.kind === 'unit' && this.lastClick.id === target.id && now - this.lastClick.time < DOUBLE_CLICK_MS;
    this.lastClick = { time: now, id: target?.id ?? 0 };

    if (isDouble) {
      // Doble clic: todas las unidades propias del mismo tipo que se ven en pantalla.
      const type = this.state.units.get(target!.id)!.v.type;
      this.sel.units.clear();
      for (const cu of this.state.units.values()) {
        if (cu.v.owner !== this.state.you || cu.v.type !== type) continue;
        const s = this.cam.worldToScreen(cu.v.x, cu.v.y);
        if (s.sx >= 0 && s.sy >= 0 && s.sx <= this.cam.width && s.sy <= this.cam.height) this.sel.units.add(cu.v.id);
      }
      this.onSelectionChange();
      return;
    }
    if (additive && target?.kind === 'unit' && this.state.units.get(target.id)?.v.owner === this.state.you) {
      if (this.sel.units.has(target.id)) this.sel.units.delete(target.id);
      else this.sel.units.add(target.id);
      this.sel.building = null;
      this.sel.node = null;
      this.onSelectionChange();
      return;
    }
    this.selectOnly(target);
  }

  private boxSelect(box: { x0: number; y0: number; x1: number; y1: number }, additive: boolean, now: number): void {
    const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
    if (!additive) this.sel.units.clear();
    this.sel.building = null;
    this.sel.node = null;
    for (const cu of this.state.units.values()) {
      if (cu.v.owner !== this.state.you) continue;
      const p = this.state.unitPos(cu, now);
      const s = this.cam.worldToScreen(p.x, p.y);
      // Se usa el centro del cuerpo, no los pies.
      const cy = s.sy - 10 * this.cam.zoom;
      if (s.sx >= x0 && s.sx <= x1 && cy >= y0 && cy <= y1) this.sel.units.add(cu.v.id);
    }
    this.onSelectionChange();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    this.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    switch (e.code) {
      case 'Escape':
        if (this.ghost) {
          this.ghost = null;
          this.onSelectionChange();
        } else this.selectOnly(null);
        return;
      case 'KeyH':
        this.goHome();
        return;
      case 'Period':
      case 'NumpadDecimal':
        this.nextIdleWorker();
        return;
      case 'Delete':
        this.deleteSelected();
        return;
    }
    // Cuadrícula de acciones: construir con trabajadores, entrenar con un edificio.
    const slot = ACTION_KEYS.indexOf(e.key.toUpperCase() as (typeof ACTION_KEYS)[number]);
    if (slot < 0) return;
    if (this.ownWorkersSelected().length > 0) {
      const type = BUILD_MENU[slot];
      if (type) this.startPlacing(type);
    } else if (this.ownBuilding()) {
      this.train(slot);
    }
  }
}

/** ¿El puntero está fuera del lienzo del mapa (sobre la interfaz)? */
function isOutsideCanvas(p: { x: number; y: number }, canvas: HTMLCanvasElement): boolean {
  return p.x < 0 || p.y < 0 || p.x > canvas.clientWidth || p.y > canvas.clientHeight;
}
