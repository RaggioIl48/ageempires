// Punto de entrada: arranca el servidor y muestra cómo entrar para la clase.
//   PORT         puerto (8080 por defecto)
//   TEACHER_PIN  clave del profesor para entrar desde otro computador
//                (por defecto se inventa una de 4 cifras al arrancar)

import { randomInt } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startGameServer } from './net/server.ts';

/** Lee un número entero de una variable de entorno; si no es válido, usa el valor por defecto. */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.warn(`  Aviso: ${name}="${raw}" no es válido (entero entre ${min} y ${max}). Se usa ${fallback}.`);
    return fallback;
  }
  return n;
}

const port = intEnv('PORT', 8080, 1, 65535);
const pin = (process.env.TEACHER_PIN ?? '').trim() || String(randomInt(1000, 10000));
const staticDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

/** Adaptadores que no son la red real de la escuela (virtuales, VPN): sus direcciones no les sirven a los estudiantes. */
const VIRTUAL_ADAPTER = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|tailscale|zerotier|hamachi|bluetooth/i;

/** Direcciones de este computador en la red local (Wi-Fi o cable). */
function lanAddresses(): string[] {
  const all = Object.entries(networkInterfaces()).flatMap(([name, addrs]) =>
    (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })),
  );
  const real = all.filter((a) => !VIRTUAL_ADAPTER.test(a.name));
  return (real.length > 0 ? real : all).map((a) => a.address);
}

/**
 * Dirección en internet, si el juego está publicado: PUBLIC_URL a mano, o la
 * que pone Render automáticamente (RENDER_EXTERNAL_URL).
 */
const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

let server;
try {
  server = await startGameServer({
    port,
    pin,
    staticDir,
    // Publicado en internet: solo ese enlace (las direcciones internas del servidor no le sirven a nadie).
    urls: (p) => (publicUrl ? [publicUrl] : lanAddresses().map((ip) => `http://${ip}:${p}`)),
  });
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') console.error(`\n  El puerto ${port} ya está en uso (¿el servidor ya está abierto?). Prueba con otro: PORT=8081\n`);
  else console.error(err);
  process.exit(1);
}

console.log('');
console.log('  Servidor RTS en marcha');
console.log('');
console.log(`  PROFESOR:     abre http://localhost:${server.port}/profesor en este computador`);
console.log(`                (desde otro computador, la clave del profesor es: ${pin})`);
console.log('');
if (publicUrl) console.log(`  EN INTERNET:  ${publicUrl}  (panel del profesor: ${publicUrl}/profesor)`);
else for (const ip of lanAddresses()) console.log(`  ESTUDIANTES:  http://${ip}:${server.port}`);
console.log('');
