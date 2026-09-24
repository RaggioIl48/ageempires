import { defineConfig } from 'vite';

// En desarrollo Vite sirve el cliente (puerto 5173) y reenvía /ws al servidor
// de juego (puerto 8080). En producción el propio servidor sirve client/dist.
const GAME_SERVER_PORT = Number(process.env.PORT ?? 8080);

export default defineConfig({
  root: 'client',
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
  },
});
