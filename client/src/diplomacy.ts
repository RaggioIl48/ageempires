// Panel de diplomacia y chat de negociación. La diplomacia la decide el
// servidor: estos botones solo envían pedidos y el panel muestra lo que dice.

import { CHAT_MAX, FACTIONS, RELATION_LABELS, WAR_DELAY_SEC, type DiploAction, type Relation } from '../../shared/data.ts';
import type { Net } from './net.ts';
import { el, esc } from './screens.ts';
import type { ClientState } from './state.ts';

const REL_ICON: Record<Relation, string> = { war: '⚔', peace: '🕊', ally: '🤝' };

export class DiploPanel {
  private open = false;
  private lastKey = '';

  constructor(
    private state: ClientState,
    private net: Net,
  ) {
    el('btn-diplo').addEventListener('click', () => this.toggle());
    el('diplo-panel').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dip]');
      if (btn) {
        const action = btn.dataset.dip as DiploAction;
        const target = Number(btn.dataset.target);
        const name = this.state.players.get(target)?.name ?? '';
        if (action === 'declareWar' && !confirm(`¿Declarar la guerra a ${name}? Empezará en ${WAR_DELAY_SEC} segundos.`)) return;
        this.net.command({ kind: 'diplo', action, target });
        return;
      }
      if ((e.target as HTMLElement).closest('[data-close]')) this.toggle(false);
    });
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    el('diplo-panel').classList.toggle('hidden', !this.open);
    this.lastKey = '';
    this.update();
  }

  /** Llamar cuando llegan datos: actualiza el botón (avisos pendientes) y, si está abierto, el panel. */
  update(): void {
    const s = this.state;
    const incoming = s.proposals.filter((p) => p.to === s.you).length;
    const btn = el('btn-diplo');
    btn.removeAttribute('disabled');
    btn.title = 'Alianzas, paz y guerra';
    btn.innerHTML = `🤝 Diplomacia${incoming ? ` <span class="badge">${incoming}</span>` : ''}`;
    btn.classList.toggle('alert', incoming > 0);
    if (!this.open) return;
    const key = `${s.diploVersion}|${[...s.players.values()].map((p) => `${p.id}${p.connected}`).join()}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    el('diplo-panel').innerHTML = this.html();
  }

  private html(): string {
    const s = this.state;
    const others = [...s.players.values()].filter((p) => p.id !== s.you);
    const head = `<div class="dp-head"><h3>Diplomacia</h3><button data-close title="Cerrar">✕</button></div>`;
    const locked = s.diploLocked
      ? '<p class="muted">Equipos fijos: en esta partida las alianzas no se pueden cambiar.</p>'
      : '<p class="muted">Las alianzas y la paz necesitan que el otro acepte. La guerra empieza ' + WAR_DELAY_SEC + ' s después de declararla.</p>';
    const rows = s.spectator
      ? this.spectatorList()
      : others
          .map((p) => {
            const rel = s.relation(s.you, p.id);
            const war = s.pendingWars.find((w) => (w.from === s.you && w.to === p.id) || (w.to === s.you && w.from === p.id));
            const inc = s.proposals.find((q) => q.from === p.id && q.to === s.you);
            const out = s.proposals.find((q) => q.from === s.you && q.to === p.id);
            const b = (action: DiploAction, label: string, cls = '') =>
              `<button class="tiny ${cls}" data-dip="${action}" data-target="${p.id}">${label}</button>`;
            let actions = '';
            if (!s.diploLocked) {
              if (inc) {
                const what = inc.kind === 'alliance' ? 'una alianza' : 'la paz';
                const acc = inc.kind === 'alliance' ? 'acceptAlliance' : 'acceptPeace';
                const rej = inc.kind === 'alliance' ? 'rejectAlliance' : 'rejectPeace';
                actions += `<span class="dp-offer">Te propone ${what} (${inc.secondsLeft} s)</span>${b(acc, '✔ Aceptar', 'primary')}${b(rej, '✖ Rechazar')}`;
              } else if (out) actions += `<span class="muted">Esperando respuesta… (${out.secondsLeft} s)</span>`;
              else if (war) actions += '';
              else if (rel === 'war') actions += b('proposePeace', '🕊 Proponer paz') + b('proposeAlliance', '🤝 Proponer alianza');
              else if (rel === 'peace') actions += b('proposeAlliance', '🤝 Proponer alianza') + b('declareWar', '⚔ Declarar guerra', 'danger');
              else actions += b('breakAlliance', '💔 Romper alianza') + b('declareWar', '⚔ Declarar guerra', 'danger');
            }
            const warText = war ? `<span class="dp-war">⚔ La guerra empieza en ${war.secondsLeft} s</span>` : '';
            return `<div class="dp-row ${p.connected ? '' : 'off'}">
              <div class="dp-who"><i style="background:${p.color}"></i><b>${esc(p.name)}</b>
                <span class="muted">${esc(FACTIONS[p.faction].name)}</span></div>
              <span class="rel ${rel}">${REL_ICON[rel]} ${RELATION_LABELS[rel]}</span>${warText}
              <div class="dp-actions">${actions}</div></div>`;
          })
          .join('');
    return head + locked + `<div class="dp-list">${rows}</div>` + this.matrix();
  }

  /** Profesor: propuestas y guerras en curso de toda la clase. */
  private spectatorList(): string {
    const s = this.state;
    const name = (id: number) => esc(s.players.get(id)?.name ?? '?');
    const items = [
      ...s.proposals.map((p) => `${name(p.from)} propone ${p.kind === 'alliance' ? 'una alianza' : 'la paz'} a ${name(p.to)} (${p.secondsLeft} s)`),
      ...s.pendingWars.map((w) => `⚔ ${name(w.from)} → ${name(w.to)}: la guerra empieza en ${w.secondsLeft} s`),
    ];
    return items.length ? items.map((t) => `<div class="dp-row">${t}</div>`).join('') : '<p class="muted">Sin negociaciones en curso.</p>';
  }

  /** Tabla "¿quién está con quién?": verde aliados, amarillo paz, rojo guerra. */
  private matrix(): string {
    const ps = [...this.state.players.values()];
    const cell = (a: number, b: number) => {
      if (a === b) return '<td class="self"></td>';
      const rel = this.state.relation(a, b);
      return `<td class="${rel}" title="${RELATION_LABELS[rel]}">${REL_ICON[rel]}</td>`;
    };
    const head = ps.map((p) => `<th title="${esc(p.name)}"><i style="background:${p.color}"></i></th>`).join('');
    const rows = ps
      .map((a) => `<tr><th class="left"><i style="background:${a.color}"></i>${esc(a.name)}</th>${ps.map((b) => cell(a.id, b.id)).join('')}</tr>`)
      .join('');
    return `<h4>¿Quién está con quién?</h4><div class="dp-matrix"><table><tr><th></th>${head}</tr>${rows}</table></div>`;
  }
}

/** Chat de negociación: Enter para escribir, Tab cambia entre "Todos" y "Aliados". */
export class ChatBox {
  private scope: 'all' | 'allies' = 'all';
  private lastKey = '';

  constructor(
    private state: ClientState,
    private net: Net,
  ) {
    const form = el<HTMLFormElement>('chat-form');
    const input = el<HTMLInputElement>('chat-input');
    input.maxLength = CHAT_MAX;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target instanceof HTMLInputElement || !this.canWrite()) return;
      if (el('screen-game').classList.contains('hidden')) return;
      e.preventDefault();
      this.openInput();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeInput();
      if (e.key === 'Tab') {
        e.preventDefault();
        this.toggleScope();
      }
      e.stopPropagation(); // que las teclas del juego no se activen al escribir
    });
    el('chat-scope').addEventListener('click', () => this.toggleScope());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) this.net.send({ t: 'chat', text, to: this.scope });
      input.value = '';
      this.closeInput();
    });
  }

  private canWrite(): boolean {
    return !this.state.spectator && this.state.settings?.chat !== false;
  }

  private openInput(): void {
    el('chat-form').classList.remove('hidden');
    el<HTMLInputElement>('chat-input').focus();
    this.lastKey = '';
    this.update();
  }

  private closeInput(): void {
    el('chat-form').classList.add('hidden');
    el<HTMLInputElement>('chat-input').blur();
    this.lastKey = '';
    this.update();
  }

  private toggleScope(): void {
    this.scope = this.scope === 'all' ? 'allies' : 'all';
    el('chat-scope').textContent = this.scope === 'all' ? 'Todos' : 'Aliados';
    el('chat-scope').classList.toggle('allies', this.scope === 'allies');
  }

  /** Muestra los últimos mensajes (los viejos se desvanecen, salvo con el chat abierto). */
  update(): void {
    const open = !el('chat-form').classList.contains('hidden');
    const now = performance.now();
    const lines = this.state.chat.filter((c) => open || now - c.at < 30_000).slice(open ? -12 : -6);
    const key = `${this.state.chat.length}|${lines.length}|${open}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const hint = this.canWrite() && !open ? '<div class="chat-hint">Enter: escribir un mensaje</div>' : '';
    el('chat-log').innerHTML =
      lines
        .map(
          (c) => `<div class="chat-line">${c.to === 'allies' ? '<span class="chat-tag">[Aliados]</span> ' : ''}<b style="color:${c.color}">${esc(c.name)}:</b> ${esc(c.text)}</div>`,
        )
        .join('') + hint;
  }
}
