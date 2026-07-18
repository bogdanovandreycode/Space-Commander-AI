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

Entity-фабрики существуют для корабля, планеты, фракции, карты, состояния матча, unit memory, unit report, legal action, purchase action, predicted result, action result, события, snapshot и save envelope. Они возвращают обычные объекты без пользовательских прототипов. Это сохраняет совместимость с JSON/localStorage и позволяет движку формировать глубокие immutable snapshots.

`GameEngine` — единственный владелец изменяемого состояния. Renderer получает только snapshot, выбранный объект и legal actions. PixiJS не участвует в расчёте правил.

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
    └── entities/
```

Новая игровая entity, service или renderer должна получать тест в соответствующей зеркальной папке.
