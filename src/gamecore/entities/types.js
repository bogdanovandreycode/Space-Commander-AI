/**
 * @typedef {'cryos'|'ignis'|'grey'} FactionKey
 * @typedef {'scout'|'fighter'|'corvette'|'frigate'|'dreadnought'} ShipType
 *
 * @typedef {Object} UnitMemory
 * @property {string} callsign
 * @property {Array<object>} reports
 * @property {number} kills
 * @property {number} missionsCompleted
 *
 * @typedef {Object} Ship
 * @property {number} id
 * @property {ShipType} type
 * @property {FactionKey} faction
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {boolean} hasActed
 * @property {number} movementCooldown
 * @property {number|null} cooldownSetOwnerTurn
 * @property {'human'|'ai'} role
 * @property {UnitMemory} aiMemory
 *
 * @typedef {Object} Planet
 * @property {number} id
 * @property {string} type
 * @property {FactionKey} faction
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} readyFromOwnerTurn
 * @property {number} productionUsedOwnerTurn
 * @property {boolean} damagedSincePreviousOwnerTurn
 *
 * @typedef {Object} UnitReport
 * @property {number} unitId
 * @property {string} callsign
 *
 * @typedef {Object} Faction
 * @property {number} credits
 * @property {number} ownerTurns
 *
 * @typedef {Object} GameMap
 * @property {number} width
 * @property {number} height
 *
 * @typedef {Object} PredictedResult
 * @property {boolean} targetDestroyed
 * @property {boolean} selfDestroyed
 * @property {boolean} lethalNextTurn
 * @property {number} expectedIncomingDamage
 * @property {boolean} colonizedPlanet
 * @property {boolean} unitRepaired
 *
 * @typedef {Object} LegalAction
 * @property {number} id
 * @property {string} type
 * @property {number} unitId
 * @property {[number,number]|null} to
 * @property {number|null} targetUnitId
 * @property {number|null} planetId
 * @property {number} risk
 * @property {number} orderFit
 * @property {number} strategicValue
 * @property {PredictedResult} predictedResult
 * @property {string[]} strategicTags
 *
 * @typedef {Object} PurchaseAction
 * @property {number} id
 * @property {'BUILD'} type
 * @property {number} planetId
 * @property {ShipType} unitType
 * @property {string} semanticClass
 * @property {number} cost
 * @property {string[]} strategicTags
 *
 * @typedef {Object} ActionResult
 * @property {boolean} executed
 * @property {string} actionType
 * @property {string} reasonCode
 *
 * @typedef {Object} GameEvent
 * @property {number} id
 * @property {string} type
 * @property {number} round
 * @property {FactionKey} faction
 * @property {object} details
 *
 * @typedef {Object} GameState
 * @property {number} saveVersion
 * @property {number} revision
 * @property {number} round
 * @property {FactionKey} humanFaction
 * @property {FactionKey} aiFaction
 * @property {'human'} humanRole
 * @property {'ai'} aiRole
 * @property {FactionKey} activeFaction
 * @property {GameMap} map
 * @property {Record<string,Faction>} factions
 * @property {Ship[]} ships
 * @property {Planet[]} planets
 * @property {GameEvent[]} eventLog
 * @property {UnitReport[]} unitReports
 * @property {number} nextEntityId
 * @property {number} nextEventId
 * @property {FactionKey|null} winner
 *
 * @typedef {Readonly<GameState>} GameSnapshot
 *
 * @typedef {Object} SaveData
 * @property {number} saveVersion
 * @property {GameState} state
 *
 * @typedef {Object} GameConfigs
 * @property {object} aiSemantics
 * @property {object} factions
 * @property {object} gameRules
 * @property {object} planets
 * @property {object} ships
 */

export {};
