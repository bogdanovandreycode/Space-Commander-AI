import { chebyshevDistance, manhattanDistance } from '../../utils/coordinates.js';

function compactShip(ship, configs) {
  const definition = configs.ships.ships[ship.type];
  return {
    id: ship.id,
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
    typeKey: planet.type,
    semanticClass: definition.semanticClass,
    faction: planet.faction,
    position: [planet.x, planet.y],
    hp: planet.hp,
    maxHp: definition.maxHp,
    readyFromOwnerTurn: planet.readyFromOwnerTurn,
  };
}

export function buildCompactRules(configs) {
  return Object.entries(configs.ships.ships).map(([typeKey, ship]) => ({
    typeKey,
    semanticClass: ship.semanticClass,
    compactRule: configs.aiSemantics.unitSemantics[typeKey].compactRule,
  }));
}

export function buildGlobalContext(engine, faction) {
  const snapshot = engine.getSnapshot();
  return {
    round: snapshot.round,
    map: { ...snapshot.map, fullyVisible: true, fogOfWar: false },
    credits: snapshot.factions[faction].credits,
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
