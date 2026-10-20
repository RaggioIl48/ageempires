// Pantalla de carga al empezar la partida (al estilo de los juegos de estrategia clásicos): una
// escena pintada con soldados de tu pueblo, datos de la historia de los pueblos que juegan, y las
// tarjetas de tus unidades hasta la Edad Media (qué hacen, contra quién sirven, quién les gana).
// Mientras tanto se preparan las hojas y los colores (preloadGame): así no hay tirones después.

import { FACTIONS, UNIT_DEFS, unitAvailable, type FactionId, type UnitType } from '../../shared/data.ts';
import { goodAgainst, weakAgainst } from '../../shared/counters.ts';
import { PEOPLE_HISTORY, UNIT_HISTORY } from '../../shared/lessons.ts';
import type { UnitView } from '../../shared/protocol.ts';
import { drawSpriteUnit, preloadGame, unitPortrait } from './art.ts';
import { el, esc } from './screens.ts';

/** Si la partida ya lleva más que esto (reconexión), se entra apenas termina de cargar. */
const LATE_JOIN_TICKS = 300;
/** Al empezar, se puede leer hasta esto antes de entrar solo (la partida ya corre en el servidor). */
const READ_SECONDS = 25;
const TIP_MS = 7000;

export interface LoadingPlayer {
  faction: FactionId;
  color: string;
}

/** Unidades de un pueblo hasta la Edad Media (las que más se usan en clase). */
export function medievalUnits(faction: FactionId): UnitType[] {
  return (Object.keys(UNIT_DEFS) as UnitType[]).filter((t) => {
    const d = UNIT_DEFS[t];
    return d.era <= 2 && !d.hero && (unitAvailable(t, 1, faction) || unitAvailable(t, 2, faction));
  });
}

/** Datos para los mensajes: frases cortas de la historia de cada pueblo en juego. */
export function loreTips(factions: FactionId[]): string[] {
  const tips: string[] = [];
  for (const f of factions) {
    const h = PEOPLE_HISTORY[f], name = FACTIONS[f].name;
    tips.push(`${name}: ${h.fact}`, `${name}: ${h.war}`, `${name}: ${h.leader}`, `${name} left us: ${h.legacy}`);
  }
  return tips;
}

export class LoadingScreen {
  private run = 0;
  private raf = 0;

  /**
   * Muestra la pantalla y prepara la partida. `onDone` se llama al cerrarla (para reiniciar el
   * medidor de tirones). `tick()` = paso de la partida al terminar de cargar (reconexión: no espera).
   */
  show(opts: { players: LoadingPlayer[]; me?: LoadingPlayer; tick: () => number; ctx: CanvasRenderingContext2D; onDone: (ms: number) => void }): void {
    const id = ++this.run;
    const box = el('loading');
    const fill = el('loading-fill');
    const status = el('loading-text');
    const go = el<HTMLButtonElement>('loading-go');
    const factions = [...new Set(opts.players.map((p) => p.faction))];
    const tips = shuffle(loreTips(factions.length ? factions : ['romans']));
    let tip = 0;
    const showTip = () => (el('loading-tip').textContent = tips[tip++ % tips.length]);
    showTip();
    const tipTimer = window.setInterval(showTip, TIP_MS);
    el('loading-cards').innerHTML = opts.me ? this.cards(opts.me) : '<p class="muted">Teacher view: you will watch the whole map.</p>';
    el('loading-people').textContent = opts.me ? `Your people: the ${FACTIONS[opts.me.faction].name} · «${FACTIONS[opts.me.faction].motto}»` : 'Peoples in this game: ' + factions.map((f) => FACTIONS[f].name).join(', ');
    box.classList.remove('hidden');
    go.disabled = true;
    go.textContent = 'Preparing…';
    const t0 = performance.now();
    let closed = false;
    let countdown = 0;
    const close = () => {
      if (closed || id !== this.run) return;
      closed = true;
      window.clearInterval(tipTimer);
      window.clearInterval(countdown);
      cancelAnimationFrame(this.raf);
      box.classList.add('hidden');
      opts.onDone(Math.round(performance.now() - t0));
    };
    go.onclick = close;
    // Con internet muy lenta no se queda acá para siempre: lo que falte se carga de fondo.
    const giveUp = window.setTimeout(() => {
      go.disabled = false;
      go.textContent = '▶ Play now';
    }, 8000);
    this.paint(opts.me, factions);
    void preloadGame(
      opts.players,
      (done, total) => {
        fill.style.width = `${total ? Math.round((done / total) * 100) : 100}%`;
        status.textContent = `Preparing the armies · ${done}/${total}`;
      },
      opts.ctx,
    ).finally(() => {
      window.clearTimeout(giveUp);
      if (id !== this.run || closed) return;
      // Ahora sí están las imágenes: las tarjetas con sus retratos (se generan de a poco).
      if (opts.me) {
        const me = opts.me;
        let tries = 0;
        const refresh = () => {
          if (id !== this.run || closed) return;
          const html = this.cards(me);
          el('loading-cards').innerHTML = html;
          if (html.includes('lcard-pic') && ++tries < 10) window.setTimeout(refresh, 400);
        };
        refresh();
      }
      fill.style.width = '100%';
      if (opts.tick() > LATE_JOIN_TICKS || !opts.me) return close(); // reconexión o profesor: directo
      let left = READ_SECONDS;
      const label = () => (go.textContent = `▶ Enter the battlefield (${left})`);
      go.disabled = false;
      status.textContent = 'Ready! Read about your army, or enter now.';
      label();
      countdown = window.setInterval(() => {
        left--;
        if (left <= 0) close();
        else label();
      }, 1000);
    });
  }

  /** Tarjetas de las unidades de tu pueblo hasta la Edad Media. */
  private cards(me: LoadingPlayer): string {
    return medievalUnits(me.faction)
      .map((t) => {
        const d = UNIT_DEFS[t];
        const pic = unitPortrait(me.faction, t, me.color, 56);
        const good = goodAgainst(t), weak = weakAgainst(t);
        const hist = UNIT_HISTORY[t];
        return `<div class="lcard${d.faction ? ' uniq' : ''}">
          ${pic ? `<img src="${pic}" alt="">` : '<span class="lcard-pic"></span>'}
          <div><b>${esc(d.label)}</b>${d.faction ? ' <span class="uniq-tag">unique</span>' : ''} <span class="muted">· ${d.era === 1 ? 'Tribal' : 'Medieval'}</span>
          <div class="up">✔ ${esc(d.strong)}</div><div class="down">✘ ${esc(d.weak)}</div>
          ${good.length ? `<div class="muted">Beats: ${esc(good.join(', '))}</div>` : ''}${weak.length ? `<div class="muted">Fears: ${esc(weak.join(', '))}</div>` : ''}
          ${hist ? `<div class="hist-line">📜 ${esc(hist)}</div>` : ''}</div>
        </div>`;
      })
      .join('');
  }

  /** La escena: cielo al atardecer, montañas, un castillo y una fila de soldados de tu pueblo. */
  private paint(me: LoadingPlayer | undefined, factions: FactionId[]): void {
    const canvas = el<HTMLCanvasElement>('loading-art');
    const g = canvas.getContext('2d')!;
    const lineup: { faction: FactionId; type: UnitType; color: string }[] = me
      ? medievalUnits(me.faction)
          .filter((t) => ['infantry', 'ranged', 'cavalry'].includes(UNIT_DEFS[t].category))
          .slice(0, 7)
          .map((type) => ({ faction: me.faction, type, color: me.color }))
      : factions.map((f) => ({ faction: f, type: 'knight' as UnitType, color: '#c9a43a' }));
    const frame = (now: number) => {
      const w = (canvas.width = canvas.clientWidth), h = (canvas.height = canvas.clientHeight);
      backdrop(g, w, h, me?.color ?? '#c9a43a');
      // Soldados mirando hacia el que mira, en fila sobre la loma (a la izquierda del panel de unidades).
      // Hasta ×2,5: más grande pediría las hojas completas solo para esta pantalla.
      const k = Math.min(2.5, h / 230);
      const span = w > 760 ? 0.56 : 0.9;
      g.save();
      g.scale(k, k);
      lineup.forEach((u, i) => {
        const x = (w / k) * (0.05 + (span * (i + 0.5)) / lineup.length);
        const y = (h / k) * 0.8 + (i % 2) * 6;
        const view = { id: i + 1, owner: 0, type: u.type, x: 0, y: 0, hp: 100, state: 'idle' } as unknown as UnitView;
        drawSpriteUnit(g, view, x, y, u.color, now, u.faction, Math.PI * 0.75, 9);
      });
      g.restore();
      vignette(g, w, h);
      this.raf = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(frame);
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fondo pintado: atardecer, tres cordilleras, un castillo en un cerro y la loma de adelante. */
function backdrop(g: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1b2033');
  sky.addColorStop(0.45, '#7a4a3a');
  sky.addColorStop(0.62, '#e0a35c');
  sky.addColorStop(1, '#3a2a1c');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // Sol bajo.
  const sun = g.createRadialGradient(w * 0.68, h * 0.56, 0, w * 0.68, h * 0.56, h * 0.35);
  sun.addColorStop(0, 'rgba(255,230,160,0.95)');
  sun.addColorStop(0.15, 'rgba(255,200,120,0.6)');
  sun.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, seed: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 60) {
      const t = x / w;
      const y = h * base - amp * h * (0.5 + 0.5 * Math.sin(t * 7 + seed) * Math.cos(t * 3.1 + seed * 2));
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  };
  ridge(0.62, 0.16, 1.3, '#5a3f45');
  ridge(0.68, 0.12, 4.1, '#3f2e36');
  backdropCastle(g, w, h, color);
  ridge(0.76, 0.06, 2.2, '#2b2420');
  // Loma de pasto donde están los soldados.
  const grass = g.createLinearGradient(0, h * 0.72, 0, h);
  grass.addColorStop(0, '#3d4a26');
  grass.addColorStop(1, '#1d2412');
  g.fillStyle = grass;
  g.beginPath();
  g.moveTo(0, h);
  g.quadraticCurveTo(w * 0.5, h * 0.7, w, h * 0.82);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

/** Castillo en el cerro: muralla almenada, tres torres, ventanas encendidas y un estandarte. */
function backdropCastle(g: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  const s = h * 0.045, cx = w * 0.3, base = h * 0.665;
  const dark = '#241b21', mid = '#30252c';
  const crenels = (x0: number, x1: number, y: number) => {
    for (let x = x0; x < x1 - s * 0.2; x += s * 0.5) g.fillRect(x, y - s * 0.28, s * 0.3, s * 0.28);
  };
  // Muralla.
  g.fillStyle = mid;
  g.fillRect(cx - s * 4.5, base - s * 1.6, s * 9, s * 1.6);
  crenels(cx - s * 4.5, cx + s * 4.5, base - s * 1.6);
  // Torres de los lados y torre del homenaje (más alta) en el medio.
  const tower = (x: number, wd: number, ht: number) => {
    g.fillStyle = dark;
    g.fillRect(x - wd / 2, base - ht, wd, ht);
    crenels(x - wd / 2, x + wd / 2, base - ht);
    g.fillStyle = '#ffcf7a';
    g.fillRect(x - s * 0.1, base - ht * 0.7, s * 0.2, s * 0.35);
  };
  tower(cx - s * 4.2, s * 1.4, s * 3.2);
  tower(cx + s * 4.2, s * 1.4, s * 3.2);
  tower(cx, s * 2.2, s * 4.6);
  // Puerta y estandarte.
  g.fillStyle = '#150f13';
  g.beginPath();
  g.arc(cx, base - s * 0.9, s * 0.5, Math.PI, 0);
  g.lineTo(cx + s * 0.5, base);
  g.lineTo(cx - s * 0.5, base);
  g.fill();
  g.fillStyle = '#1a1418';
  g.fillRect(cx - s * 0.05, base - s * 6.6, s * 0.1, s * 2.1);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx + s * 0.05, base - s * 6.6);
  g.lineTo(cx + s * 1.3, base - s * 6.25);
  g.lineTo(cx + s * 0.05, base - s * 5.9);
  g.fill();
}

function vignette(g: CanvasRenderingContext2D, w: number, h: number): void {
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}
