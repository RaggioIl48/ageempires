// Visor de animaciones (solo desarrollo: /preview.html). Dibuja una unidad con el MISMO código
// del juego (drawSpriteUnit, el ataque sincronizado con golpes simulados y la caída) en las 8
// direcciones, para revisar una hoja nueva sin tener que llegar a esa unidad en una partida.

import type { FactionId, UnitType } from '../../shared/data.ts';
import type { UnitView } from '../../shared/protocol.ts';
import { drawDyingUnit, drawSpriteUnit, forceSheet, loadArt, setLod } from './art.ts';

const BASE = import.meta.env.BASE_URL ?? '/';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const unitSel = document.getElementById('unit') as HTMLSelectElement;
const sheetSel = document.getElementById('sheet') as HTMLSelectElement;
const zoomIn = document.getElementById('zoom') as HTMLInputElement;
const coolIn = document.getElementById('cool') as HTMLInputElement;

/** Ángulo en pantalla de cada columna (S, SE, E, NE, N, NO, O, SO), con y hacia abajo. */
const FACES = [90, 45, 0, -45, -90, -135, 180, 135].map((d) => (d * Math.PI) / 180);
const ROWS = ['idle', 'walk', 'attack', 'die'] as const;
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
    canvas.height = 4 * cellH * zoom + 40;
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
          state: row === 'attack' ? 'attacking' : 'idle',
          ...(row === 'walk' ? { walk: 1 as const, sp: 1.4 } : {}),
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
  // Siempre las mismas unidades (las 11 de romanos y galos), para comparar corridas entre sí.
  const keys = Object.keys(m.units).filter((k) => /^(romans|gauls)\//.test(k) && m.units[k].endsWith('-3d'));
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
    return { f, t, x: 20 + Math.random() * (canvas.width - 40), y: 40 + Math.random() * (canvas.height - 60), face: (i % 8) * (Math.PI / 4), kind, id: i };
  });
  const times: number[] = [];
  let frames = 0, since = performance.now();
  const loop = (now: number) => {
    const t0 = performance.now();
    ctx.fillStyle = '#5b6b3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    units.sort((a, b) => a.y - b.y);
    for (const s of units) {
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
      drawSpriteUnit(ctx, u, s.x, s.y, COLOR, now, s.f, s.face, 7);
    }
    times.push(performance.now() - t0);
    frames++;
    if (now - since >= 1000) {
      const recent = times.slice(-60).sort((a, b) => a - b);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const p95 = recent[Math.floor(recent.length * 0.95)] ?? avg;
      const text = `art=${art} lod=${params.get('lod') ?? '1'} units=${n} fps=${Math.round((frames * 1000) / (now - since))} draw avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`;
      document.getElementById('stats')!.textContent = text;
      document.title = text;
      frames = 0;
      since = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const params = new URLSearchParams(location.search);
if (params.get('lod') === '0') setLod(false);
if (params.get('stress')) void stress(Number(params.get('stress')) || 300, params.get('art') ?? '3d');
else void main();
