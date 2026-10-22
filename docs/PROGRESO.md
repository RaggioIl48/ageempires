# Progress by phase

Full roadmap: [HOJA_DE_RUTA.md](HOJA_DE_RUTA.md).

| Phase | Content | Status |
|---|---|---|
| 1 | Map, camera, selection, movement, workers, resources, gathering | ✅ Working and audited |
| 2 | Construction, unit production, basic combat, factions | ✅ Working |
| 3 | Rooms with a code, faction choice, reconnection, teacher panel, efficient sync | ✅ Working |
| 4 | Teams, diplomacy, alliances, war | ✅ Working |
| 5 | Eras, technologies, advanced units | ✅ Working |
| 6 | Fog of war, victory conditions, balance | 🔜 Next |
| 7 | Optimization, interface, LAN setup, documentation | — |

## Phase 1 audit (2026-09-24)

| Area | What was checked | Result |
|---|---|---|
| Output per minute | Does it drop to 0 when gathering stops? | ❌ Bug: it stayed stuck → **fixed** |
| Workers next to the depot | Keep working if they reach the resource and the depot without walking? | ❌ Bug: they stopped after 5 trips → **fixed** |
| Maps | 90 maps (2–16 players): fairness and reachable resources | ❌ Bug: berries/stone/metal enclosed → **fixed** (generation validates access) |
| Security | Message over 16 KB | ❌ **Critical** bug: it would crash the server for the whole class → **fixed** |
| Security | Flood of orders, malformed messages, other players' units | ✅ Handled correctly |
| Security | Files outside the game folder (`/../`, `%2e%2e`…) | ✅ Blocked (new tests) |
| Robustness | Error during a simulation step, rebuild while running, invalid variables | ✅ Hardened (logs and keeps running) |
| Performance | 800 simultaneous orders | 247 ms → **24 ms** (shared path, reused memory) |
| Performance | Simulation step with 800 units | 2.6 ms → **0.4 ms** (budget: 100 ms) |
| Performance | Client on the largest map (16 players) | 61 FPS |
| Interface | 16 players in the top bar | ❌ Covered a third of the screen → **fixed** (compact squares) |
| Pending | Network traffic with 16 players and 800 units: ~160 Mbit/s | ⚠️ Too high for school Wi-Fi → **priority in Phase 3** (only changes + compact format + fog filtering) |

Bugs found **during Phase 2** (by the new tests):
- A building destroyed while under construction survived because its builders "healed" it → fixed.
- A unit could walk into a building placed on its path → fixed (checks every step).
- The rally point on a resource didn't send new workers to gather → fixed.

## Phase 2 — what exists

**Construction**: 4 buildings you can construct (House +5 population, Storehouse = depot,
Farm = food for one worker, Barracks = army). Preview in green/red that follows the mouse,
foundation that "rises", several builders (each extra helps less: 1→1×, 4→2×),
cancel with a refund of what is left to build, and repair (costs 50% of the price, proportional).

**Production**: queue of up to 5 per building, cost charged when ordering and refunded when
cancelling, waits if there is no population ("build more houses"), rally point (on a resource,
new workers go gather there).

**Combat**: damage = attack × type advantage − armor (minimum 1). Advantages:
infantry → cavalry and buildings; cavalry → workers and ranged; ranged →
infantry; siege → buildings. Idle troops attack on their own what they see (first whoever
fights, then workers, then buildings) and respond when attacked. The Town Center shoots arrows.
"You are under attack!" notice.

**Factions** (Total War style): each one strengthens some unit types and weakens others.

| Faction | Strong in | Weak in |
|---|---|---|
| Legión del Norte | Infantry (+20% health, +1 armor) | Ranged (−10% attack) |
| Clan del Viento | Cavalry (+20% attack, +15% health, +10% speed) | Siege (−20% attack) |
| Guardia del Bosque | Ranged (+15% attack, +1 range), wood +10% | Cavalry (−15% health) |
| Gremio de la Forja | Siege (+25% attack, +20% health), buildings +20% | Cavalry (−20% attack) |
| Liga del Río | Food and metal +15%, workers +20% health | Infantry (−10% attack) |
| Pueblo de la Montaña | Buildings +25% health, stone +20% | Infantry and cavalry (−5% speed) |

For now each slot gets a faction in order (player 2 = Clan del Viento, red; player 4 =
Gremio de la Forja, yellow). In Phase 3 each student will choose theirs in the lobby.

**Tests**: 107 automated tests, including two "stress tests" that play 5–6 minutes with
random orders (gathering, building, training, attacking, deleting) and check at every
step that no rule is broken (health, resources, positions, queues, states).

## Phase 3 — what exists

**Efficient synchronization** (priority from the audit). Instead of sending the full state
10 times per second, each student receives **only what changed since their last message**,
in a compact format (lists of numbers) and compressed. Measured with 16 players and 800 units
all working (worst case):

| | Per student | Whole class |
|---|---|---|
| Before (Phase 2) | 1200 KB/s | 158 Mbit/s |
| Changes only | 45 KB/s | 5.9 Mbit/s |
| Changes + compression | **17 KB/s** | **2.3 Mbit/s** |

Goal was < 1.5 Mbit/s per student: 0.14 Mbit/s achieved. If a student's connection is slow and
a message is skipped, the next one includes everything they missed (it never gets out of sync).
The map travels compressed by runs (~50× smaller).

**Rooms with a code**: the teacher opens `/teacher` (formerly `/profesor`, still accepted) (on the server computer with no PIN;
from another one with the PIN shown in the console), chooses players, map size and duration,
and receives a 4-letter code with no confusing letters (no O, I or L) plus a direct link.

**Students**: start screen (name + code, filled in automatically from the link) → waiting
lobby where they choose **faction** (with strengths/weaknesses visible) and **color** (no
repeats) → the game starts when the teacher decides.

**Reconnection**: each student gets a secret token saved in the browser. If the connection
drops, the page reloads or they close the tab, they come back to the **same player** with
everything as it was. If they open the game in two tabs, the old one closes (without
"stealing" the slot back).

**Teacher panel**: list of rooms with their status and students (connected or not),
start, **watch the game** (whole map + economy table of each student, with idle workers
highlighted), **pause/resume**, **end** (summary for everyone), **remove a student** (cannot
come back) and **close the room**. Clock with a countdown when there is a time limit; when it
runs out the game ends on its own.

**Security**: every teacher action is checked on the server; 5 wrong PINs cut the connection;
a student cannot give orders to units that aren't theirs or join a game already underway.

**Tests**: 131 automated tests. New: codec round trip, **3 minutes of random play checking
that each client rebuilds exactly the server state** (even losing 30% of the messages),
privacy (nobody sees someone else's queue), 21 lobby tests (PIN, codes, colors, full room,
reconnection, second tab, removal, pause, end, time limit, teacher watching) and a
**class of 16 students over real WebSockets**.

## Phase 4 — what exists

**Teams chosen by the teacher** in the waiting room (or "2 teams" / "all against all" with one
click). At the start, same team = allies; everyone else = at war.

**Diplomacy decided by the server** (war / peace / alliance). Diplomacy panel (🤝 button):
propose an alliance or peace (the other player has 60 s to accept), break an alliance, declare
war (it starts 20 s later, with a warning to the whole class). Allies and players at peace
never attack each other — not on their own, not by order, not with Town Center arrows.
A "who is with whom" table shows everyone's relations. The teacher can lock the teams.

**Negotiation chat** (Enter to write, Tab switches between "All" and "Allies"), with a
cooldown against spam; the teacher can turn it off and sees every message.

## Phase 5 — what exists

**Four eras**, advanced from the Town Center (each one needs a building and costs more):

| Advance | Needs | Cost | Time |
|---|---|---|---|
| Tribal → Medieval | Barracks | 500 food, 150 metal | 60 s |
| Medieval → Industrial | Tech center | 1600 food, 500 stone, 800 metal | 180 s |
| Industrial → Modern | Factory | 2000 food, 600 stone, 1000 metal | 150 s |

The Medieval Age is meant to last: leaving it costs more than four times what entering it did.

The whole class is told when someone advances; everyone sees the others' era (top bar and
teacher table).

**Few units, each with a clear role** (older units stop being trained when replaced):

| Era | Units | Rock–paper–scissors |
|---|---|---|
| Tribal | Worker, Scout, Warrior | Warrior beats cavalry |
| Medieval | Spearman, Archer, Knight (+ Scout) | Spearman > Knight > Archer > Spearman |
| Industrial | Rifleman, Machine gun, Light vehicle, Artillery | Machine gun stops infantry; vehicles hunt artillery; artillery destroys buildings |
| Modern | Tank, Mechanized infantry, Anti-tank, Heavy artillery, Airplane (+ Rifleman, Machine gun, Light vehicle) | Anti-tank beats tanks; tanks crush infantry; airplanes punish tanks and artillery; riflemen and towers shoot down airplanes |

Airplanes fly over water, walls and buildings; only ranged attacks can hit them.

**New buildings**: Defensive tower (shoots, also at airplanes), Wall and Gate (1×1, placed in a
row with Shift; the gate lets its owner and allies through but not enemies) — all three available
from the **Tribal Age** —, Archery range, Stable, Tech center (Medieval), Workshop (artillery) and
Factory (vehicles, tanks, airplanes) (Industrial).

**Technologies** (each researched once; a gear in the queue): Tools, Wheelbarrow, Plow (Town
Center); Forge, Armor, Masonry, Ballistics, Machinery, Plating (Tech center). They add to the
faction bonuses. Masonry and Plating also raise the health of what already exists.

**Look**: every new unit and building has its own original drawing; shots look like arrows,
bullets or cannon shells depending on the unit.

**Tests**: 178 automated tests (26 new: eras and requirements, cancelling, unlocking and
replacing units, every tech, per-unit bonuses, a 3 anti-tank vs. tank battle, towers, walls,
gates for allies but not enemies, airplanes over water, who can hit airplanes, network
encoding of research and eras).

## Audit after Phase 5 (2026-09-24)

- **All game texts are in English** (menus, buttons, notices, server messages, teacher panel,
  console). The teacher panel is now at `/teacher` (`/profesor` still works).
- Smaller top bar (52 → 38 px) and bottom bar (150 → 112 px, minimap 268×134 → 192×96).
  With nothing selected, the action buttons use the whole bar, so "Advance to the … Age" is
  visible even in narrow windows. Clicking the faction/age label in the top bar selects the
  Town Center.
- The published site (Render) was still running the Phase 4 build: that is why the age button
  was not visible online.
- New end-to-end test on a generated map: builds every building with real orders, advances
  through the four ages, researches every technology and trains all 15 units.
- 181 tests pass. Benchmark (16 players, 800 units): average step 1.7 ms, worst 8 ms (budget 100 ms);
  2.3 Mbit/s total network for the class.

## Historical peoples, long walls and a harder Modern Age (2026-09-24)

**Seven peoples** inspired by Total War replace the fictional factions. Each one has strengths
and weaknesses by unit type, and in the **Medieval Age** it unlocks a unique building and two
unique units:

| People | Strong in | Weak in | Unique building | Unique units |
|---|---|---|---|---|
| Romans | Infantry, siege, buildings | Cavalry | Castrum (shoots arrows) | Legionary, Scorpion |
| Mongols | Cavalry speed/attack, food | Infantry, buildings | Ordu (+10 population) | Horse Archer, Keshig |
| Gauls | Infantry attack, wood | Ranged, buildings | Nemeton (wood only) | Naked Fanatic, Chosen Swordsman |
| Germans | Infantry health, food and wood | Siege | War Hall (food/wood drop-off) | Chosen Spearman, Axe Thrower |
| Visigoths | Cavalry health, ranged +1 range | Infantry | Royal Hall (drop-off) | Gothic Knight, Armored Archer |
| Ostrogoths | Cavalry attack, stone | Ranged | Royal Palace (+5 pop, stone/metal) | Gothic Lancer, Heavy Spearman |
| Vikings | Infantry attack/speed, wood and metal | Cavalry | Mead Hall (+5 pop, food/wood) | Berserker, Huscarl |

The server checks everything: nobody can build another people's building or train their units.

**AoE-style walls**: choose Wall, click and drag; one order lays up to 60 sections (skipping
occupied tiles and stopping when the stone runs out). Diagonals are drawn as "stairs" so the wall
always looks continuous and blocks the way. Workers spread along the wall and move on to the next
section by themselves (they also continue to any nearby unfinished foundation). A gate placed on
your own wall replaces that section.

**Map**: quarries and metal veins hold 400 (was 350). A ring of **rich deposits in the center**
(5 metal + 3 stone between each pair of neighbors) is contested ground.

**Modern Age almost impossible**: 6000 food, 3000 wood, 3000 stone, 6000 metal and 5 minutes.
A base's own metal is not enough: you must win the center.

**Publishing**: the Render app on GitHub now has access to the repository, so every push deploys
automatically.

**Tests**: 200. New: the 7 peoples and their uniques, faction checks on the server, a Chosen
Spearmen vs Keshig battle, long walls (line, cost, stopping without stone, builders continuing),
gate on a wall, center deposits, the Modern Age cost; the full progression test now runs once
for each of the 7 peoples.

## Upgrades, abilities, mid-game economy, looks and the army guide (2026-09-24)

**Upgrades (AoE style)**: Man-at-Arms (Tribal), Pikeman, Crossbowman, Light Cavalry, Cavalier (Medieval),
Veteran Riflemen and Armored Cars (Industrial), plus an **elite version of each of the 14 unique units**
(e.g. the Mongol *Elite Horse Archer* with a recurve bow: +1 range, +35% attack; the Roman *Praetorian*).
Units already on the map improve too; upgraded units show a gold star and their new name.

**Abilities of each people (Total War style)**: cavalry **charge** (first melee hit after 4 s without
fighting: ×1.5; Visigoths ×1.8; Ostrogoths ×2.2), Roman engineering (build 30% faster), Mongol and German
hordes (cavalry / infantry train 25% faster), Gallic druids (the Nemeton heals nearby units),
Viking Berserkergang (infantry heals; Berserkers even faster).

**Mid-game economy**: storehouse technologies (Double-Bit Axe, Stone Mining, Metal Mining, Horse Collar,
Bow Saw, Shaft Mining), Hand Cart at the Town Center, farms with 400 food, and a **Market** where you buy
and sell food, wood and stone for metal (shared prices: buying raises them, selling lowers them).

**Looks of each people**: soldiers change tunic, helmet and shield (Roman crest and scutum, Mongol fur hat
and horseback bow, Gallic long hair and oval shield, Norse nasal helmets and round shields); common
buildings change architecture (Roman terracotta, Mongol yurt camps, Gallic round huts, Germanic/Gothic/
Viking longhouses with thatch, tiles or turf and dragon heads).

**Army guide (📖 Army)**: every unit of your people by age with its stats, what it beats and what beats
it (computed from the combat tables, only naming enemies from the same ages), and its upgrades; plus your
people's strengths, weaknesses and abilities and a short explanation of how combat works.

**Walls**: two clicks (start and end), as in AoE; dragging also works.

**Fix**: a unit walking where a building was just placed kept a "walking" state with no path.

**Tests**: 212 (upgrades, 53-bit tech masks, charge, healing, build/train speed, Market, counters).

## More units per people and cost technologies (2026-09-25)

**A third unique unit for each people** (Medieval Age, trained at its unique building, with its own
elite upgrade):

| People | New unit | Role |
|---|---|---|
| Romans | Triarius | Veteran spear line: stops any charge |
| Mongols | Trebuchet | Huge range, destroys walls and forts; almost useless against units |
| Gauls | War Chariot | Scythed wheels: crushes infantry and archers |
| Germans | Chosen Axeman | Breaks shields and gates |
| Visigoths | Javelin Rider | Mounted skirmisher against other riders |
| Ostrogoths | Gothic Warband | Cheap and quick to train |
| Vikings | Ulfhednar | Wolf warriors: raid archers, workers and siege |

**Cost technologies** (units and buildings get cheaper; the server charges the reduced price and a
cancelled order refunds exactly what was paid):

| Technology | Where | Effect |
|---|---|---|
| Supplies | Barracks | Infantry −20% food |
| Horse Breeding | Stable | Cavalry −20% food |
| Woodworking Guild | Tech Center | All units −20% wood |
| Standardized Arms | Tech Center | All units −20% metal |
| Masons' Guild | Storehouse | Buildings, walls and towers −25% stone |
| Iron Casting (Industrial) | Workshop | Siege −25% metal and wood |
| Mass Production (Industrial) | Tech Center | All units −15% wood and metal |

Technologies are now stored as a hexadecimal text (no limit on how many there are; there are 54).

**Tests**: 214.

## Unit art from open projects (2026-09-25)

Decision in [ADR-001](adr/ADR-001-arte-de-unidades.md) (accepted): the art may be original **or**
open-licensed with visible credits, mixing several projects.

**What changed on screen**

- Soldiers, workers, cavalry and two siege machines are now pixel-art sprites instead of shapes,
  with **walk, attack and death animations** in 4 directions (siege: 8).
- **Each people looks different** (Total War / AoE references), for example:
  Romans with bronze legion helmets and *scutum*; Legionaries with segmented armour and red crest;
  Mongols with pointed helmets, braids and **recurve bows** (also on horseback); Gauls with long red
  hair, moustaches, long swords and long shields; Germans blond and bearded with round shields and
  maces; Visigoths and Ostrogoths with conical helmets, mail and heater/kite shields; Vikings with
  spectacle helmets, axes and round shields, bare-chested Berserkers and hooded Ulfhednar.
- **Team color**: tunics, capes and shields take each player's color.
- **Workers** swing an axe (wood), a pickaxe (stone and metal), a hoe (food) and a hammer (building).
- Units **face** where they walk, their target, or the resource they gather.
- Fallen soldiers play their death animation and fade.
- Units without art yet (Industrial/Modern Age, Trebuchet, War Chariot) keep the drawn shapes; if an
  image fails to load the shapes are used too.
- **Art credits** screen (start screen and army guide) with every author, license and link.

**How it is built**: `npm run art` (`tools/art/`) downloads only the needed layers (a fixed version
of the LPC generator, ~320 small PNGs, plus 3 OpenGameArt packs), recolors them per people, marks
the team-color parts, mounts riders on horses, cuts and packs the animations. Result: 62 sheets,
2 MB in total (palette PNGs); each client only downloads the sheets of the peoples and units it sees.

**Tests**: 222 (license and coverage check of the art, unit facing and fallen units).

## Crews, mines, building art, portraits, groups and formations (2026-09-25)

**Economy**

- **Crews**: when **5 or more workers** gather the same resource close together (their targets less
  than 5 tiles apart), each of them gathers **×2**. The worker panel shows "Crew 3/5 · 2 more nearby for ×2".
  It works for trees, rocks, veins, berries, farms, quarries and mines.
- **Quarry** (125 wood) and **Mine** (150 wood, 75 stone), Tribal Age, 3×3: stone or metal **without
  depending on the rocks and veins of the map**. 800 each, up to 5 workers (a full crew: ×2), and they
  are their own drop-off (no walking). A bit slower per worker than the map deposits (0.36/s).
  Farms, quarries and mines share the same rules ("work fields"); farms keep one worker each.

**Buildings**: pre-rendered isometric art from **Unknown Horizons** (CC-BY-SA 3.0; same 64×32 tile).
Each people has its own style: Romans stone houses, Visigoths/Ostrogoths timber-framed, Gauls/Germans/
Vikings wood with grass or thatch roofs, Mongols tents. A flag shows the player's color. Houses have
variants. Farms look ripe or harvested. Still drawn with shapes: archery range, walls, gates, unique
buildings and the Mongol Town Center (yurt camp).

**Interface**

- **Portraits**: train buttons, the selection and the queue show the unit's own sprite (half body for
  foot soldiers, profile for riders and machines) in the player's color.
- **Select a whole army type**: ⚔ Infantry · 🏹 Ranged · 🐎 Cavalry · 💣 Siege · All (Shift adds). In a
  mixed selection, click a type in the left panel to keep only those.
- **Groups**: Shift+1…9 saves, 1…9 selects (twice: go there).
- **Formations** (2+ soldiers): **Line** (infantry front rank, ranged behind, siege at the back, cavalry on
  the flanks, facing the march), **Column** (3 wide, cavalry leading), **Loose**. In formation everyone
  marches at the pace of the slowest, so the ranks stay together.

**Tests**: 232.

## Crews +450 %, woodlots, trees and buildings that change with each age (2026-09-25)

- **Crews now deliver +450 %** (×5.5) per trip when 5 or more workers gather the same resource close
  together. Before, the bonus only sped up the gathering itself, and since much of each trip is walking
  it was barely noticeable (about +40 %). Now it multiplies what each trip delivers, so it shows fully
  in the income (tested in the browser: 4 workers on wood gave +40/min, 5 workers +220/min), and trees
  and veins do not run out faster. A floating "+55 ×5.5" appears at the drop-off.
- **Woodlot** (75 food, 50 stone — no wood needed): planted trees that **grow back** (1 wood/s, up to
  600). Up to 5 workers, wood drop-off, never disappears; if it is empty, the workers wait. Its trees are
  drawn small or big according to the wood left.
- **Trees** of the map drawn with Unknown Horizons art (birch, maple, spruce, tupelo); they shrink as
  they are cut.
- **Buildings change with the age** (Age of Empires) and settlements grow from villages to stone towns
  (Total War): e.g. Romans timber → stone, Goths wood → timber → stone, Gauls/Germans/Vikings wood until
  the Industrial Age, Mongols tents until the Industrial Age.
- **Archery range** drawn with a weaponsmith or a hunter's tent (by style) and two targets.
- **Analysis** of the game and what to improve: [ANALISIS.md](ANALISIS.md).

**Tests**: 233.

## 0 A.D. fortresses and walls, and battles for the cities (2026-09-26)

**Fortresses, towers and walls of each people** — 3D models of 0 A.D. (Wildfire Games, CC-BY-SA 3.0)
drawn in the game's isometric view by our own renderer (`tools/art`: COLLADA and DDS readers and a
software rasterizer with sunlight, ambient occlusion and team-color masks; no Blender needed):

| People | 0 A.D. culture | Look |
|---|---|---|
| Romans | Romans | stone castle with red roofs, crenellated stone walls |
| Gauls | Gauls | timber fort on a *murus gallicus* rampart |
| Germans | Britons | round stone broch, dry-stone walls |
| Vikings | Gauls (old fort) | big rampart with timber halls |
| Visigoths | Iberians | star-shaped fort, whitewashed walls |
| Ostrogoths | Hellenes | Greek stone fortress and walls |
| Mongols | Han | fortress with pagoda roofs, rammed-earth walls |

- New **Fortress** (Medieval Age, 4×4, 600 stone + 200 wood): very tough, shoots arrows, +10 population.
- **Towers** change with the age: wooden in the Tribal Age, stone afterwards.
- **Walls** are cut into one-tile pieces (post + half sections, cut faces closed) and joined with the
  neighbouring walls, so any shape looks continuous; gates show the culture's gate.

**Battles for the cities** (Total War style, real time, online) — decision in
[ADR-002](adr/ADR-002-batallas-estilo-total-war.md):

- **⚔ March on a city**: soldiers leave the map on a forced march (12–45 s) and appear in rows in
  front of the enemy city; the defender sees the countdown.
- A **battle** starts when they arrive (or when enemy soldiers walk into a city): panel with each
  side's strength, fallen soldiers and a 4-minute clock, red ring on the map and minimap, *Go to
  battle* and *Retreat*. Everyone sees it (news for the teacher).
- The city **falls** if its Town Center is destroyed (30% of its resources are sacked, up to 1000
  each); the attack is **repelled** if the attacker has no soldiers left; if **time runs out** or the
  attacker **retreats**, the army marches home. Both players see the result (decisive / clear / close /
  pyrrhic victory, losses, buildings destroyed, loot).
- Without walls the enemy walks straight in; with walls they must breach them or break a gate.

Tested in the browser with two players (march, warning with countdown, battle panel, retreat, result
for both). **Tests**: 239.

## Morale, rout and flanks (Total War: Attila style), ram and 0 A.D. vehicles (2026-09-28)

**Morale** (`server/src/sim/morale.ts`): every soldier (infantry, cavalry, ranged) has morale 0–100.
- It drops when hit (in proportion to the damage), **more from the flank (+5) or the rear (+12)**, and
  when an ally falls within 5 tiles (−9). It recovers by itself away from enemies (+4/s).
- At 0 the unit **routs**: a white flag 🏳 appears, it runs home 20% faster, **ignores orders** and
  takes ×1.25 damage. After at least 8 s, once safe and back at 45 morale, it rallies.
- Routing soldiers do not count for the battle strength of a city battle, so breaking an army
  wins the battle even if not everyone died.
- Peoples feel different (like Attila): **Romans** (discipline, −35% morale loss), **Vikings**
  (shield wall −25%, and +15% fear), **Visigoths** (−15%), **Ostrogoths** (−10%); **Gauls** (war
  cries: their melee hits break morale 40% faster), **Germans** (+25%), **Mongols** (+20%).

**Flanks**: each soldier faces where it walks or strikes. Melee hits from the side deal ×1.25 and from
behind ×1.5 ("Flank!" / "Rear!" floating text). Pin with infantry, go around with cavalry.

**Battering ram** (Medieval Age, Barracks, 180 wood + 40 metal): only attacks buildings, walls and
gates (armor 30 against arrows); ordering it against soldiers says "Rams only attack buildings".

**Art from 0 A.D. 3D models** (8 directions, own renderer): the celtic **ram**, the Gaulish **war
chariot** (the elite unit that still had the basic shape: two ponies, charioteer and warrior with team
color) and the Mongol **traction trebuchet** (Han model, with its crew). The 0 A.D. loader now reads
variant files (horse coats, bodies) and props attached to bones (heads, helmets).

Interface: thin blue morale bar under the health bar (orange when it wavers), morale line in the unit
panel (Steady / Wavering / Breaking / Routing!), and a "Morale / Flanks / Ram" section in the guide.

Tested in the browser with two players (Gauls against Mongols): chariots charging, a Mongol warrior
routing with the white flag and being chased, the trebuchet and the ram. **Tests**: 244.

## Generals, hills and drawn formations (Total War style) (2026-09-28)

**General** (`server/src/sim/general.ts`): every player starts with one (Legate, Khan, Chieftain,
Warlord, Dux, Comes or Jarl, with his own art: grey horse, golden armour, cape in the player's colour
and a banner). Only one per player; if he falls, another can be trained at the Town Center.
- Aura: soldiers within 7 tiles lose 35% less morale and recover +2 morale/s. He never routs.
- If he falls, his soldiers within 10 tiles lose 30 morale.
- **Q · 📯 Inspire** (every 60 s, radius 8): +40 morale at once, routing soldiers rally, +25% damage
  for 20 s (gold ring). **E · 🛡 Hold the Line** (every 75 s, radius 8): +3 armour and 60% less morale
  lost for 20 s (blue ring).

**Hills** (`shared/terrain.ts`): tiles have a height level (0–3) and the ground is a smooth surface.
- Every city stands on a plateau (same for everyone), there is a big hill in the centre (level 3) and
  more hills around the map.
- From higher ground: up to +45% damage (−30% attacking uphill), archers/towers +0.75 range per level;
  climbing is slower (down to 60% speed).
- The terrain is drawn with relief (light and shadow on slopes, contour lines); units and buildings sit
  on the hills; the unit panel says "⛰ High ground".

**Formations**: **right-drag** on the ground draws the front line (Total War): a green preview shows each
soldier's spot and an arrow shows where they will face. They line up along it (infantry in front,
archers behind, cavalry on the flanks) and **face forward when they arrive** (important for flanks).
Siege engines no longer slow the whole formation.

Tested in the browser (general abilities with cooldowns, relief around the cities, drawn front line).
**Tests**: 259.

## Fog of war, victory, guard mode, skirmish and veterans (2026-09-29)

**Fog of war** (`shared/vision.ts`, `server/src/sim/vision.ts`; teacher option "Fog of war", on by default):
- Each student only sees what their troops, buildings and **allies** see; from a hill you see farther
  (+1.5 tiles per level). Unexplored land is black; explored land keeps its terrain and the enemy
  buildings as last seen, under a grey veil.
- The server does not send hidden enemy troops, effects or building changes (no cheating by
  reading the network). Enemy buildings destroyed in the fog stay as "ghosts" until seen again.
- What each student explored is kept on the server (reconnecting keeps the map). The teacher sees
  everything; a defeated player loses the fog and can watch the rest of the game.

**Victory** (`server/src/sim/victory.ts`):
- **Conquest**: the Town Center is the capital. If it falls, the empire falls (troops surrender,
  buildings become ruins, the one who struck last "took the city"). The last empire (or alliance)
  standing wins.
- **Sacred Hill**: the summit of the central hill. From the Medieval Age, 3+ soldiers there with no
  enemies for 5 minutes in total wins. War panel row with holder, clock and leaders; golden ring and
  banner on the summit and on the minimap.
- **Time limit / teacher ends the game**: the empire with the most **Glory** wins (3 per kill, 250
  per city taken, 1 per second on the hill, 50 per age, 1 per 50 resources, +100 if still standing).
  Final screen: 🏆 Victory / 💀 Defeat, sorted by glory.

**Total War battle modes**:
- **Guard mode (G)**: soldiers hold their post and formation, only fight what comes close (melee 2
  tiles, archers within range) and go back to their post instead of chasing.
- **Skirmish**: archers (not in guard mode, without a direct attack order) back away 3.5 tiles when
  melee enemies get close.
- **Veterans**: ranks at 2, 5 and 10 kills (gold chevrons, "▲ Veteran!"): +8% damage and 12% more
  resolve per rank, +1 armour per rank from rank 2. Veterans keep their rank on forced marches.

Tested in the browser (fog around the city and the hill, Sacred Hill panel, final screen, guard
button, rank-up). **Tests**: 276.

## Tactical battles: lines that hold, fatigue and sieges (2026-09-29)

**Why battles were chaotic** (measured with a simulation of two lines of 10): on an attack order all
10 soldiers went after the same enemy, and after ~12 s both lines had melted into a blob (line depth
0 → 1.5 tiles). Fixes:
- **Regiments clash**: an attack order on a unit spreads the attackers over the enemies of that
  formation (within 6 tiles), at most ~1–2 per enemy. Idle troops fighting on their own prefer
  enemies that nobody is fighting yet. Result: one-on-one along the line, depth stays ≈ 0.1 tiles.
- **Hold the line**: troops that arrive in formation keep their spot (like guard mode: they only
  fight what reaches them and return to their post) until their next order.

**Fatigue** (`server/src/sim/fatigue.ts`): stamina 0–100. Walking costs 0.9 per tile (40% less
marching in formation, more uphill and when routing), each melee blow 1.4, each shot 0.5, a charge 4;
resting recovers 2.5/s (0.3/s while fighting). Tiers Fresh / Winded / Tired / Exhausted: down to
−32% speed, −28% damage and +35% morale loss. Forced marches arrive at 60. Inspire gives +25.
Yellow bar when tired and a line in the unit panel.

**Sieges**:
- Own (or allied) infantry and archers can stand **on the walls** (right click on your wall: they
  spread along it, one per section): +1.5 height levels (hit harder, shoot and see farther) and
  +3 armour against arrows. Archers on the walls do not skirmish away.
- A battle for a city with 6+ wall sections is a **siege** (6 minutes, "🏰 Siege" panel): the
  attacker's infantry can **climb the walls with ladders** — slow (30% speed), weak (50% damage) and
  exposed (+30% damage taken). The alternative is breaking the gate with rams. Cavalry never climbs.
- Pathfinding prefers the ground (walls cost extra) and straight lines never cross walls.

Tested in the browser (siege panel, defenders on the walls, Mongols climbing). **Tests**: 286.

## Clicks, personal space, walk or run, tactical pause and siege towers (2026-09-29)

**Clicking resources was hard**: on a right click the game picked the *worker* standing next to the
berries (units had absolute priority) and gave a move order instead of gather; the bushes' hit box
was also small. Now, for orders (right click), own and allied units never cover what is behind
them; whatever is closest to the pointer wins (not the first match); resources have bigger hit
boxes; unexplored resources cannot be clicked.

**Each unit has its own space** (`BODY_RADIUS` in movement.ts): worker 0.22, infantry 0.27,
ranged 0.25, cavalry 0.42, siege 0.5 tiles. Units that overlap are separated also while walking,
and the lighter one gives way (a horse weighs 2.5, a soldier 1.2). Before each step a unit checks
whether it would walk into someone: it steps around to either side; against an **enemy** line it
stops (it has to fight, it cannot pass through); through its own standing troops it passes slowly
and pushes them aside. Two units on exactly the same spot now separate too (bug).

**Walk or run** (R, or the 🚶/🏃 button): soldiers walk by default (65% speed, 15% of the fatigue);
double right click runs just that order; attacking is always at a run.

**Tactical pause**: during a pause students can keep giving orders — they are applied together when
the game resumes. New teacher option "Tactical pause when a battle starts" (off / 10 / 15 / 30 s,
15 by default): when a battle begins everyone gets a few seconds, with a countdown, to plan.

**Siege Tower** (Barracks, Medieval Age; 0 A.D. model): right click an enemy wall; once docked,
infantry crosses onto that section with no delay and no penalty. Ladders now take 4 s of climbing
(slow, weak, exposed) and then the soldier fights on top of the wall.

**Tests**: 295.

## Art for the Industrial and Modern Ages (2026-09-29)

The last 8 units without art (rifleman, machine gun, armored car, anti-tank, mechanized infantry, tank,
heavy artillery, airplane) now use the **PixVoxel Isometric Wargame Sprites** by Tommy Ettinger (CC0,
OpenGameArt), `tools/art/pixvoxel.mjs`:
- The "Blank" version stores a palette index per pixel: the paint indices (those that change between
  the pack's paint palettes) become the team mask, so every vehicle and uniform takes the player's color.
- 4 isometric facings spread over the game's 8 directions; idle, move (4 frames), attack with muzzle
  flashes and death (vehicles blow up and flip over). Half of the attack/death frames and effects cut
  near the unit: the 8 sheets weigh 0.85 MB.
- Own PNG reader for these indexed files (the usual library rejected some of them).
- Airplanes are drawn in the air with their shadow on the ground.

Every unit of every people now has its own art.

**Replaced (2026-09-30)**: the voxel sprites looked too chunky next to the rest. Now, in the style of
Total War: Napoleon:
- Soldiers are thin LPC figures: line infantry with frock coat (player color), bicorne, white trousers,
  knapsack and musket; machine gunners, anti-tank and mechanized infantry with steel helmets, jackets or
  trench coats. The long gun is the CC0 LPC Shotgun layer, drawn over the walk and aim animations
  (thicker for machine guns, an olive tube for the bazooka).
- Heavy artillery uses the LPC field cannon.
- Tank, armored car and airplane are CC0 3D models (T-12, GAZ-67, biplane) rendered by our renderer, now
  able to read binary FBX and OBJ (`tools/art/models.mjs`) and to paint whole parts in the player color.
- Bug fixed: LPC items whose default variant has a space ("kite gray", "dark gray") were silently
  skipped, so the Gaul and Ostrogoth shields were missing. They are drawn now.

## Map under a veil, peoples that look different, smoother movement, new Industrial Age (2026-10-01)

- **Fog of war**: the whole map (terrain, forests, resources) is visible from the start; what your troops do not
  see now is only darker. Enemy troops there stay hidden; enemy buildings appear once seen.
- **Each people looks different, not only by color**: shields keep each people's colors and designs (red Roman
  scutum with gold rim, grey-green Gaulish kite, brown Germanic round shield with a fur cloak, navy Visigothic
  heater with a cross in the player color, gold and red Ostrogothic shields, yellow and black Viking shields);
  the player color stays on tunics and capes. Cavalry carries its people's shield too; Mongol heavy cavalry has
  bronze pauldrons and a cape; Roman infantry wears red crests.
- **Movement**: units only turn when they really move (separation nudges no longer spin them), stand facing
  where the server says (the front of their formation), and the walk animation follows the real speed (no
  running on the spot, no skating when walking).
- **Industrial Age**: the jeep is replaced by **Hussars** (Napoleonic light cavalry with sabre, melee, strong
  against riflemen and artillery). The **field gun**, the **Maxim gun** and the Modern **howitzer** are 3D models
  built in code (`tools/art/guns.mjs`: spoked wheels, carriages in the player colour) with two LPC gunners each;
  firing makes the piece recoil, with a muzzle flash and a cloud of smoke.

## Medieval rock-paper-scissors, computer rival, game report, history and questions (2026-10-02)

- **Weapons of the Medieval Age** (`weapon: 'spear' | 'blade'` in `shared/data.ts`, `weaponMult` in
  `shared/stats.ts`): spears ×3.5 against cavalry (elite spears ×4), cavalry ×0.4 against spears; swords ×0.6
  against cavalry and ×1.6 against spearmen; melee cavalry ×1.6 against swords and axes. A weakness of the weapon
  always wins over a unit's own bonus. The spear wall only protects **from the front**: a flank or rear attack
  ignores it. A cavalry **charge into the front of spears is braced**: no charge bonus and the rider takes 14
  damage. New **Swordsman** for every people (Barracks, Medieval Age) with its own look per people. The army
  guide lists the real counters (e.g. "Sword and axe infantry ×1.6").
- **Performance**: the unit grid returns arrays (no generators) with squared distances, unit stats are remembered
  per player until their technologies change, and the morale "enemy nearby?" check runs every 3 steps per unit
  (staggered). Server step with 800 fighting units: 14 ms → 6.4 ms. The client paints the fog veil into a small
  image only when vision changes (≈6 times/s) instead of 24,000 tiles every frame, and unit gliding stretches
  when network states arrive late (no freeze-and-jump on slow wifi).
- **Computer rival** (`server/src/sim/ai.ts`, Easy / Normal): it plays with the same commands as a student
  (no free resources): trains workers, sends idle ones to the scarcest resource (and moves workers away from a
  resource it has too much of), builds houses, barracks, stable, archery range, farms and (Normal) its people's
  unique building, advances to the Medieval Age, picks troops that counter what it sees of the enemy (spears
  against cavalry, swords against spears, cavalry against swords and archers), defends its city and attacks in
  growing waves by **marching on the nearest enemy city**. When rich (Normal) it builds more production buildings
  and researches upgrades. The teacher adds it in the waiting room ("🤖 + Computer"), or the student on the server
  computer. A Normal rival beats an Easy one in about 12–15 minutes.
- **Game report** (end screen tabs): **📈 Charts** of economy, army strength, workers and losses over time (a point
  every 30 s, `server/src/sim/history.ts`), with alliances 📜, betrayals 🗡, broken alliances 💔, wars ⚔, cities
  taken 🏰 and fallen empires 💀 marked; **talking points** (who gathered most, the strongest army, who invested in
  economy vs army, first to advance, every betrayal with "Why? Did it pay off?", the turning point = biggest army
  loss); and **📜 Chronicle** with the time of each event. Declaring war on an ally is now announced as a betrayal.
- **History for students** (`shared/lessons.ts`): a **"📜 Who were they?"** card per people (when, where, a
  famous figure, how they fought, a fun fact, what they left us) in the waiting room and the army guide, and a
  history note on every unique unit and the basic Medieval units.
- **Questions to advance an age**: advancing asks a multiple-choice question first (history bank per age, or the
  teacher's own questions: one per line `Question | right | wrong | wrong`). Right → the advance starts and a
  "Did you know?" fact is shown; wrong → the right answer and the fact are shown, and the student can try again
  in 20 s. The server checks the answer; computer rivals skip the questions. Option in the teacher panel
  ("Questions to advance an age": history / my own / off).

## Smoother play: faster drawing, depth effects, instant orders, smoothness meter (2026-10-08)

- **Drawing 6× lighter**: the fog veil was repainted as thousands of polygons ~6 times per second (~80 ms each,
  10.5 of the 11.9 ms per frame). Now a per-map table says which tile (with its hill) each fog pixel shows, and an
  update only writes numbers into an image (`client/src/fogmap.ts`): 0.14 ms per frame. Frame drawing with a big
  battle: 11.9 ms → 1.9 ms (steady 60 fps). The minimap merges soldiers on the same pixel (270 → 27 draw calls).
- **Bars only where they matter** (like TW/AoE): selected troops show health, morale and stamina; the rest show
  health only when wounded, morale only when wavering (< 45%), stamina only when exhausted; zoomed far out, only
  the selection.
- **Depth in 2D**: soft shadows cast to the lower right (light from the upper left); arrows and cannonballs cast
  a shadow on the ground and arc higher when the target is far, and arrows tilt along their curve; dust behind
  cavalry, vehicles and running infantry, dust bursts on charges, smoke and dust where cannonballs land and
  buildings fall (`client/src/particles.ts`, capped at 240 puffs and 5 new dust clouds per frame).
- **Turning**: units turn gradually (10 rad/s) and the 4-direction soldiers no longer flicker between two
  drawings when walking diagonally (a margin at the border between directions, `client/src/motion.ts`).
- **Instant response**: right-click and the selected units turn toward the click at once, without waiting for
  the server (0.6 s of priority over the server facing until the movement starts).
- **Smooth zoom** to the cursor (the wheel sets a target; the camera glides in ~0.2 s).
- **Smoothness meter**: a small dot with the ping at the top right; **F3** (or a click) shows fps, drawing ms,
  ping, server ms per step and a plain verdict ("Slow connection…", "The server is overloaded…", "This computer
  struggles…"). The server answers `ping` with its average step time.
- **Player colour under armour**: the Roman spearman, several swordsmen, the Chosen Axeman and the Armored Archer
  lost the player colour in some animations (chain mail covered the coloured tunic); they now wear a sash in the
  player colour, and a test checks every animation of every soldier.
- **Test plan**: `docs/TEST_PLAN.md` (pyramid, areas, targets, manual checks, gaps). New tests: `smooth.test.ts`,
  a performance budget for 800 units, ping/pong, and team colour in every animation.

## Attack animations synced with the real hit; importing external sprite sheets (2026-10-12)

- **Attack sync**: the server already applied damage on one exact step (`lastStrike`); it now reports that
  step to clients (`sk` in the unit data, only for 10 s after a hit). The client (`client/src/attackSync.ts`)
  plays the swing around it: wind-up before the next predicted hit (last hit + the server's exact interval,
  `strikeIntervalTicks` in `shared/stats.ts`, which reproduces the server's 0.1 s countdown and its rounding),
  **the impact frame only when the hit is confirmed** (together with the health drop and the sparks), then the
  recovery, then guard. If the hit is late (slow network, target walking away) the weapon stays raised; it
  never shows an impact the server did not apply. Fast attackers squeeze the swing into their real cooldown.
  Every attack animation now has its impact frame (`hit`: cut/thrust mid-swing, arrow on release, cannon at the
  muzzle flash, ram at full reach). No balance change: the server code that decides damage is untouched.
  Tested with 12 attack speeds (0.6–7 s) and latencies of 0–300 ms with jitter (`attack-sync.test.ts`).
- **External sprite sheets** (`tools/art/importgrid.mjs`, `docs/SPRITES_EXTERNOS.md`): imports a grid image
  (JPG or PNG; e.g. made with AI) into the game format: removes paper backgrounds, baked shadows, grid lines and
  labels, mirrors missing directions, anchors the feet, shrinks with soft edges, turns magenta (#FF00FF) parts
  into the player-colour mask, and reports problems. Output goes to `client/public/art/experimental/` (not in
  git, not published); the client uses it when present and falls back to the normal sheet if it is missing or
  fails to load. The Mongol horse-archer test image was imported this way (local test only: unknown licence,
  only 3 real views, one drawing per action, no player colour).

## 8-direction animated soldiers from 0 A.D. (2026-10-14)

- **Romans and Gauls on foot now come from 0 A.D.'s animated 3D soldiers** instead of 4-direction LPC pixel art:
  warrior, spearman, swordsman, archer for both, plus the legionary and triarius (Romans) and the chosen
  swordsman (Gauls). 11 sheets, each with **8 real directions** and 0 A.D.'s own motion-captured-style
  animations: idle (6 frames), walk (10), attack (8, impact frame taken from 0 A.D.'s `event` attribute, so
  `attackSync.ts` lines it up with the server hit) and death (8). The tunic/shield areas that 0 A.D. paints in
  the player colour become the team mask, so every soldier shows its owner's colour.
- **How** (`tools/art/soldiers.mjs`, `tools/art/skin.mjs`, `tools/art/quantize.mjs`): resolves the 0 A.D. actor
  (body, head, helmet, weapon, shield, cape, chosen variants), downloads the pinned files, **skins the mesh to
  the skeleton in Node** (linear blend skinning from the COLLADA skin + per-bone animation matrices, root kept
  in place), attaches props to their bones, and draws each pose with `raster.mjs` (same isometric view and light
  as the 0 A.D. buildings). Sheets are reduced to 256 colours (≈600 KB instead of 2.5 MB, visually identical).
  `npm run art` builds them after the LPC sheets; `node tools/art/soldiers.mjs [id]` rebuilds only soldiers;
  `--probe <actor>` lists an actor's animations, props and player-colour coverage. Full guide:
  [SOLDADOS_3D.md](SOLDADOS_3D.md).
- **Animation viewer** (`client/preview.html`, dev only: `npm run dev:client` → `/preview.html`): any unit in its
  8 directions × idle/walk/attack/death, drawn with the game's own code, with simulated hits, zoom, and a sheet
  selector to compare old and new art.
- Why not Blender: Blender 5.x removed the COLLADA importer that 0 A.D.'s files need, and doing the skinning in
  Node keeps the art reproducible with no external program.
- Tests: `skin.test.ts` (skinning, interpolation, root kept in place, every recipe has an 8-direction sheet,
  impact inside the swing, death does not loop); the existing art test caught a slinger variant without player
  colour (switched to one that has it).
- Not yet: the other five peoples, workers, cavalry (0 A.D. horse + rider skeletons) and the Gaul naked fanatic
  (no 0 A.D. model) still use LPC. Adds ≈6.5 MB of art, loaded only when that unit appears.

## All infantry in 8 directions, smoother marching, battle diagnosis (2026-10-15)

- **The other five peoples' infantry is now 3D too** (29 more sheets, 40 in total): Germans, Visigoths,
  Ostrogoths, Vikings and Mongols, including their foot unique units. 0 A.D. has none of these peoples, so
  each borrows the closest gear from another civilisation (table in [SOLDADOS_3D.md](SOLDADOS_3D.md)).
- **Half-resolution copies of the big sheets** when drawn at half size or less (`art.ts`): 600 soldiers went
  from 38 to 54 fps in the stress test, measured with REA in Chrome.
- **Tick clock for drawing positions** (`motion.ts` `TickClock`/`posAt`, used by `state.ts`): units are drawn
  from a short per-tick position history on a smoothed clock, so network jitter no longer makes troops stop
  and jump (6.8 % → 0 % jerky frames at 60 ms of jitter; same one-tick delay as before on a stable network).
- **Stress test in the animation viewer**: `/preview.html?stress=600&art=3d|lpc&lod=0|1`.
- Docs: [DIAGNOSTICO_BATALLAS.md](DIAGNOSTICO_BATALLAS.md) (what is missing to feel like Total War: Attila,
  prioritised), [FLUIDEZ_Y_RENDIMIENTO.md](FLUIDEZ_Y_RENDIMIENTO.md) (measurements and next steps).

## Regiments, flying arrows, charge impact, attack-move, battle sound, 3D cavalry (2026-10-15)

- **Regiments**: soldiers of one type from one building fill a regiment (8 infantry / 6 ranged / 4 cavalry);
  one click selects it, Shift-click on a train button orders a whole one; standard over each regiment with
  men left, health and morale; regiment cards in the selection bar; shared panic when 30 %+ of it routs.
  Economy and population unchanged (the computer rival needs no changes).
- **Projectiles** fly with their real travel time and hurt where they land (dodging, friendly fire at half
  damage); shields facing the shooter stop 55 %; 24 shots per archer/skirmisher, refilled near own
  military buildings.
- **Charge impact**: knockdown (1.6 s), push back, trample up to 2 more.
- **Attack-move** (Ctrl + right click or the ⚔ button) and **queued orders** (Shift + right click).
- **Battle sound** synthesised with Web Audio (no files), positioned by the camera; M mutes.
- **Smoother drawing**: 120 ms blend between animations, hit flash, faction sheets preloaded.
- **3D cavalry**: horse and rider skeletons posed with their own synchronised animations (26 sheets).
- Tests: `totalwar.test.ts` (12). Server step with 800 fighting soldiers: 6.45 ms, unchanged.

## 3D workers, lasting battlefields (2026-10-15)

- **Workers in 3D** for all seven peoples (0 A.D. female citizens, 8 directions): each task uses its own
  0 A.D. variant and tool (axe to chop, hoe to farm, pick to mine, mallet to build). The resolver now picks
  variants by the name declared in their file, and later variant groups replace props at the same attach
  point (an empty one removes it), as in 0 A.D.
- **Fallen soldiers stay 25 s** (fading in the last 3 s, up to 220), and **missed arrows stay stuck** in the
  ground for 9 s: battlefields look like battlefields.
- Still 4-direction LPC: the Gaul naked fanatic and the Industrial/Modern units.

## Train whole regiments, shield wall, forest cover, shattered troops, clearer units, better horses (2026-10-15)

- **One order = one regiment**: 6 infantry or ranged soldiers, or 4 riders, come out together and in formation
  (`trainCount`, `trainCost` = 60 % of the single-soldier price × size, `trainTime` = one soldier + 25 % per extra
  man). Workers, the General and machines still come one by one. The computer rival uses the same prices.
- **Shield wall** (F or the 🛡 button, shield-bearing infantry only): arrows do 35 %, +2 melee armour, a frontal
  charge does not knock them down, half speed. Shown with a shield on the regiment standard.
- **Forests**: next to trees, arrows do 60 % and cavalry cannot charge.
- **Shattered**: a regiment that routs a second time only rallies back at its own city (torn standard).
- **Surrounded** soldiers (enemies on 3+ sides) lose morale fast.
- **Clearer units**: warriors carry an axe or mace, no shield or helmet (vs. spear-and-shield spearmen); knights and
  heavy riders ride armoured horses (iron), Generals a white horse with bronze armour; scouts stay light.
  New 3D **Gaul naked fanatic** (bare-chested Celt with long sword and a player-colour cape).
- **Horses**: trot when marching, gallop when running or charging (chosen by real speed), a steady horse while
  the rider strikes (no rearing on every blow), 12-frame gallop.
- Tests: `totalwar.test.ts` (19).

## Smooth big battles, online play without Render (2026-10-15)

- **Cause of the slowdown with ~70 units** (measured with REA at 200 % screen scale): the 3D cavalry
  sheets were up to ~9000 px tall, over the GPU texture limit, so the browser drew them in software
  (1 FPS, 414 ms per frame). Fixes: `tools/art/repack.mjs` packs every sheet in near-square shelves
  (all ≤ 5120 × 6792); `tools/art/lo.mjs` makes half-resolution `.lo.png` copies used at normal zoom
  (decoded memory 3.7 GB → 0.9 GB), with the full sheet only on close zoom and freed after 15 s unused;
  the canvas pixel density is capped at 1.5. Result: **60 FPS, 6.3 ms per frame** in the same battle.
- The F3 meter shows the renderer time per phase (terrain, ground, fog, units, bars, effects).
- `DEMO_ARMY=n` (server env var, measurement only) gives every player n regiments that clash at the center.
- **`npm run online`**: Cloudflare quick tunnel + server with the public link (see README).

## No more freezes, faster server, balance pass, Wonder victory (2026-10-16)

**The freezes ("everything stops for a few seconds")** — measured with REA and in the app's browser:
- Cause: sprite sheets drawn from `<img>` elements. Chrome keeps decoded images only up to a memory
  budget (~400–500 MB here); past it, it decodes and uploads them to the GPU again **every frame**.
  Test: 300 draws from 50 sheets = 11 ms; from 75 sheets = **3.7 s per frame**. A battle with 8
  peoples on screen crossed that line.
- Fix 1: sheets are kept as **ImageBitmap** (decoded off the game thread, outside that budget):
  100 sheets = 22 ms. Fix 2: **trimmed atlases** (`tools/art/trim.mjs`): each frame is cut to its
  outline and packed; per-frame rectangles in the manifest (`r`). Drawn texture memory: 1052 MB →
  412 MB (a 3D sheet: ~20 MB → 4 MB). Fix 3: team-colour masks are prepared at most 4 ms per frame.
- Result (stress test, 300 soldiers, all 74 3D types, 8 colours, zoom in/out every 3 s): **0 fps
  with 3–4 s freezes → 60 fps, 6–7 ms per frame**, no stutters after loading.
- F3 meter now shows the worst frame and stutter count, and the server's worst recent step; the
  server logs any step over 150 ms.

**Server**: A* rewritten with flat arrays and a reusable typed heap (**5× faster**, same paths) and a
per-step search budget for combat chases. Worst step in an 8-player battle: 89 ms → 13 ms.

**Online play**: static files are now cached (built code forever, art for a day, 304 re-checks), so
each student downloads the art once. Alternatives (fixed link with Tailscale Funnel or a named
Cloudflare tunnel, a VPS, Render) in [JUGAR_ONLINE.md](JUGAR_ONLINE.md).

**Balance (Phase 6.4)** — equal-cost matchup matrix (`.bench`-style harness) and bot tournaments:
- The counter triangle holds (spear > cavalry > swords/archers, swords > spears).
- **Archers lost to everything**: skirmish made them back away endlessly without shooting (40 s walking,
  zero arrows). Now they shoot when loaded and step back while reloading. Archer arrows 5 → 7 and
  frontal shield block 55 % → 40 %: placed archers now beat spearmen and still lose to cavalry and
  shielded swordsmen.
- Unique units: Horse Archer 6 → 7, Armored Archer 6 → 9 (cost 90 → 80), Javelin Rider 8 → 9,
  Axe Thrower range 3 → 4, Gothic Knight cost 180 → 155, War Chariot cost 180 → 160;
  Berserker cost 100 → 120, Huscarl 130 → 145, Gothic Lancer 150 → 165.
- Peoples: Mongols lose the +10 % cavalry attack, cavalry trains 15 % faster (was 25 %) and their
  terror is +10 % (was +20 %); Visigoths gather metal 15 % faster.
- **Bots' economy**: they always ran out of food while thousands of metal and stone piled up. Now
  they build up to two farms at a time and, in the Medieval Age, a market where they sell surplus
  stone/wood and buy food.
- Bot tournament (all peoples, 24 full games each): first run 17–83 %; final run Romans 42 %,
  Mongols 54 %, Gauls 25 %, Germans 42 %, Visigoths 46 %, Ostrogoths 67 %, Vikings 75 %.
  **Next:** Vikings and Ostrogoths a bit strong, Gauls weak. Tools: `tools/bench/matchups.ts` (matrix, `HOLD=1`, `TWEAK=…`) and `tools/bench/tourney.ts`.

**Wonder victory (Phase 6.2)**: Medieval building (600 of each resource, 15 min with one worker). A
finished Wonder that stands 5 minutes wins; everyone is warned and the war panel shows the countdown;
destroying it stops the clock; one per empire. Bots send their whole army against an enemy Wonder.
New `preview.html?buildings=1&faction=…` shows every building of a people.

## Loading screen and classroom setup (2026-10-16)

- **Loading screen** when the game starts: every browser prepares only what this game uses, i.e. the
  light sheets of the peoples playing, the buildings, and each people's team mask in the colours of
  its players, before showing the map. "Play now" appears at 6 s, and at 30 s it enters anyway.
  Measured with REA (4 bots, 120 units, teacher watching, cold cache): **50 → 60 fps, worst frame
  167 → 20 ms, 5 → 1 stutters in 40 s**, loading 1.8 s. The old preload fetched the *full-resolution*
  sheets of your own people (4× the data, then thrown away after 15 s); now it uses the light copies.
- **Lobby prefetch**: in the waiting room the browser downloads (without decoding) the art of the
  chosen people and the buildings, one file at a time so it does not crowd the school Wi-Fi.
- **Classroom launcher**: `Jugar en el aula.bat` / `npm run aula` installs on first use, rebuilds the
  client only when something changed, starts the server and opens the teacher panel.
  `Jugar online.bat` does the same with the Cloudflare tunnel.
- **Network audit**: `tools/bench/traffic.ts` measures ~67 kbit/s per student (peaks 250), so 30
  students need ≈ 2 Mbit/s. The server answers on the LAN address in 4 ms. Recommendation and
  troubleshooting are in [JUGAR_ONLINE.md](JUGAR_ONLINE.md).

## Illustrated loading screen, online button, cleaner screen (2026-10-16)

- **Loading screen**: a painted scene (dusk sky, mountains, a castle flying your colour) with a row of
  soldiers of your people; history facts of the peoples in the game rotate every 7 s; a side panel
  with every unit of your people up to the Medieval Age (what it does, what it beats, what it
  fears, a line of history). When everything is ready: "Enter the battlefield" (it enters by itself
  after 25 s; reconnecting players and the teacher enter as soon as it is loaded). The same
  information stays in 📖 Army.
- **Stutters when an army comes out of the fog**: the loading screen now also sends every sheet and
  colour mask to the GPU once (a 1 px draw), and when you zoom in, sheets switch to full resolution
  one every 0.4 s (they used to switch all at once) and stay for 60 s (was 15 s).
  Test `preview.html?stress=300&types=all&colors=8&appear=1`: preload, then a new type appears
  every 300 ms. Result: 60 fps, 1 stutter in 26 s.
- **Online button in the teacher panel**: "🌐 Turn on online play" opens the Cloudflare tunnel from
  the server and shows the link with a copy button; "Turn off" closes it. Only on the server
  computer. If cloudflared is missing, the panel shows how to install it. Tested end to end with
  REA (button → link → 200).
- **Unit panel**: compact (name, health, what it is doing, morale, one line of stats and urgent
  states). Description, counters and details are in the ⓘ tooltip.
- **Notices**: the war panel moved from the top centre (560 px, one block per battle) to a narrow
  column on the right; other players' battles take one line, and anything beyond 5 rows is summed
  up. Results of battles you were not in are a small notice instead of a window in the middle;
  your own results are a card on the right that closes by itself after 15 s. Notices are on the
  left at mid height.
- `DEMO_CODE=ABCD` (server env var, tests only): the first room gets that code, so REA can join as a
  student.

## Both ways to join at once, riders that do not skate (2026-10-16)

- **How students join** (top of the teacher panel, always): 🏫 classroom link (local network) with
  a copy button, and 🌐 from home (internet) with "Turn on online play" / "Turn off". One server does
  both at the same time. `Jugar online.bat` is now the classroom server with online play already on,
  so the link shows up in the panel and in the window. The old `npm run online` started the server
  in a mode that hid the button. Checked with REA: both links answer.
- **Unit panel**: the one-line stats were drawn one value per line (they inherited a grid layout);
  the panel is now 200 px wide with smaller text.
- **Riders (Total War reference)**: measured with the pixels of the planted hooves. The trot played
  2.4× too slowly for the speed the horse moved (it skated); the gallop was already right.
  `tools/art/stride.mjs` measures each walk/run animation's stride (tiles per cycle) on its side and
  diagonal views and stores it as `st`: horses trot 0.53–0.69 tiles per cycle and gallop 1.4–2.1;
  infantry 0.45–1.0. The game plays each animation so the feet stay planted (clamped to 0.5–3× the
  authored speed). Trot↔gallop now switches at 2.0 / 1.65 tiles/s (it used to flicker around 1.9).
  Riders have a long shadow along the horse's facing instead of the round shadow of a soldier on
  foot.

## Riders with weight: gallop attack, arcs and charges that go through (2026-10-16)

Priority 1 of [DIAGNOSTICO_PROYECTO.md](DIAGNOSTICO_PROYECTO.md).

- **Attack at a gallop**: new `charge` animation on every rider sheet: the rider strikes (or shoots)
  on the *galloping* horse, one stride per blow (`tools/art/soldiers.mjs`, horse body `run` + rider
  `attack_melee`/`attack_ranged`). A rider that attacks while moving uses it; the standing attack
  is only for static melee. Its pace uses the gallop stride, so the hooves stay planted.
- **Starting and turning** (server, `movement.ts`): cavalry starts at 35 % speed and reaches full
  speed in 1.2 s; it turns at most 220°/s and loses momentum in sharp turns (a half turn at a
  gallop slows it down). The path stays the same; the pace and the facing change, so flanks and
  rears also turn gradually.
- **Charges that go through** (`combat.ts`): after the charge impact against infantry (not braced
  spears in front), the rider keeps riding ~2 tiles through the line, then turns in an arc and comes
  back. The next charge is ready after 4 s, like Total War's cycle charge.
- Viewer: `preview.html` shows gallop and charge rows.
- Tests: `server/test/cavalry.test.ts`. Matchups unchanged in direction: knight vs spearmen −0.85,
  vs swordsmen +0.73, vs archers +0.80; scouts do a bit better against swordsmen (−0.60 → −0.24).

## Real bows and running infantry (2026-10-16)

Priority 2 of [DIAGNOSTICO_PROYECTO.md](DIAGNOSTICO_PROYECTO.md).

- **Archers with bows**: 0 A.D. has no Roman, Gaul, Briton or Iberian archers, so the archers of
  Romans, Gauls, Germans and Visigoths were built on a javelin thrower or a slinger and shot with
  that gesture. Now they keep the clothes and head of their people and carry a short bow, an arrow
  and a quiver, with the stance and the shot of a 0 A.D. archer (`archer()` recipe in
  `tools/art/soldiers.mjs`).
- **Running on foot**: every infantry sheet has a `run` animation. Troops at full speed run, and in
  walk mode (R) they walk (thresholds 1.0 / 0.9 tiles/s; riders keep 2.0 / 1.65).
- Viewer: the "gallop" row shows the run for soldiers on foot.
- **Team-colour masks at half resolution**: with the bigger sheets, the stress test (74 types × 8
  colours) slipped to 53–56 fps with a stutter every ~8 s. Each mask was a full-width canvas (~3 MB,
  ~1.8 GB in that test). Now they are a quarter of that (flat cloth colour, it does not show), and
  the test is back to a steady 60 fps with no stutters after loading. Drawn sheets total 497 MB.

## Walls that block, online that recovers, riders that brake (2026-10-16)

- **Walls block everyone**: reproduced with a simulation: own infantry used its walls as a corridor
  (walls were walkable for their owner and allies) and crossed to the other side. Now a wall is a
  wall for everybody (own, allied and enemy troops, cavalry). Only soldiers ordered to man the wall
  climb it, and attackers still use ladders and siege towers in a siege. Tests:
  `server/test/walls-block.test.ts`.
- **Faster walls**: 2 s per section with one worker (was 6), gates 5 s (was 10).
- **Flat walls**: a column only at ends, corners and junctions; straight sections are a continuous
  wall. The viewer (`preview.html?buildings=1`) shows a sample wall.
- **Online from home**: the quick tunnel had died silently (cloudflared kept running but the link
  no longer existed), and the panel kept showing it as on. Now the server checks its own public link
  every 30 s and opens a new one after 3 failures (the new link appears in the panel). It also shows
  a new link only once it answers: a fresh link takes 10–20 s to exist, and a student who opened it
  too early got "not found" cached by their browser for minutes. Checked with REA: a student joining
  through the internet link played at 60 fps, 125 ms ping. The F3 meter now warns from 180 ms (was
  120) because 100–150 ms from home plays fine.
- **Riders**: they brake over the last 1.2 tiles when marching (they used to stop dead). A soldier
  knocked down by a charge now falls (~0.4 s), stays down and gets up (~0.4 s) instead of freezing
  in one frame.

## Archer range, fire on the move, close combat on the march, test key, death variants (2026-10-19)

- **Archer range on screen**: selected ranged units (archers, slingers, horse archers, siege) show
  their range as a shaded zone with a dashed outline. A whole regiment draws one zone (the union of
  all circles), not 30 overlapping rings (`drawRanges` in `client/src/render.ts`). The extra range
  from a hill is not drawn yet.
- **Fire on the move**: with a plain move order, ranged soldiers shoot the nearest enemy in range
  without stopping. On foot they reload 35 % slower (`MOVING_FIRE_SLOW`); horse archers keep their
  normal rate. Before, a plain move ignored enemies completely.
- **Close combat on the march**: melee troops with a plain move order engage an enemy soldier that
  comes within 30 % of their sight (at least 2 tiles, `ENGAGE_NEAR`), and then carry on to where
  they were going (`Unit.resume`). They ignore workers and routing enemies, and do not chase far
  from their path. Guard mode and holding a formation keep their own rules; a new order cancels it.
- **Test key**: typing `imperio10mil` in the chat sets every resource to 10,000. It works when one
  student plays alone (against the computer) or when the teacher turns on the new "Test mode" option
  when creating the game. Nobody else sees the message.
- **Priority 3 (knockdown, dust, deaths)**: the death event now carries the direction of the
  killing blow and whether it was brutal (charge, rider, siege). The fallen soldier slides that way
  (about half a tile when ridden down) and falls at one of three speeds, so a line no longer dies in
  step. Dust when a body hits the ground and when a charge knocks someone down, and a 0.18 s camera
  shake when a charge lands on screen.
- Tests: `server/test/marching.test.ts` (9). Checked in the game with REA (headless Chrome): the
  key, the range zone and the march with no page errors (`docs/img/alcance_y_clave.png`).

## Middle Ages in three stages, monk and monastery, mangonel and trebuchet (2026-10-19)

Priority 5 of `docs/DIAGNOSTICO_PROYECTO.md` (§9): the Medieval Age, where most of the game is
played, was a single step.

- **Three stages**: Early (AD 500–1000), High (1000–1300) and Late Middle Ages (1300–1500)
  (`MEDIEVAL_STAGES` in `shared/data.ts`). You advance with a Town Center technology (`stage2`,
  `stage3`) and, if the room has questions, a history question of that period
  (`STAGE_QUIZ_BANK` in `shared/lessons.ts`, 8 per stage). Everyone is told when someone enters a
  stage, with its years. The top bar shows "Medieval · High". The stage is not a new field: it comes
  from the researched technologies (`stageOf` in `shared/stats.ts`), so the protocol did not change.
  The Industrial Age now needs the Late Middle Ages.
- **What each stage opens** (`stage` on units, buildings and techs; `stageReached` decides):
  High → Mangonel (all peoples) and stone Fortresses; Late → Counterweight Trebuchet (all peoples),
  Crossbowman, Pikeman and Cavalier (plate armor). The build menu says what the next stage brings
  ("In the High Middle Ages: Fortress."), and the server refuses anything early with the reason.
- **Monk and Monastery** (from the Early Middle Ages, every people): the monk does not fight; he
  heals his own soldiers within 4 tiles (+3 health/s; several monks do not stack). Reuses
  `server/src/sim/healing.ts`. An attack order sends monks behind the soldiers, close to the target.
  The Monastery researches Herbal Medicine (+2 healing).
- **Mangonel**: throws stones that also hit enemies packed next to the target (60 % of the damage
  within 1.3 tiles, `splash`). Good against blocks of infantry and archers. **Counterweight
  Trebuchet**: the longest medieval range (12), made for walls and fortresses. Both trained at the
  Barracks, like the ram.
- **Computer rival**: goes to the High Middle Ages once it has an archery range and to the Late once
  it has a monastery; builds a monastery, keeps 1 monk per 8 soldiers (up to 4) and, on Normal, 2–4
  stone throwers (half trebuchets in the Late Middle Ages). It now counts the population already
  waiting in its queues: it used to queue regiments that never fit and blocked the barracks. In a
  test game it reaches the High Middle Ages at minute 8 and the Late at minute 10.
- **Art**: the mangonel is the Roman onager of 0 A.D. (from the art cache, `any-mangonel`); the
  counterweight trebuchet reuses the trebuchet sheet; the monk and the monastery are drawn in
  `client/src/sprites.ts` (hooded habit, staff, a faint aura of the player color; church with a red
  roof, bell tower with a slate roof and an herb garden), because the 0 A.D. healers are not in the
  cache.
- Tests: `server/test/medieval.test.ts` (13). The full progression test now goes through the three
  stages. Checked in the game (local server, `imperio10mil`): stage buttons, both questions, the
  menu hint, the monastery, monks and the mangonel on the map.

## Walled cities are left through the gate, the gate opens, a regiment is 1 population, desktop icon (2026-10-19)

- **Investigated with REA** (headless Chrome over a test scene, `DEMO_WALLS=1`: a walled Town
  Center with one gate and two regiments that go out and back in four times; see
  `server/src/sim/demo.ts`). Found and fixed:
  - **Soldiers manning a wall came down on the outside**: ordered out of the city, the 6 men on the
    wall walked along it and stepped down outside without using the gate. Now the stairs of your own
    (or an ally's) wall are on the inside: you go up and down only on the side of your nearest Town
    Center (`World.wallStepOk`, used by the path search, straight lines and every short step and
    push). Enemies climbing with ladders in a siege are not affected. A crowd of 40 pushing to get
    out never leaked (that part already worked); now both cases have tests
    (`server/test/walls-block.test.ts`).
  - **Units walked over the roof of the gate**: the client lifted anyone on a gate tile to the height
    of the wall (gates were in the same lookup as walls). Now they go through at ground level, under
    the arch.
  - **The gate never looked open**: the 0 A.D. gate already has painted doors. Now two wooden leaves
    swing open on their hinges (0.7 s, a small bounce at the end) when a unit of the owner or an ally
    comes within 2.6 tiles, the passage behind shows dark, and they close by themselves when nobody
    is near (`gateDoors` in `client/src/sprites.ts`, `updateGates` in `client/src/render.ts`).
  - The demo ring had holes where trees stood (nodes were deleted without freeing the tile).
- **Population**: a whole regiment now takes **1 place** (like a worker; siege engines keep their
  own). Houses raise the limit up to `POP_CAP_MAX` = 60; at the maximum, training is refused with
  "Maximum population reached". To keep the server fast there is also a **unit limit per game**:
  `UNIT_BUDGET` = 2,400 units shared among the players (150 each with 16 players, 300 with 8, up to
  400). The top bar shows "34/60" and below it "120/150 units".
  Measured (16 players, large map, big battle, fog on): 1,100 units = 17 ms per step, 9 KB/s per
  student; 2,100 = 25 ms, 17 KB/s; 3,100 = 29 ms, 23 KB/s (of 100 ms). Without fog the data per
  student is 9× more (207 KB/s with 3,100 units): fine on the school Wi-Fi, too much from home.
- **Regiments kept after a march**: a march on another city rebuilt the soldiers without their
  regiment number (they came back as loose men). With 1 place per regiment that mattered; now they
  keep it.
- **Computer rival**: counts population per regiment and the unit limit; it stops building houses
  at the maximum; separate quotas for mangonels and trebuchets.
- **Desktop icon**: "Jugar en el aula.bat" and "Jugar online.bat" were broken since they were
  created (`node scripts${script}` instead of the script). Fixed. New `Crear icono en el
  escritorio.bat`: double click once and the desktop gets "Classroom Empires (aula)" and
  "Classroom Empires (online)" with the game icon (`tools/icon/`, made from the Town Center art by
  `node tools/icon/make-icon.mjs`). Double click on the icon = server + teacher panel.
- Tests: 442 pass (new `server/test/population.test.ts`, 4; 2 more in `walls-block.test.ts`).

## Portable server package for another computer (2026-10-19)

- `npm run portable` (`scripts/portable.mjs`) builds `dist-portable/ClassroomEmpires/` and
  `ClassroomEmpires-portable.zip` (197 MB zipped, 294 MB unzipped): nothing to install on the other
  computer. Inside: `app/node.exe` (this computer's Node.js), `app/server.mjs` (the whole server
  bundled into one file with esbuild, ws included, 424 KB), `app/web` (the built game, without the
  experimental art of unconfirmed license), `app/cloudflared.exe` (if installed here, for online
  play), the icon, licenses, `LEEME.txt` and the three launchers (`Jugar en el aula.bat`,
  `Jugar online.bat`, `Crear icono en el escritorio.bat`).
- The server takes `STATIC_DIR` (where the built game is) and `CLOUDFLARED` (path to the tunnel
  program) from the environment; `app/start.mjs` sets both, checks whether the server is already
  open and opens the teacher panel.
- Checked: unzipped in another folder and started with **no Node.js in the PATH** (only Windows):
  the page and the art load, and a game (a student and a Normal computer rival) runs at 10 updates
  per second.
- Most of the size is the unit art (149 MB; the same the normal game uses), node.exe (89 MB) and
  cloudflared (53 MB).

## Online mode works on networks whose DNS remembers "does not exist" (2026-10-20)

- **Symptom**: "Turn on online play" ended with "No working public link after 90 s".
- **Cause**: cloudflared made the link fine (checked by hand: tunnel created, all connectivity
  checks passed). But the server tested the link about 5 s after cloudflared printed it, before the
  name existed. The DNS of this network (10.128.128.128) remembered that "does not exist" and kept
  answering it for more than a minute, so the confirmation never came and the start timed out. On
  the previous network the router's DNS did not do that, which is why it worked before.
- **Fix** (`server/src/net/tunnel.ts`): the first check waits 15 s, and the link is checked through
  public DNS servers (1.1.1.1, 8.8.8.8, 9.9.9.9…, rotating), never through Windows or the router.
  So this computer never stores the "does not exist" either, and the teacher can open the link on
  the server computer too. If the network blocks public DNS, it falls back to the system one (after
  the 15 s wait).
- Checked on this network: the link appears in ~20 s; the page and the art load through it; a
  student joining through `wss://…trycloudflare.com` received 129 updates in ~14 s (10 per second,
  the normal rate); the built-in browser connects too.
- Two tests depended on how fast the computer was (on battery the CPU slows down and 47 test files
  share 12 cores): the 8-minute computer-rival test now has a 60 s limit like the other long ones,
  and the performance test takes the best of three batches (same 40 ms limit). Same code measured
  6.2–6.5 ms per step before and after yesterday's changes.
- The portable package was rebuilt with the fix (`npm run portable`).

## Duels tool with advance mode; cavalry skirmishers can be caught (2026-10-21)

- **`scripts/duels.ts`** (new): duels of 8 against 8 on a flat map, each pair played on both sides and
  averaged. `--avance` makes the left side attack-move. The first version gave contradictory results
  because the two fronts were not at the same distance from the centre (a mistake in the test, not the
  game); fixed.
- **Mounted archers outplay infantry that waits**: spearmen quiet 6 against 8 horse archers; spearmen that
  attack-move 6.5 against 1.5. The cause is the skirmish rule (a ranged unit backs off 3.5 tiles when a
  melee enemy is within 2.2): with the rule off, advancing spearmen win 8 to 0.
- **Change**: a mounted skirmisher stops backing away after 3 retreats in 10 s (`SKIRMISH_MAX`,
  `SKIRMISH_WINDOW`, `Unit.retreats`), so the infantry that chases can reach it. Foot archers are not
  affected (the full tables show no duel without cavalry changed).
- Advancing spearmen against horse archers: 6.5 to 1.5 becomes 7.0 to 0.5.
- Tests: `server/test/skirmish-cap.test.ts` (2). Open issue found on the way (audit P6), first described
  as "a melee unit that meets an enemy line stops"; measured per soldier, it was something else (next entry).

## Regiments fight as a whole; cavalry shoots and strikes in time at a gallop (2026-10-21)

- **Audit P6, corrected.** Measured soldier by soldier (24 duels, 8 and 24 a side): units stuck against an
  enemy line were rare in infantry (0–1.9 %) and up to 9.5 % in cavalry (knights against swordsmen). The
  real problem was **bystanders**: up to 36 % of the soldiers stood idle while their own regiment fought,
  because the enemy was beyond their own sight (legionaries against berserkers, 24 a side).
- **A regiment fights as a whole** (`server/src/sim/combat.ts`): when one soldier of a regiment is
  fighting, its idle mates look for enemies up to `REGIMENT_JOIN` = 3 tiles beyond their sight. Not in
  guard mode. Bystanders: up to 36 % → at most 3 %.
- **Fight what is in contact**: a melee soldier that cannot reach its target but has an enemy against it
  strikes that enemy instead of standing still; a target given by the player is kept. Stuck: up to 9.5 % →
  at most 1 %. It does not walk around by itself (as in Total War, flanking is the player's order).
- **Balance effect**: the duel winner changed in 9 of 66 pairs (both sides quiet) and 5 of 66 (one
  advancing), nearly all with ranged units, which used to win because the enemy regiment arrived one by
  one. Two now contradict their description and are left to decide: the chosen spearman and the naked
  fanatic say "loses to archers" and now beat them (see `docs/AUDITORIA_JUGABILIDAD.md`, P6).
- **Computer rival**: it reserved the place of the counterweight trebuchet only once in the Late Middle
  Ages, by when regiments had filled the population (58 of 60), and a stray "−1" in the reserve
  discounted a place even when nothing had been queued. Now it keeps that place from the High Middle Ages
  and discounts only what it queued that turn. It trains the trebuchet again (before minute 12).
- **Cavalry animations** (`client/src/art.ts`, `client/src/attackSync.ts`, `client/src/render.ts`):
  - A mounted archer that shoots while moving (plain move order or skirmishing) was drawn trotting or
    galloping, so the arrow left a rider who did not draw the bow (the server reports it as "moving").
    Now, after each shot it uses the shoot-at-a-gallop animation for a moment (up to the next shot), so a
    burst reads as continuous.
  - The charge animation (strike or shot at a gallop) ran on a free loop; its impact frame did not match
    the real hit. Now the impact frame lands on the exact server tick of the hit and then follows the
    gallop stride, like the attack on foot already did.
  - Checked in the browser (local test server, demo armies): the battle runs, no console errors. A live
    horse archer was not seen (the demo armies have none); the choice and the timing are covered by tests.
- Tests: 451 pass (new `server/test/regiment-cohesion.test.ts`, 3; 3 more in `attack-sync.test.ts`). The
  mangonel test moved its own soldier out of melee reach: it measures the splash only, and with the new
  behaviour an enemy in contact now fights it (before, that enemy turned its back to chase the mangonel).

## New Mongol horse archer and Khan's camp; idle-worker reminder; the Sacred Hill needs a rival (2026-10-21)

- **Mongol horse archer, new art** (`tools/art/soldiers.mjs`). It was a Persian rider whose bow lay on
  the ground under the horse. The cause: the recurve bow is a mesh with its own small skeleton, and the
  renderer posed it with the rider's bones; it found none of its own and fell to the origin. Now a prop
  with its own skeleton is placed at its attach point (posed with its own animation in step with the
  horse, or at rest). The rider is now the Han elite horse archer from 0 A.D. (East Asian face, fur-trimmed
  cap, robe in the player's colour, leather saddle blanket, Han bow): the closest steppe look 0 A.D. has.
  He draws and shoots both standing and at a gallop.
- **Horse manes and saddle blankets** flipped up at the end of every shot and charge, in all cavalry. They
  carry the horse's own animations, and were played as if they were a rider (the rearing clip, out of step
  with the body). Now a prop that shares the wearer's bones always follows the wearer. All cavalry and
  archer sheets were rebuilt with both fixes.
- **Mongol Town Center** (`client/src/sprites.ts`): 0 A.D. has no gers, so it is drawn. The Khan's camp
  (ordu): a great ger with shaded felt walls, the wooden lattice showing through, a band in the player's
  colour with gold trim, an orange painted door, roof poles, the smoke-hole crown with a gold finial and
  smoke; two guard gers; a white and a black nine-tail standard (tug); a cart with chests; a low pole fence
  open at the front with pennants; a felt rug at the door. Every Mongol building uses the new ger.
- **Idle-worker reminder** (audit P4, `server/src/sim/idle.ts`): when a player has workers doing nothing
  for 45 s, they get a notice ("2 workers are doing nothing. Click "Idle"…"), repeated every 90 s while it
  lasts (`IDLE_WARN_SECONDS`, `IDLE_WARN_REPEAT`). Seen live in a local game.
- **Sacred Hill needs a rival** (audit P4, `server/src/sim/victory.ts`): it only counts while some rival
  of the holder is still standing. A student alone in a room no longer wins by the hill.
- Tests: `server/test/idle-hill.test.ts` (4).
- **Why the old horse archer kept showing (found with REA in a live battle).** A local experimental sheet
  (`client/public/art/experimental/`, the AI-generated test image, git-ignored) overrode the Mongol horse
  archer for Mongol players: 1 idle frame, no gallop or charge, no player colour. Its mapping was removed
  from that local manifest (the image is kept). Now Mongol players see the 0 A.D. rider, with the saddle
  blanket in their colour. Checked with REA: rider, bow and red blanket in a live battle, no page errors.
- **A unique unit in other hands** (e.g. a horse archer of a non-Mongol player in a test) used a flat
  drawing; now it uses that unit's sheet from the people that has it (`client/src/art.ts`).
- **Art review option**: `DEMO_TYPES=horse_archer,spearman` (with `DEMO_ARMY`) picks the demo regiments,
  to see a unit in battle (`server/src/sim/demo.ts`). Without it, nothing changes.
- The 44 rebuilt sheets had their strides measured again (`tools/art/stride.mjs`). 455 tests pass.

## Mongol knight and Mongol city for the later eras (2026-10-22)

- **Mongol knight** (`tools/art/soldiers.mjs`): it was a Persian spearman. Now it is the Han advanced
  lancer from 0 A.D. with a ji halberd, iron horse armour, and a closed steel helmet (Han cavalry helmet)
  instead of the cloth cap. A horse recipe can now swap the rider's props (`rider: { helmet: … }`).
- **Mongol buildings in eras 3 and 4** (`tools/art/forts.mjs`, `CITY`): they used the generic timber and
  stone houses. Now the Mongols build a Yuan city (the dynasty the Mongols founded in China, with its
  capital Khanbaliq): Han buildings from 0 A.D., rendered like the fortresses, with the player's colour.
  Town Center → civil centre, house, storehouse, barracks, archery range, stable, academy (tech center),
  market, arsenal (workshop), temple (monastery). Farms, quarries, mines and factories stay common. Up to
  the Middle Ages they keep the gers and the Khan's camp. Only these images: `node tools/art/forts.mjs city`.
- Checked in the game renderer at era 3 (red player): all ten draw with their team colour. 455 tests pass.

## Known limits
- Units are not upgraded when an era changes: the old ones stay, the new ones replace them in the menus.
- If the server is restarted, the games in progress are lost (they are in memory).
