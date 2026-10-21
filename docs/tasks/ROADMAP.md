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
| T-08 | Организации, членство, guards | Каркас | T-07 | todo |
| T-09 | Каталог: API и карта | Срез | T-04, T-05 | todo |
| T-10 | Импорт каталога CSV + геокодирование | Срез | T-09 | todo |
| T-11 | Claim водоёма | Срез | T-08, T-09 | todo |
| T-12 | Типы разрешений | Срез | T-11 | todo |
| T-13 | Покупка разрешения + FakePaymentProvider | Срез | T-12 | todo |
| T-14 | Przelewy24 sandbox | Срез | T-13 | todo |
| T-15 | Мои разрешения, QR-токен, PDF | Срез | T-13 | todo |
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
- [x] Интеграционные тесты всех сценариев, включая повторное использование refresh. — 121 интеграционный тест API, 76 тестов web.

### T-08 Организации и guards
FR-03.
- [ ] `POST /orgs` (заявитель → ORG_ADMIN, статус PENDING), `/me/orgs`, `/admin/orgs` активация/блокировка.
- [ ] `RolesGuard`, `@SuperAdmin()`, `OrgScopeGuard` (+ проверка `ORG_NOT_ACTIVE`).
- [ ] Тестовый хелпер «запрос от админа чужой организации → 403».

## Вертикальный срез

### T-09 Каталог: API и карта
FR-06, FR-23.
- [ ] `GET /waters` с фильтрами и `bbox`, `GET /waters/:id`, `GET /species`.
- [ ] Карта (react-leaflet, кластеры), список/поиск, карточка водоёма: подключён → типы разрешений; не подключён → владелец и ссылка.

### T-10 Импорт каталога
FR-22. Ссылки: `08-testing-and-infra.md` → «Данные каталога».
- [ ] `POST /admin/waters/import` (CSV), upsert по `source + sourceRef`, отчёт `{ created, updated, failed }`.
- [ ] Геокодер с лимитом 1 req/s, `GeocodeCache`, User-Agent из env; в тестах — фейк.
- [ ] CLI-скрипт `pnpm --filter api import:waters data/waters/<file>.csv`.
- [ ] `data/waters/README.md` с форматом и `mazowieckie.sample.csv` (несколько строк для проверки; полный список собирает автор).

### T-11 Claim водоёма
FR-24.
- [ ] Подача с документом (StorageService, лимиты файлов), список своих заявок.
- [ ] Одобрение/отклонение суперадмином в одной транзакции (см. `04-data-model.md`), AuditLog.
- [ ] UI в разделах организации и админа.

### T-12 Типы разрешений
FR-07.
- [ ] CRUD `/orgs/:orgId/permit-types`, только по своим подключённым водоёмам.
- [ ] `GET /permit-types?waterId=`.
- [ ] UI админа организации.

### T-13 Покупка + FakePaymentProvider
FR-08, BR-08, BR-09, ADR-0004.
- [ ] Интерфейс `PaymentProvider`, `FakePaymentProvider` (страница «Оплатить/Отказаться» в web при `fake`).
- [ ] `POST /permits`, уведомление → `PAID`, идемпотентность, отмена неоплаченных через 30 мин.
- [ ] Web: выбор даты, редирект, `/payment/return` с опросом.
- [ ] Интеграционные тесты: успех, отказ, повторное уведомление, неверная сумма.

### T-14 Przelewy24 sandbox
ADR-0004.
- [ ] `Przelewy24Provider`: register, проверка подписи уведомления, verify; сверено с официальной документацией (ссылки в thesis-log).
- [ ] Unit-тесты подписи на фиксированных данных.
- [ ] Ручной чек-лист оплаты тестовой картой через туннель — результат в thesis-log.

### T-15 Мои разрешения, QR, PDF
FR-09, ADR-0006.
- [ ] Ключи Ed25519 (скрипт генерации), выпуск и проверка JWS.
- [ ] `/me/permits`, `/me/permits/:id` (+ `qrToken`), `/pdf`, `/offline-bundle`.
- [ ] Web: список, экран QR на весь экран.

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
- [ ] Playwright с `context.setOffline(true)` (сценарий Б).

### T-22 Внешние разрешения + PDF-реестр
FR-26, FR-27, сценарий Г.
- [ ] CRUD `/me/external-permits` с фото; уловы по общим правилам.
- [ ] PDF-реестр за сезон (поля как в бумажном бланке: дата, łowisko, gatunek, ilość, długość, waga).

### T-23 Админка организации
FR-04, FR-05, FR-10.
- [ ] Приглашения по email, принятие; управление членами.
- [ ] Редактирование подключённых водоёмов; список разрешений; аннулирование + AuditLog.

### T-24 Статистика и CSV
FR-19, FR-20 (C).
- [ ] `/orgs/:orgId/stats`, `catches.csv`; графики на дашборде организации.

### T-25 Уведомления
FR-21.
- [ ] Шаблоны писем pl/en/ru по `User.locale`; письмо о покупке, напоминание за 3 дня до истечения (`@nestjs/schedule`).

### T-26 RODO и AuditLog
`07-security.md`.
- [ ] `/me/export`, `DELETE /me` с анонимизацией; AuditInterceptor.

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

### T-30 Деплой
NFR-10.
- [ ] Dockerfile api и web (multi-stage), `docker-compose.prod.yml` с Caddy, `deploy.yml`.
- [ ] Миграции при старте, резервная копия БД (cron `pg_dump`).
- [ ] P24 sandbox работает на публичном URL.

## Текст и защита

### T-31 Локализация
FR-29, NFR-08.
- [ ] Перевести все ключи `en`, `ru`; проверка отсутствующих ключей в CI.

### T-32 UML и BPMN
- [ ] Use case, ERD (из `schema.prisma`), классы CatchValidator, sequence (покупка, синхронизация), state (разрешение), BPMN (покупка, claim) — в `docs/diagrams/` как PlantUML/Mermaid + экспорт в PNG/SVG.

### T-33 Юзабилити и материалы
NFR-06.
- [ ] Сценарий теста для 5 человек, результаты; скриншоты основных экранов (Playwright) для podręcznika.
