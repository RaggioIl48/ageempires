# Roadmap: steps to finish the game

Legend: ✅ done · 🔜 next · ⬜ pending

## Phase 1 — Playable base ✅
| # | Step | Status |
|---|---|---|
| 1.1 | Fair map for 2–16 players (same resources for everyone, everything reachable) | ✅ |
| 1.2 | Isometric camera, zoom, minimap | ✅ |
| 1.3 | Selection: click, drag, Shift, double click | ✅ |
| 1.4 | Movement with pathfinding, formation and a shared group path | ✅ |
| 1.5 | Workers and gathering of 4 resources | ✅ |
| 1.6 | Interface: resources, population, workers per resource, output per minute | ✅ |
| 1.7 | Authoritative server from the start (the client only sends orders) | ✅ |
| 1.8 | Audit: 6 bugs fixed, security, performance | ✅ |

## Phase 2 — Construction, production and combat ✅
| # | Step | Status |
|---|---|---|
| 2.1 | Construction with preview, foundations and several builders | ✅ |
| 2.2 | Era 1 buildings: House, Storehouse, Farm, Barracks | ✅ |
| 2.3 | Production: queue, cost, population, rally point, cancel | ✅ |
| 2.4 | Units: Worker, Scout, Warrior | ✅ |
| 2.5 | Combat: melee/ranged, armor, type advantages, priorities | ✅ |
| 2.6 | Town Center arrows, destruction of buildings | ✅ |
| 2.7 | Factions with strengths and weaknesses (Total War style) | ✅ |
| 2.8 | Repairing buildings and deleting (refund for foundations) | ✅ |

## Phase 3 — Real multiplayer ✅
| # | Step | Status |
|---|---|---|
| 3.1 | Start screen: student name | ✅ |
| 3.2 | The teacher creates a game with a simple code (max players, map size, duration) | ✅ |
| 3.3 | Joining by code; choosing faction and color | ✅ |
| 3.4 | Reconnection: the student gets their slot back if the connection drops | ✅ |
| 3.5 | **Efficient synchronization**: only changes + compact format + compression (measured: 0.14 Mbit/s per student) | ✅ |
| 3.6 | Teacher panel: pause, end, kick, watch | ✅ |
| 3.7 | Test with 16 simulated clients | ✅ |

## Phase 4 — Teams and diplomacy ✅
| # | Step | Status |
|---|---|---|
| 4.1 | Predefined teams and teams created by the teacher | ✅ |
| 4.2 | Server-side relations: war / peace / alliance | ✅ |
| 4.3 | Diplomacy panel: propose/accept/reject alliance, declare war (with warning), peace | ✅ |
| 4.4 | Consequences: allies don't attack each other, allied gates | ✅ (shared vision comes with the fog of war, 6.1) |
| 4.5 | "Who is with whom" table and simple negotiation chat (the teacher can disable it) | ✅ |

## Phase 5 — Eras, technologies and advanced units ✅
| # | Step | Status |
|---|---|---|
| 5.1 | Advancing era: Tribal → Medieval → Industrial → Modern | ✅ |
| 5.2 | Tech center and a simple tree (economy and military) | ✅ |
| 5.3 | Buildings: Archery range, Stable, Workshop, Factory, Wall, Gate, Tower | ✅ |
| 5.4 | Medieval: spearman, archer, knight | ✅ |
| 5.5 | Industrial: rifleman, machine gun, light vehicle, artillery | ✅ |
| 5.6 | Modern: tank, mechanized infantry, heavy artillery, anti-tank, aircraft | ✅ |

## Phase 6 — Fog of war, victory and balance 🔜
| # | Step | Status |
|---|---|---|
| 6.1 | Fog of war filtered **on the server** (cannot be cheated), with shared vision between allies | ⬜ |
| 6.2 | Victory by conquest, by domination (points) and by wonder | ⬜ |
| 6.3 | Time limit, end-of-game screen with statistics | ⬜ |
| 6.4 | Balance with test games | ⬜ |

## Phase 7 — Finishing touches and setup ⬜
| # | Step | Status |
|---|---|---|
| 7.1 | Optimization for modest computers | ⬜ |
| 7.2 | Interface polish and simple original sounds | ⬜ |
| 7.3 | Easy setup for the teacher (double click, no Node.js install needed) | ⬜ |
| 7.4 | Teacher guide and student guide | ⬜ |
| 7.5 | Final test: 16 browsers (Chrome, Edge, Firefox, Safari; Windows and macOS) | ⬜ |
