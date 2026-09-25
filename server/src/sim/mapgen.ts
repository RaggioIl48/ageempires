// Generación de mapas con semilla. Objetivo principal: JUSTICIA.
// Cada zona de inicio recibe exactamente la misma plantilla de recursos,
// girada según su posición en el anillo, y alrededor de ella no hay lagos ni
// montañas. Lagos, montañas y bosques extra se reparten fuera de esas zonas.
// Antes de aceptar un mapa se comprueba que todos los inicios estén
// conectados y que cada recurso (salvo árboles interiores) sea alcanzable.

import {
  PLAYER_COLORS,
  STARTING_UNITS,
  TILE_MOUNTAIN,
  TILE_WATER,
  type FactionId,
  type NodeType,
} from '../../../shared/data.ts';
import type { MapSize } from '../../../shared/protocol.ts';
import { createRng } from '../../../shared/rng.ts';
import { World, freeTilesAround, type Point } from './world.ts';

/** Datos de cada jugador (nombre, color y facción elegidos en la sala). */
export interface PlayerSetup {
  name: string;
  color: string;
  faction: FactionId;
}

export interface MapOptions {
  slots: number; // cantidad de jugadores (zonas de inicio)
  /** Tamaño elegido por el profesor (por defecto, normal). */
  mapSize?: MapSize;
  /** Si falta, se usan nombres y colores por defecto y facciones en orden. */
  players?: PlayerSetup[];
  seed: number;
}

/** Radio (en casillas) alrededor de cada inicio sin lagos ni montañas. */
export const START_CLEAR_RADIUS = 13;

const SIZE_FACTOR: Record<MapSize, number> = { small: 0.8, normal: 1, large: 1.25 };

/**
 * Lado del mapa en casillas. Crece con los jugadores; nunca es tan chico que
 * las zonas de inicio se pisen (unas 30 casillas entre bases vecinas).
 */
export function mapSizeFor(slots: number, mapSize: MapSize = 'normal'): number {
  const n = Math.max(2, slots);
  const base = Math.sqrt(n) * 48 + 20;
  const minForSpacing = (30 * n) / (2 * Math.PI * 0.36);
  return Math.round(Math.max(base * SIZE_FACTOR[mapSize], minForSpacing, 60));
}

/**
 * Plantilla de recursos de cada inicio, en coordenadas locales:
 * `fwd` apunta desde el centro del mapa hacia afuera, `side` es perpendicular.
 */
const START_TEMPLATE: { type: NodeType; side: number; fwd: number; count: number }[] = [
  { type: 'berries', side: 6, fwd: -1, count: 6 },
  { type: 'tree', side: 0, fwd: 8, count: 28 },
  { type: 'tree', side: -7, fwd: 4, count: 10 },
  { type: 'stone', side: -6, fwd: -4, count: 4 },
  { type: 'metal', side: 5, fwd: -6, count: 4 },
];

/** Recursos un poco más lejos, también iguales para todos (para expandirse). */
const EXPANSION_TEMPLATE: typeof START_TEMPLATE = [
  { type: 'metal', side: 17, fwd: 2, count: 5 },
  { type: 'stone', side: -17, fwd: 2, count: 5 },
  { type: 'berries', side: 0, fwd: -17, count: 5 },
];

const MAX_ATTEMPTS = 30;

export function generateWorld(opts: MapOptions): World {
  // Si un intento sale mal (inicio encerrado, recurso inaccesible), se prueba otra variante.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = tryGenerate(opts, opts.seed + attempt * 7919);
    if (world) return world;
  }
  throw new Error('Could not generate a valid map');
}

function tryGenerate(opts: MapOptions, seed: number): World | null {
  const rng = createRng(seed);
  const size = mapSizeFor(opts.slots, opts.mapSize);
  const world = new World(size);
  const center = size / 2;
  const ringRadius = size * 0.36;
  const angle0 = rng() * Math.PI * 2;

  // 1) Posiciones de inicio en un anillo.
  const starts: { pos: Point; angle: number }[] = [];
  for (let i = 0; i < opts.slots; i++) {
    const angle = angle0 + (i / opts.slots) * Math.PI * 2;
    starts.push({
      pos: {
        x: Math.round(center + Math.cos(angle) * ringRadius),
        y: Math.round(center + Math.sin(angle) * ringRadius),
      },
      angle,
    });
  }
  const nearStart = (x: number, y: number, extra: number): boolean =>
    starts.some((s) => Math.hypot(s.pos.x - x, s.pos.y - y) < START_CLEAR_RADIUS + extra);
  const nearCenter = (x: number, y: number): boolean => Math.hypot(center - x, center - y) < size * 0.1;

  // 2) Lagos y montañas lejos de los inicios y del centro (zona abierta estratégica).
  const blobs = Math.round(opts.slots * 1.5) + 2;
  for (let i = 0; i < blobs * 2; i++) {
    const kind = i % 2 === 0 ? TILE_WATER : TILE_MOUNTAIN;
    const cx = Math.floor(rng() * size);
    const cy = Math.floor(rng() * size);
    if (nearStart(cx, cy, 6) || nearCenter(cx, cy)) continue;
    for (const [x, y] of growBlob(world, cx, cy, 25 + Math.floor(rng() * 40), rng)) {
      if (!nearStart(x, y, 2)) world.tiles[y * size + x] = kind;
    }
  }

  // 3) Región que se puede recorrer a pie desde el primer inicio. Los recursos
  //    solo se colocan dentro de ella (nada en islas ni en bolsillos de montaña).
  const reach = walkableRegion(world, starts[0].pos);
  if (!starts.every((s) => reach[s.pos.y * size + s.pos.x])) return null;
  const inReach = (x: number, y: number) => reach[y * size + x] === 1;

  // 4) Cada jugador: Centro Urbano, trabajadores y la misma plantilla de recursos.
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const playerId = i + 1;
    const setup = opts.players?.[i];
    world.addPlayer(playerId, setup?.name ?? `Player ${playerId}`, setup?.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length], s.pos, setup?.faction);
    if (!world.addBuilding('town_center', playerId, s.pos.x - 1, s.pos.y - 1)) return null;

    const fx = Math.cos(s.angle), fy = Math.sin(s.angle); // hacia afuera
    const sx = -fy, sy = fx; // perpendicular
    for (const t of [...START_TEMPLATE, ...EXPANSION_TEMPLATE]) {
      const cx = Math.round(s.pos.x + fx * t.fwd + sx * t.side);
      const cy = Math.round(s.pos.y + fy * t.fwd + sy * t.side);
      const spots = freeTilesAround(world, cx, cy, t.count, inReach);
      if (spots.length < t.count) return null;
      for (const p of spots) world.addNode(t.type, p.x, p.y);
    }

    // Unidades iniciales junto al Centro Urbano.
    const spots = freeTilesAround(world, s.pos.x, s.pos.y, STARTING_UNITS.length);
    STARTING_UNITS.forEach((type, k) => {
      if (spots[k]) world.addUnit(type, playerId, spots[k].x + 0.5, spots[k].y + 0.5);
    });
  }

  // 5) Bosques neutrales. No tocan las zonas de inicio, el centro ni los
  //    alrededores de bayas, piedra y metal (para no encerrarlos).
  const keepOut = new Uint8Array(size * size);
  for (const n of world.nodes.values()) {
    if (n.type === 'tree') continue;
    for (let y = n.ty - 2; y <= n.ty + 2; y++)
      for (let x = n.tx - 2; x <= n.tx + 2; x++) if (world.inBounds(x, y)) keepOut[y * size + x] = 1;
  }
  const forests = opts.slots * 3 + 4;
  let placed = 0;
  for (let attempt = 0; attempt < forests * 4 && placed < forests; attempt++) {
    const cx = Math.floor(rng() * size);
    const cy = Math.floor(rng() * size);
    if (nearStart(cx, cy, 3) || nearCenter(cx, cy) || !world.isWalkable(cx, cy)) continue;
    for (const [x, y] of growBlob(world, cx, cy, 12 + Math.floor(rng() * 25), rng)) {
      if (!nearStart(x, y, 0) && !keepOut[y * size + x] && world.isWalkable(x, y)) world.addNode('tree', x, y);
    }
    placed++;
  }

  // 6) Comprobación final con todo colocado.
  if (!isValid(world)) return null;

  // Los nodos creados al generar no cuentan como "cambios" para la red.
  world.changedNodes.clear();
  world.removedNodes.length = 0;
  return world;
}

/** Crece una mancha irregular de casillas desde (cx, cy). */
function growBlob(world: World, cx: number, cy: number, target: number, rng: () => number): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  const frontier: [number, number][] = [[cx, cy]];
  while (frontier.length > 0 && out.length < target) {
    const k = Math.floor(rng() * frontier.length);
    const [x, y] = frontier.splice(k, 1)[0];
    if (!world.inBounds(x, y) || seen.has(y * world.size + x)) continue;
    seen.add(y * world.size + x);
    out.push([x, y]);
    frontier.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

/** Casillas transitables conectadas (a pie) con la casilla libre más cercana a `from`. */
export function walkableRegion(world: World, from: Point): Uint8Array {
  const size = world.size;
  const seen = new Uint8Array(size * size);
  const first = freeTilesAround(world, from.x, from.y, 1)[0];
  if (!first) return seen;
  const stack = [first.y * size + first.x];
  seen[stack[0]] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % size, y = (i - x) / size;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!world.isWalkable(nx, ny)) continue;
      const j = ny * size + nx;
      if (!seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}

/** Todos los inicios conectados y todo recurso que no sea árbol, accesible. */
function isValid(world: World): boolean {
  const players = [...world.players.values()];
  if (players.length === 0) return true;
  const size = world.size;
  const reach = walkableRegion(world, players[0].start);
  const touchesReach = (tx: number, ty: number, s: number) => {
    for (let y = ty - 1; y <= ty + s; y++)
      for (let x = tx - 1; x <= tx + s; x++) if (world.inBounds(x, y) && reach[y * size + x]) return true;
    return false;
  };
  for (const b of world.buildings.values()) if (!touchesReach(b.tx, b.ty, b.size)) return false;
  for (const n of world.nodes.values()) if (n.type !== 'tree' && !touchesReach(n.tx, n.ty, 1)) return false;
  return true;
}
