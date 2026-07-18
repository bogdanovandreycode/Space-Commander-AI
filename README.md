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

Vite собирает приложение непосредственно в `public`. OSPanel уже настроен на эту папку.
Исходная HTML-точка входа находится в `src/index.html`; корневой `index.html` не используется.

## Ollama

По умолчанию приложение обращается к `http://localhost:11434/api/chat`. Модели:

- штаб: `deepseek-r1:8b`;
- корабли, закупки и рапорты: `gemma3:4b`.

Origin игры необходимо разрешить в Ollama, например через `OLLAMA_ORIGINS=https://space-commander.local`. URL, модели, таймауты и параметры генерации меняются в Settings. Если Ollama недоступна, игра использует детерминированный fallback.

## Архитектура

- `src/configs` — канонические JSON-конфигурации;
- `src/services/game` — состояние, правила, legal actions и победа;
- `src/services/ai` — агенты и fallback;
- `src/services/config` — загрузка и валидация конфигурации;
- `src/services` — Ollama, localStorage и diagnostics;
- `src/render/pixi` — только игровое поле;
- `src/ui` — DOM-интерфейс и локализация;
- `unit` — тесты с зеркальной структурой исходных модулей;
- `doc` — дизайн-документы и канон;
- `old version` — read-only исторические реализации.

Игровые числа читаются только из `src/configs`. Production bundle включает конфигурации на этапе сборки и не загружает `doc` во время выполнения.

## Сохранения

Матч автоматически сохраняется в localStorage. Главное меню позволяет продолжить, начать заново или очистить сохранение. Несовместимая версия сохранения не загружается.

## Тестирование

```bash
npm run lint
npm run test
npm run build
```

Все тесты находятся в `unit`, повторяют структуру `src` и не обращаются к реальному Ollama.

## Troubleshooting

- **Ollama: Failed to fetch** — проверьте, что Ollama запущена и origin добавлен в `OLLAMA_ORIGINS`.
- **Модель не найдена** — установите модель или выберите доступную в Settings.
- **Пустая страница production** — повторите `npm run build` и проверьте наличие `public/index.html`.
- **Старое сохранение не открывается** — очистите его в главном меню и начните новую игру.

Подробности: [design documents](doc/design%20documents/00_README.md) и [lore](doc/lore/00_README.md).

## Скриншоты

Desktop и mobile screenshots добавляются после финальной браузерной проверки.
