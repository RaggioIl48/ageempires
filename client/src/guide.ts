// Guía del ejército: para entender las unidades de tu pueblo en cada era
// (qué hacen, contra quién sirven, quién les gana y cómo evolucionan).
// Todo sale de las mismas tablas que usa el servidor.

import {
  BUILDING_DEFS,
  CATEGORY_LABELS,
  CHARGE_BONUS,
  CHARGE_READY_SEC,
  ERAS,
  FACTIONS,
  RESOURCE_TYPES,
  TECH_DEFS,
  UNIT_DEFS,
  eraLabel,
  unitAvailable,
  type BuildingType,
  type Cost,
  type TechId,
  type UnitType,
} from '../../shared/data.ts';
import { goodAgainst, weakAgainst } from '../../shared/counters.ts';
import { chargeOf, hasTech, unitCost } from '../../shared/stats.ts';
import { el, esc } from './screens.ts';
import type { ClientState } from './state.ts';

const RES_SHORT = { food: 'food', wood: 'wood', stone: 'stone', metal: 'metal' } as const;

function costText(cost: Cost): string {
  return RESOURCE_TYPES.filter((r) => cost[r])
    .map((r) => `${cost[r]} ${RES_SHORT[r]}`)
    .join(', ');
}

/** Edificio donde se entrena una unidad. */
function homeOf(type: UnitType): BuildingType | undefined {
  return (Object.keys(BUILDING_DEFS) as BuildingType[]).find((b) => BUILDING_DEFS[b].trains.includes(type));
}

export class GuidePanel {
  private open = false;
  private tab = 1;
  private lastKey = '';

  constructor(
    private state: ClientState,
    private icon: (type: UnitType) => string,
  ) {
    el('btn-guide').addEventListener('click', () => this.toggle());
    el('guide-panel').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-era]');
      if (t) {
        this.tab = Number(t.dataset.era);
        this.lastKey = '';
        this.update();
        return;
      }
      if ((e.target as HTMLElement).closest('[data-close]')) this.toggle(false);
    });
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    if (this.open) this.tab = this.state.eraOf(this.state.you);
    el('guide-panel').classList.toggle('hidden', !this.open);
    this.lastKey = '';
    this.update();
  }

  update(): void {
    el('btn-guide').classList.toggle('hidden', this.state.spectator);
    if (!this.open) return;
    const key = `${this.tab}|${this.state.techVersion}|${this.state.faction(this.state.you)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    el('guide-panel').innerHTML = this.html();
  }

  private html(): string {
    const s = this.state;
    const faction = s.faction(s.you);
    const f = FACTIONS[faction];
    const mask = s.techsOf(s.you);
    const tabs = ERAS.map(
      (e, i) => `<button class="tiny ${this.tab === i + 1 ? 'primary' : ''}" data-era="${i + 1}">${e.short}${s.eraOf(s.you) === i + 1 ? ' ●' : ''}</button>`,
    ).join('');
    const units = (Object.keys(UNIT_DEFS) as UnitType[]).filter((u) => unitAvailable(u, this.tab, faction));
    const cards = units
      .map((type) => {
        const d = UNIT_DEFS[type];
        const st = s.statsOf(s.you, type);
        const home = homeOf(type);
        const ups = (Object.keys(TECH_DEFS) as TechId[]).filter(
          (t) => TECH_DEFS[t].unitMods?.[type] && (!TECH_DEFS[t].faction || TECH_DEFS[t].faction === faction),
        );
        const upText = ups
          .map((t) => `${hasTech(mask, t) ? '✔' : '⬆'} <b>${esc(TECH_DEFS[t].label)}</b> <span class="muted">(${esc(TECH_DEFS[t].description.split(': ').slice(1).join(': ') || TECH_DEFS[t].description)})</span>`)
          .join('<br>');
        const range = st.attack.type === 'ranged' ? `range ${st.attack.range}` : 'melee';
        return `<div class="g-card ${d.faction ? 'unique' : ''}">
          <div class="g-head"><span class="icon unit" style="color:${s.color(s.you)}">${this.icon(type)}</span>
            <div><b>${esc(s.labelOf(s.you, type))}</b>${d.faction ? ' <span class="uniq-tag">⚜ unique</span>' : ''}
            <div class="muted">${CATEGORY_LABELS[d.category]} · ${home ? esc(BUILDING_DEFS[home].label) : ''} · ${costText(unitCost(type, mask))}</div></div></div>
          <div class="g-stats">❤ ${st.hp} · ⚔ ${st.attack.damage} (${range}) · 🛡 ${st.armor.melee}/${st.armor.ranged} · ➜ ${st.speed.toFixed(1)}${st.regen ? ` · ✚ ${Math.round(st.regen * 10) / 10}/s` : ''}</div>
          <div>${esc(d.strong)}. <span class="muted">${esc(d.weak)}.</span></div>
          ${goodAgainst(type).length ? `<div class="counter good">⚔ Good against: ${esc(goodAgainst(type).join(', '))}</div>` : ''}
          ${weakAgainst(type).length ? `<div class="counter bad">⚠ Weak against: ${esc(weakAgainst(type).join(', '))}</div>` : ''}
          ${upText ? `<div class="g-ups">${upText}</div>` : ''}
        </div>`;
      })
      .join('');
    const charge = chargeOf(faction);
    return `<div class="dp-head"><h3>📖 Army guide — ${esc(f.name)}</h3><button data-close title="Close">✕</button></div>
      <div class="g-people">
        <div class="up">▲ ${f.strengths.map(esc).join(' · ')}</div>
        <div class="down">▼ ${f.weaknesses.map(esc).join(' · ')}</div>
        <div class="g-abil">✦ ${f.abilities.map(esc).join('<br>✦ ')}</div>
      </div>
      <details class="g-rules"><summary>How combat works</summary>
        <p>Damage = attack × advantage − armor (at least 1). Each type has advantages: infantry beats cavalry,
        cavalry beats ranged units and artillery, ranged units beat infantry, siege destroys buildings.</p>
        <p><b>Cavalry charge:</b> a mounted melee unit that has not fought for ${CHARGE_READY_SEC} s hits ×${CHARGE_BONUS} on its first strike
        (${esc(f.name)}: ×${charge}). Attack, pull back, and charge again!</p>
        <p><b>Upgrades ★:</b> research them in the building that trains the unit. Units already on the map improve too.</p>
        <p><b>Airplanes</b> can only be hit by ranged attacks and towers.</p>
      </details>
      <div class="g-tabs">${tabs}</div>
      <p class="muted">${eraLabel(this.tab)}${this.tab > s.eraOf(s.you) ? ' — not reached yet' : ''}</p>
      <div class="g-list">${cards || '<p class="muted">No units.</p>'}</div>
      <p class="muted">Unit art from open projects — <a href="#" data-credits>see the credits</a>.</p>`;
  }
}
