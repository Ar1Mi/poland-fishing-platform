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
| GET | `/me/permits` | auth | Мои разрешения с вычисленным статусом и `qrToken` (T-15) |
| GET | `/me/permits/:id` | auth | Детали с вычисленным статусом (T-13) и `qrToken` (T-15) |
| GET | `/me/permits/:id/pdf` | auth | PDF с QR (T-15) |
| GET | `/me/permits/:id/offline-bundle` | auth | Разрешение + QR + эффективные правила для IndexedDB (T-21: правила появляются в T-16/T-17, потребитель — PWA) |
| POST | `/payments/p24/notification` | public (подпись) | Уведомление P24 (`urlStatus`) → 200 `{ status }` |
| POST | `/payments/fake/:sessionId/complete` | public, только `PAYMENTS_PROVIDER=fake` | Симуляция оплаты: `{ outcome: PAID \| REJECTED, amountGrosze? }` |
| CRUD | `/me/external-permits` | auth | Внешние разрешения |
| GET | `/me/external-permits/:id/register.pdf?season=` | auth | PDF-реестр для владельца водоёма |

Детали (T-13, FR-08):

- **Покупка:** `POST /permits` `{ permitTypeId, validFrom }` → 201 `{ permit, paymentUrl }`. Проверки по порядку: `validFrom` — дата `YYYY-MM-DD` (иначе 400); раньше сегодняшней варшавской даты → 422 `PERMIT_START_IN_PAST` (`details.today`); позже чем через 365 дней → 400 `VALIDATION_FAILED` (`details.fields.validFrom`); тип не найден → 404 `NOT_FOUND`; тип снят с продажи или организация не `ACTIVE` → 422 `PERMIT_TYPE_INACTIVE`; возраст на `validFrom` не подходит к льготе → 422 `DISCOUNT_NOT_ELIGIBLE` (`details.discountKind`). Правила дат и возраста — `02-business-rules.md` → «Уточнения».
- `permit` — тот же объект, что `GET /me/permits/:id`; `validTo = validFrom + durationDays − 1`, `pricePaidGrosze` — цена типа на момент покупки. Разрешение (`PENDING_PAYMENT`) и `Payment` (`PENDING`, `sessionId` — случайный UUID) пишутся в одной короткой транзакции, транзакция регистрируется у провайдера после неё; `paymentUrl` — страница оплаты провайдера. Провайдер отказал в регистрации → платёж `FAILED`, разрешение `CANCELLED`, ответ 500.
- **Бесплатный тип** (цена 0): разрешение сразу `PAID`, `Payment` не создаётся, `paymentUrl` ведёт прямо на `${WEB_URL}/payment/return?permitId=…`.
- **Возврат браузера:** провайдер возвращает покупателя на `${WEB_URL}/payment/return?permitId=…`; возврат ничего не меняет, страница опрашивает `GET /me/permits/:id`.
- **`GET /me/permits/:id`:** `{ id, number, status, validFrom, validTo, pricePaidGrosze, permitType: { id, name, durationDays, discountKind }, organization: { id, name }, waters: [{ id, name }], createdAt, qrToken }`; `waters` (T-18) — водоёмы типа, которые покрывает разрешение (BR-01), по названию: из них форма улова предлагает водоём; `status` — вычисленный (`PENDING_PAYMENT`, `CANCELLED`, `REVOKED` как есть; `PAID` → `SCHEDULED` / `ACTIVE` / `EXPIRED`, ADR-0005). Чужое разрешение неотличимо от несуществующего → 404 `NOT_FOUND`.
- **`qrToken`** (T-15, ADR-0006): JWS EdDSA (Ed25519) `{ sub: permitId, exp }`, без `iat`, поэтому у разрешения всегда один и тот же токен; `exp` — конец последнего дня по Варшаве (`warsawDayEnd(validTo)`: следующая местная полночь). Есть только при статусе `SCHEDULED` или `ACTIVE`, иначе `null`. QR кодирует `${WEB_URL}/verify/<qrToken>`; токен доказывает лишь, что его выпустила платформа, — проверка (T-19) читает и текущий статус.
- **`GET /me/permits`** (T-15): все разрешения пользователя (тот же объект, что `GET /me/permits/:id`), по `validFrom` убыв., затем `createdAt` убыв.; без пагинации — их единицы за сезон.
- **`GET /me/permits/:id/pdf`** (T-15): A4, `application/pdf`, `Content-Disposition: attachment; filename="<number>.pdf"`. У всех маршрутов `/me/permits*` — `Cache-Control: no-store` (персональные данные и `qrToken`). Содержит владельца (имя, год рождения — как у инспектора в `07-security.md`, номер карты, если есть), организацию, тип и льготу, срок, цену, водоёмы типа и векторный QR с тем же URL. Только для `SCHEDULED`/`ACTIVE`, иначе 422 `PERMIT_NOT_VALID` (`details.status`); чужое → 404. Документ на польском независимо от языка интерфейса; шрифт Onest (OFL) лежит в `apps/api/assets/fonts` — встроенные шрифты PDF без польских букв.
- **Уведомление** (общий путь для P24 в T-14 и фейка): провайдер разбирает тело и проверяет подпись → строка `Payment` блокируется (`FOR UPDATE`) → платёж не `PENDING` (повторное уведомление, отказ, таймаут) — ответ с текущим статусом, ничего не меняется и провайдер не подтверждается (неподтверждённую транзакцию P24 возвращает плательщику); сумма не совпадает с `amountGrosze` → 400 `PAYMENT_AMOUNT_MISMATCH`, ошибка в логе, платёж остаётся `PENDING` до таймаута; последний день разрешения уже прошёл (`validTo` < сегодня по Варшаве: оплата после полуночи) → `Payment.FAILED` (с `providerOrderId` и `rawNotification` для сверки), `Permit.CANCELLED`, провайдер не подтверждается, ответ 200 `FAILED`; иначе `Payment.SUCCEEDED` (`providerOrderId`, `rawNotification`) и `Permit.PAID`, и последним шагом той же транзакции — `confirm` у провайдера (P24 `transaction/verify`): ошибка подтверждения откатывает обе записи, ответ 500, следующее уведомление начнёт заново.
- **Przelewy24** (T-14, REST API v1, developers.przelewy24.pl): покупка регистрирует транзакцию `POST /api/v1/transaction/register` (Basic: `posId` + klucz do raportów; `timeLimit` = `PAYMENT_TIMEOUT_MINUTES` сужает окно оплаты после нашего таймаута, но не исключает её: опоздавшее уведомление застаёт платёж `FAILED`, verify не вызывается, P24 возвращает деньги плательщику), `paymentUrl` — `${P24_BASE_URL}/trnRequest/{token}`. P24 уведомляет только об успешной оплате. Уведомление подлинно, если контрольная сумма верна, `merchantId`/`posId` наши и валюта `PLN`; иначе 400 `VALIDATION_FAILED`, ничего не меняется. Подтверждение — `PUT /api/v1/transaction/verify`. Маршрут работает только при `PAYMENTS_PROVIDER=p24`, иначе 404 (фейковый адаптер подпись не проверяет). Тело — формат провайдера, его проверяет адаптер (Zod), а не DTO. Отказ P24 при регистрации или подтверждении → 500 (см. выше).
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
{ "results": [ { "clientId": "uuid", "id": "uuid", "status": "ACCEPTED", "violations": [] },
               { "clientId": "uuid", "id": "uuid", "status": "REJECTED",
                 "violations": [ { "code": "DAILY_COUNT_LIMIT", "ruleId": "BR-04", "details": { "limit": 2, "alreadyKept": 2 } } ] } ] }
```

Повторная отправка того же `clientId` возвращает сохранённый результат (идемпотентность).

Детали (T-18):

- **Синхронизация:** 1–100 элементов (`CATCH_SYNC_MAX_ITEMS`), ровно одно из `permitId` / `externalPermitId`, каждый `clientId` один раз в пакете. `caughtAt` — момент со смещением (RFC 3339, существующий день: `…T10:00:00` без `Z` и `02-30` → 400) в сезонах 2000–2100 по варшавскому году (`CATCH_SEASONS`): улов вне них нельзя было бы ни увидеть в `GET /me/catches`, ни удалить, а год 10000 ломал бы расчёт суток. UUID-поля приводятся к нижнему регистру — повтор `clientId` в другом регистре тот же улов. `lengthCm` — целое 1–400, `weightG` — целое 1–300 000 или `null`; `lat`/`lng` — оба или ни одного. Всё пакетом в одной транзакции под блокировкой реестра пользователя (`04-data-model.md` → «Ключевые решения»): новые уловы проверяются `validateCatch` в порядке `caughtAt` (при равенстве — по `clientId`), ответ — в порядке запроса. Улов, нарушивший правило, **тоже сохраняется** — `REJECTED` с `violations`; у обоих статусов есть `id` (отклонённый можно поправить или удалить). Уже сохранённый `clientId` этого пользователя возвращает сохранённый результат без новой проверки, даже если данные другие.
- **Отказ всему пакету (400 `VALIDATION_FAILED`, ничего не пишется):** неизвестные водоём или вид, разрешение не существует или чужое, `clientId` занят уловом другого пользователя (`clientId is already used`, без указания чей) — `details.fields['items.N.<поле>']`. Это ошибки ввода, а не нарушения правил: устройство отправляет только id, полученные от сервера.
- **Контекст проверки:** платформенное разрешение — сохранённый статус, даты и водоёмы типа; внешнее — даты и водоёмы, указанные рыбаком, и только общие правила. Правило — самое строгое на водоёме улова (`02-business-rules.md`); `sameDayKept` — принятые оставленные уловы пользователя за сутки улова **на всех водоёмах** и принятые раньше в том же пакете; `now` — `ClockService`.
- **`GET /me/catches`:** `season` — варшавский календарный год `caughtAt` (2000–2100, по умолчанию текущий), `permitId` — только уловы этого разрешения. Без пагинации — реестр одного сезона; по `caughtAt` убыв., затем `createdAt` убыв. Элемент: `{ id, clientId, permitId, externalPermitId, water: { id, name }, speciesId, caughtAt, lengthCm, weightG, kept, lat, lng, status, violations, editableUntil, createdAt }`; `editableUntil` — конец окна BR-07. `Cache-Control: no-store`.
- **`PATCH /catches/:id`:** меняет `speciesId`, `fishingWaterId`, `caughtAt`, `lengthCm`, `weightG` (`null` снимает), `kept`; разрешение и положение — нет (400 как неизвестное поле). Улов проверяется снова — статус и `violations` заменяются результатом (`02-business-rules.md` → «Уточнения (T-18)»); сам улов в лимит не входит. Ответ 200 — улов в формате списка. Одновременная правка того же улова не теряется: запись условна, правка повторяется с новой строкой (`04-data-model.md`). Окно закрыто (для сохранённого или нового `caughtAt`) → 422 `EDIT_WINDOW_CLOSED` с `details.editableUntil`; неизвестные вид или водоём → 400.
- **`DELETE /catches/:id`:** → 204, под той же блокировкой реестра; после окна → 422 `EDIT_WINDOW_CLOSED`. Чужой улов неотличим от несуществующего → 404 у обоих маршрутов.

### Проверка и контроль

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| GET | `/verify/:token` | public / инспектор | Публично: `valid`, тип, срок, инициалы. Инспектор или админ организации-владельца: + имя, год рождения, уловы за сегодня, `permitId` |
| POST | `/orgs/:orgId/inspections` | INSPECTOR, ORG_ADMIN своей орг. | `{ permitId, result, notes?, lat?, lng? }` |
| GET | `/orgs/:orgId/inspections?season=` | ORG_ADMIN | Протоколы |

Фронтенд-маршрут `/verify/:token` (то, что открывает камера телефона) вызывает `GET /api/v1/verify/:token`.

Детали (T-19):

- **Доступ к проверке:** маршрут открыт гостям (`@OptionalAuth()`): без заголовка `Authorization` — гость; с заголовком токен проверяется как везде (неверный → 401 `UNAUTHENTICATED`, истёкший → 401 `TOKEN_EXPIRED`, веб обновляет его и повторяет запрос), а не молча превращает запрос в гостевой. Следствие для деплоя (T-30): если стенд закрыть HTTP Basic Auth, браузер будет слать `Authorization: Basic …` и проверка ответит 401 — закрывать стенд иначе (IP, VPN). Расширенная часть — `INSPECTOR` или `ORG_ADMIN` организации-владельца типа разрешения (`01-requirements.md` → роли), только пока она `ACTIVE`; инспектор другой организации, суперадмин без членства и член заблокированной организации видят публичную часть. Ответ всегда 200 и `Cache-Control: no-store`.
- **Ответ:** `{ valid, permit, inspection }`. `valid` — токен подлинный и вычисленный статус `ACTIVE` сейчас. `permit` (публично): `status` (ADR-0005), `validFrom`, `validTo`, `permitType: { name }`, `organization: { id, name }`, `waters: [{ id, name }]` (водоёмы типа — что покрывает разрешение, BR-01; не персональные данные, без них проверяющий не знает, действует ли разрешение здесь), `holderInitials` (`Ł. Ż.`). `permit = null` — токен поддельный, повреждённый, истёкший (`exp` — конец последнего дня) или указывает на неизвестное разрешение или анонимизированного владельца: ответы неразличимы. Аннулированное разрешение с подлинным токеном → `valid: false`, `status: REVOKED`. `inspection` (расширенно): `permitId`, `number`, `holder: { firstName, lastName, birthYear }`, `catchesToday` — уловы **этого разрешения** за текущие варшавские сутки (все часы суток, и в дни перевода часов), `ACCEPTED` и `REJECTED`, новые сверху: `{ id, water: { id, name }, speciesId, caughtAt, lengthCm, weightG, kept, status, violations }` — без координат улова, `clientId` и окна правки; уловы на других разрешениях и водоёмах организация не видит (минимизация RODO). Статус и «сегодня» считаются от одного момента `ClockService`. Токен из пути маскируется в логе запросов (`[Redacted]`).
- **Протокол:** `:orgId` в любом регистре букв (как его пропускают guards); `permitId` — разрешение организации `:orgId` в любом статусе (протокол `VIOLATION` по аннулированному — обычный случай); разрешение другой организации неотличимо от несуществующего → 404 `NOT_FOUND`. `result` — `OK` / `VIOLATION`; `notes` — до 2000 символов (`INSPECTION_NOTES_MAX_LENGTH`), обрезается, пустые → `null`; `lat`/`lng` — оба или ни одного. `performedAt` — `ClockService`, `inspectorId` — из токена, `organizationId` — `:orgId`. Ответ 201 — протокол в формате списка.
- **Список:** `season` — варшавский год `performedAt` (2000–2100, по умолчанию текущий), без пагинации, по `performedAt` убыв. Элемент: `{ id, permit: { id, number, permitType: { name }, holder: { firstName, lastName } | null }, inspector: { id, firstName, lastName } | null, performedAt, result, notes, lat, lng }`; `null` — аккаунт анонимизирован. `INSPECTOR` без роли админа → 403 `FORBIDDEN`.

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

Детали (T-16, FR-16, ADR-0008):

- **Правило:** `{ speciesId, minLengthCm, closedFrom, closedTo, dailyLimitCount, dailyLimitWeightG }` (+ `fishingWaterId` у `/orgs/:orgId/rules`). Параметр пропущен или `null` — нет ограничения. Пределы и формат `MM-DD` — `packages/shared/src/rules/species-rules.ts` (`02-business-rules.md` → «Три уровня правил»). Правило, которое ничего не ограничивает, → 400 `VALIDATION_FAILED` с `details.fields.rule`; половина периода — с полем недостающего конца; неизвестный вид — `details.fields.speciesId`.
- **`/orgs/:orgId/rules`** (ORG_ADMIN): правила организации (`fishingWaterId` пропущен или `null`) и её водоёмов. Водоём должен быть подключён к этой организации, иначе 400 `VALIDATION_FAILED` (`details.fields.fishingWaterId`). Правил одного вида на уровне может быть несколько — они сливаются. Список: по `namePl` вида, внутри вида правило организации, затем водоёмы по названию; ответ `{ id, speciesId, water: { id, name } | null, …параметры, ineffective, updatedAt }`; `ineffective` — параметры, которые не действуют из-за более строгого верхнего уровня (`02-business-rules.md`), у общих правил всегда `[]`. Правило другого уровня или другой организации → 404 `NOT_FOUND`.
- **`/admin/rules`** (суперадмин): общие правила, по одному на вид — второе → 409 `RULE_ALREADY_EXISTS` (`details.speciesId`; гонку решает индекс `rule_one_general`). `fishingWaterId` в теле → 400. Правило организации здесь → 404.
- **`PATCH …/rules/:id`:** только параметры: пропущенный не меняется, `null` снимает ограничение; вид и уровень не меняются (`speciesId`, `fishingWaterId` в теле → 400; чтобы сменить — удалить и создать). Результат проверяется целиком, как при создании. Запрос без изменений ничего не пишет. `DELETE` → 204.
- **AuditLog:** `RULE_CREATED` (вид, уровень, параметры), `RULE_UPDATED` (`{ параметр: { from, to } }` только изменённых), `RULE_DELETED` (снимок) — в транзакции действия; одинаково для общих и правил организации.
- **`GET /waters/:id/rules`** (публично): `[{ speciesId, minLengthCm, dailyLimitCount, dailyLimitWeightG, closedPeriods: [{ from, to }] }]` по `namePl` вида; виды без правил не возвращаются. Применимые уровни — `02-business-rules.md`. Неизвестный или неопубликованный водоём → 404, не-UUID → 400.

## Коды ошибок

Определены в `packages/shared/src/errors.ts`. Минимальный набор:

| HTTP | Код |
| --- | --- |
| 400 | `VALIDATION_FAILED`, `INVALID_TOKEN`, `PAYMENT_AMOUNT_MISMATCH` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `ORG_SCOPE_VIOLATION`, `ORG_NOT_ACTIVE` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `NIP_TAKEN`, `CLAIM_ALREADY_PENDING`, `WATER_ALREADY_CONNECTED`, `CLAIM_NOT_PENDING`, `PERMIT_TYPE_IN_USE`, `RULE_ALREADY_EXISTS` |
| 422 | Бизнес-правила: `PERMIT_START_IN_PAST`, `DISCOUNT_NOT_ELIGIBLE`, `PERMIT_TYPE_INACTIVE`, `EDIT_WINDOW_CLOSED`, `PERMIT_NOT_REVOCABLE`, `PERMIT_NOT_VALID` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` — необработанное исключение; `message` не раскрывает детали, они только в логе |

Ошибки самого фреймворка (неизвестный маршрут, отказ guard, битый JSON) кода не несут — фильтр подбирает его по HTTP-статусу: 401 → `UNAUTHENTICATED`, 403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 429 → `RATE_LIMITED`, прочие 4xx → `VALIDATION_FAILED`, 5xx → `INTERNAL_ERROR` (с фиксированным `message`). Статус ответа при этом сохраняется. Объект ошибки со своим `statusCode`, брошенный не фреймворком (например, HTTP-клиентом внешнего сервиса), считается необработанным исключением → 500.

Коды нарушений улова (`BR-*`) приходят не как HTTP-ошибка, а в `violations` ответа синхронизации — см. `02-business-rules.md`.
