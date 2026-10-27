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
| GET | `/permit-types/lowest-prices?waterIds=` | public | Цена «od» для карточек списка каталога |
| POST | `/permits` | auth | `{ permitTypeId, validFrom }` → Permit `PENDING_PAYMENT` + `{ paymentUrl }` |
| GET | `/me/permits` | auth | Мои разрешения с вычисленным статусом |
| GET | `/me/permits/:id` | auth | Детали с вычисленным статусом (T-13); `qrToken` для PAID — T-15 |
| GET | `/me/permits/:id/pdf` | auth | PDF с QR |
| GET | `/me/permits/:id/offline-bundle` | auth | Разрешение + QR + эффективные правила для IndexedDB |
| POST | `/payments/p24/notification` | public (подпись) | Уведомление P24 (`urlStatus`) → 200 `{ status }` |
| POST | `/payments/fake/:sessionId/complete` | public, только `PAYMENTS_PROVIDER=fake` | Симуляция оплаты: `{ outcome: PAID \| REJECTED, amountGrosze? }` |
| CRUD | `/me/external-permits` | auth | Внешние разрешения |
| GET | `/me/external-permits/:id/register.pdf?season=` | auth | PDF-реестр для владельца водоёма |

Детали (T-13, FR-08):

- **Покупка:** `POST /permits` `{ permitTypeId, validFrom }` → 201 `{ permit, paymentUrl }`. Проверки по порядку: `validFrom` — дата `YYYY-MM-DD` (иначе 400); раньше сегодняшней варшавской даты → 422 `PERMIT_START_IN_PAST` (`details.today`); позже чем через 365 дней → 400 `VALIDATION_FAILED` (`details.fields.validFrom`); тип не найден → 404 `NOT_FOUND`; тип снят с продажи или организация не `ACTIVE` → 422 `PERMIT_TYPE_INACTIVE`; возраст на `validFrom` не подходит к льготе → 422 `DISCOUNT_NOT_ELIGIBLE` (`details.discountKind`). Правила дат и возраста — `02-business-rules.md` → «Уточнения».
- `permit` — тот же объект, что `GET /me/permits/:id`; `validTo = validFrom + durationDays − 1`, `pricePaidGrosze` — цена типа на момент покупки. Разрешение (`PENDING_PAYMENT`) и `Payment` (`PENDING`, `sessionId` — случайный UUID) пишутся в одной короткой транзакции, транзакция регистрируется у провайдера после неё; `paymentUrl` — страница оплаты провайдера. Провайдер отказал в регистрации → платёж `FAILED`, разрешение `CANCELLED`, ответ 500.
- **Бесплатный тип** (цена 0): разрешение сразу `PAID`, `Payment` не создаётся, `paymentUrl` ведёт прямо на `${WEB_URL}/payment/return?permitId=…`.
- **Возврат браузера:** провайдер возвращает покупателя на `${WEB_URL}/payment/return?permitId=…`; возврат ничего не меняет, страница опрашивает `GET /me/permits/:id`.
- **`GET /me/permits/:id`:** `{ id, number, status, validFrom, validTo, pricePaidGrosze, permitType: { id, name, durationDays, discountKind }, organization: { id, name }, createdAt }`; `status` — вычисленный (`PENDING_PAYMENT`, `CANCELLED`, `REVOKED` как есть; `PAID` → `SCHEDULED` / `ACTIVE` / `EXPIRED`, ADR-0005). Чужое разрешение неотличимо от несуществующего → 404 `NOT_FOUND`.
- **Уведомление** (общий путь для P24 в T-14 и фейка): провайдер разбирает тело и проверяет подпись → строка `Payment` блокируется (`FOR UPDATE`) → платёж не `PENDING` (повторное уведомление, отказ, таймаут) — ответ с текущим статусом, ничего не меняется и провайдер не подтверждается (неподтверждённую транзакцию P24 возвращает плательщику); сумма не совпадает с `amountGrosze` → 400 `PAYMENT_AMOUNT_MISMATCH`, ошибка в логе, платёж остаётся `PENDING` до таймаута; последний день разрешения уже прошёл (`validTo` < сегодня по Варшаве: оплата после полуночи) → `Payment.FAILED` (с `providerOrderId` и `rawNotification` для сверки), `Permit.CANCELLED`, провайдер не подтверждается, ответ 200 `FAILED`; иначе `Payment.SUCCEEDED` (`providerOrderId`, `rawNotification`) и `Permit.PAID`, и последним шагом той же транзакции — `confirm` у провайдера (P24 `transaction/verify`): ошибка подтверждения откатывает обе записи, ответ 500, следующее уведомление начнёт заново.
- **Przelewy24** (T-14, REST API v1, developers.przelewy24.pl): покупка регистрирует транзакцию `POST /api/v1/transaction/register` (Basic: `posId` + klucz do raportów; `timeLimit` = `PAYMENT_TIMEOUT_MINUTES`, чтобы P24 не принял оплату после нашего таймаута), `paymentUrl` — `${P24_BASE_URL}/trnRequest/{token}`. P24 уведомляет только об успешной оплате. Уведомление подлинно, если контрольная сумма верна, `merchantId`/`posId` наши и валюта `PLN`; иначе 400 `VALIDATION_FAILED`, ничего не меняется. Подтверждение — `PUT /api/v1/transaction/verify`. Отказ P24 при регистрации или подтверждении → 500 (см. выше).
- **Фейковая оплата:** `POST /payments/fake/:sessionId/complete` — то, что делают кнопки «Zapłać» / «Odrzuć» страницы `FakePaymentProvider`. `PAID` проходит путь уведомления выше (сумма по умолчанию — сохранённая, `amountGrosze` позволяет тесту прислать неверную); `REJECTED` → платёж `FAILED`, разрешение `CANCELLED`. Ответ 200 `{ status }` — статус платежа после вызова. Неизвестный `sessionId` или провайдер не `fake` → 404, не UUID → 400.
- **Таймаут:** платёж, оставшийся `PENDING` 30 минут (`PAYMENT_TIMEOUT_MINUTES`, отсчёт от `Payment.createdAt` по `ClockService`), раз в минуту переводится в `FAILED`, его разрешение — в `CANCELLED`. Платёж, который в этот момент подтверждается (строка заблокирована), пропускается (`SKIP LOCKED`).

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
| POST / GET | `/orgs/:orgId/claims` | ORG_ADMIN | Заявка на водоём (multipart: документ), список заявок организации |
| GET | `/orgs/:orgId/waters` | ORG_ADMIN | Водоёмы, подключённые к организации (выбор водоёмов типа разрешения) |
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
| GET / PATCH | `/admin/claims?status=`, `/admin/claims/:id` | Очередь (старые первыми); `{ decision: APPROVE \| REJECT, comment? }` |
| GET | `/admin/claims/:id/document` | Документ заявки (вложение) |
| POST | `/admin/waters/import` | multipart CSV → `{ created, updated, failed: [{ row, error }] }` |
| PATCH | `/admin/waters/:id` | Правка записи каталога, публикация предложений |
| CRUD | `/admin/rules` | Общие правила |
| CRUD | `/admin/species` | Справочник видов |

Детали (T-10):

- **Импорт каталога:** multipart, поле `file` (UTF-8 CSV, до 1 МБ и 5000 строк; формат — `data/waters/README.md`) → 200 `{ created, updated, failed: [{ row, error }] }`. `row` — номер строки файла, с которой начинается запись (заголовок = 1; пустые строки и переносы внутри полей в кавычках учитываются — как в редакторе), `error` — текст на английском с именем поля (`region: must be ...`), для диагностики администратором, не для перевода. Upsert по `source + sourceRef`: повторный импорт перезаписывает только поля CSV (`name`, `type`, `region`, `externalOwnerName`, `externalInfoUrl`, `lat`, `lng`), статус, организацию, описание и `isPublished` не трогает. Источник истины для полей CSV — файл: ручная правка этих полей (будущий `PATCH /admin/waters/:id`) откатывается следующим импортом того же источника. Строки только из запятых пропускаются. Строка отклоняется (в `failed`, остальные импортируются): неверное поле, `region` вне `REGIONS`, `externalInfoUrl` не `http(s)`, `source = USER`, координаты вне Польши (`POLAND_BOUNDS`) или только одна из них, повтор `source + sourceRef` в файле, геокодер не нашёл место или недоступен. Файл целиком (нет файла, не CSV, неверный заголовок, больше 5000 строк) → 400 `VALIDATION_FAILED`, больше 1 МБ → 413 `VALIDATION_FAILED`; ничего не импортируется.
- Запрос синхронный: каждая строка без координат и без записи в `GeocodeCache` — около 1 с (лимит Nominatim). После 3 сбоев геокодера подряд импорт перестаёт к нему обращаться до конца файла: остальные строки берут координаты только из кэша, иначе попадают в `failed` («skipped»). Первый импорт большого файла — через CLI `pnpm --filter api import:waters <file>` (тот же сервис, без таймаута HTTP).

Детали (T-11, FR-24):

- **Заявка:** `POST /orgs/:orgId/claims`, multipart: поле `fishingWaterId` (UUID) и файл `file` — PDF, JPEG, PNG или WebP до 5 МБ; тип проверяется по содержимому → 201 `ClaimDto` (`PENDING`). Нет файла, другой тип, неверный `fishingWaterId` → 400 `VALIDATION_FAILED` с общим форматом `details.fields` (`file`, `fishingWaterId`); больше 5 МБ → 413 `VALIDATION_FAILED`. Водоём не найден или не опубликован → 404 `NOT_FOUND`; уже `CONNECTED` → 409 `WATER_ALREADY_CONNECTED`; у этой организации уже есть `PENDING`-заявка на него → 409 `CLAIM_ALREADY_PENDING` (одновременные заявки решает частичный индекс `claim_one_pending`, файл проигравшей удаляется). Заявки разных организаций на один водоём допустимы — выбирает суперадмин. Заявка, поданная во время одобрения другой заявки на тот же водоём, либо отклоняется этим одобрением, либо получает `WATER_ALREADY_CONNECTED` — `PENDING` у подключённого водоёма не остаётся (см. `04-data-model.md`).
- **`GET /orgs/:orgId/claims`:** заявки организации, новые первыми: `{ id, status, water: { id, name, region, status }, comment, createdAt, reviewedAt }`.
- **Очередь суперадмина:** `GET /admin/claims?status=` — то же плюс `organization: { id, name, nip, status }` и `documentType` (MIME документа).
- **Решение:** `PATCH /admin/claims/:id` `{ decision, comment? }` (комментарий до 1000 символов, видит организация). `APPROVE` в одной транзакции: водоём → `CONNECTED` с `organizationId` заявки, заявка → `APPROVED`, остальные `PENDING`-заявки на водоём → `REJECTED` (без комментария), запись `CLAIM_APPROVED` в `AuditLog` (`diff`: переход статуса, водоём, организация, комментарий, `rejectedClaimIds`). `REJECT` закрывает только эту заявку (`CLAIM_REJECTED`). Одобрить можно только заявку `ACTIVE`-организации: иначе 403 `ORG_NOT_ACTIVE` (`details.status`) и ничего не меняется — одобрение безвозвратно отклоняет конкурентов, а заблокированная организация не продаёт; отклонить такую заявку можно. Заявка уже рассмотрена (в том числе одобрена в соседней вкладке) → 409 `CLAIM_NOT_PENDING` (`details.status`); водоём тем временем подключён по другой заявке → 409 `WATER_ALREADY_CONNECTED`, ничего не меняется. Из двух одновременных одобрений заявок одного водоёма проходит одно.
- **Документ:** `GET /admin/claims/:id/document` — только суперадмин, `Content-Disposition: attachment` (никогда не открывается в окне сервиса), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. Нет заявки или её файла в хранилище → 404 `NOT_FOUND` (пропавший файл — ещё и ошибка в логе).
- Отличие от T-10: импорт каталога отдаёт ошибку файла как `details.file` (строка), а не в общем формате `details.fields` — оставлено до правки импорта (ROADMAP T-23).

Детали (T-12, FR-07):

- **Тип разрешения:** `{ name, durationDays, priceGrosze, discountKind, waterIds }` — название до 100 символов, срок 1–366 дней, цена 0–1 000 000 грошей (0 — бесплатное), льгота `NONE | JUNIOR | SENIOR`, от 1 до 1000 разных водоёмов (лимиты — `packages/shared/src/permits/permit-types.ts`). Каждый водоём должен быть подключён (`CONNECTED`) к этой организации, иначе 400 `VALIDATION_FAILED` с `details.fields.waterIds`.
- **`GET /orgs/:orgId/permit-types`:** все типы организации, сначала активные, затем по названию: поля типа + `isActive`, `inUse` (есть разрешения этого типа в любом статусе), `waters: [{ id, name }]` (по названию), `createdAt`. `GET /orgs/:orgId/permit-types/:id` — один тип; тип другой организации → 404 `NOT_FOUND`.
- **`PATCH /orgs/:orgId/permit-types/:id`:** любое подмножество полей и `isActive` (`false` — снять с продажи); поле со значением `null` — 400 `VALIDATION_FAILED` (не «оставить как есть»). У проданного типа (`inUse`) срок, льгота и водоёмы зафиксированы (`PERMIT_TYPE_LOCKED_FIELDS`): водоёмы определяют, что покрывает уже проданное разрешение (BR-01), срок и льгота — то, что купил рыбак. Изменение любого из них → 409 `PERMIT_TYPE_IN_USE` (`details.lockedFields`), не применяется ничего из запроса. Те же значения можно прислать (форма целиком), водоёмы сравниваются как множество. Название, цена следующих покупок и `isActive` меняются всегда. Запрос без изменений ничего не пишет.
- **`DELETE /orgs/:orgId/permit-types/:id`:** только тип без разрешений → 204; иначе 409 `PERMIT_TYPE_IN_USE` (тип снимают с продажи).
- **Конкурентная продажа:** изменение и удаление берут строку типа `SELECT … FOR UPDATE` и только после этого считают разрешения (см. `04-data-model.md`).
- **AuditLog:** `PERMIT_TYPE_CREATED` (значения полей), `PERMIT_TYPE_UPDATED` (`{ поле: { from, to } }` только изменённых), `PERMIT_TYPE_DELETED` (снимок типа) — в транзакции действия.
- **`GET /permit-types?waterId=`** (публично): то, что можно купить сейчас, — активные типы водоёма при `CONNECTED` и `ACTIVE`-организации, по сроку, затем обычный перед льготными, затем по названию: `{ id, name, durationDays, priceGrosze, discountKind }`. Неподключённый водоём или заблокированная организация → `[]`; неизвестный или неопубликованный водоём → 404 `NOT_FOUND`; без `waterId` или не-UUID → 400. Без пагинации (у водоёма единицы типов).
- **`GET /permit-types/lowest-prices?waterIds=a,b,…`** (публично): до 100 разных id через запятую (одна страница списка каталога, `LOWEST_PRICES_MAX_WATERS`; повтор → 400) → `[{ waterId, priceGrosze }]` в порядке запроса — минимальная цена активного обычного (`NONE`) типа `ACTIVE`-организации, к которой водоём подключён сейчас (как в `GET /permit-types?waterId=`); водоёмы без такой цены пропускаются. Льготные типы в «od» не входят: цена для подростка вводила бы в заблуждение взрослого. Отдельный эндпоинт, а не поле `GET /waters`: `PermitsModule` зависит от `WatersModule`, обратная зависимость дала бы цикл модулей.
- **`GET /orgs/:orgId/waters`:** подключённые водоёмы организации по названию: `{ id, name, type, region }`.

## Коды ошибок

Определены в `packages/shared/src/errors.ts`. Минимальный набор:

| HTTP | Код |
| --- | --- |
| 400 | `VALIDATION_FAILED`, `INVALID_TOKEN`, `PAYMENT_AMOUNT_MISMATCH` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `ORG_SCOPE_VIOLATION`, `ORG_NOT_ACTIVE` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `NIP_TAKEN`, `CLAIM_ALREADY_PENDING`, `WATER_ALREADY_CONNECTED`, `CLAIM_NOT_PENDING`, `PERMIT_TYPE_IN_USE` |
| 422 | Бизнес-правила: `PERMIT_START_IN_PAST`, `DISCOUNT_NOT_ELIGIBLE`, `PERMIT_TYPE_INACTIVE`, `EDIT_WINDOW_CLOSED`, `PERMIT_NOT_REVOCABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` — необработанное исключение; `message` не раскрывает детали, они только в логе |

Ошибки самого фреймворка (неизвестный маршрут, отказ guard, битый JSON) кода не несут — фильтр подбирает его по HTTP-статусу: 401 → `UNAUTHENTICATED`, 403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 429 → `RATE_LIMITED`, прочие 4xx → `VALIDATION_FAILED`, 5xx → `INTERNAL_ERROR` (с фиксированным `message`). Статус ответа при этом сохраняется. Объект ошибки со своим `statusCode`, брошенный не фреймворком (например, HTTP-клиентом внешнего сервиса), считается необработанным исключением → 500.

Коды нарушений улова (`BR-*`) приходят не как HTTP-ошибка, а в `violations` ответа синхронизации — см. `02-business-rules.md`.
