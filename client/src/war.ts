// Guerra en la interfaz: ejércitos en marcha (con cuenta regresiva), batallas en curso
// (fuerza de cada bando, caídos, reloj, "ir a la batalla" y "retirarse"), el menú para
// marchar sobre una ciudad enemiga y el resultado de cada batalla.

import { FACTIONS, RESOURCE_LABELS, RESOURCE_TYPES, UNIT_DEFS } from '../../shared/data.ts';
import type { BattleResultView, BattleView } from '../../shared/protocol.ts';
import type { Input } from './input.ts';
import type { Net } from './net.ts';
import { el, esc } from './screens.ts';
import type { ClientState } from './state.ts';
import type { Camera } from './view.ts';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class WarPanel {
  private lastHtml = '';
  private seenBattles = new Set<number>();
  private menuOpen = false;
  private showing: BattleResultView | null = null;

  constructor(
    private state: ClientState,
    private input: Input,
    private cam: Camera,
    private net: Net,
  ) {
    el('war-panel').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const go = t.closest<HTMLElement>('[data-go]');
      if (go) return this.goTo(Number(go.dataset.go));
      const rt = t.closest<HTMLElement>('[data-retreat]');
      if (rt) this.net.command({ kind: 'retreat', battleId: Number(rt.dataset.retreat) });
    });
    el('march-menu').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const target = t.closest<HTMLElement>('[data-target]');
      if (target) {
        const ids = this.soldiersSelected();
        if (ids.length) this.net.command({ kind: 'march', unitIds: ids, target: Number(target.dataset.target) });
        this.toggleMenu(false);
      } else if (t.closest('[data-close]')) this.toggleMenu(false);
    });
    el('battle-result').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]')) {
        this.showing = null;
        el('battle-result').classList.add('hidden');
      }
    });
  }

  /** Soldados propios elegidos (los trabajadores no marchan). */
  soldiersSelected(): number[] {
    return this.input.ownSelected().filter((id) => {
      const u = this.state.units.get(id)?.v;
      return u && UNIT_DEFS[u.type].category !== 'worker';
    });
  }

  /** Menú para elegir la ciudad enemiga sobre la que marchar. */
  toggleMenu(open = !this.menuOpen): void {
    this.menuOpen = open;
    const box = el('march-menu');
    box.classList.toggle('hidden', !open);
    if (!open) return;
    const s = this.state;
    const cities = [...s.players.values()].filter(
      (p) => p.id !== s.you && s.relation(s.you, p.id) === 'war' && [...s.buildings.values()].some((b) => b.owner === p.id && b.type === 'town_center'),
    );
    box.innerHTML = `<div class="dp-head"><h3>⚔ March on a city</h3><button data-close title="Close">✕</button></div>
      <p class="muted">Your ${this.soldiersSelected().length} soldiers leave the map on a forced march and appear in front of the city. The enemy sees them coming.</p>
      ${cities.length ? cities.map((p) => `<button class="big-row" data-target="${p.id}"><i style="background:${p.color}"></i>${esc(p.name)} <span class="muted">(${esc(FACTIONS[p.faction].name)})</span></button>`).join('') : '<p>No enemy city: you are not at war with anyone who has a Town Center.</p>'}`;
  }

  private goTo(battleId: number): void {
    const b = this.state.battles.find((x) => x.id === battleId);
    if (b) this.cam.centerOn(b.x, b.y);
  }

  update(): void {
    const s = this.state;
    const name = (id: number) => esc(s.players.get(id)?.name ?? `Player ${id}`);
    const rows: string[] = [];
    for (const m of s.marches) {
      if (m.owner === s.you && m.home) rows.push(`<div class="war-row">🏠 Your army (${m.n}) returns home · <b>${m.left} s</b></div>`);
      else if (m.owner === s.you) rows.push(`<div class="war-row">🚩 Your army (${m.n}) marches on ${name(m.target)}'s city · arrives in <b>${m.left} s</b></div>`);
      else if (m.target === s.you) rows.push(`<div class="war-row alarm">⚠ An army of ${m.n} soldiers from ${name(m.owner)} marches on your city · <b>${m.left} s</b> — prepare your defenses!</div>`);
      else rows.push(`<div class="war-row">🚩 ${name(m.owner)} (${m.n}) → ${name(m.target)} · ${m.left} s</div>`);
    }
    for (const b of s.battles) {
      // Al empezar una batalla que uno lanzó, la cámara va hacia ella.
      if (!this.seenBattles.has(b.id)) {
        this.seenBattles.add(b.id);
        if (b.a === s.you) this.cam.centerOn(b.x, b.y);
      }
      rows.push(this.battleHtml(b));
    }
    const html = rows.join('');
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      el('war-panel').innerHTML = html;
      el('war-panel').classList.toggle('hidden', html === '');
    }
    if (!this.showing && s.battleResults.length) this.showResult(s.battleResults.shift()!);
  }

  private battleHtml(b: BattleView): string {
    const s = this.state;
    const name = (id: number) => esc(s.players.get(id)?.name ?? `Player ${id}`);
    const bar = (v: number, max: number, color: string) =>
      `<div class="war-bar"><div style="width:${max ? Math.round((v / max) * 100) : 0}%;background:${color}"></div></div>`;
    const mine = b.a === s.you ? 'attack' : b.d === s.you ? 'defend' : '';
    return `<div class="war-row battle ${mine}">
      <div class="war-title">⚔ Battle for ${name(b.d)}'s city <span class="war-time">⏱ ${mmss(b.left)}</span></div>
      <div class="war-sides">
        <div><i style="background:${s.color(b.a)}"></i>${name(b.a)} <span class="muted">attacks</span>${bar(b.as, b.a0, s.color(b.a))}<span class="muted">fallen ${b.al}</span></div>
        <div><i style="background:${s.color(b.d)}"></i>${name(b.d)} <span class="muted">defends</span>${bar(b.ds, Math.max(b.d0, 1), s.color(b.d))}<span class="muted">fallen ${b.dl}</span></div>
      </div>
      <div class="war-buttons"><button class="tiny" data-go="${b.id}">👁 Go to battle</button>${b.a === s.you ? `<button class="tiny" data-retreat="${b.id}">🏳 Retreat</button>` : ''}</div>
    </div>`;
  }

  private showResult(r: BattleResultView): void {
    this.showing = r;
    const s = this.state;
    const name = (id: number) => esc(s.players.get(id)?.name ?? `Player ${id}`);
    const me = s.you;
    const won = r.winner === me;
    const involved = r.a === me || r.d === me;
    const title = !involved ? '⚔ Battle over' : won ? '🏆 Victory!' : '💀 Defeat';
    const TEXT: Record<BattleResultView['end'], [string, string]> = {
      fallen: ['The city is yours: you sacked it!', 'Your city has fallen and was sacked.'],
      repelled: ['Your army was destroyed.', 'You repelled the attack!'],
      time: ['Time ran out: your army returns home.', 'You held the city until the enemy gave up!'],
      retreat: ['You retreated: your army returns home.', 'The enemy retreated!'],
    };
    const line = involved ? TEXT[r.end][r.a === me ? 0 : 1] : `${name(r.winner)} won the battle for ${name(r.d)}'s city.`;
    // Como en Total War: la victoria es más o menos clara según las bajas.
    const winnerLost = r.winner === r.a ? r.al : r.dl, loserLost = r.winner === r.a ? r.dl : r.al;
    const kind = loserLost === 0 && winnerLost === 0 ? '' : winnerLost <= loserLost / 3 ? 'Decisive victory' : winnerLost < loserLost ? 'Clear victory' : winnerLost === loserLost ? 'Close victory' : 'Pyrrhic victory';
    const loot = RESOURCE_TYPES.filter((k) => r.loot[k]).map((k) => `${r.loot[k]} ${RESOURCE_LABELS[k].toLowerCase()}`).join(', ');
    const box = el('battle-result');
    box.querySelector('.result-box')!.innerHTML = `<h2>${title}</h2>
      <p class="big-line">${line}</p>
      ${kind ? `<p class="muted">${kind} for ${name(r.winner)}</p>` : ''}
      <table class="result-table">
        <tr><th></th><th>Fallen soldiers</th></tr>
        <tr><td><i style="background:${s.color(r.a)}"></i>${name(r.a)} (attacker)</td><td>${r.al}</td></tr>
        <tr><td><i style="background:${s.color(r.d)}"></i>${name(r.d)} (defender)</td><td>${r.dl}</td></tr>
      </table>
      ${r.buildings ? `<p>Buildings destroyed: <b>${r.buildings}</b></p>` : ''}
      ${loot ? `<p>Loot: <b>${loot}</b></p>` : ''}
      <button class="big primary" data-close>OK</button>`;
    box.classList.remove('hidden');
  }
}
