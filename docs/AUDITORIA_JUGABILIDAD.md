# Auditoría de jugabilidad (Total War como referencia)

Fecha: 2026-10-21. Rama `main` después de la fusión del PR #1 (`f4186f4`).

Lo que se midió, cómo, y qué cambiar. Los números salen de dos herramientas:
- **Duelos en el simulador** (`scripts/duels.ts`, reproducible con `npx tsx scripts/duels.ts`): sin red ni
  navegador, dos bandos de 8 soldados en regimientos de 4, cada pareja jugada en las dos posiciones.
- **REA sobre el navegador real** (Chrome sin ventana): partidas de prueba contra la computadora rival,
  para ver errores de página y cómo se ve el juego en marcha.

## 0. Resumen

| # | Hallazgo | Impacto en la jugabilidad | Esfuerzo |
|---|---|---|---|
| **1** | Los **arqueros a caballo** ganan casi todos los duelos cuando la infantería **espera**. Cuando la infantería **avanza**, gana ella. | ★★★ (es la unidad mongola) | M |
| **2** | Los **exploradores** (caballería ligera) pierden contra casi todo, también contra arqueros, con un costo parecido. | ★★ | S |
| **3** | Los duelos quietos **no bastan para decidir el balance**: el resultado cambia con el movimiento. Falta un modo de prueba con avance. | ★★ (la herramienta) | S |
| 4 | Lo que sí funciona: lanza contra caballería, espada contra lanza, caballería pesada contra arqueros. | Bien | — |
| 5 | Errores de página en el navegador: ninguno registrado en 4 partidas de prueba. | Bien | — |
| 6 | Online: funciona con el enlace de Cloudflare; límites de subida y de la PC del profesor (sección 4). | Logística | — |

## 1. Método

### 1.1 Duelos

Tabla completa (promedio de las dos posiciones). Celda: **vivos de la fila / vivos de la columna** de 8
soldados cada uno, 90 s de combate sin órdenes (los dos bandos quietos, en guardia o en reposo).

```
                 warrior spearma swordsm  archer  knight   scout legiona chosen_ horse_a gothic_ berserk fanatic
warrior              -  3.0/4.0 1.0/8.0 6.0/8.0 2.5/7.0 8.0/1.0 1.0/8.0 2.0/8.0 6.0/8.0 1.0/7.5 1.0/8.0 2.0/7.0
spearman         4.0/3.0     -  1.0/8.0 6.0/8.0 8.0/1.0 8.0/0.0 1.0/8.0 2.0/8.0 6.0/8.0 7.0/0.0 1.0/8.0 1.0/8.0
swordsman        8.0/1.0 8.0/1.0     -  6.0/8.0 3.0/8.0 7.0/3.5 2.0/5.5 7.0/1.0 6.0/8.0 1.0/8.0 2.0/7.0 5.0/2.0
archer           8.0/6.0 8.0/6.0 8.0/6.0     -  0.0/8.0 1.5/8.0 6.0/6.5 8.0/6.0 0.0/8.0 0.0/8.0 6.0/6.0 6.5/6.0
knight           7.0/2.5 1.0/8.0 8.0/3.0 8.0/0.0     -  8.0/0.5 8.0/2.0 2.0/8.0 5.0/3.5 1.0/6.0 7.0/1.5 7.0/2.5
scout            1.0/8.0 0.0/8.0 3.5/7.0 8.0/1.5 0.5/8.0     -  0.5/7.5 0.0/8.0 0.5/6.5 0.5/8.0 1.0/6.5 1.5/6.0
legionary        8.0/1.0 8.0/1.0 5.5/2.0 6.5/6.0 2.0/8.0 7.5/0.5     -  8.0/1.0 8.0/6.0 2.5/8.0 2.0/6.5 5.0/1.5
chosen_spearman  8.0/2.0 8.0/2.0 1.0/7.0 6.0/8.0 8.0/2.0 8.0/0.0 1.0/8.0     -  6.0/8.0 8.0/0.0 1.0/7.0 2.0/4.5
horse_archer     8.0/6.0 8.0/6.0 8.0/6.0 8.0/0.0 3.5/5.0 6.5/0.5 6.0/8.0 8.0/6.0     -  2.5/7.5 8.0/6.0 8.0/6.0
gothic_knight    7.5/1.0 0.0/7.0 8.0/1.0 8.0/0.0 6.0/1.0 8.0/0.5 8.0/2.5 0.0/8.0 7.5/2.5     -  8.0/2.5 8.0/0.0
berserker        8.0/1.0 8.0/1.0 7.0/2.0 6.0/6.0 1.5/7.0 6.5/1.0 6.5/2.0 7.0/1.0 6.0/8.0 2.5/8.0     -  7.0/0.0
fanatic          7.0/2.0 8.0/1.0 2.0/5.0 6.0/6.5 2.5/7.0 6.0/1.5 1.5/5.0 4.5/2.0 6.0/8.0 0.0/8.0 0.0/7.0     -
```

Nota de método: la primera versión del script daba resultados contradictorios (el que estaba a la
izquierda ganaba siempre). La causa estaba en el **montaje** de mi prueba (los frentes no estaban a la
misma distancia del centro), no en el juego. Está corregido: frentes simétricos y cada pareja jugada en
las dos posiciones. Lo dejo escrito para no repetirlo al cambiar la herramienta.

### 1.2 Arqueros a caballo: la causa, medida

Lanceros contra arqueros a caballo, 8 contra 8, 90 s:

| Situación | Lanceros | Arqueros a caballo |
|---|---|---|
| Ambos quietos | **6** | **8** |
| Lanceros avanzan a atacar (orden de atacar-moviendo) | **5** | **3** |

Lo mismo con espadachines avanzando: 5 contra 4. Es decir: **la ventaja del arquero a caballo depende de
que la infantería no lo persiga**. La regla del juego que lo causa es el **hostigamiento** de los tiradores
(`skirmish` en `server/src/sim/combat.ts`): si un enemigo cuerpo a cuerpo se acerca a 2,2 casillas, el
tirador retrocede 3,5 casillas y sigue disparando. A caballo, el arquero es más rápido que el lancero (2,6 contra
1,3 casillas por segundo), así que el lancero que persigue no alcanza nunca.

Hay además una distancia que favorece al arquero: el alcance de los arqueros a caballo es 5 casillas y la
vista de un lancero es 4. Un lancero quieto no ve al arquero que le dispara desde lejos; solo reacciona
cuando lo golpean.

**Qué significa para Total War.** En Attila el arquero a caballo es fuerte, pero se contesta con caballería
pesada (que lo alcanza) y con tropas de tiro propias, no con lanceros que solo esperan. Aquí el que lo
vence con más claridad es el **caballero gótico**: 7,5 contra 2,5 en la tabla. Lo que parece un
desequilibrio es, sobre todo, que el jugador no tiene una respuesta clara en la infantería de lanza.

### 1.3 Lo que sí funciona (no tocar)

- Lanza contra caballería: lanceros 8 contra jinetes 0 (caballero), y lo contrario 1 contra 8. La
  piedra-papel-tijera de la Edad Media se nota.
- Espada contra lanza: 8 contra 1. Arqueros contra lanceros: 8 contra 6 (los arqueros ganan, pero los
  lanceros se llevan a 6 con ellos: hay un combate, no una masacre).
- Caballero gótico contra casi todo lo que no es lanza: gana casi todo.
- Arqueros contra guerreros: 8 contra 6 (como se espera: el guerrero es de cuerpo a cuerpo).

## 2. Hallazgos por prioridad

### P1. Arqueros a caballo dominan con la infantería parada (★★★, esfuerzo M)

Hoy: la infantería quieta reacciona solo cuando la golpean, y el tirador que hostiga se aleja más rápido de
lo que ella puede seguir.

Propuesta (en orden de costo):
1. **Persecución limitada del hostigador.** Un lancero o espadachín que recibe fuego de un tirador que no
   está en su vista sale a perseguirlo, durante unos segundos, y vuelve a su sitio si lo pierde. No hace
   falta que el jugador lo ordene. (Cambio en `combat.ts` y `orders.ts`.)
2. **El hostigamiento tiene costo.** Al retroceder, el tirador pierde 1 s de recarga. Hoy no pierde nada.
3. **Una respuesta clara en la infantería.** Lanceros en formación cerrada frenan a la caballería, y el
   arquero a caballo que se acerca demasiado a una línea de lanzas queda en su alcance. Ver si el muro de
   lanzas debe detener también al hostigamiento.

Se prueba con `npx tsx scripts/duels.ts` y con un duelo con avance (ver P3). Meta: que el arquero a caballo
gane entre 5 y 6 contra 8 quieto, y que pierda contra la línea de lanzas que avanza.

### P2. Exploradores demasiado débiles (★★, esfuerzo S)

Un explorador (45 de vida, ataque 4, 80 de comida) pierde o casi pierde contra casi todo: 0 contra lanceros,
1 contra guerreros, 0,5 contra caballeros. Solo gana contra arqueros (8 contra 1,5), y ahí la explicación es
que los arqueros no tienen cómo huir de un jinete que llega rápido.

Pregunta de diseño: ¿el explorador es para matar obreros y hacer exploración, o también para pelear? Si es
lo primero, está bien así. Si es lo segundo, le falta algo: más ataque (4 es muy poco) o más vida. Decidir
antes de tocar números.

### P3. Los duelos quietos no alcanzan para balancear (★★, esfuerzo S)

Hoy `scripts/duels.ts` pone a los dos bandos quietos. El resultado de P1 muestra que eso cambia el
resultado. Propuesta: agregar un modo `--avance` en el que el bando de la izquierda ataca-moviendo hacia el
de la derecha, y mostrar las dos tablas. Eso es lo que hace un jugador real.

### P4. Errores de página: ninguno (verificado con REA)

Cuatro partidas de prueba en Chrome sin ventana (una de ellas con la computadora rival hasta el minuto 2 y
medio). En ninguna se registró un error de página (la captura de eventos devolvió 0 eventos, así que no
hubo errores de consola que capturar). Capturas en `scratchpad` durante la sesión; no se incluyen en el
repositorio.

Lo que se ve en pantalla y vale la pena anotar:
- La economía de un alumno que no da órdenes queda en "+0/min" para todos los recursos. Es lo esperado, no
  un defecto, pero para la clase conviene que el juego **avise** cuando el alumno lleva un minuto sin
  trabajadores ocupados (hoy solo aparece el contador "Idle: 3" en la barra superior).
- Con un solo alumno en la sala, la barra de la Colina Sagrada avanza sin rival (la vi llegar a 0:54 de 5:00).
  Conviene decidir si la colina cuenta cuando no hay un enemigo en la sala; no lo medí hasta el final.

### P5. Lo que se investigó y no era un problema

- **Orientación inicial de las tropas nuevas.** Sospechaba que cada soldado nace mirando al sureste y eso
  decide si un golpe llega de frente o por la espalda. Lo probé: poner a cada tropa mirando al enemigo no
  cambia ni un resultado. No es un defecto.
- **Orden de creación.** Probé si la primera tropa creada gana más (en el simulador, el orden de
  actualización de las unidades). Con montajes simétricos el efecto es pequeño: a lo sumo 2 soldados de 8
  en algún duelo (ej. caballero contra lanceros). Lo dejo anotado para vigilarlo, no como defecto.

## 2b. Lo implementado (2026-10-21)

Pasos 1 y 2 de la sección 3: modo de avance en el script y un límite al hostigamiento de la caballería.

**Medido antes y después** (lanceros contra arqueros a caballo, 8 contra 8, 90 s, promedio de las dos posiciones):

| Caso | Antes | Después | Sin hostigamiento (referencia) |
|---|---|---|---|
| Lanceros avanzan a atacar | 6,5 contra 1,5 | **7,0 contra 0,5** | 8 contra 0 |
| Quietos | 6 contra 8 | 6 contra 8 (sin cambio) | 6 contra 1,5 |

**Qué se cambió** (`server/src/sim/combat.ts`, `shared/data.ts`, `server/src/sim/world.ts`):
- Un tirador **a caballo** que ya se retiró 3 veces en 10 s deja de huir y pelea donde está
  (`SKIRMISH_MAX`, `SKIRMISH_WINDOW`). Los tiradores de a pie siguen retrocediendo sin límite.
- Se comprobó sobre las dos tablas completas: **ningún duelo sin caballería cambió**. En una primera
  versión el límite también afectaba a los arqueros de pie y los hacía perder más; se corrigió y queda
  cubierto en `server/test/skirmish-cap.test.ts`.

**Lo que no se cambió, y por qué:**
- No se agregó una regla de "persecución" aparte. Con el límite, la persecución que ya existía (la
  infantería que recibe un golpe responde y va a por el atacante) alcanza. Una regla nueva queda abierta si hace falta.
- El duelo quieto (lanceros 6 contra 8 arqueros a caballo) quedó como hallazgo P6. Ver abajo: la causa
  que se anotó primero estaba equivocada.

**P6 — corregido el 2026-10-21: no era un atasco, era un regimiento que pelea a pedazos (★★, hecho).**
La primera lectura ("los lanceros se quedan parados a 2,3 casillas de la línea") salió de medir la
distancia entre el lancero 0 y el arquero 0, no la de cada soldado a su enemigo. Medido soldado por
soldado (`scripts/duels.ts` y un diagnóstico aparte, 24 duelos de 8 y 24 por bando):

| Qué | Antes | Después |
|---|---|---|
| **Atasco**: ataca a alguien fuera de su alcance, con un enemigo pegado y sin avanzar | infantería 0–1,9 %; caballería hasta **9,5 %** (caballeros contra espadachines) | **≤ 1 %** |
| **Mirones**: quieto sin orden mientras su regimiento pelea, con el enemigo a menos de 12 casillas | hasta **36 %** (legionarios contra berserkers, 24 contra 24) | **≤ 3 %** |

En el duelo quieto de lanceros contra arqueros a caballo, solo los 2 lanceros de adelante peleaban; los
otros 6 no veían al enemigo (vista 4) y se quedaban mirando mientras caían sus compañeros.

Dos cambios en `server/src/sim/combat.ts`:
1. **El regimiento pelea entero.** Si un soldado del regimiento pelea, los que están quietos buscan
   enemigos hasta `REGIMENT_JOIN` = 3 casillas más allá de su vista (el mismo margen con el que un soldado
   deja de perseguir a quien eligió solo). En modo guardia no salen de su puesto.
2. **Pelea con quien tiene delante.** Un soldado de cuerpo a cuerpo que no alcanza a su objetivo pero tiene
   un enemigo pegado lo golpea en vez de quedarse parado. Si el objetivo se lo dio el jugador, lo conserva:
   cuando el de delante cae o se aparta, sigue hacia él. No "rodea" solo: en Total War tampoco; se traba
   con lo que tiene en contacto, y rodear es una orden del jugador.

**Efecto en el balance** (comparado con las tablas de la sección 2b): cambió el ganador en 9 de 66
parejas con los dos bandos quietos y en 5 de 66 con avance. Casi todas tienen tiradores: antes ganaban
porque el regimiento enemigo llegaba de a uno; ahora carga entero. Ejemplos (vivos de cada lado, 8 contra 8):

| Pareja (quietos) | Antes | Después |
|---|---|---|
| Lanceros contra arqueros a caballo | 6 contra 8 | **7 contra 0,5** |
| Espadachines contra arqueros | 6 contra 8 | **5,5 contra 1** |
| Arqueros contra lanceros elegidos | 8 contra 6 | **0 contra 5,5** |
| Arqueros contra fanáticos | 6,5 contra 6 | **0 contra 5,5** |

La mayoría coincide con las descripciones del juego (el espadachín "atraviesa las flechas", el arquero a
caballo es "frágil contra lanceros"). **Dos no coinciden y quedan para decidir:** el lancero elegido y el
fanático dicen "pierden contra arqueros", y ahora les ganan. O se ajustan los arqueros contra infantería sin
armadura, o se cambia la descripción. Es una decisión de diseño, no un error del simulador.

Pruebas: `server/test/regiment-cohesion.test.ts` (3). Cada una falla si se desactiva su cambio.

## 2c. Lo implementado (2026-10-21, segunda tanda)

**P4, hecho.**
- **Aviso de economía parada** (`server/src/sim/idle.ts`). Si un jugador tiene obreros sin trabajo durante
  45 s, recibe un aviso: "2 workers are doing nothing. Click "Idle"…". Se repite cada 90 s mientras siga
  así. Se vio en una partida local (a los 2:16, la repetición).
- **Colina Sagrada sin rival.** Ahora solo cuenta si queda en pie algún rival de quien la tiene. Un alumno
  solo en la sala ya no gana por la colina.
- Pruebas: `server/test/idle-hill.test.ts` (4).

**Arte (pedido junto con esta tanda).**
- **Arquero a caballo mongol.** Se rehízo con el jinete de élite Han de 0 A.D. Se corrigió el arco tirado
  en el suelo: era un accesorio con esqueleto propio, posado con los huesos del jinete.
- **Crines y mantas.** Se levantaban al final de cada disparo y de cada carga, en toda la caballería. Se
  rehicieron todas las hojas de caballería y de arqueros.
- **Centro Urbano mongol.** Ahora es el campamento del kan, dibujado: gran yurta, yurtas de la guardia,
  estandartes de crines, carro y cerco. Todas las yurtas mongolas usan el dibujo nuevo.

- **Por qué seguía viéndose el jinete viejo (hallado con REA en una batalla real).** Una hoja experimental
  local (`client/public/art/experimental/`, la imagen de prueba hecha con IA) reemplazaba al arquero a
  caballo de los jugadores mongoles. Tenía 1 cuadro quieto, sin galope ni carga y sin el color del jugador.
  Se le quitó esa asignación; la imagen se conserva. Comprobado con REA: jinete con arco y manta roja en
  plena batalla, sin errores de página.
- **Unidad única en otras manos.** Si otro pueblo tiene una unidad única (por ejemplo, en una prueba),
  ahora se dibuja con la hoja del pueblo que la tiene, no con un dibujo plano.

**Observación.** Los avisos duran 4 s en pantalla. Para un recordatorio de clase puede ser poco; queda
anotado en la lista de abajo.

## 2d. Prioridades actuales (después de las dos tandas)

| # | Qué | Por qué | Tipo |
|---|---|---|---|
| 1 | **Arqueros contra el lancero elegido y el fanático.** Hoy los arqueros pierden contra ellos, pero sus descripciones dicen lo contrario. | Es lo que más confunde a un alumno: el juego dice una cosa y pasa otra | Decisión de diseño, después números |
| 2 | **Papel del explorador (P2).** ¿Solo explora y caza obreros, o también pelea? | Hoy pierde contra casi todo, con un costo parecido al de las tropas | Decisión de diseño |
| 3 | **Resto de P1.** El hostigamiento todavía no cuesta recarga. Falta decidir si el muro de lanzas frena también al arquero a caballo. | El límite de 3 retiradas ya cerró lo peor. Esto es el ajuste fino | Simulador |
| 4 | ~~**Arte mongol que falta.**~~ **Hecho (2026-10-22).** El caballero es ahora un lancero Han con casco cerrado y caballo con armadura. En las eras 3 y 4, los mongoles construyen una ciudad Yuan con los edificios Han de 0 A.D. | Mismo pedido que el arquero a caballo y el Centro Urbano | Arte |
| 5 | **Avisos importantes más visibles.** Por ejemplo, que el de obreros quietos dure más que 4 s | Pulido para la clase | Cliente |
| 6 | **Online (sección 4).** Límites de subida y de la PC del profesor | Logística, sin cambio de código | — |

## 3. Propuesta de orden de trabajo

| Paso | Qué | Por qué | Estado |
|---|---|---|---|
| 1 | Modo `--avance` en `scripts/duels.ts` (P3) | Sin esto no se puede medir nada de lo que sigue | Hecho (2b) |
| 2 | Persecución limitada y costo del hostigamiento (P1, puntos 1 y 2) | Es el hallazgo más grande y el más pedido (Mongoles) | En parte: límite de retiradas (2b). Falta el costo |
| 3 | Decidir qué es el explorador y ajustar (P2) | Decisión de diseño antes de números | Pendiente |
| 4 | Aviso de economía parada y decisión de la Colina Sagrada (P4) | Pulido para la clase | Hecho (2c) |

La lista vigente es la de la sección 2d.

## 4. Online: lo que funciona, las limitaciones y lo gratis

### 4.1 Lo que probé hoy

- **El fallo del modo online está corregido** (ver `docs/PROGRESO.md`, 2026-10-20): el servidor probaba el
  enlace antes de que existiera y el DNS de la red lo recordaba como "no existe".
- Enlace público: aparece en unos 20 s; la página y el arte cargan por el enlace; un alumno conectado por el
  enlace público recibió 129 actualizaciones en ~14 s (la velocidad normal).
- El navegador integrado se conecta por el enlace público sin problemas.

### 4.2 Limitaciones reales

| Limitación | Qué pasa | Qué hacer |
|---|---|---|
| **El enlace cambia** cada vez que se reinicia el servidor | Hay que mandarlo de nuevo a los alumnos | Usar una opción con enlace fijo (abajo) |
| **La PC del profesor debe estar encendida** y con el servidor corriendo | Si se apaga, se acaba la partida | Servidor fijo (abajo) |
| **Las partidas viven en memoria** | Si el servidor se reinicia, se pierden todas las partidas | Guardar partidas (punto 4 de la hoja de ruta) |
| **La subida de la casa del profesor** | Con niebla, unos 23 KB/s por alumno con 3.100 unidades: 16 alumnos ≈ 3 Mbit/s de subida (cabe en casi cualquier casa). Sin niebla, 207 KB/s por alumno ≈ 26 Mbit/s: **no cabe** | En línea, siempre con niebla de guerra |
| **Tope de unidades** | 2.400 unidades por partida repartidas entre los jugadores (150 por alumno con 16) | Ya implementado |
| **Cloudflare, túnel rápido** | Sin garantía de disponibilidad (es para pruebas). Nuestra documentación (`docs/JUGAR_ONLINE.md`) menciona un tope de unas 200 conexiones simultáneas; no lo verifiqué aquí, y para una clase debería sobrar | Vigilante del propio enlace ya implementado |
| **Un solo servidor** | No hay reparto de carga: 16 alumnos de la misma partida van al mismo proceso | Ver la pregunta de 8+8 más abajo |

### 4.3 Opciones gratis para no pagar (y lo que verifiqué)

| Opción | Costo | Enlace | Estado |
|---|---|---|---|
| **Túnel rápido de Cloudflare desde la PC del profesor** | Gratis, sin cuenta | Cambia | **Probado hoy** (funciona) |
| **Red local del aula** | Gratis | IP del aula | **Probado** (LAN, 4 ms) |
| **Tailscale Funnel** | Gratis con cuenta personal | **Fijo** (`https://pc.tailXXXX.ts.net`) | No probado (necesita tu cuenta). Ver límites de Funnel en su documentación antes de depender de él |
| **Render, plan gratis** (`render.yaml` ya existe) | Gratis | Fijo | No probado hoy. Según nuestra documentación: ~0,1 CPU y se duerme a los 15 min sin uso; no sirve para batallas grandes |
| **Oracle Cloud "Always Free"** (un servidor propio) | Gratis | Fijo | No probado. Pide tarjeta para verificar y a veces no hay cupo |

Recomendación para no pagar: **Tailscale Funnel** como enlace fijo, y mientras tanto el túnel rápido. Si
Funnel no sirve, el servidor del colegio (si queda encendido) es la mejor salida gratis.

### 4.4 Pregunta abierta: ¿8 contra 8 en dos servidores?

Dos grupos de 8 en dos PC distintas: cada PC corre su propio juego, con su propio enlace y su propio PIN.
No comparten partida (el servidor no reparte una partida entre máquinas). Eso es lo más fácil: no requiere
código nuevo, solo dos copias del paquete portátil (`LEEME.txt`). Si los dos grupos tienen que jugar uno
contra el otro, hace falta otra cosa (un servidor central), que no está hecho.

## 6. Verificación del arte de todos los pueblos y qué sigue para parecerse a Total War (2026-10-22)

### 6.1 Arte de los edificios (verificado con REA)

Se dibujó cada edificio de los 7 pueblos en las 4 eras con el código del juego, en Chrome sin ventana.
Ningún pueblo queda sin arte.

**Por qué el profesor veía casas de polígonos en los germanos.** El servidor mandaba el arte
(`art/*.json` y las imágenes) con un día de caché. El navegador seguía usando la lista de edificios de
antes de que existiera la ciudad germana, y el juego dibujaba las formas. Ahora el arte se revalida
siempre (`server/src/net/server.ts`): si no cambió, el servidor responde "304" sin volver a mandarlo.
Hay que reiniciar el servidor una vez y recargar la página con Ctrl+Shift+R.

**Lo que todavía falta:**

| Qué | Dónde |
|---|---|
| El cuartel, la arquería, el establo, el centro de tecnología y el mercado de los mongoles, en las eras 1 y 2, son casas europeas de entramado | 0 A.D. no tiene campamento nómada: habría que dibujarlos (como el campamento del kan) |
| El monasterio es la misma iglesia para 5 pueblos | Variantes por pueblo (iglesia de madera para germanos, de piedra visigoda) |
| Los edificios únicos (salón de guerra, nemeton, castrum…) siguen dibujados con formas | Pasarlos a modelos de 0 A.D. como los fuertes |
| El centro urbano visigodo de las eras 2 y 3 es el genérico | 0 A.D. no tiene uno íbero |

### 6.2 ¿Eliminar las eras Industrial y Moderna?

| Era | Unidades |
|---|---|
| 1 Tribal | 4 |
| 2 Edad Media | **30** (con tres etapas) |
| 3 Industrial | 4 |
| 4 Moderna | 5 |

**Recomendación: sí, terminar la partida en la Edad Media, pero con una opción de partida, no borrando
el código.**
- Casi todo el juego ya vive en la Edad Media: 30 de 43 unidades, las tres etapas, las murallas, el
  asedio y las reglas de regimientos, moral, cargas y cansancio.
- En las eras 3 y 4 hay muy pocas unidades (9) y no tienen las reglas que dan sabor a Total War
  (formaciones cerradas, cargas, armaduras): un fusil a distancia anula todo lo demás.
- Con una opción "Última era: Edad Media" (activada por defecto) se ocultan los botones de avance y sus
  unidades. Si algún día se quiere volver, no hay que rehacer nada.
- Lo que se libera: la Colina Sagrada, la Maravilla y la Gloria se terminan en la Edad Media, y el
  tiempo de desarrollo va a lo que distingue a Total War.

### 6.3 Qué falta para parecerse más a Total War (en orden)

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | ~~**Opción "Última era: Edad Media"**~~ **Hecho (2026-10-22)**: activada por defecto en el panel del profesor | Concentra el juego donde ya está todo | S |
| 2 | **Bonificación por flanco y retaguardia más visible** (ya existe en el código): flecha o aviso "¡Flanqueados!" y más caída de moral | En Total War la batalla se gana rodeando; hoy el alumno no lo nota | S |
| 3 | **Terreno que importa**: más ataque y alcance desde la altura, el bosque esconde y frena a la caballería | Hoy la altura apenas cuenta (3 archivos la usan) y no hay emboscadas | M |
| 4 | **Formaciones de regimiento elegibles**: cuña para la caballería, testudo y muro de escudos con reglas propias, cuadro contra caballería | El muro de escudos existe solo para vikingos; faltan las demás | M |
| 5 | **Pausa táctica y velocidad** (ya existe la pausa de batalla) con órdenes en pausa | Es lo que permite pensar la batalla | S |
| 6 | **Generales con área de mando** que se vea en el mapa, y caída de moral grande si muere | Ya hay general; falta que se note el radio | S |
| 7 | **Balance pendiente**: el lancero elegido y el fanático ganan a los arqueros contra lo que dicen (P6) | Coherencia con las descripciones | S |
| 8 | **Mapa de campaña** (regiones, ciudades, turnos) | Es la otra mitad de Total War, pero es un proyecto aparte | L |

## 5. Qué no cubre esta auditoría

- Batallas largas (20–40 min) y con muchos regimientos: solo medí duelos de 8 contra 8 y el simulador de
  800 soldados del `perf.test.ts`. La medición de 3.100 unidades del día 2026-10-20 sí cubre el rendimiento.
- Balance de máquinas de asedio, murallas y la IA contra el alumno: no medidos aquí.
- La experiencia de un alumno real (aburrimiento, claridad de la interfaz): solo lo que se ve en las
  capturas; hace falta probar con estudiantes.
