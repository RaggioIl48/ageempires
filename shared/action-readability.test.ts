import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, MUTE_KEY, actionSlot, isMuteShortcut } from './shortcuts.ts';
import { actionDetails } from '../client/src/action-tooltip.ts';

describe('action and sound shortcuts', () => {
  it('reserves M for audio and keeps all 18 action slots reachable', () => {
    expect(ACTION_KEYS).toHaveLength(18);
    expect(new Set(ACTION_KEYS).size).toBe(18);
    expect(actionSlot('m')).toBe(-1);
    expect(actionSlot('j')).toBe(12);
    expect(isMuteShortcut({ code: MUTE_KEY })).toBe(true);
    expect(isMuteShortcut({ code: MUTE_KEY, repeat: true })).toBe(false);
    expect(isMuteShortcut({ code: MUTE_KEY, ctrlKey: true })).toBe(false);
  });
});

describe('action details', () => {
  it('lists the current cost, time and the unit’s counters in English', () => {
    const details = actionDetails({ wood: 10, food: 20 }, 4.25, 'spearman');
    expect(details).toMatch(/Cost: 20 Food, 10 Wood/i);
    expect(details).toContain('Time: 4.3 s');
    expect(details).toMatch(/Beats: .*Cavalry/i);
    expect(details).toMatch(/Fears: .+/);
  });

  it('labels free actions and omits irrelevant counters for buildings', () => {
    expect(actionDetails({}, 10)).toBe('Cost: Free\nTime: 10 s');
  });
});
