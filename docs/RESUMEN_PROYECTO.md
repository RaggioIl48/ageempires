# Classroom Empires — project summary (2026-10-10)

A single reference document: what the game is, how it's built, what's known to be broken or
limited, and what the realistic next steps are — especially for better unit animation, which is
the user's current priority. Written so nothing from the project's history gets lost.

---

## 1. What it is

A browser real-time strategy game (Age of Empires II / Total War style) built from scratch for a
classroom of up to 16 students on one teacher-run server. Not a fork of any existing game; an
original TypeScript project with its own names, rules and open-licensed art.

- **4 ages**: Tribal → Medieval → Industrial → Modern (WWII-flavored, deliberately hard to reach).
- **7 historical peoples** (Romans, Mongols, Gauls, Germans, Visigoths, Ostrogoths, Vikings), each
  with 3 unique Medieval units, a unique building, asymmetric strengths/weaknesses, and its own
  look (not just a color swap).
- **4 resources** (food, wood, stone, metal), worker crews with a delivery bonus, specialized
  fields (farm/quarry/mine/woodlot), a market.
- **Diplomacy**: alliances, war, peace, teams, with a betrayal mechanic that shows up in the
  end-of-game chronicle.
- **Total War–style battles**: formations, flanks, morale and rout, fatigue, hills (elevation
  damage), siege (ladders, rams, siege towers, walls/gates/towers from the Tribal Age), a General
  hero with abilities, a Sacred Hill win condition alongside conquest and a time-limit/Glory score.
- **Fog of war**: the whole map is visible at all times; what your troops don't currently see is
  only darkened (not hidden terrain) — a deliberate compromise described in §4.
- **Computer opponent** (Easy/Normal): plays by the same rules as a student, counters what it
  sees, attacks in waves.
- **Education layer**: "Who were they?" history cards per people, history notes per unique unit,
  multiple-choice questions (built-in or the teacher's own) gating each age advance, and an
  end-of-game report (charts + chronicle + talking points) meant to be discussed in class.
- **Live at** https://imperios-del-aula.onrender.com (Render free tier, auto-deploys from
  `main` on GitHub: `RaggioIl48/ageempires`).

---

## 2. How it's built

### Stack
- **TypeScript** everywhere (server, client, shared rules), **Node 22**, **`ws`** for WebSockets,
  **Vite** for the client build, **Vitest** for tests, **tsx** to run TS directly in dev.
- No game framework (no Phaser/PixiJS/Three.js): the client draws on a single `<canvas>` with
  hand-written isometric 2D math. No build pipeline beyond Vite; the 3D-looking pieces (vehicles,
  guns, siege engines) are rendered **offline, once, to flat PNG sprite sheets** by a custom
  Node-based tool — there is no 3D engine at runtime.

### Server (`server/src`, ~6,050 lines)
- `sim/` — the simulation: `world.ts` (state container, ~690 lines, the largest file),
  `game.ts` (command queue + the per-tick `step()` pipeline), `combat.ts`, `movement.ts`,
  `morale.ts`, `fatigue.ts`, `vision.ts`, `victory.ts`, `siege.ts`, `war.ts` (sieges/battles),
  `diplomacy.ts`, `pathfinding.ts` (A* with a tie-break heuristic and a step cap),
  `history.ts` (end-of-game snapshots/chronicle), `ai.ts` (the computer rival, ~360 lines).
- `lobby/` — `room.ts` (~490 lines: membership, start/pause/end, quiz flow, AI players),
  `lobby.ts` (routes client messages by role), `conn.ts`.
- `net/` — `sync.ts` (delta encoding per client), `server.ts` (WebSocket wiring, rate limiting,
  message-size cap).
- Authoritative: the server is the only source of truth; clients send intents (`Command`), never
  state. All state lives **in memory** — see limitation in §4.

### Client (`client/src`, ~7,400 lines)
- `render.ts` (822 lines) — the draw loop: terrain, fog, units, buildings, effects, particles.
- `sprites.ts` (1,801 lines, by far the largest file) — procedural shape-drawn fallback art
  (used when no sprite sheet exists) plus unit look tables.
- `art.ts` (456 lines) — loads sprite-sheet manifests, picks animation frames/direction rows,
  applies the player-color tint mask.
- `state.ts` (504 lines) — client-side game state, interpolation, vision/fog computation.
- `input.ts` (764 lines) — selection, orders, drag formations, camera controls.
- `hud.ts` (703 lines) — the UI chrome (resource bar, army bar, build/train menus).
- `screens.ts`, `guide.ts`, `report.ts`, `war.ts`, `diplomacy.ts`, `minimap.ts`, `view.ts`
  (camera/projection math), `motion.ts`, `particles.ts`, `fogmap.ts`, `perf.ts` (new,
  Oct 2026: smoothness tooling — see the perf summary below).

### Shared (`shared`, ~2,950 lines)
- `data.ts` — every number in the game (units, buildings, techs, factions, costs) in one place;
  changing a number here changes server and client at once.
- `protocol.ts` — the wire format (`Command`, `ServerMessage`, deltas), with runtime validation
  of anything a client sends (never trust the network).
- `stats.ts`, `counters.ts`, `terrain.ts`, `formation.ts`, `vision.ts`, `codec.ts` (compact
  tuple encoding for units/buildings/events), `lessons.ts` (history cards, quiz bank).

### Art pipeline (`tools/art`, ~3,080 lines of Node scripts, run offline via `npm run art`)
Three different generation paths feed into one manifest (`client/public/art/units.json`,
`buildings.json`) of flat PNG sprite sheets with team-color alpha masks:
1. **LPC (Liberated Pixel Cup)** composer (`lpc.mjs`, `compose.mjs`, `raster.mjs`) — layers
   open-licensed pixel-art body parts (armor, helmets, weapons, shields, horses) per recipe
   (`recipes.mjs`) into **4-direction** walk/attack/idle/die sheets. This covers almost all
   infantry, cavalry, and workers (78 of 88 unit sheets).
2. **0 A.D. asset renderer** (`collada.mjs`, `dds.mjs`, `xml.mjs`, `zeroad.mjs`) — a **from-scratch
   software renderer** (no Blender, no GPU) that parses 0 A.D.'s Collada models and DDS textures
   and rasterizes them to **8-direction** sheets. Used for buildings, walls, fortresses, and some
   vehicles/siege engines.
3. **Procedural 3D-ish models** (`guns.mjs`, `models.mjs`, `raster.mjs`) — hand-built low-poly
   geometry (cannons, machine guns, tanks) rendered the same way, with crews, recoil, muzzle
   flash and smoke baked into the frames.
- `licenses.mjs` enforces that every published sheet only combines openly-licensed sources
  (CC0/CC-BY/OGA-BY/CC-BY-SA/GPL) and `server/test/art.test.ts` checks this automatically, plus
  that every soldier shows the player color in every animation.
- Total art weight: **26 MB** (23 MB units + 2.9 MB buildings), loaded lazily per-sheet as units
  appear on screen (not all at once).

### Tests
36 files, **332 tests** (`npm test`, Vitest, ~20 s). See `docs/TEST_PLAN.md` for the full
breakdown (pyramid, what each area covers, manual browser checklist, and gaps). Short version:
rules and small simulated battles are unit-tested with real numeric assertions; integration tests
build a `Game`/`Room` in memory and run it for N ticks; network tests spin up a real WebSocket
server; client logic (camera, fog math, particles, turning) is pure TypeScript and unit-tested
without a browser.

---

## 3. Known errors and bugs (fixed, and what's still open)

### Fixed, worth remembering because they could recur
- **Server crash on oversized messages** (>16 KB) — was critical (would take down the class);
  now capped and rejected.
- **Map generation could enclose resources** (berries/stone/metal unreachable) — generation now
  validates access before accepting a map.
- **A destroyed-while-under-construction building survived** because its own builders "healed"
  it mid-demolition.
- **A unit could walk through a building** placed on its current path (only checked at order
  time, not every step).
- **Rally point on a resource didn't send new workers to gather** there.
- **LPC art pieces with a space in their default variant name** (`"kite gray"`, `"dark gray"`)
  were silently skipped by the composer — a path-matching bug, not a licensing one.
- **Two units on the exact same spot didn't separate** (a zero-distance edge case in the
  avoidance code).
- **The fog veil cost ~80 ms per repaint**, 6×/second, dominating frame time — rewritten in
  Oct 2026 as a precomputed per-pixel tile index (§ perf below); this was the single biggest
  performance bug in the project's history.
- **A test depending on wall-clock timing flaked under load** (flood-control test) — rewritten
  to poll for completion instead of sleeping a fixed amount.
- **PowerShell `Get-Content`/`Set-Content` corrupts accented characters** — not a code bug, but
  a documented operational constraint: never use PS 5.1 to rewrite files in this repo.

### Open / known limitations right now
- **A unit type doesn't convert into its next-age equivalent when an age advances** — e.g. an
  existing `warrior` (Tribal Age) stays a `warrior` forever; it isn't replaced by `spearman`
  once the Medieval Age starts, it just stops being trainable (the build menu swaps to the new
  type). Stat techs (`unitMods`, e.g. Man-at-Arms) still apply live to existing units of a type
  regardless of age, since stats are computed per-player/per-type on lookup, not baked in at
  spawn — only the *type itself* doesn't migrate. This line in `docs/PROGRESO.md` "Known limits"
  predates that stat-memoization work and should be read narrowly as above.
- **No save/resume**: all game state is in server memory; a restart or redeploy loses every game
  in progress. This is the top reliability risk for a live classroom session.
- **Render's free tier** gives ~0.1 CPU and sleeps on inactivity — the most likely cause of the
  slowness the user has reported, separate from any client-side rendering cost (see §5).
- **No order queue (Shift-click), no attack-move, no patrol/garrison** — present in both AoE II
  and Total War, absent here.
- **No sound** at all.
- **No save-game export for the teacher**, no replay.
- One AI-generated reference sprite sheet the user supplied (a Mongol horse archer) could **not**
  be integrated directly — documented in detail in §4 as it's directly relevant to "better
  animations."

---

## 4. Animation: what's limiting it today, concretely

This is the user's stated priority, so it gets its own section with specifics, not generalities.

### The core constraint: two incompatible art pipelines
- **LPC pieces (most units) only exist as 4-direction sheets.** The Liberated Pixel Cup asset
  set this project draws from was built for 4-direction RPG sprites (N/S/E/W), not 8. There is
  no clean way to get diagonal LPC frames without hand-drawing them — the source assets simply
  don't have them. This is why infantry/cavalry turn more coarsely than vehicles/siege/buildings,
  which come from the 0 A.D./procedural pipeline and do have 8 directions.
- Oct 2026 added **gradual turning** (units rotate toward a new facing at a fixed rate instead of
  snapping) and **sticky direction rows** (a dead zone at the boundary between two sprite rows so
  diagonal walking doesn't flicker between two images). This hides the 4-direction limitation
  reasonably well at normal zoom but doesn't remove it — it's still visibly a 4-way sprite at
  high zoom or on a large screen.
- Attack animations **loop on a fixed FPS, not synced to the actual hit**: the swing plays at
  `ATTACK_FPS` regardless of the unit's real attack cooldown, so a fast attacker's swing can look
  disconnected from when the damage event actually lands. This was flagged as a real gap, not yet
  fixed.

### Why AI-generated sprite sheets didn't work (tried once, documented for next time)
The user supplied an AI-generated Mongol horse-archer sheet. Specific, reproducible problems:
1. **Wrong/duplicate direction labels** — most frames faced right regardless of label; only ~2 of
   8 claimed directions were actually distinct.
2. **Not a real walk cycle** — the 4 "walk" frames were near-identical with randomly shifting
   horse legs; animated, it would read as trembling, not walking.
3. **Character drift frame-to-frame** — the bow switched hands, the quiver appeared/disappeared,
   plume details changed. Any AI image tool that doesn't hold a fixed seed/reference per frame
   will do this; it breaks cleanly-tileable animation.
4. **Fake transparency** — a checkerboard pattern was drawn *into* the JPEG pixels (JPEG can't be
   transparent), and that checkerboard was close in color to the armor, making automated
   background removal unreliable.
5. **A baked-in drop shadow** and **no player-color-swappable region** (no solid-magenta or
   similar masked area) — both are required by this project's pipeline (`T()`/team-mask parts in
   `recipes.mjs`, `tintOf()` in `art.ts`).
- **Conclusion carried forward**: AI image generation is usable today for static art (portraits,
  icons, flags, building concept art to redraw) but not for animated 8-direction sprite sheets
  with consistent character identity — the 0 A.D./LPC pipelines remain the reliable path for
  animated units.

### What would actually move the needle on animation quality
In priority order, matched to effort:
1. **Give the LPC-based units more frames on their existing 4 directions** (e.g. richer idle
   sway, a wind-up frame before attack) — cheap, works with the current asset set, doesn't
   require new art sources.
2. **Sync attack animation timing to the real cooldown/hit event** — a code change in
   `client/src/art.ts` (`animName`/frame selection), no new art needed.
3. **Move more unit types onto the 0 A.D./procedural 8-direction pipeline**, the way vehicles and
   siege already are — this is the only path to real 8-direction infantry, and it's exactly the
   "0 A.D. animated soldiers rendered as images" option already scoped in earlier planning: it
   reuses the existing renderer (`collada.mjs`/`zeroad.mjs`), just pointed at 0 A.D.'s human unit
   models instead of only vehicles/buildings. Medium-high effort because the renderer's skeletal
   animation support would need to be taught to drive a walk/attack/death cycle, not just a
   static pose.
4. **Professional art packs or a 3D re-platform** remain available but cost money (packs) or are
   a large rewrite (true 3D) — listed for completeness, not recommended while the project is
   still in free-tier development.

---

## 5. Performance: current state and what's been done

Two completely separate cost centers were conflated in earlier user reports of "the game runs
slow" — now they're measurable and distinguishable in-game.

### Server (simulation)
- A full `game.step()` with **800 units fighting**: **~6–8 ms** on the dev machine (budget is
  100 ms per tick; comfortable headroom). Got here via an array-based spatial grid (was a
  generator with per-call allocation), per-player stat memoization, and staggered per-unit
  morale/danger checks instead of every-unit-every-tick.
- **Render's free plan** (~0.1 CPU, sleeps when idle) is flagged as the most likely external
  cause of reported slowness — separate from anything fixable in this codebase.

### Client (drawing)
- The single biggest fix: **the fog-of-war veil was being repainted as thousands of vector
  polygons** ~6 times a second, costing ~10.5 of ~11.9 ms of every frame. Replaced with a
  **precomputed per-pixel "which tile (with its hill) is under this fog pixel" index**, built
  once per map; an update now just writes alpha values into a typed array and blits one image.
  Frame draw time with a 400-unit battle: **11.9 ms → 1.9 ms**.
- Minimap: was issuing one `fillRect` per unit even when 50 units shared a pixel; now
  deduplicates per pixel per owner before drawing (270 → 27 draw calls/frame in the same test).
- Health/morale/stamina bars now only draw where they're informative (always for the current
  selection; health only if wounded, morale only if wavering, stamina only if exhausted for
  everything else; just the selection when zoomed far out) — fewer draw calls in big battles.
- A capped particle pool (240 puffs max, 5 new dust emissions/frame) for the new dust/smoke
  effects so a huge battle can't runaway-allocate.

### New: a user-facing smoothness meter
A small ping indicator is always visible top-right; **F3** (or clicking it) expands it to show
fps, draw ms, ping, and the server's own step time, plus a plain-language verdict distinguishing
"slow connection," "server overloaded," or "this computer is struggling." This exists specifically
so slowness reports can be diagnosed instead of guessed at — **use it the next time the game feels
slow and report what it says.**

---

## 6. What's genuinely missing (gaps, not bugs)

Things that exist in AoE II and/or Total War that this project does not have, beyond animation:
- Save/resume games (top risk — see §3).
- Order queueing (Shift-click), attack-move, patrol, garrison.
- Sound (zero audio in the game today).
- Replay / match recording beyond the end-of-game chronicle.
- A dedicated low-cost "always-on" server option has been discussed (teacher's spare laptop +
  Tailscale Funnel or a cheap VPS) but not implemented — still just a recommendation.
- Visual regression testing (no automated screenshot diffing yet — see `docs/TEST_PLAN.md` gaps).
- Mobile/touch input and accessibility are untested.

---

## 7. Where to look next in the repo

- `docs/PROGRESO.md` — full chronological build log, phase by phase, with every audit table.
- `docs/TEST_PLAN.md` — the testing pyramid, per-area coverage targets, manual QA checklist.
- `docs/ANALISIS.md` — the original AoE II/Total War feature-gap analysis (some items now done).
- `docs/HOJA_DE_RUTA.md` — the phase roadmap.
- `shared/data.ts` — single source of truth for every game number; start here for any balance change.
- `tools/art/recipes.mjs` — where a new unit's look is defined before running `npm run art`.
