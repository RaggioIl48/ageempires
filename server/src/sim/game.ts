// Fachada de la simulación: recibe órdenes, avanza el tiempo y construye lo
// que cada jugador puede ver. No sabe nada de sockets.

import { BUILDING_DEFS, TICK_MS, eraLabel } from '../../../shared/data.ts';
import type {
  BuildingView,
  Command,
  EconomyView,
  NodeView,
  PlayerSummary,
  PlayerView,
  UnitView,
} from '../../../shared/protocol.ts';
import { canHitAir, scaleCost } from '../../../shared/stats.ts';
import { assignBuild, needsWork, updateBuilders } from './build.ts';
import { assignAttack, removeDead, targetOf, updateCombat } from './combat.ts';
import { diplo, isEnemy, updateDiplomacy } from './diplomacy.ts';
import { assignFarm, assignGather, farmTaken, isOwnFarm, stopWork, updateGatherers } from './gather.ts';
import { generateWorld, type MapOptions } from './mapgen.ts';
import { moveGroup, moveUnits, separateUnits } from './movement.ts';
import { cancelQueued, queueTech, queueUnit, setRally, updateProduction } from './production.ts';
import type { Building, ResourceNode, Unit, World } from './world.ts';

/** Radio (casillas) en el que un grupo de trabajadores se reparte los recursos. */
const GROUP_SPREAD_RADIUS = 4;

export class Game {
  readonly world: World;
  private queue: { playerId: number; cmd: Command }[] = [];

  /** Se crea desde opciones de mapa o desde un mundo ya armado (útil en pruebas). */
  constructor(source: MapOptions | World) {
    this.world = 'slots' in source ? generateWorld(source) : source;
  }

  /** Las órdenes se aplican al inicio del siguiente paso, en orden de llegada. */
  enqueue(playerId: number, cmd: Command): void {
    this.queue.push({ playerId, cmd });
  }

  step(): void {
    const w = this.world;
    w.tick++;
    w.events = [];
    w.walker = 0;
    const dt = TICK_MS / 1000;
    for (const { playerId, cmd } of this.queue) this.apply(playerId, cmd);
    this.queue = [];
    updateDiplomacy(w);
    updateProduction(w, dt);
    updateCombat(w, dt);
    moveUnits(w, dt);
    updateGatherers(w, dt);
    updateBuilders(w, dt);
    removeDead(w);
    separateUnits(w);
  }

  /** Aplica una orden SOLO sobre lo que pertenece a quien la envía. */
  private apply(playerId: number, cmd: Command): void {
    const w = this.world;
    // Órdenes sobre edificios.
    switch (cmd.kind) {
      case 'train': {
        const b = w.buildings.get(cmd.buildingId);
        if (!b) return;
        const error = queueUnit(w, playerId, b, cmd.unit);
        if (error) w.notify(playerId, error);
        return;
      }
      case 'research': {
        const b = w.buildings.get(cmd.buildingId);
        if (!b) return;
        const error = queueTech(w, playerId, b, cmd.tech);
        if (error) w.notify(playerId, error);
        return;
      }
      case 'cancelTrain': {
        const b = w.buildings.get(cmd.buildingId);
        if (b) cancelQueued(w, playerId, b, cmd.index);
        return;
      }
      case 'rally': {
        const b = w.buildings.get(cmd.buildingId);
        if (b) setRally(w, playerId, b, clamp(cmd.x, 0, w.size - 0.01), clamp(cmd.y, 0, w.size - 0.01));
        return;
      }
      case 'delete':
        this.deleteOwn(playerId, cmd.ids);
        return;
      case 'diplo':
        diplo(w, playerId, cmd.action, cmd.target);
        return;
    }

    // Órdenes sobre unidades.
    const units = cmd.unitIds
      .map((id) => w.units.get(id))
      .filter((u): u is Unit => u !== undefined && u.owner === playerId && u.hp > 0);
    if (units.length === 0) return;
    const workers = units.filter((u) => u.type === 'worker');
    switch (cmd.kind) {
      case 'stop':
        for (const u of units) stopWork(u);
        break;
      case 'move':
        moveGroup(w, units, clamp(cmd.x, 0, w.size - 0.01), clamp(cmd.y, 0, w.size - 0.01));
        break;
      case 'gather': {
        const node = w.nodes.get(cmd.targetId);
        if (node) this.gatherGroup(workers, node);
        else {
          const farm = w.buildings.get(cmd.targetId);
          if (isOwnFarm(farm, playerId)) this.farmGroup(workers, farm);
        }
        break;
      }
      case 'build': {
        const def = BUILDING_DEFS[cmd.building];
        if (!def.buildable || workers.length === 0) return;
        if (w.eraOf(playerId) < def.era) return w.notify(playerId, `${def.label}: necesitas la ${eraLabel(def.era)}`);
        const error = w.placementError(cmd.building, cmd.tx, cmd.ty);
        if (error) return w.notify(playerId, error);
        if (!w.spend(playerId, def.cost)) return w.notify(playerId, 'Recursos insuficientes');
        const b = w.addBuilding(cmd.building, playerId, cmd.tx, cmd.ty, false)!;
        for (const u of workers) assignBuild(w, u, b);
        break;
      }
      case 'construct': {
        const b = w.buildings.get(cmd.targetId);
        if (!b || b.owner !== playerId) return;
        if (needsWork(b)) for (const u of workers) assignBuild(w, u, b);
        else if (b.type === 'farm') this.farmGroup(workers, b);
        break;
      }
      case 'attack': {
        const t = targetOf(w, cmd.targetId);
        if (!t) return;
        const owner = t.kind === 'unit' ? t.unit.owner : t.building.owner;
        if (owner !== playerId && !isEnemy(w, playerId, owner)) {
          const name = w.players.get(owner)?.name ?? '';
          const rel = w.relation(playerId, owner);
          return w.notify(playerId, rel === 'ally' ? `${name} es tu aliado: no puedes atacarlo` : `Estás en paz con ${name}: declárale la guerra primero`);
        }
        if (owner === playerId) return;
        // A los aviones solo los alcanzan los ataques a distancia.
        const attackers = t.kind === 'unit' && w.statsOf(t.unit).flies ? units.filter((u) => canHitAir(w.statsOf(u).attack)) : units;
        if (attackers.length === 0) return w.notify(playerId, 'Solo las unidades a distancia pueden atacar aviones');
        for (const u of attackers) assignAttack(u, cmd.targetId);
        break;
      }
    }
  }

  /** Un grupo se reparte entre el nodo elegido y los del mismo tipo más cercanos (y alcanzables). */
  private gatherGroup(workers: Unit[], node: ResourceNode): void {
    const w = this.world;
    const targets = [...w.nodes.values()]
      .filter(
        (n) =>
          n.type === node.type &&
          Math.hypot(n.tx - node.tx, n.ty - node.ty) <= GROUP_SPREAD_RADIUS &&
          w.isExposed(n.tx, n.ty),
      )
      .sort((a, b) => Math.hypot(a.tx - node.tx, a.ty - node.ty) - Math.hypot(b.tx - node.tx, b.ty - node.ty));
    if (targets.length === 0) targets.push(node); // se intentará igual y se buscará otro al fallar
    workers.forEach((u, i) => assignGather(w, u, targets[i % targets.length]));
  }

  /** Cada granja la trabaja una sola persona: los demás van a otras granjas libres cercanas. */
  private farmGroup(workers: Unit[], farm: Building): void {
    const w = this.world;
    const free = [farm, ...[...w.buildings.values()].filter((b) => b !== farm && isOwnFarm(b, farm.owner))]
      .filter((b) => Math.hypot(b.tx - farm.tx, b.ty - farm.ty) <= 10)
      .sort((a, b) => Math.hypot(a.tx - farm.tx, a.ty - farm.ty) - Math.hypot(b.tx - farm.tx, b.ty - farm.ty));
    let left = 0;
    for (const u of workers) {
      const f = free.find((b) => !farmTaken(w, b, u));
      if (f && assignFarm(w, u, f)) continue;
      left++;
    }
    if (left > 0) w.notify(farm.owner, 'Cada granja la trabaja un solo trabajador');
  }

  private deleteOwn(playerId: number, ids: number[]): void {
    const w = this.world;
    for (const id of ids) {
      const u = w.units.get(id);
      if (u && u.owner === playerId) u.hp = 0;
      const b = w.buildings.get(id);
      if (b && b.owner === playerId) {
        // Un cimiento sin terminar devuelve lo que falta por construir.
        if (b.progress < 1) w.refund(playerId, scaleCost(BUILDING_DEFS[b.type].cost, 1 - b.progress));
        b.hp = 0;
      }
    }
  }

  // ---------- Vistas para la red ----------

  playerViews(): PlayerView[] {
    return [...this.world.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      faction: p.faction,
      connected: p.connected,
    }));
  }

  /** Avisos pendientes de un jugador (y los borra). */
  takeNotices(playerId: number): string[] {
    const p = this.world.players.get(playerId);
    if (!p || p.notices.length === 0) return [];
    const out = p.notices;
    p.notices = [];
    return out;
  }

  nodeViews(): NodeView[] {
    return [...this.world.nodes.values()].map(nodeView);
  }

  /** Resultado de cada jugador (para la pantalla final). */
  summary(): PlayerSummary[] {
    const w = this.world;
    return [...w.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      faction: p.faction,
      gathered: p.gathered,
      units: [...w.units.values()].filter((u) => u.owner === p.id).length,
      buildings: [...w.buildings.values()].filter((b) => b.owner === p.id && b.progress >= 1).length,
      kills: p.kills,
      era: p.era,
    }));
  }

  unitViews(): UnitView[] {
    return [...this.world.units.values()].map(unitView);
  }

  /** Edificios; la cola, el punto de reunión y la falta de casas solo los ve el dueño. */
  buildingViews(playerId: number): BuildingView[] {
    return [...this.world.buildings.values()].map((b) => buildingView(b, b.owner === playerId));
  }

  /** Nodos modificados desde la última llamada (y los limpia). */
  takeNodeChanges(): { changed: NodeView[]; removed: number[] } {
    const w = this.world;
    const changed: NodeView[] = [];
    for (const id of w.changedNodes) {
      const n = w.nodes.get(id);
      if (n) changed.push(nodeView(n));
    }
    const removed = [...w.removedNodes];
    w.changedNodes.clear();
    w.removedNodes.length = 0;
    return { changed, removed };
  }

  economyOf(playerId: number): EconomyView {
    const w = this.world;
    const p = w.players.get(playerId);
    const workers: EconomyView['workers'] = { idle: 0, other: 0, food: 0, wood: 0, stone: 0, metal: 0 };
    for (const u of w.units.values()) {
      if (u.owner !== playerId || u.type !== 'worker') continue;
      if (u.task?.kind === 'gather') workers[u.task.resource]++;
      else if (!u.task && u.state === 'idle') workers.idle++;
      else workers.other++;
    }
    return {
      resources: p ? { ...p.resources } : { food: 0, wood: 0, stone: 0, metal: 0 },
      ...w.popOf(playerId),
      workers,
      perMinute: w.perMinute(playerId),
    };
  }
}

function unitView(u: Unit): UnitView {
  const v: UnitView = {
    id: u.id,
    owner: u.owner,
    type: u.type,
    x: round2(u.x),
    y: round2(u.y),
    hp: Math.ceil(u.hp),
    state: u.state,
  };
  if (u.path.length > 0) v.walk = 1;
  if (u.task?.kind === 'gather') v.task = u.task.resource;
  if (u.task && u.task.kind !== 'gather') v.targetId = u.task.targetId;
  if (u.carryType && u.carryAmount > 0) {
    v.carryType = u.carryType;
    v.carryAmount = u.carryAmount;
  }
  return v;
}

/** Vista de un edificio. `includePrivate`: cola, punto de reunión y falta de casas (solo para el dueño). */
export function buildingView(b: Building, includePrivate: boolean): BuildingView {
  const v: BuildingView = {
    id: b.id,
    owner: b.owner,
    type: b.type,
    tx: b.tx,
    ty: b.ty,
    hp: Math.ceil(b.hp),
    progress: Math.round(b.progress * 1000) / 1000,
  };
  if (b.type === 'farm') v.food = b.food;
  if (includePrivate) {
    if (b.queue.length > 0)
      v.queue = b.queue.map((q) => ({ ...(q.tech ? { tech: q.tech } : { unit: q.unit }), progress: Math.round(q.progress * 100) / 100 }));
    if (b.rally) v.rally = { x: round2(b.rally.x), y: round2(b.rally.y) };
    if (b.needsHouses) v.needsHouses = 1;
  }
  return v;
}

function nodeView(n: ResourceNode): NodeView {
  return { id: n.id, type: n.type, tx: n.tx, ty: n.ty, amount: n.amount };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
