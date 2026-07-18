import { parseModelJson } from './ai/validation/parseModelJson.js';

function normalizeBaseUrl(value) {
  return String(value || 'http://localhost:11434').trim().replace(/\/+$/, '');
}

export class OllamaClient {
  constructor(settings, diagnostics, fetchImpl = globalThis.fetch) {
    this.settings = settings;
    this.diagnostics = diagnostics;
    this.fetchImpl = fetchImpl;
  }

  updateSettings(settings) {
    this.settings = settings;
  }

  async chat({ role, model, system, payload, think, temperature, numPredict, contextSize }) {
    const started = performance.now();
    const request = {
      model,
      stream: false,
      think,
      keep_alive: this.settings.keepAlive,
      format: 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      options: {
        temperature,
        num_predict: numPredict,
        num_ctx: contextSize,
      },
    };
    const response = await this.#request(request);
    let content = response?.message?.content;
    let retries = 0;

    if ((!content || !String(content).trim()) && response?.done_reason === 'length') {
      retries = 1;
      const recovery = await this.#request({
        ...request,
        think: false,
        messages: [
          {
            role: 'system',
            content: 'Return only the final JSON object required by the supplied protocol. Do not reason, explain, or use Markdown.',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        options: { ...request.options, temperature: 0, num_predict: Math.max(300, Math.min(numPredict, 600)) },
      });
      content = recovery?.message?.content;
    }

    const data = parseModelJson(content);
    this.diagnostics?.record({
      role,
      model,
      durationMs: Math.round(performance.now() - started),
      objectCount: Array.isArray(payload?.currentWorld?.units) ? payload.currentWorld.units.length : undefined,
      legalActionCount: payload?.legalActions?.length ?? payload?.legalPurchases?.length,
      retries,
      metrics: {
        promptEvalCount: response?.prompt_eval_count,
        promptEvalDuration: response?.prompt_eval_duration,
        evalCount: response?.eval_count,
        evalDuration: response?.eval_duration,
      },
    });
    return { data, raw: response };
  }

  async testConnection(models = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(this.settings.timeoutMs, 10000));
    try {
      const response = await this.fetchImpl(`${normalizeBaseUrl(this.settings.ollamaUrl)}/api/tags`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OLLAMA_HTTP_${response.status}`);
      const data = await response.json();
      const availableModels = (data.models ?? []).map((item) => item.name ?? item.model).filter(Boolean);
      return {
        ok: true,
        availableModels,
        missingModels: [...new Set(models.filter(Boolean))].filter((model) => !availableModels.includes(model)),
      };
    } catch (error) {
      throw this.#humanizeError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async #request(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await this.fetchImpl(`${normalizeBaseUrl(this.settings.ollamaUrl)}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`OLLAMA_HTTP_${response.status}${message ? `: ${message.slice(0, 180)}` : ''}`);
      }
      return await response.json();
    } catch (error) {
      throw this.#humanizeError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  #humanizeError(error) {
    if (error?.name === 'AbortError') return new Error('OLLAMA_TIMEOUT');
    if (/Failed to fetch|NetworkError|fetch failed/i.test(error?.message ?? '')) {
      return new Error('OLLAMA_NETWORK_OR_CORS');
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
