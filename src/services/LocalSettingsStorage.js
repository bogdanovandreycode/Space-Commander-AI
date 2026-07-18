import { STORAGE_KEYS } from './config/constants.js';

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

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export class LocalSettingsStorage {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  loadSettings() {
    const stored = safeParse(this.storage?.getItem(STORAGE_KEYS.settings));
    return { ...DEFAULT_AI_SETTINGS, ...(stored ?? {}) };
  }

  saveSettings(settings) {
    this.storage?.setItem(STORAGE_KEYS.settings, JSON.stringify({
      ...DEFAULT_AI_SETTINGS,
      ...settings,
    }));
  }

  loadGame() {
    return safeParse(this.storage?.getItem(STORAGE_KEYS.save));
  }

  saveGame(saveData) {
    this.storage?.setItem(STORAGE_KEYS.save, JSON.stringify(saveData));
  }

  clearGame() {
    this.storage?.removeItem(STORAGE_KEYS.save);
  }
}
