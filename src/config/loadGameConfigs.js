import aiSemantics from '../../doc/configs/ai_semantics.json';
import factions from '../../doc/configs/factions.json';
import gameRules from '../../doc/configs/game_rules.json';
import planets from '../../doc/configs/planets.json';
import ships from '../../doc/configs/ships.json';
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
