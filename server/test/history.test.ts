// Historia de la partida (para conversarla en clase): fotos cada 30 s, crónica con traiciones y gráficos.
import { describe, expect, it } from 'vitest';
import type { PlayerSummary } from '../../shared/protocol.ts';
import { reportHtml, talkingPoints } from '../../client/src/report.ts';
import { HISTORY_EVERY_SEC } from '../src/sim/history.ts';
import { flatGame, newGame, run } from './helpers.ts';

describe('game history', () => {
  it('takes a snapshot of every empire every 30 seconds', () => {
    const g = newGame(2);
    run(g, 95);
    const h = g.world.history;
    expect(h.map((s) => s.t)).toEqual([30, 60, 90]);
    expect(HISTORY_EVERY_SEC).toBe(30);
    const p1 = h[2].p[1];
    expect(p1.workers).toBeGreaterThan(0);
    expect(p1.army).toBeGreaterThan(0); // el General y el explorador
    expect(p1.era).toBe(1);
  });

  it('counts losses and records alliances and betrayals in the chronicle', () => {
    const g = flatGame();
    const w = g.world;
    w.setRelation(1, 2, 'war');
    const u = w.addUnit('spearman', 1, 20.5, 20.5);
    u.hp = 0;
    g.step();
    expect(w.players.get(1)!.lost).toBe(1);
    g.enqueue(1, { kind: 'diplo', action: 'proposePeace', target: 2 });
    g.step();
    g.enqueue(2, { kind: 'diplo', action: 'acceptPeace', target: 1 });
    g.step();
    g.enqueue(1, { kind: 'diplo', action: 'proposeAlliance', target: 2 });
    g.step();
    g.enqueue(2, { kind: 'diplo', action: 'acceptAlliance', target: 1 });
    g.step();
    g.enqueue(1, { kind: 'diplo', action: 'declareWar', target: 2 });
    g.step();
    const kinds = w.chronicle.map((c) => c.k);
    expect(kinds).toContain('alliance');
    expect(kinds).toContain('betrayal');
    expect(w.chronicle.find((c) => c.k === 'betrayal')!.text).toMatch(/betrayed their ally/);
  });

  it('builds charts and talking points: economy vs army, betrayals, turning point', () => {
    const players: PlayerSummary[] = [
      { id: 1, name: 'Ana', color: '#2f6fd6', faction: 'romans', gathered: 0, units: 0, buildings: 0, kills: 0, era: 2, glory: 0, conquered: 0, defeated: false },
      { id: 2, name: 'Leo', color: '#d63a2f', faction: 'gauls', gathered: 0, units: 0, buildings: 0, kills: 0, era: 2, glory: 0, conquered: 0, defeated: false },
    ];
    const pt = (eco: number, army: number) => ({ eco, army, workers: 10, kills: 0, lost: 0, era: 2 });
    const history = [
      { t: 30, p: { 1: pt(100, 50), 2: pt(80, 200) } },
      { t: 60, p: { 1: pt(900, 100), 2: pt(300, 900) } },
      { t: 90, p: { 1: pt(1500, 150), 2: pt(400, 100) } },
    ];
    const chronicle = [
      { t: 40, k: 'alliance' as const, text: '📜 Ana and Leo are now allies' },
      { t: 70, k: 'betrayal' as const, text: '🗡 Leo betrayed their ally Ana and declared war: it starts in 30 seconds' },
    ];
    const points = talkingPoints(history, chronicle, players).join('\n');
    expect(points).toMatch(/Ana<\/b> gathered the most/);
    expect(points).toMatch(/Leo<\/b> built the strongest army/);
    expect(points).toMatch(/Ana<\/b> put the most into the economy, <b>Leo<\/b> put the most into the army/);
    expect(points).toMatch(/Leo betrayed their ally Ana and declared war\. Why\?/);
    expect(points).toMatch(/Turning point: around minute 1, Leo lost an army worth 800/);
    const r = reportHtml(history, chronicle, players);
    expect(r.charts.match(/<svg/g)).toHaveLength(4);
    expect(r.charts).toContain('🗡');
    expect(r.chronicle).toContain('1:10');
  });
});
