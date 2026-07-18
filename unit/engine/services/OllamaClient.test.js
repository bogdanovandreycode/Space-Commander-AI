import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../../../src/engine/entities/AiSettingsEntity.js';
import { OllamaClient } from '../../../src/engine/services/OllamaClient.js';

describe('OllamaClient', () => {
  it('invokes browser fetch with globalThis as its receiver', async () => {
    const fetchImpl = vi.fn(function fetchWithWindowBrandCheck() {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve({
        ok: true,
        json: async () => ({ models: [{ name: 'gemma3:4b' }] }),
      });
    });
    const client = new OllamaClient(DEFAULT_AI_SETTINGS, null, fetchImpl);

    const result = await client.testConnection(['gemma3:4b']);

    expect(result.ok).toBe(true);
    expect(result.missingModels).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
