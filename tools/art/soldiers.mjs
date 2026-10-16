// Soldados de 0 A.D. animados en 8 direcciones (en lugar de las 4 de los personajes LPC).
//
// 1. Resuelve el actor de 0 A.D. (cuerpo con esqueleto, cabeza, casco, armas, escudo y sus
//    texturas) y descarga lo que falte a tools/art/.cache/0ad-files.
// 2. Pone al modelo en cada cuadro de sus animaciones REALES de 0 A.D. (reposo, paso, ataque,
//    muerte) con skin.mjs: la malla sigue a los huesos y las armas/escudo/casco a sus puntos.
// 3. Lo dibuja con raster.mjs (la misma vista isométrica 2:1 y la misma luz que los edificios
//    de 0 A.D. del juego) en las 8 direcciones, con la máscara del color del jugador que trae
//    el propio modelo (material "player": el alfa de la textura marca dónde va el color).
// 4. Empaqueta la hoja (pack.mjs) en el formato 'oga8' del juego, reducida a 256 colores
//    (quantize.mjs) para que pese ~600 KB en vez de ~2,5 MB.
//
// Uso:  npm run art                         (lo llama build.mjs, junto con el resto del arte)
//       node tools/art/soldiers.mjs [id]    (solo los soldados, o uno; actualiza units.json)
//
// Por qué no Blender: Blender 5.x ya no trae el importador COLLADA (.dae), que es el formato de
// 0 A.D.; leer el .dae y hacer el skinning acá deja el arte reproducible sin programas externos.
//
// Licencia: modelos, texturas y animaciones de 0 A.D. (Wildfire Games), CC-BY-SA 3.0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { readDds } from './dds.mjs';
import { packSheet } from './pack.mjs';
import { quantize } from './quantize.mjs';
import { IDENTITY, loadCollada, mul } from './collada.mjs';
import { loadAnimation, loadSkinned, pose, skinTris } from './skin.mjs';
import { HEIGHT_PX, cropRender, render } from './raster.mjs';
import { kid, kids, parseXml } from './xml.mjs';
import { ZEROAD_COMMIT, ZEROAD_CREDIT } from './zeroad.mjs';
import { normalizeLicenses, sheetLicense } from './licenses.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FILES = path.join(HERE, '.cache/0ad-files');
const OUT = path.join(ROOT, 'client/public/art');
const RAW = `https://raw.githubusercontent.com/0ad/0ad/${ZEROAD_COMMIT}/binaries/data/mods/public/art/`;

export const SOLDIER_CREDIT_ID = '0ad:units';
export const SOLDIER_CREDIT = {
  ...ZEROAD_CREDIT,
  pack: '0ad',
  title: '0 A.D. soldiers (models, textures and animations)',
  notes: 'Skeletal 3D models posed with their own 0 A.D. animations and drawn as 8-direction pictures with tools/art/soldiers.mjs.',
};

/** Animaciones del juego ← animaciones de 0 A.D. (reposo, paso, ataque cuerpo a cuerpo o a distancia, muerte). */
const footAnims = (attack = 'attack_melee') => ({
  idle: { from: 'idle', frames: 6, fps: 4 },
  walk: { from: 'walk', frames: 10, fps: 12 },
  // A la carrera (cargas y retiradas): el cliente la usa cuando el soldado va a toda velocidad.
  run: { from: 'run', frames: 10, fps: 15 },
  attack: { from: attack, frames: 8, fps: 12 },
  die: { from: 'death', frames: 8, fps: 10, loop: false },
});
/** Soldado a pie: unidad del juego ('pueblo/tipo'), actor de 0 A.D. y variantes elegidas. */
const foot = (unit, actor, { attack, choose = [], props, extra } = {}) => ({ units: [unit], actor: `units/${actor}.xml`, choose, props, extra, anims: footAnims(attack) });

/**
 * Arquero de un pueblo sin arqueros en 0 A.D. (romanos, galos, germanos, visigodos): la ropa y la
 * cabeza de su pueblo, con arco corto, flecha y aljaba, y la postura y el disparo de un arquero de
 * 0 A.D. (antes disparaban con el gesto de lanzar una jabalina o una honda).
 */
const ARCHER = 'units/athenians/infantry_archer_b.xml';
const BOW = {
  weapon_R: 'props/units/weapons/arrow_back.xml',
  weapon_bow: 'props/units/weapons/bow_short.xml',
  back: 'props/units/quiver_greek_back.xml',
  weapon_L: '',
  shield: '',
  shield_arm: '',
  projectile: '',
};
const archer = (unit, actor, { extra } = {}) => ({
  units: [unit],
  actor: `units/${actor}.xml`,
  choose: [],
  props: BOW,
  extra,
  anims: {
    idle: { from: 'idle', actor: ARCHER, frames: 6, fps: 4 },
    walk: { from: 'walk', actor: ARCHER, frames: 10, fps: 12 },
    run: { from: 'run', actor: ARCHER, frames: 10, fps: 15 },
    attack: { from: 'attack_ranged', actor: ARCHER, frames: 8, fps: 12 },
    die: { from: 'death', frames: 8, fps: 10, loop: false },
  },
});

/** Guerrero (Edad Tribal): tropa ligera, con hacha o maza, sin escudo ni casco (se distingue del lancero). */
const light = (weapon) => ({ weapon_R: `props/units/weapons/${weapon}.xml`, shield: '', shield_arm: '', helmet: '' });
/** Armaduras de caballo de 0 A.D.: hierro (caballeros y jinetes acorazados), bronce (General). */
const IRON = ['props/horse/cav_front_armor_iron.xml', 'props/horse/cav_back_armor_iron.xml'];
const BRONZE = ['props/horse/cav_front_armor_bronze.xml', 'props/horse/cav_back_armor_bronze.xml'];
/** (La de catafracto de 0 A.D. queda mal ubicada en este render: no se usa por ahora.) */

/**
 * Recetas: actor de 0 A.D. para cada unidad del juego, variantes elegidas (escudo, armadura)
 * y qué animación de 0 A.D. va en cada animación del juego, con cuántos cuadros.
 * El impacto del ataque sale del propio 0 A.D. (atributo "event" de la animación).
 */
/**
 * Trabajador: ciudadana de 0 A.D. Cada tarea usa su variante (y su herramienta): hacha al talar,
 * azada en la granja, pico en la mina, mazo al construir. Misma escala que los soldados.
 */
const citizen = (unit, actor) => ({
  units: [unit],
  actor: `units/${actor}.xml`,
  choose: [],
  scaleFrom: 'units/romans/infantry_swordsman_b.xml',
  anims: {
    idle: { from: 'idle', frames: 6, fps: 4 },
    walk: { from: 'walk', frames: 10, fps: 12 },
    chop: { from: 'gather_tree', variant: 'gather_tree', frames: 8, fps: 10 },
    farm: { from: 'gather_grain', variant: 'gather_grain', frames: 8, fps: 9 },
    mine: { from: 'gather_rock', variant: 'gather_rock', frames: 8, fps: 10 },
    build: { from: 'build', variant: 'Build', frames: 8, fps: 10 },
    die: { from: 'death', frames: 8, fps: 10, loop: false },
  },
});

/**
 * Jinete: unidad del juego y actor del CABALLO de 0 A.D. (`…_m`; el jinete `…_r` va montado).
 * `ranged`: el jinete tira (jabalina, arco) mientras el caballo queda en reposo.
 * La escala sale de un soldado de a pie (jinete e infante miden lo mismo).
 */
const horse = (unit, actor, { ranged = false, coat = 'brown', extra } = {}) => ({
  units: [unit],
  actor: `units/${actor}.xml`,
  extra,
  // Pelaje del caballo (variante de 0 A.D.: brown, cherrybay, tan, gray, white, black…).
  choose: [coat],
  scaleFrom: 'units/romans/infantry_swordsman_b.xml',
  box: { fs: 300, ax: 150, ay: 205 },
  // Al marchar, trote; al correr o cargar, galope (el cliente elige según la velocidad real).
  // Al pelear, el caballo queda firme y golpea el jinete (encabritarse en cada golpe se veía raro).
  anims: {
    idle: { from: 'idle', frames: 6, fps: 4 },
    walk: { from: 'walk', frames: 10, fps: 11 },
    run: { from: 'run', frames: 12, fps: 16 },
    attack: ranged ? { from: 'attack_ranged', body: 'idle', frames: 8, fps: 12 } : { from: 'attack_melee', body: 'idle', frames: 8, fps: 12 },
    // Carga (Total War): el jinete golpea (o tira) con el caballo AL GALOPE, en la misma fase del
    // galope: una zancada por golpe. Se usa cuando ataca en movimiento; el ataque de arriba, quieto.
    charge: ranged ? { from: 'attack_ranged', body: 'run', frames: 12, fps: 16 } : { from: 'attack_melee', body: 'run', frames: 12, fps: 16 },
    die: { from: 'death', frames: 8, fps: 10, loop: false },
  },
});

export const SOLDIERS = {
  // Romanos: guerrero sin casco (Edad Tribal), astados y príncipes (lanza y gladius con scutum),
  // legionario, triario veterano y vélites.
  'romans-warrior-3d': foot('romans/warrior', 'romans/infantry_swordsman_servus', { props: light('axe_single') }),
  'romans-spearman-3d': foot('romans/spearman', 'romans/infantry_spearman_b'),
  'romans-swordsman-3d': foot('romans/swordsman', 'romans/infantry_swordsman_a'),
  'romans-legionary-3d': foot('romans/legionary', 'romans/infantry_swordsman_b', { choose: ['Scutum-01', 'cardiopylax-1c'] }),
  'romans-triarius-3d': foot('romans/triarius', 'romans/infantry_spearman_e'),
  // 0 A.D. no tiene arqueros romanos: el tirador es un vélite con jabalinas.
  'romans-archer-3d': archer('romans/archer', 'romans/infantry_javelinist_b'),
  // Galos: lanceros y espadachines con escudo hexagonal, guerreros elegidos y honderos.
  'gauls-warrior-3d': foot('gauls/warrior', 'gauls/infantry_spearman_a', { props: light('axe_single') }),
  'gauls-spearman-3d': foot('gauls/spearman', 'gauls/infantry_spearman_b'),
  'gauls-swordsman-3d': foot('gauls/swordsman', 'gauls/infantry_swordsman_a'),
  'gauls-chosen_swordsman-3d': foot('gauls/chosen_swordsman', 'gauls/infantry_swordsman_e'),
  // Fanático desnudo: el cuerpo con torso desnudo del hondero, espada larga, capa con el color del jugador
  // y el ataque con espada de un guerrero galo (0 A.D. no tiene un fanático).
  'gauls-fanatic-3d': {
    ...foot('gauls/fanatic', 'gauls/infantry_slinger_b', {
      props: { weapon_R: 'props/units/weapons/csword.xml', projectile: '' },
      extra: ['props/units/capes/cape_long_gaul.xml'],
    }),
    anims: { ...footAnims(), attack: { from: 'attack_melee', actor: 'units/gauls/infantry_swordsman_c.xml', frames: 8, fps: 12 } },
  },
  // 0 A.D. no tiene arqueros galos: el tirador es un hondero (el de ropa y escudo con color del jugador).
  'gauls-archer-3d': archer('gauls/archer', 'gauls/infantry_slinger_a'),

  // Los demás pueblos no existen en 0 A.D.: se usa el equipo más parecido de otro pueblo, cuidando que
  // cada uno se vea distinto. Son aproximaciones (ver docs/SOLDADOS_3D.md) y se pueden cambiar acá.
  // Germanos ← britanos (celtas del norte: pantalones, escudos ovales, jabalinas).
  'germans-warrior-3d': foot('germans/warrior', 'britons/infantry_spearman_a', { props: light('axe_single') }),
  'germans-spearman-3d': foot('germans/spearman', 'britons/infantry_spearman_b'),
  'germans-swordsman-3d': foot('germans/swordsman', 'gauls/infantry_swordsman_b'),
  'germans-archer-3d': archer('germans/archer', 'britons/infantry_javelinist_b'),
  'germans-chosen_spearman-3d': foot('germans/chosen_spearman', 'britons/infantry_spearman_e'),
  'germans-axe_thrower-3d': foot('germans/axe_thrower', 'britons/infantry_javelinist_e', { attack: 'attack_ranged' }),
  'germans-chosen_axeman-3d': foot('germans/chosen_axeman', 'britons/infantry_swordsman_c'),
  // Visigodos ← íberos (se asentaron en Hispania); arquero acorazado ← arquero cartaginés de élite.
  'visigoths-warrior-3d': foot('visigoths/warrior', 'iberians/infantry_spearman_a', { props: light('axe_single') }),
  'visigoths-spearman-3d': foot('visigoths/spearman', 'iberians/infantry_spearman_b'),
  'visigoths-swordsman-3d': foot('visigoths/swordsman', 'iberians/infantry_swordsman_a'),
  'visigoths-archer-3d': archer('visigoths/archer', 'iberians/infantry_javelinist_b'),
  'visigoths-armored_archer-3d': foot('visigoths/armored_archer', 'carthaginians/infantry_archer_e', { attack: 'attack_ranged' }),
  // Ostrogodos ← seléucidas (infantería pesada de estilo tardorromano/oriental); banda guerrera ← tracios.
  'ostrogoths-warrior-3d': foot('ostrogoths/warrior', 'seleucids/infantry_spearman_a', { props: light('axe_single') }),
  'ostrogoths-spearman-3d': foot('ostrogoths/spearman', 'seleucids/infantry_spearman_b'),
  'ostrogoths-swordsman-3d': foot('ostrogoths/swordsman', 'seleucids/infantry_swordsman_b'),
  'ostrogoths-archer-3d': foot('ostrogoths/archer', 'seleucids/infantry_archer_b', { attack: 'attack_ranged' }),
  'ostrogoths-heavy_spearman-3d': foot('ostrogoths/heavy_spearman', 'seleucids/infantry_pikeman_e'),
  'ostrogoths-gothic_warband-3d': foot('ostrogoths/gothic_warband', 'macedonians/infantry_swordsman_c_thracian'),
  // Vikingos ← atenienses y espartanos (escudo redondo, lanza, casco); berserker y ulfhednar ← guerreros celtas e íberos.
  'vikings-warrior-3d': foot('vikings/warrior', 'athenians/infantry_spearman_a', { props: light('axe_double') }),
  'vikings-spearman-3d': foot('vikings/spearman', 'athenians/infantry_spearman_b'),
  'vikings-swordsman-3d': foot('vikings/swordsman', 'athenians/infantry_swordsman_c'),
  'vikings-archer-3d': foot('vikings/archer', 'athenians/infantry_archer_b', { attack: 'attack_ranged' }),
  'vikings-huscarl-3d': foot('vikings/huscarl', 'spartans/infantry_spearman_e'),
  'vikings-berserker-3d': foot('vikings/berserker', 'gauls/infantry_swordsman_c'),
  'vikings-ulfhednar-3d': foot('vikings/ulfhednar', 'iberians/infantry_swordsman_e'),
  // Mongoles ← han y persas (su ejército sumó infantería china y persa de los pueblos conquistados).
  'mongols-warrior-3d': foot('mongols/warrior', 'han/infantry_spearman_a', { props: light('mace_mauryan') }),
  'mongols-spearman-3d': foot('mongols/spearman', 'persians/infantry_spearman_b'),
  'mongols-swordsman-3d': foot('mongols/swordsman', 'han/infantry_swordsman_b'),
  'mongols-archer-3d': foot('mongols/archer', 'persians/infantry_archer_b', { attack: 'attack_ranged' }),

  // ---------- Caballería: caballo (su esqueleto y animaciones) + jinete montado (los suyos) ----------
  // Misma fuente de 0 A.D. que la infantería de cada pueblo. Al moverse, galope.
  'romans-scout-3d': horse('romans/scout', 'romans/cavalry_javelinist_a_m', { ranged: true, coat: 'cherrybay' }),
  'romans-knight-3d': horse('romans/knight', 'romans/cavalry_spearman_b_m', { coat: 'cherrybay', extra: IRON }),
  'romans-general-3d': horse('romans/general', 'romans/cavalry_swordsman_c_m', { coat: 'white', extra: BRONZE }),
  'gauls-scout-3d': horse('gauls/scout', 'gauls/cavalry_javelinist_a_m', { ranged: true, coat: 'tan' }),
  'gauls-knight-3d': horse('gauls/knight', 'gauls/cavalry_swordsman_b_m', { coat: 'tan', extra: IRON }),
  'gauls-general-3d': horse('gauls/general', 'gauls/cavalry_swordsman_e_m', { coat: 'white', extra: BRONZE }),
  'germans-scout-3d': horse('germans/scout', 'britons/cavalry_javelinist_a_m', { ranged: true, coat: 'brown' }),
  'germans-knight-3d': horse('germans/knight', 'britons/cavalry_swordsman_b_m', { coat: 'brown', extra: IRON }),
  'germans-general-3d': horse('germans/general', 'britons/cavalry_swordsman_e_m', { coat: 'white', extra: BRONZE }),
  'visigoths-scout-3d': horse('visigoths/scout', 'iberians/cavalry_javelinist_a_m', { ranged: true, coat: 'gray' }),
  'visigoths-knight-3d': horse('visigoths/knight', 'iberians/cavalry_spearman_b_m', { coat: 'gray', extra: IRON }),
  'visigoths-general-3d': horse('visigoths/general', 'iberians/cavalry_swordsman_e_m', { coat: 'white', extra: BRONZE }),
  'visigoths-gothic_knight-3d': horse('visigoths/gothic_knight', 'iberians/cavalry_spearman_e_m', { coat: 'gray', extra: IRON }),
  'visigoths-javelin_rider-3d': horse('visigoths/javelin_rider', 'iberians/cavalry_javelinist_b_m', { ranged: true, coat: 'gray' }),
  'ostrogoths-scout-3d': horse('ostrogoths/scout', 'seleucids/cavalry_javelinist_a_m', { ranged: true, coat: 'black' }),
  'ostrogoths-knight-3d': horse('ostrogoths/knight', 'seleucids/cavalry_spearman_b_m', { coat: 'black', extra: IRON }),
  'ostrogoths-general-3d': horse('ostrogoths/general', 'seleucids/cavalry_spearman_e_m', { coat: 'white', extra: BRONZE }),
  'ostrogoths-gothic_lancer-3d': horse('ostrogoths/gothic_lancer', 'seleucids/cavalry_spearman_c_m', { coat: 'black', extra: IRON }),
  'vikings-scout-3d': horse('vikings/scout', 'athenians/cavalry_javelinist_a_m', { ranged: true, coat: 'halflinger' }),
  'vikings-knight-3d': horse('vikings/knight', 'athenians/cavalry_swordsman_b_m', { coat: 'halflinger', extra: IRON }),
  'vikings-general-3d': horse('vikings/general', 'athenians/cavalry_swordsman_e_m', { coat: 'white', extra: BRONZE }),
  'mongols-scout-3d': horse('mongols/scout', 'persians/cavalry_javelinist_a_m', { ranged: true, coat: 'beige' }),
  'mongols-knight-3d': horse('mongols/knight', 'persians/cavalry_spearman_b_m', { coat: 'beige', extra: IRON }),
  'mongols-general-3d': horse('mongols/general', 'han/cavalry_swordsman_e_m', { coat: 'white', extra: BRONZE }),
  'mongols-horse_archer-3d': horse('mongols/horse_archer', 'persians/cavalry_archer_b_m', { ranged: true, coat: 'beige' }),
  'mongols-keshig-3d': horse('mongols/keshig', 'han/cavalry_spearman_e_m', { coat: 'beige', extra: IRON }),

  // ---------- Trabajadores: ciudadanas de 0 A.D., con la herramienta de cada tarea ----------
  'romans-worker-3d': citizen('romans/worker', 'romans/female_citizen'),
  'gauls-worker-3d': citizen('gauls/worker', 'celts/female_citizen'),
  'germans-worker-3d': citizen('germans/worker', 'celts/female_citizen'),
  'visigoths-worker-3d': citizen('visigoths/worker', 'iberians/female_citizen'),
  'ostrogoths-worker-3d': citizen('ostrogoths/worker', 'seleucids/female_citizen'),
  'vikings-worker-3d': citizen('vikings/worker', 'athenians/female_citizen'),
  'mongols-worker-3d': citizen('mongols/worker', 'persians/female_citizen'),
};

/** Altura de la figura en reposo (con casco) en la hoja, en px: da detalle para el zoom. */
const FIGURE_PX = 84;
/** Escala en el juego: la figura queda de ~34 px del mundo, como los soldados LPC (32–34 px). */
const GAME_SCALE = 0.4;
/** Cuadro de trabajo (luego pack.mjs recorta lo que sobra) y punto de los pies. */
const FS = 200, AX = 100, AY = 140;

async function file(rel) {
  const local = path.join(FILES, rel);
  if (!fs.existsSync(local)) {
    const res = await fetch(RAW + rel);
    if (!res.ok) throw new Error(`0 A.D.: descarga fallida (${res.status}) ${rel}`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  return local;
}

const readXml = async (rel) => parseXml(fs.readFileSync(await file(rel), 'utf8'));

async function variantFile(rel) {
  try {
    return kid(await readXml(`variants/${rel}`), 'variant');
  } catch {
    return null;
  }
}

/** Textura de color; 0 A.D. a veces declara .png y guarda .dds (o al revés). */
async function texture(rel) {
  if (!rel || /^(null|default)_/.test(path.basename(rel))) return null;
  for (const r of new Set([rel, rel.replace(/\.png$/, '.dds'), rel.replace(/\.dds$/, '.png')])) {
    try {
      const local = await file(`textures/skins/${r}`);
      return r.endsWith('.dds') ? readDds(local) : Img.read(local);
    } catch {
      /* la otra extensión */
    }
  }
  return null;
}

/**
 * Resuelve un actor: { mesh (texto .dae), tex, mode, props: [{ at, node }] } y junta en `anims`
 * sus animaciones por nombre (en minúsculas, como las trata 0 A.D.). En cada grupo usa la variante
 * de `choose`; si no, la más frecuente. Las animaciones de las variantes elegidas (la postura base
 * del soldado) mandan; las demás (muerte, formaciones…) solo completan las que falten.
 */
async function resolve(rel, choose, anims, depth = 0, over = null) {
  if (depth > 6) return null;
  const actor = kid(await readXml(`actors/${rel}`), 'actor');
  if (!actor) return null;
  const material = kid(actor, 'material')?.text.trim() ?? '';
  const node = { actor: rel, mode: /player/.test(material) ? 'player' : /trans|alpha/.test(material) ? 'trans' : 'opaque', mesh: null, tex: null, props: [], anims: {} };
  let meshRel = null, baseTex = null;
  // Cada actor guarda las suyas: las del cuerpo son las del soldado (o del caballo); un jinete
  // montado trae las propias. Las de accesorios sueltos (la honda) no se usan.
  const own = depth === 0 ? anims : node.anims;
  const collect = (cur, picked) => {
    for (const a of kid(cur, 'animations')?.children ?? []) {
      const name = a.attrs.name?.toLowerCase();
      if (!name || !a.attrs.file || (own[name] && (own[name].picked || !picked))) continue;
      own[name] = { file: a.attrs.file, event: Number(a.attrs.event ?? 0.5), picked };
    }
  };
  // Accesorios por punto de enganche: un grupo posterior reemplaza lo de los anteriores (como 0 A.D.);
  // vacío = se quita (p. ej. al talar, la mano derecha suelta la lanza y toma el hacha).
  const slots = new Map();
  for (const group of kids(actor, 'group')) {
    const variants = kids(group, 'variant');
    // El nombre de una variante puede estar en el archivo que hereda (variants/…).
    const names = await Promise.all(variants.map(async (v) => v.attrs.name ?? (v.attrs.file ? (await variantFile(v.attrs.file))?.attrs.name : undefined)));
    const chosen = variants.findIndex((_, i) => names[i] !== undefined && choose.includes(names[i]));
    const pick = chosen >= 0 ? variants[chosen] : [...variants].sort((a, b) => Number(b.attrs.frequency ?? 1) - Number(a.attrs.frequency ?? 1))[0];
    const groupSlots = new Map();
    for (const v of variants) {
      if (v === pick || /formations\//.test(v.attrs.file ?? '')) continue;
      for (let cur = v, n = 0; cur && n < 6; n++) {
        collect(cur, false);
        cur = cur.attrs.file ? await variantFile(cur.attrs.file) : null;
      }
    }
    for (let cur = pick, n = 0; cur && n < 6; n++) {
      collect(cur, true);
      meshRel ??= kid(cur, 'mesh')?.text.trim() ?? null;
      for (const t of kid(cur, 'textures')?.children ?? []) if (t.attrs.name === 'baseTex') baseTex ??= t.attrs.file;
      // Lo propio de la variante manda sobre lo heredado de su archivo.
      for (const p of kid(cur, 'props')?.children ?? []) {
        const at = p.attrs.attachpoint ?? 'root';
        if (groupSlots.has(at) && at !== 'root') continue;
        // Capas de jinete: las animaciones del jinete no mueven sus huesos y quedarían paradas hacia arriba.
        if (p.attrs.actor && /^props\/units\/capes\/rider\//.test(p.attrs.actor)) continue;
        if (at === 'root') groupSlots.set(`root#${groupSlots.size}`, p.attrs.actor ?? '');
        else groupSlots.set(at, p.attrs.actor ?? '');
      }
      cur = cur.attrs.file ? await variantFile(cur.attrs.file) : null;
    }
    for (const [at, a] of groupSlots) {
      if (at.startsWith('root#')) {
        if (a) slots.set(`${at}@${slots.size}`, a);
      } else slots.set(at, a);
    }
  }
  // Receta (solo el cuerpo): cambiar o quitar accesorios (`props`: punto → actor, '' = quitar) y sumar
  // piezas en la raíz (`extra`, p. ej. la armadura del caballo). Así unidades parecidas se distinguen.
  if (over && depth === 0) {
    for (const [at, a] of Object.entries(over.props ?? {})) slots.set(at, a);
    (over.extra ?? []).forEach((a, i) => slots.set(`root#extra${i}@${slots.size}`, a));
  }
  for (const [key, a] of slots) {
    if (!a) continue;
    const at = key.startsWith('root#') ? 'root' : key;
    const child = await resolve(a, choose, anims, depth + 1);
    if (child) node.props.push({ at, node: child });
  }
  if (meshRel) node.mesh = fs.readFileSync(await file(`meshes/${meshRel}`), 'utf8');
  node.tex = await texture(baseTex);
  if (depth === 0) node.anims = anims;
  return node;
}

/**
 * Piezas del soldado en una pose: cuerpo con esqueleto + accesorios en sus puntos.
 * `phase` (0–1) = momento de la animación; `clipName` = la animación de un jinete montado
 * (que tiene esqueleto y animaciones propias y va sobre el hueso "rider" del caballo).
 */
function posedParts(body, skinned, world, phase = 0, clipName = null) {
  const parts = [{ tris: skinTris(skinned, world), tex: body.tex, mode: body.mode }];
  const pointIn = (w, name) => w.get(`prop-${name}`) ?? w.get(`prop_${name}`) ?? w.get(name);
  const addProps = (node, w, at, points) => {
    for (const p of node.props) {
      const m = p.at === 'root' ? at : points ? points[p.at] && mul(at, points[p.at]) : w && pointIn(w, p.at);
      if (!m || !p.node.mesh) continue;
      p.node.model ??= loadCollada(p.node.mesh);
      const { tris, points: own } = p.node.model;
      if (/<skin\b/.test(p.node.mesh)) {
        p.node.skinned ??= loadSkinned(p.node.mesh);
        const clip = clipName && p.node.clips?.[clipName];
        if (clip) {
          // Jinete: su propio esqueleto, en la misma fase que el caballo, montado en el punto.
          const local = pose(p.node.skinned.nodes, clip, phase * clip.duration, { fixRoot: false });
          const w2 = new Map([...local].map(([k2, v]) => [k2, mul(m, v)]));
          parts.push({ tris: skinTris(p.node.skinned, w2), tex: p.node.tex, mode: p.node.mode });
          addProps(p.node, w2, m, null);
          continue;
        }
        // Capas, faldas: siguen a los huesos de quien las lleva.
        parts.push({ tris: skinTris(p.node.skinned, w), tex: p.node.tex, mode: p.node.mode });
        addProps(p.node, w, m, null);
        continue;
      }
      parts.push({ tris: tris.map((t) => t.map((c) => ({ ...c, p: applyM(m, c.p), n: c.n ? applyN(m, c.n) : null }))), tex: p.node.tex, mode: p.node.mode });
      addProps(p.node, null, m, own);
    }
  };
  addProps(body, world, IDENTITY, null);
  return parts;
}

/** Carga, para los jinetes montados, la animación `name` (o `fallback`) de cada uno. */
async function loadRiderClips(node, name, fallback) {
  for (const p of node.props) {
    if (p.node.mesh && /<skin\b/.test(p.node.mesh) && Object.keys(p.node.anims).length) {
      const src = p.node.anims[name] ?? p.node.anims[fallback];
      if (src) {
        p.node.clips ??= {};
        p.node.clips[name] = loadAnimation(fs.readFileSync(await file(`animation/${src.file}`), 'utf8'));
        p.node.events ??= {};
        p.node.events[name] = src.event;
      }
    }
    await loadRiderClips(p.node, name, fallback);
  }
}

/** Impacto declarado por el jinete (si lo hay) para esa animación. */
function riderEvent(node, name) {
  for (const p of node.props) {
    const e = p.node.events?.[name] ?? riderEvent(p.node, name);
    if (e !== undefined) return e;
  }
  return undefined;
}

/** Animaciones (por nombre) de otro actor, para tomarlas prestadas. */
const borrowed = new Map();
async function animsOfActor(actor) {
  if (!borrowed.has(actor)) {
    const anims = {};
    await resolve(actor, [], anims);
    borrowed.set(actor, anims);
  }
  return borrowed.get(actor);
}

/** Escala de referencia (unidades del modelo → casillas): la de un soldado de a pie, para que todos midan igual. */
const refScale = new Map();
async function scaleOf(actor) {
  if (!refScale.has(actor)) {
    const anims = {};
    const body = await resolve(actor, [], anims);
    const skinned = loadSkinned(body.mesh);
    const idle = loadAnimation(fs.readFileSync(await file(`animation/${anims.idle.file}`), 'utf8'));
    const parts = posedParts(body, skinned, pose(skinned.nodes, idle, 0));
    const top = parts.reduce((t0, p) => p.tris.reduce((t2, t) => Math.max(t2, t[0].p[2], t[1].p[2], t[2].p[2]), t0), 0);
    refScale.set(actor, FIGURE_PX / HEIGHT_PX / top);
  }
  return refScale.get(actor);
}

const applyM = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
function applyN(m, n) {
  const v = [m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[4] * n[0] + m[5] * n[1] + m[6] * n[2], m[8] * n[0] + m[9] * n[1] + m[10] * n[2]];
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}

/** Dibuja las piezas mirando a la dirección r (0 = S, 1 = SE, … en el orden 'oga8'), pies en (AX, AY). */
function drawView(parts, r, k, box = { fs: FS, ax: AX, ay: AY }) {
  // El frente del modelo es −y; con el giro a = (r+1)·45° mira a S, SE, E, … (igual que los vehículos).
  const a = (((r + 1) % 8) * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
  const rot = (x, y) => [x * ca - y * sa, -(x * sa + y * ca)];
  const tp = parts.map((p) => ({
    ...p,
    tris: p.tris.map((t) => t.map((c) => {
      const [u, v] = rot(c.p[0], c.p[1]);
      return { ...c, p: [u * k, v * k, c.p[2] * k], n: c.n ? [...rot(c.n[0], c.n[1]), c.n[2]] : null };
    })),
  }));
  const out = cropRender(render(tp, { ss: 4, ambient: 0.56, diffuse: 0.6 }));
  const img = new Img(box.fs, box.fs), mask = new Img(box.fs, box.fs);
  const ox = Math.round(box.ax - out.ox), oy = Math.round(box.ay - out.oy);
  img.draw(out.img, 0, 0, out.img.w, out.img.h, ox, oy);
  mask.draw(out.mask, 0, 0, out.mask.w, out.mask.h, ox, oy);
  return [img, mask];
}

/** Hoja de un soldado: { packed, credits } (packed = imagen + datos de las animaciones). */
export async function soldierSheet(r) {
  // Un cuerpo por variante: la base, y la de cada tarea que la pida (`variant` en la animación).
  const bodies = new Map();
  const bodyFor = async (variant) => {
    if (!bodies.has(variant)) {
      const animsByName = {};
      const body = await resolve(r.actor, variant ? [...(r.choose ?? []), variant] : (r.choose ?? []), animsByName, 0, { props: r.props, extra: r.extra });
      bodies.set(variant, { body, animsByName, skinned: loadSkinned(body.mesh) });
    }
    return bodies.get(variant);
  };
  const anims = {};
  // Jinetes: la escala sale de un soldado de a pie (si no, el caballo achicaría al jinete).
  let k = r.scaleFrom ? await scaleOf(r.scaleFrom) : undefined;
  const box = r.box ?? { fs: FS, ax: AX, ay: AY };
  for (const [name, a] of Object.entries(r.anims)) {
    // `body`: animación del cuerpo (el caballo) si es distinta de la del jinete (`from`).
    const bodyName = (a.body ?? a.from).toLowerCase();
    const { body, animsByName, skinned } = await bodyFor(a.variant ?? '');
    // `actor`: animación prestada de otro actor (mismo esqueleto de 0 A.D.), p. ej. el ataque con espada
    // para un cuerpo que no lo trae.
    const src = a.actor ? (await animsOfActor(a.actor))[bodyName] : animsByName[bodyName];
    if (!src) throw new Error(`${r.actor}: no tiene la animación ${bodyName}`);
    const clip = loadAnimation(fs.readFileSync(await file(`animation/${src.file}`), 'utf8'));
    await loadRiderClips(body, a.from.toLowerCase(), bodyName);
    const loop = a.loop !== false;
    // Cuadros repartidos en toda la animación (en bucle no se repite el último = el primero).
    const phases = [...Array(a.frames).keys()].map((i) => i / (loop ? a.frames : a.frames - 1));
    const poses = phases.map((ph) => posedParts(body, skinned, pose(skinned.nodes, clip, ph * clip.duration), ph, a.from.toLowerCase()));
    // Escala (unidades del modelo → casillas): según la altura de la figura en su primera pose de reposo.
    k ??= FIGURE_PX / HEIGHT_PX / poses[0].reduce((top, p) => p.tris.reduce((t2, t) => Math.max(t2, t[0].p[2], t[1].p[2], t[2].p[2]), top), 0);
    const base = [], mask = [];
    for (let d = 0; d < 8; d++) {
      const row = poses.map((p) => drawView(p, d, k, box));
      base.push(row.map((x) => x[0]));
      mask.push(row.map((x) => x[1]));
    }
    const event = riderEvent(body, a.from.toLowerCase()) ?? src.event;
    anims[name] = {
      fs: box.fs, dirs: 8, n: a.frames, base, mask, ax: box.ax, ay: box.ay, fps: a.fps, loop,
      ...(name === 'attack' || name === 'charge' ? { hit: Math.max(1, Math.min(a.frames - 2, Math.round(a.frames * event))) } : {}),
    };
  }
  const packed = packSheet(anims);
  // 256 colores bien elegidos: la hoja pesa ~4 veces menos y no se nota la diferencia.
  packed.img = quantize(packed.img);
  return packed;
}

/** Licencia de las hojas de soldados (la de 0 A.D., normalizada como el resto). */
export const soldierLicense = () => sheetLicense([normalizeLicenses(ZEROAD_CREDIT.licenses)]);

/**
 * Genera las hojas y las registra con `save(id, units, packed, extra)` (la de build.mjs).
 * Las unidades de estas hojas dejan de usar su hoja LPC de 4 direcciones; si solo se rehace
 * otra hoja (p. ej. la LPC de esa unidad), sus unidades siguen apuntando a la hoja 3D que ya hay.
 */
export async function buildSoldiers(save, only, manifest) {
  const done = [];
  for (const [id, r] of Object.entries(SOLDIERS)) {
    if (only && only !== id && only !== 'soldiers') {
      if (manifest?.sheets[id]) for (const u of r.units) manifest.units[u] = id;
      continue;
    }
    const t0 = Date.now();
    const packed = await soldierSheet(r);
    save(id, r.units, packed, { scale: GAME_SCALE, o: 'oga8', credits: [SOLDIER_CREDIT_ID], license: soldierLicense() });
    console.log(`  ${id.padEnd(28)} ${packed.img.w}×${packed.img.h}  ${soldierLicense()}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    done.push(id);
  }
  return done;
}

/** Qué trae un actor (para elegir recetas): sus animaciones y accesorios. */
export async function probe(actor) {
  const anims = {};
  const node = await resolve(actor, [], anims);
  const props = (n, d = 0) => n.props.flatMap((p) => [`${'  '.repeat(d)}@${p.at}: ${p.node.actor}`, ...props(p.node, d + 1)]);
  // Cuánto de cada pieza lleva el color del jugador (alfa < 255 en materiales "player").
  const team = (n) => {
    if (n.mode !== 'player' || !n.tex) return 0;
    let k = 0;
    for (let i = 3; i < n.tex.data.length; i += 4) if (n.tex.data[i] < 250) k++;
    return Math.round((k / (n.tex.data.length / 4)) * 1000) / 10;
  };
  const teams = (n) => [`${n.actor}: ${n.mode} ${team(n)} %`, ...n.props.flatMap((p) => teams(p.node))];
  return { anims: Object.fromEntries(Object.entries(anims).map(([k, v]) => [k, (v.picked ? '' : '(other) ') + v.file])), props: props(node), team: teams(node) };
}

const direct = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/art/soldiers.mjs');
// node tools/art/soldiers.mjs --probe units/gauls/infantry_slinger_b.xml  → animaciones y accesorios.
if (direct && process.argv[2] === '--probe') {
  for (const a of process.argv.slice(3)) console.log(a, JSON.stringify(await probe(a), null, 1));
} else if (direct) {
  // Uso directo: solo los soldados, sobre el units.json y credits.json que ya existen.
  const mf = path.join(OUT, 'units.json'), cf = path.join(OUT, 'credits.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const save = (id, units, packed, extra) => {
    const rel = `units/${id}.png`;
    packed.img.write(path.join(OUT, rel));
    manifest.sheets[id] = { file: rel, ...extra, ...packed.meta };
    for (const u of units) manifest.units[u] = id;
  };
  await buildSoldiers(save, process.argv[2], manifest);
  fs.writeFileSync(mf, JSON.stringify(manifest));
  const credits = JSON.parse(fs.readFileSync(cf, 'utf8'));
  credits.items[SOLDIER_CREDIT_ID] = { ...SOLDIER_CREDIT, licenses: normalizeLicenses(SOLDIER_CREDIT.licenses) };
  fs.writeFileSync(cf, JSON.stringify(credits, null, 1));
}
