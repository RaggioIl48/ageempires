# Hojas de sprites externas (p. ej. hechas con IA): cómo deben ser

Guía exacta para que una imagen de unidad entre al juego con calidad completa, y cómo se importa.
Herramienta: `tools/art/importgrid.mjs` + una especificación JSON (ejemplo:
`tools/art/imports/mongols-horse_archer.json`).

```bash
node tools/art/importgrid.mjs tools/art/imports/<unidad>.json <imagen.png>
```

El resultado va a `client/public/art/experimental/` (no se publica: está en `.gitignore`). El juego
la usa si existe; si no existe o no carga, dibuja la unidad normal (respaldo).

---

## 1. Diagnóstico de la imagen de prueba (arquero a caballo mongol, 2026-10-12)

| Requisito | Imagen recibida | ¿Sirve? |
|---|---|---|
| Formato | JPG 1408×768, sin transparencia | ⚠ Se recorta el pergamino automáticamente; funciona, pero el borde queda menos limpio que con PNG transparente |
| Fondo | Pergamino con textura, líneas de cuadrícula, rótulos y título | ⚠ El importador lo quita (relleno desde bordes + papel encerrado + restos) |
| Sombra | Dibujada bajo cada caballo | ⚠ Se quita (el juego ya pone la suya) |
| Direcciones | 8 rótulos, pero "N" y "NW" están de perfil mirando a la derecha; no hay vista de espaldas; "S" de galope y de disparo está de perfil (en reposo está de frente) | ❌ Solo hay 3 vistas reales: perfil derecho, perfil izquierdo y frente. NW se arregla espejando NE; N queda de perfil |
| Cuadros por animación | 1 dibujo por acción y dirección | ❌ No hay animación de verdad: el paso se simula alternando "walk" e "idle" con un saltito de 1 px |
| Mismo personaje en todas las celdas | Bastante parecido | ✅ Mejor que la imagen anterior |
| Color del jugador | No tiene | ❌ El juego le pone un estandarte con el color del jugador (respaldo) |
| Licencia | Desconocida; el título dice "TOTAL WAR" (marca registrada de otra empresa) | ❌ No se puede publicar hasta confirmar origen y licencia, y sin esa marca |
| Tamaño | Figuras de ~120 px en celdas de ~154×128 | ✅ Se achican a la mitad (≈60 px; cuadro de 96×96) |

**Resultado:** se importó y funciona en el juego como prueba local (con respaldo automático),
pero no se publica: le faltan vistas reales, animación, color del jugador y licencia.

---

## 2. Instrucciones exactas para que funcione al 100 %

### Formato
1. **PNG de 32 bits con transparencia real** (canal alfa). Nada de JPG.
2. **Sin fondo, sin cuadrícula, sin rótulos, sin títulos, sin marcos.**
3. **Sin sombra en el suelo** (el juego la dibuja).
4. **Sin nombres ni logos de otros juegos** ("Total War", "Age of Empires"…).

### Cuadrícula
5. Una hoja por animación (`idle.png`, `walk.png`, `run.png`, `attack.png`, `death.png`), o una
   sola hoja con todas, siempre con **celdas de 192 × 192 px exactos**, sin separación entre celdas.
6. **Filas = direcciones, en este orden:** `S, SE, E, NE, N, NW, W, SW`
   (S = mirando hacia la cámara, abajo de la pantalla; E = hacia la derecha; N = de espaldas).
7. **Columnas = cuadros de la animación**, de izquierda a derecha.

### Cámara y figura
8. **Vista isométrica 2:1**: cámara girada 45° y inclinada ~30° hacia abajo, **sin perspectiva**.
9. **Las 8 vistas deben ser reales**: N y NE/NW de espaldas o tres cuartos de espaldas; no repetir el
   perfil.
10. **Jinete + caballo de ~120 px de alto** dentro de la celda de 192 px.
11. **Cascos (pies) siempre en el mismo punto**: centrados a lo ancho (x = 96) y apoyados en y ≈ 165,
    en todas las celdas.
12. **El mismo personaje en todas las celdas**: misma armadura, el arco en la misma mano, el carcaj
    del mismo lado, el mismo casco.

### Animaciones (cuadros)
| Animación | Cuadros | Notas |
|---|---|---|
| idle (reposo) | 1–4 | respiración / cola |
| walk (paso) | 8 | ciclo completo del caballo |
| run (galope) | 8 | opcional |
| attack (disparo) | 6–8 | **decir en qué cuadro sale la flecha** (cuadro de impacto: el juego lo hace coincidir con el daño real del servidor) |
| death (muerte) | 6 | el último, caído en el suelo |

### Color del jugador
13. Pintar en **magenta puro (#FF00FF)**, con sus luces y sombras en tonos de magenta, las partes
    que deben llevar el color del jugador: **la manta de la montura, una faja o el banderín**. El
    importador las convierte en la máscara de equipo (el juego las tiñe de azul, rojo, etc.).

### Licencia (obligatorio para publicar)
14. Decir **de dónde sale la imagen**: herramienta usada (y que sus términos permiten usarla y
    redistribuirla), o autor y licencia (CC0, CC-BY, CC-BY-SA, OGA-BY, GPL). Se anota en los créditos
    del juego, como el resto del arte.

### Texto para pedirla a una IA (una dirección por vez)
> Pixel art sprite strip, Mongol horse archer on a brown horse, **isometric 2:1 orthographic view
> from 30 degrees above, facing SOUTH-EAST**, **8 frames of a walk cycle in one horizontal row,
> each frame exactly 192×192 px**, the same rider in every frame (lamellar armour, round fur hat,
> bow in the left hand, quiver on the right hip), **saddle blanket painted in pure magenta #FF00FF**,
> **transparent background**, no shadow, no ground, no text, no labels, no borders.

Repetir cambiando la dirección (`SOUTH`, `EAST`, `NORTH-EAST`, `NORTH` = seen from behind…) y la acción
(`walk cycle`, `gallop cycle`, `shooting an arrow: draw, aim, release, recover`, `falling dead`).

**Aviso realista:** las IA rara vez mantienen el mismo personaje idéntico en 40–64 dibujos. Si eso
falla, la alternativa fiable para animaciones es renderizar modelos 3D de 0 A.D. (ver
`docs/RESUMEN_PROYECTO.md`, sección 4).

---

## 3. Cómo se importa (especificación JSON)

Disposición recomendada (una sola hoja PNG con un bloque por animación; cada bloque tiene 8 filas
= direcciones en orden `S, SE, E, NE, N, NW, W, SW` y una columna por cuadro, celdas de 192 px):

```json
{
  "id": "exp-mongols-horse_archer",
  "units": ["mongols/horse_archer"],
  "license": "CC-BY 4.0 — Autor/herramienta …",
  "dirs": { "S": "S", "SE": "SE", "E": "E", "NE": "NE", "N": "N", "NW": "NW", "W": "W", "SW": "SW" },
  "anims": {
    "idle":   { "block": { "x0": 0, "y0": 0,    "cell": 192, "frames": 1 }, "fps": 1 },
    "walk":   { "block": { "x0": 0, "y0": 1536, "cell": 192, "frames": 8 }, "fps": 10 },
    "attack": { "block": { "x0": 0, "y0": 3072, "cell": 192, "frames": 8 }, "fps": 10, "hit": 5 },
    "die":    { "block": { "x0": 0, "y0": 4608, "cell": 192, "frames": 6 }, "fps": 8, "loop": false }
  },
  "shrink": 2, "scale": 0.85, "frame": 96
}
```

(Cada bloque mide 8 × 192 = 1536 px de alto: idle empieza en y = 0, walk en 1536, attack en 3072…)

La imagen de prueba usa la otra disposición (filas = acciones, columnas = direcciones, con
`grid`, `rows`, `cols` y `frames`): ver `tools/art/imports/mongols-horse_archer.json`.

- `dirs` admite espejar una dirección que falte: `"NW": { "col": "NE", "mirror": true }`.
- `hit` = cuadro del impacto del ataque (se sincroniza con el golpe real del servidor).
- El importador avisa si una figura no entra en el cuadro o si no hay magenta (sin color del jugador).

Para publicar una unidad importada (con la licencia confirmada) hay que pasarla de `experimental/` a
`units/` con sus créditos en `credits.json`; la prueba `server/test/art.test.ts` exige licencia abierta
y color del jugador en todas las animaciones.
