import { describe, expect, it } from 'vitest';
import {
  createAiSettingsEntity,
  DEFAULT_AI_SETTINGS,
} from '../../../src/engine/entities/AiSettingsEntity.js';

describe('AiSettingsEntity', () => {
  it('applies application defaults without mutating the shared template', () => {
    const settings = createAiSettingsEntity({
      unitModel: 'custom:latest',
      reportModel: 'writer:latest',
      language: 'en',
    });

    expect(settings.unitDecisionModel).toBe('custom:latest');
    expect(settings.unitReportModel).toBe('writer:latest');
    expect(settings.headquartersReportModel).toBe('writer:latest');
    expect(settings.headquartersFallbackModel).toBe('gemma3:4b');
    expect(settings.language).toBe('en');
    expect(settings.timeoutMs).toBe(120000);
    expect(settings).not.toHaveProperty('unitModel');
    expect(DEFAULT_AI_SETTINGS.unitDecisionModel).toBe('gemma3:4b');
  });

  it('preserves an explicitly selected reserve headquarters model', () => {
    const settings = createAiSettingsEntity({
      headquartersDecisionModel: 'reasoner:latest',
      headquartersFallbackModel: 'fast:latest',
    });
    expect(settings.headquartersDecisionModel).toBe('reasoner:latest');
    expect(settings.headquartersFallbackModel).toBe('fast:latest');
  });
});
