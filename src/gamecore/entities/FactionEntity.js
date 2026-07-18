/**
 * Creates the mutable match state of one faction.
 * @param {Partial<{credits:number,ownerTurns:number}>} [data]
 */
export function createFactionEntity(data = {}) {
  return {
    credits: Number.isFinite(data.credits) ? data.credits : 0,
    ownerTurns: Number.isInteger(data.ownerTurns) ? data.ownerTurns : 0,
  };
}
