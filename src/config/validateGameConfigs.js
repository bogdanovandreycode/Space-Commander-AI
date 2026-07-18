import { DIRECTION_VECTORS, PLAYABLE_FACTIONS } from './constants.js';

const isFiniteNonNegative = (value) => Number.isFinite(value) && value >= 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Ошибка конфигурации: ${message}`);
}

/**
 * Validates canonical JSON configuration and cross-file references.
 * @param {import('../game/types.js').GameConfigs} configs
 * @returns {true}
 */
export function validateGameConfigs(configs) {
  for (const [name, config] of Object.entries(configs)) {
    assert(config && typeof config === 'object', `${name} отсутствует`);
    assert(config.schemaVersion === 1, `${name}.schemaVersion должен быть 1`);
  }

  const shipEntries = Object.entries(configs.ships.ships ?? {});
  assert(shipEntries.length === 5, 'должно быть пять baseline-классов кораблей');
  for (const required of ['scout', 'fighter', 'corvette', 'frigate', 'dreadnought']) {
    assert(configs.ships.ships[required], `не найден корабль ${required}`);
  }

  const semanticClasses = new Set();
  for (const [type, ship] of shipEntries) {
    assert(ship.displayName?.en && ship.displayName?.ru, `${type}: нет локализованного имени`);
    assert(isFiniteNonNegative(ship.cost), `${type}.cost недопустим`);
    assert(isFiniteNonNegative(ship.stats?.attack), `${type}.stats.attack недопустим`);
    assert(ship.stats?.maxHp > 0, `${type}.stats.maxHp должен быть положительным`);
    assert(ship.movement?.range > 0, `${type}.movement.range должен быть положительным`);
    assert(Array.isArray(ship.movement.directions), `${type}: нет направлений движения`);
    for (const direction of [...ship.movement.directions, ...(ship.attack?.directions ?? [])]) {
      assert(DIRECTION_VECTORS[direction], `${type}: неизвестное направление ${direction}`);
    }
    assert(!semanticClasses.has(ship.semanticClass), `semanticClass ${ship.semanticClass} повторяется`);
    semanticClasses.add(ship.semanticClass);
    assert(
      configs.aiSemantics.unitSemantics[type]?.semanticClass === ship.semanticClass,
      `${type}: AI semanticClass расходится с ships.json`,
    );
  }

  const planetEntries = Object.entries(configs.planets.planetTypes ?? {});
  assert(planetEntries.length >= 3, 'нет обязательных типов планет');
  for (const [type, planet] of planetEntries) {
    assert(planet.maxHp > 0, `${type}.maxHp должен быть положительным`);
    assert(isFiniteNonNegative(planet.flatDamageReduction), `${type}.flatDamageReduction недопустим`);
    assert(isFiniteNonNegative(planet.incomePerTurn), `${type}.incomePerTurn недопустим`);
    assert(isFiniteNonNegative(planet.planetRepairPerTurn), `${type}.planetRepairPerTurn недопустим`);
  }

  for (const faction of PLAYABLE_FACTIONS) {
    const data = configs.factions.factions?.[faction];
    assert(data, `нет фракции ${faction}`);
    assert(configs.planets.planetTypes[data.planetType], `${faction}.planetType не найден`);
    assert(Object.keys(data.baselineMechanicalModifiers ?? {}).length === 0, `${faction} нарушает baseline-симметрию`);
  }

  assert(configs.factions.baselineIsSymmetrical === true, 'baseline должен быть симметричным');
  assert(configs.gameRules.map.fogOfWar === false, 'fogOfWar должен быть выключен');
  assert(configs.gameRules.turn.actionsPerUnit === 1, 'поддерживается ровно одно действие юнита');
  assert(configs.gameRules.turn.moveAndAttackSameTurn === false, 'move+attack не поддерживается');
  return true;
}
