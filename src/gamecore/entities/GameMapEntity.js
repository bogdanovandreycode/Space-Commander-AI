/**
 * Creates the rectangular game-map entity.
 * @param {{width:number,height:number}} data
 */
export function createGameMapEntity(data) {
  if (!Number.isInteger(data?.width) || data.width <= 0
    || !Number.isInteger(data?.height) || data.height <= 0) {
    throw new Error('INVALID_GAME_MAP_ENTITY');
  }
  return { width: data.width, height: data.height };
}
