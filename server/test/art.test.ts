// Arte de unidades (client/public/art): cada imagen tiene autores y licencias
// abiertas, su licencia final es compatible con todas sus piezas, y cada pueblo
// tiene sprites para sus unidades de las eras Tribal y Media.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACTION_ORDER, UNIT_DEFS, unitAvailable, type UnitType } from '../../shared/data.ts';
// @ts-expect-error módulo JS de las herramientas de arte (sin tipos)
import { ALLOWED, OUTPUT_LICENSES, sheetLicense } from '../../tools/art/licenses.mjs';

const ART = path.resolve(import.meta.dirname, '../../client/public/art');
const units = JSON.parse(fs.readFileSync(path.join(ART, 'units.json'), 'utf8'));
const credits = JSON.parse(fs.readFileSync(path.join(ART, 'credits.json'), 'utf8'));

/** Unidades que todavía se dibujan con formas (no hay arte abierto adecuado). */
const PROCEDURAL: UnitType[] = ['trebuchet', 'war_chariot'];

describe('arte de unidades', () => {
  it('cada crédito tiene título, autores, licencias abiertas y enlace', () => {
    for (const [id, c] of Object.entries<{ title: string; authors: string[]; licenses: string[]; urls: string[] }>(credits.items)) {
      expect(c.title, id).toBeTruthy();
      expect(c.authors.length, id).toBeGreaterThan(0);
      expect(c.licenses.length, id).toBeGreaterThan(0);
      for (const l of c.licenses) expect(ALLOWED, `${id}: ${l}`).toContain(l);
      expect(c.urls.length, id).toBeGreaterThan(0);
    }
  });

  it('cada hoja existe, cita sus créditos y tiene una licencia que todas sus piezas permiten', () => {
    for (const [id, s] of Object.entries<{ file: string; credits: string[]; license: string; anims: Record<string, { n: number; d: number; m: number[] }> }>(units.sheets)) {
      expect(fs.existsSync(path.join(ART, s.file)), s.file).toBe(true);
      expect(s.credits.length, id).toBeGreaterThan(0);
      for (const c of s.credits) expect(credits.items[c], `${id} → ${c}`).toBeDefined();
      expect(Object.keys(OUTPUT_LICENSES)).toContain(s.license);
      expect(sheetLicense(s.credits.map((c) => credits.items[c].licenses)), id).toBe(s.license);
      expect(s.anims.idle, id).toBeDefined();
      for (const [name, a] of Object.entries(s.anims)) if (a.m.length) expect(a.m.length, `${id}.${name}`).toBe(a.n * a.d * 6);
    }
  });

  it('no hay imágenes sin manifiesto (todo lo publicado tiene créditos)', () => {
    const listed = new Set(Object.values<{ file: string }>(units.sheets).map((s) => s.file));
    for (const f of fs.readdirSync(path.join(ART, 'units'))) expect(listed, f).toContain(`units/${f}`);
  });

  it('cada pueblo tiene sprites para sus unidades de las eras Tribal y Media', () => {
    for (const f of FACTION_ORDER)
      for (const type of Object.keys(UNIT_DEFS) as UnitType[]) {
        if (PROCEDURAL.includes(type) || !(unitAvailable(type, 1, f) || unitAvailable(type, 2, f))) continue;
        const sheet = units.units[`${f}/${type}`] ?? units.units[`*/${type}`];
        expect(sheet, `${f}/${type}`).toBeDefined();
      }
  });

  it('los trabajadores traen una animación por tarea', () => {
    for (const f of FACTION_ORDER) {
      const s = units.sheets[units.units[`${f}/worker`]];
      for (const a of ['idle', 'walk', 'chop', 'mine', 'farm', 'build', 'die']) expect(s.anims[a], `${f} ${a}`).toBeDefined();
    }
  });
});
