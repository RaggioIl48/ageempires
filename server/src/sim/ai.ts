// Rival de la computadora: juega con las mismas órdenes que un estudiante (sin trampas de
// recursos). Junta recursos, construye, sube a la Edad Media, entrena tropas que contrarrestan
// lo que ve del enemigo (lanzas si ve caballería, espadas si ve lanzas…) y ataca en oleadas
// marchando sobre la ciudad enemiga. Sirve para practicar solo y para probar el juego.

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  type BuildingType,
  type Cost,
  type ResourceType,
  type UnitType,
} from '../../../shared/data.ts';
import type { BotLevel, Command } from '../../../shared/protocol.ts';
import { buildingCost, hasTech, unitCost } from '../../../shared/stats.ts';
import { isEnemy } from './diplomacy.ts';
import type { Game } from './game.ts';
import type { Building, Point, Unit, World } from './world.ts';

export type AiLevel = BotLevel;

interface LevelDef {
  /** Cada cuántos pasos piensa (10 pasos = 1 s). */
  think: number;
  /** Trabajadores que quiere tener. */
  workers: number;
  /** Primera oleada (segundos de partida) y tamaño de la primera; cada oleada siguiente es más grande. */
  firstWave: number;
  waveSize: number;
  waveGrowth: number;
  /** Segundos entre oleadas. */
  waveEvery: number;
  /** Entrena las unidades únicas de su pueblo. */
  uniques: boolean;
  /** Elige tropas según lo que ve del enemigo (piedra, papel o tijera). */
  counters: boolean;
}

export const AI_LEVELS: Record<AiLevel, LevelDef> = {
  easy: { think: 20, workers: 14, firstWave: 12 * 60, waveSize: 6, waveGrowth: 2, waveEvery: 240, uniques: false, counters: false },
  normal: { think: 10, workers: 24, firstWave: 8 * 60, waveSize: 10, waveGrowth: 3, waveEvery: 180, uniques: true, counters: true },
};

/** Cómo reparte a sus trabajadores (fracción de cada recurso) en cada era. */
const SHARE: Record<number, Record<ResourceType, number>> = {
  1: { food: 0.5, wood: 0.35, stone: 0.05, metal: 0.1 },
  2: { food: 0.4, wood: 0.3, stone: 0.08, metal: 0.22 },
};

/** Tipo de nodo del mapa de cada recurso. */
const NODE_OF: Record<ResourceType, string> = { food: 'berries', wood: 'tree', stone: 'stone', metal: 'metal' };

export class AiPlayer {
  private readonly def: LevelDef;
  private nextThink: number;
  private lastWave = 0;
  private waves = 0;
  /** Lo que vio del enemigo (para elegir tropas): suma con olvido lento. */
  private seen = { cavalry: 0, spear: 0, blade: 0, ranged: 0 };
  private rotate = 0;

  constructor(
    readonly playerId: number,
    readonly level: AiLevel,
  ) {
    this.def = AI_LEVELS[level];
    // Cada rival piensa en un paso distinto (no todos a la vez).
    this.nextThink = playerId % this.def.think;
  }

  update(game: Game): void {
    const w = game.world;
    if (w.tick < this.nextThink) return;
    this.nextThink = w.tick + this.def.think;
    const me = w.players.get(this.playerId);
    if (!me || me.defeated) return;
    me.notices = []; // nadie los lee
    const cmd = (c: Command) => game.enqueue(this.playerId, c);

    const units: Unit[] = [];
    const buildings: Building[] = [];
    for (const u of w.units.values()) if (u.owner === this.playerId) units.push(u);
    for (const b of w.buildings.values()) if (b.owner === this.playerId) buildings.push(b);
    const tc = buildings.find((b) => b.type === 'town_center' && b.progress >= 1);
    if (!tc) return;
    const home = { x: tc.tx + tc.size / 2, y: tc.ty + tc.size / 2 };
    const workers = units.filter((u) => u.type === 'worker');
    const army = units.filter((u) => u.type !== 'worker' && !UNIT_DEFS[u.type].buildingsOnly && !UNIT_DEFS[u.type].docks);
    const have = (t: BuildingType, done = false) => buildings.some((b) => b.type === t && (!done || b.progress >= 1));
    const era = w.eraOf(this.playerId);
    // Lo que tenga que pagar de aquí en adelante se descuenta a mano (las órdenes se aplican en el próximo paso).
    const purse = { ...me.resources };
    const afford = (c: Cost) => Object.entries(c).every(([r, v]) => purse[r as ResourceType] >= (v ?? 0));
    const pay = (c: Cost) => {
      for (const [r, v] of Object.entries(c)) purse[r as ResourceType] -= v ?? 0;
    };

    // ---------- Economía ----------
    const { pop, popCap } = w.popOf(this.playerId);
    if (workers.length < this.def.workers && tc.queue.length === 0 && pop < popCap && afford(unitCost('worker', me.techs))) {
      pay(unitCost('worker', me.techs));
      cmd({ kind: 'train', buildingId: tc.id, unit: 'worker' });
    }

    // Un trabajador libre para construir (el que no carga nada, si hay).
    const builders = workers.filter((u) => u.task?.kind !== 'build');
    const takeBuilder = (): Unit | undefined => {
      const i = builders.findIndex((u) => !u.carryAmount);
      return builders.splice(i >= 0 ? i : 0, 1)[0];
    };
    const build = (type: BuildingType, near: Point): boolean => {
      const cost = buildingCost(type, me.techs);
      if (!afford(cost) || w.eraOf(this.playerId) < BUILDING_DEFS[type].era) return false;
      const spot = findSpot(w, type, near, this.playerId);
      const u = spot && takeBuilder();
      if (!spot || !u) return false;
      pay(cost);
      cmd({ kind: 'build', unitIds: [u.id], building: type, tx: spot.x, ty: spot.y });
      return true;
    };
    const building = (t: BuildingType) => buildings.some((b) => b.type === t && b.progress < 1);

    // Casas antes de quedarse sin lugar.
    if (popCap - pop <= 3 && popCap < 200 && !building('house')) build('house', home);
    // Cuarteles, y en la Edad Media establo, arquería y el edificio único de su pueblo.
    if (workers.length >= 8 && !have('barracks')) build('barracks', home);
    if (era >= 2) {
      if (!have('stable')) build('stable', home);
      else if (!have('archery_range')) build('archery_range', home);
      else if (this.def.uniques) {
        const unique = (Object.keys(BUILDING_DEFS) as BuildingType[]).find((t) => BUILDING_DEFS[t].faction === me.faction);
        if (unique && !have(unique)) build(unique, home);
      }
    }
    // Con recursos de sobra: más cuarteles, establos y arquerías (más tropas a la vez) y mejoras.
    const wealthy = Object.values(purse).reduce((x, y) => x + y, 0) > 2500;
    if (era >= 2 && wealthy && this.level === 'normal') {
      const prod: BuildingType[] = ['barracks', 'stable', 'archery_range'];
      const n = (t: BuildingType) => buildings.filter((b) => b.type === t).length;
      const fewest = prod.sort((a, b) => n(a) - n(b))[0];
      if (n(fewest) < 3 && !prod.some((t) => building(t))) build(fewest, home);
      for (const b of buildings) {
        if (b.progress < 1 || b.queue.length > 0) continue;
        const tech = BUILDING_DEFS[b.type].researches.find((t) => TECH_DEFS[t].era <= era && !TECH_DEFS[t].advancesTo && !hasTech(me.techs, t));
        if (tech && afford(TECH_DEFS[tech].cost)) {
          pay(TECH_DEFS[tech].cost);
          cmd({ kind: 'research', buildingId: b.id, tech });
          break;
        }
      }
    }
    // Granjas cuando se acaban las bayas cerca.
    const foodWorkers = workers.filter((u) => u.task?.kind === 'gather' && u.task.resource === 'food').length;
    const farms = buildings.filter((b) => b.type === 'farm').length;
    if (!nearestNode(w, 'berries', home, 22) && foodWorkers >= farms && farms < 12 && !building('farm')) build('farm', home);

    // Subir a la Edad Media (el rival no pasa de ahí: es la era central del juego).
    if (era === 1 && have('barracks', true) && workers.length >= this.def.workers * 0.7 && tc.queue.length === 0) {
      const cost = TECH_DEFS.era2.cost;
      if (afford(cost)) {
        pay(cost);
        cmd({ kind: 'research', buildingId: tc.id, tech: 'era2' });
      }
    }

    // Trabajadores sin tarea: al recurso que más le falta. Lo que sobra (más de 800 guardado) pesa menos.
    const share = { ...SHARE[Math.min(2, era)] };
    for (const r of Object.keys(share) as ResourceType[]) if (me.resources[r] > 800) share[r] *= 0.3;
    const sum = Object.values(share).reduce((x, y) => x + y, 0);
    for (const r of Object.keys(share) as ResourceType[]) share[r] /= sum;
    const count: Record<ResourceType, number> = { food: 0, wood: 0, stone: 0, metal: 0 };
    for (const u of workers) if (u.task?.kind === 'gather') count[u.task.resource]++;
    // Rebalanceo: si un recurso sobra mucho, un trabajador de ahí pasa a otro (uno por vez).
    const rich = (Object.keys(count) as ResourceType[]).find((r) => me.resources[r] > 1200 && count[r] > 2);
    if (rich) {
      const mover = workers.find((u) => u.task?.kind === 'gather' && u.task.resource === rich && !u.carryAmount && builders.includes(u));
      if (mover) {
        mover.task = null; // queda libre: abajo se le da un recurso que falte
        mover.state = 'idle';
        count[rich]--;
      }
    }
    for (const u of workers) {
      if (u.task || u.state !== 'idle' || !builders.includes(u)) continue;
      const want = (Object.keys(share) as ResourceType[]).sort(
        (a, b) => count[a] / workers.length - share[a] - (count[b] / workers.length - share[b]),
      );
      for (const r of want) {
        const target = r === 'food' ? (nearestNode(w, 'berries', u, 25) ?? freeFarm(w, buildings, workers)) : nearestNode(w, NODE_OF[r], u, 40);
        if (!target) continue;
        cmd({ kind: 'gather', unitIds: [u.id], targetId: target.id });
        count[r]++;
        break;
      }
    }

    // ---------- Ejército ----------
    this.look(w, home);
    const military = workers.length >= this.def.workers * 0.6 || w.tick > this.def.firstWave * 10 * 0.6;
    for (const b of buildings) {
      if (b.progress < 1 || b.queue.length >= 2 || !military) continue;
      const choice = this.pickUnit(BUILDING_DEFS[b.type].trains, era);
      if (!choice) continue;
      const cost = unitCost(choice, me.techs);
      if (pop >= popCap || !afford(cost)) continue;
      pay(cost);
      cmd({ kind: 'train', buildingId: b.id, unit: choice });
    }

    // Defensa: enemigos cerca de la ciudad → todo el ejército libre a pelear.
    const threat = nearestEnemyUnit(w, this.playerId, home, 16);
    const idle = army.filter((u) => !u.task && u.routing === 0);
    if (threat) {
      if (idle.length) cmd({ kind: 'attack', unitIds: idle.map((u) => u.id), targetId: threat.id });
      return;
    }

    // Oleadas: marcha sobre la ciudad enemiga más cercana.
    const secs = w.tick / 10;
    const size = this.def.waveSize + this.waves * this.def.waveGrowth;
    const atHome = army.filter((u) => Math.hypot(u.x - home.x, u.y - home.y) < 25 && u.type !== 'general');
    if (secs >= this.def.firstWave && secs - this.lastWave >= this.def.waveEvery && atHome.length >= size) {
      const target = this.nearestRival(w, home);
      if (target !== null) {
        this.lastWave = secs;
        this.waves++;
        cmd({ kind: 'march', unitIds: atHome.map((u) => u.id), target });
        return;
      }
    }
    // Tropas lejos de casa sin nada que hacer (llegaron a la ciudad enemiga): atacar lo más cercano.
    for (const u of idle) {
      if (Math.hypot(u.x - home.x, u.y - home.y) < 25) continue;
      const foe = nearestEnemyUnit(w, this.playerId, u, 10) ?? nearestEnemyBuilding(w, this.playerId, u);
      if (foe) cmd({ kind: 'attack', unitIds: [u.id], targetId: foe.id });
    }
  }

  /** Mira el ejército enemigo que tiene a la vista (con niebla, solo lo que ve) y lo recuerda. */
  private look(w: World, home: Point): void {
    const s = this.seen;
    for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] *= 0.95;
    const vis = w.fog ? w.visible.get(this.playerId) : undefined;
    for (const u of w.units.values()) {
      if (u.owner === this.playerId || !isEnemy(w, this.playerId, u.owner) || u.type === 'worker') continue;
      if (vis && !vis[Math.floor(u.y) * w.size + Math.floor(u.x)]) continue;
      if (Math.hypot(u.x - home.x, u.y - home.y) > 60) continue;
      const d = UNIT_DEFS[u.type];
      if (d.category === 'cavalry') s.cavalry++;
      else if (d.weapon === 'spear') s.spear++;
      else if (d.weapon === 'blade') s.blade++;
      else if (d.category === 'ranged') s.ranged++;
    }
  }

  /**
   * Qué entrenar en este edificio. Con contraataques: lanzas contra caballería, espadas contra
   * lanzas, caballería contra espadas y arqueros. Si no ve nada, va rotando.
   */
  private pickUnit(trains: readonly UnitType[], era: number): UnitType | null {
    const ok = trains.filter((t) => {
      const d = UNIT_DEFS[t];
      if (d.era > era || d.untilEra < era || d.hero || d.buildingsOnly || d.docks || t === 'worker' || t === 'scout') return false;
      if (d.faction && !this.def.uniques) return false;
      return d.category !== 'siege'; // las máquinas de asedio, a mano (el rival no las usa)
    });
    if (ok.length === 0) return null;
    if (this.def.counters) {
      const s = this.seen;
      const total = s.cavalry + s.spear + s.blade + s.ranged;
      if (total >= 3) {
        const top = (Object.keys(s) as (keyof typeof s)[]).sort((a, b) => s[b] - s[a])[0];
        const good = ok.filter((t) => {
          const d = UNIT_DEFS[t];
          if (top === 'cavalry') return d.weapon === 'spear';
          if (top === 'spear') return d.weapon === 'blade' || d.category === 'ranged';
          return d.category === 'cavalry' && d.attack.type === 'melee'; // contra espadas y arqueros
        });
        if (good.length) return good[this.rotate++ % good.length];
      }
    }
    return ok[this.rotate++ % ok.length];
  }

  /** El rival en guerra con la ciudad más cercana. */
  private nearestRival(w: World, home: Point): number | null {
    let best: number | null = null, bd = Infinity;
    for (const b of w.buildings.values()) {
      if (b.type !== 'town_center' || !isEnemy(w, this.playerId, b.owner) || w.players.get(b.owner)?.defeated) continue;
      const d = Math.hypot(b.tx - home.x, b.ty - home.y);
      if (d < bd) [bd, best] = [d, b.owner];
    }
    return best;
  }
}

/** El nodo del mapa de ese tipo más cercano (dentro de `r` casillas). */
function nearestNode(w: World, type: string, from: Point, r: number): { id: number } | null {
  let best: { id: number } | null = null, bd = r * r;
  for (const n of w.nodes.values()) {
    if (n.type !== type || n.amount <= 0) continue;
    const d = (n.tx + 0.5 - from.x) ** 2 + (n.ty + 0.5 - from.y) ** 2;
    if (d < bd) [bd, best] = [d, n];
  }
  return best;
}

/** Una granja propia terminada que nadie trabaja. */
function freeFarm(w: World, buildings: Building[], workers: Unit[]): { id: number } | null {
  const busy = new Set(workers.map((u) => (u.task?.kind === 'gather' ? u.task.targetId : 0)));
  return buildings.find((b) => b.type === 'farm' && b.progress >= 1 && !busy.has(b.id)) ?? null;
}

function nearestEnemyUnit(w: World, owner: number, from: Point, r: number): Unit | null {
  let best: Unit | null = null, bd = r * r;
  for (const u of w.units.values()) {
    if (u.owner === owner || u.hp <= 0 || !isEnemy(w, owner, u.owner) || UNIT_DEFS[u.type].flies) continue;
    const d = (u.x - from.x) ** 2 + (u.y - from.y) ** 2;
    if (d < bd) [bd, best] = [d, u];
  }
  return best;
}

function nearestEnemyBuilding(w: World, owner: number, from: Point): Building | null {
  let best: Building | null = null, bd = Infinity;
  for (const b of w.buildings.values()) {
    if (!isEnemy(w, owner, b.owner)) continue;
    const d = (b.tx + b.size / 2 - from.x) ** 2 + (b.ty + b.size / 2 - from.y) ** 2;
    if (d < bd) [bd, best] = [d, b];
  }
  return best;
}

/**
 * Lugar libre para un edificio cerca de `near`, con una casilla de pasillo alrededor
 * (para no encerrar a sus propias tropas). Busca en anillos cada vez más lejos.
 */
export function findSpot(w: World, type: BuildingType, near: Point, owner: number): Point | null {
  const s = BUILDING_DEFS[type].size;
  const cx = Math.floor(near.x), cy = Math.floor(near.y);
  // Las granjas, pegadas a la ciudad; lo demás, un poco más afuera.
  const r0 = type === 'farm' ? 3 : type === 'house' ? 4 : 5;
  for (let r = r0; r <= 22; r++) {
    // Un anillo, empezando por un lado distinto según el jugador (no todos iguales).
    const ring: Point[] = [];
    for (let i = -r; i <= r; i++) ring.push({ x: cx + i, y: cy - r }, { x: cx + r, y: cy + i }, { x: cx - i, y: cy + r }, { x: cx - r, y: cy - i });
    const off = (owner * 7) % ring.length;
    for (let k = 0; k < ring.length; k++) {
      const p = ring[(k + off) % ring.length];
      const tx = p.x - Math.floor(s / 2), ty = p.y - Math.floor(s / 2);
      if (w.placementError(type, tx, ty)) continue;
      let clear = true;
      for (let y = ty - 1; y <= ty + s && clear; y++)
        for (let x = tx - 1; x <= tx + s; x++)
          if (!w.inBounds(x, y) || !w.isFree(x, y)) {
            clear = false;
            break;
          }
      if (clear) return { x: tx, y: ty };
    }
  }
  return null;
}
