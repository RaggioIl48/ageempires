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
import { fileURLToPath } from 'node:url';
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

/** Tamaño (casillas) de cada edificio del juego que se dibuja con un modelo de 0 A.D. */
const SIZE = { town_center: 3, house: 2, storehouse: 2, barracks: 3, archery_range: 3, stable: 3, tech_center: 3, market: 3, workshop: 3, monastery: 3 };

/**
 * Ciudad de cada pueblo con los edificios de la cultura de 0 A.D. más cercana, en las eras indicadas
 * (en las demás siguen los de Unknown Horizons: así la ciudad cambia al avanzar de era).
 * Tipo del juego → actor. Lo que falta (granjas, canteras, minas, fábricas…) sigue siendo común.
 *   romanos → romanos (desde la Edad Media; en la Tribal, el entramado)
 *   galos → galos, germanos → britanos, vikingos → celtas (aldeas de madera y paja, eras 1 y 2)
 *   visigodos → íberos (Hispania) y ostrogodos → helenos (Italia bizantina), eras 2 y 3
 *   mongoles → Han, eras 3 y 4: la dinastía Yuan que fundaron en China (Janbalic, hoy Pekín)
 * El monasterio es un templo de 0 A.D. distinto del centro de tecnología, y vale en todas las eras.
 */
const CITIES = {
  romans: { eras: [2, 3, 4], town_center: 'romans/civic_centre', house: 'romans/house', storehouse: 'romans/storehouse', barracks: 'romans/barracks', archery_range: 'romans/range', stable: 'romans/stable', market: 'romans/market', tech_center: 'romans/temple', monastery: 'romans/temple_mars' },
  gauls: { eras: [1, 2], town_center: 'gauls/civic_centre', house: 'gauls/house', storehouse: 'gauls/storehouse', barracks: 'celts/barracks', archery_range: 'gauls/range', stable: 'gauls/stable', market: 'gauls/market', tech_center: 'celts/temple', monastery: 'britons/temple' },
  germans: { eras: [1, 2], town_center: 'britons/civic_centre', house: 'britons/house', storehouse: 'britons/storehouse', barracks: 'britons/barracks', archery_range: 'britons/range', stable: 'britons/stable', market: 'britons/market', tech_center: 'britons/temple', monastery: 'celts/temple' },
  vikings: { eras: [1, 2], town_center: 'celts/civic_centre', house: 'celts/house', storehouse: 'celts/storehouse', barracks: 'celts/barracks', archery_range: 'britons/range', stable: 'britons/stable', market: 'celts/market_newest', tech_center: 'celts/temple', monastery: 'britons/temple' },
  visigoths: { eras: [2, 3], house: 'iberians/house', storehouse: 'iberians/storehouse', barracks: 'iberians/barracks', archery_range: 'iberians/range', stable: 'iberians/stable', market: 'iberians/market', tech_center: 'iberians/temple', monastery: 'spartans/temple' },
  ostrogoths: { eras: [2, 3], town_center: 'spartans/civic_centre', house: 'hellenes/house', storehouse: 'hellenes/storehouse', barracks: 'athenians/barracks', archery_range: 'hellenes/range', stable: 'hellenes/stable', market: 'romans/market', tech_center: 'romans/temple_vesta', monastery: 'hellenes/temple_c' },
  mongols: { eras: [3, 4], town_center: 'han/civil_centre', house: 'han/house', storehouse: 'han/storehouse', barracks: 'han/barracks', archery_range: 'han/range', stable: 'han/stable', tech_center: 'han/academy', market: 'han/market', workshop: 'han/arsenal', monastery: 'han/temple' },
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

export async function buildForts(cache, out, { onlyCity = false, people: onlyPeople } = {}) {
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

  for (const [people, { eras, ...set }] of Object.entries(CITIES)) {
    if (onlyPeople && people !== onlyPeople) continue;
    for (const [type, actor] of Object.entries(set)) {
      const id = `city-${people}-${type}`;
      await building(id, actor, SIZE[type]);
      for (const era of eras) map[`${people}@${era}/${type}`] = [id];
      // El monasterio vale en todas las eras (el mongol es budista, de estilo chino, como Erdene Zuu).
      if (type === 'monastery') map[`${people}/${type}`] = [id];
    }
    console.log(`  0 A.D. ciudad de ${people}: ${Object.keys(set).length} edificios`);
  }
  if (onlyCity) return { sprites, walls, map, bytes, downloads: z.downloads };

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

// node tools/art/forts.mjs city [pueblo] → solo las ciudades (de todos o de uno), sobre el buildings.json que ya existe.
const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'city') {
  const out = path.resolve(HERE, '../../client/public/art');
  const r = await buildForts(path.join(HERE, '.cache'), out, { onlyCity: true, people: process.argv[3] });
  const file = path.join(out, 'buildings.json');
  const bm = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(bm.sprites, r.sprites);
  Object.assign(bm.map, r.map);
  fs.writeFileSync(file, JSON.stringify(bm));
  console.log(`  ${Object.keys(r.sprites).length} imágenes, ${(r.bytes / 1024).toFixed(0)} KB`);
}
