export const DEFAULT_AI_SETTINGS = Object.freeze({
  ollamaUrl: 'http://localhost:11434',
  headquartersDecisionModel: 'deepseek-r1:8b',
  headquartersFallbackModel: 'gemma3:4b',
  headquartersReportModel: 'gemma3:4b',
  procurementDecisionModel: 'gemma3:4b',
  procurementReportModel: 'gemma3:4b',
  unitDecisionModel: 'gemma3:4b',
  unitReportModel: 'gemma3:4b',
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
  const source = overrides ?? {};
  const settings = {
    ...DEFAULT_AI_SETTINGS,
    ...source,
    headquartersDecisionModel: source.headquartersDecisionModel
      ?? source.headquartersModel
      ?? DEFAULT_AI_SETTINGS.headquartersDecisionModel,
    headquartersFallbackModel: source.headquartersFallbackModel
      ?? DEFAULT_AI_SETTINGS.headquartersFallbackModel,
    headquartersReportModel: source.headquartersReportModel
      ?? source.reportModel
      ?? DEFAULT_AI_SETTINGS.headquartersReportModel,
    procurementDecisionModel: source.procurementDecisionModel
      ?? source.procurementModel
      ?? DEFAULT_AI_SETTINGS.procurementDecisionModel,
    procurementReportModel: source.procurementReportModel
      ?? source.reportModel
      ?? DEFAULT_AI_SETTINGS.procurementReportModel,
    unitDecisionModel: source.unitDecisionModel
      ?? source.unitModel
      ?? DEFAULT_AI_SETTINGS.unitDecisionModel,
    unitReportModel: source.unitReportModel
      ?? source.reportModel
      ?? DEFAULT_AI_SETTINGS.unitReportModel,
  };
  for (const legacyKey of ['headquartersModel', 'procurementModel', 'unitModel', 'reportModel']) {
    delete settings[legacyKey];
  }
  return settings;
}
