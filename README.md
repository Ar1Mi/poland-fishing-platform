# Łowisko

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
| Код | `apps/api`, `apps/web`, `packages/shared` (появятся в задачах T-01…T-05) |

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
| `pnpm lint` | ESLint по всему репозиторию |
| `pnpm typecheck` | сборка `packages/shared`, затем `tsc --noEmit` в каждом пакете |
| `pnpm test` | unit-тесты всех пакетов |
| `pnpm format` | Prettier (`pnpm format:check` — только проверка) |

Приложения видят `@lowisko/shared` через его `dist`: пакет собирается при `pnpm install` и перед `pnpm typecheck`, а `pnpm dev` пересобирает его при изменениях. `apps/api` и `apps/web` пока заглушки — их `dev`, `build` и `test` наполняют задачи T-03 и T-05.

Перед коммитом хук прогоняет ESLint и Prettier по изменённым файлам (lint-staged); типы он не проверяет — для этого `pnpm typecheck`. Хуку нужны Node 24 и pnpm в `PATH`. Если git запускается не из оболочки с `nvm use` (GUI-клиент, IDE), добавьте их в `~/.config/husky/init.sh`. На другой мажорной версии Node команды pnpm останавливаются с ошибкой (`devEngines` в `package.json`).

База данных, `.env` и `docker compose` появятся в задачах T-03…T-04.
