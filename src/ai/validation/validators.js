function code(value, fallback = 'UNSPECIFIED') {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 100)
    : fallback;
}

function text(value, limit = 300) {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

export function normalizeExecutionOrder(requested, units) {
  const valid = new Set(units.map((unit) => unit.id));
  const used = new Set();
  const result = [];
  for (const id of requested ?? []) {
    if (Number.isInteger(id) && valid.has(id) && !used.has(id)) {
      result.push(id);
      used.add(id);
    }
  }
  const remaining = units
    .filter((unit) => !used.has(unit.id))
    .sort((a, b) => a.id - b.id);
  result.push(...remaining.map((unit) => unit.id));
  return result;
}

export function validateHeadquartersPlan(value, units, planets, credits) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_HEADQUARTERS_PLAN');
  const unitIds = new Set(units.map((unit) => unit.id));
  const planetIds = new Set(planets.map((planet) => planet.id));
  const recommendations = [];
  for (const item of value.unitRecommendations ?? []) {
    if (!Number.isInteger(item?.unitId) || !unitIds.has(item.unitId)) continue;
    if (recommendations.some((entry) => entry.unitId === item.unitId)) continue;
    recommendations.push({
      unitId: item.unitId,
      recommendation: code(item.recommendation, 'IMPROVE_TACTICAL_POSITION'),
      targetType: ['UNIT', 'PLANET', 'CELL', 'NONE'].includes(item.targetType) ? item.targetType : 'NONE',
      targetId: Number.isInteger(item.targetId) ? item.targetId : null,
      targetCell: Array.isArray(item.targetCell) ? item.targetCell.slice(0, 2) : null,
      priority: Math.max(0, Math.min(100, Number(item.priority) || 50)),
      acceptableAlternatives: (item.acceptableAlternatives ?? []).map((entry) => code(entry)).slice(0, 6),
      reasonCode: code(item.reasonCode),
    });
  }
  for (const unit of units) {
    if (!recommendations.some((item) => item.unitId === unit.id)) {
      recommendations.push({
        unitId: unit.id,
        recommendation: unit.type === 'scout' ? 'COLONIZE_NEAREST_PLANET' : 'IMPROVE_TACTICAL_POSITION',
        targetType: 'NONE',
        targetId: null,
        targetCell: null,
        priority: 40,
        acceptableAlternatives: ['DEFEND', 'RETREAT_AND_REPAIR', 'WAIT'],
        reasonCode: 'DEFAULT_RECOMMENDATION',
      });
    }
  }
  const directive = value.procurementDirective ?? {};
  return {
    doctrine: code(value.doctrine, 'BALANCED_OPERATIONS'),
    commanderComment: text(value.commanderComment) || 'Штаб завершил анализ текущего хода.',
    priorities: Array.isArray(value.priorities) ? value.priorities.slice(0, 12) : [],
    unitRecommendations: recommendations,
    executionOrder: normalizeExecutionOrder(value.executionOrder, units),
    procurementDirective: {
      goal: code(directive.goal, 'MAINTAIN_BALANCE'),
      maxSpend: Math.max(0, Math.min(credits, Number(directive.maxSpend) || credits)),
      minimumReserve: Math.max(0, Math.min(credits, Number(directive.minimumReserve) || 0)),
      desiredFleetChanges: directive.desiredFleetChanges ?? {},
      avoidPlanetIds: (directive.avoidPlanetIds ?? []).filter((id) => planetIds.has(id)),
      preferredPlanetIds: (directive.preferredPlanetIds ?? []).filter((id) => planetIds.has(id)),
    },
  };
}

export function validateProcurementDecision(value, legalPurchases, credits, directive) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_PROCUREMENT_DECISION');
  const byId = new Map(legalPurchases.map((action) => [action.id, action]));
  const result = [];
  const planets = new Set();
  let spent = 0;
  for (const id of value.purchaseActionIds ?? []) {
    const action = byId.get(id);
    if (!action || planets.has(action.planetId)) continue;
    if (spent + action.cost > directive.maxSpend) continue;
    if (credits - spent - action.cost < directive.minimumReserve) continue;
    result.push(id);
    planets.add(action.planetId);
    spent += action.cost;
  }
  return {
    purchaseActionIds: result,
    reserveCredits: credits - spent,
    reasonCode: code(value.reasonCode, 'VALIDATED'),
    explanation: text(value.explanation, 240),
  };
}

export function validateUnitDecision(value, legalActions) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_UNIT_DECISION');
  if (!legalActions.some((action) => action.id === value.actionId)) throw new Error('INVALID_ACTION_ID');
  const statuses = ['EXECUTING', 'PARTIAL', 'DEFERRED_UNSAFE', 'DEFERRED_IMPOSSIBLE', 'REPLACED', 'WAITING'];
  return {
    actionId: value.actionId,
    recommendationStatus: statuses.includes(value.recommendationStatus)
      ? value.recommendationStatus
      : 'REPLACED',
    intentCode: code(value.intentCode),
    reasonCode: code(value.reasonCode),
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0.5)),
  };
}

export function validateReport(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REPORT');
  return {
    status: ['SUCCESS', 'PARTIAL', 'DEFERRED', 'FAILED', 'WAITING'].includes(value.status)
      ? value.status
      : 'PARTIAL',
    report: text(value.report, 360) || 'Действие завершено.',
  };
}
