# ADR-001: Arte de unidades con recursos de código abierto

**Estado:** Aceptado (2026-09-25)
**Fecha:** 2026-09-25
**Decide:** Andrés (profesor, dueño del proyecto)

## Contexto

Hoy las unidades y edificios se dibujan con formas geométricas en el código
(`client/src/sprites.ts`). Funcionan y cada pueblo ya se distingue, pero se ven
"de figuras". Se pide reemplazarlas por arte de verdad tomado de proyectos de código
abierto.

Fuerzas en juego:

- **Regla original del proyecto:** "código, arte y nombres 100 % originales" (para no
  copiar nada de Age of Empires). Usar arte abierto de terceros **cambia esa regla**:
  pasa a ser "original **o** con licencia abierta y créditos". Sigue sin haber nada de
  AoE, pero hay que decidirlo explícitamente.
- **Repositorio público (GitHub) y juego publicado (Render):** redistribuimos los
  archivos, así que la licencia tiene que permitir redistribuir. Quedan fuera las
  licencias "NC" (no comercial) y "ND" (sin cambios), y los packs "gratis" con
  licencias propias que prohíben compartir los archivos. Esos packs se revisan uno
  por uno y se descartan por defecto.
- **Licencias compatibles:** CC0 (sin condiciones), CC-BY y OGA-BY (dar crédito),
  CC-BY-SA y GPL (dar crédito y compartir el arte con la misma licencia). El código
  sigue en CC0. La carpeta de arte tendría su propia licencia y un archivo de
  créditos, que se muestra en el juego.
- **Vista isométrica 2:1** (casillas de 64×32 px), unidades de unos 30–40 px de alto.
  Hoy cada unidad mira a un solo lado. El arte real necesita **varias direcciones**
  (idealmente 8, o 4–5 reflejadas) y **animaciones** (quieto, caminar, atacar, morir).
- **Cobertura:** 7 pueblos (romanos, mongoles, galos, germanos, visigodos, ostrogodos,
  vikingos), unas 36 unidades y 4 eras hasta la Segunda Guerra Mundial (tanques y
  aviones). **Ningún paquete abierto cubre todo.**
- **Equipos modestos del colegio y 16 jugadores:** el arte va en hojas de sprites
  (atlas), no en 3D en tiempo real.

## Opciones consideradas

### A: Mejorar los dibujos propios (lo actual)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja |
| Licencias | Ningún riesgo (todo original, CC0) |
| Calidad visual | Media: sigue viéndose "de figuras" |
| Cobertura | Total (ya existe todo) |

**A favor:** consistente, liviano, direcciones fáciles (reflejar), cero créditos.
**En contra:** no alcanza el aspecto de "juego de verdad" que se busca.

### B: Kenney "Medieval RTS" (CC0)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja |
| Licencias | CC0: sin condiciones |
| Calidad visual | Buena, pero **vista cenital** y unidades diminutas |
| Cobertura | Genérica: sin pueblos históricos ni eras modernas |

**A favor:** la licencia más simple posible.
**En contra:** la perspectiva no calza con el mapa isométrico y no distingue pueblos.
Sirve, a lo sumo, para íconos de interfaz.

### C: Modelos 3D de 0 A.D. convertidos en sprites isométricos (CC-BY-SA 3.0)
| Dimensión | Evaluación |
|---|---|
| Complejidad | **Alta:** Blender sin ventana, armar actores (cuerpo, cabeza, casco, escudo), renderizar 8 direcciones por animación |
| Licencias | CC-BY-SA 3.0 (crédito a Wildfire Games y compartir igual) |
| Calidad visual | **La mejor:** histórico y renderizado exacto con nuestro ángulo isométrico |
| Cobertura | Romanos y galos muy bien; íberos y britanos como base; sin vikingos ni mongoles en el juego base; sin Segunda Guerra |

**A favor:** perspectiva perfecta, caballería, asedio y edificios del mismo estilo.
**En contra:** hay que instalar Blender y bajar los datos de 0 A.D. (varios GB). Es un
proceso largo de montar, y faltan pueblos.

### D: LPC, generador de personajes (CC0 / CC-BY / OGA-BY / CC-BY-SA / GPL por archivo)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Media: combinar capas PNG (cuerpo, túnica, casco, escudo, arma) con un script propio |
| Licencias | Mezcladas por archivo; el proyecto trae `CREDITS.csv` con autor y licencia de cada imagen |
| Calidad visual | Buena, pixel art; vista 3/4 frontal (no isométrica, pero se lee bien sobre el mapa) |
| Cobertura | Muy amplia en infantería y trabajadores (cascos, armaduras, escudos, lanzas, arcos, hachas); 4 direcciones y animaciones; **casi sin jinetes, asedio ni vehículos** |

**A favor:** es muy fácil dar a cada pueblo un aspecto propio (encaja con nuestro sistema
de "estilo por pueblo"). Trae animaciones de caminar, estocada, tajo y disparo, y los
créditos vienen listos.
**En contra:** hay que mantener los créditos, la perspectiva no es exacta y faltan
caballería, asedio y la era moderna.

### E: Gráficos de Wyrmsun (GPL / CC-BY-SA según `graphics/credits.txt`)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Media: hojas de un RTS ya listas (5 direcciones reflejadas a 8) |
| Licencias | Por archivo; hay que revisar `credits.txt` (algunas piezas vienen de Wesnoth) |
| Calidad visual | Retro, estilo Warcraft II; vista oblicua (no isométrica) |
| Cobertura | Germanos, nórdicos, godos y galos, con infantería, arqueros, jinetes, asedio y edificios; sin romanos ni mongoles, sin era moderna |

**A favor:** unidades de RTS completas y de pueblos cercanos a los nuestros.
**En contra:** hay que auditar la licencia archivo por archivo, el estilo es retro y
la cobertura es parcial.

## Análisis

- **Ninguna fuente cubre las 4 eras ni los 7 pueblos.** Cualquier camino será mixto
  por un tiempo. Por eso lo primero es que el juego acepte arte **por partes**: una
  unidad con sprite usa el sprite; una sin sprite sigue con su dibujo actual.
- **Estilo consistente vs. cobertura:** mezclar pixel art (LPC o Wyrmsun) con render 3D
  (0 A.D.) en la misma pantalla se ve raro. Conviene una fuente principal por tipo de
  unidad, no por unidad suelta.
- **Costo de licencias:** CC-BY-SA obliga a publicar el arte derivado con la misma
  licencia. Es aceptable en un proyecto educativo abierto, pero el arte ya no será CC0.
- **Riesgo de trabajo:** 0 A.D. da el mejor resultado pero es lo más caro y necesita
  instalar programas grandes. LPC permite probar rápido y sin instalar nada.

## Decisión

1. **Preparar el juego para arte real, sin cambiar lo que ya funciona:**
   - hojas de sprites con varias direcciones y animaciones;
   - dibujo de respaldo automático si una unidad no tiene sprite;
   - un **manifiesto de licencias** (`client/public/art/credits.json`: archivo, autor,
     licencia y enlace);
   - una **prueba automática** que falla si una imagen no tiene su licencia o si la
     licencia no está en la lista permitida;
   - una pantalla de **Créditos** en el juego.
2. **Piloto con LPC** para la infantería y los trabajadores de **2 pueblos (romanos y
   vikingos)**. Cada pueblo recibe su combinación de túnica, casco y escudo, y
   ustedes juzgan el resultado en el juego.
3. **Prueba aparte con 0 A.D.** para caballería y asedio de romanos y galos,
   renderizando 1–2 unidades para comparar. Solo si el piloto 2 convence y se aprueba
   instalar Blender.
4. La **era moderna** (tanques, aviones) y los edificios siguen con los dibujos propios
   hasta encontrar una fuente abierta adecuada.
5. Se decide la fuente definitiva **después de ver el piloto en el juego**.

## Consecuencias

- **Más fácil:** un aspecto de juego "de verdad", animaciones reales al caminar y
  pelear, y agregar unidades nuevas combinando piezas.
- **Más difícil:** mantener los créditos al día. El repositorio y la descarga del
  juego crecen algunos MB. Parte del arte queda con licencia CC-BY-SA en vez de CC0.
- **A revisar:** la consistencia visual si se mezclan fuentes, el rendimiento en los
  computadores del colegio (tamaño del atlas) y la cobertura de jinetes, asedio y
  era moderna.

## Acciones

1. [x] **Aprobar el cambio de regla:** de "arte 100 % original" a "original o con
       licencia abierta (CC0, CC-BY, OGA-BY, CC-BY-SA, GPL) y créditos visibles".
2. [x] **Autorizar la descarga** solo de las capas PNG necesarias del proyecto LPC y de
       su `CREDITS.csv` (unas decenas de imágenes, estimado 5–15 MB; **no** el
       repositorio completo de ~1,5 GB).
3. [x] Programar el soporte de sprites (direcciones, animaciones, respaldo, manifiesto,
       prueba de licencias, pantalla de Créditos).
4. [x] LPC para infantería y trabajadores de **los 7 pueblos** (no solo el piloto), más jinetes con [LPC] Horses + [LPC] Horse Riding y asedio con [LPC] Siege Weapons.
5. [ ] (Opcional) Prueba con 0 A.D. para caballería y asedio; requiere aprobar
       instalar Blender (~300 MB) y bajar datos de 0 A.D. (varios GB).
6. [ ] Decidir la fuente definitiva y extenderla a los demás pueblos.

## Resultado (2026-09-25)

El dueño del proyecto aprobó ambas acciones y amplió el alcance: se pueden usar **varios proyectos**
abiertos a la vez, siempre con créditos, y las unidades siguen siendo 2D.

- Se hizo el soporte completo (tools/art, client/src/art.ts, créditos en el juego, prueba de licencias).
- En vez del piloto de 2 pueblos se armaron los 7: 62 hojas (infantería, trabajadores, caballería,
  balista y cañón), 2 MB en total.
- Cada imagen combinada se publica con CC-BY-SA 4.0; la prueba comprueba que todas sus piezas lo permiten.
- Siguen con formas: era industrial y moderna (salvo el cañón), Fundíbulo y Carro de guerra, y los edificios.
- La prueba con 0 A.D. (Blender) queda pendiente y opcional.
- Después se sumaron los **edificios de Unknown Horizons** (CC-BY-SA 3.0, casilla 64×32 como la
  nuestra), con un estilo de construcción por pueblo; se usa una vista de cada edificio.
