// Modo desarrollo: arranca el servidor de juego (se reinicia al guardar) y
// Vite (recarga el navegador al guardar). Ctrl+C detiene ambos.
import { spawn } from 'node:child_process';

const opts = { stdio: 'inherit', shell: true };
const procs = [spawn('npm run dev:server', opts), spawn('npm run dev:client', opts)];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
