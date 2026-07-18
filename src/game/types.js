/**
 * @typedef {'cryos'|'ignis'|'grey'} FactionKey
 * @typedef {'scout'|'fighter'|'corvette'|'frigate'|'dreadnought'} ShipType
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
 * @property {{callsign:string,reports:Array<object>,kills:number,missionsCompleted:number}} aiMemory
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
 * @property {FactionKey} activeFaction
 * @property {{width:number,height:number}} map
 * @property {Record<string,{credits:number,ownerTurns:number}>} factions
 * @property {Ship[]} ships
 * @property {Planet[]} planets
 * @property {GameEvent[]} eventLog
 * @property {FactionKey|null} winner
 *
 * @typedef {Readonly<GameState>} GameSnapshot
 *
 * @typedef {Object} SaveData
 * @property {number} saveVersion
 * @property {GameState} state
 *
 * @typedef {Object} AiSettings
 * @property {string} ollamaUrl
 * @property {string} headquartersModel
 * @property {string} procurementModel
 * @property {string} unitModel
 * @property {string} reportModel
 *
 * @typedef {Object} GameConfigs
 * @property {object} aiSemantics
 * @property {object} factions
 * @property {object} gameRules
 * @property {object} planets
 * @property {object} ships
 */

export {};
