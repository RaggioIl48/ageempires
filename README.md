# Classroom Empires

A multiplayer real-time strategy (RTS) game for the browser, designed for classes.
Inspired by how classic RTS games play (gathering, building, armies,
diplomacy), with **original** code and names. Unit art comes from **open-licensed**
projects (LPC and OpenGameArt), with credits inside the game (*Art credits*).

- The teacher runs the server on their computer.
- Students open a URL in Chrome, Edge, Firefox or Safari (Windows or macOS). They install nothing.
- No external services needed: it works on the school's local network (or online, on Render).
- All game texts are in English.

> Current status: **Phase 5 done + historical peoples** (Romans, Mongols, Gauls, Germans, Visigoths, Ostrogoths and Vikings, each with unique Medieval units and building; four ages; AoE-style long walls; teams and diplomacy). See [docs/PROGRESO.md](docs/PROGRESO.md) and the [roadmap](docs/HOJA_DE_RUTA.md).

## Requirements

- [Node.js](https://nodejs.org) 20 or newer (only on the teacher's computer).

## Playing in class (LAN mode)

**1. The teacher starts the server** (in a terminal, in the project folder):

```bash
npm install        # first time only
npm run build      # builds the game for the browser
npm start          # starts the server
```

The console shows something like:

```
  TEACHER:      open http://localhost:8080/teacher on this computer
                (from another computer, the teacher PIN is: 4821)

  STUDENTS:     http://192.168.1.20:8080
```

If Windows asks whether to allow Node.js on the network, answer **Allow** (private networks).

**2. The teacher opens `http://localhost:8080/teacher`** (the old `/profesor` address still works) and creates a game: number of
players (1–16), map size and duration. The panel shows a **4-letter code** (for example
`KBTR`) and the direct link for the students (`http://192.168.1.20:8080/?c=KBTR`).

**3. The students open the link** (or the address and type the code), type their
name and choose their **faction** and **color** in the waiting lobby.

**4. The teacher presses "▶ Start game"**. From the panel they can also: watch the
game (whole map and each student's economy), pause/resume, end, remove a student and
close the room.

If a student loses the connection or closes the tab, they only need to open the link
again: **they come back to their same player** automatically.

**Testing alone (without students):** in the panel press **"🧪 Try as a student"**, type
a name and pick a faction. Since you are on the server computer, the waiting lobby shows the
**"▶ Start game"** button: pressing it starts the game.

### How students connect

Through the **school's local network** (the same Wi-Fi or cable as the teacher's computer).
No internet, accounts or installation needed: just Chrome, Edge, Firefox or Safari.

1. Everyone must be on the **same network** as the teacher's computer.
2. The address (e.g. `http://10.126.197.163:8080`) is shown in the teacher panel. It **can change
   from one day to the next**: always copy it from the panel. Write it on the board or project it.
3. The first time, Windows asks whether to allow Node.js on the network: answer **Allow**.
4. ⚠️ **Guest Wi-Fi networks often isolate devices** from each other (students would not be able to
   reach the teacher's computer). **Test before class:** connect a phone to the same Wi-Fi and open
   the address. If the game's start screen appears, it works. If not: ask IT for a network without
   isolation, or use a small dedicated router or a phone's hotspot for the class.

Options (environment variables):

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Server port | `8080` |
| `TEACHER_PIN` | Teacher PIN (to enter the panel from another computer) | 4 random digits |

Example in PowerShell: `$env:TEACHER_PIN="2468"; npm start`

## Controls

| Action | Control |
|---|---|
| Select | Left click |
| Multiple selection | Drag with left click (Shift adds) |
| All of the same type on screen | Double click |
| Contextual order | Right click: ground = move · resource = gather · enemy = attack (only ranged units can hit airplanes) · foundation or damaged building = build/repair · own farm, quarry, mine or woodlot = work it |
| Select a whole army type | Buttons above the minimap: **⚔ Infantry · 🏹 Ranged · 🐎 Cavalry · 💣 Siege · All** (Shift adds). With several types selected, click a type in the left panel to keep only those |
| Groups | **Shift+1…9** saves the selection as a group · **1…9** selects it (press twice: the camera goes there) |
| March on a city (Total War style) | With soldiers selected: **⚔ March on a city** and choose an enemy city. The army leaves the map and appears in front of that city after 12–45 s (the enemy sees it coming); a **battle** for the city begins, shown to everyone with a panel (strength, fallen, 4-minute clock, *Go to battle*, *Retreat*). The city **falls** if you destroy its Town Center (you sack 30% of its resources); otherwise your army returns home |
| Formation | With 2 or more soldiers: **▤ Line** (infantry in front, ranged behind, cavalry on the flanks), **▥ Column** (3 wide) or **⁘ Loose**. In formation everyone marches at the pace of the slowest |
| Draw a formation (Total War style) | With soldiers selected, **drag with the right button** on the ground: the line is the front, the arrow shows where they will face. They line up along it and face forward when they arrive |
| General | Every player starts with one (Legate, Khan, Jarl…). Select him: **Q 📯 Inspire** (morale back, routing soldiers rally, +25% damage for 20 s) · **E 🛡 Hold the Line** (+3 armor, steadier for 20 s). If he falls, train another at the Town Center |
| Hills | Cities stand on hills. From higher ground units hit harder and archers shoot farther; climbing is slow |
| Battles in lines | Troops that arrive in formation hold their spot. Right click an enemy to charge: each soldier takes the nearest enemy of that formation |
| Fatigue | Running, climbing and fighting tire troops (yellow bar): they get slower and weaker. Marching in formation tires less; rest them before attacking |
| Sieges | Right click your own wall: infantry and archers spread along it (higher, covered from arrows). Attacking a walled city is a siege: infantry climbs with ladders (slow and exposed) or rams break the gate |
| Guard mode | With soldiers selected: **G** (or "🛡 Guard mode"): they hold position and formation and do not chase. Archers without guard mode back away from melee (skirmish) |
| How to win | Take enemy capitals (Town Centers): the last empire or alliance standing wins · or hold the **Sacred Hill** (central summit) for 5 minutes from the Medieval Age · or have the most **Glory** when time is up |
| Fog of war | You only see what your troops, buildings and allies see (the teacher can turn it off when creating the game) |
| Morale and flanks (Attila style) | Soldiers lose morale when hit (more from the side or behind) and when allies fall nearby; at 0 they **rout** 🏳 (run home, ignore orders) and rally once safe. Melee from the side deals ×1.25, from behind ×1.5. The **Battering Ram** only attacks buildings |
| Rally point | With a building selected: right click on the map (on a resource: new workers go gather there) |
| Build | With workers: **Q E R T F G Z X C V B N M Y U I O P** in the order of the buttons (more buildings appear with each age; your people's unique building appears in the Medieval Age; Shift: place several) |
| Wall | Choose **Wall**, **click where it starts and click where it ends** (or drag): one order builds the whole line; workers move on from one section to the next. A **Gate** placed on your own wall replaces that section |
| Train / research | With a building: the same keys, in the order of the buttons (units, technologies, advancing era) · click an item in the queue to cancel it (refunds the cost) |
| Army guide | **📖 Army** in the top bar: your units by age, what they beat, what beats them, upgrades and your people's abilities |
| Market | Medieval Age building: buy or sell 100 food, wood or stone for metal |
| Advance age | Select the Town Center (**H**, the "⌂ Town Center" button, or click your faction/age in the top bar) and press **"Advance to the … Age"** (★). It needs a finished Barracks, then a Tech Center, then a Factory |
| Delete | **Delete** key (an unfinished foundation refunds what is left to build) |
| Camera | WASD or arrows · middle-button drag · minimap |
| Zoom | Mouse wheel |
| Town Center | H |
| Next idle worker | `.` (period) |
| Cancel (selection or placement) | Esc |

## Development

```bash
npm run dev        # server (restarts on save) + client with hot reload at http://localhost:5173
npm test           # automated tests
npm run typecheck  # type checking
npm run art        # rebuild the unit art in client/public/art (downloads what it needs)
```

### Unit art

Units are drawn with sprite sheets built by `tools/art/build.mjs` from open projects:

- [Universal LPC Spritesheet Character Generator](https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator)
  (soldiers and workers: body, clothes, helmets, shields, weapons and tools per people),
- [[LPC] Horses](https://opengameart.org/content/lpc-horses) and
  [[LPC] Horse Riding](https://opengameart.org/content/lpc-horse-riding-updated-091) (cavalry),
- [[LPC] Siege Weapons](https://opengameart.org/content/lpc-siege-weapons) (scorpion and artillery),
- [0 A.D.](https://play0ad.com) by Wildfire Games (fortresses, towers and walls of each people, the battering
  ram, the Gaulish war chariot and the Mongol traction trebuchet: 3D models
  rendered to isometric pictures by our own renderer, `tools/art/raster.mjs`),
- [Unknown Horizons](https://unknown-horizons.org) (buildings and trees: each people has its own building
  style in each age — e.g. the Romans go from timber-framed to stone, the Mongols live in tents until
  the Industrial Age — so buildings change look when you advance, as in Age of Empires).

Each people's look is described in `tools/art/recipes.mjs`. The build writes the sheets,
`units.json` (animations, directions, team-color cut-outs) and `credits.json` (authors,
licenses, links). A test (`server/test/art.test.ts`) fails if an image has no credits or
if its license is not compatible with all its pieces. The combined images are shared under
CC-BY-SA 4.0 (see `client/public/art/LICENSE.txt`). What has no art yet (modern-era units,
trebuchet, war chariot, archery range, walls, the unique buildings and the Mongol Town Center)
keeps the drawn shapes.

## Architecture

```
shared/    Shared by client and server: game data and factions (data.ts),
           real stats per faction (stats.ts) and message protocol (protocol.ts)
server/    Authoritative server (Node.js + ws)
  src/sim/   Simulation with no networking: map, pathfinding, movement, gathering,
             construction, production and combat
  src/lobby/ Rooms: code, students, teacher, reconnection
  src/net/   HTTP + WebSocket and sync by changes (sync.ts)
  test/      Tests (Vitest)
client/    Browser (TypeScript + Canvas 2D, isometric view)
  public/art/  Unit sprite sheets, manifest and credits (generated)
tools/art/ Builds the unit art from open-licensed sources
```

Key rules:

1. **The server decides everything.** The client only sends intentions ("move these
   units here", "gather this tree"). The server checks that the units belong to the
   sender, simulates 10 steps per second and sends each player the state.
2. **Balance lives in tables** (`shared/data.ts`): costs, speeds, amounts.
3. **Everything that matters has a test** (`npm test`).
