// Soldados animados de 0 A.D. (tools/art/skin.mjs y soldiers.mjs): la malla sigue a los huesos,
// las animaciones se muestrean bien, el cuerpo no avanza con el paso, y las hojas generadas están
// en 8 direcciones con el impacto del ataque dentro de la animación.
// Se prueba con un modelo COLLADA mínimo armado acá (sin depender de las descargas de 0 A.D.).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS de las herramientas de arte (sin tipos)
import { loadAnimation, loadSkinned, pose, skinTris } from '../../tools/art/skin.mjs';
// @ts-expect-error módulo JS de las herramientas de arte (sin tipos)
import { SOLDIERS } from '../../tools/art/soldiers.mjs';

const I = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
/** Raíz en el origen con un hueso "arm" a 1 de altura; un triángulo pegado entero al hueso. */
const MESH = `<?xml version="1.0"?>
<COLLADA><library_geometries><geometry id="g"><mesh>
  <source id="pos"><float_array count="9">1 0 1  2 0 1  1 1 1</float_array><technique_common><accessor count="3" stride="3"/></technique_common></source>
  <vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
  <triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_controllers><controller id="c"><skin source="#g">
  <bind_shape_matrix>${I}</bind_shape_matrix>
  <source id="j"><Name_array count="2">root arm</Name_array></source>
  <source id="ibm"><float_array count="32">${I} 1 0 0 0 0 1 0 0 0 0 1 -1 0 0 0 1</float_array><technique_common><accessor count="2" stride="16"/></technique_common></source>
  <source id="w"><float_array count="1">1</float_array><technique_common><accessor count="1" stride="1"/></technique_common></source>
  <joints><input semantic="JOINT" source="#j"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints>
  <vertex_weights count="3"><input semantic="JOINT" source="#j" offset="0"/><input semantic="WEIGHT" source="#w" offset="1"/>
    <vcount>1 1 1</vcount><v>1 0 1 0 1 0</v></vertex_weights>
</skin></controller></library_controllers>
<library_visual_scenes><visual_scene>
  <node id="Root" name="root" sid="root" type="JOINT"><matrix sid="transform">${I}</matrix>
    <node id="Arm" name="arm" sid="arm" type="JOINT"><matrix sid="transform">1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 1</matrix></node>
  </node>
  <node id="m"><instance_controller url="#c"/></node>
</visual_scene></library_visual_scenes></COLLADA>`;

/** Animación de 1 s: la raíz avanza 5 en x y el brazo gira 90° alrededor de z. */
const ANIM = `<?xml version="1.0"?>
<COLLADA><library_animations>
  <animation id="a1"><source id="t1"><float_array count="2">0 1</float_array></source>
    <source id="o1"><float_array count="32">${I} 1 0 0 5 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source>
    <sampler id="s1"><input semantic="INPUT" source="#t1"/><input semantic="OUTPUT" source="#o1"/></sampler>
    <channel source="#s1" target="Root/transform"/></animation>
  <animation id="a2"><source id="t2"><float_array count="2">0 1</float_array></source>
    <source id="o2"><float_array count="32">1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 1  0 -1 0 0 1 0 0 0 0 0 1 1 0 0 0 1</float_array></source>
    <sampler id="s2"><input semantic="INPUT" source="#t2"/><input semantic="OUTPUT" source="#o2"/></sampler>
    <channel source="#s2" target="Arm/transform"/></animation>
</library_animations></COLLADA>`;

const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 5));

describe('esqueleto y animación de 0 A.D.', () => {
  const model = loadSkinned(MESH);
  const anim = loadAnimation(ANIM);

  it('en la pose de reposo la malla queda donde fue modelada', () => {
    const tris = skinTris(model, pose(model.nodes, null, 0));
    close(tris[0][0].p, [1, 0, 1]);
    close(tris[0][1].p, [2, 0, 1]);
  });

  it('la malla sigue al hueso: un giro de 90° del brazo la gira alrededor de él', () => {
    expect(anim.duration).toBe(1);
    const tris = skinTris(model, pose(model.nodes, anim, 1));
    // (2, 0, 1) está a 2 del eje del brazo (x = y = 0): girado 90° queda en (0, 2, 1).
    close(tris[0][1].p, [0, 2, 1]);
    close(tris[0][2].p, [-1, 1, 1]);
  });

  it('entre muestras interpola (a mitad de camino, mitad del recorrido)', () => {
    const world = pose(model.nodes, anim, 0.5, { fixRoot: false });
    expect(world.get('root')[3]).toBeCloseTo(2.5, 5);
  });

  it('el cuerpo no avanza con el paso: el juego mueve la unidad, la hoja la dibuja en el lugar', () => {
    const world = pose(model.nodes, anim, 1);
    expect(world.get('root')[3]).toBeCloseTo(0, 5);
  });
});

describe('hojas de soldados de 0 A.D. en el juego', () => {
  const ART = path.resolve(import.meta.dirname, '../../client/public/art');
  const units = JSON.parse(fs.readFileSync(path.join(ART, 'units.json'), 'utf8'));

  it('cada receta tiene su hoja en 8 direcciones y sus unidades la usan', () => {
    for (const [id, r] of Object.entries(SOLDIERS as Record<string, { units: string[] }>)) {
      const s = units.sheets[id];
      expect(s, id).toBeDefined();
      expect(s.o, id).toBe('oga8');
      expect(fs.existsSync(path.join(ART, s.file)), id).toBe(true);
      for (const name of ['idle', 'walk', 'attack', 'die']) expect(s.anims[name]?.d, `${id} ${name}`).toBe(8);
      for (const u of r.units) expect(units.units[u], u).toBe(id);
    }
  });

  it('el impacto del ataque cae dentro de la animación (no en el primer ni el último cuadro)', () => {
    for (const id of Object.keys(SOLDIERS)) {
      const a = units.sheets[id].anims.attack;
      expect(a.hit, id).toBeGreaterThan(0);
      expect(a.hit, id).toBeLessThan(a.n - 1);
    }
  });

  it('morir no se repite (queda caído en el último cuadro)', () => {
    for (const id of Object.keys(SOLDIERS)) expect(units.sheets[id].anims.die.loop, id).toBe(false);
  });
});
