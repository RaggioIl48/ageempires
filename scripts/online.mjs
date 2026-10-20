// Jugar desde la casa (internet) además de en el aula: el servidor del aula con el modo online
// (túnel rápido de Cloudflare) ya encendido. El enlace aparece en esta ventana y en el panel del
// profesor, que también tiene el botón para apagarlo o volver a encenderlo.
//
//   npm run online      (o doble clic en "Jugar online.bat")
//
// Requiere cloudflared:  winget install --id Cloudflare.cloudflared

process.argv.push('--online');
await import('./classroom.mjs');
