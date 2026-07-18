# Контракт движка и рекомендуемые JSON-схемы

## 1. Главный принцип

LLM не может изменять координаты, кредиты, HP, владельца планеты или создавать объекты. Она возвращает только данные, которые движок принимает либо отклоняет.

## 2. Обязательные адаптеры

```js
generateLegalActionsForUnit(unit);
generateLegalPurchaseActions();
executePurchaseAction(action);
executeUnitAction(action);
getThreatenedCells(unit);
buildGlobalAiState();
buildLocalTacticalState(unit, radius);
```

## 3. Legal action

```json
{
  "id": 123,
  "type": "MOVE",
  "unitId": 7,
  "to": [4, 3],
  "targetUnitId": null,
  "planetId": null,
  "risk": 20,
  "orderFit": 85,
  "strategicValue": 65,
  "predictedResult": {
    "targetDestroyed": false,
    "selfDestroyed": false,
    "lethalNextTurn": false,
    "expectedIncomingDamage": 5,
    "colonizedPlanet": false,
    "unitRepaired": false
  },
  "strategicTags": ["REPOSITION_FOR_ATTACK"]
}
```

`actionId` должен быть уникален хотя бы в рамках текущего запроса. Перед исполнением действие обязательно перепроверяется по свежему списку.

## 4. Ответ штаба

```json
{
  "doctrine": "DENY_ENEMY_EXPANSION",
  "commanderComment": "Сорвать расширение противника и сохранить повреждённые корабли.",
  "priorities": [
    {
      "objectiveType": "DESTROY_ENEMY_COLONY_SHIP",
      "targetId": 12,
      "priority": 100,
      "reasonCode": "IMMEDIATE_EXPANSION_THREAT"
    }
  ],
  "unitRecommendations": [
    {
      "unitId": 7,
      "recommendation": "PRESSURE_ENEMY_INTERCEPTOR",
      "targetType": "UNIT",
      "targetId": 12,
      "targetCell": null,
      "priority": 85,
      "acceptableAlternatives": [
        "TAKE_ADVANTAGEOUS_POSITION",
        "RETREAT_AND_REPAIR"
      ],
      "reasonCode": "PROTECT_EXPANSION_ROUTE"
    }
  ],
  "executionOrder": [7, 5, 8, 4],
  "procurementDirective": {
    "goal": "COUNTER_FAST_INTERCEPTORS",
    "maxSpend": 35,
    "minimumReserve": 10,
    "desiredFleetChanges": {
      "COLONY_SHIP": 0,
      "ANTI_COLONY_INTERCEPTOR": 0,
      "ANTI_INTERCEPTOR_CORVETTE": 1,
      "ARMORED_GENERALIST": 0,
      "SIEGE_CAPITAL_SHIP": 0
    },
    "avoidPlanetIds": [2],
    "preferredPlanetIds": [3]
  }
}
```

## 5. Ответ юнита

```json
{
  "actionId": 16,
  "recommendationStatus": "DEFERRED_UNSAFE",
  "intentCode": "REPOSITION_FOR_NEXT_TURN",
  "reasonCode": "LETHAL_FRIGATE_COUNTERATTACK",
  "confidence": 0.87
}
```

Допустимые статусы:

- `EXECUTING`;
- `PARTIAL`;
- `DEFERRED_UNSAFE`;
- `DEFERRED_IMPOSSIBLE`;
- `REPLACED`;
- `WAITING`.

## 6. Ответ закупки

```json
{
  "purchaseActionIds": [501],
  "reserveCredits": 17,
  "reasonCode": "COUNTER_ENEMY_INTERCEPTORS",
  "explanation": "Строится корвет на безопасной планете, ремонтная планета не занята."
}
```

## 7. Фактический результат

```json
{
  "executed": true,
  "actionType": "MOVE",
  "from": [2, 3],
  "to": [3, 4],
  "targetDestroyed": false,
  "damageDealt": 0,
  "damageReceived": 0,
  "unitDestroyed": false,
  "colonizedPlanetId": null,
  "repairedHp": 0,
  "reasonCode": "SUCCESS"
}
```

## 8. Рапорт

```json
{
  "status": "PARTIAL",
  "report": "Атаку отложил: позиция прикрыта вражеским фрегатом. Занял безопасный сектор для продолжения операции."
}
```

## 9. Ремонт

Движок должен однозначно определить:

- когда ремонт происходит;
- сколько HP восстанавливается;
- занимает ли действие;
- можно ли одновременно атаковать;
- блокирует ли юнит строительство;
- ремонтируется ли юнит в начале или конце хода.

Все эти правила отражаются в `legalActions`, а не рассчитываются LLM.

## 10. События текущего хода

```json
[
  {
    "eventType": "UNIT_ACTION",
    "unitId": 7,
    "targetDestroyed": true
  },
  {
    "eventType": "COLONIZATION",
    "unitId": 9,
    "planetId": 4
  }
]
```

Хранить достаточно последние 10–20 событий текущего AI-хода.
