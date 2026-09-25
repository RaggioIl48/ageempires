// Genera el arte de las unidades en client/public/art/ a partir de proyectos abiertos:
//   - LPC (Universal LPC Spritesheet Character Generator): soldados y trabajadores
//   - [LPC] Horses + [LPC] Horse Riding: caballos y jinetes
//   - [LPC] Siege Weapons: balista (escorpión) y cañón (artillería)
//   - Unknown Horizons: edificios (ver buildings.mjs)
// y escribe el manifiesto (units.json) y los créditos (credits.json).
//
// Uso:  npm run art        (descarga lo que falte a tools/art/.cache/, que no se sube a git)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from './img.mjs';
import { Lpc, LPC_COMMIT, LPC_REPO } from './lpc.mjs';
import { Composer } from './compose.mjs';
import { Rider } from './ride.mjs';
import { packSheet } from './pack.mjs';
import { characterRecipes, WORKER_TOOLS } from './recipes.mjs';
import { OGA_PACKS, ensureOgaFiles } from './oga.mjs';
import { normalizeLicenses, sheetLicense } from './licenses.mjs';
import { UH_COMMIT, UH_CREDITS, UH_REPO, buildBuildings } from './buildings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(ROOT, 'client/public/art');
const OUT_UNITS = path.join(OUT, 'units');

/** Escala de dibujo en el juego (px del mundo por px de la hoja). */
const SCALE = { foot: 0.6, worker: 0.6, horse: 0.6, siege: 0.42 };
/** Animaciones de ataque: cuadros por segundo. */
const ATTACK_FPS = { slash: 12, thrust: 12, shoot: 16 };

async function main() {
  const only = process.argv[2]; // p. ej. "romans-legionary" para rehacer una sola
  fs.mkdirSync(OUT_UNITS, { recursive: true });
  await ensureOgaFiles(CACHE);
  const lpc = new Lpc(CACHE);
  const comp = new Composer(lpc);
  const rider = new Rider(comp, path.join(CACHE, 'oga/ride'));

  const manifestFile = path.join(OUT, 'units.json');
  const manifest = only && fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { v: 1, sheets: {}, units: {} };
  const credits = new Map();
  const addCredit = (id, c) => credits.set(id, c);
  let bytes = 0;

  const save = (id, unitKeys, packed, extra) => {
    const file = `units/${id}.png`;
    packed.img.write(path.join(OUT, file));
    bytes += fs.statSync(path.join(OUT, file)).size;
    manifest.sheets[id] = { file, ...extra, ...packed.meta };
    for (const k of unitKeys) manifest.units[k] = id;
  };

  // ---------- Personajes LPC (a pie y a caballo) ----------
  for (const r of characterRecipes()) {
    const id = `${r.faction}-${r.type}`;
    if (only && only !== id) continue;
    comp.lastCredits = new Set();
    const anims = {};
    const opts = { bodyType: r.bodyType ?? 'male' };
    let usedRide = false;
    if (r.kind === 'horse') {
      usedRide = true;
      const color = r.horse;
      anims.idle = { ...(await rider.anim(r.parts, color, { cycle: 's', hframes: [0], anim: 'walk', frames: [0] })), fps: 1 };
      anims.walk = { ...(await rider.anim(r.parts, color, { cycle: 'r', hframes: [0, 1, 2, 3], anim: 'walk', frames: [0] })), fps: 10 };
      const af = r.attack === 'shoot' ? [0, 2, 4, 6, 8, 10, 12] : undefined;
      const atk = await rider.anim(r.parts, color, { cycle: 's', hframes: [0], anim: r.attack, frames: af ?? (await attackFrames(comp, r)) });
      anims.attack = { ...atk, fps: ATTACK_FPS[r.attack] * (af ? 0.6 : 1) };
    } else {
      const walk = await comp.anim(r.parts, 'walk', opts);
      const anchor = footAnchor(walk);
      const pick = (a, frames) => ({ ...a, n: frames.length, base: a.base.map((row) => frames.map((i) => row[i])), mask: a.mask.map((row) => frames.map((i) => row[i])) });
      const walkFrames = walk.custom ? [...Array(walk.n).keys()].slice(1) : [1, 2, 3, 4, 5, 6, 7, 8];
      anims.idle = { ...pick(walk, [0]), ...anchor(walk), fps: 1 };
      anims.walk = { ...pick(walk, walkFrames), ...anchor(walk), fps: 10 };
      if (r.type === 'worker') {
        for (const [name, t] of Object.entries(WORKER_TOOLS)) {
          const a = await comp.anim([...r.parts, ...t.parts], t.anim, opts);
          anims[name] = { ...a, ...anchor(a), fps: 10 };
        }
      } else {
        const a = await comp.anim(r.parts, r.attack, opts);
        anims.attack = { ...a, ...anchor(a), fps: ATTACK_FPS[r.attack] };
      }
      const hurt = await comp.anim(r.parts, 'hurt', opts);
      anims.die = { ...hurt, ...anchor(hurt), fps: 8, loop: false };
    }
    const ids = [...comp.lastCredits].map((f) => `lpc:${f}`);
    for (const f of comp.lastCredits) {
      const c = comp.credits.get(f);
      addCredit(`lpc:${f}`, { pack: 'lpc', title: c.title, authors: c.authors, licenses: c.licenses, urls: c.urls, notes: c.notes });
    }
    if (usedRide) ids.push('oga:lpc-horses', 'oga:lpc-horse-riding');
    const packed = packSheet(anims);
    const license = sheetLicense(ids.map((i) => (i.startsWith('lpc:') ? credits.get(i).licenses : OGA_PACKS[i.slice(4)].licenses)));
    save(id, [`${r.faction}/${r.type}`], packed, { scale: SCALE[r.type === 'worker' ? 'worker' : r.kind], o: 'lpc4', credits: ids, license });
    console.log(`  ${id.padEnd(28)} ${packed.img.w}×${packed.img.h}  ${license}`);
  }

  // ---------- Asedio ([LPC] Siege Weapons) ----------
  const siege = [
    { id: 'any-scorpion', unit: '*/scorpion', build: ballista },
    { id: 'any-artillery', unit: '*/artillery', build: cannon },
  ];
  for (const s of siege) {
    if (only && only !== s.id) continue;
    const { anims, o } = s.build(path.join(CACHE, 'oga/siege'));
    const packed = packSheet(anims);
    const ids = ['oga:lpc-siege-weapons'];
    const license = sheetLicense(ids.map((i) => OGA_PACKS[i.slice(4)].licenses));
    save(s.id, [s.unit], packed, { scale: SCALE.siege, o, credits: ids, license });
    console.log(`  ${s.id.padEnd(28)} ${packed.img.w}×${packed.img.h}  ${license}`);
  }

  // ---------- Edificios (Unknown Horizons) ----------
  let buildingCredits = [];
  if (!only || only === 'buildings') {
    const { manifest: bm, bytes: bb } = await buildBuildings(CACHE, OUT);
    fs.writeFileSync(path.join(OUT, 'buildings.json'), JSON.stringify(bm));
    bytes += bb;
    buildingCredits = bm.credits;
    console.log(`  edificios: ${Object.keys(bm.sprites).length} imágenes, ${(bb / 1024).toFixed(0)} KB`);
  } else if (fs.existsSync(path.join(OUT, 'buildings.json'))) {
    buildingCredits = JSON.parse(fs.readFileSync(path.join(OUT, 'buildings.json'), 'utf8')).credits;
  }
  for (const [id, c] of Object.entries(UH_CREDITS)) addCredit(id, { ...c, licenses: normalizeLicenses(c.licenses) });

  for (const [key, pack] of Object.entries(OGA_PACKS))
    addCredit(`oga:${key}`, { pack: key, title: pack.title, authors: pack.authors, licenses: normalizeLicenses(pack.licenses), urls: [pack.url], notes: pack.notes ?? '' });

  // Créditos: solo los que usa alguna hoja del manifiesto.
  const old = only && fs.existsSync(path.join(OUT, 'credits.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'credits.json'), 'utf8')).items : {};
  const used = new Set([...Object.values(manifest.sheets).flatMap((s) => s.credits), ...buildingCredits]);
  const items = {};
  for (const id of [...used].sort()) {
    const c = credits.get(id) ?? old[id];
    if (!c) throw new Error(`sin créditos: ${id}`);
    items[id] = c;
  }
  const creditsOut = {
    note: 'Unit art built from open-licensed projects. Each image lists the works it uses; see units.json.',
    packs: {
      lpc: { title: 'Universal LPC Spritesheet Character Generator', url: LPC_REPO, version: LPC_COMMIT },
      ...Object.fromEntries(Object.entries(OGA_PACKS).map(([k, v]) => [k, { title: v.title, url: v.url }])),
      uh: { title: 'Unknown Horizons (buildings)', url: UH_REPO, version: UH_COMMIT },
    },
    items,
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  fs.writeFileSync(path.join(OUT, 'credits.json'), JSON.stringify(creditsOut, null, 1));
  console.log(`\n  ${Object.keys(manifest.sheets).length} hojas, ${(bytes / 1024).toFixed(0)} KB escritos, ${Object.keys(items).length} créditos, ${lpc.downloads} archivos LPC descargados`);
}

/** Cuadros de ataque del jinete (animación normal del personaje). */
async function attackFrames(comp, r) {
  const a = await comp.anim(r.parts, r.attack, { bodyType: r.bodyType ?? 'male', frames: undefined });
  return [...Array(a.n).keys()];
}

/** Punto de los pies: centro del cuadro, justo debajo del cuerpo mirando al sur. */
function footAnchor(ref) {
  const i = ref.dirs > 2 ? 2 : 0;
  const bb = ref.base[i][0].bbox();
  const off = (ref.fs - 64) / 2;
  const feet64 = bb ? Math.min(62, bb.y + bb.h - 1 - off) : 60;
  return (a) => ({ ax: a.fs / 2, ay: (a.fs - 64) / 2 + feet64 });
}

// ---------- Asedio ----------

/** Filas de las hojas de asedio: S, SE, E, NE, N, NW, W, SW. */
function ballista(dir) {
  const L = (f) => Img.read(path.join(dir, f));
  const wb = L('wheels-bg.png'), base = L('ballista.png'), arm = L('ballista-arm.png'), wf = L('wheels-fg.png');
  const frame = (d, wk, bk, ak) => {
    const out = new Img(128, 128);
    out.draw(wb, wk * 128, d * 128, 128, 128, 0, 0);
    out.draw(base, bk * 128, d * 128, 128, 128, 0, 0);
    out.draw(arm, ak * 128, d * 128, 128, 128, 0, 0);
    out.draw(wf, wk * 128, d * 128, 128, 128, 0, 0);
    return out;
  };
  return { o: 'oga8', anims: siegeAnims(8, 6, frame) };
}

function cannon(dir) {
  const L = (f) => Img.read(path.join(dir, f));
  const gun = L('cannon.png'), wheels = L('cannon-wheels-fg.png');
  // La hoja trae 4 direcciones en las filas 0, 2, 4, 6 (S, E, N, W); se reordenan a N, W, S, E.
  const rows = [4, 6, 0, 2];
  const frame = (d, _wk, bk) => {
    const out = new Img(128, 128);
    out.draw(gun, bk * 128, rows[d] * 128, 128, 128, 0, 0);
    out.draw(wheels, bk * 128, rows[d] * 128, 128, 128, 0, 0);
    return out;
  };
  return { o: 'lpc4', anims: siegeAnims(4, 5, frame, 1) };
}

function siegeAnims(dirs, attackFrames, frame, walkFrames = 6) {
  const grid = (n, f) => {
    const base = [], mask = [];
    for (let d = 0; d < dirs; d++) {
      base.push([...Array(n).keys()].map((k) => f(d, k)));
      mask.push(base[d].map(() => new Img(128, 128)));
    }
    return { fs: 128, dirs, n, base, mask };
  };
  // Punto de apoyo: centro de la caja de la máquina quieta, un poco hacia abajo.
  const idle = grid(1, (d) => frame(d, 0, 0, 0));
  let top = 128, bottom = 0;
  for (const row of idle.base) {
    const bb = row[0].bbox();
    if (bb) {
      top = Math.min(top, bb.y);
      bottom = Math.max(bottom, bb.y + bb.h);
    }
  }
  const anchor = { ax: 64, ay: Math.round(top + (bottom - top) * 0.72) };
  return {
    idle: { ...idle, ...anchor, fps: 1 },
    walk: { ...grid(walkFrames, (d, k) => frame(d, k, 0, 0)), ...anchor, fps: 10 },
    attack: { ...grid(attackFrames, (d, k) => frame(d, 0, k, k)), ...anchor, fps: 8 },
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
