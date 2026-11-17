import { describe, expect, it } from 'vitest';
import { ALL_OBJECTIVES, Objective, openingObjectives, openingStorageKey, readOpeningProgress } from './objectives.ts';
import type { UnitView } from './protocol.ts';

const worker = (id: number, state: UnitView['state'] = 'idle'): UnitView =>
  ({ id, owner: 1, type: 'worker', x: 0, y: 0, hp: 20, state, task: 'food' });

describe('opening objectives', () => {
  it('requires three living, owned workers assigned to food', () => {
    const assigned = [worker(1, 'gathering'), worker(2, 'toResource'), worker(3, 'returning')];
    expect(openingObjectives(assigned, [], 1, 3)).toBe(Objective.GatherFood);
    expect(openingObjectives([assigned[0], assigned[1], { ...assigned[2], owner: 2 }], [], 1, 3)).toBe(0);
    expect(openingObjectives([assigned[0], assigned[1], worker(3)], [], 1, 3)).toBe(0);
  });

  it('recognizes a replacement worker and counts only completed own buildings and regiments', () => {
    const units: UnitView[] = [worker(2), worker(4), { ...worker(5), type: 'warrior', rg: 6 }];
    const buildings = [
      { owner: 1, type: 'house' as const, progress: 1 },
      { owner: 1, type: 'barracks' as const, progress: 0.9 },
      { owner: 2, type: 'barracks' as const, progress: 1 },
    ];
    expect(openingObjectives(units, buildings, 1, 3)).toBe(Objective.TrainWorker | Objective.TrainRegiment | Objective.BuildHouse);
  });

  it('does not count the starting roster as production', () => {
    expect(openingObjectives([worker(1), worker(2), worker(3)], [], 1)).toBe(0);
    expect(openingObjectives([worker(1), worker(2), worker(3), worker(4)], [], 1)).toBe(Objective.TrainWorker);
  });
});

describe('checklist storage', () => {
  it('gives the same player the same key and keeps different players separate', () => {
    expect(openingStorageKey(' Alice ')).toBe(openingStorageKey('alice'));
    expect(openingStorageKey('Alice')).not.toBe(openingStorageKey('Bob'));
  });

  it('accepts a valid progress record and treats corrupt records as empty', () => {
    expect(readOpeningProgress('{"completed":31,"dismissed":true}')).toEqual({ completed: ALL_OBJECTIVES, dismissed: true });
    expect(readOpeningProgress('{"completed":992,"dismissed":"yes"}')).toEqual({ completed: 0, dismissed: false });
    expect(readOpeningProgress('not json')).toEqual({ completed: 0, dismissed: false });
  });
});
