// Ratón y teclado, como en los RTS clásicos:
//   clic izquierdo = seleccionar · arrastrar = selección múltiple (Mayús suma)
//   doble clic = todas las unidades de ese tipo en pantalla
//   clic derecho = orden según lo que haya debajo: mover, recolectar, atacar,
//                  construir/reparar, o punto de reunión (con un edificio elegido)
//   rueda = zoom · botón central = desplazar · WASD/flechas = cámara
//   H = Centro Urbano · . = trabajador inactivo · Esc = cancelar · Supr = eliminar
//   Q E R T F G Z X C V B N M = construir (con trabajadores) o entrenar/investigar (con un edificio)
//   Muralla: clic y arrastrar dibuja una muralla larga con una sola orden

import {
  BUILDING_DEFS,
  BUILD_MENU,
  TECH_DEFS,
  buildingAvailable,
  unitAvailable,
  type BuildingType,
  type TechId,
  type TradeResource,
  type UnitType,
  TRADE_RESOURCES,
} from '../../shared/data.ts';
import type { BuildingView } from '../../shared/protocol.ts';
import { hasTech } from '../../shared/stats.ts';
import { wallLine } from '../../shared/wall.ts';
import type { Net } from './net.ts';
import type { Ghost, Marker, SceneSelection } from './render.ts';
import { buildingHeight, UNIT_LOOK } from './sprites.ts';
import type { ClientState } from './state.ts';
import { Camera, worldToPx } from './view.ts';

export type Picked = { kind: 'unit' | 'building' | 'node'; id: number } | null;

const DRAG_THRESHOLD = 5; // px antes de considerar que es un arrastre
const KEY_PAN_SPEED = 900; // px de pantalla por segundo
const DOUBLE_CLICK_MS = 350;
/** Teclas de la cuadrícula de acciones (sin W/A/S/D, que mueven la cámara). */
export const ACTION_KEYS = ['Q', 'E', 'R', 'T', 'F', 'G', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'] as const;

/** Lo que se puede hacer con un edificio: entrenar, investigar o comerciar (Mercado). */
export type BuildingAction =
  | { kind: 'train'; unit: UnitType }
  | { kind: 'research'; tech: TechId }
  | { kind: 'trade'; resource: TradeResource; buy: boolean };

/** ¿Qué objeto hay bajo el punto de la pantalla? Las unidades tienen prioridad. */
export function pick(state: ClientState, cam: Camera, sx: number, sy: number, now: number): Picked {
  const { px, py } = cam.screenToPx(sx, sy);
  let best: Picked = null;
  let bestDepth = -Infinity;
  for (const cu of state.units.values()) {
    const p = state.unitPos(cu, now);
    const w = worldToPx(p.x, p.y);
    const { half, top } = UNIT_LOOK[cu.v.type];
    const depth = p.x + p.y + (cu.v.type === 'airplane' ? 10_000 : 0); // los aviones van encima
    if (px >= w.px - half && px <= w.px + half && py >= w.py - top && py <= w.py + 5 && depth > bestDepth) {
      best = { kind: 'unit', id: cu.v.id };
      bestDepth = depth;
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
  /** Casilla donde empezó a arrastrarse una muralla. */
  private wallStart: { tx: number; ty: number } | null = null;
  /** true mientras se arrastra con el botón apretado (si se suelta en la misma casilla, se espera el segundo clic). */
  private wallDragging = false;

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

  /** Edificios que se pueden construir en la era actual (incluye el edificio único del propio pueblo). */
  buildMenu(): BuildingType[] {
    const s = this.state;
    return BUILD_MENU.filter((t) => buildingAvailable(t, s.eraOf(s.you), s.faction(s.you)));
  }

  /** Unidades y tecnologías disponibles ahora en un edificio propio. */
  buildingActions(b: BuildingView): BuildingAction[] {
    const s = this.state;
    const era = s.eraOf(s.you), mask = s.techsOf(s.you);
    const def = BUILDING_DEFS[b.type];
    const out: BuildingAction[] = def.trains.filter((u) => unitAvailable(u, era, s.faction(s.you))).map((unit) => ({ kind: 'train', unit }));
    const queued = new Set<TechId>();
    for (const o of s.buildings.values()) if (o.owner === s.you) for (const q of o.queue ?? []) if (q.tech) queued.add(q.tech);
    for (const tech of def.researches) {
      const t = TECH_DEFS[tech];
      if (hasTech(mask, tech) || queued.has(tech)) continue;
      if (t.faction && t.faction !== s.faction(s.you)) continue;
      if (t.advancesTo !== undefined ? t.advancesTo !== era + 1 : era < t.era) continue;
      out.push({ kind: 'research', tech });
    }
    if (def.market) for (const resource of TRADE_RESOURCES) for (const buy of [true, false]) out.push({ kind: 'trade', resource, buy });
    return out;
  }

  /** ¿Tiene el jugador un edificio terminado de este tipo? (requisito de algunas tecnologías) */
  hasFinished(type: BuildingType): boolean {
    for (const b of this.state.buildings.values()) if (b.owner === this.state.you && b.type === type && b.progress >= 1) return true;
    return false;
  }

  /** Botón número `index` del edificio elegido: entrenar o investigar. */
  act(index: number): void {
    const b = this.ownBuilding();
    if (!b || b.progress < 1) return;
    const a = this.buildingActions(b)[index];
    if (a?.kind === 'train') this.net.command({ kind: 'train', buildingId: b.id, unit: a.unit });
    else if (a?.kind === 'research') this.net.command({ kind: 'research', buildingId: b.id, tech: a.tech });
    else if (a?.kind === 'trade') this.net.command({ kind: 'trade', buildingId: b.id, resource: a.resource, buy: a.buy });
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
    if (this.wallStart) this.updateWallLine();
  }

  private onMouseDown(e: MouseEvent): void {
    const p = this.local(e);
    this.mouse = p;
    if (this.ghost) {
      if (e.button === 0 && this.ghost.type === 'wall') {
        // Muralla como en AoE: primer clic = inicio, segundo clic = final (o arrastrar y soltar).
        this.moveGhost();
        if (this.wallStart) return this.finishWall(e.shiftKey);
        this.wallStart = { tx: this.ghost.tx, ty: this.ghost.ty };
        this.wallDragging = true;
        this.updateWallLine();
        this.onSelectionChange();
        return;
      }
      if (e.button === 0) this.placeGhost(e.shiftKey);
      else if (e.button === 2) {
        this.ghost = null; // clic derecho cancela
        this.wallStart = null;
      }
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

  /** ¿Ya se marcó el inicio de una muralla y falta el final? */
  get wallPending(): boolean {
    return this.wallStart !== null;
  }

  /** Recalcula la línea de muralla desde donde empezó hasta el ratón. */
  private updateWallLine(): void {
    const g = this.ghost;
    if (!g || !this.wallStart) return;
    g.line = wallLine(this.wallStart.tx, this.wallStart.ty, g.tx, g.ty).map((t) => ({
      ...t,
      ok: this.state.canPlace('wall', t.x, t.y),
    }));
  }

  /** Suelta el botón: una sola orden para toda la muralla. */
  private finishWall(keepPlacing: boolean): void {
    const g = this.ghost!, start = this.wallStart!;
    this.wallStart = null;
    this.wallDragging = false;
    this.moveGhost();
    const workers = this.ownWorkersSelected();
    if (workers.length > 0 && g.line?.some((t) => t.ok)) {
      this.net.command({ kind: 'wall', unitIds: workers, x0: start.tx, y0: start.ty, x1: g.tx, y1: g.ty });
      const now = performance.now();
      for (const t of g.line) if (t.ok) this.markers.push({ x: t.x + 0.5, y: t.y + 0.5, color: '#5ab0ff', t0: now });
    }
    g.line = undefined;
    if (!keepPlacing) this.ghost = null;
    this.onSelectionChange();
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0 && this.wallDragging && this.wallStart && this.ghost) {
      this.wallDragging = false;
      this.moveGhost();
      // Soltó en otra casilla: fue un arrastre y la muralla se construye ya.
      // Soltó en la misma: fue el primer clic, se espera el segundo.
      if (this.ghost.tx !== this.wallStart.tx || this.ghost.ty !== this.wallStart.ty) this.finishWall(e.shiftKey);
      return;
    }
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
          this.wallStart = null;
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
    // Cuadrícula de acciones: construir con trabajadores, entrenar o investigar con un edificio.
    const slot = ACTION_KEYS.indexOf(e.key.toUpperCase() as (typeof ACTION_KEYS)[number]);
    if (slot < 0) return;
    if (this.ownWorkersSelected().length > 0) {
      const type = this.buildMenu()[slot];
      if (type) this.startPlacing(type);
    } else if (this.ownBuilding()) {
      this.act(slot);
    }
  }
}

/** ¿El puntero está fuera del lienzo del mapa (sobre la interfaz)? */
function isOutsideCanvas(p: { x: number; y: number }, canvas: HTMLCanvasElement): boolean {
  return p.x < 0 || p.y < 0 || p.x > canvas.clientWidth || p.y > canvas.clientHeight;
}
