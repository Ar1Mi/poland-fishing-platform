---
paths:
  - "apps/api/prisma/**"
---

# База данных (Prisma)

- Источник правды о модели — `docs/04-data-model.md`. Меняешь схему — обнови документ в том же PR.
- Prisma 7.x (стабильная, версия зафиксирована): URL подключения — в `prisma.config.ts`, не в схеме; генератор `prisma-client` с `output`; клиент через `@prisma/adapter-pg`. Не используй RC-версии и синтаксис Prisma 5/6 из старых примеров.
- Миграции только через `pnpm --filter api exec prisma migrate dev --name <snake_case>`; никогда не правь применённую миграцию.
- CHECK-ограничения и частичные индексы: `migrate dev --create-only`, допиши SQL, затем примени. Список ограничений — в `docs/04-data-model.md`.
- UUID, `@db.Timestamptz(3)`, деньги в `Int` с суффиксом `Grosze`, даты без времени — `@db.Date`.
- Новый enum в Prisma — тот же enum в `packages/shared` (тест сверяет).
- Seed идемпотентен (upsert); демо-данные только при `SEED_DEMO=true`.
- Значения правил ловли в seed — с комментарием-ссылкой на источник (rozporządzenie / regulamin).
