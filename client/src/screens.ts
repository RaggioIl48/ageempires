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

const MAP_LABEL = { small: 'small', normal: 'normal', large: 'large' } as const;
export function settingsText(s: RoomSettings): string {
  return [
    `up to ${s.maxPlayers} players`,
    `${MAP_LABEL[s.mapSize]} map`,
    s.durationMin ? `${s.durationMin} minutes` : 'no time limit',
    s.diplomacy === 'locked' ? 'fixed teams' : 'free diplomacy',
    s.chat ? 'chat on' : 'no chat',
  ].join(' · ');
}

export function teamText(team: number): string {
  return team > 0 ? `Team ${team}` : 'No team';
}

type Send = (m: ClientMessage) => void;

/** Clave de profesor que se escribió en esta pestaña (o null). */
export function teacherPin(): string | null {
  try {
    return sessionStorage.getItem('rts.pin');
  } catch {
    return null;
  }
}

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
      if (!n) return this.error('Type your name.');
      if (c.length !== CODE_LENGTH) return this.error(`The code has ${CODE_LENGTH} letters.`);
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
      if (!this.room) return;
      const pin = teacherPin();
      this.send(pin ? { t: 'start', code: this.room.code, pin } : { t: 'start', code: this.room.code });
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

  /**
   * `host`: está en el computador del servidor. También ve el botón para iniciar
   * quien ya entró como profesor en este navegador (el servidor revisa la clave).
   */
  setMe(memberId: number, host: boolean): void {
    this.me = memberId;
    const teacher = host || teacherPin() !== null;
    el('host-box').classList.toggle('hidden', !teacher);
    el('host-text').innerHTML = host
      ? 'You are on the <b>teacher computer</b>: when everyone is here, you can start the game from here.'
      : 'You logged in as the <b>teacher</b> in this browser: when everyone is here, you can start the game from here.';
  }

  error(text: string): void {
    el('lobby-error').textContent = text;
  }

  update(room: RoomView): void {
    this.room = room;
    el('lobby-code').textContent = room.code;
    el('lobby-status').textContent =
      room.phase === 'lobby' ? `Waiting for the teacher to start the game… (${settingsText(room.settings)})` : 'The game is starting…';
    const mine = room.members.find((m) => m.id === this.me);
    el('lobby-members').innerHTML = room.members
      .map(
        (m) => `<div class="member ${m.connected ? '' : 'off'}"><i style="background:${m.color}"></i>
          <b>${esc(m.name)}</b>${m.id === this.me ? ' (you)' : ''}<span class="muted"> · ${esc(FACTIONS[m.faction].name)}</span>${
            m.team > 0 ? ` <span class="team-tag">${teamText(m.team)}</span>` : ''
          }</div>`,
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
        title="${owner ? esc(owner.name) : 'Free'}"></button>`;
    }).join('');
  }

  get code(): string | null {
    return this.room?.code ?? null;
  }
}

// ---------- Panel del profesor ----------

const PHASE_TEXT = { lobby: 'In the waiting room', playing: 'Playing', ended: 'Finished' } as const;

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
          diplomacy: el<HTMLSelectElement>('in-diplo').value as RoomSettings['diplomacy'],
          chat: el<HTMLSelectElement>('in-chat').value === '1',
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
    el('teacher-rooms').addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (sel.dataset.team !== undefined)
        this.send({ t: 'setTeam', code: sel.dataset.code!, memberId: Number(sel.dataset.id), team: Number(sel.value) });
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
          if (confirm('End the game for everyone?')) this.send({ t: 'end', code });
          return;
        case 'close':
          if (confirm('Close the room? Everyone will go back to the start screen.')) this.send({ t: 'closeRoom', code });
          return;
        case 'watch':
          return this.onWatch(code);
        case 'try':
          // Abre otra pestaña como si fuera un estudiante (para probar solo en un computador).
          window.open(`/?c=${code}`, '_blank');
          return;
        case 'teams2':
        case 'ffa': {
          // Repartir en 2 equipos alternando (1, 2, 1, 2…) o todos sin equipo.
          const room = this.rooms.get(code);
          room?.members.forEach((m, i) =>
            this.send({ t: 'setTeam', code, memberId: m.id, team: btn.dataset.act === 'ffa' ? 0 : (i % 2) + 1 }),
          );
          return;
        }
        case 'kick':
          if (confirm(`Remove ${btn.dataset.name} from the game?`)) this.send({ t: 'kick', code, memberId: Number(btn.dataset.id) });
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
    try {
      sessionStorage.removeItem('rts.pin'); // la guardada no sirve
    } catch {
      /* sin almacenamiento */
    }
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
      list.length === 0 ? '<p class="muted">No games yet. Create one above.</p>' : list.map((r) => this.roomHtml(r)).join('');
  }

  private roomHtml(r: RoomView): string {
    const status = r.phase === 'playing' && r.paused ? 'Paused' : PHASE_TEXT[r.phase];
    const links = this.urls.map((u) => `<code>${esc(u)}/?c=${r.code}</code>`).join(' ');
    const members = r.members
      .map(
        (m) => `<div class="member ${m.connected ? '' : 'off'}"><i style="background:${m.color}"></i><b>${esc(m.name)}</b>
          <span class="muted">· ${esc(FACTIONS[m.faction].name)} ${m.connected ? '' : '· disconnected'}</span>
          ${
            r.phase === 'lobby'
              ? `<select class="tiny-select" data-team data-code="${r.code}" data-id="${m.id}" title="Team">${[0, 1, 2, 3, 4]
                  .map((t) => `<option value="${t}" ${t === m.team ? 'selected' : ''}>${teamText(t)}</option>`)
                  .join('')}</select>`
              : m.team > 0
                ? `<span class="team-tag">${teamText(m.team)}</span>`
                : ''
          }
          <button class="tiny" data-act="kick" data-code="${r.code}" data-id="${m.id}" data-name="${esc(m.name)}">Remove</button></div>`,
      )
      .join('');
    const b = (act: string, label: string, extra = '') => `<button data-act="${act}" data-code="${r.code}" ${extra}>${label}</button>`;
    let actions = '';
    if (r.phase === 'lobby')
      actions =
        b('start', '▶ Start game', r.members.length === 0 ? 'disabled title="At least one player must join first"' : 'class="primary"') +
        b('try', '🧪 Try as a student', 'title="Opens a new tab as if you were a student"') +
        (r.members.length > 1 ? b('teams2', '⚖ Split into 2 teams') + b('ffa', 'Everyone for themselves') : '') +
        b('close', 'Close room');
    else if (r.phase === 'playing')
      actions =
        b('watch', '👁 Watch game', 'class="primary"') +
        b('pause', r.paused ? '▶ Resume' : '⏸ Pause', `data-paused="${r.paused ? 1 : 0}"`) +
        b('end', '■ End');
    else actions = b('watch', '👁 See results') + b('close', 'Close room');
    return `<div class="room">
      <div class="room-head">
        <div><div class="muted">Code</div><div class="code big-code">${r.code}</div></div>
        <div class="room-info"><b>${status}</b> · ${r.members.length} player(s)<br>
          <span class="muted">${settingsText(r.settings)}</span><br>
          <span class="muted">Students join at:</span> ${links}</div>
      </div>
      <div class="members">${members || '<span class="muted">Nobody has joined yet.</span>'}</div>
      <div class="room-actions">${actions}</div>
    </div>`;
  }
}
