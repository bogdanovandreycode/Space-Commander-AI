import { createUnitMemoryEntity } from './UnitMemoryEntity.js';

/**
 * Creates a plain, save-safe ship entity.
 * @param {import('./types.js').Ship} data
 * @returns {import('./types.js').Ship}
 */
export function createShipEntity(data) {
  if (!data || !Number.isInteger(data.id) || !data.type || !data.faction) {
    throw new Error('INVALID_SHIP_ENTITY');
  }
  return {
    id: data.id,
    name: String(data.name ?? ''),
    type: data.type,
    faction: data.faction,
    x: data.x,
    y: data.y,
    hp: data.hp,
    hasActed: Boolean(data.hasActed),
    movementCooldown: data.movementCooldown ?? 0,
    cooldownSetOwnerTurn: data.cooldownSetOwnerTurn ?? null,
    role: data.role,
    aiMemory: createUnitMemoryEntity({
      ...data.aiMemory,
      callsign: data.aiMemory?.callsign || data.name || '',
    }),
  };
}
