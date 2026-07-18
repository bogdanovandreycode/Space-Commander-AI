import {
  AI_ROLE,
  BASELINE_MAP,
  HUMAN_ROLE,
  NEUTRAL_FACTION,
  PLAYABLE_FACTIONS,
  SAVE_VERSION,
} from './config/constants.js';
import { createFactionEntity } from '../entities/FactionEntity.js';
import { createGameEventEntity } from '../entities/GameEventEntity.js';
import { createGameMapEntity } from '../entities/GameMapEntity.js';
import { createGameStateEntity } from '../entities/GameStateEntity.js';
import { createPlanetEntity } from '../entities/PlanetEntity.js';
import { createShipEntity } from '../entities/ShipEntity.js';
import { createNameSeed, generateEntityName } from '../helpers/NameGenerator.js';

function createShip(id, type, faction, position, role, maxHp, name) {
  return createShipEntity({
    id,
    name,
    type,
    faction,
    x: position[0],
    y: position[1],
    hp: maxHp,
    hasActed: false,
    movementCooldown: 0,
    cooldownSetOwnerTurn: null,
    role,
    aiMemory: {
      callsign: name,
      reports: [],
      kills: 0,
      missionsCompleted: 0,
    },
  });
}

/**
 * Creates the deterministic symmetrical baseline match.
 * @param {{humanFaction?:'cryos'|'ignis', configs:import('../entities/types.js').GameConfigs, nameSeed?:number}} options
 * @returns {import('../entities/types.js').GameState}
 */
export function createInitialGame({ humanFaction = 'cryos', configs, nameSeed = createNameSeed() }) {
  if (!PLAYABLE_FACTIONS.includes(humanFaction)) throw new Error('Неизвестная игровая фракция.');
  const aiFaction = PLAYABLE_FACTIONS.find((key) => key !== humanFaction);
  const startingCredits = configs.gameRules.economy.startingCredits;
  const humanPlanetType = configs.factions.factions[humanFaction].planetType;
  const aiPlanetType = configs.factions.factions[aiFaction].planetType;
  const usedNames = new Set();
  let nameSequence = 0;
  const nextName = (kind, faction, type, id) => {
    const name = generateEntityName(configs, {
      kind,
      faction,
      type,
      id,
      seed: nameSeed,
      sequence: nameSequence++,
      usedNames,
    });
    usedNames.add(name);
    return name;
  };

  const planets = [
    createPlanetEntity({
      id: 1,
      name: nextName('planet', humanFaction, humanPlanetType, 1),
      type: humanPlanetType,
      faction: humanFaction,
      x: BASELINE_MAP.humanPlanet[0],
      y: BASELINE_MAP.humanPlanet[1],
      hp: configs.planets.planetTypes[humanPlanetType].maxHp,
      productionReadyFromOwnerTurn: 1,
      repairReadyFromOwnerTurn: 1,
      incomeReadyFromOwnerTurn: 1,
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    }),
    createPlanetEntity({
      id: 2,
      name: nextName('planet', aiFaction, aiPlanetType, 2),
      type: aiPlanetType,
      faction: aiFaction,
      x: BASELINE_MAP.aiPlanet[0],
      y: BASELINE_MAP.aiPlanet[1],
      hp: configs.planets.planetTypes[aiPlanetType].maxHp,
      productionReadyFromOwnerTurn: 1,
      repairReadyFromOwnerTurn: 1,
      incomeReadyFromOwnerTurn: 1,
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    }),
    ...BASELINE_MAP.neutralPlanets.map(([x, y], index) => createPlanetEntity({
      id: index + 3,
      name: nextName('planet', NEUTRAL_FACTION, 'neutral_forest', index + 3),
      type: 'neutral_forest',
      faction: NEUTRAL_FACTION,
      x,
      y,
      hp: configs.planets.planetTypes.neutral_forest.maxHp,
      productionReadyFromOwnerTurn: Number.MAX_SAFE_INTEGER,
      repairReadyFromOwnerTurn: Number.MAX_SAFE_INTEGER,
      incomeReadyFromOwnerTurn: Number.MAX_SAFE_INTEGER,
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    })),
  ];

  return createGameStateEntity({
    saveVersion: SAVE_VERSION,
    revision: 1,
    round: 1,
    humanFaction,
    aiFaction,
    humanRole: HUMAN_ROLE,
    aiRole: AI_ROLE,
    activeFaction: humanFaction,
    map: createGameMapEntity({ width: BASELINE_MAP.width, height: BASELINE_MAP.height }),
    factions: {
      [humanFaction]: createFactionEntity({ credits: startingCredits, ownerTurns: 1 }),
      [aiFaction]: createFactionEntity({ credits: startingCredits, ownerTurns: 0 }),
    },
    ships: [
      createShip(
        1,
        'scout',
        humanFaction,
        BASELINE_MAP.humanScout,
        HUMAN_ROLE,
        configs.ships.ships.scout.stats.maxHp,
        nextName('ship', humanFaction, 'scout', 1),
      ),
      createShip(
        2,
        'scout',
        aiFaction,
        BASELINE_MAP.aiScout,
        AI_ROLE,
        configs.ships.ships.scout.stats.maxHp,
        nextName('ship', aiFaction, 'scout', 2),
      ),
    ],
    planets,
    eventLog: [
      createGameEventEntity({
        id: 1,
        type: 'SHIP_DEPLOYED',
        round: 1,
        faction: humanFaction,
        details: { unitId: 1, to: [...BASELINE_MAP.humanScout] },
      }),
      createGameEventEntity({
        id: 2,
        type: 'SHIP_DEPLOYED',
        round: 1,
        faction: aiFaction,
        details: { unitId: 2, to: [...BASELINE_MAP.aiScout] },
      }),
    ],
    commandReports: [],
    unitReports: [],
    nameSeed,
    nameSequence,
    nextEntityId: 7,
    nextEventId: 3,
    nextReportId: 1,
    winner: null,
  });
}
