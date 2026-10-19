# Diagnóstico: qué falta para seguir avanzando (2026-10-16)

Basado en lo medido con REA en esta etapa (capturas del visor de animaciones, medición de cascos,
pruebas de carga y partidas automáticas) y en la revisión del código.

## 1. Dónde estamos (medido)

| Área | Hoy |
|---|---|
| Fluidez | 60 fps con 300 soldados de 74 tipos y 8 colores; tras la pantalla de carga, 1 tirón en 40 s |
| Servidor | 1–2 ms por paso de simulación; el peor, 13 ms, en una batalla de 8 jugadores |
| Red | ~67 kbit/s por estudiante: 30 alumnos ≈ 2 Mbit/s |
| Animaciones 3D | 8 direcciones. Infantería: quieto 6, caminar 10, ataque 8 y muerte 8 cuadros. Jinetes: además galope de 12 cuadros |
| Tamaño en pantalla | 84 px de alto al renderizar, ~34 px con el zoom normal |
| Balance | Triángulo de unidades correcto. Pueblos entre 25 % y 75 % de victorias contra bots |

## 2. Caballería: qué la separa de Total War y de 0 A.D.

Ordenado por cuánto se nota en pantalla.

1. **El caballo se detiene para atacar.** La hoja de ataque usa el cuerpo del caballo "quieto"
   (`body: 'idle'` en `tools/art/soldiers.mjs`): en el visor, toda la fila de ataque muestra al
   caballo parado mientras el jinete golpea. En Total War la carga **es** el ataque: el jinete
   golpea o baja la lanza **al galope**, atraviesa la línea y sigue.
   → Renderizar el ataque sobre el cuerpo **galopando** (`attack_run`), y usar el de caballo quieto
   solo en el combate estático.
2. **Giros instantáneos.** El servidor da vuelta al jinete de golpe hacia donde camina
   (`u.fx = …` en `movement.ts`) y no hay aceleración ni inercia. Un caballo de Total War gira en
   arco, tarda en arrancar y en frenar, y su carga tiene impulso.
   → Para la caballería: giro limitado (por ejemplo, 180°/s), aceleración y frenado. La carga
   debería necesitar recorrido (ya existe `CHARGE_READY_SEC`; falta que se vea en el movimiento).
3. **8 direcciones para un cuerpo largo.** En un caballo el salto entre una dirección y la
   siguiente (45°) se nota mucho más que en un soldado a pie. 0 A.D. gira de forma continua porque
   es 3D.
   → 16 direcciones solo para los jinetes. Gracias al atlas recortado, la memoria lo permite: hoy
   una hoja de jinete ocupa ~4 MB.
4. **Arranques y paradas secos.** Del trote al quieto se pasa en 120 ms de fundido.
   → Cuadros de "frenar" y "arrancar", o al menos que el paso frene (bajar el ritmo antes de quedar
   quieto). Ya existe la medición de zancada para hacerlo bien.
5. **El impacto de la carga casi no se ve.** El servidor ya derriba y empuja (`KNOCKDOWN`,
   `CHARGE_TRAMPLE`), pero el soldado derribado no tiene animación de caer y levantarse, y no hay
   polvo ni choque visible.
   → Animación de derribo (0 A.D. tiene `knockback`/`death` reutilizables), polvo al galopar y una
   sacudida corta en el impacto.
6. **Una sola muerte.** El jinete y el caballo caen juntos, siempre igual.
   → 2 o 3 variantes de muerte (jinete que cae del caballo, caballo que cae). 0 A.D. las trae.
7. **Quieto sin vida.** Hay 6 cuadros de reposo idénticos para todos.
   → Variantes de reposo, como un caballo que mueve la cabeza o la cola, elegidas al azar por
   unidad.

## 3. Infantería

- **Arqueros con animación de otra arma.** Varios "arqueros" usan como base un hondero o un
  lanzador de jabalinas (por ejemplo, galos: `infantry_slinger_a`; germanos y visigodos:
  javelinistas). Disparan con el gesto de lanzar.
  → Usar actores arqueros de 0 A.D. (los hay para casi todas las culturas) o, como mínimo, un
  arquero común para esos pueblos.
- **La carga a pie es un caminar acelerado.** La infantería no tiene animación de correr.
  → Agregar `run` a pie (0 A.D. la tiene) para cargas y retiradas.
- **No hay reacción al golpe ni bloqueo.** Solo un destello. En Total War los soldados se cubren
  con el escudo, retroceden y se emparejan en duelos.
  → Cuadros de "cubrirse" (muro de escudos) y de "recibir golpe".
- **Las formaciones no se notan como bloque.** No hay estandarte por regimiento ni una línea
  cerrada visible.
  → Un estandarte por regimiento (el abanderado de 0 A.D.) y un contorno suave del regimiento
  seleccionado.

## 4. Batallas tipo Total War (jugabilidad)

- **Masa y empuje.** La caballería pesada debería abrirse paso entre la infantería ligera y
  frenarse contra lanzas en formación. Hoy la separación entre unidades es igual para todos.
- **Cohesión del regimiento.** Cuando un regimiento se desordena (persecución, terreno), debería
  pelear peor hasta reagruparse.
- **Información del regimiento.** Tarjetas de unidades abajo, estilo Total War: vida y moral por
  regimiento, en vez de por soldado. Combina con el panel compacto.
- **Balance pendiente.** Vikingos (75 %) y ostrogodos (67 %) algo fuertes; galos (25 %) débiles.
  Quedó propuesta una sesión aparte para equilibrarlos.

## 5. Técnica: el siguiente salto

- **Canvas 2D llegó a su techo razonable.** Rinde bien con unos 300 soldados, pero cada sprite es
  una llamada de dibujo. Con **WebGL** (por ejemplo PixiJS, que dibuja miles de sprites por lote)
  se pueden tener 16 direcciones, polvo, sombras suaves y batallas de 800+ soldados en laptops del
  colegio. Es el cambio técnico que más habilita lo de arriba. Esfuerzo: alto, pero el juego ya
  separa bien el dibujo (`render.ts` y `art.ts`).
- **Opción "0 A.D. de verdad".** Dibujar los modelos 3D de 0 A.D. en el navegador (three.js), con
  esqueleto, giro continuo y mezcla de animaciones. Es lo más parecido a 0 A.D. y Total War, pero
  es casi un motor nuevo: una dirección a largo plazo, no el próximo paso.
- **Partidas que no se pierden.** Si el servidor se reinicia, la partida desaparece (límite
  conocido). Guardar el estado cada minuto en un archivo y retomarlo al arrancar.
- **Sincronización por regimiento.** Mandar la posición del regimiento en lugar de la de cada
  soldado reduciría todavía más el tráfico en batallas grandes.

## 6. Clases y uso real

- **Enlace online fijo** (Tailscale Funnel, gratis): para no mandar uno nuevo cada clase.
- **Equipo servidor del colegio:** probar con sistemas si las salas pueden verse entre sí (el
  aislamiento de Wi-Fi es el riesgo principal).
- **Tutorial guiado** para la primera clase: 5 minutos que enseñen recoger, construir, entrenar un
  regimiento y atacar.
- **Herramientas del profesor:** pausar con mensaje para la clase, repetir una batalla y guardar
  el informe de la partida.

## 7. Prioridades recomendadas (actualizado 2026-10-19)

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | ✅ Ataque al galope + giro y aceleración de la caballería (2026-10-16) | Lo que más acerca la caballería a Total War | Medio |
| 2 | ✅ Arqueros con animación de arco + carrera a pie (2026-10-16) | Errores visibles en unidades que se usan todo el tiempo | Bajo–medio |
| 3 | ✅ Derribo visible, polvo, sacudida y variantes de muerte (2026-10-19) | La carga se "siente" | Medio |
| — | ✅ Alcance visible, disparo en marcha y combate cercano en marcha (2026-10-19) | Pedido directo: control de arqueros | Bajo–medio |
| — | ✅ Clave de pruebas `imperio10mil` (2026-10-19) | Probar unidades sin juntar recursos | Bajo |
| 4 | Guardar partidas (no perderlas al reiniciar) | Una clase no se pierde por un corte | Medio |
| 5 | Edad Media en tres etapas, con catapulta y monje (§9) | La edad que más se juega es hoy la más plana | Medio–alto |
| 6 | Posturas de combate (agresiva / defensiva / mantener) y guarnición | El jugador decide si sus tropas traban combate solas | Medio |
| 7 | Animación de disparo en marcha (jinete arquero al galope) | Hoy disparan con el cuadro de caminar | Medio |
| 8 | 16 direcciones para jinetes | Giros suaves en los cuerpos largos | Medio (más memoria) |
| 9 | Tarjetas de regimiento estilo Total War | Control más claro de la batalla | Medio |
| 10 | Renderer WebGL (PixiJS) | Habilita todo lo visual a escala | Alto |

## 8. Lo hecho el 2026-10-19

- **Alcance de los arqueros:** al seleccionar tiradores se ve la zona a tiro (sombreada, borde
  amarillo punteado). Con un regimiento entero se dibuja una sola mancha (la unión de los círculos).
  Falta sumar el alcance extra de las colinas en el dibujo.
- **Disparo en marcha:** con una orden de mover simple, los tiradores disparan sin detenerse al
  enemigo más cercano a tiro. A pie recargan 35 % más lento; el jinete arquero, normal.
- **Combate cercano en marcha:** los cuerpo a cuerpo que marchan traban combate con un soldado
  enemigo que se les acerca a un 30 % de su visión (mínimo 2 casillas). Al terminar siguen hacia su
  destino. Ignoran trabajadores y enemigos que huyen, y no se alejan de su camino.
- **Clave de pruebas:** escribir `imperio10mil` en el chat deja 10.000 de cada recurso. Funciona si
  un estudiante juega solo contra la computadora, o si el profesor activa "Test mode" al crear la
  partida. Nadie más ve el mensaje.
- **Prioridad 3:** el muerto cae hacia donde iba el golpe (lo arrollado por una carga sale
  despedido media casilla) y a uno de tres ritmos. Hay polvo al caer y al ser derribado, y una
  sacudida corta de cámara cuando una carga choca en pantalla. Todo con la animación de muerte que
  ya existía: en el caché de 0 A.D. solo está `death_a` para la infantería.
- Medido con REA (Chrome sin ventana, partida completa con ejércitos de prueba): la clave, el
  alcance y la marcha funcionan, sin errores en la página. 423 tests pasan (9 nuevos en
  `server/test/marching.test.ts`).

## 9. Auditoría: la Edad Media

La Edad Media es donde pasa casi toda la partida (la Industrial está pensada para llegar tarde).
Hoy tiene 8 unidades comunes (explorador, lancero, espadachín, arquero, caballero, ariete, torre de
asedio, General), 3 únicas por pueblo, 40 tecnologías y 24 edificios. Pero 21 de esas 40
tecnologías son solo "élite" de las unidades únicas: la edad tiene mucho volumen y poco recorrido.

Lo que más falta, por cuánto cambia la partida:

1. **No hay progreso dentro de la edad.** Del año 500 al 1500 todo pasa en un solo escalón.
   → Tres etapas (Alta, Plena y Baja Edad Media) con una pregunta de historia cada una. Cada etapa
   abre algo que se ve: cota de malla → placas, castillos de piedra, ballesteros y piqueros.
   Además da una línea de tiempo concreta para la clase.
2. **No hay artillería de piedra común.** Solo los mongoles (trabuquete) y los romanos (escorpión)
   tienen máquinas a distancia. Los demás asedian con ariete y torre.
   → Mangonel o catapulta para todos en la Plena Edad Media, y trabuquete en la Baja.
3. **No hay curación ni religión común.** Solo el Nemeton galo y la regeneración vikinga curan.
   → Monje o sacerdote (cura a las tropas cercanas) y un monasterio. Las reliquias que dan oro
   serían un buen gancho de historia y un objetivo en el mapa.
4. **Las tropas viejas no se actualizan.** El guerrero tribal sigue siendo guerrero toda la
   partida (límite conocido).
   → Líneas de mejora estilo AoE II: al investigar la mejora, las unidades existentes cambian de tipo.
5. **Faltan órdenes clásicas:** guarnecer torres, castillos y el Centro Urbano (los trabajadores se
   esconden y disparan flechas), y patrullar.
6. **Comercio pobre:** el mercado solo cambia recursos. Una carreta de comercio entre mercados
   propios o aliados le da sentido a la diplomacia y a los caminos.
7. **Balance pendiente:** vikingos (75 %) y ostrogodos (67 %) fuertes; galos (25 %) débiles.
8. **Ballestero, piquero y caballería ligera son tecnologías, no unidades nuevas.** El cliente ya
   distingue la unidad mejorada (`isUpgraded`); falta comprobar en el visor que el cambio se note
   lo suficiente en pantalla.

## 10. Diagnóstico: jugabilidad y animaciones

### Jugabilidad
- **Posturas de combate en vez de un solo interruptor de guardia.** Con el combate en marcha, las
  tropas ahora pelean solas. Para una retirada, el jugador necesita poder decir "no te detengas".
  → Tres posturas por regimiento: agresiva (persigue todo lo que ve), defensiva (lo de hoy: traba
  combate cerca y sigue) y mantener (no se mueve). Un botón en el panel, como el de guardia.
- **El alcance tendría que verse antes de entrenar:** al pasar el ratón por el botón de entrenar, y
  con el bonus de altura cuando el arquero está en una colina.
- **Retirada clara:** una orden "Retirada" que ignora enemigos y corre (hoy, mover con Shift o
  caminar no la reemplazan).
- **Tutorial de 5 minutos y tarjetas de regimiento** (ver §6 y §4): hoy aprender a jugar depende
  del profesor.
- **Guardar partidas:** sigue siendo el mayor riesgo de una clase.

### Animaciones
- **Disparo en marcha sin cuadro propio.** El arquero que dispara caminando usa el cuadro de
  caminar: la flecha sale, pero el gesto no. En el caché de 0 A.D. están las variantes
  `base_archer_fast_back` y `base_archer_fast_hip` del jinete arquero, que parecen ser disparos al
  galope (hay que comprobarlo). Para el arquero a pie conviene una decisión de diseño: que se
  detenga medio segundo para tirar, o que dispare caminando sin gesto.
- **Muertes de verdad distintas.** Las variantes de hoy son de movimiento y ritmo. Para tener
  caídas distintas hacen falta más animaciones de muerte de 0 A.D.; en el caché solo está
  `death_a`. Para la caballería ya están `horse_death_01` y la del jinete (`death_01`): con ellas se
  puede hacer "el jinete cae del caballo" dibujando caballo y jinete por separado al morir.
- **Choque de carga:** ya hay derribo, polvo y sacudida. Falta un cuadro de "recibir golpe" o de
  retroceso en el que aguanta la carga sin caer.
- **Reposo:** cada soldado ya empieza su ciclo desfasado, pero todos repiten los mismos 6 cuadros.
  Dos o tres reposos distintos (mirar alrededor, apoyarse en la lanza) elegidos por unidad le
  darían vida a una línea que espera.
- **Lo grande sigue igual:** 16 direcciones para jinetes y WebGL (§5) son los saltos de fondo.
