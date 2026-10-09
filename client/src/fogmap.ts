// Velo de niebla rápido. Una sola vez por mapa se calcula qué casilla del suelo (con sus
// colinas) cae en cada píxel de la imagen de niebla; después, cada vez que cambia lo que se
// ve, basta con escribir la oscuridad de cada píxel en un arreglo (sin dibujar polígonos).
// Antes: miles de polígonos por actualización (~80 ms). Ahora: un recorrido de números (~1 ms).

/** Oscuridad (0–255) de cada nivel de niebla (0 = se ve, 8 = no se ve nada). */
export const FOG_ALPHA: Uint8Array = (() => {
  const a = new Uint8Array(9);
  for (let k = 1; k <= 8; k++) a[k] = Math.round(255 * Math.min(0.62, (k / 8) * 1.25));
  return a;
})();

/**
 * Qué casilla se ve en cada píxel (−1 = fuera del mapa). `corner(x, y)` da la posición en la
 * imagen de la esquina (x, y) del suelo, ya con su altura. Se pintan de atrás hacia adelante,
 * así una colina tapa lo que está detrás, igual que en el dibujo del terreno.
 */
export function buildFogIndex(n: number, W: number, H: number, corner: (x: number, y: number) => [number, number]): Int32Array {
  const idx = new Int32Array(W * H).fill(-1);
  // Esquinas precalculadas (cada una la comparten cuatro casillas).
  const cx = new Float32Array((n + 1) * (n + 1)), cy = new Float32Array((n + 1) * (n + 1));
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      const [px, py] = corner(x, y);
      cx[y * (n + 1) + x] = px;
      cy[y * (n + 1) + x] = py;
    }
  const at = (x: number, y: number) => y * (n + 1) + x;
  // Lado del punto respecto de la arista p→q (con un poco de margen para no dejar huecos).
  const side = (px: number, py: number, qx: number, qy: number, x: number, y: number) => (qx - px) * (y - py) - (qy - py) * (x - px);
  for (let s = 0; s <= 2 * (n - 1); s++)
    for (let tx = Math.max(0, s - n + 1); tx <= Math.min(s, n - 1); tx++) {
      const ty = s - tx;
      // Rombo de la casilla: arriba (tx,ty), derecha (tx+1,ty), abajo (tx+1,ty+1), izquierda (tx,ty+1).
      const q = [at(tx, ty), at(tx + 1, ty), at(tx + 1, ty + 1), at(tx, ty + 1)];
      const xs = q.map((i) => cx[i]), ys = q.map((i) => cy[i]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      const tile = ty * n + tx;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let inside = true;
          for (let e = 0; e < 4 && inside; e++) {
            const a = e, b = (e + 1) % 4;
            if (side(xs[a], ys[a], xs[b], ys[b], px, py) < -0.6 * Math.hypot(xs[b] - xs[a], ys[b] - ys[a])) inside = false;
          }
          if (inside) idx[y * W + x] = tile;
        }
    }
  return idx;
}

/** Escribe la oscuridad de cada píxel (canal alfa de una imagen RGBA) según la niebla de cada casilla. */
export function paintFog(idx: Int32Array, fogLevel: Float32Array, rgba: Uint8ClampedArray): void {
  for (let i = 0, j = 3; i < idx.length; i++, j += 4) {
    const t = idx[i];
    rgba[j] = t < 0 ? 0 : FOG_ALPHA[Math.round(fogLevel[t] * 8)];
  }
}
