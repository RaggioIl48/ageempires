// Informe del final de la partida, para conversarla en clase: gráficos en el tiempo
// (economía, ejército, trabajadores, bajas) con las traiciones, guerras y conquistas
// marcadas, la crónica de sucesos y algunas ideas para conversar.

import type { ChronicleEntry, ChronicleKind, HistoryPoint, HistorySample, PlayerSummary } from '../../shared/protocol.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const min = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Sucesos que se marcan en los gráficos (con su ícono). */
const MARKS: Partial<Record<ChronicleKind, string>> = { betrayal: '🗡', alliance: '📜', war: '⚔', conquest: '🏰', fall: '💀', break: '💔' };

const CHARTS: { key: keyof HistoryPoint; title: string; hint: string }[] = [
  { key: 'eco', title: 'Economy', hint: 'Resources gathered in total' },
  { key: 'army', title: 'Army strength', hint: 'What the living army cost' },
  { key: 'workers', title: 'Workers', hint: 'Gatherers alive' },
  { key: 'lost', title: 'Losses', hint: 'Units lost in total' },
];

/** Un gráfico de líneas (una por jugador) con los sucesos marcados. */
function chart(key: keyof HistoryPoint, title: string, hint: string, history: HistorySample[], players: PlayerSummary[], marks: ChronicleEntry[]): string {
  const W = 300, H = 150, L = 34, B = 18, T = 14;
  const tMax = Math.max(60, history[history.length - 1]?.t ?? 60);
  let vMax = 1;
  for (const s of history) for (const p of players) vMax = Math.max(vMax, s.p[p.id]?.[key] ?? 0);
  const x = (t: number) => L + (t / tMax) * (W - L - 6);
  const y = (v: number) => T + (1 - v / vMax) * (H - T - B);
  const lines = players
    .map((p) => {
      const pts = history.filter((s) => s.p[p.id]).map((s) => `${x(s.t).toFixed(1)},${y(s.p[p.id][key]).toFixed(1)}`);
      return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${p.color}" stroke-width="2" stroke-linejoin="round"><title>${esc(p.name)}</title></polyline>` : '';
    })
    .join('');
  const ev = marks
    .map((m) => `<g><line x1="${x(m.t)}" x2="${x(m.t)}" y1="${T}" y2="${H - B}" class="mark"/><text x="${x(m.t)}" y="${T - 2}" text-anchor="middle" font-size="10">${MARKS[m.k]}</text><title>${min(m.t)} · ${esc(m.text)}</title></g>`)
    .join('');
  const ticks = [0, 0.5, 1].map((f) => `<text x="${L - 4}" y="${y(vMax * f) + 3}" text-anchor="end" class="axis">${Math.round(vMax * f)}</text>`).join('');
  const tt = [0, 0.5, 1].map((f) => `<text x="${x(tMax * f)}" y="${H - 4}" text-anchor="middle" class="axis">${min(tMax * f)}</text>`).join('');
  return `<figure class="chart"><figcaption><b>${title}</b> <span class="muted">${hint}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} over time"><line x1="${L}" x2="${W - 6}" y1="${H - B}" y2="${H - B}" class="axis-line"/>${ticks}${tt}${ev}${lines}</svg></figure>`;
}

/** Ideas para conversar: quién apostó a la economía, quién al ejército, traiciones y el momento clave. */
export function talkingPoints(history: HistorySample[], chronicle: ChronicleEntry[], players: PlayerSummary[]): string[] {
  const out: string[] = [];
  const last = history[history.length - 1];
  if (!last || players.length === 0) return out;
  const peak = (id: number, k: keyof HistoryPoint) => history.reduce((m, s) => Math.max(m, s.p[id]?.[k] ?? 0), 0);
  const name = (id: number) => players.find((p) => p.id === id)?.name ?? '?';
  const by = (f: (id: number) => number) => [...players].sort((a, b) => f(b.id) - f(a.id))[0];

  const eco = by((id) => last.p[id]?.eco ?? 0);
  out.push(`📦 <b>${esc(eco.name)}</b> gathered the most resources (${last.p[eco.id]?.eco ?? 0}).`);
  const army = by((id) => peak(id, 'army'));
  const armyAt = history.find((s) => (s.p[army.id]?.army ?? 0) === peak(army.id, 'army'));
  out.push(`⚔ <b>${esc(army.name)}</b> built the strongest army (minute ${Math.floor((armyAt?.t ?? 0) / 60)}).`);
  // Economía contra ejército: cuánto de lo juntado se convirtió en soldados.
  if (players.length > 1) {
    const ratio = (id: number) => peak(id, 'army') / Math.max(1, last.p[id]?.eco ?? 1);
    const builder = by((id) => -ratio(id)), warlord = by((id) => ratio(id));
    if (builder.id !== warlord.id)
      out.push(`⚖ <b>${esc(builder.name)}</b> put the most into the economy, <b>${esc(warlord.name)}</b> put the most into the army. Who did better?`);
  }
  const first = chronicle.find((c) => c.k === 'era');
  if (first) out.push(`🏛 First to advance an age: ${esc(first.text)} (minute ${Math.floor(first.t / 60)}).`);
  for (const c of chronicle.filter((c) => c.k === 'betrayal')) out.push(`🗡 Minute ${Math.floor(c.t / 60)}: ${esc(c.text.replace(/: it starts.*$/, ''))}. Why? Did it pay off?`);
  const allies = chronicle.filter((c) => c.k === 'alliance').length;
  if (allies) out.push(`📜 ${allies} alliance${allies > 1 ? 's were' : ' was'} made in this game.`);
  // Momento clave: la mayor caída de un ejército entre dos fotos.
  let drop = { id: 0, v: 0, t: 0 };
  for (let i = 1; i < history.length; i++)
    for (const p of players) {
      const d = (history[i - 1].p[p.id]?.army ?? 0) - (history[i].p[p.id]?.army ?? 0);
      if (d > drop.v) drop = { id: p.id, v: d, t: history[i].t };
    }
  if (drop.v > 0) out.push(`📉 Turning point: around minute ${Math.floor(drop.t / 60)}, ${esc(name(drop.id))} lost an army worth ${drop.v} resources.`);
  return out;
}

/** Pestañas "📈 Charts" y "📜 Chronicle" del final. */
export function reportHtml(history: HistorySample[], chronicle: ChronicleEntry[], players: PlayerSummary[]): { charts: string; chronicle: string } {
  const marks = chronicle.filter((c) => MARKS[c.k]);
  const legend = players.map((p) => `<span class="legend"><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('');
  const points = talkingPoints(history, chronicle, players);
  const charts =
    history.length < 2
      ? '<p class="muted">The game was too short for charts (a point is taken every 30 seconds).</p>'
      : `<div class="legends">${legend}</div><div class="charts">${CHARTS.map((c) => chart(c.key, c.title, c.hint, history, players, marks)).join('')}</div>
        <p class="muted small">Marks: 🗡 betrayal · 📜 alliance · 💔 alliance broken · ⚔ war declared · 🏰 city taken · 💀 empire fallen</p>
        ${points.length ? `<h3>Talking points</h3><ul class="points">${points.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}`;
  const rows = chronicle
    .filter((c) => c.k !== 'warStart' && c.k !== 'other')
    .map((c) => `<li class="k-${c.k}"><span class="when">${min(c.t)}</span> ${esc(c.text)}</li>`)
    .join('');
  return { charts, chronicle: rows ? `<ul class="chronicle">${rows}</ul>` : '<p class="muted">Nothing happened between the empires… a peaceful game!</p>' };
}
