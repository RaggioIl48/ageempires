# Jugar online con los estudiantes (cada uno desde su casa)

El juego tiene dos partes:
- **El servidor**: simula la partida. Corre en Node.js.
- **El cliente**: lo que descarga el navegador. Al empezar se bajan unos 5–15 MB por estudiante (el
  código y el arte de los pueblos que aparecen en pantalla), y después solo el arte nuevo que haga
  falta. Desde esta versión, el navegador guarda esos archivos en caché.

Lo único que cambia entre las opciones es **dónde corre el servidor** y **cómo llegan los
estudiantes hasta él**.

## Recomendación (auditada el 2026-10-16, todo gratis)

| Situación | Usar | Por qué |
|---|---|---|
| **Clase en el aula** (lo habitual) | **Red local**: doble clic en `Jugar en el aula.bat` (o `npm run aula`) | No usa internet. Medido: el servidor responde en 4 ms por la red local y el juego usa ~67 kbit/s por estudiante (picos de 250): 30 alumnos ≈ 2 Mbit/s, nada para el Wi-Fi del colegio |
| Algún estudiante desde la casa | En el panel del profesor: **🌐 Turn on online play** (o `Jugar online.bat`) | Gratis, sin cuenta. El panel muestra el enlace con botón de copiar; cambia cada vez que se enciende |
| Si un día quieres un enlace fijo | Tailscale Funnel (opción 2) | Gratis con cuenta; mismo enlace siempre |

**Red local, paso a paso:**
1. La primera vez: instalar Node.js LTS (https://nodejs.org).
2. Cada clase: doble clic en **`Jugar en el aula.bat`**. Prepara el juego si cambió algo, arranca
   el servidor y abre el panel del profesor.
3. Los estudiantes escriben en el navegador la dirección de **STUDENTS** que muestra la ventana
   (por ejemplo `http://192.168.1.7:8080`). Tienen que estar en la misma red Wi-Fi o de cable.
4. La ventana debe quedar abierta mientras juegan.

**Si un estudiante no puede entrar:**
- **Misma red:** el Wi-Fi de invitados suele ser otra red. Tienen que estar en la misma que tu PC.
- **Permiso de Windows:** si Windows pregunta si Node.js puede usar la red, responde **Permitir**.
  En esta PC ya está permitido, incluso en redes "públicas".
- **Aislamiento de equipos:** muchas redes Wi-Fi de colegio impiden que los equipos se hablen entre
  sí. Si nadie puede entrar aunque estén en la misma red, eso es lo que pasa. Pídele a sistemas que
  lo permita para tu PC o para el **equipo servidor del colegio** (si está conectado por cable a la
  red de las salas, es la mejor opción). Otra salida es conectar tu PC por cable.
- **IP cambiante:** la dirección puede cambiar de un día a otro (la asigna el router). Lee siempre la
  que muestra la ventana; también aparece en el panel del profesor. Sistemas puede dejarle una IP
  fija a tu PC o al equipo servidor.

**El equipo del colegio como servidor:** sirve igual. Se instala Node.js, se copia la carpeta del
juego y se usa `Jugar en el aula.bat`. Si queda siempre encendido, los estudiantes entran a la misma
dirección todas las clases.

**Pantalla de carga:** al empezar la partida, cada navegador prepara solo el arte de los pueblos que
juegan (~1–2 s en la red local). En la sala de espera ya va descargando el de su pueblo.

## Resumen

| Opción | Costo | Enlace | ¿Tu PC encendida? | Esfuerzo | Ideal para |
|---|---|---|---|---|---|
| **1. `npm run online`** (túnel rápido de Cloudflare) | Gratis, sin cuenta | Cambia cada vez | Sí | 1 comando | Empezar hoy |
| **2. Tailscale Funnel** | Gratis (cuenta) | **Fijo** | Sí | 15 min, una vez | Mismo enlace todas las clases |
| **3. Túnel con nombre de Cloudflare** | Gratis + dominio (~10 USD/año) | **Fijo y propio** (`juego.tucolegio.com`) | Sí | 30 min, una vez | Enlace fijo y bonito |
| **4. Servidor en la nube (VPS)** | 0–5 USD/mes | **Fijo** | **No** | 1 hora, una vez | Que funcione siempre, sin tu PC |
| 5. Render (lo de antes) | Gratis (lento) o 7 USD/mes | Fijo | No | Ya lo conoces | Solo con el plan pago |
| 6. Red local (LAN) | Gratis | IP del aula | Sí | `npm start` | Clases presenciales |

**Recomendación:**
- **Hoy:** opción 1.
- **Si se juega todas las semanas:** opción 2, para que el enlace no cambie.
- **Si no quieres depender de tu computadora:** opción 4.

## 1. `npm run online`: túnel rápido de Cloudflare (ya instalado)

```bash
npm run online
```

Muestra el enlace `https://algo.trycloudflare.com` para los estudiantes. El panel del profesor es
`…/teacher`, con el PIN que aparece en la ventana.

- **A favor:** no necesita cuenta ni configuración, y es rápido (usa la CPU de tu PC, no los ~0,1 CPU
  del Render gratuito).
- **En contra:**
  - El enlace cambia cada vez, así que hay que mandarlo en cada clase.
  - La PC y esa ventana deben quedar abiertas.
  - Cloudflare lo ofrece "para pruebas", con un tope de ~200 conexiones simultáneas; para un curso
    sobra.
- **Subida de tu internet:** con la caché nueva, los archivos se bajan una sola vez por estudiante.
  Cloudflare además puede guardar copias en su red. Una subida de 5–10 Mbps alcanza para 30
  estudiantes; el juego en sí usa poco: solo las posiciones.

## 2. Tailscale Funnel: enlace fijo y gratis

Tailscale publica un puerto de tu PC en internet con una dirección fija, como
`https://mi-pc.tail1234.ts.net`. Solo se instala en **tu** computadora; los estudiantes entran con el
navegador, sin instalar nada.

1. Crea una cuenta gratis en https://tailscale.com e instala Tailscale en tu PC (inicia sesión).
2. En la consola web de Tailscale, activa **HTTPS** y **Funnel** (*Access controls* → permitir
   `funnel`; el asistente lo ofrece la primera vez).
3. Cada clase, abre el juego y el túnel (dos ventanas de terminal):

   ```bash
   npm start
   ```

   ```bash
   tailscale funnel 8080
   ```

4. Opcional: para que el panel del profesor muestre el enlace correcto, arranca el servidor con
   `PUBLIC_URL=https://mi-pc.tail1234.ts.net`.

El enlace es siempre el mismo: lo puedes dejar fijo en el aula virtual (Classroom, Moodle…).

## 3. Túnel con nombre de Cloudflare: enlace fijo y propio

Es lo mismo que la opción 1, pero con tu propio dominio. Necesitas un dominio (unos 10 USD al año,
se puede comprar en Cloudflare mismo) y una cuenta gratuita de Cloudflare.

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create juego
```

```bash
cloudflared tunnel route dns juego juego.tudominio.com
```

```bash
cloudflared tunnel run --url http://localhost:8080 juego
```

Junto con `npm start` y `PUBLIC_URL=https://juego.tudominio.com`, deja el enlace
`https://juego.tudominio.com` para siempre.

## 4. Servidor en la nube (VPS): sin depender de tu PC

Un servidor siempre encendido. El juego no necesita mucho: 1–2 núcleos y 1–2 GB de RAM sobran para
una clase.

| Proveedor | Precio | Notas |
|---|---|---|
| Oracle Cloud "Always Free" | Gratis | 4 núcleos ARM, 24 GB. Pide tarjeta para verificar y a veces no hay cupo |
| Hetzner CX22 | ~4–5 € al mes | 2 núcleos, 4 GB. Muy buena relación precio/rendimiento (Europa/EE. UU.) |
| DigitalOcean / Vultr / Linode | ~6 USD al mes | 1 núcleo, 1 GB. Basta para 1–2 cursos a la vez |
| Render Starter | 7 USD al mes | 0,5 CPU, sin dormirse. Lo más fácil si ya lo usaste |

Pasos (Ubuntu):
1. Instalar Node 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs`.
2. Clonar el repositorio y preparar el juego: `npm install && npm run build`.
3. Dejarlo encendido: `sudo npm i -g pm2 && pm2 start "npm start" --name juego && pm2 save && pm2 startup`.
4. HTTPS con dominio: instalar **Caddy** con un archivo `Caddyfile` que tenga una línea:
   `juego.tudominio.com { reverse_proxy localhost:8080 }`. Caddy saca el certificado solo.
5. `TEACHER_PIN=1234` y `PUBLIC_URL=https://juego.tudominio.com` como variables de entorno.

## 5. Render

- **Plan gratuito:** da ~0,1 CPU y se duerme tras 15 minutos sin uso; por eso el juego iba lento y
  daba tirones. Con las optimizaciones de esta versión (búsqueda de caminos 5 veces más rápida) va
  mejor, pero sigue siendo poco para una batalla grande.
- **Plan Starter (7 USD al mes):** alcanza.

## Medidor de fluidez (F3)

Durante la partida, F3 muestra si un problema viene de **internet** (ping), del **servidor** (ms por
paso y el peor paso reciente) o de **esta computadora** (fps, el peor cuadro y cuántos tirones
hubo).
