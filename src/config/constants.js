export const SAVE_VERSION = 1;
export const HUMAN_ROLE = 'human';
export const AI_ROLE = 'ai';
export const PLAYABLE_FACTIONS = Object.freeze(['cryos', 'ignis']);
export const NEUTRAL_FACTION = 'grey';

export const DIRECTION_VECTORS = Object.freeze({
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
});

export const ACTION_TYPES = Object.freeze({
  MOVE: 'MOVE',
  ATTACK_UNIT: 'ATTACK_UNIT',
  ATTACK_PLANET: 'ATTACK_PLANET',
  COLONIZE: 'COLONIZE',
  WAIT: 'WAIT',
  BUILD: 'BUILD',
});

export const BASELINE_MAP = Object.freeze({
  width: 10,
  height: 10,
  humanPlanet: [0, 0],
  aiPlanet: [9, 9],
  humanScout: [1, 0],
  aiScout: [8, 9],
  neutralPlanets: [
    [2, 3],
    [7, 6],
    [3, 7],
    [6, 2],
  ],
});

export const STORAGE_KEYS = Object.freeze({
  save: 'spaceCommander.save.v1',
  settings: 'spaceCommander.settings.v1',
});
