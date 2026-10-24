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
| `PermitsModule` | Типы разрешений, выдача, статусы, PDF, QR-токен; внешние разрешения | Waters, Payments |
| `PaymentsModule` | `PaymentProvider` (P24, Fake), уведомления | — |
| `CatchesModule` | Реестр, `/catches/sync`, вызов CatchValidator, PDF-реестр | Permits, Rules |
| `InspectionsModule` | Проверка QR-токена, протоколы | Permits, Catches |
| `ReportsModule` | Статистика, CSV | Permits, Catches |
| `NotificationsModule` | Email-шаблоны (pl/en/ru), планировщик напоминаний | — |
| `AuditModule` | Интерсептор, пишущий действия админов в `AuditLog` | — |

Правило зависимостей: модуль обращается к чужим данным только через экспортированный сервис чужого модуля, не через Prisma напрямую.

## Сквозные механизмы

- **Конфиг:** `@nestjs/config` + Zod-схема env (`src/config/env.ts`); приложение не стартует при невалидном env. Единственный `.env` лежит в корне репозитория; в схему переменная попадает в той задаче, которая первой её читает.
- **Ошибки:** глобальный `HttpExceptionFilter` → `{ code, message, details? }`. Бизнес-ошибки — `DomainError(code, details)`; коды — enum `ErrorCode` в `packages/shared`. Необработанное исключение → 500 `INTERNAL_ERROR` без деталей в ответе (причина — только в логе).
- **Авторизация:** `JwtAuthGuard` (глобальный, `@Public()` для открытых маршрутов) → `RolesGuard` (`@Roles('ORG_ADMIN')`, `@SuperAdmin()`; декораторы сами подключают guard) → `OrgScopeGuard` (сверяет `:orgId` из маршрута с членством и требует статус `ACTIVE`). Оба guard'а читают членство через `OrgAccessService` один раз на запрос и не зависят от порядка; коды ошибок — `05-api.md` → «Детали (T-08)».
- **Валидация:** глобальный `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **Swagger:** `/api/docs`; OpenAPI JSON → `openapi-typescript` → типы API-клиента фронтенда (`pnpm gen:api`).
- **Время:** сервер в UTC; бизнес-«сутки» — календарный день `Europe/Warsaw` через `warsawDate()` из `packages/shared` (встроенный `Intl.DateTimeFormat`, без библиотеки часовых поясов — одна реализация для сервера и PWA); `now` инжектируется через `ClockService` (подменяется в тестах).
- **Статусы разрешения:** хранятся только `PENDING_PAYMENT / PAID / CANCELLED / REVOKED`; `SCHEDULED / ACTIVE / EXPIRED` вычисляются из дат (ADR-0005).
- **QR:** токен JWS (Ed25519, библиотека `jose`) с `permitId` и `exp = validTo`; QR кодирует `${WEB_URL}/verify/${token}` (ADR-0006).
- **Платежи:** только уведомление провайдера с проверенной подписью меняет статус на `PAID`; идемпотентность по `sessionId` (ADR-0004).
- **Файлы** (фото, документы claim): локальный том Docker `uploads/` за абстракцией `StorageService`; лимит 5 МБ, только image/* и application/pdf.
- **Логи:** `pino` (nestjs-pino), JSON в prod, request-id (заголовок `X-Request-Id`); заголовки `Authorization`, `Cookie`, `Set-Cookie` в лог не попадают.

## Жизненный цикл разрешения

```
PENDING_PAYMENT --оплата подтверждена--> PAID
PENDING_PAYMENT --таймаут 30 мин / отказ--> CANCELLED
PAID --админ орг.--> REVOKED

Вычисляемо для PAID:  now < validFrom → SCHEDULED;  validFrom ≤ now ≤ validTo → ACTIVE;  now > validTo → EXPIRED
```

Улов можно записать только при вычисленном статусе `ACTIVE`.
