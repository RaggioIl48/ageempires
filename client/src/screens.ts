// Pantallas fuera del juego: inicio (nombre + código), sala de espera
// (facción y color) y panel del profesor.

import { FACTIONS, FACTION_ORDER, PLAYER_COLORS, type FactionId } from '../../shared/data.ts';
import { CODE_LENGTH, type ClientMessage, type RoomSettings, type RoomSummary, type RoomView } from '../../shared/protocol.ts';

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SCREENS = ['screen-start', 'screen-lobby', 'screen-teacher', 'screen-game'] as const;
export type ScreenId = (typeof SCREENS)[number];

export function showScreen(id: ScreenId): void {
  for (const s of SCREENS) el(s).classList.toggle('hidden', s !== id);
}

const MAP_LABEL = { small: 'pequeño', normal: 'normal', large: 'grande' } as const;
export function settingsText(s: RoomSettings): string {
  return `hasta ${s.maxPlayers} jugadores · mapa ${MAP_LABEL[s.mapSize]} · ${s.durationMin ? `${s.durationMin} minutos` : 'sin límite de tiempo'}`;
}

type Send = (m: ClientMessage) => void;

// ---------- Inicio ----------

export class StartScreen {
  constructor(onJoin: (name: string, code: string) => void) {
    const name = el<HTMLInputElement>('in-name');
    const code = el<HTMLInputElement>('in-code');
    // El código puede venir en el enlace que comparte el profesor (?c=KBTR).
    const fromUrl = new URLSearchParams(location.search).get('c');
    if (fromUrl) code.value = fromUrl.toUpperCase();
    try {
      name.value = localStorage.getItem('rts.name') ?? '';
    } catch {
      /* almacenamiento no disponible: no pasa nada */
    }
    code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '')));
    el('form-join').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim(), c = code.value.trim().toUpperCase();
      if (!n) return this.error('Escribe tu nombre.');
      if (c.length !== CODE_LENGTH) return this.error(`El código tiene ${CODE_LENGTH} letras.`);
      try {
        localStorage.setItem('rts.name', n);
      } catch {
        /* sin almacenamiento */
      }
      this.error('');
      onJoin(n, c);
    });
  }

  error(text: string): void {
    el('start-error').textContent = text;
  }

  focus(): void {
    const name = el<HTMLInputElement>('in-name');
    (name.value ? el<HTMLInputElement>('in-code') : name).focus();
  }
}

// ---------- Sala de espera ----------

export class LobbyScreen {
  private me = 0;
  private room: RoomView | null = null;

  constructor(private send: Send, onLeave: () => void) {
    el('btn-leave').addEventListener('click', onLeave);
    el('btn-start-host').addEventListener('click', () => {
      if (this.room) this.send({ t: 'start', code: this.room.code });
    });
    el('lobby-factions').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-faction]');
      if (card) this.send({ t: 'choose', faction: card.dataset.faction as FactionId });
    });
    el('lobby-colors').addEventListener('click', (e) => {
      const sw = (e.target as HTMLElement).closest<HTMLElement>('[data-color]');
      if (sw && !sw.classList.contains('taken')) this.send({ t: 'choose', color: sw.dataset.color });
    });
  }

  /** `host`: está en el computador del profesor (ve el botón para iniciar). */
  setMe(memberId: number, host: boolean): void {
    this.me = memberId;
    el('host-box').classList.toggle('hidden', !host);
  }

  error(text: string): void {
    el('lobby-error').textContent = text;
  }

  update(room: RoomView): void {
    this.room = room;
    el('lobby-code').textContent = room.code;
    el('lobby-status').textContent =
      room.phase === 'lobby' ? `Esperando a que el profesor inicie la partida… (${settingsText(room.settings)})` : 'La partida está empezando…';
    const mine = room.members.find((m) => m.id === this.me);
    el('lobby-members').innerHTML = room.members
      .map(
        (m) => `<div class="member ${m.connected ? '' : 'off'}"><i style="background:${m.color}"></i>
          <b>${esc(m.name)}</b>${m.id === this.me ? ' (tú)' : ''}<span class="muted"> · ${esc(FACTIONS[m.faction].name)}</span></div>`,
      )
      .join('');
    el('lobby-factions').innerHTML = FACTION_ORDER.map((id) => {
      const f = FACTIONS[id];
      return `<button type="button" class="faction ${mine?.faction === id ? 'chosen' : ''}" data-faction="${id}">
        <b>${esc(f.name)}</b><i>«${esc(f.motto)}»</i>
        <span class="up">▲ ${f.strengths.map(esc).join('<br>▲ ')}</span>
        <span class="down">▼ ${f.weaknesses.map(esc).join('<br>▼ ')}</span></button>`;
    }).join('');
    el('lobby-colors').innerHTML = PLAYER_COLORS.map((c) => {
      const owner = room.members.find((m) => m.color === c);
      const cls = owner?.id === this.me ? 'chosen' : owner ? 'taken' : '';
      return `<button type="button" class="swatch ${cls}" data-color="${c}" style="background:${c}"
        title="${owner ? esc(owner.name) : 'Libre'}"></button>`;
    }).join('');
  }

  get code(): string | null {
    return this.room?.code ?? null;
  }
}

// ---------- Panel del profesor ----------

const PHASE_TEXT = { lobby: 'En sala de espera', playing: 'Jugando', ended: 'Terminada' } as const;

export class TeacherScreen {
  private rooms = new Map<string, RoomView>();
  private summaries: RoomSummary[] = [];
  private urls: string[] = [];

  constructor(
    private send: Send,
    private onWatch: (code: string) => void,
  ) {
    const max = el<HTMLSelectElement>('in-max');
    max.innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${i === 15 ? 'selected' : ''}>${i + 1}</option>`).join('');
    el('form-room').addEventListener('submit', (e) => {
      e.preventDefault();
      this.send({
        t: 'createRoom',
        settings: {
          maxPlayers: Number(max.value),
          mapSize: el<HTMLSelectElement>('in-map').value as RoomSettings['mapSize'],
          durationMin: Number(el<HTMLSelectElement>('in-duration').value),
        },
      });
    });
    el('form-pin').addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = el<HTMLInputElement>('in-pin').value.trim();
      try {
        sessionStorage.setItem('rts.pin', pin);
      } catch {
        /* sin almacenamiento */
      }
      this.send({ t: 'teacher', pin });
    });
    el('teacher-rooms').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      const code = btn.dataset.code!;
      switch (btn.dataset.act) {
        case 'start':
          return this.send({ t: 'start', code });
        case 'pause':
          return this.send({ t: 'pause', code, paused: btn.dataset.paused !== '1' });
        case 'end':
          if (confirm('¿Terminar la partida para todos?')) this.send({ t: 'end', code });
          return;
        case 'close':
          if (confirm('¿Cerrar la sala? Todos volverán a la pantalla de inicio.')) this.send({ t: 'closeRoom', code });
          return;
        case 'watch':
          return this.onWatch(code);
        case 'try':
          // Abre otra pestaña como si fuera un estudiante (para probar solo en un computador).
          window.open(`/?c=${code}`, '_blank');
          return;
        case 'kick':
          if (confirm(`¿Sacar a ${btn.dataset.name} de la partida?`)) this.send({ t: 'kick', code, memberId: Number(btn.dataset.id) });
          return;
      }
    });
  }

  /** Pedir entrar como profesor (con la clave guardada, si hay). */
  login(): void {
    let pin: string | undefined;
    try {
      pin = sessionStorage.getItem('rts.pin') ?? undefined;
    } catch {
      /* sin almacenamiento */
    }
    this.send(pin ? { t: 'teacher', pin } : { t: 'teacher' });
  }

  askPin(message: string): void {
    el('form-pin').classList.remove('hidden');
    el('teacher-main').classList.add('hidden');
    el('teacher-error').textContent = message;
  }

  loggedIn(urls: string[], rooms: RoomSummary[]): void {
    // Si el panel se abrió por una dirección pública (internet), esa es la que sirve a los estudiantes.
    const here = location.origin;
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    this.urls = !isLocalHost && !urls.includes(here) ? [here, ...urls] : urls;
    this.summaries = rooms;
    el('form-pin').classList.add('hidden');
    el('teacher-main').classList.remove('hidden');
    el('teacher-error').textContent = '';
    this.render();
  }

  error(text: string): void {
    el('teacher-error').textContent = text;
  }

  setRooms(rooms: RoomSummary[]): void {
    this.summaries = rooms;
    for (const code of this.rooms.keys()) if (!rooms.some((r) => r.code === code)) this.rooms.delete(code);
    this.render();
  }

  setRoom(room: RoomView): void {
    this.rooms.set(room.code, room);
    this.render();
  }

  private render(): void {
    const list = this.summaries
      .map((s) => this.rooms.get(s.code))
      .filter((r): r is RoomView => !!r)
      .reverse(); // la más nueva primero
    el('teacher-rooms').innerHTML =
      list.length === 0 ? '<p class="muted">Todavía no hay partidas. Crea una arriba.</p>' : list.map((r) => this.roomHtml(r)).join('');
  }

  private roomHtml(r: RoomView): string {
    const status = r.phase === 'playing' && r.paused ? 'En pausa' : PHASE_TEXT[r.phase];
    const links = this.urls.map((u) => `<code>${esc(u)}/?c=${r.code}</code>`).join(' ');
    const members = r.members
      .map(
        (m) => `<div class="member ${m.connected ? '' : 'off'}"><i style="background:${m.color}"></i><b>${esc(m.name)}</b>
          <span class="muted">· ${esc(FACTIONS[m.faction].name)} ${m.connected ? '' : '· desconectado'}</span>
          <button class="tiny" data-act="kick" data-code="${r.code}" data-id="${m.id}" data-name="${esc(m.name)}">Sacar</button></div>`,
      )
      .join('');
    const b = (act: string, label: string, extra = '') => `<button data-act="${act}" data-code="${r.code}" ${extra}>${label}</button>`;
    let actions = '';
    if (r.phase === 'lobby')
      actions =
        b('start', '▶ Iniciar partida', r.members.length === 0 ? 'disabled title="Primero debe entrar al menos un jugador"' : 'class="primary"') +
        b('try', '🧪 Probar como estudiante', 'title="Abre una pestaña nueva como si fueras un estudiante"') +
        b('close', 'Cerrar sala');
    else if (r.phase === 'playing')
      actions =
        b('watch', '👁 Ver partida', 'class="primary"') +
        b('pause', r.paused ? '▶ Reanudar' : '⏸ Pausar', `data-paused="${r.paused ? 1 : 0}"`) +
        b('end', '■ Terminar');
    else actions = b('watch', '👁 Ver resultados') + b('close', 'Cerrar sala');
    return `<div class="room">
      <div class="room-head">
        <div><div class="muted">Código</div><div class="code big-code">${r.code}</div></div>
        <div class="room-info"><b>${status}</b> · ${r.members.length} jugador(es)<br>
          <span class="muted">${settingsText(r.settings)}</span><br>
          <span class="muted">Los estudiantes entran en:</span> ${links}</div>
      </div>
      <div class="members">${members || '<span class="muted">Nadie ha entrado todavía.</span>'}</div>
      <div class="room-actions">${actions}</div>
    </div>`;
  }
}
