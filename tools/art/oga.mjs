// Paquetes de OpenGameArt.org que se usan además de LPC: caballos, monta y asedio.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OGA_PACKS = {
  'lpc-horses': {
    title: '[LPC] Horses',
    authors: ['bluecarrot16'],
    licenses: ['CC-BY 3.0', 'GPL 3.0', 'GPL 2.0', 'OGA-BY 3.0'],
    url: 'https://opengameart.org/content/lpc-horses',
  },
  'lpc-horse-riding': {
    title: '[LPC] Horse Riding (0.9.0)',
    authors: ['bigbeargames', 'bluecarrot16'],
    licenses: ['CC-BY 3.0', 'GPL 3.0', 'GPL 2.0', 'OGA-BY 3.0'],
    url: 'https://opengameart.org/content/lpc-horse-riding-updated-091',
    notes: 'Horse cut-outs (front and back) and rider offsets, based on [LPC] Horses by bluecarrot16.',
  },
  'lpc-siege-weapons': {
    title: '[LPC] Siege Weapons',
    authors: ['bluecarrot16', 'Herodom'],
    licenses: ['CC-BY 4.0', 'CC-BY 3.0', 'GPL 3.0', 'GPL 2.0', 'OGA-BY 3.0'],
    url: 'https://opengameart.org/content/lpc-siege-weapons',
  },
};

const FILES = 'https://opengameart.org/sites/default/files/';
const SIEGE = {
  'ballista.png': 'ballista.png',
  'ballista-arm.png': 'ballista-arm.png',
  'wheels-bg.png': 'wheels-bg.png',
  'wheels-fg.png': 'wheels-fg.png',
  'cannon.png': 'cannon_4.png',
  'cannon-wheels-fg.png': 'cannon-wheels-fg.png',
};

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`descarga fallida (${res.status}) ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

export async function ensureOgaFiles(cache) {
  const siege = path.join(cache, 'oga/siege');
  for (const [name, remote] of Object.entries(SIEGE)) {
    const file = path.join(siege, name);
    if (!fs.existsSync(file)) await download(FILES + remote, file);
  }
  const ride = path.join(cache, 'oga/ride');
  if (!fs.existsSync(path.join(ride, '1', 'wf.png'))) {
    const zip = path.join(cache, 'oga/LPC_ride_0.9.0.zip');
    if (!fs.existsSync(zip)) await download(FILES + 'LPC_ride_0.9.0.zip', zip);
    fs.mkdirSync(ride, { recursive: true });
    try {
      execFileSync('unzip', ['-o', '-q', zip, '-d', ride]);
    } catch {
      execFileSync('tar', ['-xf', zip, '-C', ride]);
    }
  }
}
