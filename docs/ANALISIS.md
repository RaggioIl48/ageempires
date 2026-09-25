# Análisis del juego y qué mejorar (2026-09-25)

Revisión de lo que hay hoy en *Classroom Empires*, comparado con las mecánicas de
**Age of Empires II** y las construcciones de **Total War**, con una propuesta de orden.

## 1. Qué hay hoy

| Área | Estado |
|---|---|
| Multijugador | Servidor autoritativo, hasta 16 jugadores, salas con código, panel del profesor (pausa, fin, expulsar, mirar), reconexión, chat. Sincroniza solo lo que cambia (~2 Mbit/s con 16 jugadores y 800 unidades). |
| Economía | 4 recursos. Trabajadores, almacén, granjas, **cantera, mina y bosque plantado** (campos de trabajo), mercado con precios que suben y bajan, tecnologías económicas y de costos. **Cuadrillas: 5 trabajadores juntos rinden +450 % por viaje.** |
| Ejército | 36 unidades: 15 comunes por era y 21 únicas (3 por pueblo). Ventajas entre tipos, mejoras de élite (★), carga de caballería, regeneración, aura de curación, aviones. **Formaciones** (línea, columna, suelta). |
| Pueblos | 7 pueblos históricos con fortalezas, debilidades, habilidades, edificio único y 3 unidades únicas. |
| Eras | 4 eras (Tribal → Media → Industrial → Moderna); la Moderna es casi imposible a propósito. |
| Construcción | Murallas largas en dos clics, puertas sobre la muralla, torres. |
| Diplomacia | Alianzas, paz y guerra con propuestas y plazos. |
| Interfaz | Minimapa, guía del ejército, retratos de unidades, barra para elegir tipos de tropa, grupos 1–9, trabajador inactivo, avisos. |
| Arte | Unidades LPC (animadas, 4 direcciones, color de equipo), edificios y árboles de Unknown Horizons con **estilo por pueblo que cambia con la era**, créditos en el juego. |
| Pruebas | 233 pruebas automáticas (reglas, red, auditoría de invariantes, licencias del arte). |

## 2. Qué falta respecto de Age of Empires II (mecánicas)

**Prioridad alta** (cambian mucho cómo se juega):

1. **Niebla de guerra y exploración** (Fase 6 de la hoja de ruta). Hoy todos ven todo el mapa: no hay
   sorpresa, ni exploración, ni valor en los exploradores.
2. **Condiciones de victoria**: conquista, maravilla (construir y defender un gran edificio) y
   puntos/reliquias. Hoy la partida termina por tiempo o por el profesor.
3. **Rival controlado por la computadora** (IA sencilla): para practicar solo y para completar
   partidas cuando hay pocos estudiantes.
4. **Guarnecer y campana del pueblo**: los trabajadores se refugian en el Centro Urbano o las torres,
   que disparan más flechas. Es la defensa básica de AoE.
5. **Órdenes de AoE**: encadenar órdenes con Shift (puntos de paso), patrullar, atacar-moviéndose y
   posturas (agresiva, defensiva, mantener posición, no atacar).
6. **Sonido**: golpes, flechas, trabajo, "¡nos atacan!", avance de era. Hoy el juego es mudo, y el
   sonido es gran parte de la sensación de un RTS.

**Prioridad media**:

7. **Depósitos especializados** (molino, campamento maderero, campamento minero) además del almacén, y
   **resembrar granjas** automáticamente.
8. **Caza y ganado** (ovejas, ciervos, jabalíes) como comida inicial.
9. **Sanadores/monjes y reliquias** (conversión, curación, oro por reliquia).
10. **Comercio con carretas** entre mercados aliados (más oro cuanto más lejos).
11. **Estadísticas al final** (gráfico de puntuación por tiempo: economía, militar, tecnología): muy útil
    para conversar la partida en clase.
12. **Unidades navales** en mapas con agua.

**Prioridad baja**: elevación del terreno (ventaja de altura), clima y estaciones.

## 3. Construcciones al estilo Total War

Lo que hace atractivas las construcciones de Total War y cómo traerlo:

1. **Cadenas de mejora del mismo edificio** (nivel 1 → 2 → 3): el edificio se mejora en su lugar,
   cambia de dibujo y desbloquea unidades o bonos. Ej.: *Cuarteles → Fortaleza → Academia militar*,
   *Casa → Villa → Mansión*, *Torre de madera → Torre de piedra → Bastión*.
2. **El asentamiento crece**: el Centro Urbano sube de *Aldea* a *Pueblo* y a *Ciudad* (más población,
   más flechas, más alcance). Ya empezamos: los edificios cambian de estilo con la era.
3. **Murallas por niveles**: empalizada → muralla de piedra → fortaleza, con torres y puertas
   integradas y adarves donde los arqueros disparan desde arriba.
4. **Edificios únicos grandes y reconocibles**: castra romano con empalizada, campamento de yurtas
   mongol, santuario druida galo, salón de hidromiel vikingo… Hoy son dibujos de formas.
5. **Edificios de ciudad con efectos**: templo (moral/curación), herrería (armadura), puerto, plaza.

## 4. Gráficos de cada pueblo: qué falta

| | Unidades a pie y a caballo | Edificios comunes | Edificio único | Centro Urbano | Murallas | Eras 3–4 |
|---|---|---|---|---|---|---|
| Romanos | ✅ LPC | ✅ entramado → piedra | ⬜ formas | ✅ | ⬜ formas | ⬜ formas |
| Mongoles | ✅ | ✅ tiendas → entramado → piedra | ⬜ | ⬜ (yurtas de formas en eras 1–2) | ⬜ | ⬜ |
| Galos, germanos, vikingos | ✅ | ✅ madera → entramado → piedra | ⬜ | ✅ | ⬜ | ⬜ |
| Visigodos, ostrogodos | ✅ | ✅ madera → entramado → piedra | ⬜ | ✅ | ⬜ | ⬜ |

Fuentes abiertas para seguir:

- **0 A.D.** (modelos 3D, CC-BY-SA): tiene romanos, galos y britanos con fuertes, templos, cuarteles,
  murallas y casas de cada cultura: lo más parecido a Total War. Hay que renderizarlos en 2D con
  Blender (instalar ~300 MB y bajar sus datos); es el siguiente paso grande del arte.
- **Unknown Horizons** (ya en uso): más edificios civiles, pero no tiene fuertes ni salones de guerra.
- **LPC**: más piezas para nuevas unidades (hay arcos, lanzas, cascos y armaduras de sobra).
- Era moderna: buscar vehículos isométricos CC0/CC-BY (tanques, aviones).

## 5. Balance y rendimiento

- La **cuadrilla (+450 %)** es muy fuerte: con 5 trabajadores se gana lo de 27. Hay que vigilar que no
  se llegue a la Edad Media en pocos minutos. Si pasa, se pueden subir los costos de las eras o hacer
  la bonificación por escalones (3 trabajadores +100 %, 5 +450 %).
- El **bosque plantado** recupera 1 de madera por segundo: con una cuadrilla se vacía rápido y los
  trabajadores esperan; conviene tener dos.
- `units.json` pesa 142 KB: se puede comprimir (gzip) y las imágenes pueden guardarse en la memoria del
  navegador (cabeceras de caché) para que cargue más rápido en clase.

## 6. Orden sugerido

1. **Fase 6**: niebla de guerra, condiciones de victoria y un rival de la computadora sencillo.
2. **Defensa y órdenes de AoE**: guarnecer, campana, posturas, órdenes encadenadas, patrulla.
3. **Sonido** (efectos libres de OpenGameArt/Freesound, con créditos).
4. **Construcciones estilo Total War**: niveles de edificios y de asentamiento, murallas por niveles, con
   arte de **0 A.D.** para los edificios únicos y las murallas de cada pueblo.
5. **Economía de AoE**: caza y ganado, depósitos especializados, resembrar granjas, carretas de comercio.
6. Estadísticas finales para la clase y ajustes de balance con partidas reales.
