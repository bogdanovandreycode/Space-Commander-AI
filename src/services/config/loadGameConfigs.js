import aiSemantics from '../../configs/ai_semantics.json';
import factions from '../../configs/factions.json';
import gameRules from '../../configs/game_rules.json';
import planets from '../../configs/planets.json';
import ships from '../../configs/ships.json';
import { validateGameConfigs } from './validateGameConfigs.js';

let cachedConfigs;

/**
 * Loads and validates the canonical game configuration bundled by Vite.
 * @returns {import('../game/types.js').GameConfigs}
 */
export function loadGameConfigs() {
  if (!cachedConfigs) {
    const configs = { aiSemantics, factions, gameRules, planets, ships };
    validateGameConfigs(configs);
    cachedConfigs = configs;
  }
  return cachedConfigs;
}
