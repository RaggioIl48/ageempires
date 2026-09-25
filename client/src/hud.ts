// Interfaz en HTML sobre el lienzo: recursos arriba, información de la
// selección a la izquierda, unidades seleccionadas y acciones abajo.

import {
  BUILDING_DEFS,
  BUILD_MENU,
  CATEGORY_LABELS,
  ERAS,
  FACTIONS,
  NODE_DEFS,
  RELATION_LABELS,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  TECH_DEFS,
  UNIT_DEFS,
  eraLabel,
  type Cost,
  type ResourceType,
  type TechId,
  type UnitType,
} from '../../shared/data.ts';
import type { BuildingView, UnitView } from '../../shared/protocol.ts';
import { canAfford, carryCapacity, techsOf } from '../../shared/stats.ts';
import { ACTION_KEYS, type Input } from './input.ts';
import type { NetStatus } from './net.ts';
import type { ClientState } from './state.ts';

// Íconos originales (SVG sencillos).
const ICONS: Record<ResourceType | 'pop' | UnitType | 'tech' | 'era', string> = {
  food: '<svg viewBox="0 0 16 16"><circle cx="5" cy="9" r="3.2" fill="#d8434f"/><circle cx="10.5" cy="9.5" r="3.2" fill="#c23644"/><circle cx="8" cy="5.5" r="3" fill="#e0525d"/><path d="M8 2.5 L9.5 0.8" stroke="#3f7c35" stroke-width="1.4"/></svg>',
  wood: '<svg viewBox="0 0 16 16"><rect x="1" y="5" width="13" height="6" rx="3" fill="#8a5a2b"/><ellipse cx="13" cy="8" rx="2.2" ry="3" fill="#d9b27c"/><ellipse cx="13" cy="8" rx="1" ry="1.4" fill="#a8783e"/></svg>',
  stone: '<svg viewBox="0 0 16 16"><path d="M1 13 L3 6 L8 3 L13 5 L15 12 Z" fill="#b3b3ad"/><path d="M8 3 L13 5 L15 12 L9 13 Z" fill="#85857f"/></svg>',
  metal: '<svg viewBox="0 0 16 16"><path d="M2 12 L4.5 5 L13.5 5 L15 12 Z" fill="#8fa9c4"/><path d="M4.5 5 L13.5 5 L12.5 7 L5.5 7 Z" fill="#cfdceb"/></svg>',
  pop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4.5" r="3" fill="#e2b68c"/><path d="M3 15 Q3 8.5 8 8.5 Q13 8.5 13 15 Z" fill="#6c8fd6"/></svg>',
  worker: '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="3.5" rx="4.5" ry="1.4" fill="#d8c070"/><circle cx="8" cy="5.5" r="2.6" fill="#e2b68c"/><rect x="4.5" y="8" width="7" height="7" rx="1" fill="currentColor"/></svg>',
  warrior: '<svg viewBox="0 0 16 16"><path d="M5 5 L8 1 L11 5 Z" fill="#8a9099"/><circle cx="8" cy="6" r="2.4" fill="#e2b68c"/><rect x="5" y="8.5" width="6" height="6.5" rx="1" fill="currentColor"/><ellipse cx="4" cy="11" rx="2.6" ry="3.2" fill="#d9d2c0"/><path d="M12 13 L15 4" stroke="#cfd3d8" stroke-width="1.4"/></svg>',
  scout: '<svg viewBox="0 0 16 16"><ellipse cx="7" cy="11" rx="5.5" ry="2.8" fill="#8a5a3b"/><path d="M11 10 L14.5 6.5 L15.5 8 L12.5 11 Z" fill="#7a4d31"/><rect x="5" y="4.5" width="4" height="5" fill="currentColor"/><circle cx="7" cy="3.2" r="1.8" fill="#e2b68c"/><path d="M3 9 L13 1" stroke="#c8b27a" stroke-width="1"/></svg>',
  spearman: '<svg viewBox="0 0 16 16"><path d="M5 6 L8 2 L11 6 Z" fill="#8a9099"/><circle cx="8" cy="6.5" r="2.2" fill="#e2b68c"/><rect x="5" y="9" width="6" height="6" rx="1" fill="currentColor"/><path d="M12.5 15 L14 1" stroke="#8b6a3e" stroke-width="1.3"/><path d="M14 0.5 L13 3 L15 3 Z" fill="#cfd3d8"/></svg>',
  archer: '<svg viewBox="0 0 16 16"><circle cx="7" cy="5" r="3" fill="#4e5a30"/><circle cx="7.5" cy="5.2" r="1.8" fill="#e2b68c"/><rect x="4" y="8.5" width="6" height="6.5" rx="1" fill="currentColor"/><path d="M11 2 Q16 8 11 14" stroke="#7a5230" stroke-width="1.4" fill="none"/><path d="M11 2 L11 14" stroke="#e8e0c8" stroke-width="0.6"/></svg>',
  knight: '<svg viewBox="0 0 16 16"><ellipse cx="7" cy="11" rx="5.5" ry="2.8" fill="#5a4a3e"/><rect x="2.5" y="9" width="9" height="4" fill="currentColor"/><path d="M11 10 L14.5 6.5 L15.5 8 L12.5 11 Z" fill="#4f4136"/><rect x="5" y="4.5" width="4" height="5" fill="#8a9099"/><path d="M5.3 3.5 L7 0.5 L8.7 3.5 Z" fill="#aab0b8"/><circle cx="7" cy="3.6" r="1.7" fill="#8a9099"/><path d="M3 9 L15 0.5" stroke="#c8b27a" stroke-width="1"/></svg>',
  rifleman: '<svg viewBox="0 0 16 16"><path d="M4 6 Q4 2.5 8 2.5 Q12 2.5 12 6 Z" fill="#4b5536"/><circle cx="8" cy="6.5" r="2.2" fill="#e2b68c"/><rect x="5" y="9" width="6" height="6" rx="1" fill="#5d6b3f"/><rect x="6" y="9.5" width="4" height="3" fill="currentColor"/><path d="M3 12 L15 8" stroke="#3b2f25" stroke-width="1.5"/></svg>',
  machine_gun: '<svg viewBox="0 0 16 16"><path d="M1 6 Q1 3 4 3 Q7 3 7 6 Z" fill="#4b5536"/><circle cx="4" cy="6.5" r="1.8" fill="#e2b68c"/><rect x="1.5" y="8.5" width="5" height="5" fill="currentColor"/><path d="M5 10 L15.5 8.5" stroke="#2b2b2b" stroke-width="2"/><path d="M10 10 L8 15 M10 10 L12.5 15" stroke="#2b2b2b" stroke-width="1"/></svg>',
  antitank: '<svg viewBox="0 0 16 16"><path d="M4 7 Q4 3.5 8 3.5 Q12 3.5 12 7 Z" fill="#4b5536"/><circle cx="8" cy="7.5" r="2" fill="#e2b68c"/><rect x="5" y="10" width="6" height="5.5" rx="1" fill="currentColor"/><path d="M1 8 L15 5" stroke="#4a5238" stroke-width="2.6"/></svg>',
  light_vehicle: '<svg viewBox="0 0 16 16"><path d="M1 12 L15 12 L15 8.5 L10 8 L8.5 5.5 L1 5.5 Z" fill="#6b7040"/><rect x="1" y="9" width="14" height="1.6" fill="currentColor"/><path d="M4 5 L11 2" stroke="#2b2b2b" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="2.2" fill="#1f1f1f"/><circle cx="12" cy="12.5" r="2.2" fill="#1f1f1f"/></svg>',
  mech_infantry: '<svg viewBox="0 0 16 16"><path d="M1 12 L15 12 L15 8 L11 6 L1 6 Z" fill="#5b6446"/><rect x="1" y="8.5" width="12" height="1.6" fill="currentColor"/><circle cx="4" cy="5" r="1.6" fill="#4b5536"/><circle cx="7.5" cy="5" r="1.6" fill="#4b5536"/><rect x="1" y="11.5" width="8" height="3" rx="1.5" fill="#2f3329"/><circle cx="13" cy="13" r="2" fill="#1f1f1f"/></svg>',
  artillery: '<svg viewBox="0 0 16 16"><path d="M5 10 L1 14" stroke="#4b4f3f" stroke-width="1.6"/><path d="M5 9 L15 3" stroke="#3d4436" stroke-width="2.4"/><path d="M6 5 L9 4 L9 10 L6 11 Z" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="#1f1f1f"/><circle cx="6" cy="12" r="1.2" fill="#6d6d6d"/></svg>',
  heavy_artillery: '<svg viewBox="0 0 16 16"><rect x="1" y="10" width="12" height="3" fill="#4b4f3f"/><path d="M3 10 L15.5 2" stroke="#3d4436" stroke-width="3.2"/><path d="M4 5 L8 4 L8 10 L4 11 Z" fill="currentColor"/><circle cx="3.5" cy="13.5" r="2" fill="#1f1f1f"/><circle cx="10" cy="13.5" r="2" fill="#1f1f1f"/></svg>',
  tank: '<svg viewBox="0 0 16 16"><rect x="1" y="10" width="14" height="4.5" rx="2.2" fill="#2f3329"/><path d="M1.5 10 L14.5 10 L13 6.5 L3 6.5 Z" fill="#5b6446"/><rect x="2.5" y="7.8" width="11" height="1.4" fill="currentColor"/><path d="M5 6.5 L11 6.5 L10.5 3.5 L5.5 3.5 Z" fill="#66704e"/><path d="M10 5 L16 4.3" stroke="#4b543a" stroke-width="1.6"/></svg>',
  airplane: '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="7.5" ry="2" fill="#7b8468"/><path d="M6 8.5 L9 8.5 L8 14 L4.5 14 Z" fill="#6b7359"/><path d="M6.5 7.5 L9 7.5 L8 3 L5.5 3 Z" fill="#5e6650"/><path d="M0.5 8 L2.5 8 L1 4 Z" fill="currentColor"/><circle cx="6.5" cy="11.5" r="1.1" fill="currentColor"/><rect x="15" y="5.5" width="1" height="5" fill="#ddd"/></svg>',
  tech: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.2" fill="#c9ccd1" stroke="#6d7077" stroke-width="1.6" stroke-dasharray="2.2 1.3"/><circle cx="8" cy="8" r="2" fill="#6d7077"/></svg>',
  era: '<svg viewBox="0 0 16 16"><path d="M8 1 L10 6 L15.5 6.3 L11.2 9.6 L12.7 15 L8 12 L3.3 15 L4.8 9.6 L0.5 6.3 L6 6 Z" fill="#f0c14b" stroke="#a87b1f" stroke-width="0.8"/></svg>',
};

/** Ícono de un elemento de la cola: la unidad, o un engranaje / estrella para las tecnologías. */
function queueIcon(q: { unit?: UnitType; tech?: TechId }): string {
  if (q.tech) return TECH_DEFS[q.tech].advancesTo ? ICONS.era : ICONS.tech;
  return ICONS[q.unit!];
}

const STATE_TEXT: Record<UnitView['state'], string> = {
  idle: 'Idle',
  moving: 'Walking',
  toResource: 'Going to gather',
  gathering: 'Gathering',
  returning: 'Carrying resources to a drop-off',
  toBuild: 'Going to build',
  building: 'Building',
  attacking: 'Attacking',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Asigna innerHTML solo si cambió (evita redibujar el DOM 10 veces por segundo). */
function setHtml(node: HTMLElement, html: string): void {
  if (node.dataset.html !== html) {
    node.dataset.html = html;
    node.innerHTML = html;
  }
}

/** Costo con íconos; en rojo lo que falta. */
function costHtml(cost: Cost, have?: Record<ResourceType, number>): string {
  return RESOURCE_TYPES.filter((r) => cost[r])
    .map((r) => `<span class="cost ${have && have[r] < cost[r]! ? 'short' : ''}"><span class="icon mini">${ICONS[r]}</span>${cost[r]}</span>`)
    .join(' ');
}

const NOTICE_MS = 4000;

/** Datos del profesor cuando mira una partida. */
export interface SpectatorInfo {
  code: string;
  paused: boolean;
}

export type TeacherAction = 'pause' | 'resume' | 'end' | 'back';

export class Hud {
  private notices: { text: string; until: number }[] = [];
  /** Solo cuando mira el profesor. */
  spectator: SpectatorInfo | null = null;
  onTeacherAction: (a: TeacherAction) => void = () => {};

  constructor(
    private state: ClientState,
    private input: Input,
  ) {
    el('selection-grid').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>('[data-id]');
      if (card) return this.input.selectOnly({ kind: 'unit', id: Number(card.dataset.id) });
      const queued = target.closest<HTMLElement>('[data-action="cancel"]');
      if (queued) this.input.cancelTrain(Number(queued.dataset.arg));
    });
    el('actions').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn || btn.hasAttribute('disabled')) return;
      const arg = btn.dataset.arg ?? '';
      switch (btn.dataset.action) {
        case 'teacher':
          return this.onTeacherAction(arg as TeacherAction);
        case 'stop':
          return this.input.stopSelected();
        case 'delete':
          return this.input.deleteSelected();
        case 'build':
          return this.input.startPlacing(arg as (typeof BUILD_MENU)[number]);
        case 'act':
          return this.input.act(Number(arg));
        case 'cancel':
          return this.input.cancelTrain(Number(arg));
      }
    });
    el('btn-idle').addEventListener('click', () => this.input.nextIdleWorker());
    el('btn-home').addEventListener('click', () => this.input.goHome());
    // La era se avanza en el Centro Urbano: pulsar la facción/era lleva allí.
    el('faction').addEventListener('click', () => this.input.goHome());
  }

  setStatus(s: NetStatus): void {
    const overlay = el('overlay');
    const text: Record<NetStatus, string> = {
      connecting: 'Connecting to the server…',
      online: '',
      offline: 'Connection lost. Retrying…',
    };
    overlay.textContent = text[s];
    overlay.classList.toggle('hidden', s === 'online');
  }

  update(): void {
    this.renderClock();
    this.renderTop();
    this.renderInfo();
    this.renderBottom();
    this.renderNotices();
  }

  // ---------- Barra superior ----------

  private renderClock(): void {
    const [elapsed, limit] = this.state.clock;
    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const box = el('clock');
    if (limit > 0) {
      const left = Math.max(0, limit - elapsed);
      setHtml(box, `⏱ ${fmt(left)}`);
      box.title = 'Time left';
      box.classList.toggle('warn', left <= 120);
    } else {
      setHtml(box, `⏱ ${fmt(elapsed)}`);
      box.title = 'Game time';
    }
  }

  private renderTop(): void {
    const spectating = this.state.spectator;
    for (const id of ['btn-home', 'btn-idle', 'faction']) el(id).classList.toggle('hidden', spectating);
    if (spectating) {
      setHtml(
        el('resources'),
        `<div class="spectating">👁 Watching game <b>${esc(this.spectator?.code ?? '')}</b>
          <span class="muted">(you see the whole map; you give no orders)</span></div>`,
      );
      this.renderPlayerDots();
      return;
    }
    const e = this.state.economy;
    if (!e) return;
    const res = RESOURCE_TYPES.map(
      (r) => `<div class="res" title="${RESOURCE_LABELS[r]}">
        <span class="icon">${ICONS[r]}</span>
        <div><div class="amount">${Math.floor(e.resources[r])}</div>
        <div class="sub"><span class="icon mini">${ICONS.worker}</span>${e.workers[r]} · +${e.perMinute[r]}/min</div></div>
      </div>`,
    ).join('');
    const full = e.pop >= e.popCap;
    const pop = `<div class="res ${full ? 'warn' : ''}" title="Population: units / limit (build houses to raise it)"><span class="icon">${ICONS.pop}</span>
      <div><div class="amount">${e.pop}/${e.popCap}</div><div class="sub">Population</div></div></div>`;
    setHtml(el('resources'), res + pop);

    const idle = el('btn-idle');
    setHtml(idle, `<span class="icon mini">${ICONS.worker}</span> Idle: ${e.workers.idle}`);
    idle.classList.toggle('alert', e.workers.idle > 0);

    const me = this.state.players.get(this.state.you);
    if (me) {
      const f = FACTIONS[me.faction];
      const era = this.state.eraOf(me.id);
      const techs = techsOf(this.state.techsOf(me.id)).filter((t) => !TECH_DEFS[t].advancesTo);
      const tip =
        `${f.name}: «${f.motto}»\n\nStrong in:\n• ${f.strengths.join('\n• ')}\n\nWeak in:\n• ${f.weaknesses.join('\n• ')}` +
        `\n\n${eraLabel(era)}\nTechnologies: ${techs.length ? techs.map((t) => TECH_DEFS[t].label).join(', ') : 'none yet'}` +
        '\n\nClick: go to your Town Center (you advance the age there)';
      const box = el('faction');
      setHtml(box, `<i style="background:${me.color}"></i>${esc(f.name)} <span class="era-tag"><span class="icon mini">${ICONS.era}</span>${ERAS[era - 1].short}</span>`);
      box.title = tip;
    }
    this.renderPlayerDots();
  }

  /** Un cuadrito por jugador (cabe con 16); el nombre aparece al pasar el ratón. */
  private renderPlayerDots(): void {
    const all = [...this.state.players.values()];
    const online = all.filter((p) => p.connected).length;
    const players =
      `<span class="count">${online}/${all.length}</span>` +
      all
        .map(
          (p) =>
            `<i class="dot ${p.connected ? '' : 'off'} ${p.id === this.state.you ? 'me' : ''}" style="background:${p.color}"
              title="${esc(p.name)}${p.id === this.state.you ? ' (you)' : ''} · ${esc(FACTIONS[p.faction].name)} · ${eraLabel(this.state.eraOf(p.id))} · ${p.connected ? 'connected' : 'not connected'}"></i>`,
        )
        .join('');
    setHtml(el('players'), players);
  }

  // ---------- Panel izquierdo ----------

  private renderInfo(): void {
    const sel = this.input.sel;
    const box = el('info');
    let html = '';
    if (sel.units.size === 1) {
      const u = this.state.units.get([...sel.units][0])?.v;
      if (u) html = this.unitInfo(u);
    } else if (sel.units.size > 1) {
      const units = [...sel.units].map((id) => this.state.units.get(id)?.v).filter((u): u is UnitView => !!u);
      const groups: Record<string, number> = {};
      for (const u of units) {
        const k = UNIT_DEFS[u.type].label;
        groups[k] = (groups[k] ?? 0) + 1;
      }
      html = `<h3>${units.length} units</h3>` + Object.entries(groups).map(([k, n]) => `<div class="row">${esc(k)}: <b>${n}</b></div>`).join('');
    } else if (sel.building !== null) {
      const b = this.state.buildings.get(sel.building);
      if (b) html = this.buildingInfo(b);
    } else if (sel.node !== null) {
      const n = this.state.nodes.get(sel.node);
      if (n) {
        const def = NODE_DEFS[n.type];
        html = `<h3>${def.label}</h3><div class="row"><span class="icon mini">${ICONS[def.resource]}</span>
          <b>${n.amount}</b> ${RESOURCE_LABELS[def.resource]} left</div>`;
      }
    }
    setHtml(box, html);
    box.classList.toggle('hidden', html === '');
  }

  private unitInfo(u: UnitView): string {
    const def = UNIT_DEFS[u.type];
    const st = this.state.statsOf(u.owner, u.type);
    const task = u.task ? ` ${RESOURCE_LABELS[u.task]}` : '';
    const doing = u.state === 'gathering' || u.state === 'toResource' ? STATE_TEXT[u.state] + task : STATE_TEXT[u.state];
    const carry =
      u.carryType && u.carryAmount
        ? `<div class="row"><span class="icon mini">${ICONS[u.carryType]}</span>Carrying: ${u.carryAmount}/${carryCapacity(this.state.techsOf(u.owner))}</div>`
        : '';
    // Comparación con la unidad "base": muestra la ventaja o desventaja de la facción.
    const mark = (val: number, base: number, fmt = (v: number) => String(Math.round(v * 10) / 10)) =>
      val > base + 1e-6 ? `<b class="up">${fmt(val)} ▲</b>` : val < base - 1e-6 ? `<b class="down">${fmt(val)} ▼</b>` : `<b>${fmt(val)}</b>`;
    const range = st.attack.type === 'ranged' ? `range ${mark(st.attack.range, def.attack.range)}` : 'melee';
    return `<h3>${def.label}</h3>${this.ownerLine(u.owner)}${hpBar(u.hp, st.hp)}
      <div class="row">${doing}</div>${carry}
      <div class="stats">
        <div>Attack ${mark(st.attack.damage, def.attack.damage)} (${range})</div>
        <div>Armor ${mark(st.armor.melee, def.armor.melee)} / ${mark(st.armor.ranged, def.armor.ranged)}</div>
        <div>Speed ${mark(st.speed, def.speed, (v) => v.toFixed(1))} · Health ${mark(st.hp, def.hp)}</div>
        <div class="muted">${CATEGORY_LABELS[st.category]}${st.flies ? ' (flies)' : ''} · ${esc(def.strong)}. ${esc(def.weak)}.</div>
      </div>`;
  }

  private buildingInfo(b: BuildingView): string {
    const def = BUILDING_DEFS[b.type];
    const max = this.state.maxHpOf(b);
    let html = `<h3>${def.label}</h3>${this.ownerLine(b.owner)}${hpBar(b.hp, max)}`;
    if (b.progress < 1) return html + `<div class="row">Under construction: <b>${Math.floor(b.progress * 100)}%</b></div>`;
    html += `<div class="row muted">${esc(def.description)}</div>`;
    if (b.type === 'farm') html += `<div class="row"><span class="icon mini">${ICONS.food}</span><b>${b.food ?? 0}</b> Food left</div>`;
    if (def.popProvided) html += `<div class="row">Population: +${def.popProvided}</div>`;
    if (def.attack) html += `<div class="row">Shoots: ${def.attack.damage} damage, range ${def.attack.range} (airplanes too)</div>`;
    if (b.type === 'gate') html += '<div class="row">Your units and your allies pass through; enemies do not.</div>';
    return html;
  }

  private ownerLine(owner: number): string {
    const p = this.state.players.get(owner);
    if (!p) return '';
    const who = owner === this.state.you ? 'Yours' : esc(p.name);
    const rel = this.state.spectator || owner === this.state.you ? '' : ` · <span class="rel ${this.state.relation(this.state.you, owner)}">${RELATION_LABELS[this.state.relation(this.state.you, owner)]}</span>`;
    return `<div class="row owner"><i style="background:${p.color}"></i>${who} · ${esc(FACTIONS[p.faction].name)}${rel}</div>`;
  }

  // ---------- Barra inferior ----------

  private renderBottom(): void {
    const sel = this.input.sel;
    const units = [...sel.units].map((id) => this.state.units.get(id)?.v).filter((u): u is UnitView => !!u);
    const cards = units
      .slice(0, 36)
      .map((u) => {
        const frac = u.hp / this.state.statsOf(u.owner, u.type).hp;
        return `<div class="card" data-id="${u.id}" title="${UNIT_DEFS[u.type].label}" style="color:${this.state.color(u.owner)}">
          ${ICONS[u.type]}<div class="hp"><div style="width:${Math.round(frac * 100)}%"></div></div></div>`;
      })
      .join('');
    if (this.state.spectator) {
      setHtml(el('selection-grid'), this.economyTable());
      setHtml(el('actions'), this.teacherActions());
      return;
    }
    const b = this.input.ownBuilding();
    setHtml(el('selection-grid'), units.length > 0 ? cards : b ? this.queueHtml(b) : '');
    setHtml(el('actions'), this.actionsHtml(b));
  }

  /** Profesor: economía de cada estudiante (se actualiza cada segundo). */
  private economyTable(): string {
    const rows = [...this.state.players.values()]
      .map((p) => {
        const e = this.state.economies.get(p.id);
        if (!e) return '';
        const cells = RESOURCE_TYPES.map((r) => `<td>${Math.floor(e.resources[r])}</td>`).join('');
        return `<tr class="${p.connected ? '' : 'off'}"><td><i style="background:${p.color}"></i>${esc(p.name)}</td>${cells}
          <td>${e.pop}/${e.popCap}</td><td class="${e.workers.idle > 0 ? 'warn-text' : ''}">${e.workers.idle}</td>
          <td title="${eraLabel(this.state.eraOf(p.id))}">${ERAS[this.state.eraOf(p.id) - 1].short}</td></tr>`;
      })
      .join('');
    const head = RESOURCE_TYPES.map((r) => `<th title="${RESOURCE_LABELS[r]}"><span class="icon mini">${ICONS[r]}</span></th>`).join('');
    return `<table class="eco"><tr><th>Player</th>${head}<th>Pop.</th><th title="Idle workers">Idle</th><th>Age</th></tr>${rows}</table>`;
  }

  private teacherActions(): string {
    const paused = this.spectator?.paused;
    return `<button class="act small" data-action="teacher" data-arg="${paused ? 'resume' : 'pause'}">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="act small" data-action="teacher" data-arg="end">■ End game</button>
      <button class="act small" data-action="teacher" data-arg="back">← Back to the panel</button>
      <p class="hint">Click units or buildings to see their information. Drag on the minimap to move around the map.</p>`;
  }

  private actionsHtml(b: BuildingView | undefined): string {
    const have = this.state.economy?.resources;
    const own = this.input.ownSelected();
    const workers = this.input.ownWorkersSelected();
    if (this.input.ghost) {
      const def = BUILDING_DEFS[this.input.ghost.type];
      return `<p class="hint"><b>Placing: ${def.label}</b>. Left click to build (Shift: several).
        Right click or Esc to cancel. Green = OK, red = not allowed.</p>`;
    }
    if (workers.length > 0) {
      const menu = this.input.buildMenu();
      const buttons = menu.map((type, i) => {
        const def = BUILDING_DEFS[type];
        const ok = !have || canAfford(have, def.cost);
        return `<button class="act" data-action="build" data-arg="${type}" ${ok ? '' : 'disabled'} title="${esc(def.description)}">
          <span class="key">${ACTION_KEYS[i]}</span><b>${def.label}</b><span class="costs">${costHtml(def.cost, have)}</span></button>`;
      }).join('');
      const next = BUILD_MENU.filter((t) => !menu.includes(t)).map((t) => BUILDING_DEFS[t]);
      const locked = next.length
        ? `<p class="hint">In the ${eraLabel(next[0].era)}: ${next.filter((d) => d.era === next[0].era).map((d) => d.label).join(', ')}.</p>`
        : '';
      return `${buttons}<button class="act small" data-action="stop" title="Stop">■ Stop</button>${locked}
        <button class="act small" data-action="delete" title="Delete (Del)">✖ Delete</button>
        <p class="hint">Right click: resource = gather · enemy = attack · foundation or damaged building = build/repair.</p>`;
    }
    if (own.length > 0) {
      return `<button class="act small" data-action="stop">■ Stop</button>
        <button class="act small" data-action="delete" title="Delete (Del)">✖ Delete</button>
        <p class="hint">Right click an enemy to attack, or the ground to move.
        Idle troops attack the enemies they see on their own.</p>`;
    }
    if (b) {
      const def = BUILDING_DEFS[b.type];
      if (b.progress < 1)
        return `<button class="act small" data-action="delete" title="Cancel and get back what was not built yet">✖ Cancel construction</button>
          <p class="hint">Select workers and right click the foundation to help.</p>`;
      const actions = this.input.buildingActions(b);
      const buttons = actions.map((a, i) => (a.kind === 'train' ? this.trainButton(a.unit, i) : this.researchButton(a.tech, i))).join('');
      const rally = actions.some((a) => a.kind === 'train') ? '<p class="hint">Right click on the map: rally point (on a resource, new workers go gather it).</p>' : '';
      const warn = b.needsHouses ? '<p class="warn-text">⚠ Population limit reached: build more houses.</p>' : '';
      return `${buttons}${b.type !== 'town_center' ? '<button class="act small" data-action="delete">✖ Delete</button>' : ''}${warn}${rally}`;
    }
    return `<p class="hint">Drag to select. <b>H</b>: Town Center (advance age there) · <b>.</b>: idle worker ·
      <b>WASD</b>/arrows: camera · wheel: zoom · <b>Q E R T</b>…: build / train / research.</p>`;
  }

  private trainButton(type: UnitType, i: number): string {
    const have = this.state.economy?.resources;
    const u = UNIT_DEFS[type];
    const st = this.state.statsOf(this.state.you, type);
    const ok = !have || canAfford(have, u.cost);
    const tip = `${u.label}: ${u.strong}. ${u.weak}.\nHealth ${st.hp} · Attack ${st.attack.damage} · Speed ${st.speed.toFixed(1)} · ${u.trainTime} s`;
    return `<button class="act with-icon" data-action="act" data-arg="${i}" ${ok ? '' : 'disabled'} title="${esc(tip)}">
      <span class="key">${ACTION_KEYS[i] ?? ''}</span><span class="icon unit" style="color:${this.state.color(this.state.you)}">${ICONS[type]}</span>
      <b>${u.label}</b><span class="costs">${costHtml(u.cost, have)}</span></button>`;
  }

  private researchButton(tech: TechId, i: number): string {
    const have = this.state.economy?.resources;
    const t = TECH_DEFS[tech];
    const missing = t.requires && !this.input.hasFinished(t.requires) ? BUILDING_DEFS[t.requires].label : '';
    const ok = !missing && (!have || canAfford(have, t.cost));
    const tip = `${t.label}: ${t.description}\n${t.time} s${missing ? `\nYou need a finished ${missing}.` : ''}`;
    return `<button class="act with-icon ${t.advancesTo ? 'era-btn' : 'tech-btn'}" data-action="act" data-arg="${i}" ${ok ? '' : 'disabled'} title="${esc(tip)}">
      <span class="key">${ACTION_KEYS[i] ?? ''}</span><span class="icon unit">${t.advancesTo ? ICONS.era : ICONS.tech}</span>
      <b>${t.label}</b><span class="costs">${missing ? `<span class="cost short">Needs: ${esc(missing)}</span>` : costHtml(t.cost, have)}</span></button>`;
  }

  /** Cola de producción del edificio elegido: clic en un elemento para cancelarlo. */
  private queueHtml(b: BuildingView): string {
    if (!b.queue || b.queue.length === 0) return '';
    return b.queue
      .map(
        (q, i) => `<button class="card queue" data-action="cancel" data-arg="${i}" title="Click to cancel (refunds the cost)"
          style="color:${this.state.color(this.state.you)}">${queueIcon(q)}
          <div class="hp prog"><div style="width:${Math.round(q.progress * 100)}%"></div></div></button>`,
      )
      .join('');
  }

  // ---------- Avisos ----------

  private renderNotices(): void {
    const now = performance.now();
    for (const text of this.state.notices.splice(0)) {
      this.notices = this.notices.filter((n) => n.text !== text);
      this.notices.push({ text, until: now + NOTICE_MS });
    }
    this.notices = this.notices.filter((n) => n.until > now).slice(-4);
    setHtml(el('notices'), this.notices.map((n) => `<div class="notice">${esc(n.text)}</div>`).join(''));
  }
}

function hpBar(hp: number, max: number): string {
  const frac = Math.max(0, Math.min(1, hp / max));
  return `<div class="hpbar"><div style="width:${Math.round(frac * 100)}%"></div><span>${Math.ceil(hp)}/${max}</span></div>`;
}
