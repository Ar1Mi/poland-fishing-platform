# 05. API

REST, префикс `/api/v1`, JSON. Swagger UI — `/api/docs`, OpenAPI JSON — `/api/docs-json`.

## Общие правила

- **Аутентификация:** `Authorization: Bearer <access JWT>` (15 мин). Refresh — httpOnly cookie `rt` (7 дней, ротация), путь `/api/v1/auth`.
- **Ошибки:** `{ "code": "PERMIT_NOT_ACTIVE", "message": "...", "details": {...} }`. `code` стабилен и переводится на фронтенде; `message` — для разработчика.
- **Валидация:** 400 + `code: "VALIDATION_FAILED"`, `details.fields: { [field]: string[] }`.
- **Пагинация:** `?page=1&pageSize=20` (max 100) → `{ items, total, page, pageSize }`.
- **Даты:** ISO 8601; даты без времени — `YYYY-MM-DD`.
- **Деньги:** целые гроши, поле с суффиксом `Grosze`.

## Эндпоинты

### Auth и профиль

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Регистрация → письмо подтверждения |
| POST | `/auth/verify-email` | public | `{ token }` |
| POST | `/auth/login` | public | → `{ accessToken }` + cookie `rt` |
| POST | `/auth/refresh` | cookie | Ротация refresh, новый access |
| POST | `/auth/logout` | auth | Отзыв семьи refresh-токенов |
| POST | `/auth/forgot-password`, `/auth/reset-password` | public | Сброс пароля |
| GET / PATCH | `/me` | auth | Профиль, язык |
| GET | `/me/export` | auth | RODO: JSON со всеми данными пользователя |
| DELETE | `/me` | auth | RODO: удаление с анонимизацией уловов |

### Каталог и правила

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/waters?region=&type=&status=&q=&bbox=` | public | Список для карты; `bbox=minLng,minLat,maxLng,maxLat` |
| GET | `/waters/:id` | public | Карточка: владелец, ссылки, типы разрешений, действующие правила |
| GET | `/species` | public | Справочник видов |
| GET | `/waters/:id/rules` | public | Эффективные правила по видам (после слияния уровней) |
| POST | `/waters/suggestions` | auth | Предложить водоём (C, FR-25) |

### Разрешения и оплата

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/permit-types?waterId=` | public | Типы разрешений на водоём |
| POST | `/permits` | auth | `{ permitTypeId, validFrom }` → Permit `PENDING_PAYMENT` + `{ paymentUrl }` |
| GET | `/me/permits` | auth | Мои разрешения с вычисленным статусом |
| GET | `/me/permits/:id` | auth | Детали + `qrToken` (только для PAID) |
| GET | `/me/permits/:id/pdf` | auth | PDF с QR |
| GET | `/me/permits/:id/offline-bundle` | auth | Разрешение + QR + эффективные правила для IndexedDB |
| POST | `/payments/p24/notification` | public (подпись) | Уведомление P24 (`urlStatus`) |
| POST | `/payments/fake/:sessionId/complete` | public, только `PAYMENTS_PROVIDER=fake` | Симуляция оплаты |
| CRUD | `/me/external-permits` | auth | Внешние разрешения |
| GET | `/me/external-permits/:id/register.pdf?season=` | auth | PDF-реестр для владельца водоёма |

### Реестр уловов

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| POST | `/catches/sync` | auth | Пакет до 100 уловов |
| GET | `/me/catches?season=&permitId=` | auth | Мой реестр |
| PATCH | `/catches/:id` | auth, владелец | Правка в окне BR-07 |
| DELETE | `/catches/:id` | auth, владелец | Удаление в окне BR-07 |

`POST /catches/sync`:

```json
// запрос
{ "items": [ { "clientId": "uuid", "permitId": "uuid", "externalPermitId": null,
               "fishingWaterId": "uuid", "speciesId": "uuid", "caughtAt": "2026-10-06T15:20:00Z",
               "lengthCm": 42, "weightG": 900, "kept": true, "lat": 52.1, "lng": 21.0 } ] }
// ответ 200 — всегда по каждому элементу
{ "results": [ { "clientId": "uuid", "status": "ACCEPTED", "id": "uuid" },
               { "clientId": "uuid", "status": "REJECTED",
                 "violations": [ { "code": "DAILY_COUNT_LIMIT", "ruleId": "BR-04", "details": { "limit": 2 } } ] } ] }
```

Повторная отправка того же `clientId` возвращает сохранённый результат (идемпотентность).

### Проверка и контроль

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/verify/:token` | public / инспектор | Публично: `valid`, тип, срок, инициалы. Инспектор организации-владельца: + имя, год рождения, уловы за сегодня, `permitId` |
| POST | `/inspections` | INSPECTOR своей орг. | `{ permitId, result, notes, lat?, lng? }` |
| GET | `/orgs/:orgId/inspections` | ORG_ADMIN | Протоколы |

Фронтенд-маршрут `/verify/:token` (то, что открывает камера телефона) вызывает `GET /api/v1/verify/:token`.

### Организация (`OrgScopeGuard`)

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| POST | `/orgs` | auth | Заявка на регистрацию организации; заявитель становится ORG_ADMIN |
| GET | `/me/orgs` | auth | Мои организации и роли |
| CRUD | `/orgs/:orgId/members`, `/orgs/:orgId/invitations` | ORG_ADMIN | Члены, приглашения |
| POST | `/invitations/accept` | auth | `{ token }` |
| CRUD | `/orgs/:orgId/claims` | ORG_ADMIN | Заявки на водоёмы (multipart: документ) |
| PATCH | `/orgs/:orgId/waters/:id` | ORG_ADMIN | Описание, сезон, фото подключённого водоёма |
| CRUD | `/orgs/:orgId/permit-types` | ORG_ADMIN | Типы разрешений |
| CRUD | `/orgs/:orgId/rules` | ORG_ADMIN | Правила организации и водоёмов |
| GET | `/orgs/:orgId/permits` | ORG_ADMIN | Проданные разрешения |
| POST | `/orgs/:orgId/permits/:id/revoke` | ORG_ADMIN | Аннулирование |
| GET | `/orgs/:orgId/stats?from=&to=` | ORG_ADMIN | Статистика |
| GET | `/orgs/:orgId/catches.csv?from=&to=` | ORG_ADMIN | Экспорт |

### Суперадмин

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET / PATCH | `/admin/orgs`, `/admin/orgs/:id/status` | Активация, блокировка |
| GET / PATCH | `/admin/claims`, `/admin/claims/:id` | `{ decision: APPROVE | REJECT, comment }` |
| POST | `/admin/waters/import` | multipart CSV → `{ created, updated, failed: [{ row, error }] }` |
| PATCH | `/admin/waters/:id` | Правка записи каталога, публикация предложений |
| CRUD | `/admin/rules` | Общие правила |
| CRUD | `/admin/species` | Справочник видов |

## Коды ошибок

Определены в `packages/shared/src/errors.ts`. Минимальный набор:

| HTTP | Код |
| --- | --- |
| 400 | `VALIDATION_FAILED` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `ORG_SCOPE_VIOLATION`, `ORG_NOT_ACTIVE` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `CLAIM_ALREADY_PENDING`, `WATER_ALREADY_CONNECTED` |
| 422 | Бизнес-правила: `PERMIT_START_IN_PAST`, `DISCOUNT_NOT_ELIGIBLE`, `PERMIT_TYPE_INACTIVE`, `EDIT_WINDOW_CLOSED`, `PERMIT_NOT_REVOCABLE` |
| 429 | `RATE_LIMITED` |

Коды нарушений улова (`BR-*`) приходят не как HTTP-ошибка, а в `violations` ответа синхронизации — см. `02-business-rules.md`.
