import { createActionResultEntity } from '../entities/ActionResultEntity.js';
import { createAiReportEntity } from '../entities/AiReportEntity.js';
import { createGameEventEntity } from '../entities/GameEventEntity.js';
import { createGameSnapshotEntity } from '../entities/GameSnapshotEntity.js';
import { createGameStateEntity } from '../entities/GameStateEntity.js';
import { createLegalActionEntity } from '../entities/LegalActionEntity.js';
import { createPredictedResultEntity } from '../entities/PredictedResultEntity.js';
import { createPurchaseActionEntity } from '../entities/PurchaseActionEntity.js';
import { createSaveDataEntity } from '../entities/SaveDataEntity.js';
import { createShipEntity } from '../entities/ShipEntity.js';
import { createUnitReportEntity } from '../entities/UnitReportEntity.js';
import { directionBetween, insideMap, rayDistance } from '../helpers/coordinates.js';
import { clone } from '../helpers/deepFreeze.js';
import {
  deriveLegacyNameSeed,
  generateEntityName,
} from '../helpers/NameGenerator.js';
import {
  ACTION_TYPES,
  DIRECTION_VECTORS,
  NEUTRAL_FACTION,
  SAVE_VERSION,
} from './config/constants.js';
import { createInitialGame } from './createInitialGame.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class GameEngine {
  #configs;
  #state;
  #actionIds = new Map();
  #nextActionId = 1;

  /**
   * @param {import('../entities/types.js').GameConfigs} configs
   * @param {import('../entities/types.js').GameState} state
   */
  constructor(configs, state) {
    this.#configs = configs;
    this.#state = clone(state);
    this.#normalizeState();
  }

  /**
   * @param {import('../entities/types.js').GameConfigs} configs
   * @param {{humanFaction?:'cryos'|'ignis'}} [options]
   */
  static create(configs, options = {}) {
    const state = createInitialGame({ ...options, configs });
    return new GameEngine(configs, state);
  }

  get configs() {
    return this.#configs;
  }

  /** @returns {import('../entities/types.js').GameSnapshot} */
  getSnapshot() {
    return createGameSnapshotEntity(this.#state);
  }

  getShip(unitId) {
    return this.#state.ships.find((ship) => ship.id === unitId) ?? null;
  }

  getPlanet(planetId) {
    return this.#state.planets.find((planet) => planet.id === planetId) ?? null;
  }

  getShipAt(x, y, ignoredId = null) {
    return this.#state.ships.find((ship) => ship.id !== ignoredId && ship.x === x && ship.y === y) ?? null;
  }

  getPlanetAt(x, y) {
    return this.#state.planets.find((planet) => planet.x === x && planet.y === y) ?? null;
  }

  getObjectsAt(x, y) {
    const snapshot = this.getSnapshot();
    return Object.freeze([
      ...snapshot.ships.filter((ship) => ship.x === x && ship.y === y)
        .map((entity) => Object.freeze({ kind: 'ship', entity })),
      ...snapshot.planets.filter((planet) => planet.x === x && planet.y === y)
        .map((entity) => Object.freeze({ kind: 'planet', entity })),
    ]);
  }

  getUnitHistory(unitId, limit = 30) {
    const history = [];
    for (const event of [...this.#state.eventLog].reverse()) {
      if (history.length >= limit) break;
      if (
        ['SHIP_DEPLOYED', 'UNIT_ACTION', 'PURCHASE'].includes(event.type)
        && event.details?.unitId === unitId
      ) {
        history.push(clone(event));
      }
      if (event.type === 'TURN_STARTED') {
        for (const nested of [...(event.details?.events ?? [])].reverse()) {
          if (nested.unitId === unitId && history.length < limit) {
            history.push({
              id: event.id,
              type: nested.type,
              round: event.round,
              faction: event.faction,
              details: clone(nested),
            });
          }
        }
      }
    }
    return Object.freeze(history.map((event) => Object.freeze(event)));
  }

  getFactionEconomySnapshot(factionId) {
    const faction = this.#state.factions[factionId];
    if (!faction) return null;
    const ownerTurn = faction.ownerTurns;
    const nextOwnerTurn = ownerTurn + 1;
    const planets = this.#state.planets.filter((planet) => planet.faction === factionId);
    const ships = this.#state.ships.filter((ship) => ship.faction === factionId);
    const fleetComposition = {};
    let fleetValue = 0;
    for (const ship of ships) {
      fleetComposition[ship.type] = (fleetComposition[ship.type] ?? 0) + 1;
      fleetValue += this.#configs.ships.ships[ship.type].cost;
    }
    const shipyards = planets.filter(
      (planet) => this.#configs.planets.planetTypes[planet.type].production.enabled,
    );
    const availableShipyards = shipyards.filter((planet) => (
      planet.productionReadyFromOwnerTurn <= ownerTurn
      && planet.productionUsedOwnerTurn !== ownerTurn
      && !this.getShipAt(planet.x, planet.y)
    )).length;
    const projectedIncome = planets.reduce((sum, planet) => (
      planet.incomeReadyFromOwnerTurn <= nextOwnerTurn
        ? sum + this.#configs.planets.planetTypes[planet.type].incomePerTurn
        : sum
    ), 0);
    return Object.freeze({
      faction: factionId,
      credits: faction.credits,
      ownerTurns: ownerTurn,
      projectedIncome,
      planetCount: planets.length,
      shipyardCount: shipyards.length,
      availableShipyards,
      fleetCount: ships.length,
      fleetValue,
      fleetComposition: Object.freeze({ ...fleetComposition }),
    });
  }

  /**
   * @param {number} unitId
   * @returns {import('../entities/types.js').LegalAction[]}
   */
  generateLegalActionsForUnit(unitId) {
    const ship = this.getShip(unitId);
    if (!ship || ship.faction !== this.#state.activeFaction || ship.hasActed || this.#state.winner) return [];

    const definition = this.#configs.ships.ships[ship.type];
    const actions = [];
    const canMove = ship.movementCooldown === 0;

    if (canMove) {
      for (const direction of definition.movement.directions) {
        const [dx, dy] = DIRECTION_VECTORS[direction];
        for (let distance = 1; distance <= definition.movement.range; distance += 1) {
          const x = ship.x + dx * distance;
          const y = ship.y + dy * distance;
          if (!insideMap(x, y, this.#state.map)) break;
          if (this.getShipAt(x, y)) break;
          const planet = this.getPlanetAt(x, y);
          if (planet && planet.faction !== ship.faction) {
            if (
              planet.faction === NEUTRAL_FACTION
              && definition.abilities?.canColonizeNeutralPlanet
            ) {
              actions.push(this.#makeUnitAction({
                type: ACTION_TYPES.COLONIZE,
                ship,
                to: [x, y],
                planetId: planet.id,
              }));
            }
            break;
          }
          actions.push(this.#makeUnitAction({
            type: ACTION_TYPES.MOVE,
            ship,
            to: [x, y],
          }));
          if (planet) break;
        }
      }
    }

    if (definition.attack.enabled) {
      for (const direction of definition.attack.directions) {
        const [dx, dy] = DIRECTION_VECTORS[direction];
        for (let distance = 1; distance <= definition.attack.range; distance += 1) {
          const x = ship.x + dx * distance;
          const y = ship.y + dy * distance;
          if (!insideMap(x, y, this.#state.map)) break;
          const targetShip = this.getShipAt(x, y);
          if (targetShip) {
            if (targetShip.faction !== ship.faction) {
              actions.push(this.#makeUnitAction({
                type: ACTION_TYPES.ATTACK_UNIT,
                ship,
                to: [x, y],
                targetUnitId: targetShip.id,
              }));
            }
            break;
          }
          const planet = this.getPlanetAt(x, y);
          if (planet) {
            const planetDefinition = this.#configs.planets.planetTypes[planet.type];
            if (planet.faction !== ship.faction && planetDefinition.combatTargetable) {
              actions.push(this.#makeUnitAction({
                type: ACTION_TYPES.ATTACK_PLANET,
                ship,
                to: [x, y],
                planetId: planet.id,
              }));
            }
            break;
          }
        }
      }
    }

    actions.push(this.#makeUnitAction({ type: ACTION_TYPES.WAIT, ship, to: [ship.x, ship.y] }));
    return actions.sort((a, b) => a.id - b.id);
  }

  /**
   * @param {string} [faction]
   * @returns {import('../entities/types.js').PurchaseAction[]}
   */
  generateLegalPurchaseActions(faction = this.#state.activeFaction) {
    if (faction !== this.#state.activeFaction || this.#state.winner) return [];
    const ownerTurn = this.#state.factions[faction].ownerTurns;
    const credits = this.#state.factions[faction].credits;
    const actions = [];

    for (const planet of this.#state.planets.filter((item) => item.faction === faction)) {
      const planetDefinition = this.#configs.planets.planetTypes[planet.type];
      if (
        !planetDefinition.production.enabled
        || planet.productionReadyFromOwnerTurn > ownerTurn
        || planet.productionUsedOwnerTurn === ownerTurn
        || (planetDefinition.production.blockedWhenOccupied && this.getShipAt(planet.x, planet.y))
      ) continue;

      for (const [unitType, shipDefinition] of Object.entries(this.#configs.ships.ships)) {
        if (credits < shipDefinition.cost) continue;
        const signature = `BUILD:${faction}:${planet.id}:${unitType}`;
        actions.push(createPurchaseActionEntity({
          id: this.#getActionId(signature),
          type: ACTION_TYPES.BUILD,
          planetId: planet.id,
          unitType,
          semanticClass: shipDefinition.semanticClass,
          cost: shipDefinition.cost,
          strategicTags: this.#purchaseTags(unitType),
        }));
      }
    }
    return actions.sort((a, b) => a.id - b.id);
  }

  /**
   * @param {number|import('../entities/types.js').LegalAction} requested
   * @returns {import('../entities/types.js').ActionResult & Record<string, unknown>}
   */
  executeUnitAction(requested) {
    const id = typeof requested === 'number' ? requested : requested?.id;
    const unitId = typeof requested === 'object' ? requested?.unitId : this.#findUnitIdForAction(id);
    const legalActions = Number.isInteger(unitId) ? this.generateLegalActionsForUnit(unitId) : [];
    const action = legalActions.find((candidate) => candidate.id === id);
    if (!action) return this.#rejectedResult('UNIT_ACTION', 'STALE_OR_UNKNOWN_ACTION');

    const ship = this.getShip(action.unitId);
    const from = [ship.x, ship.y];
    const targetEntity = action.targetUnitId
      ? this.getShip(action.targetUnitId)
      : action.planetId
        ? this.getPlanet(action.planetId)
        : null;
    let damageDealt = 0;
    let targetDestroyed = false;
    let colonizedPlanetId = null;

    if (action.type === ACTION_TYPES.MOVE) {
      [ship.x, ship.y] = action.to;
      ship.hasActed = true;
      const cooldown = this.#configs.ships.ships[ship.type].movement.movementCooldownAfterMove ?? 0;
      if (cooldown > 0) {
        ship.movementCooldown = cooldown;
        ship.cooldownSetOwnerTurn = this.#state.factions[ship.faction].ownerTurns;
      }
    } else if (action.type === ACTION_TYPES.ATTACK_UNIT) {
      const target = this.getShip(action.targetUnitId);
      damageDealt = this.calculateDamage(ship, target);
      target.hp -= damageDealt;
      ship.hasActed = true;
      if (target.hp <= 0) {
        targetDestroyed = true;
        ship.aiMemory.kills += 1;
        this.#state.ships = this.#state.ships.filter((item) => item.id !== target.id);
      }
    } else if (action.type === ACTION_TYPES.ATTACK_PLANET) {
      const target = this.getPlanet(action.planetId);
      damageDealt = this.calculateDamage(ship, target);
      target.hp -= damageDealt;
      target.damagedSincePreviousOwnerTurn = true;
      ship.hasActed = true;
      if (target.hp <= 0) {
        targetDestroyed = true;
        this.#state.planets = this.#state.planets.filter((item) => item.id !== target.id);
      }
    } else if (action.type === ACTION_TYPES.COLONIZE) {
      const planet = this.getPlanet(action.planetId);
      const factionDefinition = this.#configs.factions.factions[ship.faction];
      const neutralDefinition = this.#configs.planets.planetTypes[planet.type];
      planet.type = factionDefinition.planetType;
      planet.faction = ship.faction;
      planet.hp = neutralDefinition.onColonized.initialHp;
      const ownerTurn = this.#state.factions[ship.faction].ownerTurns;
      const activation = neutralDefinition.onColonized;
      planet.productionReadyFromOwnerTurn = ownerTurn + Number(activation.productionStartsNextOwnerTurn);
      planet.repairReadyFromOwnerTurn = ownerTurn + Number(activation.repairStartsNextOwnerTurn);
      planet.incomeReadyFromOwnerTurn = ownerTurn + Number(activation.incomeStartsNextOwnerTurn);
      planet.productionUsedOwnerTurn = ownerTurn - 1;
      planet.damagedSincePreviousOwnerTurn = false;
      colonizedPlanetId = planet.id;
      this.#state.ships = this.#state.ships.filter((item) => item.id !== ship.id);
    } else {
      ship.hasActed = true;
    }

    this.#touch();
    const result = createActionResultEntity({
      executed: true,
      actionType: action.type,
      actionId: action.id,
      unitId: action.unitId,
      unitName: ship.name,
      targetName: targetEntity?.name ?? null,
      from,
      to: action.to,
      targetDestroyed,
      damageDealt,
      damageReceived: 0,
      unitDestroyed: action.type === ACTION_TYPES.COLONIZE,
      colonizedPlanetId,
      repairedHp: 0,
      reasonCode: 'SUCCESS',
    });
    this.#recordEvent('UNIT_ACTION', result);
    this.#checkVictory();
    return result;
  }

  /**
   * @param {number|import('../entities/types.js').PurchaseAction} requested
   * @returns {import('../entities/types.js').ActionResult & Record<string, unknown>}
   */
  executePurchaseAction(requested) {
    const id = typeof requested === 'number' ? requested : requested?.id;
    const legal = this.generateLegalPurchaseActions();
    const action = legal.find((candidate) => candidate.id === id);
    if (!action) return this.#rejectedResult('BUILD', 'STALE_OR_UNKNOWN_ACTION');
    const faction = this.#state.activeFaction;
    const planet = this.getPlanet(action.planetId);
    const definition = this.#configs.ships.ships[action.unitType];
    const idForShip = this.#state.nextEntityId++;
    const name = this.#nextName('ship', faction, action.unitType, idForShip);
    this.#state.factions[faction].credits -= definition.cost;
    planet.productionUsedOwnerTurn = this.#state.factions[faction].ownerTurns;
    this.#state.ships.push(createShipEntity({
      id: idForShip,
      name,
      type: action.unitType,
      faction,
      x: planet.x,
      y: planet.y,
      hp: definition.stats.maxHp,
      hasActed: true,
      movementCooldown: 0,
      cooldownSetOwnerTurn: null,
      role: faction === this.#state.humanFaction ? 'human' : 'ai',
      aiMemory: {
        callsign: name,
        reports: [],
        kills: 0,
        missionsCompleted: 0,
      },
    }));
    this.#touch();
    const result = createActionResultEntity({
      executed: true,
      actionType: ACTION_TYPES.BUILD,
      actionId: action.id,
      unitId: idForShip,
      unitName: name,
      planetId: planet.id,
      planetName: planet.name,
      to: [planet.x, planet.y],
      unitType: action.unitType,
      cost: definition.cost,
      reasonCode: 'SUCCESS',
    });
    this.#recordEvent('PURCHASE', result);
    return result;
  }

  calculateDamage(attacker, target) {
    const attackerDefinition = this.#configs.ships.ships[attacker.type];
    const isPlanet = !('type' in target) || Boolean(this.#configs.planets.planetTypes[target.type]);
    const targetClass = isPlanet
      ? 'PLANET'
      : this.#configs.ships.ships[target.type].semanticClass;
    const multiplier = attackerDefinition.attack.bonuses[targetClass] ?? 1;
    const reduction = isPlanet
      ? this.#configs.planets.planetTypes[target.type].flatDamageReduction
      : this.#configs.ships.ships[target.type].stats.flatDamageReduction;
    return Math.max(
      this.#configs.gameRules.combat.minimumDamage,
      Math.floor(attackerDefinition.stats.attack * multiplier) - reduction,
    );
  }

  /**
   * Immediate cells that the unit can damage without moving.
   * @param {number} unitId
   * @returns {{x:number,y:number}[]}
   */
  getThreatenedCells(unitId) {
    const ship = this.getShip(unitId);
    if (!ship) return [];
    const definition = this.#configs.ships.ships[ship.type];
    if (!definition.attack.enabled) return [];
    const cells = [];
    for (const direction of definition.attack.directions) {
      const [dx, dy] = DIRECTION_VECTORS[direction];
      for (let distance = 1; distance <= definition.attack.range; distance += 1) {
        const x = ship.x + dx * distance;
        const y = ship.y + dy * distance;
        if (!insideMap(x, y, this.#state.map)) break;
        cells.push({ x, y });
        if (this.getShipAt(x, y) || this.getPlanetAt(x, y)) break;
      }
    }
    return cells;
  }

  beginFactionTurn(faction) {
    if (!this.#state.factions[faction] || this.#state.winner) return [];
    this.#state.activeFaction = faction;
    const factionState = this.#state.factions[faction];
    factionState.ownerTurns += 1;
    const ownerTurn = factionState.ownerTurns;
    const events = [];

    for (const ship of this.#state.ships.filter((item) => item.faction === faction)) {
      ship.hasActed = false;
      const planet = this.getPlanetAt(ship.x, ship.y);
      if (
        ownerTurn > 1
        && planet?.faction === faction
        && planet.repairReadyFromOwnerTurn <= ownerTurn
      ) {
        const repair = this.#configs.planets.planetTypes[planet.type].shipRepair;
        if (repair.enabled) {
          const maximum = this.#configs.ships.ships[ship.type].stats.maxHp;
          const amount = repair.type === 'PERCENT_MAX_HP'
            ? Math.ceil(maximum * repair.value)
            : repair.value;
          const repaired = Math.min(amount, maximum - ship.hp);
          if (repaired > 0) {
            ship.hp += repaired;
            events.push({ type: 'SHIP_REPAIRED', unitId: ship.id, amount: repaired });
          }
        }
      }
    }

    for (const planet of this.#state.planets.filter((item) => item.faction === faction)) {
      const definition = this.#configs.planets.planetTypes[planet.type];
      if (ownerTurn > 1 && planet.incomeReadyFromOwnerTurn <= ownerTurn) {
        factionState.credits += definition.incomePerTurn;
      }
      if (
        ownerTurn > 1
        && planet.repairReadyFromOwnerTurn <= ownerTurn
        && !planet.damagedSincePreviousOwnerTurn
        && definition.planetRepairPerTurn > 0
      ) {
          const repaired = Math.min(definition.planetRepairPerTurn, definition.maxHp - planet.hp);
          if (repaired > 0) {
            planet.hp += repaired;
            events.push({ type: 'PLANET_REPAIRED', planetId: planet.id, amount: repaired });
          }
      }
      planet.damagedSincePreviousOwnerTurn = false;
    }

    this.#touch();
    this.#recordEvent('TURN_STARTED', { ownerTurn, events });
    return events;
  }

  endFactionTurn() {
    if (this.#state.winner) return;
    const faction = this.#state.activeFaction;
    const ownerTurn = this.#state.factions[faction].ownerTurns;
    for (const ship of this.#state.ships.filter((item) => item.faction === faction)) {
      if (
        ship.movementCooldown > 0
        && ship.cooldownSetOwnerTurn !== null
        && ship.cooldownSetOwnerTurn < ownerTurn
      ) {
        ship.movementCooldown -= 1;
        if (ship.movementCooldown === 0) ship.cooldownSetOwnerTurn = null;
      }
    }
    const nextFaction = faction === this.#state.humanFaction
      ? this.#state.aiFaction
      : this.#state.humanFaction;
    if (nextFaction === this.#state.humanFaction) this.#state.round += 1;
    this.#touch();
    this.beginFactionTurn(nextFaction);
  }

  /** @returns {import('../entities/types.js').SaveData} */
  serialize() {
    return createSaveDataEntity(SAVE_VERSION, clone(this.#state));
  }

  /** @param {import('../entities/types.js').SaveData} saveData */
  restore(saveData) {
    if (saveData?.saveVersion !== SAVE_VERSION || saveData.state?.saveVersion !== SAVE_VERSION) {
      throw new Error('INCOMPATIBLE_SAVE_VERSION');
    }
    this.#state = clone(saveData.state);
    this.#normalizeState();
    this.#actionIds.clear();
    this.#nextActionId = 1;
    return this.getSnapshot();
  }

  saveUnitReport(unitId, report) {
    const ship = this.getShip(unitId);
    const stored = createUnitReportEntity({
      unitId,
      callsign: ship?.aiMemory.callsign ?? `UNIT-${unitId}`,
      id: this.#state.nextReportId++,
      ...clone(report),
    });
    this.#state.unitReports.push(stored);
    this.#state.unitReports = this.#state.unitReports.slice(-120);
    if (ship) {
      ship.aiMemory.reports.push(clone(report));
      ship.aiMemory.reports = ship.aiMemory.reports.slice(-30);
      if (report.status === 'SUCCESS') ship.aiMemory.missionsCompleted += 1;
    }
    this.#touch();
    return clone(stored);
  }

  saveCommandReport(role, report) {
    const stored = createAiReportEntity({
      id: this.#state.nextReportId++,
      role,
      ...clone(report),
    });
    this.#state.commandReports.push(stored);
    const sameRole = this.#state.commandReports.filter((item) => item.role === role);
    if (sameRole.length > 30) {
      const removeIds = new Set(sameRole.slice(0, sameRole.length - 30).map((item) => item.id));
      this.#state.commandReports = this.#state.commandReports.filter((item) => !removeIds.has(item.id));
    }
    this.#touch();
    return clone(stored);
  }

  #makeUnitAction({ type, ship, to, targetUnitId = null, planetId = null }) {
    const signature = [type, ship.id, to?.join(','), targetUnitId, planetId].join(':');
    const target = targetUnitId ? this.getShip(targetUnitId) : planetId ? this.getPlanet(planetId) : null;
    const damage = target && type.startsWith('ATTACK') ? this.calculateDamage(ship, target) : 0;
    const targetDestroyed = Boolean(target && damage >= target.hp);
    const incoming = this.#expectedIncomingDamage(ship, to, targetDestroyed ? targetUnitId : null);
    const remainingHp = ship.hp;
    const colonizedPlanet = type === ACTION_TYPES.COLONIZE;
    const risk = clamp(Math.round((incoming / Math.max(1, remainingHp)) * 100), 0, 100);
    let strategicValue = type === ACTION_TYPES.WAIT ? 5 : type === ACTION_TYPES.MOVE ? 30 : 55;
    if (targetDestroyed) strategicValue += 35;
    if (colonizedPlanet) strategicValue = 100;
    if (type === ACTION_TYPES.ATTACK_PLANET) strategicValue += 15;
    const tags = [];
    if (targetDestroyed) tags.push('TARGET_DESTROYED');
    if (colonizedPlanet) tags.push('COLONIZATION');
    if (incoming >= remainingHp) tags.push('LETHAL_NEXT_TURN');
    if (type === ACTION_TYPES.WAIT) tags.push('HOLD_POSITION');

    const action = createLegalActionEntity({
      id: this.#getActionId(signature),
      type,
      unitId: ship.id,
      to,
      targetUnitId,
      planetId,
      risk,
      orderFit: 50,
      strategicValue: clamp(strategicValue, 0, 100),
      predictedResult: createPredictedResultEntity({
        targetDestroyed,
        lethalNextTurn: incoming >= remainingHp,
        expectedIncomingDamage: incoming,
        colonizedPlanet,
      }),
      strategicTags: tags,
    });
    return action;
  }

  #expectedIncomingDamage(ship, to, ignoredEnemyId) {
    const [x, y] = to;
    let total = 0;
    for (const enemy of this.#state.ships.filter(
      (item) => item.faction !== ship.faction && item.id !== ignoredEnemyId,
    )) {
      if (this.#canAttackCell(enemy, x, y, ignoredEnemyId)) {
        total += this.#damageAgainstShip(enemy, ship);
      }
    }
    return total;
  }

  #canAttackCell(attacker, x, y, ignoredId = null) {
    const definition = this.#configs.ships.ships[attacker.type];
    if (!definition.attack.enabled) return false;
    const target = { x, y };
    const direction = directionBetween(attacker, target);
    const distance = rayDistance(attacker, target);
    if (!direction || !distance || distance > definition.attack.range) return false;
    if (!definition.attack.directions.includes(direction)) return false;
    const [dx, dy] = DIRECTION_VECTORS[direction];
    for (let step = 1; step < distance; step += 1) {
      const cellX = attacker.x + dx * step;
      const cellY = attacker.y + dy * step;
      if (this.getShipAt(cellX, cellY, ignoredId) || this.getPlanetAt(cellX, cellY)) return false;
    }
    return true;
  }

  #damageAgainstShip(attacker, targetShip) {
    const attackerDefinition = this.#configs.ships.ships[attacker.type];
    const targetDefinition = this.#configs.ships.ships[targetShip.type];
    const multiplier = attackerDefinition.attack.bonuses[targetDefinition.semanticClass] ?? 1;
    return Math.max(
      this.#configs.gameRules.combat.minimumDamage,
      Math.floor(attackerDefinition.stats.attack * multiplier) - targetDefinition.stats.flatDamageReduction,
    );
  }

  #purchaseTags(unitType) {
    const definition = this.#configs.ships.ships[unitType];
    return [...(definition.ai?.primaryUses ?? [])].slice(0, 5);
  }

  #nextName(kind, faction, type, id) {
    const usedNames = new Set([
      ...this.#state.ships.map((ship) => ship.name).filter(Boolean),
      ...this.#state.planets.map((planet) => planet.name).filter(Boolean),
    ]);
    const name = generateEntityName(this.#configs, {
      kind,
      faction,
      type,
      id,
      seed: this.#state.nameSeed,
      sequence: this.#state.nameSequence++,
      usedNames,
    });
    return name;
  }

  #getActionId(signature) {
    if (!this.#actionIds.has(signature)) this.#actionIds.set(signature, this.#nextActionId++);
    return this.#actionIds.get(signature);
  }

  #findUnitIdForAction(actionId) {
    for (const ship of this.#state.ships) {
      if (this.generateLegalActionsForUnit(ship.id).some((action) => action.id === actionId)) return ship.id;
    }
    return null;
  }

  #rejectedResult(actionType, reasonCode) {
    return createActionResultEntity({ executed: false, actionType, reasonCode });
  }

  #touch() {
    this.#state.revision += 1;
  }

  #recordEvent(type, details) {
    this.#state.eventLog.push(createGameEventEntity({
      id: this.#state.nextEventId++,
      type,
      round: this.#state.round,
      faction: this.#state.activeFaction,
      details: clone(details),
    }));
    this.#state.eventLog = this.#state.eventLog.slice(-100);
  }

  #checkVictory() {
    for (const faction of [this.#state.humanFaction, this.#state.aiFaction]) {
      if (!this.#state.planets.some((planet) => planet.faction === faction)) {
        this.#state.winner = faction === this.#state.humanFaction
          ? this.#state.aiFaction
          : this.#state.humanFaction;
        this.#recordEvent('GAME_OVER', { winner: this.#state.winner });
        break;
      }
    }
  }

  #normalizeState() {
    if (this.#state.saveVersion !== SAVE_VERSION) throw new Error('INCOMPATIBLE_SAVE_VERSION');
    if (!Array.isArray(this.#state.ships) || !Array.isArray(this.#state.planets)) {
      throw new Error('INVALID_SAVE_DATA');
    }
    this.#state.nameSeed ??= deriveLegacyNameSeed(this.#state);
    this.#state.nameSequence ??= 0;
    this.#state.commandReports ??= [];
    this.#state.nextReportId ??= 1;
    for (const planet of this.#state.planets) {
      const legacyReady = planet.readyFromOwnerTurn ?? 1;
      const ownerTurn = this.#state.factions?.[planet.faction]?.ownerTurns;
      planet.productionReadyFromOwnerTurn ??= ownerTurn == null
        ? legacyReady
        : Math.min(legacyReady, ownerTurn);
      planet.repairReadyFromOwnerTurn ??= ownerTurn == null
        ? legacyReady
        : Math.min(legacyReady, ownerTurn);
      planet.incomeReadyFromOwnerTurn ??= legacyReady;
    }
    this.#state = createGameStateEntity(this.#state);
    const usedNames = new Set([
      ...this.#state.planets.map((planet) => planet.name).filter(Boolean),
      ...this.#state.ships.map((ship) => ship.name).filter(Boolean),
    ]);
    for (const planet of this.#state.planets) {
      if (!planet.name) {
        planet.name = generateEntityName(this.#configs, {
          kind: 'planet',
          faction: planet.faction,
          type: planet.type,
          id: planet.id,
          seed: this.#state.nameSeed,
          sequence: this.#state.nameSequence++,
          usedNames,
        });
        usedNames.add(planet.name);
      }
    }
    for (const ship of this.#state.ships) {
      if (!ship.name) {
        ship.name = generateEntityName(this.#configs, {
          kind: 'ship',
          faction: ship.faction,
          type: ship.type,
          id: ship.id,
          seed: this.#state.nameSeed,
          sequence: this.#state.nameSequence++,
          usedNames,
        });
        usedNames.add(ship.name);
      }
      ship.aiMemory.callsign = ship.name;
    }
    this.#state.nextEntityId ??= Math.max(0, ...this.#state.ships.map((item) => item.id)) + 1;
    this.#state.nextEventId ??= Math.max(0, ...this.#state.eventLog.map((item) => item.id)) + 1;
    this.#state.nextReportId ??= Math.max(
      0,
      ...this.#state.commandReports.map((item) => item.id ?? 0),
      ...this.#state.unitReports.map((item) => item.id ?? 0),
    ) + 1;
    this.#state.unitReports ??= [];
  }
}
