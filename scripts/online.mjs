// Jugar por internet desde esta computadora, sin GitHub ni Render.
//
//   npm run online
//
// Abre un "túnel rápido" de Cloudflare (gratis, sin cuenta) hacia el servidor del juego y muestra el
// enlace público https://…trycloudflare.com para los estudiantes. El juego corre en ESTA computadora
// (rápido, sin el límite de CPU del plan gratuito de Render); mientras esta ventana esté abierta, el
// enlace funciona. Cada vez que se abre, el enlace cambia.
//
// Requiere cloudflared:  winget install --id Cloudflare.cloudflared
// Desde internet, el panel del profesor pide el PIN (lo muestra el servidor al arrancar).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;

function findCloudflared() {
  const candidates = ['cloudflared', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

/** ¿Ya hay algo escuchando en el puerto (un servidor del juego abierto)? */
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

const children = [];
const stop = () => {
  for (const c of children) c.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.error('\n  cloudflared is not installed. Install it with:\n\n    winget install --id Cloudflare.cloudflared\n\n  then run  npm run online  again.\n');
  process.exit(1);
}

// El cliente compilado (lo que se descarga el navegador).
if (!fs.existsSync(path.join(ROOT, 'client/dist/index.html'))) {
  console.log('  Building the game…');
  const b = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (b.status !== 0) process.exit(1);
}

const already = await portInUse(PORT);
console.log(`\n  Opening a Cloudflare tunnel to http://localhost:${PORT} …`);
const tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { cwd: ROOT });
children.push(tunnel);

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the tunnel did not give a link in 40 s (check the internet connection)')), 40_000);
  const scan = (chunk) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk));
    if (m) {
      clearTimeout(timer);
      resolve(m[0]);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.once('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
}).catch((err) => {
  console.error(`\n  Could not open the tunnel: ${err.message}\n`);
  stop();
});

if (!already) {
  // Servidor del juego con el enlace público (así el panel del profesor muestra el correcto).
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), PUBLIC_URL: url },
    stdio: 'inherit',
  });
  children.push(server);
  server.once('exit', stop);
}

const line = '='.repeat(64);
console.log(`\n  ${line}`);
console.log('   ONLINE GAME (internet)');
console.log(`   Students:  ${url}`);
console.log(`   Teacher:   ${url}/teacher   (asks for the teacher PIN shown by the server)`);
console.log(`              or http://localhost:${PORT}/teacher on this computer (no PIN)`);
if (already) console.log('   (The game server was already running on this computer: the tunnel points to it.)');
console.log('   Keep this window open while you play. Ctrl+C closes the tunnel.');
console.log(`  ${line}\n`);
