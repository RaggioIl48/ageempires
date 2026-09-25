// Aspecto de cada unidad de cada pueblo, armado con piezas LPC.
// Referencia: las unidades de Total War / Age of Empires (romanos con scutum y casco
// de legión, mongoles con arco recurvo y casco puntiagudo, galos de pelo largo y
// bigote, vikingos con hacha y escudo redondo…).
//
// Las piezas con team:true llevan el color del jugador (túnicas, capas y escudos).

// ---------- Piezas ----------
const D = {
  body: 'body/body',
  head: 'head/heads/human/heads_human_male',
  // piernas y pies
  pants: 'legs/pants/legs_pants',
  legionSkirt: 'legs/skirts/legs_skirts_legion',
  sandals: 'feet/feet_sandals',
  shoes: 'feet/shoes/feet_shoes_basic',
  boots: 'feet/boots/feet_boots_basic',
  bootsFold: 'feet/boots/feet_boots_fold',
  greaves: 'feet/feet_armour',
  // torso
  tunic: 'torso/shirts/shortsleeve/torso_clothes_shortsleeve',
  longsleeve: 'torso/shirts/longsleeve/torso_clothes_longsleeve',
  sleeveless: 'torso/shirts/sleeveless/torso_clothes_sleeveless2',
  chainmail: 'torso/torso_chainmail',
  leather: 'torso/armour/torso_armour_leather',
  legion: 'torso/armour/torso_armour_legion',
  plate: 'torso/armour/torso_armour_plate',
  tabard: 'torso/jacket/torso_jacket_tabard',
  cape: 'torso/cape/cape_solid',
  capeTattered: 'torso/cape/cape_tattered',
  belt: 'torso/waist/belt_leather',
  sash: 'torso/waist/belt_sash',
  legionShoulders: 'arms/shoulders/shoulders_legion',
  bracers: 'arms/wrists/arms_bracers',
  plateArms: 'arms/arms_armour',
  // cabeza
  hairBuzz: 'hair/bald/hair_buzzcut',
  hairPlain: 'hair/short/hair_plain',
  hairParted: 'hair/short/hair_parted',
  hairBedhead: 'hair/short/hair_bedhead',
  hairLong: 'hair/long/hair_long',
  hairMessy: 'hair/long/hair_long_messy',
  hairBraid: 'hair/braids/hair_braid',
  hairLoose: 'hair/long/hair_loose',
  beard: 'hair/beards/beards_beard',
  beardMedium: 'hair/beards/beards_medium',
  beardWinter: 'hair/beards/beards_winter',
  beardTrimmed: 'hair/beards/beards_trimmed',
  mustache: 'hair/mustaches/beards_mustache',
  bigstache: 'hair/mustaches/beards_bigstache',
  handlebar: 'hair/mustaches/beards_handlebar',
  helmLegion: 'headwear/helmets/helmets/hat_helmet_legion',
  plumeLegion: 'headwear/helmets/accessories/hat_accessory_plumage_legion',
  plumeCenturion: 'headwear/helmets/accessories/hat_accessory_plumage_centurion',
  helmPointed: 'headwear/helmets/helmets/hat_helmet_pointed',
  helmKettle: 'headwear/helmets/helmets/hat_helmet_kettle',
  helmNasal: 'headwear/helmets/helmets/hat_helmet_nasal',
  helmNorman: 'headwear/helmets/helmets/hat_helmet_norman',
  helmSpangen: 'headwear/helmets/helmets/hat_helmet_spangenhelm',
  helmSpangenViking: 'headwear/helmets/helmets/hat_helmet_spangenhelm_viking',
  helmBarbarian: 'headwear/helmets/helmets/hat_helmet_barbarian',
  helmBarbarianNasal: 'headwear/helmets/helmets/hat_helmet_barbarian_nasal',
  helmBarbarianViking: 'headwear/helmets/helmets/hat_helmet_barbarian_viking',
  helmMail: 'headwear/helmets/helmets/hat_helmet_mail',
  helmArmet: 'headwear/helmets/helmets/hat_helmet_armet_simple',
  hood: 'headwear/coverings/hoods/hat_hood_cloth',
  capLeather: 'headwear/hats/caps/hat_cap_leather',
  // armas
  sword: 'weapons/sword/weapon_sword_arming',
  longsword: 'weapons/sword/weapon_sword_longsword',
  saber: 'weapons/sword/weapon_sword_saber',
  waraxe: 'weapons/blunt/weapon_blunt_waraxe',
  mace: 'weapons/blunt/weapon_blunt_mace',
  spear: 'weapons/polearm/weapon_polearm_spear',
  longspear: 'weapons/polearm/weapon_polearm_longspear',
  bow: 'weapons/ranged/bow/weapon_ranged_bow_normal',
  recurve: 'weapons/ranged/bow/weapon_ranged_bow_recurve',
  greatbow: 'weapons/ranged/bow/weapon_ranged_bow_great',
  arrow: 'weapons/ranged/bow/weapon_ranged_bow_arrow',
  // escudos
  scutum: 'weapons/shields/scutum/shield_scutum',
  scutumTrim: 'weapons/shields/scutum/shield_scutum_trim',
  round: 'weapons/shields/shield_round',
  kite: 'weapons/shields/shield_kite',
  heaterWood: 'weapons/shields/heater/shield_heater_revised_wood',
  heaterPaint: 'weapons/shields/heater/shield_heater_revised_paint',
  heaterTrim: 'weapons/shields/heater/shield_heater_revised_trim',
  // herramientas
  axe: 'tools/tool_axe',
  pickaxe: 'tools/tool_pickaxe',
  hammer: 'tools/tool_hammer',
  hoe: 'tools/tool_hoe',
};

const p = (key, opt = {}) => ({ def: D[key], ...opt });
const T = (key, opt = {}) => p(key, { team: true, ...opt });
const heater = () => [p('heaterWood', { color: 'walnut' }), T('heaterPaint'), p('heaterTrim', { color: 'iron' })];
const scutum = () => [T('scutum'), p('scutumTrim')];

// ---------- Pueblos ----------
/**
 * skin: tono de piel; hair: peinado y color; face: barba/bigote; horse: color del caballo;
 * dress: ropa de diario (trabajadores y tropas ligeras).
 */
const PEOPLE = {
  romans: {
    skin: 'light',
    hair: p('hairBuzz', { color: 'dark_brown' }),
    face: [],
    horse: 'chestnut',
    dress: [T('tunic'), p('belt'), p('sandals', { color: 'leather' })],
  },
  mongols: {
    skin: 'amber',
    hair: p('hairBraid', { color: 'black' }),
    face: [p('mustache', { color: 'black' })],
    horse: 'dun',
    dress: [T('longsleeve'), p('sash', {}), p('pants', { color: 'brown' }), p('boots', { color: 'black' })],
  },
  gauls: {
    skin: 'light',
    hair: p('hairLong', { color: 'ginger' }),
    face: [p('bigstache', { color: 'ginger' })],
    horse: 'golden',
    dress: [T('sleeveless'), p('belt'), p('pants', { color: 'forest' }), p('shoes', { color: 'leather' })],
  },
  germans: {
    skin: 'light',
    hair: p('hairMessy', { color: 'blonde' }),
    face: [p('beardMedium', { color: 'blonde' })],
    horse: 'black',
    dress: [T('longsleeve'), p('belt'), p('pants', { color: 'brown' }), p('shoes', { color: 'leather' })],
  },
  visigoths: {
    skin: 'olive',
    hair: p('hairParted', { color: 'dark_brown' }),
    face: [p('beardTrimmed', { color: 'dark_brown' })],
    horse: 'gray',
    dress: [T('longsleeve'), p('belt'), p('pants', { color: 'charcoal' }), p('boots', { color: 'brown' })],
  },
  ostrogoths: {
    skin: 'light',
    hair: p('hairLoose', { color: 'light_brown' }),
    face: [p('beard', { color: 'light_brown' })],
    horse: 'golden',
    dress: [T('tabard', { variant: 'white' }), p('longsleeve', { color: 'tan' }), p('pants', { color: 'tan' }), p('boots', { color: 'brown' })],
  },
  vikings: {
    skin: 'light',
    hair: p('hairLong', { color: 'sandy' }),
    face: [p('beardWinter', { color: 'sandy' })],
    horse: 'dun',
    dress: [T('longsleeve'), p('belt'), p('pants', { color: 'gray' }), p('boots', { color: 'brown' })],
  },
};

function person(f, extra, { hair = true, dress = true } = {}) {
  const L = PEOPLE[f];
  return [
    p('body', { color: L.skin }),
    p('head', { colors: { color_1: L.skin } }),
    ...(hair ? [L.hair] : []),
    ...L.face,
    ...(dress ? L.dress : []),
    ...extra,
  ];
}

// ---------- Unidades ----------
// kind: 'foot' (a pie), 'worker', 'horse' (jinete). attack: animación de ataque.

function baseUnits(f) {
  const L = PEOPLE[f];
  const u = {};
  u.worker = { kind: 'worker', parts: person(f, []) };
  switch (f) {
    case 'romans':
      u.warrior = { attack: 'slash', parts: person(f, [p('leather', { colors: { color_1: 'brown' } }), p('helmLegion', { color: 'bronze' }), p('sword', { variant: 'iron' }), ...scutum()], { hair: false }) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('chainmail', { color: 'iron' }), p('helmLegion', { color: 'bronze' }), p('spear', { variant: 'iron' }), ...scutum()], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('capLeather'), p('bow', { variant: 'medium' }), p('arrow')], { hair: false }) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('helmLegion', { color: 'bronze' }), p('spear', { variant: 'iron' })], { hair: false }) };
      u.knight = { kind: 'horse', attack: 'thrust', parts: person(f, [p('legion', { color: 'steel' }), T('cape'), p('helmLegion', { color: 'steel' }), p('plumeLegion', { color: 'red' }), p('spear', { variant: 'steel' })], { hair: false }) };
      break;
    case 'mongols':
      u.warrior = { attack: 'slash', parts: person(f, [p('leather', { colors: { color_1: 'walnut' } }), p('helmPointed', { color: 'steel' }), p('saber')], { hair: false }) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('leather', { colors: { color_1: 'walnut' } }), p('helmPointed', { color: 'steel' }), p('spear', { variant: 'iron' })], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('helmPointed', { color: 'bronze' }), p('recurve', { variant: 'medium' }), p('arrow')], { hair: false }) };
      u.scout = { kind: 'horse', attack: 'shoot', parts: person(f, [p('helmPointed', { color: 'bronze' }), p('recurve', { variant: 'medium' }), p('arrow')], { hair: false }) };
      u.knight = { kind: 'horse', attack: 'thrust', parts: person(f, [p('leather', { colors: { color_1: 'walnut' } }), p('helmPointed', { color: 'steel' }), p('spear', { variant: 'steel' })], { hair: false }) };
      break;
    case 'gauls':
      u.warrior = { attack: 'slash', parts: person(f, [p('longsword'), T('kite', { variant: 'kite gray' })]) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('helmBarbarian', { colors: { color_1: 'bronze', color_2: 'red' } }), p('spear', { variant: 'bronze' }), T('kite', { variant: 'kite gray' })], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('bow', { variant: 'light' }), p('arrow')]) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('spear', { variant: 'bronze' })]) };
      u.knight = { kind: 'horse', attack: 'slash', parts: person(f, [p('chainmail', { color: 'iron' }), T('cape'), p('helmBarbarian', { colors: { color_1: 'bronze', color_2: 'red' } }), p('longsword')], { hair: false }) };
      break;
    case 'germans':
      u.warrior = { attack: 'slash', parts: person(f, [p('mace'), T('round', { variant: 'brown' })]) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('spear', { variant: 'iron' }), T('round', { variant: 'brown' })]) };
      u.archer = { attack: 'shoot', parts: person(f, [p('bow', { variant: 'dark' }), p('arrow')]) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('spear', { variant: 'iron' })]) };
      u.knight = { kind: 'horse', attack: 'thrust', parts: person(f, [p('chainmail', { color: 'iron' }), T('cape'), p('helmBarbarianNasal', { colors: { color_1: 'steel', color_2: 'brown' } }), p('spear', { variant: 'steel' })], { hair: false }) };
      break;
    case 'visigoths':
      u.warrior = { attack: 'slash', parts: person(f, [p('chainmail', { color: 'iron' }), p('helmSpangen', { color: 'steel' }), p('sword', { variant: 'iron' }), ...heater()], { hair: false }) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('helmSpangen', { color: 'steel' }), p('spear', { variant: 'iron' }), ...heater()], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('hood', { color: 'brown' }), p('bow', { variant: 'medium' }), p('arrow')], { hair: false }) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('leather', { colors: { color_1: 'brown' } }), p('spear', { variant: 'iron' })]) };
      u.knight = { kind: 'horse', attack: 'thrust', parts: person(f, [p('chainmail', { color: 'steel' }), T('cape'), p('helmSpangen', { color: 'steel' }), p('longspear', { variant: 'steel' })], { hair: false }) };
      break;
    case 'ostrogoths':
      u.warrior = { attack: 'slash', parts: person(f, [p('helmNasal', { color: 'steel' }), p('sword', { variant: 'iron' }), T('round', { variant: 'brown' })], { hair: false }) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('helmNasal', { color: 'steel' }), p('spear', { variant: 'iron' }), T('kite', { variant: 'kite gray' })], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('bow', { variant: 'medium' }), p('arrow')]) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('spear', { variant: 'iron' })]) };
      u.knight = { kind: 'horse', attack: 'thrust', parts: person(f, [p('chainmail', { color: 'steel' }), p('helmSpangen', { color: 'gold' }), p('longspear', { variant: 'steel' })], { hair: false }) };
      break;
    case 'vikings':
      u.warrior = { attack: 'slash', parts: person(f, [p('helmSpangenViking', { color: 'steel' }), p('waraxe'), T('round', { variant: 'brown' })], { hair: false }) };
      u.spearman = { attack: 'thrust', parts: person(f, [p('helmSpangenViking', { color: 'steel' }), p('spear', { variant: 'iron' }), T('round', { variant: 'brown' })], { hair: false }) };
      u.archer = { attack: 'shoot', parts: person(f, [p('bow', { variant: 'dark' }), p('arrow')]) };
      u.scout = { kind: 'horse', attack: 'thrust', parts: person(f, [p('spear', { variant: 'iron' })]) };
      u.knight = { kind: 'horse', attack: 'slash', parts: person(f, [p('chainmail', { color: 'iron' }), T('cape'), p('helmSpangenViking', { color: 'steel' }), p('waraxe')], { hair: false }) };
      break;
  }
  for (const v of Object.values(u)) v.horse = L.horse;
  return u;
}

/** Unidades únicas de la Edad Media. */
function uniqueUnits() {
  const r = PEOPLE;
  return {
    romans: {
      legionary: { attack: 'slash', parts: person('romans', [T('legionSkirt'), p('legion', { color: 'steel' }), p('legionShoulders', { color: 'steel' }), p('helmLegion', { color: 'steel' }), p('plumeLegion', { color: 'red' }), p('sword', { variant: 'steel' }), ...scutum()], { hair: false }) },
      triarius: { attack: 'thrust', parts: person('romans', [T('legionSkirt'), p('chainmail', { color: 'steel' }), p('greaves', { color: 'bronze' }), p('helmLegion', { color: 'bronze' }), p('plumeCenturion', { colors: { color_1: 'black' } }), p('spear', { variant: 'steel' }), ...scutum()], { hair: false }) },
    },
    mongols: {
      horse_archer: { kind: 'horse', attack: 'shoot', horse: 'golden', parts: person('mongols', [p('leather', { colors: { color_1: 'walnut' } }), p('helmPointed', { color: 'steel' }), p('recurve', { variant: 'dark' }), p('arrow')], { hair: false }) },
      keshig: { kind: 'horse', attack: 'thrust', horse: 'black', parts: person('mongols', [p('plate', { color: 'bronze' }), T('cape'), p('helmPointed', { color: 'gold' }), p('longspear', { variant: 'steel' })], { hair: false }) },
    },
    gauls: {
      fanatic: { attack: 'slash', bodyType: 'muscular', parts: [p('body', { color: r.gauls.skin }), p('head', { colors: { color_1: r.gauls.skin } }), p('hairLong', { color: 'carrot' }), p('bigstache', { color: 'carrot' }), T('pants'), p('longsword')] },
      chosen_swordsman: { attack: 'slash', parts: person('gauls', [p('chainmail', { color: 'iron' }), T('cape'), p('helmBarbarian', { colors: { color_1: 'bronze', color_2: 'red' } }), p('longsword'), T('kite', { variant: 'kite gray' })], { hair: false }) },
    },
    germans: {
      chosen_spearman: { attack: 'thrust', parts: person('germans', [p('chainmail', { color: 'iron' }), T('cape'), p('helmBarbarianNasal', { colors: { color_1: 'steel', color_2: 'brown' } }), p('spear', { variant: 'steel' }), T('round', { variant: 'brown' })], { hair: false }) },
      axe_thrower: { attack: 'slash', parts: person('germans', [p('leather', { colors: { color_1: 'brown' } }), p('waraxe')]) },
      chosen_axeman: { attack: 'slash', parts: person('germans', [p('chainmail', { color: 'steel' }), p('helmBarbarianNasal', { colors: { color_1: 'steel', color_2: 'brown' } }), p('waraxe'), T('round', { variant: 'brown' })], { hair: false }) },
    },
    visigoths: {
      gothic_knight: { kind: 'horse', attack: 'slash', horse: 'black', parts: person('visigoths', [p('plate', { color: 'steel' }), p('plateArms', { color: 'steel' }), T('cape'), p('helmNorman', { color: 'steel' }), p('longsword')], { hair: false }) },
      armored_archer: { attack: 'shoot', parts: person('visigoths', [p('chainmail', { color: 'steel' }), p('helmNasal', { color: 'steel' }), p('bow', { variant: 'dark' }), p('arrow')], { hair: false }) },
      javelin_rider: { kind: 'horse', attack: 'thrust', parts: person('visigoths', [p('leather', { colors: { color_1: 'walnut' } }), p('helmSpangen', { color: 'bronze' }), p('spear', { variant: 'bronze' })], { hair: false }) },
    },
    ostrogoths: {
      gothic_lancer: { kind: 'horse', attack: 'thrust', horse: 'gray', parts: person('ostrogoths', [p('chainmail', { color: 'steel' }), p('plateArms', { color: 'steel' }), T('cape'), p('helmSpangen', { color: 'gold' }), p('longspear', { variant: 'steel' })], { hair: false }) },
      heavy_spearman: { attack: 'thrust', parts: person('ostrogoths', [p('chainmail', { color: 'steel' }), p('plateArms', { color: 'iron' }), p('helmNasal', { color: 'steel' }), p('longspear', { variant: 'steel' }), T('kite', { variant: 'kite gray' })], { hair: false }) },
      gothic_warband: { attack: 'slash', parts: person('ostrogoths', [p('helmSpangen', { color: 'steel' }), p('sword', { variant: 'iron' }), T('round', { variant: 'brown' })], { hair: false }) },
    },
    vikings: {
      berserker: { attack: 'slash', bodyType: 'muscular', parts: [p('body', { color: r.vikings.skin }), p('head', { colors: { color_1: r.vikings.skin } }), p('hairLong', { color: 'sandy' }), p('beardWinter', { color: 'sandy' }), p('capeTattered', { color: 'brown' }), T('pants'), p('waraxe')] },
      huscarl: { attack: 'slash', parts: person('vikings', [p('chainmail', { color: 'steel' }), T('cape'), p('helmSpangenViking', { color: 'steel' }), p('waraxe'), T('round', { variant: 'brown' })], { hair: false }) },
      ulfhednar: { attack: 'slash', bodyType: 'muscular', parts: [p('body', { color: r.vikings.skin }), p('head', { colors: { color_1: r.vikings.skin } }), p('beardWinter', { color: 'dark_gray' }), p('hood', { color: 'gray' }), p('capeTattered', { color: 'gray' }), T('pants'), p('waraxe')] },
    },
  };
}

/** Todas las unidades de personaje: [{ faction, type, kind, attack, parts, bodyType?, horse }]. */
export function characterRecipes() {
  const out = [];
  const uniques = uniqueUnits();
  for (const f of Object.keys(PEOPLE)) {
    for (const [type, r] of Object.entries(baseUnits(f))) out.push({ faction: f, type, kind: 'foot', horse: PEOPLE[f].horse, ...r });
    for (const [type, r] of Object.entries(uniques[f] ?? {})) out.push({ faction: f, type, kind: 'foot', horse: PEOPLE[f].horse, ...r });
  }
  return out;
}

/** Herramientas del trabajador según la tarea. */
export const WORKER_TOOLS = {
  chop: { anim: 'slash', parts: [p('axe', { colors: { color_1: 'iron' } })] },
  mine: { anim: 'slash', parts: [p('pickaxe', { colors: { color_1: 'iron' } })] },
  build: { anim: 'slash', parts: [p('hammer', { colors: { color_1: 'iron' } })] },
  farm: { anim: 'thrust', parts: [p('hoe', { colors: { color_1: 'iron' } })] },
};
