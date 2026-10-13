# 02. Бизнес-правила

## Три уровня правил

Правила ловли — данные в таблице `SpeciesRule`, а не код.

| Уровень | `organizationId` | `fishingWaterId` | Кто задаёт |
| --- | --- | --- | --- |
| Общий (из rozporządzenia o połowie ryb) | `null` | `null` | Суперадмин |
| Организация | задан | `null` | Админ организации |
| Водоём | задан | задан | Админ организации |

**Разрешение конфликтов — берётся самое строгое значение** из всех применимых уровней:

- `minLengthCm` — максимум;
- `dailyLimitCount`, `dailyLimitWeightG` — минимум (`null` = нет ограничения);
- запретные периоды — объединение: улов запрещён, если дата попадает хотя бы в один период.

Нижний уровень не может ослабить верхний. На неподключённом водоёме (и для внешних разрешений) применяются только общие правила.

## Правила

| ID | Правило | Когда | Код ошибки |
| --- | --- | --- | --- |
| BR-01 | Разрешение (платформенное или внешнее) активно в момент `caughtAt` и покрывает водоём | Запись улова | `PERMIT_NOT_ACTIVE`, `PERMIT_WATER_MISMATCH` |
| BR-02 | Оставленная рыба не короче `minLengthCm` | Запись, `kept=true` | `BELOW_MIN_LENGTH` |
| BR-03 | Оставлять рыбу в запретный период нельзя | Запись, `kept=true` | `CLOSED_SEASON` |
| BR-04 | Число оставленных рыб вида за сутки ≤ `dailyLimitCount` | Запись, `kept=true` | `DAILY_COUNT_LIMIT` |
| BR-05 | Общий вес оставленных рыб за сутки ≤ `dailyLimitWeightG` | Запись, `kept=true` | `DAILY_WEIGHT_LIMIT` |
| BR-06 | Охраняемый вид (`Species.isProtected`) можно только отпустить | Запись | `PROTECTED_SPECIES` |
| BR-07 | Улов редактируется до конца суток улова + 24 ч | Редактирование | `EDIT_WINDOW_CLOSED` |
| BR-08 | Льготный тип требует возраста: JUNIOR < 16 лет, SENIOR ≥ 65 лет на `validFrom` | Покупка | `DISCOUNT_NOT_ELIGIBLE` |
| BR-09 | `validFrom` не раньше сегодняшнего дня | Покупка | `PERMIT_START_IN_PAST` |
| BR-10 | `caughtAt` не в будущем (допуск 5 мин) | Запись | `CATCH_IN_FUTURE` |
| BR-11 | Если для вида действует `dailyLimitWeightG`, у оставленной рыбы обязателен `weightG` | Запись, `kept=true` | `WEIGHT_REQUIRED` |

Возрастные пороги BR-08 — значения по умолчанию в конфиге; уточнить по регуламинам выбранных организаций.

## Уточнения

- **Сутки** — календарный день в `Europe/Warsaw`, а не 24 часа от первого улова. Сравнение дат okresu ochronnego (`MM-DD`) — тоже по варшавской дате; период может переходить через Новый год (`12-01`…`02-28`). Границы периода включительны. 29 февраля запретно всегда, когда запретно 28 февраля: период «до конца февраля» хранится как `…02-28` и в високосный год покрывает весь месяц.
- **Лимиты считаются по пользователю** за сутки и по виду (BR-04), по всем водоёмам, где действует то же правило. Отпущенная рыба в лимиты не входит.
- **Отпущенная рыба** проверяется только по BR-01, BR-06, BR-10.
- Улов на внешнем разрешении сравнивается с водоёмами, которые рыбак указал в `ExternalPermit`.

## CatchValidator

Чистая функция без доступа к БД и времени — живёт в `packages/shared/src/rules/`, чтобы **одна и та же логика** работала в PWA (офлайн) и на сервере.

```ts
type RuleViolation = { code: CatchErrorCode; ruleId: string; details?: Record<string, unknown> };

interface CatchRule {
  id: string; // 'BR-02'
  check(ctx: CatchContext): RuleViolation | null;
}

interface CatchContext {
  catch: CatchInput;                 // проверяемый улов
  permit: PermitSnapshot;            // validFrom, validTo, waterIds, kind
  species: { id: string; isProtected: boolean };
  effectiveRule: EffectiveRule;      // результат слияния уровней
  sameDayKept: CatchInput[];         // оставленные уловы пользователя за те же сутки, до этого улова
  now: Date;                         // передаётся снаружи — тестируемость
}

function validateCatch(ctx: CatchContext, rules = DEFAULT_RULES): RuleViolation[];
function resolveEffectiveRule(rules: SpeciesRuleRow[]): EffectiveRule;
```

- Каждое правило — отдельный класс/объект и отдельный файл тестов (паттерн Strategy / Specification).
- Сервер (`CatchesModule`) загружает контекст из БД и вызывает `validateCatch`; при пакетной синхронизации обрабатывает уловы пользователя **в порядке `caughtAt` в одной транзакции**, чтобы лимиты считались детерминированно.
- Клиент вызывает ту же функцию с данными из IndexedDB и показывает нарушение сразу; окончательное решение — за сервером (`REJECTED` + коды нарушений).
