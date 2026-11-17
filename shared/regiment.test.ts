import { describe, expect, it } from 'vitest';
import { regimentState, toggleRegimentMembers } from './regiment.ts';

describe('regiment state', () => {
  it('uses 40 as the steady threshold and defaults missing morale to 100', () => {
    expect(regimentState([{ morale: 30 }, { morale: 50 }])).toBe('steady');
    expect(regimentState([{ morale: 30 }, { morale: 49 }])).toBe('wavering');
    expect(regimentState([{ morale: 0 }, {}])).toBe('steady');
    expect(regimentState([])).toBe('steady');
  });

  it('keeps a routing regiment distinct from a shattered one', () => {
    expect(regimentState([{ rout: 1 }, { morale: 30 }])).toBe('routing');
    expect(regimentState([{ rout: 1, sh: 1 }, { morale: 30 }])).toBe('shattered');
    expect(regimentState([{ sh: 1 }])).toBe('steady');
  });
});

describe('regiment card selection', () => {
  it('adds incomplete regiments and removes complete regiments without affecting other cards', () => {
    const selection = new Set([9, 3, 6]);
    toggleRegimentMembers(selection, [3, 4]);
    expect([...selection]).toEqual([9, 3, 6, 4]);
    toggleRegimentMembers(selection, [3, 4]);
    expect([...selection]).toEqual([9, 6]);
  });
});
