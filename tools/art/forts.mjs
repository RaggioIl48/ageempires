// Fuertes, torres y murallas de cada pueblo, dibujados desde los modelos 3D de 0 A.D.
//
// Cultura de 0 A.D. que se usa para cada pueblo:
//   romanos → romanos · galos → galos · germanos → britanos · vikingos → galos (el fuerte
//   antiguo, con broch) · visigodos → íberos (Hispania) · ostrogodos → helenos (Italia
//   bizantina) · mongoles → Han (la dinastía Yuan).
//
// Las murallas del juego se levantan casilla por casilla, así que cada tramo de 0 A.D. se
// corta en piezas de una casilla: un pilar central y medios tramos hacia cada lado (este,
// oeste, sur, norte). Al dibujar una casilla se juntan el pilar y los medios tramos hacia
// las casillas vecinas con muralla: así la muralla queda continua con cualquier forma.

import fs from 'node:fs';
import path from 'node:path';
import { cropRender, render } from './raster.mjs';
import { ZeroAD } from './zeroad.mjs';

/** Actores (archivos de 0 A.D.) de cada pueblo. */
const PEOPLE = {
  romans: { fortress: 'romans/fortress', wood: 'romans/wooden_tower', tower: 'romans/wall_tower', wall: 'romans/wall_short', gate: 'romans/wall_gate' },
  gauls: { fortress: ['gauls/fortress', 'New'], wood: 'gauls/wooden_tower', tower: 'gauls/wall_tower', wall: 'gauls/wall_short', gate: 'celts/wall_gate' },
  germans: { fortress: 'britons/fortress', wood: 'britons/wooden_tower', tower: 'britons/wall_tower', wall: 'britons/wall_short', gate: 'britons/wall_gate' },
  vikings: { fortress: ['gauls/fortress', 'Base'], wood: 'celts/wooden_tower', tower: 'gauls/wall_tower', wall: 'gauls/wall_short', gate: 'celts/wall_gate' },
  visigoths: { fortress: 'iberians/fortress', wood: 'iberians/wooden_tower', tower: 'iberians/wall_tower', wall: 'iberians/wall_short', gate: 'iberians/wall_gate' },
  ostrogoths: { fortress: 'athenians/fortress', wood: 'hellenes/wooden_tower', tower: 'hellenes/wall_tower', wall: 'hellenes/wall_short', gate: 'hellenes/wall_gate' },
  mongols: { fortress: 'han/fortress', wood: 'han/tower_small', tower: 'han/tower_large', wall: 'han/wall_short', gate: 'han/wall_gate' },
};

/** Grosor de la muralla y altura máxima de murallas y puertas (en casillas). */
const WALL_THICKNESS = 0.8;
const WALL_MAX_HEIGHT = 1.3;
const GROUND = -0.02;

const actorPath = (a) => `structures/${Array.isArray(a) ? a[0] : a}.xml`;
const variantOf = (a) => (Array.isArray(a) ? a[1] : undefined);

/** Límites horizontales: de la pieza principal (edificios) o de todas (murallas y puertas). */
function bounds(parts, everything = false) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of everything ? parts : parts.slice(0, 1))
    for (const t of p.tris)
      for (const c of t) {
        x0 = Math.min(x0, c.p[0]);
        x1 = Math.max(x1, c.p[0]);
        y0 = Math.min(y0, c.p[1]);
        y1 = Math.max(y1, c.p[1]);
      }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ex: x1 - x0, ey: y1 - y0 };
}

/**
 * Pasa las piezas al espacio de la casilla: centro de la base en el origen, `unit` metros
 * por casilla y giro `rot` (grados) alrededor de la vertical. Modelo con Z hacia arriba →
 * u = x, v = −y (la vista del juego es "de mano izquierda").
 */
function toTiles(parts, b, unit, rot, extra = {}, maxHeight = Infinity) {
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  // Aplastar en altura si pasa del máximo (las normales se corrigen al revés).
  let top = 0;
  for (const p of parts) for (const t of p.tris) for (const c of t) top = Math.max(top, c.p[2] / unit);
  const k = top > maxHeight ? maxHeight / top : 1;
  const pt = (p) => {
    const x = p[0] - b.cx, y = p[1] - b.cy;
    return [(x * ca - y * sa) / unit, -(x * sa + y * ca) / unit, (p[2] / unit) * k];
  };
  const dir = (n) => {
    const v = [n[0] * ca - n[1] * sa, -(n[0] * sa + n[1] * ca), n[2] / k];
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
  };
  return parts.map((p) => ({ ...p, ...extra, tris: p.tris.map((t) => t.map((c) => ({ ...c, p: pt(c.p), n: c.n ? dir(c.n) : null }))) }));
}

export async function buildForts(cache, out) {
  const z = new ZeroAD(cache);
  const dir = path.join(out, 'buildings');
  fs.mkdirSync(dir, { recursive: true });
  const sprites = {};
  const walls = {};
  const map = {};
  let bytes = 0;
  const skip = (a) => /decals|garrison_flag|props\/units/.test(a);

  const save = (id, r, tiles) => {
    const c = cropRender(r);
    const file = `buildings/${id}.png`;
    c.img.write(path.join(out, file));
    bytes += fs.statSync(path.join(out, file)).size;
    const sp = { file, w: c.img.w, h: c.img.h, tiles, ax: Math.round(c.ox * 10) / 10, ay: Math.round(c.oy * 10) / 10 };
    if (c.mask.bbox()) {
      const mfile = `buildings/${id}.team.png`;
      c.mask.write(path.join(out, mfile));
      bytes += fs.statSync(path.join(out, mfile)).size;
      sp.mask = mfile;
    }
    sprites[id] = sp;
  };

  /** Edificio entero que cabe en `tiles`×`tiles` casillas. */
  const building = async (id, actor, tiles, rot = 0) => {
    const parts = await z.actor(actorPath(actor), undefined, skip, 0, variantOf(actor));
    const b = bounds(parts);
    const unit = Math.max(b.ex, b.ey) / (tiles * 0.96);
    save(id, render(toTiles(parts, b, unit, rot, { clip: (u, v, h) => h >= GROUND })), tiles);
  };

  for (const [people, def] of Object.entries(PEOPLE)) {
    await building(`fortress-${people}`, def.fortress, 4);
    await building(`tower-wood-${people}`, def.wood, 2);
    await building(`tower-${people}`, def.tower, 2);
    map[`${people}/fortress`] = [`fortress-${people}`];
    map[`${people}@1/tower`] = [`tower-wood-${people}`];
    map[`${people}/tower`] = [`tower-${people}`];

    // Murallas: el tramo corto se pone a lo largo de u (o de v) con el grosor elegido.
    const wall = await z.actor(actorPath(def.wall), undefined, skip);
    const wb = bounds(wall, true);
    const alongX = wb.ex >= wb.ey;
    const unit = Math.min(wb.ex, wb.ey) / WALL_THICKNESS;
    const rotU = alongX ? 0 : 90;
    const t = WALL_THICKNESS / 2;
    const piece = (id, rot, clip) => save(id, render(toTiles(wall, wb, unit, rot, { caps: true, clip: (u, v, h) => h >= GROUND && clip(u, v) }, WALL_MAX_HEIGHT)), 1);
    piece(`wall-${people}-post`, rotU, (u, v) => Math.abs(u) <= t && Math.abs(v) <= t + 0.2);
    piece(`wall-${people}-e`, rotU, (u) => u >= 0 && u <= 0.5);
    piece(`wall-${people}-w`, rotU, (u) => u >= -0.5 && u <= 0);
    piece(`wall-${people}-s`, rotU + 90, (u, v) => v >= 0 && v <= 0.5);
    piece(`wall-${people}-n`, rotU + 90, (u, v) => v >= -0.5 && v <= 0);

    // Puerta: el centro del portón de 0 A.D., del mismo grosor que la muralla.
    const gate = await z.actor(actorPath(def.gate), undefined, skip);
    const gb = bounds(gate, true);
    const gAlongX = gb.ex >= gb.ey;
    const gUnit = Math.min(gb.ex, gb.ey) / WALL_THICKNESS;
    const gRot = gAlongX ? 0 : 90;
    const gatePiece = (id, rot, clip) => save(id, render(toTiles(gate, gb, gUnit, rot, { caps: true, clip: (u, v, h) => h >= GROUND && clip(u, v) }, WALL_MAX_HEIGHT * 1.25)), 1);
    gatePiece(`gate-${people}-u`, gRot, (u) => Math.abs(u) <= 0.5);
    gatePiece(`gate-${people}-v`, gRot + 90, (u, v) => Math.abs(v) <= 0.5);

    walls[people] = {
      post: `wall-${people}-post`,
      e: `wall-${people}-e`,
      w: `wall-${people}-w`,
      s: `wall-${people}-s`,
      n: `wall-${people}-n`,
      gateU: `gate-${people}-u`,
      gateV: `gate-${people}-v`,
    };
    console.log(`  0 A.D. ${people}: fuerte, torres, muralla y puerta`);
  }
  return { sprites, walls, map, bytes, downloads: z.downloads };
}
