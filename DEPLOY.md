# Space Commander — deployment

## Production build

OSPanel должен обслуживать корневой каталог `public`. Исходный `index.html` находится в `src`, а production-файлы создаются только сборкой:

```powershell
npm install
npm run lint
npm run test
npm run build
```

После сборки проверьте наличие `public/index.html` и откройте:

```text
https://space-commander.local
```

## Доступ браузера к Ollama

Игра обращается к Ollama напрямую из браузера:

```text
http://localhost:11434
```

Это cross-origin запрос. Его origin определяется адресом страницы — `https://space-commander.local`, а не адресом Ollama. Без явного разрешения Ollama отвечает `403 Forbidden`, и приложение показывает сообщение о недоступности сервиса или CORS.

На Windows добавьте точный origin сайта в пользовательскую переменную окружения:

```powershell
[Environment]::SetEnvironmentVariable(
  'OLLAMA_ORIGINS',
  'https://space-commander.local',
  'User'
)
```

Если сайт используется и по HTTP, перечислите оба origin через запятую, без пробелов и завершающих `/`:

```powershell
[Environment]::SetEnvironmentVariable(
  'OLLAMA_ORIGINS',
  'https://space-commander.local,http://space-commander.local',
  'User'
)
```

Не используйте `*` без необходимости: это разрешит любому открытому сайту обращаться к локальной Ollama.

После изменения переменной обязательно:

1. Полностью закрыть Ollama через значок в системном трее.
2. Убедиться, что старый процесс Ollama завершён.
3. Запустить Ollama заново через меню «Пуск».
4. Обновить игру через `Ctrl+F5`.

Уже запущенный процесс не увидит новую переменную окружения.

## Проверка Ollama

Проверьте origin тем же способом, которым его отправляет браузер:

```powershell
curl.exe -i `
  -H "Origin: https://space-commander.local" `
  http://localhost:11434/api/tags
```

Ожидается `200 OK`. Ответ `403 Forbidden` означает, что Ollama не получила нужное значение `OLLAMA_ORIGINS` или не была перезапущена после его изменения.

Также проверьте доступные модели:

```powershell
ollama list
```

Настройки игры по умолчанию ожидают `deepseek-r1:8b` и `gemma3:4b`. Другие установленные модели можно выбрать в AI Settings.

## Финальная проверка

- `https://space-commander.local` открывается без 404;
- DevTools Console не содержит ошибок загрузки;
- запрос `/api/tags` возвращает `200`;
- Test Connection находит выбранные модели;
- после `Ctrl+F5` загружается актуальный hashed JS bundle из `public/assets`.
