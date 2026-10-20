// Edad Media en tres etapas (Alta, Plena y Baja): cada una se avanza en el Centro Urbano con
// una pregunta de historia y abre algo que se ve: mangonel y fortalezas (Plena), trabuquete,
// ballesteros, piqueros y caballeros con placas (Baja). Además, monje y monasterio comunes.
import { describe, expect, it } from 'vitest';
import {
  BUILDING_DEFS,
  MEDIEVAL_STAGES,
  TECH_DEFS,
  UNIT_DEFS,
  buildingAvailable,
  isAdvanceTech,
  unitAvailable,
  type UnitType,
} from '../../shared/data.ts';
import { STAGE_QUIZ_BANK, UNIT_HISTORY } from '../../shared/lessons.ts';
import { healOf, maskOf, stageOf } from '../../shared/stats.ts';
import type { ClientMessage, RoomSettings, ServerMessage } from '../../shared/protocol.ts';
import type { Conn } from '../src/lobby/conn.ts';
import { Lobby } from '../src/lobby/lobby.ts';
import type { Room } from '../src/lobby/room.ts';
import { AiPlayer } from '../src/sim/ai.ts';
import type { Game } from '../src/sim/game.ts';
import { completeTech, researchError } from '../src/sim/production.ts';
import { flatGame, newGame, run, runUntil } from './helpers.ts';

const RICH = { food: 9000, wood: 9000, stone: 9000, metal: 9000 };

/** Partida plana en la Alta Edad Media, con recursos de sobra y un cuartel. */
function medieval(stage = 1) {
  const g = flatGame(['romans', 'gauls']); // sin vikingos: su infantería se cura sola
  const w = g.world;
  for (const p of w.players.values()) {
    p.resources = { ...RICH };
    completeTech(w, p.id, 'era2');
    if (stage >= 2) completeTech(w, p.id, 'stage2');
    if (stage >= 3) completeTech(w, p.id, 'stage3');
  }
  const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
  const barracks = w.addBuilding('barracks', 1, 12, 4)!;
  for (let i = 0; i < 4; i++) w.addBuilding('house', 1, 3 + i * 2, 14);
  return { g, w, tc, barracks };
}

const count = (g: Game, owner: number, type: UnitType) => [...g.world.units.values()].filter((u) => u.owner === owner && u.type === type).length;

describe('Medieval Age in three stages', () => {
  it('the stage comes from the researched advances, and each advance is a Town Center tech', () => {
    expect(MEDIEVAL_STAGES.map((s) => s.short)).toEqual(['Early', 'High', 'Late']);
    expect(stageOf(maskOf([]))).toBe(1);
    expect(stageOf(maskOf(['era2', 'stage2']))).toBe(2);
    expect(stageOf(maskOf(['era2', 'stage2', 'stage3']))).toBe(3);
    for (const t of ['stage2', 'stage3'] as const) {
      expect(isAdvanceTech(t)).toBe(true);
      expect(BUILDING_DEFS.town_center.researches).toContain(t);
    }
    expect(isAdvanceTech('forge')).toBe(false);
  });

  it('stages go in order, only in the Medieval Age, and the Industrial Age needs the Late Middle Ages', () => {
    const g = flatGame(['romans', 'romans']);
    const w = g.world;
    w.players.get(1)!.resources = { ...RICH };
    expect(researchError(w, 1, 'stage2')).toMatch(/Medieval Age/); // todavía en la Edad Tribal
    completeTech(w, 1, 'era2');
    expect(researchError(w, 1, 'stage3')).toMatch(/High Middle Ages/);
    w.addBuilding('tech_center', 1, 12, 4);
    expect(researchError(w, 1, 'era3')).toMatch(/Late Middle Ages/);
    expect(researchError(w, 1, 'stage2')).toBeNull();
    const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
    g.enqueue(1, { kind: 'research', buildingId: tc.id, tech: 'stage2' });
    run(g, TECH_DEFS.stage2.time + 1);
    expect(w.stageOf(1)).toBe(2);
    expect(researchError(w, 1, 'stage2')).toMatch(/already/);
    g.enqueue(1, { kind: 'research', buildingId: tc.id, tech: 'stage3' });
    run(g, TECH_DEFS.stage3.time + 1);
    expect(w.stageOf(1)).toBe(3);
    expect(researchError(w, 1, 'era3')).toBeNull();
    // Todos se enteran (como al cambiar de era), con los años de la etapa.
    expect(w.chronicle.some((c) => /Late Middle Ages \(AD 1300–1500\)/.test(c.text))).toBe(true);
  });

  it('each stage opens something: mangonel and fortresses (High), trebuchet, crossbows, pikes and plate (Late)', () => {
    expect(unitAvailable('mangonel', 2, 'romans', 1)).toBe(false);
    expect(unitAvailable('mangonel', 2, 'romans', 2)).toBe(true);
    expect(unitAvailable('counterweight_trebuchet', 2, 'gauls', 2)).toBe(false);
    expect(unitAvailable('counterweight_trebuchet', 2, 'gauls', 3)).toBe(true);
    expect(buildingAvailable('fortress', 2, 'romans', 1)).toBe(false);
    expect(buildingAvailable('fortress', 2, 'romans', 2)).toBe(true);
    for (const t of ['crossbow', 'pikeman', 'cavalier'] as const) expect(TECH_DEFS[t].stage, t).toBe(3);
    // Sin etapa (p. ej. la guía) se muestra la edad entera; en la Edad Industrial ya no se pide etapa.
    expect(unitAvailable('mangonel', 2, 'romans')).toBe(true);
    expect(buildingAvailable('fortress', 3, 'romans', 1)).toBe(true);
    // Comunes: los entrenan todos los pueblos.
    for (const u of ['monk', 'mangonel', 'counterweight_trebuchet'] as const) {
      expect(UNIT_DEFS[u].faction, u).toBeUndefined();
      expect(UNIT_HISTORY[u], u).toBeTruthy();
    }
  });

  it('the server refuses what the stage does not allow yet', () => {
    const { g, w, barracks } = medieval(1);
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'mangonel' });
    g.enqueue(1, { kind: 'research', buildingId: barracks.id, tech: 'pikeman' });
    const worker = w.addUnit('worker', 1, 18.5, 9.5);
    g.enqueue(1, { kind: 'build', unitIds: [worker.id], building: 'fortress', tx: 20, ty: 4 });
    g.step();
    expect(barracks.queue).toHaveLength(0);
    expect([...w.buildings.values()].some((b) => b.type === 'fortress')).toBe(false);
    const notices = g.takeNotices(1).join(' / ');
    expect(notices).toMatch(/Mangonel: you need the High Middle Ages/);
    expect(notices).toMatch(/Fortress: you need the High Middle Ages/);
    expect(notices).toMatch(/First advance to the Late Middle Ages/);
    // En la Plena, el mangonel sale; el trabuquete todavía no.
    completeTech(w, 1, 'stage2');
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'mangonel' });
    g.enqueue(1, { kind: 'train', buildingId: barracks.id, unit: 'counterweight_trebuchet' });
    g.step();
    expect(barracks.queue.map((q) => q.unit)).toEqual(['mangonel']);
    expect(runUntil(g, () => count(g, 1, 'mangonel') === 1, 60)).toBeLessThan(60);
  });
});

describe('monk and monastery', () => {
  it('the Monastery trains Monks one at a time, from the Early Middle Ages', () => {
    const { g, w } = medieval(1);
    expect(buildingAvailable('monastery', 2, 'vikings', 1)).toBe(true);
    const m = w.addBuilding('monastery', 1, 18, 4)!;
    g.enqueue(1, { kind: 'train', buildingId: m.id, unit: 'monk' });
    expect(runUntil(g, () => count(g, 1, 'monk') > 0, 60)).toBeLessThan(60);
    expect(count(g, 1, 'monk')).toBe(1); // no forma regimientos
  });

  it('heals hurt soldiers of his own side nearby; not enemies, not far ones, and monks do not stack', () => {
    const { g, w } = medieval(2);
    w.addUnit('monk', 1, 10.5, 20.5);
    w.addUnit('monk', 1, 11.5, 20.5);
    const near = w.addUnit('swordsman', 1, 12.5, 21.5);
    const far = w.addUnit('swordsman', 1, 20.5, 26.5);
    const foe = w.addUnit('swordsman', 2, 9.5, 22.5);
    for (const u of [near, far, foe]) u.hp = 30;
    // Ninguno pelea: los dos imperios están en paz.
    w.setRelation(1, 2, 'peace');
    run(g, 2);
    const hps = healOf('monk', w.techsOf(1));
    expect(hps).toBe(UNIT_DEFS.monk.heals!.hps);
    expect(near.hp).toBeGreaterThan(30 + hps * 1.5);
    expect(near.hp).toBeLessThan(30 + hps * 2.5); // dos monjes curan como uno
    expect(far.hp).toBe(30);
    expect(foe.hp).toBe(30);
  });

  it('Herbal Medicine makes monks heal faster', () => {
    const { w } = medieval(1);
    const before = healOf('monk', w.techsOf(1));
    completeTech(w, 1, 'herbal_medicine');
    expect(healOf('monk', w.techsOf(1))).toBe(before + TECH_DEFS.herbal_medicine.heal!);
    expect(BUILDING_DEFS.monastery.researches).toContain('herbal_medicine');
  });

  it('monks do not fight: an attack order sends them behind the soldiers, close to the target', () => {
    const { g, w } = medieval(1);
    const monk = w.addUnit('monk', 1, 6.5, 20.5);
    const sword = w.addUnit('swordsman', 1, 7.5, 20.5);
    const foe = w.addUnit('spearman', 2, 16.5, 20.5);
    const hp = foe.hp;
    g.enqueue(1, { kind: 'attack', unitIds: [monk.id, sword.id], targetId: foe.id });
    g.step();
    expect(monk.task?.kind).not.toBe('attack');
    expect(sword.task?.kind).toBe('attack');
    run(g, 6);
    expect(Math.hypot(monk.x - foe.x, monk.y - foe.y)).toBeLessThan(5);
    // Un enemigo pegado al monje no lo hace pelear (ni contestar el golpe).
    const lone = w.addUnit('monk', 1, 30.5, 30.5);
    const raider = w.addUnit('scout', 2, 31.2, 30.5);
    run(g, 3);
    expect(lone.task?.kind).not.toBe('attack');
    expect(lone.state).not.toBe('attacking');
    expect(raider.hp).toBe(w.statsOf(raider).hp);
    expect(foe.hp).toBeLessThan(hp); // el espadachín sí pelea
  });
});

describe('stone throwers', () => {
  it('a mangonel stone also hits the enemies packed next to the target, but not your own men', () => {
    const { g, w } = medieval(2);
    const m = w.addUnit('mangonel', 1, 8.5, 20.5);
    const target = w.addUnit('spearman', 2, 14.5, 20.5);
    const side = w.addUnit('spearman', 2, 14.5, 21.3);
    const friend = w.addUnit('swordsman', 1, 15.3, 20.5);
    const far = w.addUnit('spearman', 2, 14.5, 24.5);
    for (const u of [target, side, far, friend]) u.guard = true;
    const full = (u: typeof target) => w.statsOf(u).hp;
    g.enqueue(1, { kind: 'attack', unitIds: [m.id], targetId: target.id });
    runUntil(g, () => target.hp < full(target), 20);
    expect(target.hp).toBeLessThan(full(target));
    expect(side.hp).toBeLessThan(full(side));
    expect(full(side) - side.hp).toBeLessThan(full(target) - target.hp); // la salpicadura pega menos
    expect(far.hp).toBe(full(far));
    expect(friend.hp).toBe(full(friend));
  });

  it('the counterweight trebuchet outranges every other medieval engine and breaks buildings', () => {
    const t = UNIT_DEFS.counterweight_trebuchet;
    for (const u of ['mangonel', 'scorpion', 'trebuchet'] as const) expect(t.attack.range).toBeGreaterThan(UNIT_DEFS[u].attack.range);
    expect(t.bonus?.building).toBeGreaterThan(1);
    expect(UNIT_DEFS.mangonel.attack.range).toBeLessThan(t.attack.range);
  });
});

// ---------- Preguntas de historia de cada etapa ----------

class FakeConn implements Conn {
  role: Conn['role'] = 'none';
  room: Room | null = null;
  pinFails = 0;
  inbox: ServerMessage[] = [];
  constructor(readonly isLocal = false) {}
  send(msg: ServerMessage): void {
    this.inbox.push(JSON.parse(JSON.stringify(msg)));
  }
  congested(): boolean {
    return false;
  }
  close(): void {}
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].t === t) return this.inbox[i] as Extract<ServerMessage, { t: T }>;
    return undefined;
  }
}

describe('history questions for each stage', () => {
  it('the stage banks are well formed and about their own period', () => {
    for (const stage of [2, 3]) {
      const qs = STAGE_QUIZ_BANK[stage];
      expect(qs.length).toBeGreaterThanOrEqual(6);
      expect(new Set(qs.map((q) => q.q)).size).toBe(qs.length);
      for (const q of qs) {
        expect(q.a.length).toBeGreaterThanOrEqual(2);
        expect(new Set(q.a).size).toBe(q.a.length);
        expect(q.fact).toBeTruthy();
      }
    }
  });

  it('advancing a stage asks a question from that stage first; the right answer starts it', () => {
    const lobby = new Lobby({ pin: '4321', urls: () => [], seed: () => 77 });
    const teacher = new FakeConn(true);
    const send = (c: Conn, m: ClientMessage) => lobby.handle(c, m);
    send(teacher, { t: 'teacher' });
    const settings: Partial<RoomSettings> = { maxPlayers: 2, mapSize: 'small', durationMin: 0, diplomacy: 'free', chat: true, fog: false, battlePause: 0, quiz: 'history' };
    send(teacher, { t: 'createRoom', settings: settings as RoomSettings });
    const code = [...lobby.rooms.keys()][0];
    const room = lobby.rooms.get(code)!;
    const ana = new FakeConn();
    send(ana, { t: 'join', code, name: 'Ana' });
    send(teacher, { t: 'start', code });
    const w = room.game!.world;
    w.players.get(1)!.resources = { ...RICH };
    completeTech(w, 1, 'era2');
    const tc = [...w.buildings.values()].find((b) => b.owner === 1 && b.type === 'town_center')!;
    send(ana, { t: 'cmd', cmd: { kind: 'research', buildingId: tc.id, tech: 'stage2' } });
    room.tick();
    expect(tc.queue).toHaveLength(0);
    const quiz = ana.last('quiz')!;
    expect(quiz.era).toBe(2);
    expect(quiz.stage).toBe(2);
    const bank = STAGE_QUIZ_BANK[2].find((q) => q.q === quiz.q)!;
    expect(bank, 'question comes from the High Middle Ages bank').toBeDefined();
    send(ana, { t: 'quizAnswer', id: quiz.id, choice: quiz.options.indexOf(bank.a[0]) });
    expect(ana.last('quizResult')!.ok).toBe(true);
    room.tick();
    expect(tc.queue.map((q) => q.tech)).toEqual(['stage2']);
  });
});

// ---------- Rival de la computadora ----------

function play(g: Game, ais: AiPlayer[], seconds: number, stop = () => false): void {
  for (let i = 0; i < seconds * 10 && !stop(); i++) {
    for (const ai of ais) ai.update(g);
    g.step();
  }
}

describe('computer rival in the Middle Ages', () => {
  it('goes through the stages and uses monks and stone throwers', () => {
    const g = newGame(2, 5);
    const w = g.world;
    const seen = new Set<UnitType>();
    play(g, [new AiPlayer(1, 'normal')], 22 * 60, () => {
      if (w.tick % 50 === 0) for (const u of w.units.values()) if (u.owner === 1) seen.add(u.type);
      return w.stageOf(1) === 3 && seen.has('monk') && seen.has('mangonel') && seen.has('counterweight_trebuchet');
    });
    expect(w.players.get(1)!.era).toBe(2);
    expect(w.stageOf(1)).toBe(3);
    expect([...w.buildings.values()].some((b) => b.owner === 1 && b.type === 'monastery')).toBe(true);
    expect(seen.has('monk'), 'trained monks').toBe(true);
    expect(seen.has('mangonel'), 'trained mangonels').toBe(true);
    expect(seen.has('counterweight_trebuchet'), 'trained trebuchets').toBe(true);
  }, 60_000);
});
