import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Versión del arte: cambia cuando cambian las listas de hojas y edificios. Va en la dirección de cada
// imagen (?v=…): así un navegador nunca mezcla una imagen vieja con la lista nueva (el soldado se
// dibujaba recortado en pedazos) y no hace falta Ctrl+F5 después de actualizar.
const ART_VERSION = createHash('sha1')
  .update(['units.json', 'buildings.json'].map((f) => { try { return readFileSync(`client/public/art/${f}`); } catch { return ''; } }).join('|'))
  .digest('hex')
  .slice(0, 10);

// En desarrollo Vite sirve el cliente (puerto 5173) y reenvía /ws al servidor
// de juego (puerto 8080). En producción el propio servidor sirve client/dist.
const GAME_SERVER_PORT = Number(process.env.PORT ?? 8080);

export default defineConfig({
  root: 'client',
  define: { __ART_VERSION__: JSON.stringify(ART_VERSION) },
  server: {
    host: true, // accesible desde otros equipos de la red local
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${GAME_SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // El visor de animaciones (preview.html) también se publica: sirve para revisar unidades y medir fluidez.
    rollupOptions: { input: { main: 'client/index.html', preview: 'client/preview.html' } },
  },
});
