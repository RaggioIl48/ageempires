# Fluidez de las animaciones y rendimiento (2026-10-15)

Qué se midió, qué se cambió y qué conviene hacer después. Las mediciones del navegador se hicieron con
**REA** (`capture_browser_scenario`: Chrome 155 lanzado con perfil temporal, 1280×720, la página
`/preview.html?stress=…` y lectura del resultado al final), en la PC de desarrollo.

## 1. Lo que se midió

### Costo de dibujar los soldados 3D (prueba de carga del visor)
`/preview.html?stress=N&art=3d|lpc&lod=0|1`: N soldados de romanos y galos (caminando, peleando y quietos)
dibujados con `drawSpriteUnit`, el mismo código del juego.

| Escena | fps | Dibujo prom. | p95 | Evidencia REA |
|---|---|---|---|---|
| 400 soldados, hojas LPC | 60 | 4,83 ms | 5,60 ms | `ev_99edb820…` |
| 400 soldados, hojas 3D (antes del cambio) | 53 | 5,45 ms | 7,60 ms | `ev_4b76f10c…` |
| 600 soldados, 3D, sin media resolución | 38 | 7,74 ms | 11,2 ms | `ev_8cbfb03d…` |
| 600 soldados, 3D, **con media resolución** | **54** | 7,06 ms | 9,60 ms | `ev_dd2b3702…` |

Las primeras dos corridas se hicieron con otro proceso usando la CPU (el render de hojas), así que solo
sirven para comparar entre sí. Las dos últimas, con la CPU libre, son el A/B limpio.

### Tirones al moverse con wifi irregular (simulación, `facing.test.ts`)
Una tropa que marcha a velocidad constante; los estados del servidor llegan cada 100 ms con un retraso
aleatorio. Se cuenta en cuántos cuadros (de 16 ms) el dibujo casi se frena o salta al doble.

| Jitter de la red | Antes | Ahora |
|---|---|---|
| 0 ms | 0 % | 0 % |
| 30 ms | 2,0 % | 0 % |
| 60 ms | 6,8 % | 0 % |
| 90 ms | 10,3 % | 0 % |

## 2. Lo que se cambió

1. **Copias a media resolución de las hojas grandes** (`client/src/art.ts`, `halfOf`): cuando un soldado
   3D se dibuja a la mitad o menos de su tamaño (lo normal sin zoom), se usa una copia a media
   resolución hecha fuera del hilo principal con `createImageBitmap`. Con zoom cercano se usa la
   original, así que no se pierde detalle. +42 % de fps con 600 soldados.
2. **Reloj de dibujo por pasos del servidor** (`client/src/motion.ts`, `TickClock` y `posAt`; usado en
   `state.ts`): antes cada unidad corría hasta la última posición recibida en exactamente 100 ms y se
   frenaba; si el siguiente estado llegaba tarde, la tropa "latía". Ahora se guarda la posición de cada
   unidad en los últimos pasos y se dibuja un paso atrás del último (como antes), según un reloj que
   estima cuándo debía llegar cada paso y cuánto dura uno de verdad. Si hay jitter, se agrega un margen
   (hasta 1 paso más). Si un estado se atrasa de verdad, la tropa sigue medio paso por inercia.
   Con la red estable el retraso es el mismo de antes.
3. **Visor con prueba de carga** (`client/src/preview.ts`): `?stress=600`, `art=lpc` para comparar con
   las hojas viejas, `lod=0` para apagar la media resolución. Sirve para repetir estas mediciones.

## 2b. Agregado el 2026-10-15

4. **Transiciones entre animaciones** (`art.ts`, `blendOf`): al pasar de caminar a quieto o a atacar, el
   cuadro anterior se desvanece en 120 ms en vez de cortar de golpe.
5. **Reacción al golpe**: destello claro de 160 ms sobre el soldado que recibe daño.
6. **Precarga** (`preloadFaction`): al entrar a la partida se piden las hojas del propio pueblo, de a una.
7. **Servidor con proyectiles y regimientos**: 800 soldados peleando = 6,45 ms por paso (de 100 disponibles),
   con hasta 38 proyectiles en vuelo; igual que antes.

## 3. Qué hacer después (no hecho todavía)

### Fluidez de las animaciones
- **Transiciones entre animaciones**: hoy se pasa de caminar a quieto o a atacar de golpe. Mezclar 2–3
  cuadros (por ejemplo, terminar el paso antes de quedarse quieto) o empezar el reposo en el cuadro más
  parecido. Esfuerzo bajo.
- **Reacciones al golpe**: un retroceso de 1–2 px y un destello al recibir daño. 0 A.D. no trae esa
  animación, pero se puede simular al dibujar. Esfuerzo bajo.
- **Caballería, trabajadores y General en 3D**: siguen en LPC (4 direcciones). 0 A.D. tiene sus
  animaciones (jinete + caballo, recolectar, construir). Es lo que más se nota ahora junto a la
  infantería nueva. Esfuerzo medio (ver `SOLDADOS_3D.md`).
- **Más cuadros en el paso** (10 → 12–16) solo si se nota un salto con zoom cercano: cada cuadro suma
  ~8 % de peso a la hoja.

### Rendimiento del cliente
- **Peso del arte**: las 40 hojas 3D suman ~21,7 MB (≈ 550 KB cada una), cargadas solo cuando la unidad
  aparece en pantalla. Opciones: pasar a **WebP** (≈ −40 %, necesita un codificador en las
  herramientas de arte), o bajar `FIGURE_PX` de 84 a 72 (≈ −25 %).
- **Precarga**: pedir en la sala de espera las hojas del pueblo elegido, para que la primera tropa
  no aparezca un instante con el dibujo de formas.
- **Pantallas de alta densidad**: limitar el `devicePixelRatio` del canvas a 1,5 en computadoras
  lentas (el medidor F3 ya detecta "este computador tiene problemas para dibujar").

### Servidor y red
- **Servidor**: la causa más probable de lentitud en clase sigue siendo el plan gratuito de Render
  (~0,1 CPU, se duerme). Un servidor en la laptop del docente o un VPS barato lo resuelve.
- **Regimientos** (ver `DIAGNOSTICO_BATALLAS.md`): mandar posiciones por regimiento en vez de por
  soldado reduciría mucho el tráfico de las batallas grandes.

## 4. Tirones y congelamientos (2026-10-16)

- **Causa:** las hojas se dibujaban desde `<img>`. Chrome guarda las imágenes decodificadas solo hasta
  cierto tope de memoria (~400–500 MB en este equipo). Al pasarlo, vuelve a decodificar y subir a la
  GPU en **cada cuadro**. Medido: 300 dibujos desde 75 hojas = 3,7 s por cuadro. Es lo que se sentía
  como "se congela todo" al juntarse muchos pueblos en una batalla.
- **Arreglo:**
  - Las hojas se guardan como `ImageBitmap`: 100 hojas, 22 ms.
  - Atlas recortado (`tools/art/trim.mjs`): 1052 MB → 412 MB de texturas.
  - Las máscaras de color se preparan con un presupuesto por cuadro.
- **Servidor:** A* 5 veces más rápido y un presupuesto de búsqueda por paso. El peor paso pasó de
  89 ms a 13 ms.
- **Medir:** F3 muestra el peor cuadro, la cantidad de tirones y el peor paso del servidor. Para las
  pruebas de carga: `preview.html?stress=300&types=all&colors=8&zoomcycle=1`.
- **Hojas nuevas:** después de `soldiers.mjs`, correr `node tools/art/trim.mjs` (recorta y rehace la
  copia liviana) y después `node tools/art/stride.mjs` (mide la zancada para que los pies no patinen).
