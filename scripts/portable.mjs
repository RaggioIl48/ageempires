// Paquete portátil para Windows: una carpeta (y un .zip) que se copia a otro computador y funciona
// con doble clic, sin instalar Node.js ni nada más. Trae su propio node.exe, el servidor empaquetado en
// un solo archivo, el juego ya compilado para el navegador, cloudflared (si está en este computador,
// para el modo online) y el ícono.
//
//   npm run portable      →  dist-portable/ClassroomEmpires/  y  dist-portable/ClassroomEmpires-portable.zip
//
// Hay que rehacerlo después de cambiar el juego (el paquete no se actualiza solo).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { ROOT } from './prepare.mjs';

const OUT = path.join(ROOT, 'dist-portable');
const PKG = path.join(OUT, 'ClassroomEmpires');
const APP = path.join(PKG, 'app');
const CLOUDFLARED = ['C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'].find((p) => fs.existsSync(p));

const step = (what) => console.log(`  ${what}…`);
/** Archivo de texto para Windows (finales de línea CRLF). */
const writeText = (file, text) => fs.writeFileSync(file, text.replace(/\r?\n/g, '\r\n'));

if (process.platform !== 'win32') console.warn('  Warning: the package uses this computer\'s node.exe; build it on Windows for Windows.');

step('Building the game for the browser');
const vite = spawnSync('npx vite build', { cwd: ROOT, stdio: 'inherit', shell: true });
if (vite.status !== 0) process.exit(1);

fs.rmSync(PKG, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });

step('Bundling the server into one file');
await build({
  entryPoints: [path.join(ROOT, 'server/src/index.ts')],
  outfile: path.join(APP, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // ws trae dos aceleradores opcionales en C; sin ellos funciona igual.
  external: ['bufferutil', 'utf-8-validate'],
  // Las dependencias CommonJS (ws) necesitan require dentro de un módulo ES.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

step('Copying node.exe, the game and the icon');
fs.copyFileSync(process.execPath, path.join(APP, 'node.exe'));
// Sin el arte experimental: su licencia no está confirmada y solo se usa en este computador.
const EXPERIMENTAL = path.join(ROOT, 'client/dist/art/experimental');
fs.cpSync(path.join(ROOT, 'client/dist'), path.join(APP, 'web'), { recursive: true, filter: (src) => !src.startsWith(EXPERIMENTAL) });
fs.copyFileSync(path.join(ROOT, 'tools/icon/classroom-empires.ico'), path.join(APP, 'classroom-empires.ico'));
if (CLOUDFLARED) fs.copyFileSync(CLOUDFLARED, path.join(APP, 'cloudflared.exe'));
fs.mkdirSync(path.join(APP, 'licenses'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(APP, 'licenses', 'Classroom-Empires-LICENSE.txt'));
writeText(
  path.join(APP, 'licenses', 'THIRD-PARTY.txt'),
  `Este paquete incluye programas de terceros, sin cambios:

- node.exe: Node.js ${process.version} (licencia MIT). https://nodejs.org  https://github.com/nodejs/node/blob/main/LICENSE
- cloudflared.exe: Cloudflare Tunnel client (licencia Apache 2.0). https://github.com/cloudflare/cloudflared
- ws (dentro de server.mjs): licencia MIT. https://github.com/websockets/ws

Los créditos y licencias del arte del juego están en web/art/credits.json (y en el juego: "Art credits").
`,
);

// Arranque: comprueba si ya está abierto, prende el servidor y abre el panel del profesor.
fs.writeFileSync(
  path.join(APP, 'start.mjs'),
  `// Arranca el servidor del paquete portátil y abre el panel del profesor (lo genera scripts/portable.mjs).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
process.env.STATIC_DIR = path.join(HERE, 'web');
if (fs.existsSync(path.join(HERE, 'cloudflared.exe'))) process.env.CLOUDFLARED = path.join(HERE, 'cloudflared.exe');
if (process.argv.includes('--online')) process.env.AUTO_TUNNEL = '1';
const open = (url) => process.env.NO_BROWSER || spawnSync('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' });

const inUse = await new Promise((resolve) => {
  const s = net.connect(PORT, '127.0.0.1');
  s.once('connect', () => (s.destroy(), resolve(true)));
  s.once('error', () => resolve(false));
});
if (inUse) {
  console.log(\`\\n  The game server is already open on this computer (port \${PORT}). Opening the teacher panel.\\n\`);
  open(\`http://localhost:\${PORT}/teacher\`);
  process.exit(0);
}
await import('./server.mjs');
setTimeout(() => open(\`http://localhost:\${PORT}/teacher\`), 1200);
`,
);

const launcher = (title, args) => `@echo off
chcp 65001 >nul
title Classroom Empires - ${title}
cd /d "%~dp0"
"%~dp0app\\node.exe" "%~dp0app\\start.mjs" ${args}
pause
`;
writeText(path.join(PKG, 'Jugar en el aula.bat'), launcher('aula (red local)', ''));
writeText(path.join(PKG, 'Jugar online.bat'), launcher('online (tambien desde la casa)', '--online'));
writeText(
  path.join(PKG, 'Crear icono en el escritorio.bat'),
  `@echo off
chcp 65001 >nul
title Classroom Empires - crear icono en el escritorio
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = [Environment]::GetFolderPath('Desktop'); $w = New-Object -ComObject WScript.Shell; $here = (Get-Location).Path;" ^
  "foreach ($p in @(@('Classroom Empires (aula)', 'Jugar en el aula.bat'), @('Classroom Empires (online)', 'Jugar online.bat'))) {" ^
  "  $s = $w.CreateShortcut((Join-Path $d ($p[0] + '.lnk'))); $s.TargetPath = (Join-Path $here $p[1]); $s.WorkingDirectory = $here;" ^
  "  $s.IconLocation = (Join-Path $here 'app\\classroom-empires.ico') + ',0'; $s.Description = 'Classroom Empires: servidor del juego'; $s.Save() }"
if errorlevel 1 (echo. & echo   No se pudo crear el icono. Abre el juego con "Jugar en el aula.bat".) else (echo. & echo   Listo: en el escritorio estan "Classroom Empires (aula)" y "Classroom Empires (online)".)
echo.
pause
`,
);
writeText(
  path.join(PKG, 'LEEME.txt'),
  `CLASSROOM EMPIRES - paquete portatil (Windows)
================================================

No hay que instalar nada: esta carpeta trae todo (incluido Node.js).

1. Copia la carpeta entera "ClassroomEmpires" al computador que va a ser el servidor
   (un pendrive sirve). No la dejes dentro del .zip: descomprimela primero.
2. Doble clic en "Crear icono en el escritorio.bat" (una sola vez).
3. Para jugar: doble clic en el icono "Classroom Empires (aula)" del escritorio
   (o en "Jugar en el aula.bat"). Se abre el panel del profesor en el navegador.
4. Los estudiantes entran desde su navegador con la direccion que aparece como STUDENTS
   (mismo Wi-Fi o red que este computador).

- Desde la casa (internet): "Classroom Empires (online)". ${CLOUDFLARED ? 'El paquete ya trae cloudflared.' : 'Necesita cloudflared: winget install --id Cloudflare.cloudflared'}
- La primera vez, Windows puede preguntar si deja que "node.exe" use la red: elige "Redes privadas" y permitir.
  Si no, los estudiantes no podran entrar.
- Para cerrar el servidor: cierra la ventana negra.
- No cambies el nombre ni el contenido de la carpeta "app".

Dos grupos a la vez (por ejemplo 8 y 8): cada grupo puede jugar en su propia partida desde el mismo
servidor (en el panel del profesor se crean dos partidas, cada una con su codigo), o en otro computador
con otra copia de esta carpeta. Dos servidores distintos son dos partidas separadas: los alumnos de uno
no se encuentran con los del otro.
`,
);

step('Making the .zip');
const zip = path.join(OUT, 'ClassroomEmpires-portable.zip');
fs.rmSync(zip, { force: true });
// tar de Windows (bsdtar) sabe hacer .zip; está en todo Windows 10/11.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'zip';
const z = process.platform === 'win32'
  ? spawnSync(tar, ['-a', '-c', '-f', zip, '-C', OUT, 'ClassroomEmpires'], { stdio: 'inherit' })
  : spawnSync('zip', ['-qr', zip, 'ClassroomEmpires'], { cwd: OUT, stdio: 'inherit' });
if (z.status !== 0) console.warn('  Could not make the .zip (the folder is ready anyway).');

const size = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((s, f) => s + size(path.join(p, f)), 0) : fs.statSync(p).size);
console.log(`\n  Ready: ${path.relative(ROOT, PKG)} (${(size(PKG) / 1048576).toFixed(0)} MB)`);
if (fs.existsSync(zip)) console.log(`         ${path.relative(ROOT, zip)} (${(fs.statSync(zip).size / 1048576).toFixed(0)} MB)\n`);
