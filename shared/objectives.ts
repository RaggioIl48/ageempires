import { STARTING_UNITS } from './data.ts';
import type { BuildingView, UnitView } from './protocol.ts';

export const Objective = {
  GatherFood: 1,
  BuildHouse: 2,
  TrainWorker: 4,
  BuildBarracks: 8,
  TrainRegiment: 16,
} as const;

export const ALL_OBJECTIVES = Object.values(Objective).reduce((mask, flag) => mask | flag, 0);
const STARTING_WORKERS = STARTING_UNITS.filter((type) => type === 'worker').length;

export function openingObjectives(
  units: Iterable<UnitView>,
  buildings: Iterable<Pick<BuildingView, 'owner' | 'type' | 'progress'>>,
  player: number,
  firstWorkerWatermark?: number,
): number {
  let completed = 0, workers = 0, foodWorkers = 0;
  for (const unit of units) {
    if (unit.owner !== player || unit.hp <= 0) continue;
    if (unit.rg) completed |= Objective.TrainRegiment;
    if (unit.type !== 'worker') continue;
    workers++;
    if (firstWorkerWatermark !== undefined && unit.id > firstWorkerWatermark) completed |= Objective.TrainWorker;
    if (unit.task === 'food' && (unit.state === 'gathering' || unit.state === 'toResource' || unit.state === 'returning')) foodWorkers++;
  }
  if (foodWorkers >= 3) completed |= Objective.GatherFood;
  if (workers > STARTING_WORKERS) completed |= Objective.TrainWorker;
  for (const building of buildings) {
    if (building.owner !== player || building.progress < 1) continue;
    if (building.type === 'house') completed |= Objective.BuildHouse;
    if (building.type === 'barracks') completed |= Objective.BuildBarracks;
  }
  return completed;
}

export interface OpeningProgress {
  completed: number;
  dismissed: boolean;
}

export function openingStorageKey(name: string): string {
  return `rts.opening.v1.${name.trim().toLowerCase()}`;
}

export function readOpeningProgress(raw: string | null): OpeningProgress {
  try {
    const saved = JSON.parse(raw ?? 'null') as Partial<OpeningProgress> | null;
    const completed = saved?.completed;
    return {
      completed: typeof completed === 'number' && Number.isInteger(completed) && completed >= 0 && completed <= ALL_OBJECTIVES ? completed : 0,
      dismissed: saved?.dismissed === true,
    };
  } catch {
    return { completed: 0, dismissed: false };
  }
}
