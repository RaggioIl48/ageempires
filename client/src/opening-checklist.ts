import { ALL_OBJECTIVES, Objective, openingObjectives, openingStorageKey, readOpeningProgress, type OpeningProgress } from '../../shared/objectives.ts';
import type { ClientState } from './state.ts';

const INTRO_SECONDS = 300;
const ITEMS = [
  [Objective.GatherFood, 'Gather food with 3 workers'],
  [Objective.BuildHouse, 'Build a House'],
  [Objective.TrainWorker, 'Train a Worker'],
  [Objective.BuildBarracks, 'Build a Barracks'],
  [Objective.TrainRegiment, 'Train a regiment'],
] as const;

export class OpeningChecklist {
  private key: string | null = null;
  private workerWatermark: number | undefined;
  private progress: OpeningProgress = { completed: 0, dismissed: false };
  private readonly list: HTMLOListElement;
  private readonly heading: HTMLElement;

  constructor(private readonly panel: HTMLElement) {
    this.list = panel.querySelector('ol')!;
    this.heading = panel.querySelector('h2')!;
    panel.querySelector('button')!.addEventListener('click', () => {
      this.progress.dismissed = true;
      this.save();
      this.panel.hidden = true;
    });
  }

  start(state: ClientState): void {
    const player = state.players.get(state.you);
    this.key = player ? openingStorageKey(player.name) : null;
    this.workerWatermark = undefined;
    this.panel.hidden = true;
    let saved: string | null = null;
    try {
      if (this.key) saved = localStorage.getItem(this.key);
    } catch {
      // A blocked store still allows progress for the current game.
    }
    this.progress = readOpeningProgress(saved);
    this.render();
  }

  update(state: ClientState): void {
    const expired = state.clock[0] >= INTRO_SECONDS;
    this.panel.hidden = !this.key || this.progress.dismissed || expired;
    if (this.panel.hidden || this.progress.completed === ALL_OBJECTIVES) return;
    const units = Array.from(state.units.values(), (item) => item.v);
    const completed = this.progress.completed | openingObjectives(units, state.buildings.values(), state.you, this.workerWatermark);
    if (this.workerWatermark === undefined) {
      const starting = units.filter((unit) => unit.owner === state.you && unit.type === 'worker');
      if (starting.length) this.workerWatermark = Math.max(...starting.map((unit) => unit.id));
    }
    if (completed !== this.progress.completed) {
      this.progress.completed = completed;
      this.save();
      this.render();
    }
  }

  private render(): void {
    const complete = ITEMS.filter(([flag]) => this.progress.completed & flag).length;
    this.heading.textContent = `First five minutes · ${complete}/${ITEMS.length}`;
    this.list.innerHTML = ITEMS.map(([flag, label]) => {
      const done = !!(this.progress.completed & flag);
      return `<li class="${done ? 'complete' : ''}"><span class="objective-check" aria-hidden="true">${done ? '✓' : '○'}</span>${label}${done ? '<span class="objective-complete">Done</span>' : ''}</li>`;
    }).join('');
  }

  private save(): void {
    if (!this.key) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.progress));
    } catch {
      // In-memory progress is already updated.
    }
  }
}
