# Технические замечания для Codex

## 1. Источник конфигурации

Не дублировать числа в коде и UI.

`ships.json` является источником:

- стоимости;
- ATK;
- HP;
- дальности;
- направлений;
- бонусов;
- кулдауна;
- AI-семантики.

`planets.json` является источником:

- HP;
- защиты;
- дохода;
- ремонта;
- производства;
- параметров новой колонии.

## 2. Стабильные typeKey

```text
scout
fighter
corvette
frigate
dreadnought
```

Отображаемые имена локализуются отдельно.

## 3. Направления

Не использовать «9 направлений».

Создать константы:

```js
EIGHT_DIRECTIONS
ORTHOGONAL_DIRECTIONS
```

## 4. Множители урона

Пример:

```js
function getDamageMultiplier(attacker, target) {
  const targetClass = target.kind === 'planet'
    ? 'PLANET'
    : ships[target.type].semanticClass;

  return ships[attacker.type].attack.bonuses[targetClass] ?? 1;
}
```

## 5. Кулдаун Dreadnought

Хранить:

```js
unit.movementCooldown
```

После `MOVE` установить `1`.

На следующем ходу запретить `MOVE`, но оставить `ATTACK` и `WAIT`.

## 6. Колонизация

В машинном контексте Scout:

```text
semanticClass=COLONY_SHIP
providesVision=false
revealsMap=false
```

После колонизации:

- удалить Scout;
- сменить тип и владельца планеты;
- установить 45 HP;
- записать `turnColonized`;
- не начислять доход немедленно.

## 7. Ремонт

В начале хода найти корабли на своих планетах и восстановить процент max HP.

## 8. Производство

Перед покупкой повторно проверить:

- владельца;
- кредиты;
- лимит производства;
- занятость клетки;
- состояние игры.

LLM закупки выбирает только `purchaseActionId`.

## 9. Версионирование

Каждый конфиг содержит:

```json
{
  "schemaVersion": 1,
  "balanceVersion": "1.0.0"
}
```

При изменении чисел повышать `balanceVersion`.

## 10. Тесты

Обязательные проверки:

- Fighter наносит Scout ровно 6;
- Corvette наносит Fighter 12;
- Scout не имеет ATTACK;
- Frigate не двигается по диагонали;
- Fighter и Corvette двигаются по диагонали;
- Dreadnought после движения пропускает следующее движение;
- Dreadnought может атаковать во время movement cooldown;
- новая колония получает 45 HP;
- новая колония не приносит доход немедленно;
- корабль на своей планете ремонтируется;
- занятая планета не производит корабль;
- Dreadnought получает бонус против PLANET.
