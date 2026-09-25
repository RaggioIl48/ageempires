// Interfaz en HTML sobre el lienzo: recursos arriba, información de la
// selección a la izquierda, unidades seleccionadas y acciones abajo.

import {
  BUILDING_DEFS,
  BUILD_MENU,
  CATEGORY_LABELS,
  FACTIONS,
  NODE_DEFS,
  RELATION_LABELS,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  UNIT_DEFS,
  WORKER_CARRY_CAPACITY,
  type Cost,
  type ResourceType,
  type UnitType,
} from '../../shared/data.ts';
import type { BuildingView, UnitView } from '../../shared/protocol.ts';
import { canAfford, unitStats } from '../../shared/stats.ts';
import { ACTION_KEYS, type Input } from './input.ts';
import type { NetStatus } from './net.ts';
import type { ClientState } from './state.ts';

// Íconos originales (SVG sencillos).
const ICONS: Record<ResourceType | 'pop' | UnitType, string> = {
  food: '<svg viewBox="0 0 16 16"><circle cx="5" cy="9" r="3.2" fill="#d8434f"/><circle cx="10.5" cy="9.5" r="3.2" fill="#c23644"/><circle cx="8" cy="5.5" r="3" fill="#e0525d"/><path d="M8 2.5 L9.5 0.8" stroke="#3f7c35" stroke-width="1.4"/></svg>',
  wood: '<svg viewBox="0 0 16 16"><rect x="1" y="5" width="13" height="6" rx="3" fill="#8a5a2b"/><ellipse cx="13" cy="8" rx="2.2" ry="3" fill="#d9b27c"/><ellipse cx="13" cy="8" rx="1" ry="1.4" fill="#a8783e"/></svg>',
  stone: '<svg viewBox="0 0 16 16"><path d="M1 13 L3 6 L8 3 L13 5 L15 12 Z" fill="#b3b3ad"/><path d="M8 3 L13 5 L15 12 L9 13 Z" fill="#85857f"/></svg>',
  metal: '<svg viewBox="0 0 16 16"><path d="M2 12 L4.5 5 L13.5 5 L15 12 Z" fill="#8fa9c4"/><path d="M4.5 5 L13.5 5 L12.5 7 L5.5 7 Z" fill="#cfdceb"/></svg>',
  pop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4.5" r="3" fill="#e2b68c"/><path d="M3 15 Q3 8.5 8 8.5 Q13 8.5 13 15 Z" fill="#6c8fd6"/></svg>',
  worker: '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="3.5" rx="4.5" ry="1.4" fill="#d8c070"/><circle cx="8" cy="5.5" r="2.6" fill="#e2b68c"/><rect x="4.5" y="8" width="7" height="7" rx="1" fill="currentColor"/></svg>',
  warrior: '<svg viewBox="0 0 16 16"><path d="M5 5 L8 1 L11 5 Z" fill="#8a9099"/><circle cx="8" cy="6" r="2.4" fill="#e2b68c"/><rect x="5" y="8.5" width="6" height="6.5" rx="1" fill="currentColor"/><ellipse cx="4" cy="11" rx="2.6" ry="3.2" fill="#d9d2c0"/><path d="M12 13 L15 4" stroke="#cfd3d8" stroke-width="1.4"/></svg>',
  scout: '<svg viewBox="0 0 16 16"><ellipse cx="7" cy="11" rx="5.5" ry="2.8" fill="#8a5a3b"/><path d="M11 10 L14.5 6.5 L15.5 8 L12.5 11 Z" fill="#7a4d31"/><rect x="5" y="4.5" width="4" height="5" fill="currentColor"/><circle cx="7" cy="3.2" r="1.8" fill="#e2b68c"/><path d="M3 9 L13 1" stroke="#c8b27a" stroke-width="1"/></svg>',
};

const STATE_TEXT: Record<UnitView['state'], string> = {
  idle: 'Inactivo',
  moving: 'Caminando',
  toResource: 'Yendo a recolectar',
  gathering: 'Recolectando',
  returning: 'Llevando carga al depósito',
  toBuild: 'Yendo a construir',
  building: 'Construyendo',
  attacking: 'Atacando',
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
        case 'train':
          return this.input.train(Number(arg));
        case 'cancel':
          return this.input.cancelTrain(Number(arg));
      }
    });
    el('btn-idle').addEventListener('click', () => this.input.nextIdleWorker());
    el('btn-home').addEventListener('click', () => this.input.goHome());
  }

  setStatus(s: NetStatus): void {
    const overlay = el('overlay');
    const text: Record<NetStatus, string> = {
      connecting: 'Conectando con el servidor…',
      online: '',
      offline: 'Se perdió la conexión. Reintentando…',
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
      box.title = 'Tiempo que queda';
      box.classList.toggle('warn', left <= 120);
    } else {
      setHtml(box, `⏱ ${fmt(elapsed)}`);
      box.title = 'Tiempo de partida';
    }
  }

  private renderTop(): void {
    const spectating = this.state.spectator;
    for (const id of ['btn-home', 'btn-idle', 'faction']) el(id).classList.toggle('hidden', spectating);
    if (spectating) {
      setHtml(
        el('resources'),
        `<div class="spectating">👁 Observando la partida <b>${esc(this.spectator?.code ?? '')}</b>
          <span class="muted">(ves todo el mapa; no das órdenes)</span></div>`,
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
    const pop = `<div class="res ${full ? 'warn' : ''}" title="Población: unidades / máximo (construye casas para subirlo)"><span class="icon">${ICONS.pop}</span>
      <div><div class="amount">${e.pop}/${e.popCap}</div><div class="sub">Población</div></div></div>`;
    setHtml(el('resources'), res + pop);

    const idle = el('btn-idle');
    setHtml(idle, `<span class="icon mini">${ICONS.worker}</span> Inactivos: ${e.workers.idle}`);
    idle.classList.toggle('alert', e.workers.idle > 0);

    const me = this.state.players.get(this.state.you);
    if (me) {
      const f = FACTIONS[me.faction];
      const tip = `${f.name}: «${f.motto}»\n\nFuerte en:\n• ${f.strengths.join('\n• ')}\n\nDébil en:\n• ${f.weaknesses.join('\n• ')}`;
      const box = el('faction');
      setHtml(box, `<i style="background:${me.color}"></i>${esc(f.name)}`);
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
              title="${esc(p.name)}${p.id === this.state.you ? ' (tú)' : ''} · ${esc(FACTIONS[p.faction].name)} · ${p.connected ? 'conectado' : 'sin conectar'}"></i>`,
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
      html = `<h3>${units.length} unidades</h3>` + Object.entries(groups).map(([k, n]) => `<div class="row">${esc(k)}: <b>${n}</b></div>`).join('');
    } else if (sel.building !== null) {
      const b = this.state.buildings.get(sel.building);
      if (b) html = this.buildingInfo(b);
    } else if (sel.node !== null) {
      const n = this.state.nodes.get(sel.node);
      if (n) {
        const def = NODE_DEFS[n.type];
        html = `<h3>${def.label}</h3><div class="row"><span class="icon mini">${ICONS[def.resource]}</span>
          Quedan <b>${n.amount}</b> de ${RESOURCE_LABELS[def.resource]}</div>`;
      }
    }
    setHtml(box, html);
    box.classList.toggle('hidden', html === '');
  }

  private unitInfo(u: UnitView): string {
    const def = UNIT_DEFS[u.type];
    const faction = this.state.faction(u.owner);
    const st = unitStats(faction, u.type);
    const task = u.task ? ` ${RESOURCE_LABELS[u.task]}` : '';
    const doing = u.state === 'gathering' || u.state === 'toResource' ? STATE_TEXT[u.state] + task : STATE_TEXT[u.state];
    const carry =
      u.carryType && u.carryAmount
        ? `<div class="row"><span class="icon mini">${ICONS[u.carryType]}</span>Carga: ${u.carryAmount}/${WORKER_CARRY_CAPACITY}</div>`
        : '';
    // Comparación con la unidad "base": muestra la ventaja o desventaja de la facción.
    const mark = (val: number, base: number, fmt = (v: number) => String(Math.round(v * 10) / 10)) =>
      val > base + 1e-6 ? `<b class="up">${fmt(val)} ▲</b>` : val < base - 1e-6 ? `<b class="down">${fmt(val)} ▼</b>` : `<b>${fmt(val)}</b>`;
    const range = st.attack.type === 'ranged' ? `alcance ${mark(st.attack.range, def.attack.range)}` : 'cuerpo a cuerpo';
    return `<h3>${def.label}</h3>${this.ownerLine(u.owner)}${hpBar(u.hp, st.hp)}
      <div class="row">${doing}</div>${carry}
      <div class="stats">
        <div>Ataque ${mark(st.attack.damage, def.attack.damage)} (${range})</div>
        <div>Armadura ${mark(st.armor.melee, def.armor.melee)} / ${mark(st.armor.ranged, def.armor.ranged)}</div>
        <div>Velocidad ${mark(st.speed, def.speed, (v) => v.toFixed(1))} · Vida ${mark(st.hp, def.hp)}</div>
        <div class="muted">${CATEGORY_LABELS[st.category]} · ${esc(def.strong)}. ${esc(def.weak)}.</div>
      </div>`;
  }

  private buildingInfo(b: BuildingView): string {
    const def = BUILDING_DEFS[b.type];
    const max = this.state.maxHpOf(b);
    let html = `<h3>${def.label}</h3>${this.ownerLine(b.owner)}${hpBar(b.hp, max)}`;
    if (b.progress < 1) return html + `<div class="row">En construcción: <b>${Math.floor(b.progress * 100)}%</b></div>`;
    html += `<div class="row muted">${esc(def.description)}</div>`;
    if (b.type === 'farm') html += `<div class="row"><span class="icon mini">${ICONS.food}</span>Quedan <b>${b.food ?? 0}</b> de Comida</div>`;
    if (def.popProvided) html += `<div class="row">Población: +${def.popProvided}</div>`;
    if (def.attack) html += `<div class="row">Dispara flechas: ${def.attack.damage} de daño, alcance ${def.attack.range}</div>`;
    return html;
  }

  private ownerLine(owner: number): string {
    const p = this.state.players.get(owner);
    if (!p) return '';
    const who = owner === this.state.you ? 'Tuyo' : esc(p.name);
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
        const frac = u.hp / unitStats(this.state.faction(u.owner), u.type).hp;
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
          <td>${e.pop}/${e.popCap}</td><td class="${e.workers.idle > 0 ? 'warn-text' : ''}">${e.workers.idle}</td></tr>`;
      })
      .join('');
    const head = RESOURCE_TYPES.map((r) => `<th title="${RESOURCE_LABELS[r]}"><span class="icon mini">${ICONS[r]}</span></th>`).join('');
    return `<table class="eco"><tr><th>Jugador</th>${head}<th>Pobl.</th><th title="Trabajadores inactivos">Inact.</th></tr>${rows}</table>`;
  }

  private teacherActions(): string {
    const paused = this.spectator?.paused;
    return `<button class="act small" data-action="teacher" data-arg="${paused ? 'resume' : 'pause'}">${paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
      <button class="act small" data-action="teacher" data-arg="end">■ Terminar partida</button>
      <button class="act small" data-action="teacher" data-arg="back">← Volver al panel</button>
      <p class="hint">Haz clic en unidades o edificios para ver su información. Arrastra el minimapa para recorrer el mapa.</p>`;
  }

  private actionsHtml(b: BuildingView | undefined): string {
    const have = this.state.economy?.resources;
    const own = this.input.ownSelected();
    const workers = this.input.ownWorkersSelected();
    if (this.input.ghost) {
      const def = BUILDING_DEFS[this.input.ghost.type];
      return `<p class="hint"><b>Colocando: ${def.label}</b>. Clic izquierdo para construir (Mayús: varios).
        Clic derecho o Esc para cancelar. Verde = se puede, rojo = no.</p>`;
    }
    if (workers.length > 0) {
      const buttons = BUILD_MENU.map((type, i) => {
        const def = BUILDING_DEFS[type];
        const ok = !have || canAfford(have, def.cost);
        return `<button class="act" data-action="build" data-arg="${type}" ${ok ? '' : 'disabled'} title="${esc(def.description)}">
          <span class="key">${ACTION_KEYS[i]}</span><b>${def.label}</b><span class="costs">${costHtml(def.cost, have)}</span></button>`;
      }).join('');
      return `${buttons}<button class="act small" data-action="stop" title="Detener">■ Detener</button>
        <button class="act small" data-action="delete" title="Eliminar (Supr)">✖ Eliminar</button>
        <p class="hint">Clic derecho: recurso = recolectar · enemigo = atacar · cimiento o edificio dañado = construir/reparar.</p>`;
    }
    if (own.length > 0) {
      return `<button class="act small" data-action="stop">■ Detener</button>
        <button class="act small" data-action="delete" title="Eliminar (Supr)">✖ Eliminar</button>
        <p class="hint">Clic derecho sobre un enemigo para atacar, o en el suelo para mover.
        Las tropas quietas atacan solas a los enemigos que ven.</p>`;
    }
    if (b) {
      const def = BUILDING_DEFS[b.type];
      if (b.progress < 1)
        return `<button class="act small" data-action="delete" title="Cancelar y recuperar lo que falta por construir">✖ Cancelar construcción</button>
          <p class="hint">Selecciona trabajadores y haz clic derecho sobre el cimiento para ayudar.</p>`;
      const faction = this.state.faction(this.state.you);
      const buttons = def.trains
        .map((type, i) => {
          const u = UNIT_DEFS[type];
          const st = unitStats(faction, type);
          const ok = !have || canAfford(have, u.cost);
          const tip = `${u.label}: ${u.strong}. ${u.weak}.\nVida ${st.hp} · Ataque ${st.attack.damage} · Velocidad ${st.speed.toFixed(1)} · ${u.trainTime} s`;
          return `<button class="act with-icon" data-action="train" data-arg="${i}" ${ok ? '' : 'disabled'} title="${esc(tip)}">
            <span class="key">${ACTION_KEYS[i]}</span><span class="icon unit" style="color:${this.state.color(this.state.you)}">${ICONS[type]}</span>
            <b>${u.label}</b><span class="costs">${costHtml(u.cost, have)}</span></button>`;
        })
        .join('');
      const rally = def.trains.length > 0 ? '<p class="hint">Clic derecho en el mapa: punto de reunión (sobre un recurso, los trabajadores nuevos van a recolectar).</p>' : '';
      const warn = b.needsHouses ? '<p class="warn-text">⚠ Población máxima: construye más casas.</p>' : '';
      return `${buttons}${b.type !== 'town_center' ? '<button class="act small" data-action="delete">✖ Eliminar</button>' : ''}${warn}${rally}`;
    }
    return `<p class="hint">Arrastra para seleccionar. <b>H</b>: Centro Urbano · <b>.</b>: trabajador inactivo ·
      <b>WASD</b>/flechas: cámara · rueda: zoom · <b>Q E R T</b>: construir / entrenar.</p>`;
  }

  /** Cola de producción del edificio elegido: clic en un elemento para cancelarlo. */
  private queueHtml(b: BuildingView): string {
    if (!b.queue || b.queue.length === 0) return '';
    return b.queue
      .map(
        (q, i) => `<button class="card queue" data-action="cancel" data-arg="${i}" title="Clic para cancelar (devuelve el costo)"
          style="color:${this.state.color(this.state.you)}">${ICONS[q.unit]}
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
