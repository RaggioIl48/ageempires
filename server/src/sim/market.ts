// Mercado, como en AoE: se compran y venden lotes de comida, madera o
// piedra a cambio de metal. Los precios son iguales para toda la partida:
// cuando alguien compra, sube; cuando alguien vende, baja.

import {
  BUILDING_DEFS,
  MARKET_LOT,
  MARKET_MAX,
  MARKET_MIN,
  MARKET_STEP,
  RESOURCE_LABELS,
  sellPrice,
  type TradeResource,
} from '../../../shared/data.ts';
import type { Building, World } from './world.ts';

/** Compra o vende un lote. Devuelve un aviso si no se puede, o null si se hizo. */
export function trade(world: World, playerId: number, b: Building, resource: TradeResource, buy: boolean): string | null {
  if (b.owner !== playerId || !BUILDING_DEFS[b.type].market) return null;
  if (b.progress < 1) return 'The building is not finished yet';
  const p = world.players.get(playerId);
  if (!p) return null;
  const price = world.market[resource];
  if (buy) {
    if (p.resources.metal < price) return `You need ${price} metal to buy ${MARKET_LOT} ${RESOURCE_LABELS[resource]}`;
    p.resources.metal -= price;
    p.resources[resource] += MARKET_LOT;
    world.market[resource] = Math.min(MARKET_MAX, price + MARKET_STEP);
  } else {
    if (p.resources[resource] < MARKET_LOT) return `You need ${MARKET_LOT} ${RESOURCE_LABELS[resource]} to sell`;
    p.resources[resource] -= MARKET_LOT;
    p.resources.metal += sellPrice(price);
    world.market[resource] = Math.max(MARKET_MIN, price - MARKET_STEP);
  }
  world.marketVersion++;
  return null;
}
