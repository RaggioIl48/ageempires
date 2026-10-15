# 3D soldiers from 0 A.D. (8 directions, real animations)

How the game turns 0 A.D.'s animated 3D soldiers into 8-direction sprite sheets, how to add a unit,
and what was evaluated on the way. Code: `tools/art/soldiers.mjs` (recipes and pipeline),
`tools/art/skin.mjs` (skeleton and animation), `tools/art/quantize.mjs` (256 colours).

## Why this path

| Option | Result |
|---|---|
| LPC pixel art (what most units use) | Only 4 directions exist in the source; chibi proportions. |
| AI-generated sheets | Tried (see `SPRITES_EXTERNOS.md`): inconsistent character, fake directions, no real cycles, unclear licence. |
| Free low-poly packs (e.g. KayKit Adventurers, CC0, glTF) | Real animations and Blender reads them, but cartoon fantasy look: does not fit Romans/Gauls. |
| Blender rendering 0 A.D. models | Blender 5.x (installed: 5.2) **no longer imports COLLADA**, 0 A.D.'s format. Would need Blender 4.x or a converter. |
| **0 A.D. models, skinned and drawn in Node** ✅ | Historical gear per people, artist-made animations, player-colour areas built in, same look and light as the 0 A.D. buildings already in the game, open licence (CC-BY-SA 3.0), no external program. |

## Pipeline

1. **Resolve the actor** (`resolve`): the 0 A.D. actor XML gives the body mesh, textures and props
   (head, helmet, weapon, shield, cape…) per variant group. The recipe can pick variants by name
   (`choose`); otherwise the most frequent one. Animations are collected from the body only, names
   lower-cased; the chosen base stance wins over other variants (death, formations…).
2. **Pose** (`skin.mjs`): the COLLADA skin (joints, inverse bind matrices, per-vertex weights) and the
   animation (one local matrix per bone per sample, 24 per second) give the mesh in any pose:
   `v' = Σ w · (World_j(t) · InvBind_j · BindShape) · v`. The skeleton root keeps its rest position, so the
   soldier walks in place (the game moves the unit). Props follow their `prop-…` bone; props with their
   own skin (capes) are skinned with the same bones.
3. **Draw** (`raster.mjs`): 8 views (model front is −y, turned `(row+1)·45°`, same as the vehicles), feet at a
   fixed point, scale from the figure height (`FIGURE_PX` = 84 px in the sheet, `GAME_SCALE` = 0.4 → ~34 px in
   the world, like LPC soldiers). Material `player`: texture alpha < 1 marks the player colour → team mask.
4. **Pack** (`pack.mjs` + `quantize.mjs`): `oga8` sheet, 256-colour PNG (~600 KB). The attack impact frame comes
   from the animation's `event` (0.5 → frame 4 of 8).

## Adding a unit

1. Find the actor in 0 A.D. (`binaries/data/mods/public/art/actors/units/<civ>/`, pinned commit in `zeroad.mjs`).
2. Check it: `node tools/art/soldiers.mjs --probe units/<civ>/<actor>.xml` → animations, props and how much of
   each piece carries the player colour (needs to be > 0 somewhere; the art test enforces it).
3. Add a recipe in `SOLDIERS`: `'<faction>-<type>-3d': foot('<faction>/<type>', '<civ>/<actor>', { attack, choose })`
   (`attack: 'attack_ranged'` for javelins, slings, bows).
4. `node tools/art/soldiers.mjs <id>` (≈20 s), check it in `/preview.html?unit=<faction>/<type>`, run `npm test`.

## Which 0 A.D. gear each people uses

Romans and Gauls use their own 0 A.D. soldiers. The other five peoples do not exist in 0 A.D., so each
borrows the closest gear from another civilisation, chosen so that every people still looks different.
These are approximations and can be changed in `SOLDIERS` (one line per unit).

| People | Source in 0 A.D. | Why |
|---|---|---|
| Germans | Britons (+ one Gaul swordsman) | Northern Celtic look: trousers, oval shields, javelins |
| Visigoths | Iberians (+ Carthaginian elite archer) | They settled in Hispania |
| Ostrogoths | Seleucids (+ Thracian for the warband) | Heavy late-antique infantry, pikes for the heavy spearman |
| Vikings | Athenians, Spartans (huscarl), Gaul and Iberian warriors (berserker, ulfhednar) | Round shields, spears, helmets |
| Mongols | Han and Persians | Their armies absorbed Chinese and Persian infantry |

"Archer" is a javelin thrower or slinger where 0 A.D. has no archer for that source (Romans, Gauls,
Germans, Visigoths).

## Suggested next steps

- **Cavalry (done 2026-10-15)**: the horse actor (`…_m`) is the body; the rider (`…_r`) is a skinned prop with
  its own skeleton and animations, posed at the same phase and mounted on the horse's `prop_rider` bone
  (`posedParts`, `loadRiderClips`). Scale comes from an infantry reference (`scaleFrom`) so riders and foot
  soldiers match. Rider capes are skipped (the rider clips do not move their bones). Coat colour per people.
- **Still LPC (4 directions)**: workers, the Gaul naked fanatic (no 0 A.D. model) and the Industrial/Modern units.
- **Workers**: 0 A.D. citizens have gather/build animations (`gather_tree`, `build`…) matching the game's
  `chop`/`farm`/`mine`/`build`.
- **Weight**: 40 sheets, ~21.7 MB in total (~550 KB each), loaded only when the unit appears;
  `FIGURE_PX` 72 would save ~25 %, WebP ~40 %. Drawing cost: see `FLUIDEZ_Y_RENDIMIENTO.md`.
