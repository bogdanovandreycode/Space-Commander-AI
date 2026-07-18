import { beforeEach, describe, expect, it } from 'vitest';
import { loadGameConfigs } from '../../../src/services/config/loadGameConfigs.js';
import { GameEngine } from '../../../src/services/game/GameEngine.js';

const configs = loadGameConfigs();

function ship(id, type, faction, x, y, hp = configs.ships.ships[type].stats.maxHp) {
  return {
    id,
    type,
    faction,
    x,
    y,
    hp,
    hasActed: false,
    movementCooldown: 0,
    cooldownSetOwnerTurn: null,
    role: faction === 'cryos' ? 'human' : 'ai',
    aiMemory: { callsign: `${type}-${id}`, reports: [], kills: 0, missionsCompleted: 0 },
  };
}

function replaceShips(engine, ships) {
  const save = engine.serialize();
  save.state.ships = ships;
  save.state.nextEntityId = Math.max(...ships.map((item) => item.id), 0) + 1;
  engine.restore(save);
}

describe('GameEngine baseline mechanics', () => {
  let engine;

  beforeEach(() => {
    engine = GameEngine.create(configs, { humanFaction: 'cryos' });
  });

  it('creates the symmetric 10x10 baseline with 25 credits', () => {
    const state = engine.getSnapshot();
    expect(state.map).toEqual({ width: 10, height: 10 });
    expect(state.factions.cryos.credits).toBe(25);
    expect(state.factions.ignis.credits).toBe(25);
    expect(state.planets.filter((planet) => planet.faction === 'grey')).toHaveLength(4);
    expect(state.ships.map((item) => [item.x, item.y])).toEqual([[1, 0], [8, 9]]);
  });

  it('applies class multipliers and planet reduction', () => {
    expect(engine.calculateDamage(
      ship(10, 'fighter', 'cryos', 0, 0),
      ship(11, 'scout', 'ignis', 0, 1),
    )).toBe(6);
    expect(engine.calculateDamage(
      ship(10, 'corvette', 'cryos', 0, 0),
      ship(11, 'fighter', 'ignis', 0, 1),
    )).toBe(12);
    expect(engine.calculateDamage(
      ship(10, 'dreadnought', 'cryos', 0, 0),
      engine.getSnapshot().planets.find((planet) => planet.faction === 'ignis'),
    )).toBe(41);
  });

  it('never gives Scout an attack action', () => {
    expect(engine.generateLegalActionsForUnit(1).some((action) => action.type.startsWith('ATTACK'))).toBe(false);
  });

  it('supports diagonal Fighter and Corvette movement but not Frigate movement', () => {
    for (const type of ['fighter', 'corvette']) {
      replaceShips(engine, [ship(1, type, 'cryos', 4, 4)]);
      expect(engine.generateLegalActionsForUnit(1).some((action) => action.to?.join() === '5,5')).toBe(true);
    }
    replaceShips(engine, [ship(1, 'frigate', 'cryos', 4, 4)]);
    expect(engine.generateLegalActionsForUnit(1).some((action) => action.to?.join() === '5,5')).toBe(false);
  });

  it('lets Fighter move two cells along a clear ray and blocks the ray with a ship', () => {
    replaceShips(engine, [ship(1, 'fighter', 'cryos', 4, 4)]);
    expect(engine.generateLegalActionsForUnit(1).some((action) => action.to?.join() === '6,6')).toBe(true);
    replaceShips(engine, [
      ship(1, 'fighter', 'cryos', 4, 4),
      ship(3, 'fighter', 'cryos', 5, 5),
    ]);
    expect(engine.generateLegalActionsForUnit(1).some((action) => action.to?.join() === '6,6')).toBe(false);
  });

  it('colonizes a neutral planet, consumes Scout, starts at 45 HP, and defers income', () => {
    replaceShips(engine, [ship(1, 'scout', 'cryos', 2, 2)]);
    const action = engine.generateLegalActionsForUnit(1).find((item) => item.type === 'COLONIZE');
    expect(action).toBeTruthy();
    const beforeCredits = engine.getSnapshot().factions.cryos.credits;
    expect(engine.executeUnitAction(action).executed).toBe(true);
    let state = engine.getSnapshot();
    expect(state.ships).toHaveLength(0);
    expect(state.planets.find((planet) => planet.id === 3)).toMatchObject({
      type: 'cryos_colony',
      faction: 'cryos',
      hp: 45,
      readyFromOwnerTurn: 2,
    });
    expect(state.factions.cryos.credits).toBe(beforeCredits);
    expect(
      engine.generateLegalPurchaseActions('cryos').some((item) => item.planetId === 3),
    ).toBe(false);
    engine.endFactionTurn();
    engine.endFactionTurn();
    state = engine.getSnapshot();
    expect(state.factions.cryos.credits).toBe(beforeCredits + 20);
    expect(
      engine.generateLegalPurchaseActions('cryos').some((item) => item.planetId === 3),
    ).toBe(true);
  });

  it('blocks Dreadnought movement for the next owner turn but still allows attack', () => {
    replaceShips(engine, [
      ship(1, 'dreadnought', 'cryos', 4, 4),
      ship(2, 'corvette', 'ignis', 4, 2),
    ]);
    const move = engine.generateLegalActionsForUnit(1).find((action) => action.to?.join() === '4,3');
    engine.executeUnitAction(move);
    engine.endFactionTurn();
    engine.endFactionTurn();
    let actions = engine.generateLegalActionsForUnit(1);
    expect(actions.some((action) => action.type === 'MOVE')).toBe(false);
    expect(actions.some((action) => action.type === 'ATTACK_UNIT')).toBe(true);
    engine.executeUnitAction(actions.find((action) => action.type === 'WAIT'));
    engine.endFactionTurn();
    engine.endFactionTurn();
    actions = engine.generateLegalActionsForUnit(1);
    expect(actions.some((action) => action.type === 'MOVE')).toBe(true);
  });

  it('repairs a ship only on its own active planet', () => {
    replaceShips(engine, [ship(1, 'fighter', 'cryos', 0, 0, 1)]);
    engine.endFactionTurn();
    engine.endFactionTurn();
    expect(engine.getShip(1).hp).toBe(3);

    engine = GameEngine.create(configs, { humanFaction: 'cryos' });
    replaceShips(engine, [ship(1, 'fighter', 'cryos', 9, 9, 1)]);
    engine.endFactionTurn();
    engine.endFactionTurn();
    expect(engine.getShip(1).hp).toBe(1);
  });

  it('repairs a planet only after a full owner cycle without damage', () => {
    const save = engine.serialize();
    const planet = save.state.planets.find((item) => item.id === 1);
    planet.hp = 70;
    planet.damagedSincePreviousOwnerTurn = true;
    engine.restore(save);
    engine.endFactionTurn();
    engine.endFactionTurn();
    expect(engine.getPlanet(1).hp).toBe(70);
    engine.endFactionTurn();
    engine.endFactionTurn();
    expect(engine.getPlanet(1).hp).toBe(76);
  });

  it('blocks production on an occupied planet and after one build', () => {
    replaceShips(engine, [ship(1, 'scout', 'cryos', 0, 0)]);
    expect(engine.generateLegalPurchaseActions('cryos').filter((action) => action.planetId === 1)).toHaveLength(0);

    replaceShips(engine, [ship(1, 'scout', 'cryos', 1, 0)]);
    const build = engine.generateLegalPurchaseActions('cryos').find((action) => action.unitType === 'scout');
    expect(engine.executePurchaseAction(build).executed).toBe(true);
    expect(engine.generateLegalPurchaseActions('cryos').filter((action) => action.planetId === 1)).toHaveLength(0);
  });

  it('rejects unknown and stale action IDs', () => {
    expect(engine.executeUnitAction({ id: 999999, unitId: 1 }).executed).toBe(false);
    replaceShips(engine, [
      ship(1, 'fighter', 'cryos', 4, 4),
      ship(3, 'fighter', 'cryos', 5, 4),
      ship(2, 'scout', 'ignis', 4, 5),
    ]);
    const stale = engine.generateLegalActionsForUnit(1).find((action) => action.targetUnitId === 2);
    const killing = engine.generateLegalActionsForUnit(3).find((action) => action.targetUnitId === 2);
    engine.executeUnitAction(killing);
    expect(engine.executeUnitAction(stale)).toMatchObject({
      executed: false,
      reasonCode: 'STALE_OR_UNKNOWN_ACTION',
    });
  });

  it('detects victory immediately after the last enemy planet is destroyed', () => {
    const save = engine.serialize();
    save.state.planets = save.state.planets.filter((planet) => planet.faction !== 'grey');
    const enemyPlanet = save.state.planets.find((planet) => planet.faction === 'ignis');
    enemyPlanet.x = 5;
    enemyPlanet.y = 4;
    enemyPlanet.hp = 41;
    save.state.ships = [ship(1, 'dreadnought', 'cryos', 4, 4)];
    engine.restore(save);
    const action = engine.generateLegalActionsForUnit(1).find((item) => item.type === 'ATTACK_PLANET');
    engine.executeUnitAction(action);
    expect(engine.getSnapshot().winner).toBe('cryos');
  });

  it('serializes and restores the complete match with version checks', () => {
    const save = engine.serialize();
    const restored = GameEngine.create(configs, { humanFaction: 'ignis' });
    expect(restored.restore(save)).toEqual(engine.getSnapshot());
    save.saveVersion = 99;
    expect(() => restored.restore(save)).toThrow('INCOMPATIBLE_SAVE_VERSION');
  });
});
