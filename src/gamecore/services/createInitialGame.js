import {
  AI_ROLE,
  BASELINE_MAP,
  HUMAN_ROLE,
  NEUTRAL_FACTION,
  PLAYABLE_FACTIONS,
  SAVE_VERSION,
} from './config/constants.js';
import { createFactionEntity } from '../entities/FactionEntity.js';
import { createGameMapEntity } from '../entities/GameMapEntity.js';
import { createGameStateEntity } from '../entities/GameStateEntity.js';
import { createPlanetEntity } from '../entities/PlanetEntity.js';
import { createShipEntity } from '../entities/ShipEntity.js';

function createShip(id, type, faction, position, role, maxHp) {
  return createShipEntity({
    id,
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
      callsign: `${type.toUpperCase()}-${String(id).padStart(2, '0')}`,
      reports: [],
      kills: 0,
      missionsCompleted: 0,
    },
  });
}

/**
 * Creates the deterministic symmetrical baseline match.
 * @param {{humanFaction?:'cryos'|'ignis', configs:import('../entities/types.js').GameConfigs}} options
 * @returns {import('../entities/types.js').GameState}
 */
export function createInitialGame({ humanFaction = 'cryos', configs }) {
  if (!PLAYABLE_FACTIONS.includes(humanFaction)) throw new Error('Неизвестная игровая фракция.');
  const aiFaction = PLAYABLE_FACTIONS.find((key) => key !== humanFaction);
  const startingCredits = configs.gameRules.economy.startingCredits;
  const humanPlanetType = configs.factions.factions[humanFaction].planetType;
  const aiPlanetType = configs.factions.factions[aiFaction].planetType;

  const planets = [
    createPlanetEntity({
      id: 1,
      type: humanPlanetType,
      faction: humanFaction,
      x: BASELINE_MAP.humanPlanet[0],
      y: BASELINE_MAP.humanPlanet[1],
      hp: configs.planets.planetTypes[humanPlanetType].maxHp,
      readyFromOwnerTurn: 1,
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    }),
    createPlanetEntity({
      id: 2,
      type: aiPlanetType,
      faction: aiFaction,
      x: BASELINE_MAP.aiPlanet[0],
      y: BASELINE_MAP.aiPlanet[1],
      hp: configs.planets.planetTypes[aiPlanetType].maxHp,
      readyFromOwnerTurn: 1,
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    }),
    ...BASELINE_MAP.neutralPlanets.map(([x, y], index) => createPlanetEntity({
      id: index + 3,
      type: 'neutral_forest',
      faction: NEUTRAL_FACTION,
      x,
      y,
      hp: configs.planets.planetTypes.neutral_forest.maxHp,
      readyFromOwnerTurn: Number.MAX_SAFE_INTEGER,
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
      ),
      createShip(
        2,
        'scout',
        aiFaction,
        BASELINE_MAP.aiScout,
        AI_ROLE,
        configs.ships.ships.scout.stats.maxHp,
      ),
    ],
    planets,
    eventLog: [],
    unitReports: [],
    nextEntityId: 7,
    nextEventId: 1,
    winner: null,
  });
}
