/**
 * Creates the stable local-save envelope.
 * @param {number} saveVersion
 * @param {import('./types.js').GameState} state
 * @returns {import('./types.js').SaveData}
 */
export function createSaveDataEntity(saveVersion, state) {
  return { saveVersion, state };
}
