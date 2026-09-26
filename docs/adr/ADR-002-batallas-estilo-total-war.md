# ADR-002: Batallas por las ciudades al estilo Total War (en tiempo real y en línea)

**Estado:** Aceptado e implementado (2026-09-26)
**Decide:** Andrés (profesor, dueño del proyecto)

## Contexto

Se pidió que atacar se parezca a Total War: que la batalla "se muestre" cuando uno ataca,
que el campo de batalla no sea tan amplio y que, si una ciudad no tiene murallas, se
pueda entrar sin problema. No hace falta que el juego sea por turnos.

Limitaciones: el juego es en tiempo real, en línea, con hasta 16 estudiantes a la vez y un
servidor que decide todo. No se puede pausar a todos cada vez que dos pelean.

## Opciones consideradas

| Opción | A favor | En contra |
|---|---|---|
| **A. Turnos + mapa de batalla aparte** (como Total War) | Igual al original | Pausar a 16 jugadores es imposible; el juego dejaría de ser un RTS |
| **B. Batalla en un mapa aparte, en tiempo real** | Campo chico y dedicado | Un segundo "mundo" por batalla, cambiar de mapa en el navegador; los aliados no pueden ayudar; mucho trabajo y riesgo |
| **C. Marcha forzada + batalla por la ciudad en el mismo mapa** | Se ve la batalla, el campo es la ciudad, todos la ven y los aliados pueden ayudar; poco riesgo | El campo no es un mapa distinto |

## Decisión

Opción **C**:

1. **Marcha forzada**: con soldados elegidos, *⚔ March on a city* → se elige una ciudad
   enemiga (en guerra). El ejército sale del mapa y aparece a los 12–45 s frente a la ciudad,
   del lado por donde viene, en filas. El defensor ve la cuenta regresiva.
2. **Batalla**: al llegar (o si soldados enemigos entran caminando a la ciudad) empieza la
   batalla por la ciudad: radio de la ciudad + un margen, visible para todos, con panel
   (fuerza de cada bando, caídos, reloj de 4 minutos), anillo rojo en el mapa y en el minimapa,
   botón *Go to battle* y *Retreat* para el atacante. La cámara del atacante va a la batalla.
3. **Fin**:
   - la ciudad **cae** si el atacante destruye el Centro Urbano → **saqueo** del 30 % de los
     recursos del defensor (máximo 1000 de cada uno);
   - el ataque es **rechazado** si el atacante se queda sin soldados en el campo;
   - si se **acaba el tiempo** o el atacante **se retira**, sus soldados vuelven a casa en
     marcha forzada.
   Se muestra el resultado a los dos (victoria decisiva, clara, ajustada o pírrica, bajas,
   edificios destruidos y botín).
4. **Murallas**: sin murallas se entra directo; con murallas hay que abrir brecha o romper
   una puerta (las murallas y puertas bloquean como siempre).

## Consecuencias

- Las batallas se concentran en las ciudades y se viven como un evento: más épicas.
- Marchar deja la propia ciudad sin esos soldados mientras dura la marcha (decisión
  estratégica, como en Total War).
- A revisar con partidas reales: duración de la batalla, velocidad de la marcha y porcentaje
  de saqueo (constantes en `shared/data.ts`).
- Siguientes pasos posibles: moral y huida de las tropas, armas de asedio para las murallas
  (arietes, torres), "turnos de guerra" opcionales para el profesor (tiempo de paz inicial o
  ventanas para atacar) y, si hace falta, un mapa de batalla aparte (opción B).
