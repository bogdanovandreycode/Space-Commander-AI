import { createPredictedResultEntity } from './PredictedResultEntity.js';

/**
 * Creates a legal unit-action entity.
 * @param {import('./types.js').LegalAction} data
 * @returns {import('./types.js').LegalAction}
 */
export function createLegalActionEntity(data) {
  return {
    id: data.id,
    type: data.type,
    unitId: data.unitId,
    to: data.to ? [...data.to] : null,
    targetUnitId: data.targetUnitId ?? null,
    planetId: data.planetId ?? null,
    risk: data.risk ?? 0,
    orderFit: data.orderFit ?? 0,
    strategicValue: data.strategicValue ?? 0,
    predictedResult: createPredictedResultEntity(data.predictedResult),
    strategicTags: Array.isArray(data.strategicTags) ? [...data.strategicTags] : [],
  };
}
