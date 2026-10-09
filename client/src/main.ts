// Punto de entrada del cliente: decide qué pantalla mostrar según lo que
// dice el servidor. Recuerda la partida del estudiante (código + token) para
// volver a entrar solo si se corta la conexión o se recarga la página.

import { ERAS, FACTIONS } from '../../shared/data.ts';
import type { ChronicleEntry, HistorySample, PlayerSummary, ServerMessage } from '../../shared/protocol.ts';
import { reportHtml } from './report.ts';
import { loadArt } from './art.ts';
import { setupCredits } from './credits.ts';
import { GameView } from './game.ts';
import { Net } from './net.ts';
import { el, esc, LobbyScreen, showScreen, StartScreen, TeacherScreen } from './screens.ts';
import './style.css';

void loadArt();
setupCredits();

const isTeacherPage = ['/teacher', '/profesor'].includes(location.pathname.replace(/\/+$/, ''));

/**
 * Partida del estudiante, para volver tras un corte o una recarga.
 * - En la pestaña (sessionStorage): al recargar, vuelve a entrar solo.
 *   Cada pestaña es un jugador distinto (se puede probar con varias pestañas).
 * - En el navegador (localStorage), por código + nombre: si cerró la pestaña,
 *   al escribir de nuevo el mismo nombre y código recupera su jugador.
 */
interface Session {
  code: string;
  name: string;
  token: string;
}
const tokenKey = (code: string, name: string) => `${code}:${name.trim().toLowerCase()}`;
function loadSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem('rts.session') ?? 'null') as Session | null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null): void {
  try {
    if (s) {
      sessionStorage.setItem('rts.session', JSON.stringify(s));
      const tokens = JSON.parse(localStorage.getItem('rts.tokens') ?? '{}') as Record<string, string>;
      tokens[tokenKey(s.code, s.name)] = s.token;
      localStorage.setItem('rts.tokens', JSON.stringify(tokens));
    } else sessionStorage.removeItem('rts.session');
  } catch {
    /* sin almacenamiento: solo se pierde la reconexión automática */
  }
}
/** Token guardado para ese código y nombre (si este navegador ya jugó con ese nombre). */
function savedToken(code: string, name: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem('rts.tokens') ?? '{}') as Record<string, string>)[tokenKey(code, name)];
  } catch {
    return undefined;
  }
}

let session = isTeacherPage ? null : loadSession();
/** El código del enlace manda: si es otra partida, no se reutiliza la sesión vieja. */
const urlCode = new URLSearchParams(location.search).get('c')?.toUpperCase();
if (session && urlCode && urlCode !== session.code) session = null;
/** Nombre que se está usando para entrar (hasta recibir el token). */
let pendingJoin: { code: string; name: string } | null = null;
/** Sala que mira el profesor. */
let watching: string | null = null;
let paused = false;

const net = new Net(onMessage, (s) => game.hud.setStatus(s), onOpen);
const game = new GameView(net);
const start = new StartScreen((name, code) => join(name, code));
const lobby = new LobbyScreen(
  (m) => net.send(m),
  () => leaveToStart(''),
);
const teacher = new TeacherScreen(
  (m) => net.send(m),
  (code) => watch(code),
);

game.hud.onTeacherAction = (a) => {
  if (!watching) return;
  if (a === 'pause' || a === 'resume') net.send({ t: 'pause', code: watching, paused: a === 'pause' });
  else if (a === 'end' && confirm('End the game for everyone?')) net.send({ t: 'end', code: watching });
  else if (a === 'back') backToPanel();
};
// En un RTS el clic derecho es una orden: nunca debe abrir el menú del navegador.
document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
});

// Pantalla inicial.
if (isTeacherPage) showScreen('screen-teacher');
else {
  showScreen('screen-start');
  start.focus();
}
net.connect();

/** Conectado (o reconectado): volver a entrar donde estaba. */
function onOpen(): void {
  if (isTeacherPage) {
    teacher.login();
  } else if (session) {
    net.send({ t: 'join', code: session.code, name: session.name, token: session.token });
  }
}

function join(name: string, code: string): void {
  pendingJoin = { code, name };
  const token = session?.code === code ? session.token : savedToken(code, name);
  net.send(token ? { t: 'join', code, name, token } : { t: 'join', code, name });
}

/** Salir de la partida a propósito (se olvida la sesión). */
function leaveToStart(message: string): void {
  net.send({ t: 'leave' });
  saveSession(null);
  session = null;
  toStart(message);
}

function toStart(message: string): void {
  game.active = false;
  hideOverlays();
  showScreen('screen-start');
  start.error(message);
}

function watch(code: string): void {
  watching = code;
  game.hud.spectator = { code, paused: false };
  net.send({ t: 'watch', code });
}

function backToPanel(): void {
  net.send({ t: 'unwatch' });
  watching = null;
  game.hud.spectator = null;
  game.active = false;
  hideOverlays();
  showScreen('screen-teacher');
}

function hideOverlays(): void {
  el('paused').classList.add('hidden');
  el('ended').classList.add('hidden');
}

function showGame(): void {
  showScreen('screen-game');
  game.active = true;
  game.resize();
}

function onMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'error': {
      const text = msg.message;
      if (isTeacherPage) {
        if (/PIN/.test(text)) teacher.askPin(text);
        else teacher.error(text);
        return;
      }
      if (/another window/.test(text)) {
        // El juego se abrió en otra pestaña: esta deja de reconectarse (si no, se robarían el puesto).
        session = null;
        toStart(text);
        return;
      }
      if (!pendingJoin && session && /No game exists|removed you|already started/.test(text)) {
        // La partida guardada ya no sirve (sala cerrada, servidor reiniciado, expulsado): se olvida.
        saveSession(null);
        session = null;
        toStart(text);
        return;
      }
      pendingJoin = null;
      if (!el('screen-start').classList.contains('hidden')) start.error(text);
      else if (!el('screen-lobby').classList.contains('hidden')) lobby.error(text);
      else {
        game.state.notices.push(text);
        game.hud.update();
      }
      return;
    }
    case 'joined': {
      const name = pendingJoin?.name ?? session?.name ?? '';
      session = { code: msg.code, name, token: msg.token };
      saveSession(session);
      pendingJoin = null;
      lobby.setMe(msg.memberId, msg.host);
      return;
    }
    case 'room':
      if (isTeacherPage) {
        teacher.setRoom(msg.room);
        if (watching === msg.room.code) {
          paused = msg.room.paused;
          game.hud.spectator = { code: msg.room.code, paused };
          game.hud.update();
        }
      } else {
        lobby.update(msg.room);
        // En la sala de espera se muestra la pantalla de elección.
        if (msg.room.phase === 'lobby') {
          game.active = false;
          showScreen('screen-lobby');
        }
      }
      return;
    case 'kicked':
      if (isTeacherPage) return;
      leaveToStart(msg.message);
      return;
    case 'teacherOk':
      teacher.loggedIn(msg.urls, msg.rooms);
      // Si estaba mirando una partida antes de un corte, vuelve a mirarla.
      if (watching) watch(watching);
      return;
    case 'rooms':
      teacher.setRooms(msg.rooms);
      return;
    case 'welcome':
      hideOverlays();
      game.handle(msg);
      showGame();
      return;
    case 'd':
    case 'players':
    case 'chat':
      game.handle(msg);
      return;
    case 'paused':
      paused = msg.paused;
      showPause(msg.paused, msg.secs, msg.battle === 1);
      if (game.hud.spectator) game.hud.spectator.paused = paused;
      game.hud.update();
      return;
    case 'pong':
      game.perf.pong(msg.n, msg.ms, performance.now());
      return;
    case 'quiz':
      showQuiz(msg.id, msg.era, msg.q, msg.options);
      return;
    case 'quizResult':
      showQuizResult(msg.ok, msg.answer, msg.fact, msg.wait);
      return;
    case 'ended':
      showEnd(msg.reason, msg.summary, msg.winners ?? [], msg.history ?? [], msg.chronicle ?? []);
      return;
  }
}

/** Pregunta para avanzar de era: hay que contestarla bien para que empiece el avance. */
function showQuiz(id: number, era: number, q: string, options: string[]): void {
  const box = el('quiz');
  const inner = box.querySelector<HTMLElement>('.quiz-box')!;
  inner.innerHTML = `<h3>🏛 To advance to the ${esc(ERAS[era - 1]?.label ?? 'next age')}, answer this question</h3>
    <p class="quiz-q">${esc(q)}</p>
    <div class="quiz-options">${options.map((o, i) => `<button data-choice="${i}">${'ABCD'[i]}. ${esc(o)}</button>`).join('')}</div>
    <button class="tiny" data-quiz-close>Not now</button>`;
  box.classList.remove('hidden');
  inner.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-quiz-close]')) return box.classList.add('hidden');
    const b = t.closest<HTMLElement>('[data-choice]');
    if (!b) return;
    inner.querySelectorAll('button').forEach((x) => (x.disabled = true));
    b.classList.add('picked');
    net.send({ t: 'quizAnswer', id, choice: Number(b.dataset.choice) });
  };
}

function showQuizResult(ok: boolean, answer: string, fact?: string, wait?: number): void {
  const box = el('quiz');
  const inner = box.querySelector<HTMLElement>('.quiz-box')!;
  inner.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) => {
    if (b.textContent?.slice(3) === answer) b.classList.add('right');
    else if (b.classList.contains('picked')) b.classList.add('wrong');
  });
  inner.insertAdjacentHTML(
    'beforeend',
    `<div class="quiz-result ${ok ? 'ok' : 'no'}">${ok ? '✅ Correct! Your people starts advancing to the next age.' : `❌ Not quite. The answer is: <b>${esc(answer)}</b>. You can try again in ${wait ?? 20} s.`}
      ${fact ? `<p>💡 ${esc(fact)}</p>` : ''}<button data-quiz-close>OK</button></div>`,
  );
  inner.querySelector<HTMLElement>('[data-quiz-close]')?.remove();
  inner.onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-quiz-close]')) box.classList.add('hidden');
  };
}

let pauseTimer = 0;
/** Pausa táctica: se pueden dar órdenes; arrancan todas juntas al reanudar. */
function showPause(on: boolean, secs?: number, battle = false): void {
  const box = el('paused');
  window.clearInterval(pauseTimer);
  box.classList.toggle('hidden', !on);
  if (!on) return;
  const title = battle ? '⚔ Battle! Tactical pause' : '⏸ Tactical pause';
  const tip = 'Give your orders now: they start when the game resumes';
  if (!secs) {
    box.innerHTML = `${title}<small>${tip} (the teacher resumes it)</small>`;
    return;
  }
  const end = Date.now() + secs * 1000;
  const draw = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    box.innerHTML = `${title} · ${left} s<small>${tip}</small>`;
  };
  draw();
  pauseTimer = window.setInterval(draw, 250);
}

/** Resultados al terminar la partida. */
function showEnd(reason: string, summary: PlayerSummary[], winners: number[], history: HistorySample[], chronicle: ChronicleEntry[]): void {
  el('paused').classList.add('hidden');
  // Se cierran los paneles de la partida: el informe queda solo, al frente.
  for (const id of ['guide-panel', 'diplo-panel', 'quiz', 'war-panel', 'march-menu']) document.getElementById(id)?.classList.add('hidden');
  const sorted = [...summary].sort((a, b) => Number(winners.includes(b.id)) - Number(winners.includes(a.id)) || (b.glory ?? 0) - (a.glory ?? 0));
  const you = game.state.you;
  const rows = sorted
    .map(
      (p) => `<tr class="${p.id === game.state.you ? 'me' : ''}"><td>${winners.includes(p.id) ? '🏆 ' : p.defeated ? '💀 ' : ''}<i style="background:${p.color}"></i>${esc(p.name)}</td>
        <td>${esc(FACTIONS[p.faction].name)}</td><td><b>${p.glory ?? 0}</b></td><td>${p.conquered ?? 0}</td><td>${p.gathered}</td><td>${p.units}</td><td>${p.buildings}</td><td>${p.kills}</td><td>${p.lost ?? 0}</td><td>${ERAS[(p.era ?? 1) - 1].short}</td></tr>`,
    )
    .join('');
  const box = el('ended');
  const title = you > 0 ? (winners.includes(you) ? '🏆 Victory!' : '💀 Defeat') : 'Game over';
  const report = reportHtml(history, chronicle, sorted);
  box.innerHTML = `<h2>${title}</h2><p>${esc(reason)}</p>
    <div class="end-tabs" role="tablist">
      <button class="on" data-tab="results" role="tab">🏆 Results</button>
      <button data-tab="charts" role="tab">📈 Charts</button>
      <button data-tab="chronicle" role="tab">📜 Chronicle</button>
    </div>
    <section data-pane="results">
      <table class="eco"><tr><th>Player</th><th>Faction</th><th>Glory</th><th>Cities taken</th><th>Gathered</th><th>Units</th><th>Buildings</th><th>Kills</th><th>Lost</th><th>Age</th></tr>${rows}</table>
      <p class="muted">Glory: 3 per kill, 250 per city taken, 1 per second on the Sacred Hill, 50 per age, +1 per 50 resources gathered, +100 if your empire still stands.</p>
    </section>
    <section data-pane="charts" class="hidden">${report.charts}</section>
    <section data-pane="chronicle" class="hidden">${report.chronicle}</section>
    <button id="btn-end-close">${isTeacherPage ? 'Back to the panel' : 'Exit'}</button>`;
  box.classList.remove('hidden');
  box.querySelector('.end-tabs')!.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (!tab) return;
    box.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    box.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
  });
  el('btn-end-close').addEventListener('click', () => {
    if (isTeacherPage) backToPanel();
    else leaveToStart('');
  });
}
