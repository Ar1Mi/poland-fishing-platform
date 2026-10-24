# 08. Тестирование и инфраструктура

## Тесты

| Уровень | Инструмент | Где | Что покрываем |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/shared` | CatchValidator: каждое правило BR-* отдельно, слияние уровней, границы суток и Нового года |
| Unit | Jest | `apps/api/src/**/*.spec.ts` | Сервисы: цены, статусы, QR-токены, подпись P24 |
| Интеграционные | Jest + Supertest + Testcontainers | `apps/api/test/*.e2e-spec.ts` | Эндпоинты, guards, IDOR, идемпотентность sync и уведомлений |
| Компоненты | Vitest + Testing Library | `apps/web/src/**/*.test.tsx` | Формы, офлайн-очередь (fake-indexeddb) |
| E2E | Playwright | `apps/web/e2e` | Сценарии из `09-scenarios.md` с `PAYMENTS_PROVIDER=fake` |
| Нагрузка | k6 | `tests/load` | NFR-01 |
| Доступность | @axe-core/playwright | `apps/web/e2e` | NFR-05 |
| Безопасность | OWASP ZAP baseline (Docker) | CI вручную | NFR-04 |

Принципы:

- NestJS 12 и `@lowisko/shared` — ESM-only, а API собирается в CommonJS. Jest 30 загружает их через `require(esm)`; для этого нужны Node ≥ 24.9 и флаг `--experimental-vm-modules` (он уже в скриптах `test` и `test:e2e` пакета `api`).
- Время инжектируется (`ClockService`, параметр `now`) — тесты не зависят от текущей даты.
- Интеграционные тесты поднимают свой PostgreSQL в контейнере и применяют миграции; данные создаются фабриками (`test/factories`), не общим seed. Контейнер один на прогон (`test/db/global-setup.ts`: `prisma migrate deploy`, затем копия в шаблонную БД `lowisko_template`); тест-файл, которому нужна БД, создаёт свою копию шаблона через `createTestDatabase()` — файлы идут параллельно и не видят данных друг друга. Нужен запущенный Docker.
- Тест IDOR: для каждого маршрута `/orgs/:orgId/*` — запрос от админа другой организации → 403.
- Внешние сервисы (P24, Nominatim, SMTP) в тестах заменены фейками; реальный P24 sandbox проверяется вручную по чек-листу.

## Окружение

| Переменная | Пример / назначение |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production`; без значения — `production` (JSON-логи, без `pino-pretty`) |
| `API_PORT` | `3000` |
| `DATABASE_URL` | `postgresql://lowisko:lowisko@localhost:5432/lowisko` |
| `WEB_URL`, `API_URL` | `http://localhost:5173`, `http://localhost:3000` — только origin, без пути: `WEB_URL` сравнивается с заголовком `Origin` (CORS) |
| `JWT_ACCESS_SECRET` | случайная строка ≥ 32 байт |
| `QR_SIGNING_PRIVATE_KEY`, `QR_SIGNING_PUBLIC_KEY` | Ed25519 PEM (скрипт `pnpm --filter api keys:qr`) |
| `PAYMENTS_PROVIDER` | `fake` (dev, тесты) или `p24` |
| `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_BASE_URL` | sandbox: `https://sandbox.przelewy24.pl` |
| `SMTP_URL`, `MAIL_FROM` | `smtp://localhost:1025` (Mailpit) |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT` | По умолчанию `https://nominatim.openstreetmap.org`; публичный Nominatim требует идентифицирующий User-Agent (`lowisko/1.0 (email)`). Без `NOMINATIM_USER_AGENT` API стартует, но строки импорта без координат отклоняются |
| `UPLOADS_DIR` | `./uploads` |

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
3. `pnpm test` (unit)
4. `pnpm --filter api test:e2e` (Testcontainers)
5. `pnpm build`
6. Playwright E2E (на PR в `main`) — добавляется вместе с первыми сценариями (T-20)

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
- Seed (`prisma/seed.ts`): виды (~15) и общие правила; при `SEED_DEMO=true` — 2 демо-организации, подключённые водоёмы, типы разрешений, рыбаки с историей уловов, инспектор.
