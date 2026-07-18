/**
 * Creates the deterministic preview attached to a legal action.
 * @param {Partial<import('./types.js').PredictedResult>} [data]
 * @returns {import('./types.js').PredictedResult}
 */
export function createPredictedResultEntity(data = {}) {
  return {
    targetDestroyed: Boolean(data.targetDestroyed),
    selfDestroyed: Boolean(data.selfDestroyed),
    lethalNextTurn: Boolean(data.lethalNextTurn),
    expectedIncomingDamage: Number.isFinite(data.expectedIncomingDamage)
      ? data.expectedIncomingDamage
      : 0,
    colonizedPlanet: Boolean(data.colonizedPlanet),
    unitRepaired: Boolean(data.unitRepaired),
  };
}
