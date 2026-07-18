# Space Commander — правила работы

## Назначение

Space Commander — статическое браузерное приложение на Vite, Vanilla JavaScript и PixiJS. Игровая механика принадлежит JavaScript-движку; Ollama выбирает только заранее рассчитанные идентификаторы действий.

## Приоритет источников

1. `doc/configs/*.json` — числа и фактические правила.
2. `doc/design documents` — AI-архитектура и контракты.
3. `doc/lore` — канон, трактовка механик и баланс.
4. `old version/with AI` — справочник по Ollama и fallback.
5. `old version/only html/civ3.html` — визуальная концепция.
6. `old version/MiniSpaceCommander` — исходные изображения.

`doc` и `old version` считаются read-only. Не использовать файлы из `old version` во время production runtime и не дублировать игровые числа из JSON в коде.

## Архитектурные границы

- `GameEngine` не импортирует UI, Pixi или AI.
- AI не изменяет состояние и не импортирует UI.
- Pixi renderer получает snapshot/events и ничего не мутирует.
- DOM UI общается с приложением через `AppController`.
- Любой выбранный LLM `actionId` повторно проверяется по свежим legal actions.
- Не создавать глобальные изменяемые массивы и циклические зависимости.

## Команды

- `npm run dev` — development server.
- `npm run lint` — ESLint.
- `npm run test` — Vitest.
- `npm run build` — production build непосредственно в `public`.

`public` является только результатом сборки, исходники и исходные assets там не хранятся.

## Definition of Done

Изменение готово, когда механика покрыта тестами, ошибки видны пользователю, AI не может зависнуть или выполнить нелегальное действие, production не зависит от `doc`/`old version`, а `npm run lint`, `npm run test` и `npm run build` проходят.
