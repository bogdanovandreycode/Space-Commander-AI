# Space Commander — implementation plan

- [x] Исследовать документацию, старые версии, assets, Git и OSPanel.
- [x] Зафиксировать архитектуру и правила проекта.
- [x] Создать Vite-проект и перенести используемые assets.
- [x] Реализовать конфигурацию, GameEngine и сериализацию.
- [x] Реализовать legal actions, предсказания риска и deterministic fallback.
- [x] Реализовать Ollama и многоагентный конвейер.
- [x] Реализовать PixiJS renderer и DOM UI.
- [x] Добавить i18n, Lore, Settings, reports и autosave.
- [x] Пройти lint, unit tests и production build.
- [x] Сконсолидировать конфигурации и перенести все тесты в зеркальную структуру корневого `unit`.
- [x] Разделить код на автономный `gamecore` и application-слой `engine`, добавить entity-фабрики игровых объектов.
- [ ] Выполнить desktop/mobile browser smoke-test — browser runtime недоступен в текущем окружении; dev server и production HTTP-пути проверены без браузера.

Подробная спецификация соответствует утверждённому пользователем плану в текущей задаче. Baseline использует фиксированную симметричную карту 10×10, Cryos/Ignis без механической асимметрии и прямое browser-to-Ollama соединение.
