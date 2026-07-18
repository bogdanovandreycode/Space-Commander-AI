/**
 * Creates a plain, save-safe planet entity.
 * @param {import('./types.js').Planet} data
 * @returns {import('./types.js').Planet}
 */
export function createPlanetEntity(data) {
  if (!data || !Number.isInteger(data.id) || !data.type || !data.faction) {
    throw new Error('INVALID_PLANET_ENTITY');
  }
  return {
    id: data.id,
    type: data.type,
    faction: data.faction,
    x: data.x,
    y: data.y,
    hp: data.hp,
    readyFromOwnerTurn: data.readyFromOwnerTurn,
    productionUsedOwnerTurn: data.productionUsedOwnerTurn ?? 0,
    damagedSincePreviousOwnerTurn: Boolean(data.damagedSincePreviousOwnerTurn),
  };
}
