import { createFactionEntity } from './FactionEntity.js';
import { createAiReportEntity } from './AiReportEntity.js';
import { createGameEventEntity } from './GameEventEntity.js';
import { createGameMapEntity } from './GameMapEntity.js';
import { createPlanetEntity } from './PlanetEntity.js';
import { createShipEntity } from './ShipEntity.js';
import { createUnitReportEntity } from './UnitReportEntity.js';

/**
 * Creates or normalizes the complete serializable game state.
 * @param {import('./types.js').GameState} data
 * @returns {import('./types.js').GameState}
 */
export function createGameStateEntity(data) {
  if (!data || !data.humanFaction || !data.aiFaction || !data.activeFaction) {
    throw new Error('INVALID_GAME_STATE_ENTITY');
  }
  const ships = (data.ships ?? []).map(createShipEntity);
  const planets = (data.planets ?? []).map(createPlanetEntity);
  const eventLog = (data.eventLog ?? []).map(createGameEventEntity);
  return {
    saveVersion: data.saveVersion,
    revision: data.revision ?? 1,
    round: data.round ?? 1,
    humanFaction: data.humanFaction,
    aiFaction: data.aiFaction,
    humanRole: data.humanRole ?? 'human',
    aiRole: data.aiRole ?? 'ai',
    activeFaction: data.activeFaction,
    map: createGameMapEntity(data.map),
    factions: Object.fromEntries(
      Object.entries(data.factions ?? {}).map(([key, faction]) => [
        key,
        createFactionEntity(faction),
      ]),
    ),
    ships,
    planets,
    eventLog,
    commandReports: Array.isArray(data.commandReports)
      ? data.commandReports.map(createAiReportEntity)
      : [],
    unitReports: Array.isArray(data.unitReports)
      ? data.unitReports.map(createUnitReportEntity)
      : [],
    nameSeed: data.nameSeed ?? 0,
    nameSequence: data.nameSequence ?? 0,
    nextEntityId: data.nextEntityId
      ?? Math.max(0, ...ships.map((entity) => entity.id), ...planets.map((entity) => entity.id)) + 1,
    nextEventId: data.nextEventId
      ?? Math.max(0, ...eventLog.map((event) => event.id)) + 1,
    nextReportId: data.nextReportId
      ?? Math.max(
        0,
        ...(data.commandReports ?? []).map((report) => report.id ?? 0),
        ...(data.unitReports ?? []).map((report) => report.id ?? 0),
      ) + 1,
    winner: data.winner ?? null,
  };
}
