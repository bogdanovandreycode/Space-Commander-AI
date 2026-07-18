'use strict';

/**
 * ============================================================
 * CIV3 MULTI-AGENT AI
 * ============================================================
 *
 * Архитектура:
 *
 * 1. Headquarters Agent
 *    - видит всю карту;
 *    - знает правила всех классов;
 *    - определяет приоритеты;
 *    - формирует рекомендации кораблям;
 *    - задаёт порядок действий;
 *    - рекомендует ремонт;
 *    - формирует экономическую директиву.
 *
 * 2. Procurement Agent
 *    - видит экономику;
 *    - получает рекомендации штаба;
 *    - учитывает планеты, куда идут корабли на ремонт;
 *    - выбирает конкретные легальные покупки;
 *    - может сохранить кредиты.
 *
 * 3. Unit Agent
 *    - видит только локальную тактическую область;
 *    - получает рекомендацию штаба;
 *    - получает список легальных действий;
 *    - может выполнить, изменить или отложить рекомендацию;
 *    - не вычисляет правила самостоятельно.
 *
 * 4. Report Agent
 *    - получает фактический результат действия;
 *    - пишет короткий художественный рапорт;
 *    - не влияет на механику.
 *
 * ВАЖНО:
 * LLM никогда не меняет состояние игры напрямую.
 * Она выбирает только ID действий, рассчитанных JS-движком.
 */

/* ============================================================
 * CONFIG
 * ============================================================ */

const CIV3_AI_CONFIG = {
    ollamaChatUrl: 'http://localhost:11434/api/chat',

    headquartersModel: 'deepseek-r1:8b',
    procurementModel: 'gemma3:4b',
    unitModel: 'gemma3:4b',
    reportModel: 'gemma3:4b',

    headquartersThink: true,
    procurementThink: false,
    unitThink: false,
    reportThink: false,

    headquartersTemperature: 0.1,
    procurementTemperature: 0,
    unitTemperature: 0,
    reportTemperature: 0.55,

    headquartersNumPredict: 2400,
    procurementNumPredict: 500,
    unitNumPredict: 400,
    reportNumPredict: 180,

    headquartersContextSize: 16384,
    procurementContextSize: 8192,
    unitContextSize: 8192,
    reportContextSize: 4096,

    tacticalRadius: 4,
    requestTimeoutMs: 120000,
    keepAlive: '30m',

    reportsEnabled: true,
    fallbackEnabled: true,
    debug: true
};

/* ============================================================
 * SEMANTIC UNIT DEFINITIONS
 *
 * Значения ниже — пример. Codex должен синхронизировать их
 * с настоящими характеристиками UNIT_TYPES.
 * ============================================================ */

const AI_UNIT_DEFINITIONS = Object.freeze({
    scout: {
        semanticClass: 'COLONY_SHIP',
        compactRule: [
            'role=colonization',
            'combat=no',
            'vision=no',
            'fog=no',
            'consumed_on_colonization=yes'
        ].join(';')
    },

    fighter: {
        semanticClass: 'ANTI_COLONY_INTERCEPTOR',
        compactRule: [
            'role=anti_colony',
            'move=2',
            'dirs=8',
            'oneshot=COLONY_SHIP',
            'hp=low',
            'attack=low'
        ].join(';')
    },

    corvette: {
        semanticClass: 'ANTI_INTERCEPTOR_CORVETTE',
        compactRule: [
            'role=anti_interceptor',
            'move=1',
            'dirs=8',
            'bonus_vs=ANTI_COLONY_INTERCEPTOR',
            'hp=medium',
            'attack=medium'
        ].join(';')
    },

    frigate: {
        semanticClass: 'ARMORED_GENERALIST',
        compactRule: [
            'role=generalist',
            'move=1',
            'dirs=4',
            'diagonal=no',
            'hp=high',
            'armor=high',
            'attack=high'
        ].join(';')
    },

    dreadnought: {
        semanticClass: 'SIEGE_CAPITAL_SHIP',
        compactRule: [
            'role=siege',
            'move=1',
            'move_every=2_turns',
            'dirs=4',
            'diagonal=no',
            'hp=very_high',
            'attack=very_high',
            'bonus_vs=PLANET'
        ].join(';')
    }
});

/* ============================================================
 * STATIC PROMPT PREFIXES
 *
 * Эти строки должны оставаться одинаковыми между запросами,
 * чтобы Ollama мог повторно использовать совпадающий префикс.
 * ============================================================ */

const HEADQUARTERS_SYSTEM_PROMPT = `
You are the strategic headquarters of the RED faction in a small
fully visible turn-based grid strategy game.

The map has no fog of war and no scouting mechanic.

Your responsibilities:
1. Analyze the complete current battlefield.
2. Select priorities for this turn only.
3. Assign each RED unit a recommendation.
4. Determine the order in which RED units should act.
5. Recommend attack, defense, positioning, colonization or repair.
6. Create an economic directive for the procurement agent.

Do not plan exact routes for several future turns.
Do not command a unit to reach a distant cell after four turns.
Give objectives and recommendations relevant to the current turn.

A recommendation is not an absolute order.
A unit agent may defer or replace it if the local tactical situation
makes it suicidal, impossible or strategically inferior.

Return strict JSON only.
Do not use Markdown.
Do not invent unit IDs, planet IDs or coordinates.
`;

const PROCUREMENT_SYSTEM_PROMPT = `
You are the procurement agent of the RED faction.

Headquarters has already chosen the strategic priorities.
You do not redefine the global strategy.

Your responsibilities:
1. Choose zero or more purchaseActionIds from legalPurchases.
2. Respect maxSpend and minimumReserve.
3. Consider enemy fleet composition.
4. Consider damaged units expected to arrive at RED planets for repair.
5. Avoid blocking strategically important or repair planets.
6. Do not build a colony ship if there is no useful neutral target.
7. Saving credits is a valid decision.

Return strict JSON only.
Do not use Markdown.
Do not invent action IDs.
`;

const UNIT_SYSTEM_PROMPT = `
You control exactly one RED unit in a fully visible turn-based grid game.

Headquarters gives you a recommendation, not an unquestionable command.

You receive:
- your unit state;
- your capabilities;
- a local tactical region;
- nearby future threats;
- relevant friendly support;
- nearby planets;
- events already completed this turn;
- legalActions calculated by the game engine.

Choose exactly one actionId from legalActions.

You may:
- execute the headquarters recommendation;
- partially execute it;
- reposition for a later attack;
- retreat;
- repair;
- defend;
- wait.

You must reject or defer the recommendation when:
- it is impossible;
- it exposes the unit to an obviously lethal counterattack;
- the target has already been destroyed;
- another action is clearly better for survival and mission success.

Do not calculate movement legality or damage from memory.
Use the engine-provided legalActions and predicted outcomes.

Return strict JSON only.
Do not use Markdown.
Do not invent action IDs.
`;

const REPORT_SYSTEM_PROMPT = `
You write a short military report for one RED unit.

You receive the headquarters recommendation, the unit decision and
the actual result produced by the game engine.

Describe only what actually happened.
Do not invent damage, kills, movement or objectives.
Use one or two concise Russian sentences.

Return strict JSON only:
{
  "status": "SUCCESS|PARTIAL|DEFERRED|FAILED|WAITING",
  "report": "..."
}
`;

/* ============================================================
 * OLLAMA CLIENT
 * ============================================================ */

class OllamaClient {
    constructor(config = CIV3_AI_CONFIG) {
        this.config = config;
    }

    async chat({
        model,
        system,
        payload,
        think = false,
        temperature = 0,
        numPredict = 400,
        contextSize = 8192
    }) {
        if (!model || typeof model !== 'string') {
            throw new Error('Не указана модель Ollama.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            this.config.requestTimeoutMs
        );

        try {
            const response = await fetch(this.config.ollamaChatUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    stream: false,
                    think,
                    keep_alive: this.config.keepAlive,
                    format: 'json',
                    messages: [
                        {
                            role: 'system',
                            content: system
                        },
                        {
                            role: 'user',
                            content: JSON.stringify(payload)
                        }
                    ],
                    options: {
                        temperature,
                        num_predict: numPredict,
                        num_ctx: contextSize
                    }
                })
            });

            if (!response.ok) {
                throw new Error(
                    `Ollama HTTP ${response.status}: ${await response.text()}`
                );
            }

            const result = await response.json();
            const content = result?.message?.content;

            if (typeof content !== 'string' || !content.trim()) {
                throw new Error('Ollama вернула пустой ответ.');
            }

            return {
                data: parseModelJson(content),
                raw: result
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}

/* ============================================================
 * MAIN ORCHESTRATOR
 * ============================================================ */

class MultiAgentTurnOrchestrator {
    constructor(gameAdapter, config = CIV3_AI_CONFIG) {
        this.game = gameAdapter;
        this.config = config;
        this.ollama = new OllamaClient(config);

        this.turnEvents = [];
        this.lastHeadquartersPlan = null;
        this.lastProcurementDecision = null;
    }

    async runAiTurn() {
        this.turnEvents = [];

        this.game.setAiBusy?.(true);
        this.game.logAi?.('Штаб анализирует обстановку...');

        try {
            const headquartersPlan = await this.runHeadquarters();
            this.lastHeadquartersPlan = headquartersPlan;

            const procurementDecision = await this.runProcurement(
                headquartersPlan
            );
            this.lastProcurementDecision = procurementDecision;

            await this.executePurchases(procurementDecision);

            const activeUnits = this.game
                .getAiUnits()
                .filter(unit => !unit.moved && unit.hp > 0);

            const executionOrder = normalizeExecutionOrder(
                headquartersPlan.executionOrder,
                activeUnits,
                unit => this.game.calculateDefaultInitiative(unit)
            );

            for (const unitId of executionOrder) {
                if (this.game.isGameFinished()) break;

                const unit = this.game.getUnitById(unitId);

                if (
                    !unit ||
                    unit.owner !== this.game.AI_OWNER ||
                    unit.hp <= 0 ||
                    unit.moved
                ) {
                    continue;
                }

                await this.runUnitAgent(unit, headquartersPlan);
            }

            this.game.logAi?.(
                headquartersPlan.commanderComment ||
                'Ход флота завершён.'
            );

            return {
                headquartersPlan,
                procurementDecision,
                events: [...this.turnEvents]
            };
        } catch (error) {
            console.error('[MultiAgent AI]', error);

            if (!this.config.fallbackEnabled) {
                throw error;
            }

            this.game.logAi?.(
                `Ошибка многоагентного AI: ${humanizeError(error)}. ` +
                'Используется резервный алгоритм.'
            );

            await this.game.runFallbackAiTurn();
            return null;
        } finally {
            this.game.setAiBusy?.(false);
        }
    }

    async runHeadquarters() {
        const world = this.game.buildGlobalAiState();

        const payload = {
            protocolVersion: 1,
            faction: 'RED',
            turn: this.game.getTurnNumber(),
            map: {
                width: this.game.getMapSize(),
                height: this.game.getMapSize(),
                fullyVisible: true,
                fogOfWar: false,
                scoutingMechanic: false
            },
            compactUnitRules: buildCompactUnitRules(),
            currentWorld: world,
            operationalOptions: this.buildOperationalOptions(),
            requiredOutput: {
                doctrine: 'string',
                commanderComment: 'short Russian string',
                priorities: [
                    {
                        objectiveType: 'string',
                        targetId: 'integer|null',
                        priority: 'integer 0..100',
                        reasonCode: 'string'
                    }
                ],
                unitRecommendations: [
                    {
                        unitId: 'integer',
                        recommendation: 'string',
                        targetType: 'UNIT|PLANET|CELL|NONE',
                        targetId: 'integer|null',
                        targetCell: '[x,y]|null',
                        priority: 'integer 0..100',
                        acceptableAlternatives: ['string'],
                        reasonCode: 'string'
                    }
                ],
                executionOrder: ['integer unit IDs'],
                procurementDirective: {
                    goal: 'string',
                    maxSpend: 'integer',
                    minimumReserve: 'integer',
                    desiredFleetChanges: {
                        COLONY_SHIP: 'integer',
                        ANTI_COLONY_INTERCEPTOR: 'integer',
                        ANTI_INTERCEPTOR_CORVETTE: 'integer',
                        ARMORED_GENERALIST: 'integer',
                        SIEGE_CAPITAL_SHIP: 'integer'
                    },
                    avoidPlanetIds: ['integer'],
                    preferredPlanetIds: ['integer']
                }
            }
        };

        const response = await this.ollama.chat({
            model: this.config.headquartersModel,
            system: HEADQUARTERS_SYSTEM_PROMPT,
            payload,
            think: this.config.headquartersThink,
            temperature: this.config.headquartersTemperature,
            numPredict: this.config.headquartersNumPredict,
            contextSize: this.config.headquartersContextSize
        });

        return validateAndNormalizeHeadquartersPlan(
            response.data,
            this.game.getAiUnits(),
            this.game.getPlanets(),
            this.game.getAiCredits()
        );
    }

    buildOperationalOptions() {
        return this.game.getAiUnits().map(unit => {
            const legalActions = this.game.generateLegalActionsForUnit(unit);

            return {
                unitId: unit.id,
                class: getSemanticClass(unit.type),
                hp: unit.hp,
                maxHp: this.game.getUnitMaxHp(unit),
                position: [unit.x, unit.y],
                reachableObjectives: summarizeOperationalOptions(
                    legalActions
                )
            };
        });
    }

    async runProcurement(headquartersPlan) {
        const legalPurchases = this.game.generateLegalPurchaseActions();

        if (legalPurchases.length === 0) {
            return {
                purchaseActionIds: [],
                reserveCredits: this.game.getAiCredits(),
                reasonCode: 'NO_LEGAL_PURCHASES'
            };
        }

        const repairIntentions = headquartersPlan.unitRecommendations
            .filter(item =>
                item.recommendation === 'RETREAT_AND_REPAIR' ||
                item.recommendation === 'REPAIR' ||
                item.acceptableAlternatives?.includes('RETREAT_AND_REPAIR')
            )
            .map(item => ({
                unitId: item.unitId,
                planetId:
                    item.targetType === 'PLANET'
                        ? item.targetId
                        : null
            }));

        const payload = {
            protocolVersion: 1,
            faction: 'RED',
            credits: this.game.getAiCredits(),
            incomeNextTurn: this.game.getEstimatedAiIncome(),
            fleetComposition: this.game.getFleetComposition(),
            planets: this.game.buildProcurementPlanetState(),
            repairIntentions,
            headquartersDirective:
                headquartersPlan.procurementDirective,
            legalPurchases,
            requiredOutput: {
                purchaseActionIds: ['integer'],
                reserveCredits: 'integer',
                reasonCode: 'string',
                explanation: 'short Russian string'
            }
        };

        try {
            const response = await this.ollama.chat({
                model: this.config.procurementModel,
                system: PROCUREMENT_SYSTEM_PROMPT,
                payload,
                think: this.config.procurementThink,
                temperature: this.config.procurementTemperature,
                numPredict: this.config.procurementNumPredict,
                contextSize: this.config.procurementContextSize
            });

            return validateProcurementDecision(
                response.data,
                legalPurchases,
                this.game.getAiCredits(),
                headquartersPlan.procurementDirective
            );
        } catch (error) {
            console.warn('[Procurement Agent]', error);

            return {
                purchaseActionIds: [],
                reserveCredits: this.game.getAiCredits(),
                reasonCode: 'AGENT_ERROR_SAVE_CREDITS',
                explanation: 'Закупка отменена из-за ошибки агента.'
            };
        }
    }

    async executePurchases(procurementDecision) {
        for (const actionId of procurementDecision.purchaseActionIds) {
            if (this.game.isGameFinished()) break;

            const legalPurchases =
                this.game.generateLegalPurchaseActions();

            const action = legalPurchases.find(
                candidate => candidate.id === actionId
            );

            if (!action) continue;

            const result = this.game.executePurchaseAction(action);

            const event = {
                eventType: 'PURCHASE',
                actionId,
                executed: Boolean(result?.executed),
                result
            };

            this.turnEvents.push(event);
            this.game.afterAiEvent?.(event);
        }
    }

    async runUnitAgent(unit, headquartersPlan) {
        const recommendation =
            headquartersPlan.unitRecommendations.find(
                item => item.unitId === unit.id
            ) || createDefaultRecommendation(unit);

        const legalActions =
            this.game.generateLegalActionsForUnit(unit);

        if (legalActions.length === 0) {
            unit.moved = true;

            const event = {
                eventType: 'UNIT_NO_ACTION',
                unitId: unit.id,
                executed: false,
                reasonCode: 'NO_LEGAL_ACTIONS'
            };

            this.turnEvents.push(event);
            return;
        }

        const tacticalState = this.game.buildLocalTacticalState(
            unit,
            this.config.tacticalRadius
        );

        const payload = {
            protocolVersion: 1,
            faction: 'RED',
            turn: this.game.getTurnNumber(),

            identity: {
                unitId: unit.id,
                semanticClass: getSemanticClass(unit.type),
                typeKey: unit.type,
                position: [unit.x, unit.y],
                hp: unit.hp,
                maxHp: this.game.getUnitMaxHp(unit),
                healthState: getHealthState(
                    unit.hp,
                    this.game.getUnitMaxHp(unit)
                )
            },

            capabilities: {
                compactRule:
                    AI_UNIT_DEFINITIONS[unit.type]?.compactRule || '',
                canRepairOnFriendlyPlanet: true
            },

            headquartersRecommendation: recommendation,

            localTacticalState: tacticalState,

            eventsEarlierThisTurn:
                this.turnEvents.slice(-20),

            legalActions,

            requiredOutput: {
                actionId: 'integer',
                recommendationStatus:
                    'EXECUTING|PARTIAL|DEFERRED_UNSAFE|' +
                    'DEFERRED_IMPOSSIBLE|REPLACED|WAITING',
                intentCode: 'string',
                reasonCode: 'string',
                confidence: 'number 0..1'
            }
        };

        let decision;

        try {
            const response = await this.ollama.chat({
                model: this.config.unitModel,
                system: UNIT_SYSTEM_PROMPT,
                payload,
                think: this.config.unitThink,
                temperature: this.config.unitTemperature,
                numPredict: this.config.unitNumPredict,
                contextSize: this.config.unitContextSize
            });

            decision = validateUnitDecision(
                response.data,
                legalActions
            );
        } catch (error) {
            console.warn(
                `[Unit Agent ${unit.id}]`,
                error
            );

            decision = chooseFallbackUnitDecision(
                legalActions,
                recommendation
            );
        }

        const currentUnit = this.game.getUnitById(unit.id);

        if (!currentUnit || currentUnit.hp <= 0 || currentUnit.moved) {
            return;
        }

        const refreshedActions =
            this.game.generateLegalActionsForUnit(currentUnit);

        let selectedAction = refreshedActions.find(
            action => action.id === decision.actionId
        );

        if (!selectedAction) {
            const fallback = chooseFallbackUnitDecision(
                refreshedActions,
                recommendation
            );

            selectedAction = refreshedActions.find(
                action => action.id === fallback.actionId
            );

            decision = fallback;
        }

        if (!selectedAction) {
            currentUnit.moved = true;
            return;
        }

        const actualResult =
            this.game.executeUnitAction(selectedAction);

        const event = {
            eventType: 'UNIT_ACTION',
            unitId: currentUnit.id,
            unitClass: getSemanticClass(currentUnit.type),
            headquartersRecommendation: recommendation,
            decision,
            selectedAction: compactActionForLog(selectedAction),
            actualResult
        };

        this.turnEvents.push(event);
        this.game.afterAiEvent?.(event);

        if (this.config.reportsEnabled) {
            await this.generateUnitReport(
                currentUnit,
                event
            );
        }
    }

    async generateUnitReport(unit, event) {
        const payload = {
            unit: {
                unitId: unit.id,
                callsign: this.game.getUnitCallsign?.(unit) ||
                    `${getSemanticClass(unit.type)}-${unit.id}`,
                class: getSemanticClass(unit.type)
            },
            headquartersRecommendation:
                event.headquartersRecommendation,
            decision: event.decision,
            actualResult: event.actualResult
        };

        try {
            const response = await this.ollama.chat({
                model: this.config.reportModel,
                system: REPORT_SYSTEM_PROMPT,
                payload,
                think: this.config.reportThink,
                temperature: this.config.reportTemperature,
                numPredict: this.config.reportNumPredict,
                contextSize: this.config.reportContextSize
            });

            const report = validateReport(response.data);

            this.game.saveUnitReport?.(unit.id, {
                turn: this.game.getTurnNumber(),
                ...report,
                order: event.headquartersRecommendation,
                result: event.actualResult
            });

            this.game.showUnitReport?.(unit.id, report);
        } catch (error) {
            console.warn(
                `[Report Agent ${unit.id}]`,
                error
            );
        }
    }
}

/* ============================================================
 * LOCAL TACTICAL STATE HELPERS
 * ============================================================ */

/**
 * Этот helper может использоваться GameAdapter.
 *
 * В локальную область рекомендуется включать:
 * - объекты в tacticalRadius;
 * - врагов, которые могут атаковать юнита на следующем ходу;
 * - союзников, которые могут поддержать;
 * - ближайшие дружественные планеты для ремонта;
 * - клетки, доступные текущему юниту;
 * - угрозы для каждой легальной позиции.
 */
function buildLocalTacticalStateGeneric({
    unit,
    units,
    planets,
    tacticalRadius,
    getThreatenedCells,
    getUnitMaxHp
}) {
    const inRadius = object =>
        chebyshevDistance(unit, object) <= tacticalRadius;

    const nearbyFriendlyUnits = units
        .filter(other =>
            other.id !== unit.id &&
            other.owner === unit.owner &&
            inRadius(other)
        )
        .map(compactUnit);

    const nearbyEnemyUnits = units
        .filter(other =>
            other.owner !== unit.owner &&
            other.owner !== -1 &&
            (
                inRadius(other) ||
                getThreatenedCells(other).some(cell =>
                    cell.x === unit.x && cell.y === unit.y
                )
            )
        )
        .map(enemy => ({
            ...compactUnit(enemy),
            canThreatenCurrentUnitNextTurn:
                getThreatenedCells(enemy).some(cell =>
                    cell.x === unit.x && cell.y === unit.y
                )
        }));

    const nearbyPlanets = planets
        .filter(planet => inRadius(planet))
        .map(compactPlanet);

    const friendlyRepairPlanets = planets
        .filter(planet => planet.owner === unit.owner)
        .map(planet => ({
            ...compactPlanet(planet),
            distance: manhattanDistance(unit, planet),
            occupied: units.some(other =>
                other.x === planet.x &&
                other.y === planet.y &&
                other.id !== unit.id
            )
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);

    return {
        radius: tacticalRadius,
        currentUnitHealth: {
            hp: unit.hp,
            maxHp: getUnitMaxHp(unit),
            state: getHealthState(
                unit.hp,
                getUnitMaxHp(unit)
            )
        },
        nearbyFriendlyUnits,
        nearbyEnemyUnits,
        nearbyPlanets,
        friendlyRepairPlanets
    };
}

/* ============================================================
 * VALIDATION
 * ============================================================ */

function validateAndNormalizeHeadquartersPlan(
    value,
    aiUnits,
    planets,
    credits
) {
    if (!value || typeof value !== 'object') {
        throw new Error('Штаб вернул неверную структуру.');
    }

    const validUnitIds = new Set(
        aiUnits.map(unit => unit.id)
    );

    const validPlanetIds = new Set(
        planets.map(planet => planet.id)
    );

    const recommendations = Array.isArray(
        value.unitRecommendations
    )
        ? value.unitRecommendations
        : [];

    const unitRecommendations = recommendations
        .filter(item =>
            item &&
            Number.isInteger(item.unitId) &&
            validUnitIds.has(item.unitId)
        )
        .map(item => ({
            unitId: item.unitId,
            recommendation:
                sanitizeCode(item.recommendation) || 'HOLD',
            targetType: [
                'UNIT',
                'PLANET',
                'CELL',
                'NONE'
            ].includes(item.targetType)
                ? item.targetType
                : 'NONE',
            targetId:
                Number.isInteger(item.targetId)
                    ? item.targetId
                    : null,
            targetCell:
                isCoordinate(item.targetCell)
                    ? item.targetCell
                    : null,
            priority: clampNumber(item.priority, 0, 100, 50),
            acceptableAlternatives:
                Array.isArray(item.acceptableAlternatives)
                    ? item.acceptableAlternatives
                        .map(sanitizeCode)
                        .filter(Boolean)
                        .slice(0, 6)
                    : [],
            reasonCode:
                sanitizeCode(item.reasonCode) ||
                'UNSPECIFIED'
        }));

    for (const unit of aiUnits) {
        if (!unitRecommendations.some(
            item => item.unitId === unit.id
        )) {
            unitRecommendations.push(
                createDefaultRecommendation(unit)
            );
        }
    }

    const rawOrder = Array.isArray(value.executionOrder)
        ? value.executionOrder
        : [];

    const executionOrder = rawOrder.filter(
        id => Number.isInteger(id) && validUnitIds.has(id)
    );

    const rawDirective =
        value.procurementDirective &&
        typeof value.procurementDirective === 'object'
            ? value.procurementDirective
            : {};

    return {
        doctrine:
            sanitizeCode(value.doctrine) ||
            'BALANCED_OPERATIONS',

        commanderComment:
            sanitizeText(value.commanderComment, 300) ||
            'Флоту назначены цели на текущий ход.',

        priorities:
            Array.isArray(value.priorities)
                ? value.priorities.slice(0, 12).map(item => ({
                    objectiveType:
                        sanitizeCode(item?.objectiveType) ||
                        'UNSPECIFIED',
                    targetId:
                        Number.isInteger(item?.targetId)
                            ? item.targetId
                            : null,
                    priority:
                        clampNumber(
                            item?.priority,
                            0,
                            100,
                            50
                        ),
                    reasonCode:
                        sanitizeCode(item?.reasonCode) ||
                        'UNSPECIFIED'
                }))
                : [],

        unitRecommendations,

        executionOrder,

        procurementDirective: {
            goal:
                sanitizeCode(rawDirective.goal) ||
                'MAINTAIN_BALANCE',

            maxSpend:
                clampNumber(
                    rawDirective.maxSpend,
                    0,
                    credits,
                    credits
                ),

            minimumReserve:
                clampNumber(
                    rawDirective.minimumReserve,
                    0,
                    credits,
                    0
                ),

            desiredFleetChanges:
                normalizeDesiredFleetChanges(
                    rawDirective.desiredFleetChanges
                ),

            avoidPlanetIds:
                normalizeIdList(
                    rawDirective.avoidPlanetIds,
                    validPlanetIds
                ),

            preferredPlanetIds:
                normalizeIdList(
                    rawDirective.preferredPlanetIds,
                    validPlanetIds
                )
        }
    };
}

function validateProcurementDecision(
    value,
    legalPurchases,
    credits,
    directive
) {
    if (!value || typeof value !== 'object') {
        throw new Error(
            'Агент закупок вернул неверную структуру.'
        );
    }

    const legalById = new Map(
        legalPurchases.map(action => [action.id, action])
    );

    const requestedIds = Array.isArray(
        value.purchaseActionIds
    )
        ? value.purchaseActionIds
        : [];

    const purchaseActionIds = [];
    const usedPlanets = new Set();

    let spent = 0;

    for (const id of requestedIds) {
        if (!Number.isInteger(id)) continue;

        const action = legalById.get(id);
        if (!action) continue;

        const planetId = action.planetId ?? null;
        const cost = Number(action.cost) || 0;

        if (planetId !== null && usedPlanets.has(planetId)) {
            continue;
        }

        if (spent + cost > directive.maxSpend) {
            continue;
        }

        if (
            credits - spent - cost <
            directive.minimumReserve
        ) {
            continue;
        }

        purchaseActionIds.push(id);
        spent += cost;

        if (planetId !== null) {
            usedPlanets.add(planetId);
        }
    }

    return {
        purchaseActionIds,
        reserveCredits: Math.max(0, credits - spent),
        reasonCode:
            sanitizeCode(value.reasonCode) ||
            'VALIDATED',
        explanation:
            sanitizeText(value.explanation, 240)
    };
}

function validateUnitDecision(value, legalActions) {
    if (!value || typeof value !== 'object') {
        throw new Error(
            'Агент корабля вернул неверную структуру.'
        );
    }

    const legalIds = new Set(
        legalActions.map(action => action.id)
    );

    if (
        !Number.isInteger(value.actionId) ||
        !legalIds.has(value.actionId)
    ) {
        throw new Error(
            'Агент корабля выбрал недопустимый actionId.'
        );
    }

    const allowedStatuses = new Set([
        'EXECUTING',
        'PARTIAL',
        'DEFERRED_UNSAFE',
        'DEFERRED_IMPOSSIBLE',
        'REPLACED',
        'WAITING'
    ]);

    return {
        actionId: value.actionId,
        recommendationStatus:
            allowedStatuses.has(value.recommendationStatus)
                ? value.recommendationStatus
                : 'REPLACED',
        intentCode:
            sanitizeCode(value.intentCode) ||
            'UNSPECIFIED',
        reasonCode:
            sanitizeCode(value.reasonCode) ||
            'UNSPECIFIED',
        confidence:
            clampNumber(value.confidence, 0, 1, 0.5)
    };
}

function validateReport(value) {
    if (!value || typeof value !== 'object') {
        throw new Error('Неверный формат рапорта.');
    }

    const allowedStatuses = new Set([
        'SUCCESS',
        'PARTIAL',
        'DEFERRED',
        'FAILED',
        'WAITING'
    ]);

    return {
        status:
            allowedStatuses.has(value.status)
                ? value.status
                : 'PARTIAL',
        report:
            sanitizeText(
                value.report ||
                'Действие завершено.',
                360
            )
    };
}

/* ============================================================
 * FALLBACK DECISIONS
 * ============================================================ */

function chooseFallbackUnitDecision(
    legalActions,
    recommendation
) {
    if (!Array.isArray(legalActions) || legalActions.length === 0) {
        return {
            actionId: null,
            recommendationStatus: 'WAITING',
            intentCode: 'NO_ACTION',
            reasonCode: 'NO_LEGAL_ACTIONS',
            confidence: 1
        };
    }

    const scored = legalActions.map(action => {
        let score = 0;

        score += Number(action.orderFit) || 0;
        score += Number(action.strategicValue) || 0;

        const risk = Number(action.risk) || 0;
        score -= risk;

        if (action.predictedResult?.targetDestroyed) {
            score += 100;
        }

        if (action.predictedResult?.colonizedPlanet) {
            score += 120;
        }

        if (action.predictedResult?.unitRepaired) {
            score += 50;
        }

        if (action.predictedResult?.selfDestroyed) {
            score -= 500;
        }

        if (action.predictedResult?.lethalNextTurn) {
            score -= 250;
        }

        if (
            recommendation?.targetId !== null &&
            (
                action.targetUnitId === recommendation.targetId ||
                action.planetId === recommendation.targetId
            )
        ) {
            score += recommendation.priority || 50;
        }

        return { action, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
        actionId: scored[0].action.id,
        recommendationStatus: 'REPLACED',
        intentCode: 'FALLBACK_BEST_SCORE',
        reasonCode: 'MODEL_ERROR_OR_INVALID_RESPONSE',
        confidence: 0.4
    };
}

/* ============================================================
 * EXECUTION ORDER
 * ============================================================ */

function normalizeExecutionOrder(
    requestedOrder,
    units,
    calculateInitiative
) {
    const validIds = new Set(
        units.map(unit => unit.id)
    );

    const result = [];
    const used = new Set();

    for (const id of requestedOrder || []) {
        if (
            Number.isInteger(id) &&
            validIds.has(id) &&
            !used.has(id)
        ) {
            result.push(id);
            used.add(id);
        }
    }

    const omitted = units
        .filter(unit => !used.has(unit.id))
        .sort(
            (a, b) =>
                calculateInitiative(b) -
                calculateInitiative(a)
        );

    result.push(...omitted.map(unit => unit.id));

    return result;
}

/* ============================================================
 * PROMPT DATA HELPERS
 * ============================================================ */

function buildCompactUnitRules() {
    return Object.entries(AI_UNIT_DEFINITIONS).map(
        ([typeKey, definition]) => ({
            typeKey,
            semanticClass: definition.semanticClass,
            rule: definition.compactRule
        })
    );
}

function summarizeOperationalOptions(actions) {
    const options = [];

    for (const action of actions) {
        if (!action || typeof action !== 'object') continue;

        options.push({
            actionType: action.type,
            targetUnitId:
                Number.isInteger(action.targetUnitId)
                    ? action.targetUnitId
                    : null,
            planetId:
                Number.isInteger(action.planetId)
                    ? action.planetId
                    : null,
            targetCell:
                isCoordinate(action.to)
                    ? action.to
                    : isCoordinate([action.x, action.y])
                        ? [action.x, action.y]
                        : null,
            turnsEstimated:
                Number.isFinite(action.turnsEstimated)
                    ? action.turnsEstimated
                    : action.type === 'WAIT'
                        ? 0
                        : 1,
            strategicTags:
                Array.isArray(action.strategicTags)
                    ? action.strategicTags.slice(0, 6)
                    : []
        });
    }

    return options.slice(0, 40);
}

function createDefaultRecommendation(unit) {
    return {
        unitId: unit.id,
        recommendation:
            unit.type === 'scout'
                ? 'COLONIZE_NEAREST_USEFUL_PLANET'
                : 'IMPROVE_TACTICAL_POSITION',
        targetType: 'NONE',
        targetId: null,
        targetCell: null,
        priority: 40,
        acceptableAlternatives: [
            'DEFEND',
            'RETREAT_AND_REPAIR',
            'WAIT'
        ],
        reasonCode: 'HEADQUARTERS_NO_SPECIFIC_ORDER'
    };
}

function normalizeDesiredFleetChanges(value) {
    const source =
        value && typeof value === 'object'
            ? value
            : {};

    const result = {};

    for (const className of [
        'COLONY_SHIP',
        'ANTI_COLONY_INTERCEPTOR',
        'ANTI_INTERCEPTOR_CORVETTE',
        'ARMORED_GENERALIST',
        'SIEGE_CAPITAL_SHIP'
    ]) {
        result[className] = clampNumber(
            source[className],
            -10,
            10,
            0
        );
    }

    return result;
}

function normalizeIdList(value, validIds) {
    if (!Array.isArray(value)) return [];

    const result = [];
    const used = new Set();

    for (const id of value) {
        if (
            Number.isInteger(id) &&
            validIds.has(id) &&
            !used.has(id)
        ) {
            result.push(id);
            used.add(id);
        }
    }

    return result;
}

/* ============================================================
 * GENERIC GAME ADAPTER
 *
 * Codex должен заменить тело методов на вызовы существующего
 * civ3.js либо подстроить названия полей.
 * ============================================================ */

class Civ3GameAdapter {
    constructor(game) {
        this.game = game;

        this.AI_OWNER =
            game.AI_OWNER ?? 1;

        this.PLAYER_OWNER =
            game.PLAYER_OWNER ?? 0;

        this.NEUTRAL_OWNER =
            game.NEUTRAL_OWNER ?? -1;
    }

    getTurnNumber() {
        return this.game.turnNumber;
    }

    getMapSize() {
        return this.game.mapSize;
    }

    getPlanets() {
        return this.game.planets;
    }

    getAiUnits() {
        return this.game.units.filter(
            unit => unit.owner === this.AI_OWNER
        );
    }

    getPlayerUnits() {
        return this.game.units.filter(
            unit => unit.owner === this.PLAYER_OWNER
        );
    }

    getUnitById(unitId) {
        return this.game.units.find(
            unit => unit.id === unitId
        ) || null;
    }

    getAiCredits() {
        return this.game.gold[this.AI_OWNER];
    }

    getEstimatedAiIncome() {
        return this.game.planets.filter(
            planet => planet.owner === this.AI_OWNER
        ).length * 10;
    }

    getUnitMaxHp(unit) {
        return this.game.UNIT_TYPES[unit.type].hp;
    }

    isGameFinished() {
        return Boolean(this.game.gameFinished);
    }

    setAiBusy(isBusy) {
        if (this.game.endTurnBtn) {
            this.game.endTurnBtn.disabled = isBusy;
        }
    }

    logAi(message) {
        this.game.addChatMessage?.(message);
    }

    afterAiEvent() {
        this.game.cleanUpAndCheckVictory?.();
        this.game.draw?.();
    }

    buildGlobalAiState() {
        return {
            credits: this.getAiCredits(),

            redUnits: this.getAiUnits().map(compactUnit),

            blueUnits:
                this.getPlayerUnits().map(compactUnit),

            redPlanets:
                this.game.planets
                    .filter(
                        planet =>
                            planet.owner === this.AI_OWNER
                    )
                    .map(compactPlanet),

            bluePlanets:
                this.game.planets
                    .filter(
                        planet =>
                            planet.owner === this.PLAYER_OWNER
                    )
                    .map(compactPlanet),

            neutralPlanets:
                this.game.planets
                    .filter(
                        planet =>
                            planet.owner === this.NEUTRAL_OWNER
                    )
                    .map(compactPlanet)
        };
    }

    getFleetComposition() {
        const countByOwner = owner => {
            const result = {};

            for (const unit of this.game.units) {
                if (unit.owner !== owner) continue;

                const semanticClass =
                    getSemanticClass(unit.type);

                result[semanticClass] =
                    (result[semanticClass] || 0) + 1;
            }

            return result;
        };

        return {
            red: countByOwner(this.AI_OWNER),
            blue: countByOwner(this.PLAYER_OWNER)
        };
    }

    buildProcurementPlanetState() {
        return this.game.planets
            .filter(
                planet =>
                    planet.owner === this.AI_OWNER
            )
            .map(planet => ({
                ...compactPlanet(planet),

                occupied:
                    this.game.units.some(
                        unit =>
                            unit.x === planet.x &&
                            unit.y === planet.y
                    ),

                nearbyEnemyCount:
                    this.game.units.filter(
                        unit =>
                            unit.owner ===
                                this.PLAYER_OWNER &&
                            chebyshevDistance(
                                unit,
                                planet
                            ) <= 2
                    ).length,

                nearbyFriendlyCount:
                    this.game.units.filter(
                        unit =>
                            unit.owner ===
                                this.AI_OWNER &&
                            chebyshevDistance(
                                unit,
                                planet
                            ) <= 2
                    ).length
            }));
    }

    buildLocalTacticalState(unit, radius) {
        return buildLocalTacticalStateGeneric({
            unit,
            units: this.game.units,
            planets: this.game.planets,
            tacticalRadius: radius,

            getThreatenedCells:
                enemy =>
                    this.getThreatenedCells(enemy),

            getUnitMaxHp:
                current =>
                    this.getUnitMaxHp(current)
        });
    }

    getThreatenedCells(unit) {
        /**
         * TODO CODEX:
         *
         * Заменить на настоящий расчёт клеток,
         * которые юнит может атаковать на следующем ходу.
         *
         * Важно учитывать:
         * - дальность движения;
         * - диагонали;
         * - кулдаун;
         * - тип атаки;
         * - препятствия;
         * - специальные способности.
         */

        const result = [];

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (Math.abs(dx) + Math.abs(dy) !== 1) {
                    continue;
                }

                result.push({
                    x: unit.x + dx,
                    y: unit.y + dy
                });
            }
        }

        return result;
    }

    generateLegalActionsForUnit(unit) {
        /**
         * TODO CODEX:
         *
         * Подключить существующий генератор действий.
         *
         * Каждое действие желательно привести к форме:
         *
         * {
         *   id: 123,
         *   type: "MOVE|ATTACK_UNIT|ATTACK_PLANET|
         *          COLONIZE|REPAIR|WAIT",
         *   unitId: 7,
         *   to: [x, y],
         *   targetUnitId: 11,
         *   planetId: 3,
         *
         *   risk: 0..100,
         *   orderFit: 0..100,
         *   strategicValue: 0..100,
         *
         *   predictedResult: {
         *      targetDestroyed: false,
         *      selfDestroyed: false,
         *      lethalNextTurn: false,
         *      expectedIncomingDamage: 0,
         *      colonizedPlanet: false,
         *      unitRepaired: false
         *   },
         *
         *   strategicTags: [
         *      "INTERCEPT_COLONY_SHIP",
         *      "RETURN_TO_REPAIR"
         *   ]
         * }
         */

        return this.game.generateLegalActionsForUnit(unit);
    }

    generateLegalPurchaseActions() {
        /**
         * TODO CODEX:
         *
         * Вернуть все допустимые покупки:
         *
         * {
         *   id: 501,
         *   type: "BUILD",
         *   planetId: 3,
         *   unitType: "corvette",
         *   semanticClass: "ANTI_INTERCEPTOR_CORVETTE",
         *   cost: 25,
         *   strategicTags: [...]
         * }
         */

        return this.game.generateLegalPurchaseActions();
    }

    executePurchaseAction(action) {
        /**
         * TODO CODEX:
         *
         * Проверить покупку ещё раз и только затем
         * изменить золото и создать юнит.
         */

        return this.game.executePurchaseAction(action);
    }

    executeUnitAction(action) {
        /**
         * TODO CODEX:
         *
         * Ещё раз проверить действие после ответа LLM,
         * потому что предыдущие корабли могли изменить карту.
         *
         * Вернуть фактический результат:
         *
         * {
         *   executed: true,
         *   actionType: "ATTACK_UNIT",
         *   from: [2, 3],
         *   to: [3, 3],
         *   targetDestroyed: true,
         *   damageDealt: 10,
         *   damageReceived: 0,
         *   unitDestroyed: false,
         *   colonizedPlanetId: null,
         *   repairedHp: 0,
         *   reasonCode: "SUCCESS"
         * }
         */

        return this.game.executeUnitAction(action);
    }

    calculateDefaultInitiative(unit) {
        const legalActions =
            this.generateLegalActionsForUnit(unit);

        const immediateKill =
            legalActions.some(
                action =>
                    action.predictedResult
                        ?.targetDestroyed
            )
                ? 1
                : 0;

        const immediateColonization =
            legalActions.some(
                action =>
                    action.predictedResult
                        ?.colonizedPlanet
            )
                ? 1
                : 0;

        const repair =
            legalActions.some(
                action =>
                    action.predictedResult
                        ?.unitRepaired
            )
                ? 1
                : 0;

        return (
            immediateKill * 1000 +
            immediateColonization * 900 +
            repair * 700 +
            getUnitMovementRange(unit.type) * 10
        );
    }

    saveUnitReport(unitId, report) {
        const unit = this.getUnitById(unitId);

        if (!unit) return;

        unit.aiMemory ||= {
            callsign:
                `${getSemanticClass(unit.type)}-${unit.id}`,
            reports: [],
            missionsCompleted: 0,
            kills: 0
        };

        unit.aiMemory.reports.push(report);

        if (unit.aiMemory.reports.length > 30) {
            unit.aiMemory.reports.shift();
        }

        if (report.status === 'SUCCESS') {
            unit.aiMemory.missionsCompleted++;
        }
    }

    getUnitCallsign(unit) {
        return (
            unit.aiMemory?.callsign ||
            `${getSemanticClass(unit.type)}-${unit.id}`
        );
    }

    showUnitReport(unitId, report) {
        if (CIV3_AI_CONFIG.debug) {
            console.log(
                `[Рапорт юнита ${unitId}]`,
                report
            );
        }
    }

    async runFallbackAiTurn() {
        return this.game.runClassicAiTurn();
    }
}

/* ============================================================
 * SMALL HELPERS
 * ============================================================ */

function getSemanticClass(type) {
    return (
        AI_UNIT_DEFINITIONS[type]?.semanticClass ||
        String(type).toUpperCase()
    );
}

function getUnitMovementRange(type) {
    switch (type) {
        case 'fighter':
            return 2;

        case 'scout':
        case 'corvette':
        case 'frigate':
        case 'dreadnought':
        default:
            return 1;
    }
}

function compactUnit(unit) {
    return {
        id: unit.id,
        class: getSemanticClass(unit.type),
        x: unit.x,
        y: unit.y,
        hp: unit.hp,
        moved: Boolean(unit.moved)
    };
}

function compactPlanet(planet) {
    return {
        id: planet.id,
        x: planet.x,
        y: planet.y,
        hp: planet.hp,
        owner:
            planet.owner === 1
                ? 'RED'
                : planet.owner === 0
                    ? 'BLUE'
                    : 'GRAY'
    };
}

function compactActionForLog(action) {
    return {
        id: action.id,
        type: action.type,
        unitId: action.unitId ?? null,
        targetUnitId: action.targetUnitId ?? null,
        planetId: action.planetId ?? null,
        to: action.to ?? null
    };
}

function getHealthState(hp, maxHp) {
    if (!Number.isFinite(maxHp) || maxHp <= 0) {
        return 'UNKNOWN';
    }

    const ratio = hp / maxHp;

    if (ratio <= 0.25) return 'CRITICAL';
    if (ratio <= 0.5) return 'DAMAGED';
    if (ratio < 1) return 'GOOD';
    return 'FULL';
}

function manhattanDistance(a, b) {
    return (
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y)
    );
}

function chebyshevDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y)
    );
}

function isCoordinate(value) {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        Number.isInteger(value[0]) &&
        Number.isInteger(value[1])
    );
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.max(
        min,
        Math.min(max, number)
    );
}

function sanitizeCode(value) {
    if (typeof value !== 'string') return '';

    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_:-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 100);
}

function sanitizeText(value, maxLength = 300) {
    if (typeof value !== 'string') return '';

    return value
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function parseModelJson(content) {
    const trimmed = String(content).trim();

    try {
        return JSON.parse(trimmed);
    } catch {
        const fenced = trimmed.match(
            /```(?:json)?\s*([\s\S]*?)```/i
        )?.[1];

        if (fenced) {
            return JSON.parse(fenced.trim());
        }

        const firstObject = trimmed.indexOf('{');
        const lastObject = trimmed.lastIndexOf('}');

        if (
            firstObject !== -1 &&
            lastObject > firstObject
        ) {
            return JSON.parse(
                trimmed.slice(
                    firstObject,
                    lastObject + 1
                )
            );
        }

        throw new Error(
            'Ответ модели не содержит допустимый JSON.'
        );
    }
}

function humanizeError(error) {
    if (error?.name === 'AbortError') {
        return 'истекло время ожидания ответа';
    }

    const message =
        error?.message || String(error);

    if (/Failed to fetch/i.test(message)) {
        return (
            'браузер не смог обратиться к Ollama; ' +
            'проверь запуск сервера и OLLAMA_ORIGINS'
        );
    }

    return message.slice(0, 240);
}

/* ============================================================
 * INTEGRATION EXAMPLE
 * ============================================================ */

/**
 * Codex должен создать объект gameApi, который ссылается
 * на существующее состояние и функции civ3.js.
 *
 * Пример:
 *
 * const gameApi = {
 *     AI_OWNER,
 *     PLAYER_OWNER,
 *     NEUTRAL_OWNER,
 *
 *     get turnNumber() {
 *         return turnNumber;
 *     },
 *
 *     get mapSize() {
 *         return mapSize;
 *     },
 *
 *     get planets() {
 *         return planets;
 *     },
 *
 *     get units() {
 *         return units;
 *     },
 *
 *     get gold() {
 *         return gold;
 *     },
 *
 *     UNIT_TYPES,
 *     endTurnBtn,
 *
 *     addChatMessage,
 *     cleanUpAndCheckVictory,
 *     draw,
 *     runClassicAiTurn,
 *
 *     generateLegalActionsForUnit,
 *     generateLegalPurchaseActions,
 *     executePurchaseAction,
 *     executeUnitAction
 * };
 *
 * const multiAgentAi = new MultiAgentTurnOrchestrator(
 *     new Civ3GameAdapter(gameApi)
 * );
 *
 * В функции AI-хода:
 *
 * await multiAgentAi.runAiTurn();
 */

/* ============================================================
 * OPTIONAL GLOBAL EXPORT
 * ============================================================ */

window.CIV3_AI_CONFIG = CIV3_AI_CONFIG;
window.MultiAgentTurnOrchestrator =
    MultiAgentTurnOrchestrator;
window.Civ3GameAdapter = Civ3GameAdapter;