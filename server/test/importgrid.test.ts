// Importador de hojas externas en cuadrícula (p. ej. hechas con IA): quita el fondo de papel,
// la sombra horneada y las líneas; respeta las direcciones (y las espejadas) y el cuadro de impacto.
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS de las herramientas de arte
import { Img } from '../../tools/art/img.mjs';
// @ts-expect-error módulo JS de las herramientas de arte
import { OGA8, buildSheet, cutCell, isMagenta, shrink, splitTeam } from '../../tools/art/importgrid.mjs';

const PAPER = [230, 208, 168];
/** Imagen de prueba: pergamino con líneas de cuadrícula y, en cada celda, un "jinete". */
function fakeSheet(cols: number, rows: number, cell = 60) {
  const W = cols * cell + 2, H = rows * cell + 2;
  const img = new Img(W, H);
  const set = (x: number, y: number, c: number[]) => img.data.set([...c, 255], (y * W + x) * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, PAPER);
  for (let i = 0; i <= cols; i++) for (let y = 0; y < H; y++) set(i * cell, y, [60, 40, 25]); // líneas
  for (let j = 0; j <= rows; j++) for (let x = 0; x < W; x++) set(x, j * cell, [60, 40, 25]);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = c * cell, y0 = r * cell;
      // Sombra gris bajo la figura.
      for (let y = 46; y < 50; y++) for (let x = 14; x < 46; x++) set(x0 + x, y0 + y, [140, 132, 120]);
      // Figura marrón, más ancha a la derecha si "mira al este" (col par) y a la izquierda si no.
      for (let y = 14; y < 46; y++) for (let x = 20; x < 40; x++) set(x0 + x, y0 + y, [110, 62, 30]);
      const head = c % 2 === 0 ? 40 : 14;
      for (let y = 14; y < 24; y++) for (let x = head; x < head + 6; x++) set(x0 + x, y0 + y, [110, 62, 30]);
      // Agujero de papel encerrado dentro de la figura (como entre las patas).
      for (let y = 30; y < 36; y++) for (let x = 27; x < 33; x++) set(x0 + x, y0 + y, PAPER);
    }
  return img;
}

describe('external grid sprite sheets', () => {
  it('cuts out the figure: no paper, no baked shadow, no grid lines, no enclosed paper', () => {
    const src = fakeSheet(1, 1);
    const c = cutCell(src, 0, 0, 62, 62);
    const a = (x: number, y: number) => c.data[(y * c.w + x) * 4 + 3];
    expect(a(5, 5)).toBe(0); // papel
    expect(a(25, 48)).toBe(0); // sombra
    expect(a(0, 30)).toBe(0); // línea de la cuadrícula
    expect(a(29, 32)).toBe(0); // papel encerrado
    expect(a(25, 20)).toBe(255); // la figura queda
    expect(c.bbox()).toMatchObject({ x: 20, y: 14 });
  });

  it('shrinks with soft edges (averaging, not jagged)', () => {
    const img = new Img(2, 2);
    img.data.set([200, 0, 0, 255], 0);
    const s = shrink(img, 2);
    expect(s.w).toBe(1);
    expect(s.data[3]).toBe(Math.round(255 / 4));
    expect(s.data[0]).toBe(200); // el color no se oscurece con el borde transparente
  });

  it('builds an 8-direction sheet in the game order, mirrors where asked, keeps feet and impact frame', () => {
    const cols = ['E', 'W'];
    const src = fakeSheet(2, 2);
    const spec = {
      id: 'test', units: ['mongols/horse_archer'],
      grid: { x0: 0, x1: 120, cols: 2, rows: [0, 60, 120] },
      rows: ['idle', 'shooting'], cols,
      dirs: Object.fromEntries(OGA8.map((d: string) => [d, d === 'NW' ? { col: 'E', mirror: true } : d.includes('W') ? 'W' : 'E'])),
      anims: { idle: { frames: ['idle'], fps: 1 }, attack: { frames: ['idle', 'shooting'], fps: 6, hit: 1 } },
      frame: 64,
    };
    const { packed, report } = buildSheet(src, spec);
    expect(report).toEqual([expect.stringMatching(/no magenta/)]); // sin color del jugador: aviso
    const at = packed.meta.anims.attack;
    expect(at).toMatchObject({ n: 2, d: 8, hit: 1, fps: 6 });
    expect(at.m).toEqual([]); // sin color del jugador: el juego pone el estandarte
    // NW (espejo del este) mira a la izquierda, como el oeste. Se mira el cuerpo (debajo de la
    // cabeza): queda del lado contrario a la cabeza respecto del centro de la figura.
    const head = (row: number) => {
      const a = packed.meta.anims.idle;
      let left = 0, right = 0, x0 = a.w, x1 = 0, y0 = a.h, y1 = 0;
      const op = (x: number, y: number) => packed.img.data[((a.y + row * a.h + y) * packed.img.w + x) * 4 + 3] > 0;
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (op(x, y)) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      const cx = (x0 + x1) / 2;
      for (let y = Math.ceil((y0 + y1) / 2); y <= y1; y++) for (let x = x0; x <= x1; x++) if (op(x, y)) (x < cx ? left++ : right++);
      return left > right ? 'right' : 'left';
    };
    expect(head(OGA8.indexOf('E'))).toBe('right');
    expect(head(OGA8.indexOf('W'))).toBe('left');
    expect(head(OGA8.indexOf('NW'))).toBe('left');
  });

  it('magenta parts (with their light and shade) become the player-colour mask', () => {
    expect(isMagenta(255, 0, 255)).toBe(true);
    expect(isMagenta(120, 20, 110)).toBe(true); // magenta en sombra
    expect(isMagenta(110, 62, 30)).toBe(false); // marrón del caballo
    expect(isMagenta(230, 208, 168)).toBe(false); // pergamino
    const img = new Img(2, 1);
    img.data.set([200, 10, 200, 255, 110, 62, 30, 255]);
    const { mask, team } = splitTeam(img);
    expect(team).toBe(1);
    expect([...mask.data.slice(0, 4)]).toEqual([200, 200, 200, 255]);
    expect(mask.data[7]).toBe(0); // lo demás no se tiñe
  });

  it('recommended layout: transparent PNG, rows = 8 directions, columns = frames, magenta = player colour', () => {
    const CELL = 64, FRAMES = 3;
    const W = CELL * FRAMES, H = CELL * 8;
    const img = new Img(W, H); // transparente
    const set = (x: number, y: number, c: number[]) => img.data.set([...c, 255], (y * W + x) * 4);
    for (let d = 0; d < 8; d++)
      for (let k = 0; k < FRAMES; k++) {
        const x0 = k * CELL, y0 = d * CELL;
        for (let y = 12; y < 52; y++) for (let x = 22; x < 42; x++) set(x0 + x, y0 + y + (k % 2), [110, 62, 30]);
        for (let y = 30; y < 36; y++) for (let x = 22; x < 42; x++) set(x0 + x, y0 + y + (k % 2), [200, 20, 200]); // manta magenta
      }
    const spec = {
      id: 'test2', units: ['mongols/horse_archer'],
      dirs: Object.fromEntries(OGA8.map((d: string) => [d, d])),
      anims: { walk: { block: { x0: 0, y0: 0, cell: CELL, frames: FRAMES }, fps: 10 } },
      frame: 64,
    };
    const { packed, report } = buildSheet(img, spec);
    expect(report).toEqual([]); // con magenta: sin avisos
    const walk = packed.meta.anims.walk;
    expect(walk).toMatchObject({ n: FRAMES, d: 8, fps: 10 });
    expect(walk.m.length).toBe(8 * FRAMES * 6); // un recorte de color de equipo por cuadro
  });
});
