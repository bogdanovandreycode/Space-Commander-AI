import { describe, expect, it } from 'vitest';
import { loadGameConfigs } from '../../../src/services/config/loadGameConfigs.js';
import { validateGameConfigs } from '../../../src/services/config/validateGameConfigs.js';

describe('game configuration', () => {
  it('loads and validates all canonical JSON files', () => {
    const configs = loadGameConfigs();
    expect(validateGameConfigs(configs)).toBe(true);
    expect(Object.keys(configs.ships.ships)).toEqual([
      'scout', 'fighter', 'corvette', 'frigate', 'dreadnought',
    ]);
  });

  it('fails with a readable error for an incompatible schema', () => {
    const configs = structuredClone(loadGameConfigs());
    configs.ships.schemaVersion = 99;
    expect(() => validateGameConfigs(configs)).toThrow(/ships\.schemaVersion/);
  });
});
