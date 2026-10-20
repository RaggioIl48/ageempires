// Jugar en el aula (red local) y, si se quiere, también desde la casa (internet).
//
//   npm run aula            (o doble clic en "Jugar en el aula.bat")
//   npm run online          (o "Jugar online.bat"): lo mismo, con el modo online ya encendido
//
// El modo online también se enciende y apaga con el botón "🌐" del panel del profesor.
// Prepara el juego si hace falta, arranca el servidor en esta computadora y abre el panel del
// profesor. Los estudiantes entran desde el navegador con la dirección que aparece en "STUDENTS"
// (misma red Wi-Fi o cable que esta computadora). No necesita internet ni cuentas.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { openBrowser, prepare, ROOT } from './prepare.mjs';

const PORT = Number(process.env.PORT) || 8080;
const ONLINE = process.argv.includes('--online');

const inUse = await new Promise((resolve) => {
  const s = net.connect(PORT, '127.0.0.1');
  s.once('connect', () => (s.destroy(), resolve(true)));
  s.once('error', () => resolve(false));
});
if (inUse) {
  console.log(`\n  The game server is already open on this computer (port ${PORT}). Opening the teacher panel.\n`);
  openBrowser(`http://localhost:${PORT}/teacher`);
  process.exit(0);
}

prepare();
const env = { ...process.env, ...(ONLINE ? { AUTO_TUNNEL: '1' } : {}) };
delete env.PUBLIC_URL; // el enlace público lo maneja el propio servidor (modo online)
const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'], env });
let opened = false;
server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!opened && String(chunk).includes('server running')) {
    opened = true;
    // Después del aviso completo del servidor (con la dirección para los estudiantes).
    setTimeout(() => {
      openBrowser(`http://localhost:${PORT}/teacher`);
      console.log('  Students at home: press "🌐 Turn on online play" in the teacher panel' + (ONLINE ? ' (opening it now…)' : '') + '.');
      console.log('  If a student cannot open the STUDENTS link:');
      console.log('   · they must be on the same Wi-Fi (or cable network) as this computer;');
      console.log('   · if Windows asks whether Node.js may use the network, answer Allow;');
      console.log('   · some school Wi-Fi networks block devices from talking to each other: ask IT, or use cable.');
      console.log('  Keep this window open while you play. Close it to stop the server.\n');
    }, 300);
  }
});
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill());
