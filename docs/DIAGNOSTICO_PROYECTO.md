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

## 7. Prioridades recomendadas

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | ✅ Ataque al galope + giro y aceleración de la caballería (2026-10-16) | Lo que más acerca la caballería a Total War | Medio |
| 2 | ✅ Arqueros con animación de arco + carrera a pie (2026-10-16) | Errores visibles en unidades que se usan todo el tiempo | Bajo–medio |
| 3 | Derribo visible, polvo y variantes de muerte | La carga se "siente" | Medio |
| 4 | Guardar partidas (no perderlas al reiniciar) | Una clase no se pierde por un corte | Medio |
| 5 | 16 direcciones para jinetes | Giros suaves en los cuerpos largos | Medio (más memoria) |
| 6 | Renderer WebGL (PixiJS) | Habilita todo lo visual a escala | Alto |
| 7 | Tarjetas de regimiento estilo Total War | Control más claro de la batalla | Medio |
