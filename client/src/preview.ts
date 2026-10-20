// Visor de animaciones (solo desarrollo: /preview.html). Dibuja una unidad con el MISMO código
// del juego (drawSpriteUnit, el ataque sincronizado con golpes simulados y la caída) en las 8
// direcciones, para revisar una hoja nueva sin tener que llegar a esa unidad en una partida.

import { BUILD_MENU, BUILDING_DEFS, PLAYER_COLORS, type FactionId, type UnitType } from '../../shared/data.ts';
import type { UnitView } from '../../shared/protocol.ts';
import { drawDyingUnit, drawSpriteUnit, forceSheet, loadArt, preloadGame, setLod } from './art.ts';
import { drawBuilding, setWallLookup } from './sprites.ts';
import { wallLine } from '../../shared/wall.ts';
import { worldToPx } from './view.ts';

const BASE = import.meta.env.BASE_URL ?? '/';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const unitSel = document.getElementById('unit') as HTMLSelectElement;
const sheetSel = document.getElementById('sheet') as HTMLSelectElement;
const zoomIn = document.getElementById('zoom') as HTMLInputElement;
const coolIn = document.getElementById('cool') as HTMLInputElement;

/** Ángulo en pantalla de cada columna (S, SE, E, NE, N, NO, O, SO), con y hacia abajo. */
const FACES = [90, 45, 0, -45, -90, -135, 180, 135].map((d) => (d * Math.PI) / 180);
// Galope y carga: los jinetes (los de a pie repiten caminar y atacar en esas filas).
const ROWS = ['idle', 'walk', 'gallop', 'charge', 'attack', 'die'] as const;
const COLOR = '#2f6fd6';

interface Manifest {
  sheets: Record<string, { o: string }>;
  units: Record<string, string>;
}

async function main(): Promise<void> {
  await loadArt();
  const m = (await (await fetch(`${BASE}art/units.json`)).json()) as Manifest;
  for (const key of Object.keys(m.units).sort()) unitSel.add(new Option(key, key));
  for (const id of Object.keys(m.sheets).sort()) sheetSel.add(new Option(`${id} (${m.sheets[id].o})`, id));
  const fromUrl = new URLSearchParams(location.search).get('unit');
  unitSel.value = fromUrl && m.units[fromUrl] ? fromUrl : m.units['romans/legionary'] ? 'romans/legionary' : unitSel.options[0].value;
  const syncSheet = () => (sheetSel.value = m.units[unitSel.value]);
  syncSheet();
  unitSel.onchange = syncSheet;
  const start = performance.now();
  let lastHit = start;

  const frame = (now: number) => {
    const zoom = Number(zoomIn.value);
    const cool = Math.max(300, Number(coolIn.value) || 1500);
    const [faction, type] = unitSel.value.split('/') as [FactionId, UnitType];
    forceSheet(faction, type, sheetSel.value === m.units[unitSel.value] ? null : sheetSel.value);
    // Golpes simulados con la espera real elegida (como las confirmaciones del servidor).
    while (now - lastHit >= cool) lastHit += cool;
    const cellW = 70, cellH = 70;
    canvas.width = Math.min(document.documentElement.clientWidth, 8 * cellW * zoom + 40);
    canvas.height = ROWS.length * cellH * zoom + 40;
    ctx.fillStyle = '#5b6b3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(20, 20);
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = true;
    ROWS.forEach((row, r) => {
      FACES.forEach((face, d) => {
        const x = d * cellW + cellW / 2, y = r * cellH + cellH * 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(d * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
        const u: UnitView = {
          id: r * 8 + d, owner: 0, type, x: 0, y: 0, hp: 100,
          state: row === 'attack' || row === 'charge' ? 'attacking' : 'idle',
          ...(row === 'walk' ? { walk: 1 as const, sp: 0.85 } : {}),
          ...(row === 'gallop' || row === 'charge' ? { walk: 1 as const, sp: 2.4 } : {}), // a pie: corre
          ...(row === 'attack' ? { cool, ha: lastHit } : {}),
        } as UnitView;
        if (row === 'die') drawDyingUnit(ctx, u, x, y, COLOR, faction, face, ((now - start) / 1000) % 2.5);
        else drawSpriteUnit(ctx, u, x, y, COLOR, now, faction, face, 7);
      });
    });
    ctx.restore();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * Prueba de carga (?stress=400&art=3d|lpc): muchos soldados de varios pueblos caminando,
 * peleando y quietos, dibujados con drawSpriteUnit. Mide cuánto tarda en dibujarse cada cuadro
 * y lo muestra en #stats (y en el título), para comparar las hojas 3D con las LPC.
 */
async function stress(n: number, art: string): Promise<void> {
  await loadArt();
  const m = (await (await fetch(`${BASE}art/units.json`)).json()) as Manifest;
  document.querySelector('header')!.innerHTML = '<b>Stress test</b> <span id="stats">measuring…</span>';
  // Por defecto, siempre las mismas unidades (romanos y galos), para comparar corridas entre sí.
  // types=all: todos los tipos 3D de todos los pueblos (como una partida real con muchos tipos a la vista).
  const q = new URLSearchParams(location.search);
  const all = q.get('types') === 'all';
  // colors=n: soldados de n jugadores (cada color es una máscara teñida aparte, como en una partida).
  const colors = PLAYER_COLORS.slice(0, Math.max(1, Number(q.get('colors')) || 1));
  // zoomcycle=1: cada 3 s alterna entre zoom normal y muy cercano (fuerza a cargar las hojas completas).
  const zoomCycle = q.get('zoomcycle') === '1';
  const keys = Object.keys(m.units).filter((k) => (all || /^(romans|gauls)\//.test(k)) && m.units[k].endsWith('-3d'));
  // Con art=lpc se fuerzan las hojas LPC de esas mismas unidades (mismo id sin "-3d").
  if (art === 'lpc')
    for (const k of keys) {
      const [f, t] = k.split('/') as [FactionId, UnitType];
      const lpc = m.units[k].replace(/-3d$/, '');
      if (m.sheets[lpc]) forceSheet(f, t, lpc);
    }
  canvas.width = document.documentElement.clientWidth;
  canvas.height = innerHeight - 40;
  const units = [...Array(n).keys()].map((i) => {
    const [f, t] = keys[i % keys.length].split('/') as [FactionId, UnitType];
    const kind = i % 3; // 0 = camina, 1 = pelea, 2 = quieto
    return { f, t, k: i % keys.length, color: colors[i % colors.length], x: 20 + Math.random() * (canvas.width - 40), y: 40 + Math.random() * (canvas.height - 60), face: (i % 8) * (Math.PI / 4), kind, id: i };
  });
  // appear=1: como en una partida, primero la pantalla de carga (preloadGame) y después los tipos
  // aparecen de a uno cada 300 ms (un ejército que sale de la niebla): mide el costo del primer dibujo.
  const appear = q.get('appear') === '1';
  let shownTypes = keys.length, appearFrom = 0;
  if (appear) {
    document.getElementById('stats')!.textContent = 'loading…';
    const factions = [...new Set(keys.map((k) => k.split('/')[0] as FactionId))];
    await preloadGame(factions.flatMap((f) => colors.map((c) => ({ faction: f, color: c }))), () => {});
    shownTypes = 0;
    appearFrom = performance.now();
  }
  const times: number[] = [];
  let frames = 0, since = performance.now();
  // Tirones: el mayor hueco entre cuadros y cuántos pasaron de 100 ms (lo que se siente como "se trabó").
  let last = -1, worst = 0, stutters = 0;
  const start = performance.now();
  const loop = (now: number) => {
    if (last >= 0) {
      const gap = now - last;
      worst = Math.max(worst, gap);
      if (gap > 100) stutters++;
    }
    last = now;
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5b6b3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (zoomCycle && Math.floor((now - start) / 3000) % 2 === 1) ctx.setTransform(2.5, 0, 0, 2.5, -canvas.width * 0.75, -canvas.height * 0.75);
    units.sort((a, b) => a.y - b.y);
    if (appear) shownTypes = Math.min(keys.length, Math.floor((now - appearFrom) / 300));
    for (const s of units) {
      if (s.k >= shownTypes) continue;
      if (s.kind === 0) {
        s.x += Math.cos(s.face) * 0.4;
        s.y += Math.sin(s.face) * 0.2;
        if (s.x < 10 || s.x > canvas.width - 10 || s.y < 30 || s.y > canvas.height - 10) s.face += Math.PI;
      }
      const u = {
        id: s.id, owner: 0, type: s.t, x: 0, y: 0, hp: 100, state: s.kind === 1 ? 'attacking' : 'idle',
        ...(s.kind === 0 ? { walk: 1, sp: 1.3 } : {}),
        ...(s.kind === 1 ? { cool: 1500, ha: now - ((now + s.id * 97) % 1500) } : {}),
      } as unknown as UnitView;
      drawSpriteUnit(ctx, u, s.x, s.y, s.color, now, s.f, s.face, 7);
    }
    times.push(performance.now() - t0);
    frames++;
    if (now - since >= 1000) {
      const recent = times.slice(-60).sort((a, b) => a - b);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const p95 = recent[Math.floor(recent.length * 0.95)] ?? avg;
      const text = `art=${art} lod=${params.get('lod') ?? '1'} types=${keys.length} units=${n} fps=${Math.round((frames * 1000) / (now - since))} draw avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms worst=${Math.round(worst)}ms stutters=${stutters}`;
      document.getElementById('stats')!.textContent = text;
      document.title = text;
      frames = 0;
      since = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/**
 * Todos los edificios de un pueblo (?buildings=1&faction=romans), dibujados con el código del juego:
 * para revisar un edificio nuevo (o su dibujo de respaldo) sin construirlo en una partida.
 */
async function buildings(faction: FactionId): Promise<void> {
  await loadArt();
  document.querySelector('header')!.innerHTML = `<b>Buildings</b> <span>${faction}</span>`;
  canvas.width = document.documentElement.clientWidth;
  canvas.height = innerHeight - 40;
  const types = BUILD_MENU.filter((t) => (!BUILDING_DEFS[t].faction || BUILDING_DEFS[t].faction === faction) && t !== 'wall' && t !== 'gate');
  // Muralla de muestra: tramo recto, esquina, escalón en diagonal y una puerta.
  const W0 = 30, H0 = 14;
  const wallTiles = [...wallLine(W0, H0, W0 + 8, H0), ...wallLine(W0 + 8, H0, W0 + 8, H0 + 6), ...wallLine(W0 + 8, H0 + 6, W0 + 14, H0 + 12)];
  const gateAt = `${W0 + 4},${H0}`;
  const wallSet = new Set(wallTiles.map((t) => `${t.x},${t.y}`));
  setWallLookup((tx, ty) => wallSet.has(`${tx},${ty}`));
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5b6b3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const o = worldToPx(0, 0);
    ctx.translate(canvas.width / 2 - o.px, 60 - o.py);
    // En filas de 6, separados para que no se tapen.
    types.forEach((type, i) => {
      const tx = (i % 6) * 7, ty = Math.floor(i / 6) * 7;
      drawBuilding(ctx, { id: i + 1, owner: 1, type, tx, ty, hp: 1, progress: 1 }, COLOR, faction);
    });
    [...wallTiles].sort((a, b) => a.x + a.y - (b.x + b.y)).forEach((t, i) => {
      const type = `${t.x},${t.y}` === gateAt ? 'gate' : 'wall';
      drawBuilding(ctx, { id: 1000 + i, owner: 1, type, tx: t.x, ty: t.y, hp: 1, progress: 1 }, COLOR, faction);
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

const params = new URLSearchParams(location.search);
if (params.get('lod') === '0') setLod(false);
if (params.get('buildings')) void buildings((params.get('faction') ?? 'romans') as FactionId);
else if (params.get('stress')) void stress(Number(params.get('stress')) || 300, params.get('art') ?? '3d');
else void main();
