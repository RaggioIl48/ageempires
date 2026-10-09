# Test plan — Classroom Empires (2026-10-08)

How the game is tested, what each layer covers, the targets, and the known gaps.
Run everything with `npm test` (Vitest, ~30 s). 36 files, 332 tests.

## The pyramid

```
            Manual in the browser pane            few, slow: look and feel, click-by-click
          ─────────────────────────────────
         Network / end-to-end (real server)       net.test, static.test
       ───────────────────────────────────────
      Integration (game, lobby, sync, AI)          lobby, sync, war, ai, lessons, history…
   ─────────────────────────────────────────────
  Unit (pure rules and client helpers)             counters, smooth, fog, formation, pathfinding…
```

Most value comes from the middle: a `Game` or `Room` built in memory (helpers `flatGame`, `newGame`, a fake
connection) run for N steps, then the state is checked. No browser is needed for the client logic either:
`ClientState`, `Camera`, `motion`, `particles`, `fogmap`, `perf` and `report` are pure TypeScript.

## What to test, by area

| Area | Type | Files | Target |
|---|---|---|---|
| Combat rules (damage, weapons, flanks, charge, brace, elevation, fatigue, morale) | Unit + small simulated battles | `counters`, `tactics`, `tactical2`, `morale`, `hills`, `eras` | Every rule has a number check **and** a battle of similar cost with a clear winner |
| Movement, formations, spacing, pathfinding | Integration | `formation`, `spacing`, `pathfinding`, `stances` | No unit overlaps or gets stuck; lines keep their spots |
| Economy, crews, building, eras, techs | Integration | `phase2`, `crews`, `units`, `eras`, `progression` | A full economic run reaches each age |
| Diplomacy, war, sieges, victory | Integration | `diplomacy`, `war`, `victory`, `general` | Every message to players is in English |
| Computer rival | Integration (whole games) | `ai` | Builds an economy, counters what it sees, Normal beats Easy |
| Lobby, teacher, reconnection, quiz | Integration (fake connections) | `lobby`, `lessons`, `ai` | Every teacher action and every student path |
| Network: sync, deltas, flooding, big messages | End-to-end (real WebSocket server) | `net`, `sync`, `protocol` | 16 students fit in the bandwidth budget; bad input never crashes |
| Client smoothness (turning, dust cap, fog, zoom, instant orders, meter) | Unit | `smooth`, `facing` | Pure functions: no flicker, caps respected, fog pixels exact |
| Performance budget | Benchmark with a wide margin | `perf` | 800 units: average step < 40 ms in tests (≈ 6–8 ms on the dev laptop) |
| Art and licenses | Static checks | `art` | Every sheet credited and openly licensed; every soldier shows the player colour in every animation |
| Game report and history | Unit + integration | `history` | Snapshots every 30 s; betrayals in the chronicle; talking points |

## Example cases (the style to follow)

- **Rule + battle:** "spears crush cavalry" checks the damage numbers, then 8 spearmen fight 4 knights
  of similar cost and the spearmen must win by a margin (`counters.test.ts`).
- **Regression found by a test:** the smoothness meter ignored a clock that started at 0 (`smooth.test.ts`);
  the Roman spearman lost the player colour under its chain mail (`art.test.ts`).
- **Timing-sensitive tests wait for a condition**, never a fixed sleep (the flooding test polls until messages stop).

## Manual checks in the browser (before each release)

Use the scratchpad sandboxes (big battle, quiz, Medieval army) with a temporary `.claude/launch.json`
entry, then:

1. Press **F3**: the meter must say *Smooth* on the dev laptop with 400 units (≈ 2 ms per frame to draw).
2. Zoom with the wheel: it glides to the cursor.
3. Right-click with a group: they turn at once toward the click.
4. Charge with cavalry: dust under the horses, dust burst on impact.
5. Archers and cannons shoot: the projectile casts a shadow on the ground and arcs higher when the target is far.
6. End the game: the report opens in front of everything, with charts and chronicle.

## Gaps (what is not covered yet) and next steps

1. **Pixels on screen**: there are no visual regression tests (screenshots compared automatically).
   Option: Playwright with a fixed scene and a tolerance. Worth it once the art settles.
2. **Rendering cost** is only measured by hand (F3 meter). Option: a scripted browser run that reads the
   meter and fails above 8 ms per frame.
3. **Long games**: no test plays 60 minutes with 16 players (memory growth, history size).
   Option: a nightly script with 16 computer rivals.
4. **Mobile/tablet input** is not tested.
5. **Accessibility** of panels (keyboard, contrast) is not tested.
6. Flaky-by-load tests: keep timing tests polling for a condition; keep benchmark margins wide.
