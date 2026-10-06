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

- Время инжектируется (`ClockService`, параметр `now`) — тесты не зависят от текущей даты.
- Интеграционные тесты поднимают свой PostgreSQL в контейнере и применяют миграции; данные создаются фабриками (`test/factories`), не общим seed.
- Тест IDOR: для каждого маршрута `/orgs/:orgId/*` — запрос от админа другой организации → 403.
- Внешние сервисы (P24, Nominatim, SMTP) в тестах заменены фейками; реальный P24 sandbox проверяется вручную по чек-листу.

## Окружение

| Переменная | Пример / назначение |
| --- | --- |
| `DATABASE_URL` | `postgresql://lowisko:lowisko@localhost:5432/lowisko` |
| `WEB_URL`, `API_URL` | `http://localhost:5173`, `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | случайная строка ≥ 32 байт |
| `QR_SIGNING_PRIVATE_KEY`, `QR_SIGNING_PUBLIC_KEY` | Ed25519 PEM (скрипт `pnpm --filter api keys:qr`) |
| `PAYMENTS_PROVIDER` | `fake` (dev, тесты) или `p24` |
| `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_BASE_URL` | sandbox: `https://sandbox.przelewy24.pl` |
| `SMTP_URL`, `MAIL_FROM` | `smtp://localhost:1025` (Mailpit) |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT` | Публичный Nominatim требует идентифицирующий User-Agent |
| `UPLOADS_DIR` | `./uploads` |

`.env` не коммитится; `.env.example` — обязателен и актуален.

## Docker Compose

- `docker-compose.yml` (dev): `db` (postgres:16), `mailpit` (UI на :8025). API и web запускаются локально через `pnpm dev`.
- `docker-compose.prod.yml`: `caddy` (HTTPS, проксирует `/api` → api, остальное → статика web), `api`, `db`, том `uploads`.
- NFR-10: `docker compose -f docker-compose.prod.yml up` поднимает всё, включая миграции и seed демо-данных при `SEED_DEMO=true`.

## CI (GitHub Actions)

`ci.yml` на каждый push и PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` · `pnpm typecheck`
3. `pnpm test` (unit)
4. `pnpm --filter api test:e2e` (Testcontainers)
5. `pnpm build`
6. Playwright E2E (на PR в `main`)

`deploy.yml` — по тегу `v*`: сборка образов → GHCR → SSH на VPS → `docker compose pull && up -d`.

## Данные каталога

- CSV в `data/waters/*.csv`, формат:

```csv
source,sourceRef,name,type,region,externalOwnerName,externalInfoUrl,lat,lng,geocodeQuery
RZGW,WA-123,Zalew Zegrzyński,RESERVOIR,mazowieckie,RZGW Warszawa,https://...,,,"Zalew Zegrzyński, mazowieckie"
```

- Пустые `lat/lng` → геокодирование по `geocodeQuery` через Nominatim: не чаще 1 запроса в секунду, результат в `GeocodeCache`; неудачные строки попадают в отчёт импорта, а не роняют его.
- Первый регион — Mazowsze: списки łowisk RZGW Warszawa и Okręgu Mazowieckiego PZW (собираются вручную, ссылка на источник — в `externalInfoUrl`).
- Seed (`prisma/seed.ts`): виды (~15) и общие правила; при `SEED_DEMO=true` — 2 демо-организации, подключённые водоёмы, типы разрешений, рыбаки с историей уловов, инспектор.
