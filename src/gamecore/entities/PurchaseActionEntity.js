/**
 * Creates a legal shipyard purchase entity.
 * @param {import('./types.js').PurchaseAction} data
 * @returns {import('./types.js').PurchaseAction}
 */
export function createPurchaseActionEntity(data) {
  return {
    id: data.id,
    type: data.type,
    planetId: data.planetId,
    unitType: data.unitType,
    semanticClass: data.semanticClass,
    cost: data.cost,
    strategicTags: Array.isArray(data.strategicTags) ? [...data.strategicTags] : [],
  };
}
