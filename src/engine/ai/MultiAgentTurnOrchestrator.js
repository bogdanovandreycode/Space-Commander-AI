import { ACTION_TYPES } from '../../gamecore/services/config/constants.js';
import {
  buildCompactRules,
  buildEconomicContext,
  buildGlobalContext,
  buildLocalTacticalContext,
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
    this.reportQueue = Promise.resolve();
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
    const procurementAgent = new ProcurementAgent(this.client, this.settings);
    const unitAgent = new UnitAgent(this.client, this.settings);
    const headquartersReportAgent = new ReportAgent(this.client, this.settings, 'headquarters');
    const procurementReportAgent = new ReportAgent(this.client, this.settings, 'procurement');
    const unitReportAgent = new ReportAgent(this.client, this.settings, 'unit');

    let headquartersPlan;
    try {
      this.onActivity({ stage: 'headquarters', message: 'Штаб анализирует карту…' });
      const before = this.engine.getSnapshot();
      const aiUnits = before.ships.filter((ship) => ship.faction === faction && !ship.hasActed);
      const operationalOptions = aiUnits.map((unit) => ({
        unitId: unit.id,
        legalActions: this.engine.generateLegalActionsForUnit(unit.id).map(compactAction),
      }));
      headquartersPlan = await headquartersAgent.decide({
        protocolVersion: 1,
        faction,
        compactRules: buildCompactRules(this.engine.configs),
        currentWorld: buildGlobalContext(this.engine, faction),
        operationalOptions,
        requiredOutput: {
          doctrine: 'string',
          commanderComment: 'short string',
          strategicRationale: 'short explanation',
          priorities: [],
          unitRecommendations: [],
          executionOrder: ['integer unit IDs'],
          procurementDirective: {},
        },
      }, aiUnits, before.planets, before.factions[faction].credits);
      this.#queueCommandReport(headquartersReportAgent, 'headquarters', faction, {
        locale: this.locale,
        factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
        currentWorld: buildGlobalContext(this.engine, faction),
        validatedDecision: headquartersPlan,
      });
    } catch (error) {
      this.onActivity({ stage: 'error', message: this.#errorMessage(error) });
      if (this.settings.fallbackEnabled) {
        await this.fallback.runTurn(faction);
        return { mode: 'fallback', error, events: [...this.turnEvents] };
      }
      await this.#waitAllUnits(faction);
      return { mode: 'safe-wait', error, events: [...this.turnEvents] };
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

    await this.reportQueue;
    this.onActivity({
      stage: 'complete',
      message: headquartersPlan.commanderComment || 'Ход флота завершён.',
    });
    return { mode: 'ollama', headquartersPlan, events: [...this.turnEvents] };
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
        credits: snapshot.factions[faction].credits,
        economy,
        headquartersDirective: headquartersPlan.procurementDirective,
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
      this.#queueCommandReport(reportAgent, 'procurement', faction, {
        locale: this.locale,
        factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
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
    this.#queueCommandReport(reportAgent, 'procurement', faction, {
      locale: this.locale,
      factionLore: this.engine.configs.factions.factions[faction].loreKeywords,
      economy,
      validatedDecision: decision,
      actualPurchases,
      economyAfter: buildEconomicContext(this.engine, faction),
    });
  }

  async #runUnit(agent, reportAgent, unit, headquartersPlan) {
    const recommendation = headquartersPlan.unitRecommendations.find((item) => item.unitId === unit.id);
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
        identity: {
          unitId: unit.id,
          name: unit.name,
          typeKey: unit.type,
          sector: [unit.x, unit.y],
          hp: unit.hp,
        },
        headquartersRecommendation: recommendation,
        localTacticalState: buildLocalTacticalContext(
          this.engine,
          unit.id,
          this.settings.tacticalRadius,
        ),
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
      this.reportQueue = this.reportQueue.then(async () => {
        try {
          const report = await reportAgent.create({
            locale: this.locale,
            factionLore: this.engine.configs.factions.factions[unit.faction].loreKeywords,
            unit: {
              unitId: unit.id,
              name: unit.name,
              callsign: unit.aiMemory.callsign,
              type: unit.type,
              sector: [unit.x, unit.y],
            },
            headquartersRecommendation: recommendation,
            decision,
            actualResult,
          });
          this.engine.saveUnitReport(unit.id, {
            round: this.engine.getSnapshot().round,
            faction: unit.faction,
            ...report,
            order: recommendation,
            result: actualResult,
          });
          this.onEvent({ eventType: 'UNIT_REPORT', unitId: unit.id, report });
        } catch (error) {
          const report = this.#fallbackReport('unit', { decision, actualResult }, error);
          this.engine.saveUnitReport(unit.id, {
            round: this.engine.getSnapshot().round,
            faction: unit.faction,
            ...report,
          });
        }
      });
    }
  }

  async #waitAllUnits(faction) {
    const units = this.engine.getSnapshot().ships.filter(
      (ship) => ship.faction === faction && !ship.hasActed,
    );
    for (const unit of units) {
      const wait = this.engine.generateLegalActionsForUnit(unit.id)
        .find((action) => action.type === ACTION_TYPES.WAIT);
      if (wait) this.onEvent(this.engine.executeUnitAction(wait));
    }
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

  #queueCommandReport(agent, role, faction, payload) {
    if (!this.settings.reportsEnabled) return;
    this.reportQueue = this.reportQueue.then(async () => {
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
    });
  }

  #fallbackReport(role, payload, error) {
    const titles = {
      headquarters: 'Сводка штаба',
      procurement: 'Экономическая сводка',
      unit: 'Бортовой журнал',
    };
    const decision = payload.validatedDecision ?? payload.decision ?? {};
    return {
      role,
      status: 'PARTIAL',
      title: titles[role],
      narrative: role === 'procurement'
        ? `Экономический канал сохранил ${decision.reserveCredits ?? 'доступный'} резерв после проверки верфей.`
        : role === 'unit'
          ? `Корабль завершил действие в соответствии с подтверждённым результатом операции.`
          : 'Штаб передал флоту проверенные приоритеты текущего цикла.',
      rationale: decision.rationale ?? error?.message ?? 'REPORT_MODEL_UNAVAILABLE',
    };
  }

  #errorMessage(error) {
    if (error?.message === 'OLLAMA_NETWORK_OR_CORS') {
      return 'Нет связи с Ollama. Проверьте сервис, OLLAMA_ORIGINS и доступ браузера к localhost.';
    }
    if (error?.message === 'OLLAMA_TIMEOUT') return 'Ollama не ответила вовремя.';
    return `Ошибка AI: ${error?.message ?? String(error)}`;
  }
}
