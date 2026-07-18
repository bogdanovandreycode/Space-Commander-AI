import { STORAGE_KEYS } from '../config/storageKeys.js';
import {
  createAiSettingsEntity,
  DEFAULT_AI_SETTINGS,
} from '../entities/AiSettingsEntity.js';

export { DEFAULT_AI_SETTINGS };

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
    return createAiSettingsEntity(stored);
  }

  saveSettings(settings) {
    this.storage?.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify(createAiSettingsEntity(settings)),
    );
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
