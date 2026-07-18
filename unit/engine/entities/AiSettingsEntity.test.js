import { describe, expect, it } from 'vitest';
import {
  createAiSettingsEntity,
  DEFAULT_AI_SETTINGS,
} from '../../../src/engine/entities/AiSettingsEntity.js';

describe('AiSettingsEntity', () => {
  it('applies application defaults without mutating the shared template', () => {
    const settings = createAiSettingsEntity({ unitModel: 'custom:latest', language: 'en' });

    expect(settings.unitModel).toBe('custom:latest');
    expect(settings.language).toBe('en');
    expect(settings.timeoutMs).toBe(120000);
    expect(DEFAULT_AI_SETTINGS.unitModel).toBe('gemma3:4b');
  });
});
