// Proyectiles, munición y choque de la carga (Total War).
//
// - Las flechas, jabalinas y piedras VUELAN: el daño se calcula al tirar (con ventajas, flancos,
//   altura, cansancio…) pero se aplica al caer, donde esté el objetivo en ese momento. Si se movió,
//   puede pegarle a otro que esté ahí, aunque sea del mismo bando (fuego amigo en la mezcla).
//   Un soldado con escudo que mira hacia el tirador para buena parte del daño.
// - Los soldados a distancia tienen munición (AMMO). Sin flechas no tiran; la recuperan cerca de
//   un edificio propio que entrena tropas.
// - La carga de caballería derriba al que recibe el golpe (queda unos instantes en el suelo, sin
//   pelear ni moverse), lo empuja hacia atrás y se lleva por delante a un par de enemigos más.

import {
  AMMO,
  AMMO_RESUPPLY,
  AMMO_RESUPPLY_RADIUS,
  BUILDING_DEFS,
  CHARGE_TRAMPLE,
  CHARGE_TRAMPLE_DAMAGE,
  KNOCKDOWN_PUSH,
  KNOCKDOWN_SECONDS,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_SPEED,
  PROJECTILE_SPREAD,
  SHIELD_BLOCK,
  TICK_RATE,
  UNIT_DEFS,
  rankOf,
  type UnitType,
} from '../../../shared/data.ts';
import { isEnemy } from './diplomacy.ts';
import { hitMorale } from './morale.ts';
import type { Unit, World } from './world.ts';

/** Tipos que pelean sin escudo (armas a dos manos, sin armadura o de otra época). */
const NO_SHIELD = new Set<UnitType>(['worker', 'fanatic', 'berserker', 'chosen_axeman', 'gothic_warband', 'ulfhednar', 'axe_thrower']);

/** ¿Lleva escudo? Infantería cuerpo a cuerpo de las eras antiguas (no los de dos manos). */
export function hasShield(type: UnitType): boolean {
  const def = UNIT_DEFS[type];
  return def.category === 'infantry' && def.attack.type === 'melee' && def.era <= 2 && !NO_SHIELD.has(type) && !def.shot;
}

/** Velocidad de vuelo según lo que se tira. */
function speedOf(type: UnitType): number {
  const def = UNIT_DEFS[type];
  if (def.shot === 'bullet') return PROJECTILE_SPEED.bullet;
  return /javelin|axe_thrower|slinger|scout/.test(type) ? PROJECTILE_SPEED.javelin : PROJECTILE_SPEED.arrow;
}

/**
 * Tira un proyectil a una unidad. El daño ya viene calculado; cae dentro de unos pasos.
 * Devuelve false si no corresponde (cañones y obuses siguen siendo instantáneos, con su explosión).
 */
export function launch(world: World, owner: number, attacker: Unit, target: Unit, damage: number): { ticks: number; x: number; y: number } | null {
  const def = UNIT_DEFS[attacker.type];
  if (def.shot === 'shell') return null;
  if (Number.isFinite(attacker.ammo)) attacker.ammo = Math.max(0, attacker.ammo - 1);
  const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
  // Desvío: más lejos, más error; los veteranos apuntan mejor.
  const err = dist * PROJECTILE_SPREAD * (1 - 0.2 * rankOf(attacker.kills)) * Math.sqrt(world.rand());
  const ang = world.rand() * Math.PI * 2;
  const x = target.x + Math.cos(ang) * err, y = target.y + Math.sin(ang) * err;
  const ticks = Math.max(1, Math.round((dist / speedOf(attacker.type)) * TICK_RATE));
  world.projectiles.push({ owner, attackerId: attacker.id, targetId: target.id, x, y, fromX: attacker.x, fromY: attacker.y, at: world.tick + ticks, damage });
  return { ticks, x, y };
}

/** Caen los proyectiles de este paso. */
export function updateProjectiles(world: World): void {
  if (!world.projectiles.length) return;
  const landing = world.projectiles.filter((p) => p.at <= world.tick);
  if (!landing.length) return;
  world.projectiles = world.projectiles.filter((p) => p.at > world.tick);
  for (const p of landing) {
    // Primero el apuntado, si sigue cerca del punto de caída; si no, el más cercano a ese punto.
    const r2 = PROJECTILE_HIT_RADIUS ** 2;
    let victim: Unit | null = null;
    const aimed = world.units.get(p.targetId);
    if (aimed && aimed.hp > 0 && (aimed.x - p.x) ** 2 + (aimed.y - p.y) ** 2 <= r2 * 1.6) victim = aimed;
    else {
      let best = r2;
      for (const u of world.units.values()) {
        if (u.hp <= 0 || u.id === p.attackerId || world.statsOf(u).flies) continue;
        const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2;
        if (d < best) [best, victim] = [d, u];
      }
    }
    if (!victim) continue; // al suelo
    let dmg = p.damage;
    // Fuego amigo: los propios reciben menos (el tirador no les apuntaba).
    if (!isEnemy(world, p.owner, victim.owner)) dmg = Math.max(1, Math.round(dmg * 0.5));
    // Escudo: si mira hacia de donde viene el tiro, para buena parte.
    let blocked = false;
    if (hasShield(victim.type) && victim.routing === 0) {
      const dx = p.fromX - victim.x, dy = p.fromY - victim.y, len = Math.hypot(dx, dy) || 1;
      if ((victim.fx * dx + victim.fy * dy) / len > 0.5) {
        dmg = Math.max(1, Math.round(dmg * SHIELD_BLOCK));
        blocked = true;
      }
    }
    const before = victim.hp;
    victim.hp -= dmg;
    hitMorale(world, victim, dmg, 0, p.owner, false);
    world.events.push({ k: 'hit', x: victim.x, y: victim.y, ...(blocked ? { b: 1 as const } : {}) });
    if (before > 0 && victim.hp <= 0 && victim.owner !== p.owner) {
      const pl = world.players.get(p.owner);
      if (pl) pl.kills++;
      const shooter = world.units.get(p.attackerId);
      if (shooter) {
        const r0 = rankOf(shooter.kills);
        shooter.kills++;
        if (rankOf(shooter.kills) > r0) world.events.push({ k: 'rank', x: shooter.x, y: shooter.y, r: rankOf(shooter.kills) });
      }
    }
  }
}

/** Recuperan munición los tiradores cerca de un edificio propio que entrena tropas (una vez por segundo). */
export function resupply(world: World): void {
  if (world.tick % TICK_RATE !== 0) return;
  const r2 = AMMO_RESUPPLY_RADIUS ** 2;
  for (const u of world.units.values()) {
    if (!Number.isFinite(u.ammo) || u.ammo >= AMMO) continue;
    for (const b of world.buildings.values()) {
      if (b.owner !== u.owner || b.progress < 1 || BUILDING_DEFS[b.type].trains.length === 0) continue;
      const cx = b.tx + b.size / 2, cy = b.ty + b.size / 2;
      if ((u.x - cx) ** 2 + (u.y - cy) ** 2 <= r2 + b.size * b.size) {
        u.ammo = Math.min(AMMO, u.ammo + AMMO_RESUPPLY);
        break;
      }
    }
  }
}

/** Derriba a un soldado: queda en el suelo y retrocede en la dirección del golpe. */
function knockDown(world: World, u: Unit, dx: number, dy: number): void {
  const def = UNIT_DEFS[u.type];
  if (def.hero || (def.category !== 'infantry' && def.category !== 'ranged' && def.category !== 'worker')) return;
  u.down = Math.round(KNOCKDOWN_SECONDS * TICK_RATE);
  u.path = [];
  if (u.state === 'moving') u.state = 'idle';
  const nx = u.x + dx * KNOCKDOWN_PUSH, ny = u.y + dy * KNOCKDOWN_PUSH;
  if (world.inBounds(Math.floor(nx), Math.floor(ny)) && world.isWalkable(Math.floor(nx), Math.floor(ny))) [u.x, u.y] = [nx, ny];
}

/**
 * Choque de la carga: el objetivo cae y retrocede, y la carga arrolla a un par de enemigos más
 * que estén justo delante del jinete (con parte del daño).
 */
export function chargeImpact(world: World, attacker: Unit, target: Unit, damage: number): void {
  const dx = target.x - attacker.x, dy = target.y - attacker.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  knockDown(world, target, ux, uy);
  let trampled = 0;
  for (const o of world.units.values()) {
    if (trampled >= CHARGE_TRAMPLE) break;
    if (o === target || o.hp <= 0 || !isEnemy(world, attacker.owner, o.owner)) continue;
    const ox = o.x - target.x, oy = o.y - target.y;
    if (ox * ox + oy * oy > 1.2 * 1.2 || ox * ux + oy * uy < -0.2) continue; // solo los de adelante
    const d = Math.max(1, Math.round(damage * CHARGE_TRAMPLE_DAMAGE));
    o.hp -= d;
    hitMorale(world, o, d, 0, attacker.owner, true);
    knockDown(world, o, ux, uy);
    world.events.push({ k: 'hit', x: o.x, y: o.y, c: 1 });
    trampled++;
  }
}

/** Los derribados se levantan de a poco. */
export function updateKnockdowns(world: World): void {
  for (const u of world.units.values()) if (u.down > 0) u.down--;
}
