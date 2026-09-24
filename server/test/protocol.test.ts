import { describe, expect, it } from 'vitest';
import { MAX_UNITS_PER_COMMAND, parseClientMessage } from '../../shared/protocol.ts';

describe('validación de mensajes del cliente', () => {
  it('acepta órdenes bien formadas', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'move', unitIds: [1, 2], x: 3.5, y: 4 } }))).toEqual({
      t: 'cmd',
      cmd: { kind: 'move', unitIds: [1, 2], x: 3.5, y: 4 },
    });
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'gather', unitIds: [7], targetId: 9 } }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'stop', unitIds: [7] } }))).not.toBeNull();
  });

  it('quita ids repetidos', () => {
    const m = parseClientMessage(JSON.stringify({ t: 'cmd', cmd: { kind: 'stop', unitIds: [3, 3, 3] } }));
    expect(m?.t === 'cmd' && m.cmd.kind === 'stop' && m.cmd.unitIds).toEqual([3]);
  });

  const bad: [string, unknown][] = [
    ['JSON roto', '{no es json'],
    ['sin tipo', { cmd: { kind: 'stop', unitIds: [1] } }],
    ['orden desconocida', { t: 'cmd', cmd: { kind: 'win', unitIds: [1] } }],
    ['coordenadas no numéricas', { t: 'cmd', cmd: { kind: 'move', unitIds: [1], x: 'a', y: 2 } }],
    ['coordenadas infinitas', { t: 'cmd', cmd: { kind: 'move', unitIds: [1], x: 1e309, y: 2 } }],
    ['ids negativos', { t: 'cmd', cmd: { kind: 'stop', unitIds: [-1] } }],
    ['ids decimales', { t: 'cmd', cmd: { kind: 'stop', unitIds: [1.5] } }],
    ['lista vacía', { t: 'cmd', cmd: { kind: 'stop', unitIds: [] } }],
    ['demasiadas unidades', { t: 'cmd', cmd: { kind: 'stop', unitIds: Array.from({ length: MAX_UNITS_PER_COMMAND + 1 }, (_, i) => i + 1) } }],
    ['recolectar sin objetivo', { t: 'cmd', cmd: { kind: 'gather', unitIds: [1] } }],
    ['null', null],
    ['build an invented building', { t: 'cmd', cmd: { kind: 'build', unitIds: [1], building: 'castle', tx: 1, ty: 1 } }],
    ['build with a __proto__ trick', { t: 'cmd', cmd: { kind: 'build', unitIds: [1], building: '__proto__', tx: 1, ty: 1 } }],
    ['build on a fractional tile', { t: 'cmd', cmd: { kind: 'build', unitIds: [1], building: 'house', tx: 1.5, ty: 1 } }],
    ['train an invented unit', { t: 'cmd', cmd: { kind: 'train', buildingId: 3, unit: 'dragon' } }],
    ['train with toString', { t: 'cmd', cmd: { kind: 'train', buildingId: 3, unit: 'toString' } }],
    ['train with no building', { t: 'cmd', cmd: { kind: 'train', unit: 'worker' } }],
    ['cancel negative index', { t: 'cmd', cmd: { kind: 'cancelTrain', buildingId: 3, index: -1 } }],
    ['rally with no coordinates', { t: 'cmd', cmd: { kind: 'rally', buildingId: 3 } }],
    ['delete with no list', { t: 'cmd', cmd: { kind: 'delete', ids: [] } }],
    ['attack with no target', { t: 'cmd', cmd: { kind: 'attack', unitIds: [1] } }],
  ];

  it('accepts the Phase 2 orders', () => {
    const ok = [
      { kind: 'build', unitIds: [1], building: 'house', tx: 3, ty: 4 },
      { kind: 'construct', unitIds: [1], targetId: 9 },
      { kind: 'attack', unitIds: [1, 2], targetId: 9 },
      { kind: 'train', buildingId: 3, unit: 'warrior' },
      { kind: 'cancelTrain', buildingId: 3, index: 0 },
      { kind: 'rally', buildingId: 3, x: 10.5, y: 4 },
      { kind: 'delete', ids: [5, 5, 6] },
    ];
    for (const cmd of ok) expect(parseClientMessage(JSON.stringify({ t: 'cmd', cmd })), cmd.kind).not.toBeNull();
  });
  for (const [label, value] of bad) {
    it(`rechaza: ${label}`, () => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      expect(parseClientMessage(raw)).toBeNull();
    });
  }
});
