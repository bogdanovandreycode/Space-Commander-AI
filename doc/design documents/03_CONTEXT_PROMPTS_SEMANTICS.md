# Контекст, промпты и семантика

## 1. Полную историю не хранить

Игра полностью описывается текущим состоянием:

- позиции;
- HP;
- владельцы планет;
- кредиты;
- кулдауны;
- возможность хода;
- легальные действия.

Через 500 ходов контекст не должен быть больше, чем в пиковом состоянии на 20-м ходу.

Передавать можно события текущего AI-хода и необязательную короткую статистику конкретного юнита. Полная переписка не нужна.

## 2. Статический и динамический блок

```text
СТАТИЧЕСКИЙ ПРЕФИКС
- роль агента;
- неизменяемые правила;
- формат ответа;
- общие ограничения.

ДИНАМИЧЕСКИЙ БЛОК
- текущая карта;
- текущий юнит;
- рекомендация;
- legalActions;
- события текущего хода.
```

Статический префикс должен оставаться одинаковым для запросов одной роли и модели.

## 3. Семантические классы

Естественные названия могут вводить модель в заблуждение. Классический пример — `Scout`, который модель пытается использовать для разведки, хотя карта полностью видна и юнит нужен только для колонизации.

Решение:

```json
{
  "displayName": "Колонизатор",
  "typeKey": "scout",
  "semanticClass": "COLONY_SHIP"
}
```

Рекомендуемые классы:

- `COLONY_SHIP`;
- `ANTI_COLONY_INTERCEPTOR`;
- `ANTI_INTERCEPTOR_CORVETTE`;
- `ARMORED_GENERALIST`;
- `SIEGE_CAPITAL_SHIP`.

## 4. Компактные правила штаба

```text
COLONY_SHIP:
role=colonization;
combat=no;
vision=no;
fog=no;
consumed_on_colonization=yes

ANTI_COLONY_INTERCEPTOR:
role=anti_colony;
move=2;
dirs=8;
oneshot=COLONY_SHIP;
hp=low;
attack=low

ANTI_INTERCEPTOR_CORVETTE:
role=anti_interceptor;
move=1;
dirs=8;
bonus_vs=ANTI_COLONY_INTERCEPTOR;
hp=medium;
attack=medium

ARMORED_GENERALIST:
role=generalist;
move=1;
dirs=4;
diagonal=no;
armor=high;
attack=high

SIEGE_CAPITAL_SHIP:
role=siege;
move=1;
move_every=2_turns;
dirs=4;
diagonal=no;
armor=very_high;
attack=very_high;
bonus_vs=PLANET
```

Не использовать неясные сокращения вроде `contrpic_colonizator`. Лучше стабильные английские машинные термины.

## 5. Глобальное состояние штаба

Пустые клетки не передаются.

```json
{
  "turn": 18,
  "credits": 42,
  "yourRedUnits": [],
  "enemyBlueUnits": [],
  "yourRedPlanets": [],
  "enemyBluePlanets": [],
  "neutralGrayPlanets": [],
  "fleetComposition": {},
  "operationalOptions": []
}
```

Для маленьких моделей лучше разделять объекты по фракциям, а не передавать единый массив с `owner`.

## 6. Локальный контекст юнита

```json
{
  "identity": {},
  "capabilities": {},
  "headquartersRecommendation": {},
  "nearbyFriendlyUnits": [],
  "nearbyEnemyUnits": [],
  "nearbyPlanets": [],
  "friendlyRepairPlanets": [],
  "futureThreats": [],
  "eventsEarlierThisTurn": [],
  "legalActions": []
}
```

Начальный `tacticalRadius = 4`, но опасные объекты следующего хода добавляются независимо от радиуса.

## 7. LegalActions важнее длинного текста правил

Пример:

```json
{
  "id": 14,
  "type": "ATTACK_UNIT",
  "targetUnitId": 8,
  "risk": 95,
  "orderFit": 100,
  "strategicValue": 80,
  "predictedResult": {
    "targetDestroyed": false,
    "selfDestroyed": false,
    "expectedIncomingDamage": 22,
    "lethalNextTurn": true
  },
  "strategicTags": [
    "EXECUTES_HEADQUARTERS_RECOMMENDATION",
    "LETHAL_COUNTERATTACK"
  ]
}
```

Тогда Gemma 4B выбирает между готовыми последствиями, а не пытается сама считать сложный бой.

## 8. Размер контекста

Даже на карте `10×10` ожидаемый редкий пик — около 40 юнитов и 15–20 планет. Основной источник размера — скорее слишком подробный массив `legalActions`, а не сама карта.

## 9. Общие правила промптов

Для всех агентов:

- отвечать только JSON;
- не использовать Markdown;
- не придумывать ID;
- не менять состояние;
- выбирать только из переданных действий;
- не подменять переданные правила жанровыми ассоциациями.

Для штаба:

- планировать только текущий ход;
- выдавать рекомендации;
- не прокладывать длинные маршруты.

Для юнита:

- учитывать локальный риск;
- разрешать отклонение рекомендации;
- выбирать ровно один `actionId`.

Для закупки:

- разрешать ноль покупок;
- учитывать ремонт;
- соблюдать резерв.

Для рапорта:

- описывать только `actualResult`;
- писать 1–2 коротких предложения.
