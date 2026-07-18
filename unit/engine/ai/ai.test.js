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

  it('preserves a one-turn reserve for a stronger response unless a colony is threatened', () => {
    const engine = GameEngine.create(loadGameConfigs(), { humanFaction: 'cryos' });
    engine.endFactionTurn();
    const save = engine.serialize();
    save.state.factions.ignis.credits = 65;
    save.state.ships = [
      {
        ...save.state.ships.find((ship) => ship.faction === 'ignis'),
        x: 8,
        y: 9,
      },
      {
        ...save.state.ships.find((ship) => ship.faction === 'cryos'),
        id: 10,
        type: 'dreadnought',
        hp: 70,
        x: 0,
        y: 0,
      },
    ];
    engine.restore(save);
    const fallback = new ClassicFallbackAi(engine);
    expect(fallback.choosePurchase('ignis')).toBeNull();

    const threatened = engine.serialize();
    const enemy = threatened.state.ships.find((ship) => ship.faction === 'cryos');
    enemy.x = 8;
    enemy.y = 8;
    engine.restore(threatened);
    expect(fallback.choosePurchase('ignis')).toBeTruthy();
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

  it('runs independent decision/report stages with serialized artistic reports and enemy economy', async () => {
    const engine = GameEngine.create(loadGameConfigs(), { humanFaction: 'cryos', nameSeed: 9 });
    engine.endFactionTurn();
    const calls = [];
    let activeReports = 0;
    let maximumConcurrentReports = 0;
    const client = {
      updateSettings: vi.fn(),
      chat: vi.fn(async ({ role, payload }) => {
        calls.push({ role, payload });
        if (role.endsWith('-report')) {
          activeReports += 1;
          maximumConcurrentReports = Math.max(maximumConcurrentReports, activeReports);
          await new Promise((resolve) => setTimeout(resolve, 2));
          activeReports -= 1;
          return {
            data: {
              status: 'SUCCESS',
              title: `${role} title`,
              narrative: 'Флот провёл подтверждённый манёвр без вымышленных последствий.',
              rationale: 'Фактическая обстановка потребовала сохранить рубеж.',
            },
          };
        }
        if (role === 'headquarters') {
          return {
            data: {
              doctrine: 'BALANCED_OPERATIONS',
              commanderComment: 'Рубеж удержан.',
              strategicRationale: 'Колонии остаются главным приоритетом.',
              executionOrder: [2],
              unitRecommendations: [],
              procurementDirective: { maxSpend: 25, minimumReserve: 25 },
            },
          };
        }
        if (role === 'procurement') {
          return {
            data: {
              purchaseActionIds: [],
              spendingPosture: 'SAVE',
              rationale: 'Резерв нужен для более сильного контр-юнита.',
            },
          };
        }
        const wait = payload.legalActions.find((action) => action.type === 'WAIT');
        return {
          data: {
            actionId: wait.id,
            recommendationStatus: 'WAITING',
            intentCode: 'HOLD',
            reasonCode: 'DEFEND_PLANET',
            rationale: 'Скаут сохраняет позицию у колонии.',
            confidence: 0.8,
          },
        };
      }),
    };
    const orchestrator = new MultiAgentTurnOrchestrator({
      engine,
      client,
      settings: { ...DEFAULT_AI_SETTINGS, reportsEnabled: true },
    });

    const result = await orchestrator.runAiTurn();
    const roles = calls.map((call) => call.role);
    expect(result.mode).toBe('ollama');
    expect(roles).toContain('headquarters-report');
    expect(roles).toContain('procurement-report');
    expect(roles).toContain('unit-report');
    expect(roles.indexOf('headquarters')).toBeLessThan(roles.indexOf('headquarters-report'));
    expect(roles.indexOf('procurement')).toBeLessThan(roles.indexOf('procurement-report'));
    expect(roles.indexOf('unit')).toBeLessThan(roles.indexOf('unit-report'));
    expect(maximumConcurrentReports).toBe(1);
    const procurement = calls.find((call) => call.role === 'procurement');
    expect(procurement.payload.economy).toHaveProperty('own');
    expect(procurement.payload.economy).toHaveProperty('enemy');
    expect(engine.getSnapshot().commandReports.map((report) => report.role))
      .toEqual(['headquarters', 'procurement']);
    expect(engine.getSnapshot().unitReports[0]).toMatchObject({
      role: 'unit',
      title: 'unit-report title',
    });
  });
});
