export const DEFAULT_AI_SETTINGS = Object.freeze({
  ollamaUrl: 'http://localhost:11434',
  headquartersModel: 'deepseek-r1:8b',
  procurementModel: 'gemma3:4b',
  unitModel: 'gemma3:4b',
  reportModel: 'gemma3:4b',
  headquartersThink: true,
  headquartersTemperature: 0.1,
  procurementTemperature: 0,
  unitTemperature: 0,
  reportTemperature: 0.5,
  headquartersNumPredict: 2400,
  procurementNumPredict: 500,
  unitNumPredict: 400,
  reportNumPredict: 180,
  headquartersContextSize: 16384,
  procurementContextSize: 8192,
  unitContextSize: 8192,
  reportContextSize: 4096,
  tacticalRadius: 4,
  timeoutMs: 120000,
  keepAlive: '30m',
  reportsEnabled: true,
  fallbackEnabled: true,
  debug: false,
  llmEnabled: true,
});

/**
 * Creates normalized application AI settings.
 * @param {Partial<import('./types.js').AiSettings>} [overrides]
 */
export function createAiSettingsEntity(overrides = {}) {
  return { ...DEFAULT_AI_SETTINGS, ...(overrides ?? {}) };
}
