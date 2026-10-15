# Diagnóstico: qué falta para que las batallas se sientan como Total War: Attila

Fecha: 2026-10-15. Basado en el código actual (`server/src/sim/*`, `shared/data.ts`, `shared/formation.ts`,
`client/src/*`). Cada punto dice qué hay hoy, qué hace Attila, cuánto impacto tendría y cuánto cuesta.
Escala: impacto ★ a ★★★; esfuerzo **S** (días), **M** (1–2 semanas), **L** (más).

## 1. Lo que ya está y se parece a Attila

| Mecánica | Dónde | Estado |
|---|---|---|
| Moral, desbandada y reagrupamiento (golpes, flanco, retaguardia, ver caer compañeros, muerte del General) | `sim/morale.ts` | ✅ Muy cerca de Attila |
| Flanco ×1,25 y retaguardia ×1,5 | `combat.ts`, `FLANK_DAMAGE`, `REAR_DAMAGE` | ✅ |
| Cansancio: marcha, carga, pelea, descanso; afecta velocidad, daño y moral | `sim/fatigue.ts`, `FATIGUE_TIERS` | ✅ |
| Carga de caballería (×1,5 tras 4 s sin pelear) y lanzas firmes que la frenan | `CHARGE_BONUS`, `SPEAR_BRACE_DAMAGE` | ✅ Simplificado |
| Altura: más daño y alcance desde arriba | `shared/terrain.ts`, `ELEV_*` | ✅ |
| Formaciones al arrastrar (línea, columna, suelta) con ancho de frente | `shared/formation.ts` | ✅ Para grupos, no por regimiento |
| Posturas: guardia (no perseguir) y hostigar (tiradores que retroceden) | `GUARD_*`, `SKIRMISH_*` | ✅ |
| General con aura y habilidades (Inspirar, Mantener la línea) | `sim/general.ts`, `ABILITIES` | ✅ Solo 2 habilidades |
| Veteranía por bajas | `RANK_KILLS` | ✅ |
| Asedio: murallas desde la Edad Tribal, escalas, arietes, torres; daño reducido al trepar | `sim/siege.ts`, `CLIMB_*`, `WALL_*` | ✅ |
| Pausa táctica al empezar una batalla, reloj de batalla, botín | `sim/war.ts` | ✅ |
| Animaciones de ataque sincronizadas con el golpe real; cadáveres que quedan un rato | `attackSync.ts`, `state.ts` | ✅ |
| Soldados 3D en 8 direcciones (infantería de los 7 pueblos) | `tools/art/soldiers.mjs` | ✅ Falta caballería |

## 2. Lo que falta, por prioridad

### P1 — Cambian la sensación de "batalla de Total War"

**1. Regimientos en vez de soldados sueltos** — impacto ★★★, esfuerzo **L**
- Hoy: cada soldado es una unidad independiente, como en Age of Empires (`world.units`); el tope de población
  es 75 (`POP_CAP_MAX`). Las formaciones existen solo mientras se mueve un grupo seleccionado.
- Attila: se manda a **regimientos** de 60–160 hombres que se mueven, pelean, se cansan y huyen como un bloque,
  con su estandarte, su tarjeta y su barra de vida/moral.
- Propuesta realista para la clase: regimiento = escuadra de **8–16 soldados** que se entrena junta (un solo
  botón), se selecciona con un clic, conserva su formación al moverse y al pelear, y tiene moral común (si la
  mitad huye, el resto vacila). La población cuenta por regimiento. El servidor ya aguanta 800 soldados en
  ~6–8 ms por paso, así que 30–50 regimientos por bando son viables.
- Es la base de casi todo lo demás (tarjetas, habilidades por unidad, cargas en bloque).

**2. Proyectiles físicos y munición** — impacto ★★★, esfuerzo **M**
- Hoy: el daño a distancia se aplica al instante (`combat.ts`); el cliente solo dibuja la flecha.
- Attila: las flechas viajan, pueden fallar, los escudos las paran de frente, dañan a los propios en un cuerpo a
  cuerpo, y cada unidad tiene **munición limitada** (se acaba y hay que reabastecer).
- Propuesta: proyectil con tiempo de vuelo y punto de caída con dispersión (según distancia y veteranía);
  bloqueo por escudo si el objetivo mira hacia el tirador; fuego amigo en la mezcla; munición por soldado con un
  contador en la tarjeta. Agrega decisiones tácticas: flanquear arqueros, cubrirse, no disparar a la mezcla.

**3. Choque y masa (impacto de la carga)** — impacto ★★★, esfuerzo **M**
- Hoy: la carga suma daño (`CHARGE_BONUS`), y hay una separación por masa (`MASS` en `movement.ts`), pero los
  jinetes no atraviesan ni derriban.
- Attila: la carga golpea, **derriba y empuja**; la caballería pesada rompe líneas y luego conviene sacarla y
  volver a cargar (carga cíclica); la infantería en formación cerrada resiste.
- Propuesta: al llegar con velocidad, impulso según masa × velocidad contra la masa de la línea; derribo (el
  soldado queda 1–2 s en el suelo, sin pelear) y empuje; bonus si la línea no está en formación.

**4. Órdenes clave de RTS táctico** — impacto ★★, esfuerzo **S**
- Faltan: **atacar-moviendo** (avanzar y pelear con lo que aparezca), **cola de órdenes** (Shift), mirar hacia
  un punto sin moverse, **mantener formación en grupo** (todos a la velocidad del más lento), patrullar.
- Ya figuran como pendientes en `RESUMEN_PROYECTO.md` §3.

### P2 — Profundidad táctica

**5. Habilidades y formaciones por tipo de unidad** — ★★, **M**
- Muro de escudos / testudo (romanos), cuña (caballería, germanos), formación de lanzas contra caballería,
  disparo a discreción vs. ráfaga, flechas incendiarias, carga de berserkers. Hoy solo hay 2 habilidades del
  General; "Muro de escudos" existe como bonificación pasiva de los vikingos (`data.ts`).

**6. Terreno que importa** — ★★, **M**
- Bosques: ocultan (emboscadas), cubren de flechas y desordenan formaciones y caballería. Ríos y vados: pasos
  estrechos. Hoy hay bosques como recurso, pero no afectan el combate; la altura sí.

**7. Moral más rica** — ★★, **S**
- Contagio (ver huir a los vecinos baja la moral), estados visibles (firme / vacilando / huyendo / **destrozado**
  que ya no se reagrupa), miedo a elefantes o unidades temibles, rodeado = penalización extra.

**8. Interfaz de batalla** — ★★, **M**
- Tarjetas de regimiento (vida, moral, munición, cansancio), estandartes sobre las tropas con su estado, barra
  de fuerzas de la batalla, cámara lenta además de la pausa, seguir a una unidad. Hay barras por soldado y la
  pausa táctica.

**9. Sonido** — ★★★ (sensación), **S/M**
- No hay audio. Choque de armas, gritos de carga, cuernos, lluvia de flechas y una música de batalla
  cambian mucho la experiencia. Hay bancos libres (CC0/CC-BY) en OpenGameArt y Freesound.

### P3 — Pulido

10. **Animaciones de combate por pares** (dos soldados que se enfrentan coordinados) y reacciones al golpe
    (retroceder, caer al suelo): 0 A.D. no trae animaciones de "golpe recibido"; se puede simular con un
    pequeño retroceso del sprite. ★, **M**
11. **Caballería en 3D** (8 direcciones): los jinetes siguen en LPC (4 direcciones); 0 A.D. tiene jinete y
    caballo con esqueletos separados. ★★, **M** (ver `docs/SOLDADOS_3D.md`).
12. **Asedio a lo Attila**: puertas que arden, aceite, puntos de captura dentro de la ciudad, guarnición en torres,
    incendio que se propaga. ★★, **L**
13. **Clima**: lluvia (arcos y pólvora peores), niebla (menos visión). ★, **S**

## 3. Hoja de ruta sugerida

| Paso | Contenido | Por qué en este orden |
|---|---|---|
| 1 | Atacar-moviendo, cola con Shift, grupo a la velocidad del más lento | Barato y se nota enseguida |
| 2 | Sonido básico de batalla | Mucha sensación por poco esfuerzo |
| 3 | Regimientos (escuadras de 8–16) con tarjeta y estandarte | La base de todo lo demás |
| 4 | Proyectiles con vuelo, escudos y munición | Cambia cómo se usan los arqueros |
| 5 | Choque de carga (derribo y empuje) | Cambia cómo se usa la caballería |
| 6 | Habilidades por unidad y terreno (bosques, ríos) | Profundidad táctica |
| 7 | Caballería 3D, moral rica, clima, asedio avanzado | Pulido |

## 4. Límites del juego a tener en cuenta

- **Servidor gratuito de Render** (~0,1 CPU): con regimientos y proyectiles físicos el costo por paso sube. Con
  800 soldados hoy son ~6–8 ms en la PC de desarrollo; en Render puede ser 10× más lento. Antes de agrandar las
  batallas conviene el servidor propio (laptop del docente) o un VPS barato.
- **Red de la escuela**: más soldados = más datos. La codificación compacta y los cambios por diferencia ya
  existen (`net/sync.ts`); los regimientos ayudan porque se pueden enviar como bloque.
- **Clase**: una batalla de Attila dura 20–40 min. Para 45–60 min de clase conviene mantener batallas cortas (el
  reloj de batalla ya existe) y la pausa táctica.
