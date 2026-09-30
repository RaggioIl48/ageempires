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
  able to read binary FBX and OBJ () and to paint whole parts in the player color.
- Bug fixed: LPC items whose default variant has a space ("kite gray", "dark gray") were silently
  skipped, so the Gaul and Ostrogoth shields were missing. They are drawn now.

## Known limits
- Units are not upgraded when an era changes: the old ones stay, the new ones replace them in the menus.
- If the server is restarted, the games in progress are lost (they are in memory).
