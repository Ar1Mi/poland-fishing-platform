# Łowisko

[![CI](https://github.com/Ar1Mi/poland-fishing-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ar1Mi/poland-fishing-platform/actions/workflows/ci.yml)

Praca inżynierska: *Projekt i implementacja aplikacji internetowej do zarządzania zezwoleniami i rejestrem połowów dla wędkarzy.*

Веб-платформа (PWA): каталог водоёмов Польши, покупка zezwoleń на подключённых водоёмах (Przelewy24 sandbox), электронный rejestr połowów с проверкой правил ловли (в том числе офлайн), проверка разрешения инспектором по QR.

**Стек:** React + Vite · NestJS · PostgreSQL + Prisma · pnpm monorepo.

## Как устроен репозиторий

| Что | Где |
| --- | --- |
| Инструкции для ИИ-агента | `AGENTS.md` (общие), `CLAUDE.md` + `.claude/` (Claude Code) |
| Проектная документация | `docs/00-overview.md` … `docs/09-scenarios.md` |
| Архитектурные решения | `docs/adr/` |
| Задачи и статус | `docs/tasks/ROADMAP.md` |
| Журнал для текста диплома | `docs/thesis-log.md` |
| Код | `apps/api` (NestJS), `apps/web` (React), `packages/shared` (общие типы и правила) |
| CI | `.github/workflows/ci.yml` |

## Работа с агентом

1. Открыть Claude Code в этой папке.
2. `/next-task` — агент берёт следующую задачу, показывает план, реализует, тестирует, обновляет ROADMAP и журнал.
3. `/pre-pr` — проверки и независимое ревью.
4. Новая задача — новая сессия (`/clear`).

Другие агенты (Codex, Cursor и т.п.) читают `AGENTS.md`.

## Запуск

Нужны Node.js 24 LTS (версия в `.nvmrc`) и pnpm (версия в `package.json` → `packageManager`, ставится через corepack):

```bash
nvm install          # Node из .nvmrc
corepack enable pnpm # pnpm нужной версии
pnpm install         # зависимости + git-хук pre-commit (Husky) + сборка packages/shared
```

| Команда | Что делает |
| --- | --- |
| `pnpm dev` | api + web параллельно |
| `pnpm build` | сборка всех пакетов |
| `pnpm lint` | ESLint по всему репозиторию (сначала собирает `shared` и типы API-клиента) |
| `pnpm typecheck` | сборка `packages/shared` и `pnpm gen:api`, затем `tsc --noEmit` в каждом пакете |
| `pnpm test` | unit-тесты всех пакетов |
| `pnpm --filter api test:e2e` | интеграционные тесты API (нужен Docker: Testcontainers) |
| `pnpm e2e` | сценарии Playwright (нужен Docker; первый раз — `pnpm --filter web exec playwright install chromium`) |
| `pnpm gen:api` | типы API-клиента web из OpenAPI-документа API |
| `pnpm format` | Prettier (`pnpm format:check` — только проверка) |

Приложения видят `@lowisko/shared` через его `dist`: пакет собирается при `pnpm install` и перед `pnpm typecheck`, а `pnpm dev` пересобирает его при изменениях.

Перед коммитом хук прогоняет ESLint и Prettier по изменённым файлам (lint-staged); типы он не проверяет — для этого `pnpm typecheck`. Хуку нужны Node 24 и pnpm в `PATH`. Если git запускается не из оболочки с `nvm use` (GUI-клиент, IDE), добавьте их в `~/.config/husky/init.sh`. На другой мажорной версии Node команды pnpm останавливаются с ошибкой (`devEngines` в `package.json`).

### База данных

```bash
docker compose up -d db mailpit                   # PostgreSQL 16 и Mailpit (UI: http://localhost:8025)
pnpm --filter api prisma migrate dev              # миграции (DATABASE_URL из .env в корне)
pnpm --filter api prisma db seed                  # виды рыб и общие правила
pnpm --filter api test:e2e                        # интеграционные тесты, нужен запущенный Docker
```

Клиент Prisma генерируется при `pnpm install` в `apps/api/src/generated` (не коммитится).

### Демо-данные

`SEED_DEMO=true pnpm --filter api prisma db seed` добавляет к видам и правилам демо-данные (`apps/api/prisma/demo-data.ts`): две организации с подключёнными водоёмами, типами разрешений и правилами, рыбаков, инспектора и суперадмина. Пароль всех демо-аккаунтов — значение `SEED_DEMO_PASSWORD` (8–128 символов, без него seed с `SEED_DEMO=true` не запускается). Повторный запуск восстанавливает настройку и пароль и завершает сессии демо-аккаунтов, а разрешения, уловы и протоколы не дублирует. На публичном сервере (`NODE_ENV=production`) пароль — не короче 16 символов.

| E-mail | Роль |
| --- | --- |
| `superadmin@lowisko.test` | суперадмин |
| `admin.sielawa@lowisko.test` | админ «Koło PZW „Sielawa” (demo)» (Jezioro Srebrne, Starorzecze Narwi) |
| `admin.lipowy@lowisko.test` | админ «Gospodarstwo Rybackie „Lipowy Staw” (demo)» (Staw Lipowy) |
| `straznik@lowisko.test` | инспектор «Sielawy» |
| `jan.kowalski@lowisko.test` | рыбак: годовое разрешение и уловы за последние дни |
| `anna.nowak@lowisko.test` | рыбак без разрешений (покупает в сценарии MVP) |
| `kacper.wisniewski@lowisko.test` | рыбак младше 16 лет (льготное разрешение) |

`pnpm e2e` своих данных не требует: он поднимает API на отдельной БД в контейнере с этим seed и случайным паролем, `pnpm dev` и его базу не трогает.
