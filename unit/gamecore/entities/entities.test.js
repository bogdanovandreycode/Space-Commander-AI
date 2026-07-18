import { describe, expect, it } from 'vitest';
import { createActionResultEntity } from '../../../src/gamecore/entities/ActionResultEntity.js';
import { createFactionEntity } from '../../../src/gamecore/entities/FactionEntity.js';
import { createGameMapEntity } from '../../../src/gamecore/entities/GameMapEntity.js';
import { createGameSnapshotEntity } from '../../../src/gamecore/entities/GameSnapshotEntity.js';
import { createGameStateEntity } from '../../../src/gamecore/entities/GameStateEntity.js';
import { createLegalActionEntity } from '../../../src/gamecore/entities/LegalActionEntity.js';
import { createPlanetEntity } from '../../../src/gamecore/entities/PlanetEntity.js';
import { createShipEntity } from '../../../src/gamecore/entities/ShipEntity.js';

describe('gamecore entities', () => {
  it('creates serializable ship and planet entities with stable defaults', () => {
    const ship = createShipEntity({
      id: 7,
      type: 'fighter',
      faction: 'cryos',
      x: 2,
      y: 3,
      hp: 30,
      role: 'human',
      aiMemory: { callsign: 'FIGHTER-7' },
    });
    const planet = createPlanetEntity({
      id: 8,
      type: 'cryos_ice',
      faction: 'cryos',
      x: 0,
      y: 0,
      hp: 100,
      readyFromOwnerTurn: 1,
    });

    expect(ship).toMatchObject({
      hasActed: false,
      movementCooldown: 0,
      aiMemory: { callsign: 'FIGHTER-7', reports: [], kills: 0 },
    });
    expect(planet).toMatchObject({
      productionUsedOwnerTurn: 0,
      damagedSincePreviousOwnerTurn: false,
    });
    expect(JSON.parse(JSON.stringify({ ship, planet }))).toEqual({ ship, planet });
  });

  it('normalizes the game state and creates a detached immutable snapshot', () => {
    const ship = createShipEntity({
      id: 1,
      type: 'scout',
      faction: 'cryos',
      x: 1,
      y: 0,
      hp: 20,
      role: 'human',
    });
    const planet = createPlanetEntity({
      id: 2,
      type: 'cryos_ice',
      faction: 'cryos',
      x: 0,
      y: 0,
      hp: 100,
      readyFromOwnerTurn: 1,
    });
    const state = createGameStateEntity({
      saveVersion: 1,
      humanFaction: 'cryos',
      aiFaction: 'ignis',
      activeFaction: 'cryos',
      map: createGameMapEntity({ width: 10, height: 10 }),
      factions: {
        cryos: createFactionEntity({ credits: 25, ownerTurns: 1 }),
        ignis: createFactionEntity({ credits: 25, ownerTurns: 0 }),
      },
      ships: [ship],
      planets: [planet],
    });
    const snapshot = createGameSnapshotEntity(state);

    state.ships[0].hp = 1;
    expect(snapshot.ships[0].hp).toBe(20);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.ships[0])).toBe(true);
  });

  it('creates typed legal-action previews and transaction results', () => {
    const action = createLegalActionEntity({
      id: 12,
      type: 'MOVE',
      unitId: 1,
      to: [2, 0],
      risk: 10,
      orderFit: 50,
      strategicValue: 30,
      predictedResult: { expectedIncomingDamage: 4 },
      strategicTags: ['ADVANCE'],
    });
    const result = createActionResultEntity({
      executed: true,
      actionType: action.type,
      actionId: action.id,
      reasonCode: 'SUCCESS',
    });

    expect(action.predictedResult).toMatchObject({
      expectedIncomingDamage: 4,
      lethalNextTurn: false,
    });
    expect(result).toEqual({
      executed: true,
      actionType: 'MOVE',
      actionId: 12,
      reasonCode: 'SUCCESS',
    });
  });
});
