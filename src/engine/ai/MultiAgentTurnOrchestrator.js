import { ACTION_TYPES } from '../../gamecore/services/config/constants.js';
import {
  buildCompactRules,
  buildEconomicContext,
  buildGlobalContext,
  buildLocalTacticalContext,
  buildStrategicObjectives,
  buildUnitMission,
} from './context/buildContexts.js';
import { ClassicFallbackAi } from './ClassicFallbackAi.js';
import { HeadquartersAgent } from './HeadquartersAgent.js';
import { ProcurementAgent } from './ProcurementAgent.js';
import { ReportAgent } from './ReportAgent.js';
import { UnitAgent } from './UnitAgent.js';
import { normalizeExecutionOrder } from './validation/validators.js';

function compactAction(action) {
  return {
    id: action.id,
    type: action.type,
    unitId: action.unitId,
    to: action.to,
    targetUnitId: action.targetUnitId,
    planetId: action.planetId,
  };
}

export class MultiAgentTurnOrchestrator {
  constructor({ engine, client, settings, onActivity = () => {}, onEvent = () => {}, locale = 'ru' }) {
    this.engine = engine;
    this.client = client;
    this.settings = settings;
    this.onActivity = onActivity;
    this.onEvent = onEvent;
    this.locale = locale;
    this.fallback = new ClassicFallbackAi(engine, onEvent);
    this.turnEvents = [];
  }

  updateSettings(settings) {
    this.settings = settings;
    this.client.updateSettings(settings);
  }

  async runAiTurn() {
    const snapshot = this.engine.getSnapshot();
    const faction = snapshot.aiFaction;
    this.turnEvents = [];
    if (snapshot.activeFaction !== faction || snapshot.winner) return null;

    if (!this.settings.llmEnabled) {
      this.onActivity({ stage: 'fallback', message: 'Классический AI выполняет ход.' });
      await this.fallback.runTurn(faction);
      return { mode: 'classic', events: [...this.turnEvents] };
    }

    const headquartersAgent = new HeadquartersAgent(this.client, this.settings);
    const reserveHeadquartersAgent = new HeadquartersAgent(this.client, {
      ...this.settings,
      headquartersDecisionModel: this.settings.headquartersFallbackModel,
      headquartersThink: false,
      headquartersTemperature: 0,
      headquartersNumPredict: Math.min(this.settings.headquartersNumPredict, 900),
    }, 'headquarters-fallback');
    const procurementAgent = new ProcurementAgent(this.client, this.settings);
    const unitAgent = new UnitAgent(this.client, this.settings);
    const headquartersReportAgent = new ReportAgent(this.client, this.settings, 'headquarters');
    const procurementReportAgent = new ReportAgent(this.client, this.settings, 'procurement');
    const unitReportAgent = new ReportAgent(this.client, this.settings, 'unit');

    const before = this.engine.getSnapshot();
    const aiUnits = before.ships.filter((ship) => ship.faction === faction && !ship.hasActed);
    const headquartersRequest = {
      protocolVersion: 1,
      faction,
      requestedLanguage: this.#requestedLanguage(),
      strategicObjectives: buildStrategicObjectives(this.engine.configs),
      compactRules: buildCompactRules(this.engine.configs),
      currentWorld: buildGlobalContext(this.engine, faction),
      operationalOptions: aiUnits.map((unit) => ({
        unitId: unit.id,
        legalActions: this.engine.generateLegalActionsForUnit(unit.id).map(compactAction),
      })),
      requiredOutput: {
        doctrine: 'string',
        commanderComment: 'short string',
        strategicRationale: 'short explanation',
        priorities: [],
        unitRecommendations: [],
        executionOrder: ['integer unit IDs'],
        procurementDirective: {},
      },
    };
    let headquartersPlan;
    let headquartersMode = 'primary';
    try {
      this.onActivity({ stage: 'headquarters', message: 'Штаб анализирует карту…' });
      headquartersPlan = await headquartersAgent.decide(
        headquartersRequest,
        aiUnits,
        before.planets,
        before.factions[faction].credits,
      );
    } catch (primaryError) {
      headquartersMode = 'reserve';
      this.onActivity({
        stage: 'headquarters-timeout',
        message: `${this.#errorMessage(primaryError)} Запускается резервный штаб без reasoning…`,
      });
      try {
        this.onActivity({
          stage: 'headquarters-fallback',
          message: 'Резервный штаб принимает командование без reasoning…',
        });
        headquartersPlan = await reserveHeadquartersAgent.decide(
          headquartersRequest,
          aiUnits,
          before.planets,
          before.factions[faction].credits,
        );
      } catch (reserveError) {
        headquartersMode = 'decentralized';
        headquartersPlan = this.#createDecentralizedPlan(
          aiUnits,
          before.factions[faction].credits,
          primaryError,
          reserveError,
        );
        this.onActivity({
          stage: 'headquarters-offline',
          message: 'Связь со штабом потеряна. Корабли действуют самостоятельно по обстановке.',
        });
        this.#saveOfflineHeadquartersReport(faction, headquartersPlan);
      }
    }

    await this.#runProcurement(
      procurementAgent,
      procurementReportAgent,
      headquartersPlan,
      faction,
    );

    const current = this.engine.getSnapshot();
    const activeUnits = current.ships.filter(
      (ship) => ship.faction === faction && !ship.hasActed && ship.hp > 0,
    );
    const executionOrder = normalizeExecutionOrder(headquartersPlan.executionOrder, activeUnits);

    for (const unitId of executionOrder) {
      if (this.engine.getSnapshot().winner) break;
      const unit = this.engine.getSnapshot().ships.find((ship) => ship.id === unitId);
      if (!unit || unit.hasActed || unit.faction !== faction) continue;
      await this.#runUnit(unitAgent, unitReportAgent, unit, headquartersPlan);
    }

    if (headquartersMode !== 'decentralized') {
      await this.#createCommandReport(headquartersReportAgent, 'headquarters', faction, {
        requestedLanguage: this.#requestedLanguage(),
        factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
        strategicObjectives: buildStrategicObjectives(this.engine.configs),
        worldBeforeTurn: headquartersRequest.currentWorld,
        worldAfterTurn: buildGlobalContext(this.engine, faction),
        commandSource: headquartersMode,
        validatedDecision: headquartersPlan,
        turnEvents: [...this.turnEvents],
      });
    }
    this.onActivity({
      stage: 'complete',
      message: headquartersPlan.commanderComment || 'Ход флота завершён.',
    });
    return {
      mode: 'ollama',
      headquartersMode,
      headquartersPlan,
      events: [...this.turnEvents],
    };
  }

  async #runProcurement(agent, reportAgent, headquartersPlan, faction) {
    const legalPurchases = this.engine.generateLegalPurchaseActions(faction);
    this.onActivity({ stage: 'procurement', message: 'Закупки оценивают верфи…' });
    const snapshot = this.engine.getSnapshot();
    const economy = buildEconomicContext(this.engine, faction);
    const repairIntentions = headquartersPlan.unitRecommendations
      .filter((item) => item.recommendation.includes('REPAIR')
        || item.acceptableAlternatives.includes('RETREAT_AND_REPAIR'))
      .map((item) => ({
        unitId: item.unitId,
        planetId: item.targetType === 'PLANET' ? item.targetId : null,
      }));
    let decision;
    try {
      decision = await agent.decide({
        protocolVersion: 1,
        faction,
        requestedLanguage: this.#requestedLanguage(),
        factionObjective: this.engine.configs.aiSemantics.strategicObjectives.faction,
        procurementObjective: this.engine.configs.aiSemantics.strategicObjectives.procurement,
        credits: snapshot.factions[faction].credits,
        economy,
        headquartersDirective: headquartersPlan.procurementDirective,
        commandLinkStatus: headquartersPlan.decentralized ? 'OFFLINE' : 'ONLINE',
        repairIntentions,
        legalPurchases,
        requiredOutput: {
          purchaseActionIds: ['integer IDs'],
          spendingPosture: 'SAVE|SPEND|COUNTER|EXPAND',
          rationale: 'short explanation',
        },
      }, legalPurchases, snapshot.factions[faction].credits, headquartersPlan.procurementDirective);
    } catch (error) {
      this.onActivity({ stage: 'procurement-error', message: 'Закупка пропущена: сохранены кредиты.' });
      await this.#createCommandReport(reportAgent, 'procurement', faction, {
        requestedLanguage: this.#requestedLanguage(),
        factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
        factionObjective: this.engine.configs.aiSemantics.strategicObjectives.faction,
        economy,
        validatedDecision: {
          purchaseActionIds: [],
          reserveCredits: snapshot.factions[faction].credits,
          spendingPosture: 'SAVE',
          rationale: error?.message ?? 'MODEL_ERROR',
        },
        actualPurchases: [],
      });
      return;
    }
    const actualPurchases = [];
    for (const actionId of decision.purchaseActionIds) {
      const refreshed = this.engine.generateLegalPurchaseActions(faction);
      const action = refreshed.find((candidate) => candidate.id === actionId);
      if (!action) continue;
      const result = this.engine.executePurchaseAction(action);
      actualPurchases.push(result);
      this.#pushEvent({ eventType: 'PURCHASE', actionId, actualResult: result });
    }
    await this.#createCommandReport(reportAgent, 'procurement', faction, {
      requestedLanguage: this.#requestedLanguage(),
      factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
      factionObjective: this.engine.configs.aiSemantics.strategicObjectives.faction,
      economy,
      validatedDecision: decision,
      actualPurchases,
      economyAfter: buildEconomicContext(this.engine, faction),
    });
  }

  async #runUnit(agent, reportAgent, unit, headquartersPlan) {
    const recommendation = headquartersPlan.unitRecommendations.find((item) => item.unitId === unit.id);
    const missionProfile = buildUnitMission(this.engine.configs, unit.type);
    const preActionContext = buildLocalTacticalContext(
      this.engine,
      unit.id,
      this.settings.tacticalRadius,
    );
    let legalActions = this.engine.generateLegalActionsForUnit(unit.id)
      .map((action) => ({
        ...action,
        orderFit: this.#orderFit(action, recommendation),
      }));
    if (!legalActions.length) return;
    this.onActivity({ stage: 'unit', unitId: unit.id, message: `${unit.aiMemory.callsign}: выбор действия…` });
    let decision;
    try {
      decision = await agent.decide({
        protocolVersion: 1,
        faction: unit.faction,
        requestedLanguage: this.#requestedLanguage(),
        identity: {
          unitId: unit.id,
          name: unit.name,
          typeKey: unit.type,
          sector: [unit.x, unit.y],
          hp: unit.hp,
        },
        missionProfile,
        headquartersRecommendation: recommendation,
        commandLinkStatus: headquartersPlan.decentralized ? 'OFFLINE' : 'ONLINE',
        localTacticalState: preActionContext,
        eventsEarlierThisTurn: this.turnEvents.slice(-20),
        legalActions,
      }, legalActions);
    } catch (error) {
      const fallbackAction = this.settings.fallbackEnabled
        ? this.fallback.chooseUnitAction(unit.id, recommendation)
        : legalActions.find((action) => action.type === ACTION_TYPES.WAIT);
      decision = {
        actionId: fallbackAction?.id,
        recommendationStatus: 'REPLACED',
        intentCode: 'SAFE_FALLBACK',
        reasonCode: error?.message ?? 'MODEL_ERROR',
        confidence: 0.4,
      };
    }

    legalActions = this.engine.generateLegalActionsForUnit(unit.id);
    let selected = legalActions.find((action) => action.id === decision.actionId);
    if (!selected) {
      selected = this.settings.fallbackEnabled
        ? this.fallback.chooseUnitAction(unit.id, recommendation)
        : legalActions.find((action) => action.type === ACTION_TYPES.WAIT);
    }
    if (!selected) return;
    const actualResult = this.engine.executeUnitAction(selected);
    const event = {
      eventType: 'UNIT_ACTION',
      unitId: unit.id,
      recommendation,
      decision,
      selectedAction: compactAction(selected),
      actualResult,
    };
    this.#pushEvent(event);

    if (this.settings.reportsEnabled && actualResult.executed) {
      try {
        const report = await reportAgent.create({
          requestedLanguage: this.#requestedLanguage(),
          factionLore: this.engine.configs.factions.factions[unit.faction].loreKeywords,
          missionProfile,
          unitBeforeAction: {
            unitId: unit.id,
            name: unit.name,
            callsign: unit.aiMemory.callsign,
            type: unit.type,
            sector: [unit.x, unit.y],
            hp: unit.hp,
          },
          tacticalSituationBeforeAction: preActionContext,
          headquartersRecommendation: recommendation,
          decision,
          selectedAction: compactAction(selected),
          actualResult,
          unitAfterAction: this.engine.getSnapshot().ships.find((ship) => ship.id === unit.id) ?? null,
          eventsEarlierThisTurn: this.turnEvents.slice(0, -1),
        });
        const stored = this.engine.saveUnitReport(unit.id, {
          round: this.engine.getSnapshot().round,
          faction: unit.faction,
          ...report,
          order: recommendation,
          result: actualResult,
        });
        this.onEvent({ eventType: 'UNIT_REPORT', unitId: unit.id, report: stored });
      } catch (error) {
        const report = this.#fallbackReport('unit', {
          missionProfile,
          decision,
          selectedAction: compactAction(selected),
          actualResult,
        }, error);
        const stored = this.engine.saveUnitReport(unit.id, {
          round: this.engine.getSnapshot().round,
          faction: unit.faction,
          ...report,
          order: recommendation,
          result: actualResult,
        });
        this.onEvent({ eventType: 'UNIT_REPORT', unitId: unit.id, report: stored });
      }
    }
  }

  #createDecentralizedPlan(units, credits, primaryError, reserveError) {
    return {
      doctrine: 'DECENTRALIZED_OPERATIONS',
      commanderComment: 'Корабли завершили ход без связи со штабом.',
      rationale: 'Основной и резервный штабные каналы недоступны; капитаны оценивают обстановку самостоятельно.',
      priorities: [],
      unitRecommendations: [],
      executionOrder: units.map((unit) => unit.id).sort((a, b) => a - b),
      procurementDirective: {
        goal: 'LOCAL_TACTICAL_BALANCE',
        maxSpend: credits,
        minimumReserve: 0,
        desiredFleetChanges: {},
        avoidPlanetIds: [],
        preferredPlanetIds: [],
      },
      decentralized: true,
      communicationErrors: {
        primary: primaryError?.message ?? String(primaryError),
        reserve: reserveError?.message ?? String(reserveError),
      },
    };
  }

  #saveOfflineHeadquartersReport(faction, plan) {
    if (!this.settings.reportsEnabled) return;
    const report = this.engine.saveCommandReport('headquarters', {
      faction,
      round: this.engine.getSnapshot().round,
      status: 'FAILED',
      title: 'Связь со штабом потеряна',
      narrative: 'Основной и резервный командные каналы не ответили. Капитаны получили право действовать самостоятельно по фактической обстановке в своих секторах.',
      rationale: plan.rationale,
    });
    this.onEvent({ eventType: 'COMMAND_REPORT', role: 'headquarters', report });
  }

  #orderFit(action, recommendation) {
    if (!recommendation) return 50;
    if ([action.targetUnitId, action.planetId].includes(recommendation.targetId)) return 100;
    if (action.type === ACTION_TYPES.WAIT && recommendation.recommendation === 'HOLD') return 90;
    return 50;
  }

  #pushEvent(event) {
    this.turnEvents.push(event);
    this.onEvent(event);
  }

  async #createCommandReport(agent, role, faction, payload) {
    if (!this.settings.reportsEnabled) return;
    let report;
    try {
      report = await agent.create(payload);
    } catch (error) {
      report = this.#fallbackReport(role, payload, error);
    }
    const stored = this.engine.saveCommandReport(role, {
      faction,
      round: this.engine.getSnapshot().round,
      ...report,
    });
    this.onEvent({ eventType: 'COMMAND_REPORT', role, report: stored });
  }

  #fallbackReport(role, payload, error) {
    const titles = {
      headquarters: 'Сводка штаба',
      procurement: 'Экономическая сводка',
      unit: 'Бортовой журнал',
    };
    const decision = payload.validatedDecision ?? payload.decision ?? {};
    const actualResult = payload.actualResult ?? {};
    const actualPurchases = payload.actualPurchases ?? [];
    const from = this.#formatSector(actualResult.from) ?? 'неизвестном';
    const to = this.#formatSector(actualResult.to);
    const unitAction = actualResult.actionType ?? payload.selectedAction?.type ?? 'WAIT';
    return {
      role,
      status: 'PARTIAL',
      title: titles[role],
      narrative: role === 'procurement'
        ? `Экономика сопоставила доступные кредиты, состав флотов и угрозы колониям. ${
          actualPurchases.length
            ? `Верфи выполнили подтверждённых заказов: ${actualPurchases.length}.`
            : 'Новых корпусов не заказано: ресурсы сохранены для более подходящей стратегической задачи.'
        } После решения в резерве осталось ${decision.reserveCredits ?? 'неуточнённое количество'} кредитов.`
        : role === 'unit'
          ? `Задача корабля определена его целевым профилем. До действия он находился в секторе ${from}. Выполнено подтверждённое действие ${unitAction}${to ? ` с результатом в секторе ${to}` : ''}; нанесённый урон: ${actualResult.damageDealt ?? 0}, цель уничтожена: ${actualResult.targetDestroyed ? 'да' : 'нет'}. Результат зафиксирован без неподтверждённых последствий.`
          : `Штаб оценил условие победы, состояние обеих экономик и соотношение флотов. Доктрина ${decision.doctrine ?? 'текущего цикла'} преобразована в ${decision.unitRecommendations?.length ?? 0} конкретных рекомендаций кораблям. За ход подтверждено событий: ${payload.turnEvents?.length ?? 0}. Следующий цикл должен развивать достигнутые результаты и не терять связь между экспансией, прикрытием и давлением на вражеские планеты.`,
      rationale: decision.rationale ?? error?.message ?? 'REPORT_MODEL_UNAVAILABLE',
    };
  }

  #requestedLanguage() {
    return this.locale === 'ru' ? 'Russian' : 'English';
  }

  #formatSector(value) {
    return Array.isArray(value) && value.length >= 2 ? `[${value[0]}:${value[1]}]` : null;
  }

  #errorMessage(error) {
    if (error?.message === 'OLLAMA_NETWORK_OR_CORS') {
      return 'Нет связи с Ollama. Проверьте сервис, OLLAMA_ORIGINS и доступ браузера к localhost.';
    }
    if (error?.message === 'OLLAMA_TIMEOUT') return 'Ollama не ответила вовремя.';
    return `Ошибка AI: ${error?.message ?? String(error)}`;
  }
}
