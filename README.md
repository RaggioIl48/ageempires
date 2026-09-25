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
| Contextual order | Right click: ground = move · resource = gather · enemy = attack (only ranged units can hit airplanes) · foundation or damaged building = build/repair · own farm = farm it |
| Rally point | With a building selected: right click on the map (on a resource: new workers go gather there) |
| Build | With workers: **Q E R T F G Z X C V B N M** in the order of the buttons (more buildings appear with each age; your people's unique building appears in the Medieval Age; Shift: place several) |
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
- [[LPC] Siege Weapons](https://opengameart.org/content/lpc-siege-weapons) (scorpion and artillery).

Each people's look is described in `tools/art/recipes.mjs`. The build writes the sheets,
`units.json` (animations, directions, team-color cut-outs) and `credits.json` (authors,
licenses, links). A test (`server/test/art.test.ts`) fails if an image has no credits or
if its license is not compatible with all its pieces. The combined images are shared under
CC-BY-SA 4.0 (see `client/public/art/LICENSE.txt`). Units without art yet (modern era,
trebuchet, war chariot) keep the drawn shapes.

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
