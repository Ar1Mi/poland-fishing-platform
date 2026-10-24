# 05. API

REST, префикс `/api/v1`, JSON. Swagger UI — `/api/docs`, OpenAPI JSON — `/api/docs-json`.

## Общие правила

- **Аутентификация:** `Authorization: Bearer <access JWT>` (15 мин). Refresh — httpOnly cookie `rt` (7 дней, ротация), путь `/api/v1/auth`.
- **Ошибки:** `{ "code": "PERMIT_TYPE_INACTIVE", "message": "...", "details": {...} }`. `code` стабилен и переводится на фронтенде; `message` — для разработчика.
- **Валидация:** 400 + `code: "VALIDATION_FAILED"`, `details.fields: { [field]: string[] }`.
- **Пагинация:** `?page=1&pageSize=20` (max 100) → `{ items, total, page, pageSize }`.
- **Даты:** ISO 8601; даты без времени — `YYYY-MM-DD`.
- **Деньги:** целые гроши, поле с суффиксом `Grosze`.

## Эндпоинты

### Служебные

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/health` | public | Проверка живости: `{ "status": "ok", "time": "<ISO 8601, UTC>" }`. Под общим префиксом (`/api/v1/health`), чтобы быть доступным через прокси `/api` |

Каждый ответ несёт заголовок `X-Request-Id`; корректный входящий (`[A-Za-z0-9_-]`, до 64 символов) переиспользуется, иначе генерируется UUID. Тот же id стоит в строках лога запроса. Путь вне `/api/v1` и `/api/docs` получает 404 `NOT_FOUND` в том же JSON-формате.

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

Детали (T-07):

- **Регистрация:** `{ email, password, firstName, lastName, birthDate, anglerCardNo?, locale?, acceptTerms: true }` → 204. Email сравнивается без учёта регистра (хранится в нижнем регистре). Пароль 8–128 символов без требований к составу (NIST SP 800-63B); лимиты — в `packages/shared/src/auth/schemas.ts`. `birthDate` не позже сегодняшнего дня по Варшаве. Согласие RODO обязательно, в БД отдельно не хранится: факт регистрации и есть запись согласия. Занятый email → 409 `EMAIL_TAKEN`.
- **Письма:** ссылки `${WEB_URL}/verify-email?token=…` (24 ч) и `${WEB_URL}/reset-password?token=…` (1 ч), язык — `User.locale`. Новая ссылка того же назначения отменяет неиспользованные. Сбой SMTP не роняет запрос (ошибка в логе).
- **Одноразовые токены:** неизвестный, использованный или другого назначения → 400 `INVALID_TOKEN`; просроченный → 401 `TOKEN_EXPIRED`.
- **Вход:** неверный пароль и несуществующий email → одинаково 401 `INVALID_CREDENTIALS` (для несуществующего — сверка с фиктивным хешем, без разницы во времени); `EMAIL_NOT_VERIFIED` — только после верного пароля. Лимит 5 попыток в минуту на пару IP + email → 429 `RATE_LIMITED`.
- **Лимиты:** все `/auth/*`, кроме `refresh` и `logout`, — общий счётчик 20 запросов в минуту на IP; `forgot-password` — ещё 3 в час на email. Счётчики в памяти процесса; за прокси (T-30) нужен `trust proxy`, иначе все клиенты — один IP.
- **Токены:** access — JWT HS256 (`jose`), `{ sub: userId, aud: "lowisko-api", iat, exp }`, 15 мин; просроченный → 401 `TOKEN_EXPIRED` (клиент обновляет и повторяет запрос), иначе `UNAUTHENTICATED`. Refresh — случайные 256 бит в cookie `rt` (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=7 дней`); каждая ротация выдаёт токен ещё на 7 дней в той же семье. Предъявление отозванного токена отзывает всю семью; отклонённая cookie стирается.
- **Выход** отзывает только семью текущей cookie (одно устройство) и только если она принадлежит владельцу access-токена. **Сброс пароля** подтверждает email и отзывает все refresh-токены пользователя.
- **`/me`:** `PATCH` меняет `firstName`, `lastName`, `birthDate`, `anglerCardNo` (`null` или `""` — удалить), `locale`; email и `isSuperAdmin` не меняются (лишнее поле → 400).

### Каталог и правила

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/waters?region=&type=&status=&q=&bbox=` | public | Список для карты; `bbox=minLng,minLat,maxLng,maxLat` |
| GET | `/waters/:id` | public | Карточка: владелец, ссылки, типы разрешений, действующие правила |
| GET | `/species` | public | Справочник видов |
| GET | `/waters/:id/rules` | public | Эффективные правила по видам (после слияния уровней) |
| POST | `/waters/suggestions` | auth | Предложить водоём (C, FR-25) |

Детали (T-09):

- **`GET /waters`** — **исключение из правила пагинации**: карте нужны все маркеры видимой области, а страница из 100 элементов теряла бы маркеры и искажала числа в кластерах. Ответ `{ items, truncated }`, не больше `WATERS_LIST_LIMIT` = 2000 записей (`packages/shared/src/catalog/catalog.ts`); при `truncated: true` клиент просит приблизить карту или сузить фильтры. Элемент компактный: `id, name, type, status, region, lat, lng` (≈ 200 байт; 1000 водоёмов ≈ 200 КБ JSON, ≈ 35 КБ gzip). Сортировка по `name`, затем `id`. Решение принято в T-09; если каталог вырастет до десятков тысяч записей — пересмотреть через ADR (кластеризация на сервере).
- Фильтры: `region` — одно из 16 воеводств в нижнем регистре (`REGIONS`); `type`, `status` — enum; `q` — часть названия без учёта регистра, 1–100 символов после trim, `%` и `_` ищутся как обычные символы (без учёта диакритики: `zegrzynski` не находит «Zegrzyński»). `bbox=minLng,minLat,maxLng,maxLat`, границы включительно, `min ≤ max`; водоёмы без координат в ответ с `bbox` не попадают, без `bbox` — попадают (для списка). Неизвестный параметр или неверное значение → 400 `VALIDATION_FAILED`.
- Возвращаются только опубликованные записи (`isPublished`); предложение рыбака на модерации и в `/waters/:id` даёт 404 `NOT_FOUND`.
- **`GET /waters/:id`** — сводка + `description`, `organization: { id, name, isActive } | null` (только публичные поля организации; `isActive: false`, пока организация не `ACTIVE` — водоём остаётся `CONNECTED`, но продажа онлайн приостановлена, карточка пишет «Sprzedaż online wstrzymana»; карта и фильтр `status` показывают его как подключённый), `externalOwnerName`, `externalInfoUrl`, `source`, `updatedAt` (источник и дата — ADR-0007). Типы разрешений приходят отдельно из `GET /permit-types?waterId=` (T-12), правила — из `GET /waters/:id/rules` (T-16). Не-UUID → 400.
- **`GET /species`** — весь справочник (≈ 15 видов) без пагинации, по `namePl`: `id, latinName, namePl, nameEn, nameRu, isProtected`.

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

Детали (T-08):

- **Заявка:** `{ name, nip, kind, contactEmail }` → 201 с организацией в статусе `PENDING`; заявитель в той же транзакции получает `Membership` с ролью `ORG_ADMIN`. NIP принимается с пробелами и дефисами, хранится как 10 цифр, проверяется контрольная сумма (`packages/shared/src/orgs/nip.ts`). NIP уже зарегистрирован (в любом статусе) → 409 `NIP_TAKEN`.
- **`/me/orgs`:** `[{ id, name, kind, status, roles[] }]` — организации пользователя в любом статусе, все его роли в каждой.
- **Guards** (`modules/organizations`): `@Roles(...)` подключает `OrgScopeGuard` и `RolesGuard`. Проверки по порядку: не член `:orgId` → 403 `ORG_SCOPE_VIOLATION`; организация не `ACTIVE` → 403 `ORG_NOT_ACTIVE` (`details.status`); нет нужной роли → 403 `FORBIDDEN` (`details.requiredRoles`). Несуществующий и не-UUID `orgId` неотличимы от чужой организации. Суперадмин без членства доступа к `/orgs/:orgId/*` не имеет. `@SuperAdmin()` читает флаг из БД на каждом запросе → иначе 403 `FORBIDDEN`. Модуль с маршрутами `/orgs/:orgId/*` импортирует `OrganizationsModule`.

### Суперадмин

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET / PATCH | `/admin/orgs?status=`, `/admin/orgs/:id/status` | Список (старые заявки первыми); `{ status: ACTIVE \| BLOCKED }` — активация, блокировка, повторная активация; тот же статус — без изменений |
| GET / PATCH | `/admin/claims`, `/admin/claims/:id` | `{ decision: APPROVE | REJECT, comment }` |
| POST | `/admin/waters/import` | multipart CSV → `{ created, updated, failed: [{ row, error }] }` |
| PATCH | `/admin/waters/:id` | Правка записи каталога, публикация предложений |
| CRUD | `/admin/rules` | Общие правила |
| CRUD | `/admin/species` | Справочник видов |

## Коды ошибок

Определены в `packages/shared/src/errors.ts`. Минимальный набор:

| HTTP | Код |
| --- | --- |
| 400 | `VALIDATION_FAILED`, `INVALID_TOKEN` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `ORG_SCOPE_VIOLATION`, `ORG_NOT_ACTIVE` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `NIP_TAKEN`, `CLAIM_ALREADY_PENDING`, `WATER_ALREADY_CONNECTED` |
| 422 | Бизнес-правила: `PERMIT_START_IN_PAST`, `DISCOUNT_NOT_ELIGIBLE`, `PERMIT_TYPE_INACTIVE`, `EDIT_WINDOW_CLOSED`, `PERMIT_NOT_REVOCABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` — необработанное исключение; `message` не раскрывает детали, они только в логе |

Ошибки самого фреймворка (неизвестный маршрут, отказ guard, битый JSON) кода не несут — фильтр подбирает его по HTTP-статусу: 401 → `UNAUTHENTICATED`, 403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 429 → `RATE_LIMITED`, прочие 4xx → `VALIDATION_FAILED`, 5xx → `INTERNAL_ERROR` (с фиксированным `message`). Статус ответа при этом сохраняется. Объект ошибки со своим `statusCode`, брошенный не фреймворком (например, HTTP-клиентом внешнего сервиса), считается необработанным исключением → 500.

Коды нарушений улова (`BR-*`) приходят не как HTTP-ошибка, а в `violations` ответа синхронизации — см. `02-business-rules.md`.
