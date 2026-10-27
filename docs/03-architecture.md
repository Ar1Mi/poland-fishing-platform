# 03. Архитектура

Модульный монолит на NestJS (ADR-0002) + SPA/PWA на React + PostgreSQL. Один деплой, чёткие границы модулей.

```
[PWA React] --HTTPS--> [NestJS API] --SQL--> [PostgreSQL]
     |                   |    ^
     | тайлы             |    | уведомление (urlStatus)
     v                   v    |
 [OpenStreetMap]   [Przelewy24 sandbox]      [SMTP: Mailpit в dev]
```

## Структура репозитория

```
apps/
  api/                 NestJS
    src/
      modules/<name>/  controller, service, dto/, *.spec.ts
      common/          guards, filters, interceptors, decorators
      config/          валидация env (Zod)
    prisma/            schema.prisma, migrations/, seed.ts
    test/              интеграционные тесты (*.e2e-spec.ts)
  web/                 React + Vite
    src/
      app/             роутер, провайдеры
      features/<name>/ страницы и компоненты по фичам
      shared/          ui (shadcn), api-клиент, i18n, offline (Dexie)
    e2e/               Playwright
packages/
  shared/              Zod-схемы, enum, коды ошибок, CatchValidator
data/
  waters/              CSV каталога водоёмов (источники RZGW/PZW)
docs/
```

## Модули API

| Модуль | Ответственность | Зависит от |
| --- | --- | --- |
| `AuthModule` | Регистрация, вход, JWT, refresh, подтверждение email, сброс пароля | Users, Notifications |
| `UsersModule` | Профиль, экспорт и удаление данных (RODO) | — |
| `OrganizationsModule` | Организации, членство, приглашения, `OrgScopeGuard` | Users |
| `WatersModule` | Каталог, импорт CSV, геокодирование, claim | Organizations |
| `RulesModule` | Виды, `SpeciesRule`, слияние уровней | Waters |
| `PermitsModule` | Типы разрешений (T-12), покупка и оплата (T-13: `PaymentProvider` P24/Fake, таблица `Payment`, уведомления, отмена брошенных оплат — `permits/payments/`, ADR-0012), статусы, PDF, QR-токен; внешние разрешения | Waters, Organizations, Users, Audit |
| `CatchesModule` | Реестр, `/catches/sync`, вызов CatchValidator, PDF-реестр | Permits, Rules |
| `InspectionsModule` | Проверка QR-токена, протоколы | Permits, Catches |
| `ReportsModule` | Статистика, CSV | Permits, Catches |
| `NotificationsModule` | Email-шаблоны (pl/en/ru), планировщик напоминаний | — |
| `AuditModule` | `AuditLog`: `AuditService.record(tx, …)` пишет запись в транзакции самого действия (T-11); интерсептор для действий без своей транзакции — T-26 | — |

Правило зависимостей: модуль обращается к чужим данным только через экспортированный сервис чужого модуля, не через Prisma напрямую. Связь «многие ко многим» принадлежит модулю, чья сущность её задаёт: связь `PermitType` ↔ `FishingWater` (таблица `_FishingWaterToPermitType`) ведёт `PermitsModule` — он пишет её через `connect`/`set` и фильтрует по ней, а поля водоёмов (название, статус, владелец) читает только через `WatersService`.

## Сквозные механизмы

- **Конфиг:** `@nestjs/config` + Zod-схема env (`src/config/env.ts`); приложение не стартует при невалидном env. Единственный `.env` лежит в корне репозитория; в схему переменная попадает в той задаче, которая первой её читает.
- **Ошибки:** глобальный `HttpExceptionFilter` → `{ code, message, details? }`. Бизнес-ошибки — `DomainError(code, details)`; коды — enum `ErrorCode` в `packages/shared`. Необработанное исключение → 500 `INTERNAL_ERROR` без деталей в ответе (причина — только в логе).
- **Авторизация:** `JwtAuthGuard` (глобальный, `@Public()` для открытых маршрутов) → `OrgScopeGuard` (сверяет `:orgId` из маршрута с членством и требует статус `ACTIVE`) → `RolesGuard` (роль в этой организации). `@Roles('ORG_ADMIN')` сам подключает оба guard'а в этом порядке, `@SuperAdmin()` — только `RolesGuard`; забыть одну из проверок нельзя, приоритет кодов фиксирован: `ORG_SCOPE_VIOLATION` → `ORG_NOT_ACTIVE` → `FORBIDDEN`. Членство читается через `OrgAccessService` один раз на запрос; детали — `05-api.md` → «Детали (T-08)».
- **Валидация:** глобальный `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **Swagger:** `/api/docs`; OpenAPI JSON → `openapi-typescript` → типы API-клиента фронтенда (`pnpm gen:api`).
- **Время:** сервер в UTC; бизнес-«сутки» — календарный день `Europe/Warsaw` через `warsawDate()` из `packages/shared` (встроенный `Intl.DateTimeFormat`, без библиотеки часовых поясов — одна реализация для сервера и PWA); `now` инжектируется через `ClockService` (подменяется в тестах).
- **Статусы разрешения:** хранятся только `PENDING_PAYMENT / PAID / CANCELLED / REVOKED`; `SCHEDULED / ACTIVE / EXPIRED` вычисляются из дат (ADR-0005).
- **QR:** токен JWS (Ed25519, библиотека `jose`) с `permitId` и `exp = validTo`; QR кодирует `${WEB_URL}/verify/${token}` (ADR-0006).
- **Платежи:** только уведомление провайдера с проверенной подписью меняет статус на `PAID`; идемпотентность по `sessionId` (ADR-0004). Оплата — часть `PermitsModule` (ADR-0012): `PaymentsService` в одной транзакции меняет `Payment` и `Permit`. Порядок блокировок везде один — строка `Payment` (`FOR UPDATE`), затем `Permit`. Провайдер подтверждается последним, после записи `Payment` и `Permit`, внутри той же транзакции: сбой на любом шаге не оставляет списанных денег без оплаченного разрешения. Брошенные оплаты отменяет `PaymentExpiryJob` — `setInterval` раз в минуту (при `NODE_ENV=test` не запускается — тесты вызывают `expireAbandoned()` сами); с T-25, где появляется `@nestjs/schedule`, задача переходит на него.
- **Файлы** (фото, документы claim): локальный том Docker `uploads/` за абстракцией `StorageService` (`common/storage`, каталог — `UPLOADS_DIR`). Сервис хранит файл под случайным ключом `<папка>/<uuid>.<расширение>` и отдаёт только такие ключи (путь вне корня не собрать); вызывающий модуль хранит ключ в своей записи. Лимит 5 МБ; тип определяется по содержимому (`file-type`), не по имени и не по заявленному `Content-Type`. Документ claim — PDF, JPEG, PNG или WebP (`CLAIM_PROOF_MIME_TYPES`).
- **Логи:** `pino` (nestjs-pino), JSON в prod, request-id (заголовок `X-Request-Id`); заголовки `Authorization`, `Cookie`, `Set-Cookie` в лог не попадают.

## Жизненный цикл разрешения

```
PENDING_PAYMENT --оплата подтверждена--> PAID
PENDING_PAYMENT --таймаут 30 мин / отказ / провайдер не принял транзакцию / оплата после validTo--> CANCELLED
(бесплатный тип: сразу PAID, без Payment)
PAID --админ орг.--> REVOKED

Вычисляемо для PAID:  now < validFrom → SCHEDULED;  validFrom ≤ now ≤ validTo → ACTIVE;  now > validTo → EXPIRED
```

Улов можно записать только при вычисленном статусе `ACTIVE`.
