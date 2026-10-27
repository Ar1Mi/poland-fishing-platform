# ROADMAP

Задачи берутся по порядку; «Зависит от» должно быть `done`. Статусы: `todo` → `doing` → `done`. Агент меняет статус в таблице и отмечает критерии в описании задачи.

Этапы соответствуют плану диплома (20 недель): 1–3 анализ и проектирование (готово), 4–5 каркас, 6–10 вертикальный срез, 11–14 расширение, 15–17 качество и деплой, 18–20 текст и защита.

## Сводка

| ID | Задача | Этап | Зависит от | Статус |
| --- | --- | --- | --- | --- |
| T-01 | Монорепозиторий и инструменты | Каркас | — | done |
| T-02 | Пакет `shared`: enum, коды ошибок, утилиты времени | Каркас | T-01 | done |
| T-03 | Каркас API (NestJS) | Каркас | T-01 | done |
| T-04 | БД: Docker Compose, Prisma-схема v1, seed видов и общих правил | Каркас | T-03 | done |
| T-05 | Каркас web (React, i18n, API-клиент) | Каркас | T-01 | done |
| T-06 | CI GitHub Actions | Каркас | T-03, T-05 | done |
| T-07 | Аутентификация | Каркас | T-04 | done |
| T-08 | Организации, членство, guards | Каркас | T-07 | done |
| T-09 | Каталог: API и карта | Срез | T-04, T-05 | done |
| T-10 | Импорт каталога CSV + геокодирование | Срез | T-09 | done |
| T-11 | Claim водоёма | Срез | T-08, T-09 | done |
| T-12 | Типы разрешений | Срез | T-11 | done |
| T-13 | Покупка разрешения + FakePaymentProvider | Срез | T-12 | done |
| T-14 | Przelewy24 sandbox | Срез | T-13 | doing |
| T-15 | Мои разрешения, QR-токен, PDF | Срез | T-13 | done |
| T-16 | Правила: CRUD и слияние уровней | Срез | T-08, T-02 | todo |
| T-17 | CatchValidator | Срез | T-16 | todo |
| T-18 | Реестр уловов (онлайн) | Срез | T-15, T-17 | todo |
| T-19 | Проверка QR и протокол контроля | Срез | T-15 | todo |
| T-20 | **MVP-ворота:** E2E сквозной сценарий | Срез | T-18, T-19 | todo |
| T-21 | PWA и офлайн-запись уловов | Расширение | T-20 | todo |
| T-22 | Внешние разрешения + PDF-реестр | Расширение | T-18 | todo |
| T-23 | Приглашения, аннулирование, админка организации | Расширение | T-20 | todo |
| T-24 | Статистика и CSV | Расширение | T-18 | todo |
| T-25 | Email-уведомления и планировщик | Расширение | T-15 | todo |
| T-26 | RODO и AuditLog | Расширение | T-20 | todo |
| T-27 | (C) Фото улова, предложение водоёма, личная статистика | Расширение | T-21 | todo |
| T-28 | Тесты безопасности и IDOR | Качество | T-23 | todo |
| T-29 | Нагрузка, Lighthouse, доступность | Качество | T-21 | todo |
| T-30 | Продакшн-сборка и деплой на VPS | Качество | T-20 | todo |
| T-31 | Локализация en/ru | Текст | T-27 | todo |
| T-32 | UML и BPMN для диплома | Текст | T-20 | todo |
| T-33 | Юзабилити-тест и скриншоты | Текст | T-30 | todo |

---

## Каркас

### T-01 Монорепозиторий и инструменты
Ссылки: `03-architecture.md`, ADR-0003.
- [x] pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`; Node LTS в `.nvmrc` и `engines`.
- [x] TypeScript strict, общий `tsconfig.base.json`.
- [x] ESLint (flat config) + Prettier; правило запрета строк в JSX для `apps/web` (i18next-plugin или аналог).
- [x] Корневые скрипты: `dev`, `build`, `lint`, `typecheck`, `test`, `format`.
- [x] Husky + lint-staged (prettier, eslint на изменённых файлах).

### T-02 Пакет `shared`
Ссылки: `02-business-rules.md`, `05-api.md` (коды ошибок), ADR-0005.
- [x] Enum, совпадающие с Prisma (`PermitStatus`, `WaterType`, …) — все 15 из `04-data-model.md` в `src/enums.ts`; тест на совпадение со схемой перенесён критерием в T-04 (схемы ещё нет).
- [x] `ErrorCode` и `CatchErrorCode` — `src/errors.ts`, `src/errors.test.ts`.
- [x] Утилиты времени `Europe/Warsaw`: `warsawDate(date)`, `isInClosedPeriod(date, from, to)` с переходом через Новый год — `src/time/warsaw.test.ts`.
- [x] `effectivePermitStatus(permit, now)` + тесты — `src/permits/effective-status.test.ts`.
- [x] Сборка ESM + d.ts, Vitest — `pnpm --filter @lowisko/shared build` / `test` (33 теста).

### T-03 Каркас API
Ссылки: `03-architecture.md` → «Сквозные механизмы».
- [x] NestJS, конфиг с Zod-валидацией env, `.env.example`. — `src/config/env.spec.ts`; запуск без `API_URL` завершается ошибкой «Invalid environment variables».
- [x] Глобальные: `ValidationPipe`, `HttpExceptionFilter` → `{ code, message, details }`, `DomainError`, nestjs-pino, helmet, CORS на `WEB_URL`. — `test/error-format.e2e-spec.ts`, `test/health.e2e-spec.ts` (заголовки helmet, CORS, request-id).
- [x] Swagger на `/api/docs`, префикс `/api/v1`, `GET /health`. — `test/swagger.e2e-spec.ts`; health отдаётся как `/api/v1/health`.
- [x] `ClockService`. — `/health` возвращает время подменённых часов.
- [x] Jest + один интеграционный тест `/health`. — `pnpm --filter api test` (36), `pnpm --filter api test:e2e` (17).
- [x] `apps/api` зависит от `@lowisko/shared` (`workspace:*`); Jest импортирует пакет (он ESM-only — проверить загрузку из `dist` под Jest, а не только `require` в Node). — тесты фильтра и формата ошибок импортируют `ErrorCode` из `dist`; нужен флаг `--experimental-vm-modules`.

### T-04 БД
Ссылки: `04-data-model.md`, ADR-0010.
- [x] `docker-compose.yml`: postgres:16, mailpit. — `docker compose up -d db mailpit`, оба сервиса `healthy`.
- [x] Prisma 7.x (фиксированная версия), `prisma.config.ts`, `@prisma/adapter-pg`. — 7.10.0; клиент генерируется в `postinstall`.
- [x] `schema.prisma` по документу; первая миграция с SQL-ограничениями из раздела «SQL-ограничения». — `prisma/migrations/20261018095038_init`, `test/database-constraints.e2e-spec.ts`.
- [x] `PrismaService`, последовательность номеров разрешений. — `src/database/`, `test/permit-number.e2e-spec.ts` (смена года по Варшаве, конкурентные запросы, откат транзакции).
- [x] Seed: ~15 видов (pl/en/ru) и общие правила; значения wymiarów i okresów ochronnych — по актуальному rozporządzeniu, источник указан комментарием в seed. — 20 видов, 16 правил по Dz.U. 2023 poz. 1373 (`prisma/reference-data.ts`); идемпотентность — `test/seed.e2e-spec.ts`. Демо-данные (`SEED_DEMO`) — критерий T-20.
- [x] Testcontainers-хелпер для интеграционных тестов. — `test/db/` (контейнер на прогон, БД-копия шаблона на файл), `test/factories`.
- [x] Тест: enum в `packages/shared/src/enums.ts` совпадают с enum сгенерированного Prisma-клиента (ADR-0003; перенесено из T-02). — `src/database/enums.spec.ts`.

### T-05 Каркас web
Ссылки: `06-frontend.md`, `10-design-system.md`.
- [x] Vite + React + TS, React Router, TanStack Query, Tailwind + shadcn/ui.
- [x] Тема Tailwind с токенами дизайн-системы, шрифты из бандла (`@fontsource`), базовые компоненты: `Button`, `Input`, `Badge`, `Alert`, `Card`.
- [x] react-i18next: `pl` по умолчанию, `en`, `ru`, переключатель языка.
- [x] API-клиент: `pnpm gen:api` (openapi-typescript) + `openapi-fetch`, обработка `{ code }` ошибок с переводом.
- [x] Layout mobile-first, страница 404, Vitest + Testing Library.

### T-06 CI
Ссылки: `08-testing-and-infra.md` → «CI».
- [x] `ci.yml`: install, lint, typecheck, unit, интеграционные, build.
- [x] Кэш pnpm; бейдж в README.
- [x] `packages/shared` собран до `lint`, `typecheck` и `test` (типизированный ESLint и приложения видят пакет через `dist`); проверить на чистом клоне.
- [x] `apps/web/src/shared/api/schema.d.ts` не коммитится: job, который запускает `lint`/`typecheck` web не через корневые скрипты, сначала вызывает `pnpm gen:api`.
- [x] Снять `--if-present` с корневых `build` и `test` (все пакеты уже имеют эти скрипты), чтобы пакет без тестов не выпадал из CI молча.

### T-07 Аутентификация
FR-01, FR-02. Ссылки: `07-security.md`.
- [x] register (+ письмо в Mailpit), verify-email, login, refresh с ротацией и обнаружением повторного использования, logout, forgot/reset. — `modules/auth`, `modules/notifications` (nodemailer → `SMTP_URL`); `test/auth.e2e-spec.ts`.
- [x] argon2id, throttler на login. — хеш `$argon2id$` проверяется тестом регистрации; 5 попыток/мин на IP + email → 429 `RATE_LIMITED`, другой email с того же IP не блокируется.
- [x] `JwtAuthGuard` глобально, `@Public()`, `@CurrentUser()`. — `APP_GUARD` в `AuthModule`; `access-token.service.spec.ts` (истечение, `alg: none`, чужой ключ).
- [x] `/me` GET/PATCH. — `test/me.e2e-spec.ts` (нельзя сменить email и `isSuperAdmin`, дата рождения не в будущем по Варшаве).
- [x] Web: страницы входа/регистрации/сброса, хранение access в памяти, тихий refresh. — `features/auth`, `shared/auth/session.ts` (один общий refresh, повтор после 401); язык берётся из профиля; проверено на 375 px.
- [x] Интеграционные тесты всех сценариев, включая повторное использование refresh. — 128 интеграционных тестов API, 78 тестов web; лимиты на все публичные auth-маршруты (по итогам ревью).

### T-08 Организации и guards
FR-03.
- [x] `POST /orgs` (заявитель → ORG_ADMIN, статус PENDING), `/me/orgs`, `/admin/orgs` активация/блокировка. — `modules/organizations`; `test/orgs.e2e-spec.ts` (NIP с контрольной суммой, `NIP_TAKEN` в т.ч. при одновременных заявках, закрыто для не-суперадминов).
- [x] `RolesGuard`, `@SuperAdmin()`, `OrgScopeGuard` (+ проверка `ORG_NOT_ACTIVE`). — `test/org-guards.e2e-spec.ts` на тестовом контроллере: роли, PENDING/BLOCKED, неизвестный и не-UUID `orgId`, суперадмин без членства, снятый флаг суперадмина; `org-access.service.spec.ts` (одно чтение членства на запрос).
- [x] Тестовый хелпер «запрос от админа чужой организации → 403». — `expectForeignOrgAdminForbidden` и `loginOrgMember` в `test/org-helpers.ts`.
- Запись смены статуса организации в AuditLog отложена до T-26 (интерсептора ещё нет).

## Вертикальный срез

### T-09 Каталог: API и карта
FR-06, FR-23.
- [x] `GET /waters` с фильтрами и `bbox`, `GET /waters/:id`, `GET /species`. — `modules/waters`, `modules/rules` (species); `test/waters.e2e-spec.ts` (фильтры, поиск с `%`/`_`, границы bbox, потолок 2000 и `truncated`, неопубликованные → 404), `test/species.e2e-spec.ts`. Без пагинации, с потолком — решение записано в `05-api.md` → «Детали (T-09)».
- [x] Карта (react-leaflet, кластеры), список/поиск, карточка водоёма: не подключён → владелец и ссылка; подключён → организация и метка «Zezwolenia online». — `features/catalog`, `catalog-pages.test.tsx`; проверено в браузере на 375 px (тайлы OSM, кластеры, попап, поиск с приближением, переход к карточке).
- Список типов разрешений на карточке и цена «od» в списке перенесены в T-12 (нужен `PermitsModule`, `GET /permit-types?waterId=`).

### T-10 Импорт каталога
FR-22. Ссылки: `08-testing-and-infra.md` → «Данные каталога».
- [x] `POST /admin/waters/import` (CSV), upsert по `source + sourceRef`, отчёт `{ created, updated, failed }` — `apps/api/test/waters-import.e2e-spec.ts`.
- [x] Геокодер с лимитом 1 req/s, `GeocodeCache`, User-Agent из env; в тестах — фейк — `min-interval-limiter.spec.ts`, `nominatim-geocoder.spec.ts`, `FakeGeocoder`; e2e «кэширует и „не найдено“», «сбой не кэшируется».
- [x] CLI-скрипт `pnpm --filter api import:waters data/waters/<file>.csv` — проверен на dev-БД: повторный запуск даёт `updated` вместо `created`.
- [x] `data/waters/README.md` с форматом и `mazowieckie.sample.csv` (несколько строк для проверки; полный список собирает автор).
- [x] Из T-09: импорт отклоняет `region` вне `REGIONS` и `externalInfoUrl` не http(s) (`water-csv.spec.ts`, e2e); индекс для `bbox` — не нужен при 10³–10⁴ строк, решение записано в `04-data-model.md`.

### T-11 Claim водоёма
FR-24.
- [x] Подача с документом (StorageService, лимиты файлов), список своих заявок. — `POST/GET /orgs/:orgId/claims`; `StorageService` (`common/storage`, тип по сигнатуре через `file-type`); `test/claims.e2e-spec.ts`: PDF/PNG по содержимому, текст под видом PDF → 400 без файла на диске, > 5 МБ → 413, повторная и одновременная заявка → 409 и удалённый файл, INSPECTOR/чужая/неактивная организация → 403; `storage.service.spec.ts` (ключи вне корня отклоняются).
- [x] Одобрение/отклонение суперадмином в одной транзакции (см. `04-data-model.md`), AuditLog. — `PATCH /admin/claims/:id`, `AuditService.record(tx, …)`; e2e: одобрение подключает водоём и отклоняет конкурентов, отклонение с комментарием, `CLAIM_NOT_PENDING` (в т.ч. двойное одобрение одной заявки), одобрение для `BLOCKED`/`PENDING`-организации → `ORG_NOT_ACTIVE` без изменений, гонки «одобрение + одобрение», «одобрение + отклонение», «одобрение + новая заявка» (без `FOR SHARE` последний тест падает — проверено), откат без записи в журнале; `GET /admin/claims/:id/document` — вложение с `nosniff` и `no-store`, 404 при пропавшем файле.
- [x] UI в разделах организации и админа. — `/org` (мои организации), `/org/:orgId/claims` (форма с поиском `UNCLAIMED`-водоёма или водоёмом с карточки, список заявок), `/admin/claims` (очередь с фильтром, документ, решение с подтверждением одобрения); ссылка «Złóż wniosek» на карточке водоёма; `claims-pages.test.tsx`, `orgs-pages.test.tsx`, `catalog-pages.test.tsx`. Сценарий проверен в браузере на 375 px против реального API: заявка с PDF (файл на диске совпал), одобрение, водоём `CONNECTED`, запись `CLAIM_APPROVED`.
- Из T-11 на потом: (1) одобрение меняет `FishingWater.updatedAt`, который карточка показывает как «дату данных», — к вопросу T-23 об отдельной дате импорта; (2) импорт каталога (T-10) отдаёт ошибку файла как `details.file`, а не в общем формате `details.fields` — привести при правке импорта (T-23); (3) срок хранения документов claim (в договорах бывают персональные данные), удаление файлов отклонённых заявок — T-26 (RODO); (4) запись в AuditLog для смены статуса организации и импорта — T-26, `AuditService` уже есть; (5) проигравшие заявки при одобрении попадают в журнал только списком `rejectedClaimIds` в записи одобренной — поиск по `(entity, entityId)` их не находит; решить в T-26 вместе с интерсептором.

### T-12 Типы разрешений
FR-07.
- [x] CRUD `/orgs/:orgId/permit-types`, только по своим подключённым водоёмам. — `modules/permits` (`PermitTypesService`), `GET /orgs/:orgId/waters`; `test/permit-types.e2e-spec.ts` (64 теста): водоём чужой, неподключённый или неизвестный → 400 и ничего не создано, лимиты полей, `null` в любом поле PATCH → 400 без изменений и записи в журнале, INSPECTOR и админ чужой организации → 403 на каждом маршруте (включая `GET /orgs/:orgId/waters`), тип чужой организации → 404; у проданного типа срок, льгота и водоёмы → 409 `PERMIT_TYPE_IN_USE` без частичных изменений, та же форма целиком и смена названия/цены/активности проходят, удаление проданного → 409; гонка «продажа + изменение водоёмов» и «продажа + удаление» → 409 (без `FOR UPDATE` первый тест проходит мимо блокировки, второй падает 500 — проверено); записи `PERMIT_TYPE_*` в AuditLog с изменёнными полями. `permit-types.service.spec.ts` — сравнение полей и блокировка условий.
- [x] `GET /permit-types?waterId=`. — только активные типы при `ACTIVE`-организации, порядок «срок → обычный перед льготным → название»; неподключённый водоём и заблокированная организация → `[]`, неизвестный или неопубликованный → 404. Плюс `GET /permit-types/lowest-prices` для цены «od» (решение — `05-api.md` → «Детали (T-12)»): только организация, к которой водоём подключён, повтор id → 400.
- [x] UI админа организации. — `/org/:orgId/permit-types` (список, форма создания и правки, снятие с продажи, удаление с подтверждением), ссылка на `/org`; `permit-types-pages.test.tsx` (13; после 409 список перезагружается), `orgs-pages.test.tsx`; цена вводится в злотых, `parsePriceGrosze` в `shared` (`permit-types.test.ts`, 44 теста). Проверено в браузере на 375 px против реального API: создание двух типов (в БД 2550 и 4000 грошей, записи в AuditLog), правка проданного типа — условия только для чтения, новая цена сохранилась.
- [x] Из T-09: типы разрешений на карточке водоёма (`WaterPage`) и цена «od» в `WaterCard`. — `catalog-pages.test.tsx` (список типов со сроком, льготой и ценой; пустое предложение; при приостановленной продаже запроса нет; «od» только у подключённых, запрос только по ним); в браузере «od 28,00 zł» у обоих подключённых водоёмов (льготный тип за 40 zł в «od» не вошёл).
- Из T-12 на потом: (1) ~~T-13: покупка читает тип в своей транзакции с `FOR SHARE` — ждёт параллельное изменение и берёт закоммиченные цену и условия; проверяет `isActive` и `ACTIVE`-организацию (`PERMIT_TYPE_INACTIVE`)~~ — сделано в T-13; (2) ~~`inUse` считает любое разрешение, и брошенная оплата (`CANCELLED`) тоже фиксирует условия типа — для удаления этого требует FK, для правки решить в T-13~~ — решено в T-13: оставить как есть (`04-data-model.md`); (3) выбор водоёмов в форме — список без поиска: для округа с сотнями водоёмов нужен фильтр (T-23); (4) если появится отключение водоёма от организации (T-23): проверка «водоём подключён» в `create`/`update` идёт вне транзакции записи — перенести в транзакцию (`FOR SHARE` по водоёмам через `WatersService`) и решить судьбу типов с отключённым водоёмом; (5) ~~`mockApi` в тестах web (`src/test/render.tsx`): неожиданный запрос превращается в `UNKNOWN_ERROR` запроса, и тест проходит~~ — сделано (ветка `test-web-strict-mock-api`): запрос записывается, общий `afterEach` в `src/test/setup.ts` роняет тест; 5 тестов входа, попадавших на каталог без обработчика `GET /waters`, исправлены.

### T-13 Покупка + FakePaymentProvider
FR-08, BR-08, BR-09, ADR-0004.
- [x] Интерфейс `PaymentProvider`, `FakePaymentProvider` (страница «Оплатить/Отказаться» в web при `fake`). — `modules/permits/payments/payment-provider.ts`, `fake/fake-payment.provider.ts` (+ unit-тест); страница `/payment/fake/:sessionId` (`FakePaymentPage`, тесты в `purchase-pages.test.tsx`).
- [x] `POST /permits`, уведомление → `PAID`, идемпотентность, отмена неоплаченных через 30 мин. — `PermitPurchaseService`, `PaymentsService.processNotification` / `expireAbandoned`, `PaymentExpiryJob`; `test/permit-purchase.e2e-spec.ts` (33 теста); весь набор API — 330 тестов зелёные.
- [x] Web: выбор даты, редирект, `/payment/return` с опросом. — `BuyPermitPage`, `PaymentReturnPage` (каждые 2 с, до 60 с, «Sprawdź ponownie»), кнопка «Kup» на карточке водоёма; путь «Kup → оплата → Zezwolenie opłacone» пройден в браузере на 375 px (локальный API, `fake`).
- [x] Интеграционные тесты: успех, отказ, повторное уведомление, неверная сумма. — плюс BR-08/BR-09 (граница варшавских суток), снятый тип и заблокированная организация, бесплатный тип, таймаут 30/31 мин, позднее уведомление после отмены, `SKIP LOCKED` при подтверждении, `FOR SHARE` против идущей правки типа (без блокировки тест падает: 2500 вместо 3000).
- Решения (подтверждены пользователем): бесплатный тип — сразу `PAID` без `Payment`; `validFrom` — не позже 365 дней (400); `CANCELLED` тоже фиксирует условия типа (`inUse`); оплата, пришедшая после последнего дня разрешения, не подтверждается (`FAILED` / `CANCELLED`). Оплата — часть `PermitsModule`, без отдельного `PaymentsModule` (ADR-0012; первая версия с Observer между модулями упрощена по решению автора). `GET /me/permits/:id` сделан в T-13 без `qrToken` — его опрашивает страница возврата.
- Ревью (`code-reviewer`): провайдер подтверждался до записи в БД — теперь последним шагом транзакции (тест «только после записи», мутационная проверка); добавлены тесты отказа провайдера в регистрации и подтверждении, двух одновременных уведомлений, уведомления, ждущего таймаут, `PaymentExpiryJob`; `safeReturnPath` отклоняет `//host`; `addDays`/`ageOn` отклоняют несуществующие даты.
- Из T-13 на потом: (1) T-14: `p24` в `PAYMENTS_PROVIDER` и запрет `fake` при `NODE_ENV=production`; переводимый код ошибки, если провайдер не принял регистрацию (сейчас 500 после отмены разрешения); `timeLimit` транзакции P24 короче 30 мин; HTTP-таймаут `transaction/verify` короче 20 с транзакции уведомления; (2) `.env.example`: добавить `PAYMENTS_PROVIDER=fake` — файл закрыт настройками доступа агента, переменная необязательна (по умолчанию `fake`); (3) T-15: `qrToken`, список `/me/permits`, ссылка «Moje zezwolenia» со страницы возврата; (4) после отмены страница возврата ведёт на карту, а не к повторной покупке типа: `/buy` знает тип только из предложения водоёма; (5) T-25: `PaymentExpiryJob` перевести с `setInterval` на `@nestjs/schedule`; (6) T-29: частичный индекс `Payment (createdAt) WHERE status = 'PENDING'` для таймаута (изменение схемы); (7) T-28: лимит одновременных неоплаченных покупок на пользователя — против «заморозки» условий типа брошенными оплатами (`07-security.md`).

### T-14 Przelewy24 sandbox
ADR-0004.
- [x] `Przelewy24Provider`: register, проверка подписи уведомления, verify; сверено с официальной документацией (ссылки в thesis-log).
- [x] Unit-тесты подписи на фиксированных данных.
- [ ] Ручной чек-лист оплаты тестовой картой через туннель — результат в thesis-log.

### T-15 Мои разрешения, QR, PDF
FR-09, ADR-0006.
- [x] Ключи Ed25519 (скрипт генерации), выпуск и проверка JWS.
- [x] `/me/permits`, `/me/permits/:id` (+ `qrToken`), `/pdf`. `/offline-bundle` перенесён в T-21: эффективных правил ещё нет (T-16/T-17), потребитель — PWA.
- [x] Web: список, экран QR на весь экран.

### T-16 Правила
FR-16, ADR-0008.
- [ ] `resolveEffectiveRule` в `shared` + тесты (все комбинации уровней).
- [ ] CRUD `/admin/rules`, `/orgs/:orgId/rules`; `GET /waters/:id/rules`.
- [ ] UI правил организации и отображение в карточке водоёма.

### T-17 CatchValidator
FR-12, BR-01…BR-11.
- [ ] `validateCatch` и правила-классы в `shared`, по файлу тестов на правило.
- [ ] Граничные случаи: полночь по Варшаве, период через Новый год, отпущенная рыба, охраняемый вид.
- [ ] Покрытие `shared/src/rules` ≥ 90%.

### T-18 Реестр уловов (онлайн)
FR-11, FR-12.
- [ ] `POST /catches/sync` (транзакция, порядок `caughtAt`, идемпотентность по `clientId`), `GET /me/catches`, PATCH/DELETE в окне BR-07.
- [ ] Web: форма улова ≤ 3 шагов, реестр с причинами отказа.

### T-19 Проверка QR и протокол
FR-17, FR-18, FR-28.
- [ ] `GET /verify/:token` с публичным и расширенным ответом, `POST /inspections`, `GET /orgs/:orgId/inspections`.
- [ ] Web: `/verify/:token`, форма протокола.
- [ ] Тесты: подделка, аннулированное, чужой инспектор.

### T-20 MVP-ворота
`09-scenarios.md` → «Сквозной MVP».
- [ ] `scenario-mvp.spec.ts` проходит в CI с `fake`.
- [ ] Демо-seed (`SEED_DEMO=true`).
- [ ] Запись в thesis-log: что готово, что отложено.

## Расширение

### T-21 PWA и офлайн
FR-13, NFR-03, ADR-0009.
- [ ] vite-plugin-pwa, манифест, иконки, стратегии кэша из `06-frontend.md`.
- [ ] Dexie: таблицы, очередь, синхронизация (online/open/кнопка), отображение статусов.
- [ ] Офлайн-валидация через `shared`.
- [ ] `GET /me/permits/:id/offline-bundle`: разрешение + `qrToken` + эффективные правила (перенесено из T-15).
- [ ] Playwright с `context.setOffline(true)` (сценарий Б).

### T-22 Внешние разрешения + PDF-реестр
FR-26, FR-27, сценарий Г.
- [ ] CRUD `/me/external-permits` с фото; уловы по общим правилам.
- [ ] PDF-реестр за сезон (поля как в бумажном бланке: дата, łowisko, gatunek, ilość, długość, waga).

### T-23 Админка организации
FR-04, FR-05, FR-10.
- [ ] Приглашения по email, принятие; управление членами.
- [ ] Редактирование подключённых водоёмов; список разрешений; аннулирование + AuditLog.
- [ ] Из T-10: карточка показывает `updatedAt` как «дату данных» (ADR-0007), но его меняет и правка описания организацией — решить про отдельную дату импорта (схема). При появлении `PATCH /admin/waters/:id` решить, защищать ли ручные правки полей каталога от отката импортом (сейчас источник истины — CSV, `05-api.md`).

### T-24 Статистика и CSV
FR-19, FR-20 (C).
- [ ] `/orgs/:orgId/stats`, `catches.csv`; графики на дашборде организации.

### T-25 Уведомления
FR-21.
- [ ] Шаблоны писем pl/en/ru по `User.locale`; письмо о покупке, напоминание за 3 дня до истечения (`@nestjs/schedule`).

### T-26 RODO и AuditLog
`07-security.md`.
- [ ] `/me/export`, `DELETE /me` с анонимизацией; AuditInterceptor.
- [ ] AuditLog для уже существующих действий админов: `PATCH /admin/orgs/:id/status` (T-08), `POST /admin/waters/import` (T-10: кто, файл, отчёт).

### T-27 (C) Дополнительно
FR-14, FR-25, FR-20 — только если срез и S-задачи готовы.

## Качество и деплой

### T-28 Безопасность
NFR-04.
- [ ] Тест IDOR для каждого маршрута `/orgs/:orgId/*`.
- [ ] CSP, лимиты загрузок, OWASP ZAP baseline — отчёт в thesis-log.

### T-29 Производительность и доступность
NFR-01, NFR-02, NFR-05, NFR-09.
- [ ] k6-скрипт и отчёт; Lighthouse CI; axe в Playwright; отчёт покрытия.
- [ ] Из T-09: `GET /waters` (до 2000 записей, публичный) — в сценарий нагрузки, решить о лимите запросов; бандл web 796 КБ (244 КБ gzip) — разделить код (Leaflet отдельным чанком).

### T-30 Деплой
NFR-10.
- [ ] Dockerfile api и web (multi-stage), `docker-compose.prod.yml` с Caddy, `deploy.yml`.
- [ ] Миграции при старте, резервная копия БД (cron `pg_dump`).
- [ ] P24 sandbox работает на публичном URL.
- [ ] Из T-09: URL тайлов карты — в `VITE_`-переменную (`.env.example`); политика OSM не допускает продакшн-нагрузку на `tile.openstreetmap.org`.

## Текст и защита

### T-31 Локализация
FR-29, NFR-08.
- [ ] Перевести все ключи `en`, `ru`; проверка отсутствующих ключей в CI.
- [ ] Из T-09: названия воеводств выводятся как в БД (`mazowieckie`) — ключи `catalog.region.*` для `en`/`ru`.

### T-32 UML и BPMN
- [ ] Use case, ERD (из `schema.prisma`), классы CatchValidator, sequence (покупка, синхронизация), state (разрешение), BPMN (покупка, claim) — в `docs/diagrams/` как PlantUML/Mermaid + экспорт в PNG/SVG.

### T-33 Юзабилити и материалы
NFR-06.
- [ ] Сценарий теста для 5 человек, результаты; скриншоты основных экранов (Playwright) для podręcznika.
