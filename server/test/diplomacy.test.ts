// Phase 4: diplomacy decided by the server (war, peace, alliance).
import { describe, expect, it } from 'vitest';
import { PROPOSAL_SEC, WAR_DELAY_SEC } from '../../shared/data.ts';
import { unitStats } from '../../shared/stats.ts';
import { diploView, initRelations, isEnemy } from '../src/sim/diplomacy.ts';
import { flatGame, run } from './helpers.ts';

/** Map with 3 players: 1 and 2 as a team, 3 alone. */
function threePlayers(locked = false) {
  const g = flatGame();
  const w = g.world;
  w.addPlayer(3, 'Tres', '#2fa84f', { x: 5, y: 34 });
  w.addBuilding('town_center', 3, 4, 33);
  initRelations(w, (id) => (id === 3 ? 0 : 1), locked);
  return { g, w };
}
const diplo = (g: ReturnType<typeof flatGame>, from: number, action: Parameters<typeof g.enqueue>[1] extends infer C ? C extends { kind: 'diplo'; action: infer A } ? A : never : never, target: number) =>
  g.enqueue(from, { kind: 'diplo', action, target });

describe('diplomacy', () => {
  it('at the start: same team = allies; the rest, at war', () => {
    const { w } = threePlayers();
    expect(w.relation(1, 2)).toBe('ally');
    expect(w.relation(1, 3)).toBe('war');
    expect(isEnemy(w, 1, 2)).toBe(false);
    expect(isEnemy(w, 2, 3)).toBe(true);
  });

  it('allies do not attack each other: neither on their own, nor by order, nor the Town Center', () => {
    const { g, w } = threePlayers();
    const warrior = w.addUnit('warrior', 1, 15.5, 15.5);
    const friend = w.addUnit('worker', 2, 16.5, 15.5);
    const nearMyTc = w.addUnit('worker', 2, 8.5, 5.5); // right next to player 1's TC
    run(g, 3);
    expect(warrior.task).toBeNull();
    g.enqueue(1, { kind: 'attack', unitIds: [warrior.id], targetId: friend.id });
    run(g, 5);
    expect(friend.hp).toBe(unitStats('legion', 'worker').hp);
    expect(nearMyTc.hp).toBe(unitStats('legion', 'worker').hp);
    expect(g.takeNotices(1).some((n) => n.includes('ally'))).toBe(true);
  });

  it('alliance: one proposes, the other accepts, and the whole class is informed', () => {
    const { g, w } = threePlayers();
    diplo(g, 3, 'proposeAlliance', 1);
    g.step();
    expect(g.takeNotices(1).some((n) => n.includes('proposes an alliance'))).toBe(true);
    expect(w.relation(1, 3)).toBe('war'); // until they accept
    diplo(g, 1, 'acceptAlliance', 3);
    g.step();
    expect(w.relation(1, 3)).toBe('ally');
    for (const id of [1, 2, 3]) expect(g.takeNotices(id).some((n) => n.includes('are now allies'))).toBe(true);
  });

  it('if both propose the same thing, it is accepted directly', () => {
    const { g, w } = threePlayers();
    diplo(g, 1, 'proposePeace', 3);
    diplo(g, 3, 'proposePeace', 1);
    g.step();
    expect(w.relation(1, 3)).toBe('peace');
  });

  it('a rejected proposal disappears; one with no answer expires', () => {
    const { g, w } = threePlayers();
    diplo(g, 3, 'proposeAlliance', 1);
    diplo(g, 1, 'rejectAlliance', 3);
    g.step();
    expect(w.proposals).toHaveLength(0);
    expect(g.takeNotices(3).some((n) => n.includes('rejected'))).toBe(true);
    diplo(g, 3, 'proposePeace', 2);
    g.step();
    expect(w.proposals).toHaveLength(1);
    run(g, PROPOSAL_SEC + 1);
    expect(w.proposals).toHaveLength(0);
    expect(g.takeNotices(3).some((n) => n.includes('did not answer'))).toBe(true);
  });

  it(`declaring war on an ally: the alliance breaks at once and the war starts ${WAR_DELAY_SEC} s later`, () => {
    const { g, w } = threePlayers();
    const a = w.addUnit('warrior', 1, 20.5, 20.5);
    const b = w.addUnit('warrior', 2, 21.5, 20.5);
    diplo(g, 1, 'declareWar', 2);
    g.step();
    expect(w.relation(1, 2)).toBe('peace');
    expect(g.takeNotices(3).some((n) => n.includes('declared war'))).toBe(true);
    run(g, WAR_DELAY_SEC - 2);
    expect(w.relation(1, 2)).toBe('peace');
    expect(a.hp + b.hp).toBe(2 * unitStats('legion', 'warrior').hp); // nobody attacked during the warning
    run(g, 3);
    expect(w.relation(1, 2)).toBe('war');
    run(g, 2);
    expect(a.task?.kind === 'attack' || b.task?.kind === 'attack').toBe(true);
  });

  it('peace: those who were fighting stop', () => {
    const { g, w } = threePlayers();
    const a = w.addUnit('warrior', 1, 20.5, 20.5);
    const c = w.addUnit('warrior', 3, 21.5, 20.5);
    run(g, 2);
    expect(a.task?.kind).toBe('attack');
    diplo(g, 3, 'proposePeace', 1);
    diplo(g, 1, 'acceptPeace', 3);
    run(g, 1);
    expect(w.relation(1, 3)).toBe('peace');
    expect(a.task).toBeNull();
    expect(c.task).toBeNull();
    const hp = [a.hp, c.hp];
    run(g, 5);
    expect([a.hp, c.hp]).toEqual(hp);
  });

  it('with fixed teams, diplomacy cannot be changed', () => {
    const { g, w } = threePlayers(true);
    diplo(g, 1, 'declareWar', 2);
    diplo(g, 3, 'proposeAlliance', 1);
    g.step();
    expect(w.relation(1, 2)).toBe('ally');
    expect(w.proposals).toHaveLength(0);
    expect(g.takeNotices(1).some((n) => n.includes('Teams are fixed'))).toBe(true);
  });

  it('everyone sees who is with whom; each player only sees their own proposals; the teacher sees all', () => {
    const { g, w } = threePlayers();
    diplo(g, 3, 'proposeAlliance', 1);
    g.step();
    const rel = (v: ReturnType<typeof diploView>) => v.r.join(',');
    expect(rel(diploView(w, 2))).toBe('1,2,2,1,3,0,2,3,0');
    expect(diploView(w, 1).p).toEqual([3, 1, 0, PROPOSAL_SEC]);
    expect(diploView(w, 2).p).toEqual([]);
    expect(diploView(w, 0).p).toHaveLength(4);
  });

  it('nobody can do diplomacy with themselves or with players who do not exist', () => {
    const { g, w } = threePlayers();
    diplo(g, 1, 'declareWar', 1);
    diplo(g, 1, 'declareWar', 99);
    g.step();
    expect(w.pendingWars).toHaveLength(0);
  });
});
