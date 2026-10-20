// Antes de arrancar el servidor: instala las dependencias la primera vez y recompila el cliente si
// falta o si cambió algo desde la última vez (así el docente nunca juega con una versión vieja).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fecha de modificación más nueva dentro de una carpeta (o de un archivo). */
function newest(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const f of fs.readdirSync(p)) m = Math.max(m, newest(path.join(p, f)));
  return m;
}

function run(cmd, args, what) {
  console.log(`  ${what}…`);
  const r = spawnSync([cmd, ...args].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n  Could not finish: ${what}. Check the messages above.\n`);
    process.exit(1);
  }
}

export function prepare() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) run('npm', ['install'], 'Installing the game (first time only, needs internet)');
  const built = path.join(ROOT, 'client/dist/index.html');
  const sources = Math.max(
    newest(path.join(ROOT, 'client/src')),
    newest(path.join(ROOT, 'client/index.html')),
    newest(path.join(ROOT, 'client/public/art/units.json')),
    newest(path.join(ROOT, 'shared')),
  );
  if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < sources) run('npx', ['vite', 'build'], 'Building the game for the browser');
}

/** Abre una dirección en el navegador predeterminado. */
export function openBrowser(url) {
  if (process.env.NO_BROWSER) return; // pruebas automáticas
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawnSync(cmd, args, { stdio: 'ignore', shell: false });
}
