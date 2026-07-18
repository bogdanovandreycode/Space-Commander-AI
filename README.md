# Space Commander

Space Commander — пошаговая браузерная стратегия о войне Союза Криос и Гегемонии Игнис за Серую границу. Игровое поле отрисовывает PixiJS, интерфейс остаётся обычным HTML/CSS, а локальный Ollama может управлять противником через специализированных агентов штаба, закупок, кораблей и рапортов.

## Требования и запуск

- Node.js 20.19 или новее;
- npm;
- OSPanel для адреса `https://space-commander.local`;
- необязательно: Ollama для LLM-режима.

```bash
npm install
npm run dev
```

Production:

```bash
npm run lint
npm run test
npm run build
```

Vite собирает приложение непосредственно в `public`. OSPanel уже настроен на эту папку. Полная инструкция по production-сборке и настройке Ollama находится в [DEPLOY.md](DEPLOY.md).
Исходная HTML-точка входа находится в `src/index.html`; корневой `index.html` не используется.

## Ollama

По умолчанию приложение обращается к `http://localhost:11434/api/chat`. Модели:

- штаб: `deepseek-r1:8b`;
- корабли, закупки и рапорты: `gemma3:4b`.

Origin игры необходимо разрешить в Ollama через `OLLAMA_ORIGINS=https://space-commander.local`, после чего полностью перезапустить процесс Ollama. Иначе запрос `/api/tags` получит `403 Forbidden`. Точные команды для Windows и проверка через `curl.exe` приведены в [DEPLOY.md](DEPLOY.md). URL, модели, таймауты и параметры генерации меняются в Settings. Если Ollama недоступна, игра использует детерминированный fallback.

## Архитектура

- `src/gamecore/configs` — канонические JSON-конфигурации;
- `src/gamecore/entities` — фабрики Ship, Planet, Faction, GameMap, GameState, actions, events, snapshot и save data;
- `src/gamecore/services` — правила, legal actions, транзакции, сохранение и конфигурационные сервисы;
- `src/gamecore/helpers` — чистые игровые helpers;
- `src/gamecore/render/pixi` — PixiJS-поле, manifest и загрузка игровых assets;
- `src/engine/controllers` и `src/engine/app` — сборка приложения и связь слоёв;
- `src/engine/ai` — Ollama-агенты и deterministic fallback;
- `src/engine/services` — Ollama, localStorage и diagnostics;
- `src/engine/ui` и `src/engine/styles` — DOM-интерфейс, локализация и оформление;
- `unit` — тесты с зеркальной структурой исходных модулей;
- `doc` — дизайн-документы и канон;
- `old version` — read-only исторические реализации.

Зависимости направлены от `engine` к `gamecore`. Игровое ядро не импортирует AI, DOM или application-контроллеры. Entity-фабрики возвращают обычные сериализуемые объекты, поэтому snapshots и localStorage-сохранения не зависят от прототипов JavaScript.

Игровые числа читаются только из `src/gamecore/configs`. Production bundle включает конфигурации на этапе сборки и не загружает `doc` во время выполнения. Полная схема приведена в [ARCHITECTURE.md](ARCHITECTURE.md).

## Сохранения

Матч автоматически сохраняется в localStorage. Главное меню позволяет продолжить, начать заново или очистить сохранение. Несовместимая версия сохранения не загружается.

## Тестирование

```bash
npm run lint
npm run test
npm run build
```

Все тесты находятся в `unit`, зеркалируют `gamecore`/`engine` и не обращаются к реальному Ollama.

## Troubleshooting

- **Ollama: Failed to fetch** — проверьте, что Ollama запущена и origin добавлен в `OLLAMA_ORIGINS`.
- **Модель не найдена** — установите модель или выберите доступную в Settings.
- **Пустая страница production** — повторите `npm run build` и проверьте наличие `public/index.html`.
- **Старое сохранение не открывается** — очистите его в главном меню и начните новую игру.

Подробности: [design documents](doc/design%20documents/00_README.md) и [lore](doc/lore/00_README.md).

## Скриншоты

Desktop и mobile screenshots добавляются после финальной браузерной проверки.
