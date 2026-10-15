// Visor de animaciones (solo desarrollo: /preview.html). Dibuja una unidad con el MISMO código
// del juego (drawSpriteUnit, el ataque sincronizado con golpes simulados y la caída) en las 8
// direcciones, para revisar una hoja nueva sin tener que llegar a esa unidad en una partida.

import type { FactionId, UnitType } from '../../shared/data.ts';
import type { UnitView } from '../../shared/protocol.ts';
import { drawDyingUnit, drawSpriteUnit, forceSheet, loadArt } from './art.ts';

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

void main();
