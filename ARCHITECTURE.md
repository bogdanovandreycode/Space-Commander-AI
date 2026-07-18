# Space Commander — архитектура

## Границы модулей

Проект разделён на два верхнеуровневых слоя:

- `src/gamecore` — автономное игровое ядро;
- `src/engine` — браузерное приложение, которое использует игровое ядро.

Допустимое направление зависимостей — только `engine → gamecore`. Код `gamecore` не импортирует AI, DOM UI, localStorage или application-контроллеры.

## Gamecore

```text
src/gamecore/
├── assets/             игровые WebP
├── configs/            канонические JSON-правила
├── entities/           фабрики сериализуемых игровых объектов
├── helpers/            чистые функции координат и immutable-копий
├── render/pixi/        PixiJS renderer, manifest и preload
└── services/           GameEngine, начальное состояние и config services
```

Entity-фабрики существуют для корабля, планеты, фракции, карты, состояния матча, unit memory, AI/unit report, legal action, purchase action, predicted result, action result, события, snapshot и save envelope. Они возвращают обычные объекты без пользовательских прототипов. Это сохраняет совместимость с JSON/localStorage и позволяет движку формировать глубокие immutable snapshots.

`GameEngine` — единственный владелец изменяемого состояния. Renderer получает только snapshot, выбранный объект и legal actions. PixiJS не участвует в расчёте правил.

`names.json` и `NameGenerator` создают уникальные детерминированные имена кораблей и планет из `nameSeed`/`nameSequence`. В состояние также входят три независимых порога активации колонии: производство и ремонт доступны с текущего owner-turn, доход — со следующего. Публичные read-модели `getObjectsAt`, `getUnitHistory` и `getFactionEconomySnapshot` не раскрывают изменяемое состояние.

## Engine

```text
src/engine/
├── ai/                 агенты, prompts, validators и fallback
├── app/                композиция приложения
├── assets/             application assets, например логотип
├── config/             ключи и настройки application-уровня
├── controllers/        AppController
├── entities/           application entities, включая AI settings
├── services/           Ollama, localStorage и diagnostics
├── styles/             DOM-стили
└── ui/                 DOM UI, Markdown и i18n
```

`AppController` связывает UI, GameEngine, Pixi renderer, AI, autosave и настройки. AI получает snapshot и legal action IDs, но не изменяет состояние напрямую.

Right bar строится только из выбранного объекта. Он объединяет карточку параметров, верфь, разведку экономики, историю дружественного корабля или дневник вражеских рапортов. Техническая активность AI и художественный журнал событий находятся в отдельных DOM-диалогах; Pixi передаёт контроллеру только click/hover координаты сектора.

AI сохраняет разделение decision/report. Решения штаба, закупок и корабля валидируются и исполняются до формирования соответствующего `AiReport`. Report-очередь имеет concurrency 1 и может выполняться параллельно следующему decision-запросу. Штабные и экономические рапорты хранятся в `commandReports`, корабельные — в `unitReports` и памяти корабля. Для каждой роли выбираются независимые decision/report модели, получаемые UI через `OllamaClient.listModels()` и `/api/tags`.

Отказ штабного канала обрабатывается отдельно от unit fallback: после ошибки основной модели выполняется единственная попытка через `headquartersFallbackModel` с принудительными `think: false` и temperature `0`. Двойной отказ создаёт `DECENTRALIZED_OPERATIONS` без `unitRecommendations`; закупки получают `commandLinkStatus: OFFLINE`, а корабли продолжают штатный Unit decision-конвейер по локальному контексту.

## Тесты

Корневой `unit` зеркалирует исходные архитектурные границы:

```text
unit/
├── gamecore/
│   ├── entities/
│   ├── render/pixi/
│   └── services/
└── engine/
    ├── ai/
    ├── entities/
    ├── services/
    └── ui/
```

Новая игровая entity, service или renderer должна получать тест в соответствующей зеркальной папке.
