# Łowisko — инструкции для агента

Дипломный проект (praca inżynierska): веб-платформа с каталогом водоёмов Польши, покупкой разрешений (zezwoleń) на подключённых водоёмах, электронным реестром уловов (rejestr połowów) с проверкой правил и онлайн-проверкой разрешений инспектором по QR.

Проектная документация — в `docs/`. Перед задачей читай только нужные разделы:

| Нужно | Файл |
| --- | --- |
| Термины предметной области (PL/RU/EN) | `docs/00-overview.md` |
| Роли, FR, NFR | `docs/01-requirements.md` |
| Правила ловли и валидация улова | `docs/02-business-rules.md` |
| Модули, сквозные механизмы | `docs/03-architecture.md` |
| Сущности и схема Prisma | `docs/04-data-model.md` |
| Эндпоинты и формат ошибок | `docs/05-api.md` |
| PWA, офлайн | `docs/06-frontend.md` |
| Угрозы и меры | `docs/07-security.md` |
| Тесты, Docker, CI | `docs/08-testing-and-infra.md` |
| Ключевые сценарии | `docs/09-scenarios.md` |
| Принятые решения | `docs/adr/` |
| Задачи и их статус | `docs/tasks/ROADMAP.md` |

## Стек

- Монорепозиторий pnpm workspaces: `apps/api` (NestJS), `apps/web` (React + Vite), `packages/shared` (Zod-схемы, типы, константы).
- TypeScript strict везде. Node.js LTS, PostgreSQL 16, Prisma.
- Frontend: React Router, TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui, react-leaflet, vite-plugin-pwa, Dexie, react-i18next.
- Оплата: Przelewy24 sandbox через интерфейс `PaymentProvider`; `FakePaymentProvider` для тестов и локальной разработки.

## Команды

```bash
pnpm install
docker compose up -d db mailpit      # PostgreSQL + тестовая почта
pnpm --filter api prisma migrate dev # миграции
pnpm --filter api prisma db seed     # демо-данные
pnpm dev                             # api + web параллельно
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter api test:e2e           # интеграционные (Testcontainers)
pnpm e2e                             # Playwright
pnpm gen:api                         # типы API-клиента из Swagger (после изменения API)
```

На старте репозитория этих команд ещё нет — их создают первые задачи ROADMAP (T-01…T-05).

Если нужная команда не существует — создай её в соответствующем `package.json`, а не обходи.

Тесты: Vitest в `packages/shared` и `apps/web`, Jest в `apps/api`, Playwright для E2E.

## Правила работы

1. **Одна задача — одна ветка — один PR.** Задачи берутся из `docs/tasks/ROADMAP.md` по ID (напр. `T-12`). Ветка `t-12-short-name`.
2. **Сначала план.** Перед кодом перечисли файлы, которые изменишь, и как проверишь результат. Если задача требует решения, которого нет в `docs/`, — остановись и спроси.
3. **Документация — источник истины.** Если код расходится с `docs/`, не меняй поведение молча: либо следуй документации, либо предложи изменение документа и ADR.
4. **Тесты обязательны** для бизнес-логики (`CatchValidator`, цены, статусы, подпись QR, синхронизация) и для каждого нового эндпоинта.
5. **После задачи:** отметь её в `ROADMAP.md`, добавь запись в `docs/thesis-log.md` (что сделано, какие решения, какие проблемы — это материал для главы «Implementacja»).
6. Коммиты — Conventional Commits на английском: `feat(catches): validate daily limit`.

## Definition of Done

- `pnpm lint`, `pnpm typecheck`, `pnpm test` проходят.
- Новые эндпоинты описаны декораторами Swagger и покрыты интеграционным тестом.
- Строки интерфейса — только через i18n-ключи (`pl` заполнен, `en`/`ru` — ключ с TODO допустим до этапа локализации).
- Миграция Prisma создана и закоммичена, если менялась схема.
- ROADMAP и thesis-log обновлены.

## Конвенции

- Код, идентификаторы, комментарии, коммиты — на английском; названия сущностей — из глоссария `docs/00-overview.md`. Документация в `docs/` — на русском.
- Деньги — целые гроши (`priceGrosze: number`), никогда float.
- Время — `timestamptz`, в UTC; на клиенте отображать в `Europe/Warsaw`.
- Даты okresu ochronnego — строки `MM-DD`.
- ID — UUID.
- Ошибки API — `{ code, message, details? }`, `code` — UPPER_SNAKE_CASE, стабильный (фронтенд переводит его через i18n).
- Валидация входа: DTO + `class-validator` на backend; общие Zod-схемы из `packages/shared` на frontend.

## Запрещено

- Хранить секреты в репозитории; читать или менять `.env` (только `.env.example`).
- Менять статус оплаты по возврату браузера — только по проверенному уведомлению P24.
- Обращаться к данным организации без `OrgScopeGuard`.
- Добавлять зависимости без причины; при добавлении — одна строка обоснования в описании PR.
- Удалять или ослаблять существующие тесты, чтобы они прошли.
- Реализовывать то, что вне рамок (`docs/00-overview.md` → «Вне рамок»), без явного запроса.
