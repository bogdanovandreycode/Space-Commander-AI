import { describe, expect, it, vi } from 'vitest';
import { ClassicFallbackAi, scoreLegalAction } from '../../../src/engine/ai/ClassicFallbackAi.js';
import { MultiAgentTurnOrchestrator } from '../../../src/engine/ai/MultiAgentTurnOrchestrator.js';
import { parseModelJson } from '../../../src/engine/ai/validation/parseModelJson.js';
import { normalizeExecutionOrder } from '../../../src/engine/ai/validation/validators.js';
import { DEFAULT_AI_SETTINGS } from '../../../src/engine/services/LocalSettingsStorage.js';
import { loadGameConfigs } from '../../../src/gamecore/services/config/loadGameConfigs.js';
import { GameEngine } from '../../../src/gamecore/services/GameEngine.js';

describe('AI validation and fallback', () => {
  it('parses clean, fenced, and surrounded JSON', () => {
    expect(parseModelJson('{"actionId":1}')).toEqual({ actionId: 1 });
    expect(parseModelJson('```json\n{"actionId":2}\n```')).toEqual({ actionId: 2 });
    expect(parseModelJson('Answer: {"actionId":3} done')).toEqual({ actionId: 3 });
    expect(() => parseModelJson('not json')).toThrow('INVALID_MODEL_JSON');
  });

  it('normalizes execution order by removing duplicates and unknown IDs', () => {
    const units = [{ id: 2 }, { id: 4 }, { id: 7 }];
    expect(normalizeExecutionOrder([4, 4, 99, 2], units)).toEqual([4, 2, 7]);
  });

  it('uses the documented deterministic scoring priorities', () => {
    const safe = {
      id: 1, orderFit: 50, strategicValue: 50, risk: 0,
      predictedResult: {
        targetDestroyed: false, colonizedPlanet: false, unitRepaired: false,
        selfDestroyed: false, lethalNextTurn: false,
      },
    };
    const lethal = {
      ...safe,
      id: 2,
      predictedResult: { ...safe.predictedResult, targetDestroyed: true, lethalNextTurn: true },
    };
    expect(scoreLegalAction(safe)).toBeGreaterThan(scoreLegalAction(lethal));
  });

  it('finishes the turn with ClassicFallbackAi using legal actions only', async () => {
    const engine = GameEngine.create(loadGameConfigs(), { humanFaction: 'cryos' });
    engine.endFactionTurn();
    const fallback = new ClassicFallbackAi(engine);
    await fallback.runTurn('ignis');
    expect(engine.getSnapshot().ships.filter((ship) => ship.faction === 'ignis').every((ship) => ship.hasActed)).toBe(true);
  });

  it('falls back when headquarters returns invalid JSON/error', async () => {
    const engine = GameEngine.create(loadGameConfigs(), { humanFaction: 'cryos' });
    engine.endFactionTurn();
    const client = {
      chat: vi.fn().mockRejectedValue(new Error('INVALID_MODEL_JSON')),
      updateSettings: vi.fn(),
    };
    const orchestrator = new MultiAgentTurnOrchestrator({
      engine,
      client,
      settings: { ...DEFAULT_AI_SETTINGS, reportsEnabled: false },
    });
    const result = await orchestrator.runAiTurn();
    expect(result.mode).toBe('fallback');
    expect(engine.getSnapshot().ships.filter((ship) => ship.faction === 'ignis').every((ship) => ship.hasActed)).toBe(true);
  });
});
