import { ACTION_TYPES, DIRECTION_VECTORS, NEUTRAL_FACTION, SAVE_VERSION } from '../config/constants.js';
import { clone, deepFreeze } from '../../utils/deepFreeze.js';
import { directionBetween, insideMap, rayDistance } from '../../utils/coordinates.js';
import { createInitialGame } from './createInitialGame.js';

const EMPTY_PREDICTION = Object.freeze({
  targetDestroyed: false,
  selfDestroyed: false,
  lethalNextTurn: false,
  expectedIncomingDamage: 0,
  colonizedPlanet: false,
  unitRepaired: false,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class GameEngine {
  #configs;
  #state;
  #actionIds = new Map();
  #nextActionId = 1;

  /**
   * @param {import('./types.js').GameConfigs} configs
   * @param {import('./types.js').GameState} state
   */
  constructor(configs, state) {
    this.#configs = configs;
    this.#state = clone(state);
    this.#normalizeState();
  }

  /**
   * @param {import('./types.js').GameConfigs} configs
   * @param {{humanFaction?:'cryos'|'ignis'}} [options]
   */
  static create(configs, options = {}) {
    const state = createInitialGame({ ...options, configs });
    return new GameEngine(configs, state);
  }

  get configs() {
    return this.#configs;
  }

  /** @returns {import('./types.js').GameSnapshot} */
  getSnapshot() {
    return deepFreeze(clone(this.#state));
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

  /**
   * @param {number} unitId
   * @returns {import('./types.js').LegalAction[]}
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
   * @returns {import('./types.js').PurchaseAction[]}
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
        || planet.readyFromOwnerTurn > ownerTurn
        || planet.productionUsedOwnerTurn === ownerTurn
        || (planetDefinition.production.blockedWhenOccupied && this.getShipAt(planet.x, planet.y))
      ) continue;

      for (const [unitType, shipDefinition] of Object.entries(this.#configs.ships.ships)) {
        if (credits < shipDefinition.cost) continue;
        const signature = `BUILD:${faction}:${planet.id}:${unitType}`;
        actions.push({
          id: this.#getActionId(signature),
          type: ACTION_TYPES.BUILD,
          planetId: planet.id,
          unitType,
          semanticClass: shipDefinition.semanticClass,
          cost: shipDefinition.cost,
          strategicTags: this.#purchaseTags(unitType),
        });
      }
    }
    return actions.sort((a, b) => a.id - b.id);
  }

  /**
   * @param {number|import('./types.js').LegalAction} requested
   * @returns {import('./types.js').ActionResult & Record<string, unknown>}
   */
  executeUnitAction(requested) {
    const id = typeof requested === 'number' ? requested : requested?.id;
    const unitId = typeof requested === 'object' ? requested?.unitId : this.#findUnitIdForAction(id);
    const legalActions = Number.isInteger(unitId) ? this.generateLegalActionsForUnit(unitId) : [];
    const action = legalActions.find((candidate) => candidate.id === id);
    if (!action) return this.#rejectedResult('UNIT_ACTION', 'STALE_OR_UNKNOWN_ACTION');

    const ship = this.getShip(action.unitId);
    const from = [ship.x, ship.y];
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
      planet.readyFromOwnerTurn = this.#state.factions[ship.faction].ownerTurns + 1;
      planet.productionUsedOwnerTurn = this.#state.factions[ship.faction].ownerTurns;
      planet.damagedSincePreviousOwnerTurn = false;
      colonizedPlanetId = planet.id;
      this.#state.ships = this.#state.ships.filter((item) => item.id !== ship.id);
    } else {
      ship.hasActed = true;
    }

    this.#touch();
    const result = {
      executed: true,
      actionType: action.type,
      actionId: action.id,
      unitId: action.unitId,
      from,
      to: action.to,
      targetDestroyed,
      damageDealt,
      damageReceived: 0,
      unitDestroyed: action.type === ACTION_TYPES.COLONIZE,
      colonizedPlanetId,
      repairedHp: 0,
      reasonCode: 'SUCCESS',
    };
    this.#recordEvent('UNIT_ACTION', result);
    this.#checkVictory();
    return result;
  }

  /**
   * @param {number|import('./types.js').PurchaseAction} requested
   * @returns {import('./types.js').ActionResult & Record<string, unknown>}
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
    this.#state.factions[faction].credits -= definition.cost;
    planet.productionUsedOwnerTurn = this.#state.factions[faction].ownerTurns;
    this.#state.ships.push({
      id: idForShip,
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
        callsign: `${definition.semanticClass}-${idForShip}`,
        reports: [],
        kills: 0,
        missionsCompleted: 0,
      },
    });
    this.#touch();
    const result = {
      executed: true,
      actionType: ACTION_TYPES.BUILD,
      actionId: action.id,
      unitId: idForShip,
      planetId: planet.id,
      unitType: action.unitType,
      cost: definition.cost,
      reasonCode: 'SUCCESS',
    };
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
      if (ownerTurn > 1 && planet?.faction === faction && planet.readyFromOwnerTurn <= ownerTurn) {
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
      if (ownerTurn > 1 && planet.readyFromOwnerTurn <= ownerTurn) {
        const definition = this.#configs.planets.planetTypes[planet.type];
        factionState.credits += definition.incomePerTurn;
        if (!planet.damagedSincePreviousOwnerTurn && definition.planetRepairPerTurn > 0) {
          const repaired = Math.min(definition.planetRepairPerTurn, definition.maxHp - planet.hp);
          if (repaired > 0) {
            planet.hp += repaired;
            events.push({ type: 'PLANET_REPAIRED', planetId: planet.id, amount: repaired });
          }
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

  /** @returns {import('./types.js').SaveData} */
  serialize() {
    return { saveVersion: SAVE_VERSION, state: clone(this.#state) };
  }

  /** @param {import('./types.js').SaveData} saveData */
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
    const stored = { unitId, callsign: ship?.aiMemory.callsign ?? `UNIT-${unitId}`, ...clone(report) };
    this.#state.unitReports.push(stored);
    this.#state.unitReports = this.#state.unitReports.slice(-120);
    if (ship) {
      ship.aiMemory.reports.push(clone(report));
      ship.aiMemory.reports = ship.aiMemory.reports.slice(-30);
      if (report.status === 'SUCCESS') ship.aiMemory.missionsCompleted += 1;
    }
    this.#touch();
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

    const action = {
      id: this.#getActionId(signature),
      type,
      unitId: ship.id,
      to,
      targetUnitId,
      planetId,
      risk,
      orderFit: 50,
      strategicValue: clamp(strategicValue, 0, 100),
      predictedResult: {
        ...EMPTY_PREDICTION,
        targetDestroyed,
        lethalNextTurn: incoming >= remainingHp,
        expectedIncomingDamage: incoming,
        colonizedPlanet,
      },
      strategicTags: tags,
    };
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
    return { executed: false, actionType, reasonCode };
  }

  #touch() {
    this.#state.revision += 1;
  }

  #recordEvent(type, details) {
    this.#state.eventLog.push({
      id: this.#state.nextEventId++,
      type,
      round: this.#state.round,
      faction: this.#state.activeFaction,
      details: clone(details),
    });
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
    this.#state.nextEntityId ??= Math.max(0, ...this.#state.ships.map((item) => item.id)) + 1;
    this.#state.nextEventId ??= Math.max(0, ...this.#state.eventLog.map((item) => item.id)) + 1;
    this.#state.unitReports ??= [];
  }
}
