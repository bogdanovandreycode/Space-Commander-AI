import { clone, deepFreeze } from '../helpers/deepFreeze.js';

/**
 * Creates a detached immutable view of game state.
 * @param {import('./types.js').GameState} state
 * @returns {import('./types.js').GameSnapshot}
 */
export function createGameSnapshotEntity(state) {
  return deepFreeze(clone(state));
}
