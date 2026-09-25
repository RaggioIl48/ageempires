// Edificios con imágenes de Unknown Horizons (juego de estrategia isométrico libre,
// gráficos CC-BY-SA 3.0). Su casilla mide 64×32 como la nuestra.
//
// Cada pueblo usa un estilo de construcción:
//   stone  = casas de piedra        (romanos)
//   timber = entramado de madera    (visigodos, ostrogodos)
//   wood   = madera y techos de paja/pasto (galos, germanos, vikingos)
//   tent   = tiendas                (mongoles)
// Lo que no tiene imagen adecuada (campo de tiro, murallas, edificios únicos, el
// centro mongol) se sigue dibujando con formas.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Img } from './img.mjs';

export const UH_REPO = 'https://github.com/unknown-horizons/unknown-horizons';
export const UH_COMMIT = 'af9c8ef5c7f6cf9ec0b8c9e7d172c555f2793615';
const RAW = `https://raw.githubusercontent.com/unknown-horizons/unknown-horizons/${UH_COMMIT}/`;

export const STYLES = {
  romans: 'stone',
  visigoths: 'timber',
  ostrogoths: 'timber',
  gauls: 'wood',
  germans: 'wood',
  vikings: 'wood',
  mongols: 'tent',
};

/** Imágenes usadas: carpeta de Unknown Horizons, vista (acción) y tamaño de su base en casillas. */
const SPRITES = {
  'tc-stone': ['buildings/citizens/warehouse/as_warehouse_citizens0', 'idle', 3],
  'tc-timber': ['buildings/settlers/warehouse/as_warehouse_settler0', 'idle', 3],
  'tc-wood': ['buildings/pioneers/warehouse/as_warehouse_pioneers0', 'idle', 3],
  'house-stone-0': ['buildings/citizens/residential/as_stonehouse0', 'idle', 2],
  'house-stone-1': ['buildings/citizens/residential/as_stonehouse1', 'idle', 2],
  'house-stone-2': ['buildings/citizens/residential/as_stonehouse2', 'idle', 2],
  'house-stone-3': ['buildings/citizens/residential/as_stonehouse3', 'idle', 2],
  'house-timber-0': ['buildings/settlers/residential/as_house0', 'idle', 2],
  'house-timber-1': ['buildings/settlers/residential/as_house1', 'idle', 2],
  'house-timber-2': ['buildings/settlers/residential/as_house2', 'idle', 2],
  'house-wood-0': ['buildings/pioneers/residential/as_hut0', 'idle', 2],
  'house-wood-1': ['buildings/pioneers/residential/as_hut1', 'idle', 2],
  'house-wood-2': ['buildings/pioneers/residential/as_hut2', 'idle', 2],
  'house-tent-0': ['buildings/sailors/residential/as_tent0', 'idle', 2],
  'house-tent-1': ['buildings/sailors/residential/as_tent1', 'idle', 2],
  'house-tent-2': ['buildings/sailors/residential/as_tent2', 'idle', 2],
  'house-tent-3': ['buildings/sailors/residential/as_tent3', 'idle', 2],
  'store-shed': ['buildings/pioneers/storagetent/as_storagetent1', 'idle', 2],
  'store-wood': ['buildings/pioneers/lumberjack_barrack/as_lumberjack_barrack0', 'idle', 2],
  'store-tent': ['buildings/sailors/storagetent/as_storagetent0', 'idle', 2],
  farm: ['buildings/pioneers/agricultural/as_potatofield0', 'idle', 3],
  'farm-ripe': ['buildings/pioneers/agricultural/as_potatofield0', 'idle_full', 3],
  quarry: ['buildings/citizens/as_stone_pit0', 'idle', 3],
  mine: ['buildings/pioneers/clay_pit/as_clay_pit0', 'idle', 3],
  barracks: ['buildings/settlers/barracks/as_barracks0', 'idle', 3],
  stable: ['buildings/pioneers/farm/as_farm0', 'idle', 3],
  tech: ['buildings/pioneers/school/as_school0', 'idle', 2],
  tower: ['buildings/pioneers/tower_wooden/as_woodentower0', 'idle', 2],
  market: ['buildings/sailors/warehouse/as_warehouse0', 'idle', 3],
  workshop: ['buildings/citizens/as_cannonfoundry', 'idle', 3],
  factory: ['buildings/settlers/smeltery/as_smeltery0', 'idle', 4],
};

/** Qué imagen usa cada edificio según el estilo ('*' = todos los estilos). Varias = variantes. */
const MAP = {
  'stone/town_center': ['tc-stone'],
  'timber/town_center': ['tc-timber'],
  'wood/town_center': ['tc-wood'],
  'stone/house': ['house-stone-0', 'house-stone-1', 'house-stone-2', 'house-stone-3'],
  'timber/house': ['house-timber-0', 'house-timber-1', 'house-timber-2'],
  'wood/house': ['house-wood-0', 'house-wood-1', 'house-wood-2'],
  'tent/house': ['house-tent-0', 'house-tent-1', 'house-tent-2', 'house-tent-3'],
  'stone/storehouse': ['store-shed'],
  'timber/storehouse': ['store-shed'],
  'wood/storehouse': ['store-wood'],
  'tent/storehouse': ['store-tent'],
  '*/farm': ['farm'],
  '*/quarry': ['quarry'],
  '*/mine': ['mine'],
  '*/barracks': ['barracks'],
  '*/stable': ['stable'],
  '*/tech_center': ['tech'],
  '*/tower': ['tower'],
  '*/market': ['market'],
  '*/workshop': ['workshop'],
  '*/factory': ['factory'],
};

export const UH_CREDITS = {
  'uh:graphics': {
    pack: 'uh',
    title: 'Unknown Horizons buildings',
    authors: [
      'Unknown Horizons team',
      'Clearskies (Anthony Nguyen)',
      'Daniel Stephens',
      'dauerflucher (Andreas Lis)',
      'egore (Christoph Brill)',
      'inken',
      'janexx (Jana Weigel)',
      'kaschte (Fabian Riedel)',
      'lmg',
      'Manthus (Matthias Dittrich)',
      'orakeldel',
      'terwarf (Alexander Breidenbroich)',
      'Viktoria S.',
      'wentam (Matt Egeler)',
    ],
    licenses: ['CC-BY-SA 3.0'],
    urls: ['https://unknown-horizons.org', `${UH_REPO}/blob/${UH_COMMIT}/doc/LICENSE`],
    notes: 'Pre-rendered isometric buildings (one view each).',
  },
  'uh:barracks-props': {
    pack: 'uh',
    title: 'Barracks yard props (in the Unknown Horizons barracks)',
    authors: ['Clement Wu', 'Botanic', 'Clint Bellanger', 'p0ss'],
    licenses: ['CC-BY-SA 3.0'],
    urls: [
      'https://opengameart.org/content/training-map',
      'https://opengameart.org/content/kingdom-weapon-set',
      'https://opengameart.org/content/training-target',
      'https://opengameart.org/content/wooden-weapon-training-set',
    ],
    notes: '"Training Map", "Kingdom Weapon Set", "Training Target" and "Wooden Weapon Training Set", as used by Unknown Horizons.',
  },
};

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 256 << 20 }).toString();
}

/** Clon parcial de Unknown Horizons: solo la lista de archivos; las imágenes se bajan una a una. */
function ensureClone(root) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', `${UH_REPO}.git`, root], { stdio: 'inherit' });
  }
  try {
    if (git(root, ['cat-file', '-t', UH_COMMIT]).trim() === 'commit') return;
  } catch {
    // falta el commit: se trae abajo
  }
  git(root, ['fetch', '--depth', '1', '--filter=blob:none', 'origin', UH_COMMIT]);
}

/**
 * Descarga y copia las imágenes a out/buildings y devuelve el manifiesto:
 * { v, styles, sprites: { id: { file, w, h, tiles } }, map, credits }.
 */
export async function buildBuildings(cache, out) {
  const root = path.join(cache, 'uh');
  ensureClone(root);
  const list = git(root, ['ls-tree', '-r', '--name-only', UH_COMMIT, 'content/gfx']).split('\n');
  const dir = path.join(out, 'buildings');
  fs.mkdirSync(dir, { recursive: true });
  const sprites = {};
  let bytes = 0;
  for (const [id, [folder, action, tiles]] of Object.entries(SPRITES)) {
    const prefix = `content/gfx/${folder}/${action}/45/`;
    const rel = list.filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort()[0];
    if (!rel) throw new Error(`Unknown Horizons: no hay imagen en ${prefix}`);
    const local = path.join(cache, 'uh-files', rel.slice('content/gfx/'.length));
    if (!fs.existsSync(local)) {
      const res = await fetch(RAW + rel);
      if (!res.ok) throw new Error(`descarga fallida (${res.status}) ${rel}`);
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    }
    const img = Img.read(local);
    const file = `buildings/${id}.png`;
    img.write(path.join(out, file));
    bytes += fs.statSync(path.join(out, file)).size;
    sprites[id] = { file, w: img.w, h: img.h, tiles };
  }
  const credits = Object.keys(UH_CREDITS);
  return { manifest: { v: 1, styles: STYLES, sprites, map: MAP, credits }, bytes };
}
