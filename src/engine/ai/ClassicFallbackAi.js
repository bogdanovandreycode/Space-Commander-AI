import { manhattanDistance } from '../../gamecore/helpers/coordinates.js';
import { ACTION_TYPES } from '../../gamecore/services/config/constants.js';

export function scoreLegalAction(action, recommendation = null, snapshot = null, unit = null) {
  let score = action.orderFit + action.strategicValue - action.risk;
  if (action.predictedResult.targetDestroyed) score += 100;
  if (action.predictedResult.colonizedPlanet) score += 120;
  if (action.predictedResult.unitRepaired) score += 50;
  if (action.predictedResult.selfDestroyed) score -= 500;
  if (action.predictedResult.lethalNextTurn) score -= 250;
  if (
    recommendation?.targetId != null
    && [action.targetUnitId, action.planetId].includes(recommendation.targetId)
  ) score += recommendation.priority ?? 50;

  if (snapshot && unit && action.type === ACTION_TYPES.MOVE) {
    const targets = unit.type === 'scout'
      ? snapshot.planets.filter((planet) => planet.faction === 'grey')
      : snapshot.planets.filter((planet) => planet.faction !== unit.faction && planet.faction !== 'grey');
    if (targets.length) {
      const current = Math.min(...targets.map((target) => manhattanDistance(unit, target)));
      const destination = { x: action.to[0], y: action.to[1] };
      const next = Math.min(...targets.map((target) => manhattanDistance(destination, target)));
      score += (current - next) * 25;
    }
  }
  return score;
}

export class ClassicFallbackAi {
  constructor(engine, onEvent = () => {}) {
    this.engine = engine;
    this.onEvent = onEvent;
  }

  chooseUnitAction(unitId, recommendation = null) {
    const snapshot = this.engine.getSnapshot();
    const unit = snapshot.ships.find((ship) => ship.id === unitId);
    return this.engine.generateLegalActionsForUnit(unitId)
      .map((action) => ({ action, score: scoreLegalAction(action, recommendation, snapshot, unit) }))
      .sort((a, b) => b.score - a.score || a.action.id - b.action.id)[0]?.action ?? null;
  }

  choosePurchase(faction) {
    const snapshot = this.engine.getSnapshot();
    const actions = this.engine.generateLegalPurchaseActions(faction);
    const hasNeutral = snapshot.planets.some((planet) => planet.faction === 'grey');
    const hasScout = snapshot.ships.some((ship) => ship.faction === faction && ship.type === 'scout');
    return actions
      .map((action) => {
        let score = action.unitType === 'corvette' ? 45
          : action.unitType === 'fighter' ? 40
            : action.unitType === 'frigate' ? 38
              : action.unitType === 'dreadnought' ? 30 : 20;
        if (action.unitType === 'scout' && hasNeutral && !hasScout) score += 100;
        if (action.unitType === 'scout' && (!hasNeutral || hasScout)) score -= 100;
        score -= action.cost * 0.2;
        return { action, score };
      })
      .sort((a, b) => b.score - a.score || a.action.id - b.action.id)[0]?.action ?? null;
  }

  async runTurn(faction) {
    const purchase = this.choosePurchase(faction);
    if (purchase) this.onEvent(this.engine.executePurchaseAction(purchase));
    const unitIds = this.engine.getSnapshot().ships
      .filter((ship) => ship.faction === faction && !ship.hasActed)
      .map((ship) => ship.id)
      .sort((a, b) => a - b);
    for (const unitId of unitIds) {
      if (this.engine.getSnapshot().winner) break;
      const action = this.chooseUnitAction(unitId);
      if (action) this.onEvent(this.engine.executeUnitAction(action));
    }
  }
}
