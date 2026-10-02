// Escena con Canvas 2D: terreno, objetos ordenados de atrás hacia adelante,
// selección, efectos de combate y previsualización de construcción.

import { BUILDING_DEFS, CREW_BONUS, RESOURCE_TYPES, TILE_MOUNTAIN, TILE_WATER, type BuildingType } from '../../shared/data.ts';
import type { BuildingView, NodeView, UnitView } from '../../shared/protocol.ts';
import { isUpgraded } from '../../shared/stats.ts';
import {
  UNIT_LOOK,
  buildingTop,
  drawBuilding,
  drawConstruction,
  drawMountain,
  drawNode,
  drawUnit,
  ellipse,
  fillFootprint,
  hash,
  buffRing,
  chevrons,
  generalBanner,
  healthBar,
  moraleBar,
  staminaBar,
  whiteFlag,
  outlineFootprint,
  RESOURCE_COLORS,
  setEraLookup,
  setWallLookup,
  unitTop,
  line,
  poly,
} from './sprites.ts';
import { drawDyingUnit } from './art.ts';
import type { ClientState } from './state.ts';
import { Camera, ELEV_PX, TILE_H, TILE_W, worldToPx } from './view.ts';
import { MAX_LEVEL, RANK_NAMES } from '../../shared/data.ts';

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
            else {
              // Más alto, pasto más seco y claro (se nota en el minimapa).
              const lv = state.height.level(tx, ty);
              c = [78 + tileNoise * 26 + r * 10 + lv * 16, 132 + tileNoise * 26 + r * 12 + lv * 7, 56 + tileNoise * 14 + r * 6 + lv * 2];
            }
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

/** Escala del terreno horneado (px del lienzo por px del mundo). */
const BAKE = 0.5;
/** Margen de arriba (px del mundo) para lo que las colinas levantan. */
const BAKE_TOP = MAX_LEVEL * ELEV_PX + 8;

/**
 * Terreno con relieve, "horneado" una vez: cada texel de la textura plana se proyecta a su
 * altura, de atrás hacia adelante (lo cercano tapa lo lejano), con luz desde arriba a la
 * izquierda: las laderas que miran a la luz se aclaran y las otras se oscurecen.
 */
export function bakeTerrain(state: ClientState, flat: HTMLCanvasElement): HTMLCanvasElement {
  const n = state.size, T = n * TEX, h = state.height;
  const src = flat.getContext('2d')!.getImageData(0, 0, T, T).data;
  const W = Math.ceil(n * TILE_W * BAKE), H = Math.ceil((n * TILE_H + BAKE_TOP + 8) * BAKE);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const hw = (TILE_W / 2 / TEX) * BAKE, hh = (TILE_H / 2 / TEX) * BAKE;
  for (let s = 0; s <= 2 * (T - 1); s++) {
    for (let gx = Math.max(0, s - T + 1); gx <= Math.min(s, T - 1); gx++) {
      const gy = s - gx;
      const x = (gx + 0.5) / TEX, y = (gy + 0.5) / TEX;
      const z = h.at(x, y);
      const cx = (x - y) * (TILE_W / 2) * BAKE + W / 2;
      const cy = ((x + y) * (TILE_H / 2) - z * ELEV_PX + BAKE_TOP) * BAKE;
      // Luz: pendiente en x (hacia la izquierda de la pantalla) e y.
      const gxh = h.at(x + 0.5, y) - h.at(x - 0.5, y), gyh = h.at(x, y + 0.5) - h.at(x, y - 0.5);
      let shade = Math.min(1.35, Math.max(0.55, 1 + 0.7 * gxh - 0.45 * gyh)) * (1 + 0.04 * z);
      // Curvas de nivel: una línea más oscura donde se pasa de un nivel a otro (como en un mapa).
      const lvl = Math.round(z), gx2 = h.at(x + 1 / TEX, y), gy2 = h.at(x, y + 1 / TEX);
      if (Math.round(gx2) !== lvl || Math.round(gy2) !== lvl) shade *= 0.8;
      // Lo que baja hacia adelante se rellena hacia abajo (sin huecos en las laderas).
      const drop = Math.max(0, (z - h.at(x + 1 / TEX, y + 1 / TEX)) * ELEV_PX * BAKE);
      const si = (gy * T + gx) * 4;
      const r = Math.min(255, src[si] * shade), g = Math.min(255, src[si + 1] * shade), b = Math.min(255, src[si + 2] * shade);
      const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(W - 1, Math.ceil(cx + hw));
      const y0 = Math.max(0, Math.floor(cy - hh)), y1 = Math.min(H - 1, Math.ceil(cy + hh + drop));
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const i = (py * W + px) * 4;
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = 255;
        }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------- Escena ----------

/** Color de selección según la relación: propio blanco, aliado verde, en paz amarillo, enemigo rojo. */
function ringColor(state: ClientState, owner: number): string {
  const rel = state.relationTo(owner);
  return rel === 'own' ? '#ffffff' : rel === 'ally' ? '#7dff8a' : rel === 'peace' ? '#ffe27a' : '#ff6b6b';
}

/** Frente que se está dibujando con el clic derecho. */
export interface FrontPreview {
  a: { x: number; y: number };
  b: { x: number; y: number };
  face: { x: number; y: number };
  spots: { x: number; y: number }[];
}

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
  /** Muralla que se está arrastrando: cada casilla y si se puede construir. */
  line?: { x: number; y: number; ok: boolean }[];
}

type Drawable =
  | { depth: number; k: 'unit'; u: UnitView; x: number; y: number; face: number; lift: number }
  | { depth: number; k: 'node'; n: NodeView }
  | { depth: number; k: 'building'; b: BuildingView }
  | { depth: number; k: 'mountain'; tx: number; ty: number };

/** Cuánto quedan los caídos en el suelo (ms). */
const CORPSE_MS = 4000;

/** Duración de cada efecto (ms). */
const EFFECT_MS = { shot: 300, hit: 180, flank: 900, ability: 1100, rank: 1600, death: 900, destroyed: 1200, gain: 1600 } as const;
/** Los disparos de cañón vuelan más lento y terminan en una explosión. */
const SHELL_MS = 600;
const effectMs = (e: { k: keyof typeof EFFECT_MS; s?: number; fl?: number }) =>
  e.k === 'shot' && e.s === 2 ? SHELL_MS : e.k === 'hit' && e.fl ? EFFECT_MS.flank : EFFECT_MS[e.k];

/** Píxeles que sube una unidad parada sobre una muralla. */
const WALL_LIFT = 30;

export class Renderer {
  private terrain: HTMLCanvasElement | null = null;
  private baked: HTMLCanvasElement | null = null;
  private mountains: { tx: number; ty: number }[] = [];

  /** Llamar al recibir un mapa nuevo. */
  setMap(state: ClientState): void {
    this.terrain = buildTerrainTexture(state);
    this.baked = bakeTerrain(state, this.terrain);
    this.mountains = [];
    for (let ty = 0; ty < state.size; ty++)
      for (let tx = 0; tx < state.size; tx++) if (state.tile(tx, ty) === TILE_MOUNTAIN) this.mountains.push({ tx, ty });
  }

  /** Velo de niebla casilla por casilla, siguiendo el relieve (esquinas a su altura). */
  private drawFog(ctx: CanvasRenderingContext2D, state: ClientState, vis: { x0: number; y0: number; x1: number; y1: number }): void {
    const n = state.size;
    const steps = 8;
    const paths: Path2D[] = Array.from({ length: steps + 1 }, () => new Path2D());
    const used = new Array<boolean>(steps + 1).fill(false);
    for (let ty = 0; ty < n; ty++)
      for (let tx = 0; tx < n; tx++) {
        const f = state.fogLevel[ty * n + tx];
        if (f <= 0.01) continue;
        const c = worldToPx(tx + 0.5, ty + 0.5);
        if (c.px < vis.x0 - 64 || c.px > vis.x1 + 64 || c.py < vis.y0 - 64 || c.py > vis.y1 + 96) continue;
        const k = Math.round(f * steps);
        const a = worldToPx(tx, ty), b = worldToPx(tx + 1, ty), d = worldToPx(tx + 1, ty + 1), e = worldToPx(tx, ty + 1);
        const p = paths[k];
        p.moveTo(a.px, a.py - 0.5);
        p.lineTo(b.px + 0.5, b.py);
        p.lineTo(d.px, d.py + 0.5);
        p.lineTo(e.px - 0.5, e.py);
        p.closePath();
        used[k] = true;
      }
    for (let k = 1; k <= steps; k++) {
      if (!used[k]) continue;
      const f = k / steps;
      // Lo que no se ve ahora: un velo oscuro (todo el mapa está a la vista, más apagado).
      ctx.fillStyle = `rgba(8,10,16,${Math.min(0.62, f * 1.25)})`;
      ctx.fill(paths[k]);
    }
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
    front: FrontPreview | null = null,
  ): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, cam.width, cam.height);
    if (!this.terrain) return;

    // Los edificios cambian de estilo con la era de su dueño.
    setEraLookup((id) => state.eraOf(id));
    // Murallas y puertas por casilla (para unir cada tramo con sus vecinos).
    const walls = new Map<number, number>();
    for (const b of state.buildings.values()) if (b.type === 'wall' || b.type === 'gate') walls.set(b.ty * 100_000 + b.tx, b.owner);
    setWallLookup((tx, ty, owner) => walls.get(ty * 100_000 + tx) === owner);

    // Transformación de cámara: a partir de aquí se dibuja en px del mundo.
    const z = cam.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, dpr * (cam.width / 2) - cam.cx * z, dpr * (cam.height / 2) - cam.cy * z);

    // Terreno con colinas (horneado al recibir el mapa).
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.baked) ctx.drawImage(this.baked, -(state.size * TILE_W) / 2, -BAKE_TOP, this.baked.width / BAKE, this.baked.height / BAKE);
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
      if (state.seen(n.tx + 0.5, n.ty + 0.5) && inView(n.tx + 0.5, n.ty + 0.5)) list.push({ depth: n.tx + n.ty + 1, k: 'node', n });
    for (const b of state.buildings.values()) {
      const s = BUILDING_DEFS[b.type].size;
      if (!inView(b.tx + s / 2, b.ty + s / 2)) continue;
      if (b.type === 'farm') flat.push(b);
      else list.push({ depth: b.tx + b.ty + s, k: 'building', b });
    }
    for (const cu of state.units.values()) {
      const p = state.unitPos(cu, now);
      // Los aviones se dibujan encima de todo.
      const flying = state.statsOf(cu.v.owner, cu.v.type).flies;
      // Sobre una muralla: el defensor arriba del todo; el que trepa, a media altura de la escala.
      const wallOwner = walls.get(Math.floor(p.y) * 100_000 + Math.floor(p.x));
      const lift = wallOwner === undefined ? 0 : cu.v.cl ? WALL_LIFT / 2 : WALL_LIFT;
      if (inView(p.x, p.y)) list.push({ depth: p.x + p.y + (flying ? 10_000 : 0) + (lift ? 0.9 : 0), k: 'unit', u: { ...cu.v, walk: cu.moving ? 1 : undefined, sp: cu.speed }, x: p.x, y: p.y, face: cu.face, lift });
    }
    list.sort((a, b) => a.depth - b.depth);

    for (const b of flat) {
      if (b.progress < 1) drawConstruction(ctx, b, state.color(b.owner), state.faction(b.owner));
      else drawBuilding(ctx, b, state.color(b.owner), state.faction(b.owner));
    }

    // Marcas de selección en el suelo (debajo de todo).
    for (const d of list) {
      if (d.k === 'unit' && sel.units.has(d.u.id)) {
        const p = worldToPx(d.x, d.y);
        const r = UNIT_LOOK[d.u.type].ring;
        ellipse(ctx, p.px, p.py - d.lift, r, r / 2, null, ringColor(state, d.u.owner), 1.5);
      } else if (d.k === 'node' && sel.node === d.n.id) {
        outlineFootprint(ctx, d.n.tx, d.n.ty, 1, '#ffe27a');
      }
    }
    if (sel.building !== null) {
      const b = state.buildings.get(sel.building);
      if (b) outlineFootprint(ctx, b.tx, b.ty, BUILDING_DEFS[b.type].size, ringColor(state, b.owner));
    }

    // Niebla de guerra: negro donde nunca se estuvo, velo gris donde no se ve ahora.
    if (state.fog) this.drawFog(ctx, state, vis);

    // Frente de formación que se está arrastrando: la línea, los puestos y una flecha hacia adelante.
    if (front) {
      const a = worldToPx(front.a.x, front.a.y), b = worldToPx(front.b.x, front.b.y);
      ctx.strokeStyle = 'rgba(125,255,138,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
      for (const s of front.spots) {
        const p = worldToPx(s.x, s.y);
        ellipse(ctx, p.px, p.py, 5, 2.5, 'rgba(125,255,138,0.35)', 'rgba(125,255,138,0.9)', 1);
      }
      const mx = (front.a.x + front.b.x) / 2, my = (front.a.y + front.b.y) / 2;
      const m = worldToPx(mx, my), t = worldToPx(mx + front.face.x * 2.2, my + front.face.y * 2.2);
      const ang = Math.atan2(t.py - m.py, t.px - m.px);
      ctx.beginPath();
      ctx.moveTo(m.px, m.py);
      ctx.lineTo(t.px, t.py);
      ctx.lineTo(t.px - Math.cos(ang - 0.5) * 9, t.py - Math.sin(ang - 0.5) * 9);
      ctx.moveTo(t.px, t.py);
      ctx.lineTo(t.px - Math.cos(ang + 0.5) * 9, t.py - Math.sin(ang + 0.5) * 9);
      ctx.stroke();
    }

    // Colina Sagrada: anillo dorado en la cima (del color de quien la tiene).
    const hill = state.victory.hill;
    if (hill) {
      const p = worldToPx(hill.x, hill.y);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -now / 90;
      const col = hill.contested ? '#ff6b5b' : hill.holder ? state.color(hill.holder) : '#f0c14b';
      ellipse(ctx, p.px, p.py, hill.r * 32 * Math.SQRT2, hill.r * 16 * Math.SQRT2, null, col, 2.5);
      ctx.restore();
      // Estandarte en la cima.
      line(ctx, p.px, p.py, p.px, p.py - 34, '#5a4a3a', 2);
      poly(ctx, [p.px, p.py - 34, p.px + 16, p.py - 30, p.px, p.py - 25], hill.holder ? state.color(hill.holder) : '#f0c14b');
    }

    // Campos de batalla: un anillo rojo con el radio de la batalla.
    for (const b of state.battles) {
      const p = worldToPx(b.x, b.y);
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -now / 60;
      ellipse(ctx, p.px, p.py, b.r * 32 * Math.SQRT2, b.r * 16 * Math.SQRT2, null, 'rgba(230,60,50,0.75)', 3);
      ctx.restore();
    }

    // Caídos en combate: su animación de morir, y se desvanecen.
    state.corpses = state.corpses.filter((c) => now - c.t0 < CORPSE_MS);
    for (const c of state.corpses) {
      const age = (now - c.t0) / 1000;
      const p = worldToPx(c.v.x, c.v.y);
      if (!inView(c.v.x, c.v.y)) continue;
      ctx.globalAlpha = Math.min(1, (CORPSE_MS / 1000 - age) / 1.2);
      drawDyingUnit(ctx, c.v, p.px, p.py, state.color(c.v.owner), state.faction(c.v.owner), c.face, age);
      ctx.globalAlpha = 1;
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
          if (d.b.progress < 1) drawConstruction(ctx, d.b, color, state.faction(d.b.owner));
          else drawBuilding(ctx, d.b, color, state.faction(d.b.owner));
          break;
        }
        case 'unit': {
          const p = worldToPx(d.x, d.y);
          p.py -= d.lift;
          if (d.u.buff) buffRing(ctx, p.px, p.py, d.u.buff, UNIT_LOOK[d.u.type].ring + 2, now);
          drawUnit(ctx, d.u, p.px, p.py, state.color(d.u.owner), now, state.faction(d.u.owner), isUpgraded(d.u.type, state.techsOf(d.u.owner)), d.face);
          break;
        }
      }
    }

    // Barras de vida: de lo seleccionado y de todo lo que esté herido.
    for (const d of list) {
      if (d.k === 'unit') {
        const max = state.statsOf(d.u.owner, d.u.type).hp;
        if (d.u.hp < max || sel.units.has(d.u.id)) {
          const p = worldToPx(d.x, d.y);
          healthBar(ctx, p.px, p.py - d.lift - unitTop(d.u.type, state.faction(d.u.owner)) - 4, d.u.hp / max);
        }
        const top = unitTop(d.u.type, state.faction(d.u.owner)) + d.lift;
        const p = worldToPx(d.x, d.y);
        // Aguante (amarillo) cuando la tropa está cansada.
        if (d.u.st !== undefined && d.u.st < 70 && !d.u.rout) staminaBar(ctx, p.px, p.py - top + 2, d.u.st / 100);
        // Moral (azul) bajo la vida cuando no está completa; bandera blanca si huye.
        if (d.u.morale !== undefined && !d.u.rout) moraleBar(ctx, p.px, p.py - top - 0.5, d.u.morale / 100);
        if (d.u.rout) whiteFlag(ctx, p.px, p.py - top - 6, now + d.u.id * 97);
        if (d.u.rank) chevrons(ctx, p.px - 13, p.py - top - 1, d.u.rank);
        if (d.u.type === 'general') generalBanner(ctx, p.px + 9, p.py - top + 6, state.color(d.u.owner), now + d.u.id * 31);
      } else if (d.k === 'building') {
        const max = state.maxHpOf(d.b);
        if (d.b.progress >= 1 && (d.b.hp < max || sel.building === d.b.id)) {
          const s = BUILDING_DEFS[d.b.type].size;
          const c = worldToPx(d.b.tx + s / 2, d.b.ty + s / 2);
          healthBar(ctx, c.px, c.py - buildingTop(d.b, state.faction(d.b.owner)) - 4, d.b.hp / max, 16 + s * 10);
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
    if (ghost?.line) {
      for (const t of ghost.line) {
        fillFootprint(ctx, t.x, t.y, 1, t.ok ? 'rgba(80,220,110,0.35)' : 'rgba(230,60,60,0.4)');
        if (!t.ok) continue;
        ctx.globalAlpha = 0.55;
        drawBuilding(ctx, { id: 0, owner: state.you, type: 'wall', tx: t.x, ty: t.y, hp: 1, progress: 1 }, state.color(state.you), state.faction(state.you));
        ctx.globalAlpha = 1;
      }
    } else if (ghost) {
      const s = BUILDING_DEFS[ghost.type].size;
      fillFootprint(ctx, ghost.tx, ghost.ty, s, ghost.ok ? 'rgba(80,220,110,0.35)' : 'rgba(230,60,60,0.4)');
      outlineFootprint(ctx, ghost.tx, ghost.ty, s, ghost.ok ? '#7dff8a' : '#ff6b6b', 2);
      ctx.globalAlpha = 0.55;
      drawBuilding(ctx, { id: 0, owner: state.you, type: ghost.type, tx: ghost.tx, ty: ghost.ty, hp: 1, progress: 1, stock: BUILDING_DEFS[ghost.type].field?.amount }, state.color(state.you), state.faction(state.you));
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
    state.effects = state.effects.filter(({ e, t0 }) => now - t0 < effectMs(e));
    for (const { e, t0 } of state.effects) {
      const age = (now - t0) / effectMs(e);
      switch (e.k) {
        case 'shot': {
          if (e.s === 1) {
            // Bala: trazo recto y rápido.
            const a = worldToPx(e.x1, e.y1), b = worldToPx(e.x2, e.y2);
            const x = a.px + (b.px - a.px) * age, y = a.py - 14 + (b.py - a.py) * age;
            const ang = Math.atan2(b.py - a.py, b.px - a.px);
            ctx.strokeStyle = '#ffe27a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(ang) * 6, y - Math.sin(ang) * 6);
            ctx.lineTo(x, y);
            ctx.stroke();
            break;
          }
          if (e.s === 2) {
            // Proyectil de cañón: arco alto y explosión al final.
            const a = worldToPx(e.x1, e.y1), b = worldToPx(e.x2, e.y2);
            if (age < 0.8) {
              const k = age / 0.8;
              const x = a.px + (b.px - a.px) * k, y = a.py - 16 + (b.py - 10 - (a.py - 16)) * k - Math.sin(k * Math.PI) * 40;
              ellipse(ctx, x, y, 2.5, 2.5, '#2b2b2b');
            } else {
              const k = (age - 0.8) / 0.2;
              ctx.globalAlpha = 1 - k;
              ellipse(ctx, b.px, b.py - 8, 6 + k * 10, 4 + k * 7, '#ff9f43');
              ellipse(ctx, b.px, b.py - 8, 3 + k * 5, 2 + k * 4, '#ffe27a');
              ctx.globalAlpha = 1;
            }
            break;
          }
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
          const spark = (now - t0) / EFFECT_MS.hit;
          if (spark < 1) {
          ctx.globalAlpha = 1 - spark;
          ctx.fillStyle = e.c ? '#ffb347' : '#fff3b0';
          // Golpe de carga: más chispas y más grandes.
          const n = e.c ? 8 : 4, spread = e.c ? 10 : 5, sz = e.c ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const ang = i * ((Math.PI * 2) / n) + 0.4;
            ctx.fillRect(p.px + Math.cos(ang) * spread * (0.5 + spark) - 1, p.py - 14 + Math.sin(ang) * spread * (0.5 + spark) - 1, sz, sz);
          }
          ctx.globalAlpha = 1;
          }
          if (e.fl) {
            // Golpe de costado o por la espalda (hace más daño y quiebra la moral).
            const a2 = age;
            ctx.globalAlpha = 1 - a2;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            const text = e.fl === 2 ? 'Rear!' : 'Flank!';
            ctx.strokeText(text, p.px, p.py - 34 - a2 * 14);
            ctx.fillStyle = e.fl === 2 ? '#ff6b5b' : '#ffb347';
            ctx.fillText(text, p.px, p.py - 34 - a2 * 14);
            ctx.textAlign = 'start';
            ctx.globalAlpha = 1;
          }
          break;
        }
        case 'rank': {
          // Ascenso de veteranía: texto dorado que sube.
          const p = worldToPx(e.x, e.y);
          const y = p.py - 40 - age * 22;
          ctx.globalAlpha = Math.min(1, (1 - age) * 2);
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          const text = `▲ ${RANK_NAMES[e.r] ?? 'Veteran'}!`;
          ctx.strokeText(text, p.px, y);
          ctx.fillStyle = '#f0c14b';
          ctx.fillText(text, p.px, y);
          ctx.textAlign = 'start';
          ctx.globalAlpha = 1;
          break;
        }
        case 'ability': {
          // Onda que sale del General: dorada (Inspire) o azul (Hold the Line).
          const p = worldToPx(e.x, e.y);
          const r = e.r * 32 * Math.SQRT2 * (0.25 + age * 0.75);
          ctx.globalAlpha = 1 - age;
          ctx.strokeStyle = e.a === 1 ? '#ffc83c' : '#6eb4ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(p.px, p.py, r, r / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          const text = e.a === 1 ? 'Inspire!' : 'Hold the line!';
          ctx.strokeText(text, p.px, p.py - 44 - age * 12);
          ctx.fillStyle = e.a === 1 ? '#ffd76a' : '#9fd0ff';
          ctx.fillText(text, p.px, p.py - 44 - age * 12);
          ctx.textAlign = 'start';
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
        case 'gain': {
          // Bonificación de cuadrilla: "+55" que sube desde el depósito (solo lo propio).
          if (e.o !== state.you) break;
          const p = worldToPx(e.x, e.y);
          const y = p.py - 30 - age * 26;
          ctx.globalAlpha = Math.min(1, (1 - age) * 2);
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          const text = `+${e.n} ×${CREW_BONUS}`;
          ctx.strokeText(text, p.px, y);
          const r = RESOURCE_TYPES[e.r];
          ctx.fillStyle = r === 'wood' ? '#e0a860' : r === 'metal' ? '#b8d0ea' : RESOURCE_COLORS[r];
          ctx.fillText(text, p.px, y);
          ctx.textAlign = 'start';
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
