# 08. Тестирование и инфраструктура

## Тесты

| Уровень | Инструмент | Где | Что покрываем |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/shared` | CatchValidator: каждое правило BR-* отдельно, слияние уровней, границы суток и Нового года; покрытие `src/rules` ≥ 90 % (`test:coverage`) |
| Unit | Jest | `apps/api/src/**/*.spec.ts` | Сервисы: цены, статусы, QR-токены, подпись P24 |
| Интеграционные | Jest + Supertest + Testcontainers | `apps/api/test/*.e2e-spec.ts` | Эндпоинты, guards, IDOR, идемпотентность sync и уведомлений |
| Компоненты | Vitest + Testing Library | `apps/web/src/**/*.test.tsx` | Формы, офлайн-очередь (fake-indexeddb) |
| E2E | Playwright | `apps/web/e2e` | Сценарии из `09-scenarios.md` с `PAYMENTS_PROVIDER=fake` (`pnpm e2e`) |
| Нагрузка | k6 | `tests/load` | NFR-01 |
| Доступность | @axe-core/playwright | `apps/web/e2e` | NFR-05 |
| Безопасность | OWASP ZAP baseline (Docker) | CI вручную | NFR-04 |

Принципы:

- NestJS 12 и `@lowisko/shared` — ESM-only, а API собирается в CommonJS. Jest 30 загружает их через `require(esm)`; для этого нужны Node ≥ 24.9 и флаг `--experimental-vm-modules` (он уже в скриптах `test` и `test:e2e` пакета `api`).
- Время инжектируется (`ClockService`, параметр `now`) — тесты не зависят от текущей даты.
- Интеграционные тесты поднимают свой PostgreSQL в контейнере и применяют миграции; данные создаются фабриками (`test/factories`), не общим seed. Контейнер один на прогон (`test/db/global-setup.ts`: `prisma migrate deploy`, затем копия в шаблонную БД `lowisko_template`); тест-файл, которому нужна БД, создаёт свою копию шаблона через `createTestDatabase()` — файлы идут параллельно и не видят данных друг друга. Нужен запущенный Docker.
- Тест IDOR: для каждого маршрута `/orgs/:orgId/*` — запрос от админа другой организации → 403.
- Внешние сервисы (P24, Nominatim, SMTP) в тестах заменены фейками; реальный P24 sandbox проверяется вручную по чек-листу.
- E2E (`pnpm e2e`, `apps/web/playwright.config.ts`) поднимает свой стек: API на `:3100` (`pnpm --filter api e2e:server` — сборка `tsc` в `dist-e2e`, чтобы не стереть `dist` идущего `pnpm dev`, PostgreSQL в Testcontainers, `prisma migrate deploy` и `prisma db seed` с `SEED_DEMO=true`, затем `node dist-e2e/main.js` с `NODE_ENV=test`, без `.env`; логи API при этом выключены — разбор падения по trace и отчёту, в них есть сеть) и продакшн-сборку web через `vite preview` на `:4173` (прокси `/api` → `API_PROXY_TARGET`). Ключи QR, `JWT_ACCESS_SECRET` и `SEED_DEMO_PASSWORD` генерируются на прогон. Нужен только Docker; `pnpm dev` и его база не затрагиваются. Сценарии идут по очереди (`workers: 1`) на одних данных, в профиле Pixel 7 (Chromium), `pl-PL`, `Europe/Warsaw`; данные — аккаунты и водоёмы демо-seed (`apps/api/prisma/demo-data.ts`). Сценарий не зависит от сезона: вид и правило выбраны без okresu ochronnego; от дня зависят однодневное разрешение и «уловы за сегодня», поэтому прогон, который пересёк бы варшавскую полночь, сначала ждёт её. SIGTERM от Playwright (`gracefulShutdown`) останавливает API и контейнер на любом этапе, иначе контейнер убирает reaper Testcontainers. Отчёт и trace упавшего прогона — `apps/web/playwright-report`, `apps/web/test-results` (в CI — артефакт `playwright-report`).
- Загруженные файлы: каждый файл интеграционных тестов пишет в свой временный `UPLOADS_DIR` (`test/setup-env.ts`). В `apps/web` jsdom-`File` внутри `FormData` доходит до `fetch` (undici) пустой частью — тест проверяет только наличие и тип части, содержимое multipart проверено в браузере.

## Окружение

| Переменная | Пример / назначение |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production`; без значения — `production` (JSON-логи, без `pino-pretty`) |
| `API_PORT` | `3000` |
| `DATABASE_URL` | `postgresql://lowisko:lowisko@localhost:5432/lowisko` |
| `WEB_URL`, `API_URL` | `http://localhost:5173`, `http://localhost:3000` — только origin, без пути: `WEB_URL` сравнивается с заголовком `Origin` (CORS) |
| `JWT_ACCESS_SECRET` | случайная строка ≥ 32 байт |
| `QR_SIGNING_PRIVATE_KEY`, `QR_SIGNING_PUBLIC_KEY` | Обязательны. Ed25519 PEM; `pnpm --filter api keys:qr` печатает новую пару двумя строками для `.env` (PEM в одну строку с `\n`). API не стартует, если ключ не Ed25519 или публичный не от этого приватного. Смена пары делает недействительными все показанные QR. В тестах пара генерируется на каждый файл (`test/setup-env.ts`) — ключей в репозитории нет |
| `PAYMENTS_PROVIDER` | `fake` (dev, тесты; по умолчанию) или `p24`. При `NODE_ENV=production` `fake` запрещён — API не стартует |
| `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC` | Обязательны при `p24`; панель P24 → «Moje dane» → «Dane API» (`P24_API_KEY` — «klucz do raportów») |
| `P24_BASE_URL` | Origin без пути; по умолчанию sandbox `https://sandbox.przelewy24.pl` — и в рабочей среде дипломного проекта тоже, намеренно (ADR-0004: без реальных денег); боевой P24 — `https://secure.przelewy24.pl` |
| `SMTP_URL`, `MAIL_FROM` | `smtp://localhost:1025` (Mailpit) |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT` | По умолчанию `https://nominatim.openstreetmap.org`; публичный Nominatim требует идентифицирующий User-Agent (`lowisko/1.0 (email)`). Без `NOMINATIM_USER_AGENT` API стартует, но строки импорта без координат отклоняются |
| `UPLOADS_DIR` | `./uploads` — каталог `StorageService` относительно рабочего каталога API (`apps/api` при `pnpm dev`); в `.gitignore` |
| `SEED_DEMO`, `SEED_DEMO_PASSWORD` | Только для `prisma db seed`: `SEED_DEMO=true` добавляет демо-данные (`apps/api/prisma/demo-data.ts`), тогда обязателен `SEED_DEMO_PASSWORD` (8–128 символов) — пароль всех демо-аккаунтов, в репозитории его нет. Повторный запуск выставляет его заново |
| `API_PROXY_TARGET` | Web (`vite.config.ts`): куда `vite dev` и `vite preview` проксируют `/api`; по умолчанию `http://localhost:3000`, E2E — `http://localhost:3100` |

`.env` не коммитится; `.env.example` — обязателен и актуален.

## Docker Compose

- `docker-compose.yml` (dev): `db` (postgres:16), `mailpit` (UI на :8025). API и web запускаются локально через `pnpm dev`.
- Refresh-cookie всегда `Secure`: Chrome и Firefox принимают её на `http://localhost`, старые версии Safari — нет; для входа в dev используйте Chrome или Firefox.
- `docker-compose.prod.yml`: `caddy` (HTTPS, проксирует `/api` → api, остальное → статика web), `api`, `db`, том `uploads`.
- NFR-10: `docker compose -f docker-compose.prod.yml up` поднимает всё, включая миграции и seed демо-данных при `SEED_DEMO=true`.

## CI (GitHub Actions)

`ci.yml` на каждый PR и push в `main`:

1. `pnpm install --frozen-lockfile` (кэш хранилища pnpm по `pnpm-lock.yaml`)
2. `pnpm format:check` · `pnpm lint` · `pnpm typecheck` — корневые скрипты сами собирают `packages/shared` и типы API-клиента (`pnpm gen:api`)
3. `pnpm test` (unit), затем `pnpm --filter @lowisko/shared test:coverage` — падает, если покрытие правил ловли и CatchValidator (`packages/shared/src/rules`) ниже 90 % (провайдер `@vitest/coverage-v8`, пороги в `vitest.config.ts`)
4. `pnpm --filter api test:e2e` (Testcontainers)
5. `pnpm build`
6. Playwright E2E — отдельная задача `e2e` на каждый PR, параллельно с остальными: `playwright install --with-deps chromium`, `pnpm e2e` (Testcontainers на Docker раннера); при падении отчёт и trace — артефакт `playwright-report` на 7 дней

Новый push в ту же ветку отменяет идущую проверку; токен workflow — только чтение.

`deploy.yml` — по тегу `v*`: сборка образов → GHCR → SSH на VPS → `docker compose pull && up -d`.

## Данные каталога

- CSV в `data/waters/*.csv`, формат:

```csv
source,sourceRef,name,type,region,externalOwnerName,externalInfoUrl,lat,lng,geocodeQuery
RZGW,WA-123,Zalew Zegrzyński,RESERVOIR,mazowieckie,RZGW Warszawa,https://...,,,"Zalew Zegrzyński, mazowieckie"
```

- Пустые `lat/lng` → геокодирование по `geocodeQuery` через Nominatim (`countrycodes=pl`): не чаще 1 запроса в секунду на процесс (`MinIntervalLimiter`; не запускайте CLI-импорт одновременно с импортом через API — получится 2 req/s), результат в `GeocodeCache`; неудачные строки попадают в отчёт импорта, а не роняют его. Полный формат и правила — `data/waters/README.md`.
- Импорт: `POST /admin/waters/import` или `pnpm --filter api import:waters data/waters/<file>.csv` (CLI запускается через `tsx` и собирает сервисы вручную, без Nest DI; путь — относительно каталога вызова; код выхода 2, если есть неудачные строки).
- В тестах геокодер — `FakeGeocoder` (`apps/api/test/geocoding`), его подставляет `createTestApp`; реальных запросов к Nominatim нет.
- Первый регион — Mazowsze: списки łowisk RZGW Warszawa и Okręgu Mazowieckiego PZW (собираются вручную, ссылка на источник — в `externalInfoUrl`).
- Seed (`prisma/seed.ts`): виды (~15) и общие правила; при `SEED_DEMO=true` — 2 демо-организации (`ACTIVE`) с подключёнными водоёмами (`source=MANUAL`, `sourceRef=DEMO-*` — импорт каталога с ними не совпадает), типы разрешений, правила уровня организации и водоёма, админы, инспектор, суперадмин и рыбаки: с годовым разрешением и уловами за последние дни, без разрешений, младше 16 лет. Пароль — `SEED_DEMO_PASSWORD`, список аккаунтов — `README.md`; повторный запуск отзывает сессии демо-аккаунтов (`07-security.md`). Организации — по фиксированному id: если их NIP уже занят другой организацией, seed останавливается. Даты разрешений и уловов отсчитываются от варшавской даты запуска, вердикт улова даёт `validateCatch` — реестр согласован с правилами в любой сезон. Настройка (организации, водоёмы, аккаунты, типы, правила) перезаписывается при каждом запуске — кроме срока, льготы и водоёмов проданного типа (`02-business-rules.md`); разрешения, уловы и протокол создаются, если их фиксированного id нет (удалённый в окне BR-07 улов вернётся, датированный от дня нового запуска). Правила для проверки демо-уловов отбираются так же, как `SpeciesRulesService.effectiveOnWaters`.
