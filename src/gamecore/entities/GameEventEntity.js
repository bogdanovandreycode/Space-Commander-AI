/**
 * Creates an event-log entity.
 * @param {import('./types.js').GameEvent} data
 * @returns {import('./types.js').GameEvent}
 */
export function createGameEventEntity(data) {
  return {
    id: data.id,
    type: data.type,
    round: data.round,
    faction: data.faction,
    details: data.details ?? {},
  };
}
