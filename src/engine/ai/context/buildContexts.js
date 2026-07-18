import {
  chebyshevDistance,
  manhattanDistance,
} from '../../../gamecore/helpers/coordinates.js';

function compactShip(ship, configs) {
  const definition = configs.ships.ships[ship.type];
  return {
    id: ship.id,
    name: ship.name,
    typeKey: ship.type,
    semanticClass: definition.semanticClass,
    position: [ship.x, ship.y],
    hp: ship.hp,
    maxHp: definition.stats.maxHp,
    acted: ship.hasActed,
    movementCooldown: ship.movementCooldown,
  };
}

function compactPlanet(planet, configs) {
  const definition = configs.planets.planetTypes[planet.type];
  return {
    id: planet.id,
    name: planet.name,
    typeKey: planet.type,
    semanticClass: definition.semanticClass,
    faction: planet.faction,
    position: [planet.x, planet.y],
    hp: planet.hp,
    maxHp: definition.maxHp,
    productionReadyFromOwnerTurn: planet.productionReadyFromOwnerTurn,
    repairReadyFromOwnerTurn: planet.repairReadyFromOwnerTurn,
    incomeReadyFromOwnerTurn: planet.incomeReadyFromOwnerTurn,
  };
}

export function buildCompactRules(configs) {
  return Object.entries(configs.ships.ships).map(([typeKey, ship]) => ({
    typeKey,
    semanticClass: ship.semanticClass,
    compactRule: configs.aiSemantics.unitSemantics[typeKey].compactRule,
    missionObjective: configs.aiSemantics.unitSemantics[typeKey].missionObjective,
    strategicTags: configs.aiSemantics.unitSemantics[typeKey].strategicTags,
    primaryUses: ship.ai?.primaryUses ?? [],
    priorityTargets: ship.ai?.priorityTargets ?? [],
    forbiddenUses: ship.ai?.forbiddenUses ?? [],
    avoidDirectEngagementWith: ship.ai?.avoidDirectEngagementWith ?? [],
    avoidChasing: ship.ai?.avoidChasing ?? [],
    requiresEscort: Boolean(ship.ai?.requiresEscort),
  }));
}

export function buildStrategicObjectives(configs) {
  return {
    victoryCondition: configs.gameRules.victory.baselineCondition,
    ...configs.aiSemantics.strategicObjectives,
  };
}

export function buildUnitMission(configs, typeKey) {
  const ship = configs.ships.ships[typeKey];
  const semantics = configs.aiSemantics.unitSemantics[typeKey];
  return {
    factionObjective: configs.aiSemantics.strategicObjectives.faction,
    typeKey,
    semanticClass: ship.semanticClass,
    role: ship.role,
    missionObjective: semantics.missionObjective,
    primaryUses: ship.ai?.primaryUses ?? [],
    priorityTargets: ship.ai?.priorityTargets ?? [],
    forbiddenUses: ship.ai?.forbiddenUses ?? [],
    avoidDirectEngagementWith: ship.ai?.avoidDirectEngagementWith ?? [],
    avoidChasing: ship.ai?.avoidChasing ?? [],
    requiresEscort: Boolean(ship.ai?.requiresEscort),
  };
}

export function buildGlobalContext(engine, faction) {
  const snapshot = engine.getSnapshot();
  const enemyFaction = faction === snapshot.humanFaction ? snapshot.aiFaction : snapshot.humanFaction;
  return {
    round: snapshot.round,
    map: { ...snapshot.map, fullyVisible: true, fogOfWar: false },
    credits: snapshot.factions[faction].credits,
    yourEconomy: engine.getFactionEconomySnapshot(faction),
    enemyEconomy: engine.getFactionEconomySnapshot(enemyFaction),
    yourUnits: snapshot.ships.filter((ship) => ship.faction === faction)
      .map((ship) => compactShip(ship, engine.configs)),
    enemyUnits: snapshot.ships.filter((ship) => ship.faction !== faction)
      .map((ship) => compactShip(ship, engine.configs)),
    yourPlanets: snapshot.planets.filter((planet) => planet.faction === faction)
      .map((planet) => compactPlanet(planet, engine.configs)),
    enemyPlanets: snapshot.planets.filter(
      (planet) => planet.faction !== faction && planet.faction !== 'grey',
    ).map((planet) => compactPlanet(planet, engine.configs)),
    neutralPlanets: snapshot.planets.filter((planet) => planet.faction === 'grey')
      .map((planet) => compactPlanet(planet, engine.configs)),
  };
}

export function buildEconomicContext(engine, faction) {
  const snapshot = engine.getSnapshot();
  const enemyFaction = faction === snapshot.humanFaction ? snapshot.aiFaction : snapshot.humanFaction;
  const threatenedPlanetIds = snapshot.planets
    .filter((planet) => planet.faction === faction)
    .filter((planet) => snapshot.ships
      .filter((ship) => ship.faction === enemyFaction)
      .some((ship) => engine.getThreatenedCells(ship.id)
        .some((sector) => sector.x === planet.x && sector.y === planet.y)))
    .map((planet) => planet.id);
  return {
    own: engine.getFactionEconomySnapshot(faction),
    enemy: engine.getFactionEconomySnapshot(enemyFaction),
    threatenedPlanetIds,
    neutralWorldCount: snapshot.planets.filter((planet) => planet.faction === 'grey').length,
    counters: Object.fromEntries(Object.entries(engine.configs.ships.ships).map(([type, definition]) => [
      type,
      {
        semanticClass: definition.semanticClass,
        cost: definition.cost,
        bonuses: definition.attack.bonuses,
        primaryUses: definition.ai?.primaryUses ?? [],
      },
    ])),
  };
}

export function buildLocalTacticalContext(engine, unitId, radius) {
  const snapshot = engine.getSnapshot();
  const unit = snapshot.ships.find((ship) => ship.id === unitId);
  if (!unit) return null;
  const threats = snapshot.ships
    .filter((ship) => ship.faction !== unit.faction)
    .filter((ship) => engine.getThreatenedCells(ship.id).some((cell) => cell.x === unit.x && cell.y === unit.y));
  const inRadius = (object) => chebyshevDistance(unit, object) <= radius;
  const nearbyEnemies = snapshot.ships.filter(
    (ship) => ship.faction !== unit.faction && (inRadius(ship) || threats.some((item) => item.id === ship.id)),
  );
  return {
    radius,
    nearbyFriendlyUnits: snapshot.ships.filter(
      (ship) => ship.id !== unit.id && ship.faction === unit.faction && inRadius(ship),
    ).map((ship) => compactShip(ship, engine.configs)),
    nearbyEnemyUnits: nearbyEnemies.map((ship) => ({
      ...compactShip(ship, engine.configs),
      canAttackCurrentCellNextTurn: threats.some((item) => item.id === ship.id),
    })),
    nearbyPlanets: snapshot.planets.filter(inRadius).map((planet) => compactPlanet(planet, engine.configs)),
    friendlyRepairPlanets: snapshot.planets
      .filter((planet) => planet.faction === unit.faction)
      .map((planet) => ({
        ...compactPlanet(planet, engine.configs),
        distance: manhattanDistance(unit, planet),
        occupied: snapshot.ships.some(
          (ship) => ship.id !== unit.id && ship.x === planet.x && ship.y === planet.y,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4),
  };
}
