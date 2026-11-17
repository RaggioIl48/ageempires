import type { UnitView } from './protocol.ts';

export type RegimentState = 'steady' | 'wavering' | 'routing' | 'shattered';
type MemberState = Pick<UnitView, 'morale' | 'rout' | 'sh'>;

export const REGIMENT_STATUS = {
  steady: { label: 'Steady', glyph: '◆', color: '#d9c69e' },
  wavering: { label: 'Wavering', glyph: '!', color: '#ffd064' },
  routing: { label: 'Routing', glyph: '⚐', color: '#ff957e' },
  shattered: { label: 'Shattered', glyph: '×', color: '#ff786f' },
} as const satisfies Record<RegimentState, { label: string; glyph: string; color: string }>;

export function regimentState(units: readonly MemberState[]): RegimentState {
  let morale = 0, routing = 0;
  let shattered = false;
  for (const unit of units) {
    morale += unit.morale ?? 100;
    if (unit.rout) routing++;
    if (unit.rout && unit.sh) shattered = true;
  }
  if (routing && routing * 2 >= units.length) return shattered ? 'shattered' : 'routing';
  return morale < units.length * 40 ? 'wavering' : 'steady';
}

export function toggleRegimentMembers(selection: Set<number>, members: readonly number[]): void {
  if (members.every((id) => selection.has(id))) {
    for (const id of members) selection.delete(id);
  } else {
    for (const id of members) selection.add(id);
  }
}
