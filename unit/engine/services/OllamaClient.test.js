import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../../../src/engine/entities/AiSettingsEntity.js';
import { OllamaClient } from '../../../src/engine/services/OllamaClient.js';

describe('OllamaClient', () => {
  afterEach(() => vi.useRealTimers());

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

  it('lists unique Ollama models in stable name order and accepts an empty list', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'zeta:1' }, { model: 'alpha:1' }, { name: 'zeta:1' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
    const client = new OllamaClient(DEFAULT_AI_SETTINGS, null, fetchImpl);
    expect(await client.listModels()).toEqual(['alpha:1', 'zeta:1']);
    expect(await client.listModels()).toEqual([]);
  });

  it('normalizes browser CORS failures', async () => {
    const client = new OllamaClient(
      DEFAULT_AI_SETTINGS,
      null,
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(client.listModels()).rejects.toThrow('OLLAMA_NETWORK_OR_CORS');
  });

  it('times out model discovery without blocking settings', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const client = new OllamaClient({ ...DEFAULT_AI_SETTINGS, timeoutMs: 20 }, null, fetchImpl);
    const pending = expect(client.listModels()).rejects.toThrow('OLLAMA_TIMEOUT');
    await vi.advanceTimersByTimeAsync(20);
    await pending;
  });
});
